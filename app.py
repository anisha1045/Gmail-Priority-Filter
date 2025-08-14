from flask import Flask, request, redirect, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from cryptography.fernet import Fernet
from train import train_model
from preprocess import preprocess_gen_data, preprocess_data
from google_auth_oauthlib.flow import Flow
import json
import os
import numpy as np
import requests
from dotenv import load_dotenv
from cryptography.fernet import Fernet
from db import save_tokens, get_tokens_from_db, db, save_model, get_model, delete_user_entry, save_vocab, get_vocab
import base64
import secrets
import hashlib
import time
import redis
import certifi

# Load your key securely — don't hardcode in real apps
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
cipher = Fernet(ENCRYPTION_KEY.encode())

# PostgreSQL DB URL: replace with your actual credential
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://users_db_ezeu_user:PX00VOnRediN6MPf7NzuZuMglyM3L5L3@dpg-d1vf5cmmcj7s73fautf0-a.oregon-postgres.render.com/users_db_ezeu'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

r = redis.Redis(
    host=os.getenv("REDIS_HOST"),
    port=int(os.getenv("REDIS_PORT")),
    password=os.getenv("REDIS_PASSWORD"),
    ssl=True,
    ssl_ca_certs=certifi.where()
)
CORS(app)

db.init_app(app)

with app.app_context():
    db.create_all()

load_dotenv()


# Get tokens
@app.route('/get_tokens/<user_id>', methods=['GET'])
def get_tokens(user_id):
    print("Getting tokens")
    tokens = get_tokens_from_db(user_id)
    print("Receved token from db: ", tokens)
    if (tokens):
        print("Expiry: ", tokens['expiry'])
    print(time.time())
    if tokens and time.time() > tokens['expiry']:
        print("ACCESS TOKEN IS EXPIRED")
        
        client_id = os.environ.get("CLIENT_ID")
        client_secret = os.environ.get("CLIENT_SECRET")

        # Replace this with the user's refresh token
        refresh_token = tokens['refresh_token']

        # Request new access token
        response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                'client_id': client_id,
                'client_secret': client_secret,
                'refresh_token': refresh_token,
                'grant_type': 'refresh_token',
            }
        )

        if response.status_code != 200:
            raise Exception(f"Token refresh failed: {response.reason}")

        token_response = response.json()
        print("Token response: ", token_response)
        tokens['access_token'] = token_response['access_token']
        tokens['expiry'] = time.time() + token_response['expires_in']
        save_tokens(user_id, tokens)
    if tokens:
        return jsonify({'tokens': tokens})
    else:
        return jsonify({'tokens': None}), 404
    
def generate_code_verifier():
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b'=').decode('utf-8')

def generate_code_challenge(code_verifier):
    digest = hashlib.sha256(code_verifier.encode('utf-8')).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode('utf-8')

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
]

@app.route('/auth')
def auth():
    print("IN auth")
    try:
        # Load credentials from file

        client_id = os.getenv("CLIENT_ID")
        client_secret = os.getenv("CLIENT_SECRET")
        redirect_uri = os.getenv("REDIRECT_URI")

        client_config = {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "redirect_uris": [redirect_uri],
                "javascript_origins": ["http://localhost:8080", 
                                       "https://email-priority-filter-backend.onrender.com"]
            }
        }
        print("SCOPES: ", SCOPES)
        flow = Flow.from_client_config(
            client_config,
            scopes=SCOPES,
            redirect_uri=redirect_uri
        )

        code_verifier = generate_code_verifier()
        code_challenge = generate_code_challenge(code_verifier)

        # Save code_verifier temporarily (e.g., in Redis or in-memory dict keyed by state)
        # For demo, assume we have a global dict (you should replace this!)
        r.set('state', code_verifier)
        flow.code_verifier = code_verifier
        
        # Generate authorization URL
        state = request.args.get('state')
        auth_url, _ = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent',
            state=state,
            code_challenge=code_challenge,
            code_challenge_method='S256',
        )
        
        return redirect(auth_url)
    except IOError as e:
        print(f'Error loading client secret file: {e}')
        return jsonify({'message': 'Error loading credentials'}), 500
    except Exception as e:
        print(f'Unexpected error: {e}')
        return jsonify({'message': 'An unexpected error occurred'}), 500

@app.route('/oauth2callback')
def oauth2callback():
    print("In oauth2callback route")
    try:
        code = request.args.get('code')
        state = request.args.get('state')

        if not code:
            return "No code received", 400
        
        code_verifier = r.get('state')
        print("GOT FROM REDIS")
        print("Code Verifier: ", code_verifier)
        if not code_verifier:
            return "Invalid or expired state", 400
        
        creds = {
            "client_id": os.getenv("CLIENT_ID"),
            "client_secret": os.getenv("CLIENT_SECRET"),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "redirect_uris": [os.getenv("REDIRECT_URI")],
            "javascript_origins": ["http://localhost:8080"]  # or update if deployed
        }

        flow = Flow.from_client_config(
            {"web": creds},
            scopes=SCOPES,
            redirect_uri=creds["redirect_uris"][0]
        )
        

        flow.code_verifier = code_verifier
        flow.fetch_token(code=code)

        credentials = flow.credentials
        tokens = {
            'access_token': credentials.token,
            'refresh_token': credentials.refresh_token,
            'expiry': credentials.expiry.timestamp(),
        }

        print("userID:", state)
        print("Tokens:", tokens)

        # Replace this with your actual DB save function
        save_tokens(state, tokens)
        # return "Tokens saved successfully"
        return redirect(f'https://bpeapcdcbodkjbmpgdolkfkgahfafeja.chromiumapp.org/oauth2?success=true')

    except Exception as e:
        print("Error handling credentials:", e)
        return jsonify({'message': 'Error handling credentials'}), 500
    

@app.route('/save_user_vocab', methods=['POST'])
def save_user_vocab():
    print("in save user vocab")
    data = request.get_json()
    uiud = data.get('uiud')
    vocab = data.get('vocab')
    save_vocab(uiud, vocab)
    print("VOCAB SAVED: ", vocab)
    return jsonify({"success": True, "message": "Training started"}), 200


@app.route('/start_train', methods=['POST'])
def start_train():
    print("Got to start train")
    data = request.get_json()
    uiud = data.get('uiud')
    preferences = data.get('preferences')
    data = data.get('emails')

    vocab = get_vocab(uiud)
    print("VOCAB ", vocab)


    feature_probs, words = get_gen_data(preferences)
    # # feature probs are the probability of categories
    feature_probs, words = preprocess_gen_data(feature_probs, words)
    print("Finished preprocessing gen data")

    # # Fetch and preprocess emails from database 
    # # word probs are the probability of words
    print("Data: ", data)
    word_probs, data, labels = preprocess_data(data, uiud, words)
    model = train_model(None, data, labels, feature_probs, word_probs)
    save_model(uiud, model)
    return jsonify({"success": True, "message": "Training started"}), 200


@app.route('/train_iter', methods=['POST'])
def train_iter():
    print("Got to train iter")
    data = request.get_json()
    uiud = data.get('uiud')
    data = data.get('emails')

    # Fetch and preprocess emails from database 
    # word probs are the probability of words
    # print("Data: ", data)
    vocab = get_vocab(uiud)
    print("VOCAB ", vocab)
    word_probs, data, labels = preprocess_data(data, uiud)
    model = get_model(uiud)
    model_bytes = train_model(model, data, labels)
    save_model(uiud, model_bytes)
    return jsonify({"success": True, "message": "Training started"}), 200

@app.route('/request_model', methods=['GET'])
def request_model():
    print("Got to request model")
    data = request.get_json()
    uiud = data.get('uiud')
    model = get_model(uiud)
    return jsonify({
        "success": True,
        "model": model
    }), 200


@app.route('/predict_priority', methods=['POST'])
def predict_priority():
    data = request.get_json()
    uiud = data.get('uiud')
    data = data.get('emails')

    # Fetch and preprocess emails from database 
    # word probs are the probability of words
    print("IN pred priority")
    # print("Data: ", data)
    print("IN pred priority")
    email_ids = np.array([row['id'] for row in data])
    keys = ['multiThread', 'spam', 'personal', 'social', 'promotional', 'updates', 'forums']
    for record in data:
        for key in keys:
            if key not in record:
                print(f"Missing key: {key} in record: {record}")


    word_probs, data, labels = preprocess_data(data, uiud)
    model = get_model(uiud)
    print("MODEL: ", model)
    predictions = model.predict(data)
    print("Predictions: ", predictions)

    return jsonify({
        "success": True,
        "predictions": predictions.tolist()
    }), 200



def get_gen_data(preferences):
    user_prompt = f"""Provide the following in two lines of Python based on emails that {preferences}:
    An array of feature probabilities for the following categories: Multithreaded, Spam, Personal, Social, Promotional, Updates, Forums titled 'feature_probs'.
    An array of 50 common email words titled 'words'."""
    
    feature_probs = {
    "Multithreaded": 0.15,
    "Spam": 0.25,
    "Personal": 0.20,
    "Social": 0.10,
    "Promotional": 0.10,
    "Updates": 0.10,
    "Forums": 0.10
    }

    words = [
        "expires", "taxes", "fees", "apply", "exclusions", "valid", "only", "participating",
        "restaurants", "qualifying", "order", "delivery", "scheduled", "expiration", "offer",
        "terms", "change", "cancellation", "availability", "check", "help", "center", "unsubscribe",
        "privacy", "email", "preferences", "images", "text", "promotional", "uber", "technologies",
        "san", "francisco", "usa", "combined", "orders", "placed", "time", "subject", "created",
        "edited", "ai", "available", "location", "deal", "limited", "today", "exclusive", "promo"
    ]
    return feature_probs, words


@app.route('/delete_data', methods=['POST'])
def delete_data():
    print("In delete data")
    data = request.get_json()
    uiud = str(data.get('uiud'))
    print("TOKENS FROM DB: ", get_tokens_from_db(uiud))
    delete_user_entry(uiud)
    print("TOKENS FROM DB: ", get_tokens_from_db(uiud))

    vectorizer_file = 'vectorizer.pkl'

    if os.path.exists(vectorizer_file):
        os.remove(vectorizer_file)
        print("vectorizer.pkl deleted.")
    else:
        print("vectorizer.pkl does not exist.")

    return jsonify({
        "success": True,
    }), 200

if __name__ == '__main__':
    app.run(debug=True, port=8080)