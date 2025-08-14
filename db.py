
from cryptography.fernet import Fernet
import base64
import os
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from sqlalchemy.dialects.postgresql import ARRAY
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import LargeBinary
import json
import io
import joblib
from dotenv import load_dotenv
import os

load_dotenv()

class TokenCrypto:
    def __init__(self, password: str):
        """Initialize with your secret password (keep this constant)"""
        self.password = password.encode()
        self.iterations = 480000  # NIST-recommended minimum as of 2023

    def _generate_key(self, salt: bytes) -> bytes:
        """Derive encryption key from password+salt"""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=self.iterations,
        )
        return base64.urlsafe_b64encode(kdf.derive(self.password))
    
    def encrypt_token(self, token: str, salt: bytes) -> str:
        """Returns encrypted token as string (includes salt)"""
        key = self._generate_key(salt)
        f = Fernet(key)
        encrypted = f.encrypt(token.encode())
        # Combine salt + ciphertext for storage
        return base64.b64encode(salt + encrypted).decode()
    
    def decrypt_token(self, encrypted_data: str, salt: bytes) -> str:
        """Decrypts token from combined salt+ciphertext string"""
        data = base64.b64decode(encrypted_data.encode())
        salt, encrypted = data[:16], data[16:]
        key = self._generate_key(salt)
        f = Fernet(key)
        return f.decrypt(encrypted).decode()
    
    @staticmethod
    def generate_salt():
        return os.urandom(16)
    
    @staticmethod
    def bytes_to_string(salt):
        return base64.b64encode(salt).decode()
    
    @staticmethod
    def string_to_bytes(salt_string):
        return base64.b64decode(salt_string.encode())
    
crypto = TokenCrypto(password=os.environ["CRYPTO_SECRET"])

db = SQLAlchemy()

# Database model
class AuthToken(db.Model):
    __tablename__ = 'auth_tokens'
    id = db.Column(db.Integer, primary_key=True)
    userID = db.Column(db.String, unique=True, nullable=False)
    tokens = db.Column(db.Text)
    salt = db.Column(db.String, unique=True)
    vocab = db.Column(ARRAY(db.Text))
    model_data = db.Column(LargeBinary)

    def __repr__(self):
        return f'<AuthToken {self.userID}>'
    
    # Save tokens
def save_tokens(user_id, tokens):
    print("in save tokens")
    user_str = str(user_id)
    token_str = json.dumps(tokens)
    
    print("User id: ", user_str)
    print("Tokens: ", token_str)

    entry = AuthToken.query.filter_by(userID=user_str).first()
    
    if entry:
        salt = base64.b64decode(entry.salt.encode())
    else:
        salt = crypto.generate_salt()

    encrypted_token = crypto.encrypt_token(token_str, salt)
    print("Encrypted token: ", encrypted_token)

    if entry:
        entry.tokens = encrypted_token
    else:
        entry = AuthToken(
            userID=user_str,
            tokens=encrypted_token,
            salt=crypto.bytes_to_string(salt)
        )
        db.session.add(entry)

    db.session.commit()

def save_model(user_id, model_bytes):
    print("in save model")
    user_str = str(user_id)

    # Ensure model_bytes is in bytes format (not BytesIO)
    if isinstance(model_bytes, io.BytesIO):
        model_bytes = model_bytes.getvalue()  # Extract bytes from BytesIO

    token = AuthToken.query.filter_by(userID=user_str).first()
    if token:
        token.model_data = model_bytes  # Store raw bytes
    else:
        token = AuthToken(userID=user_id, model_data=model_bytes)
        db.session.add(token)
    
    db.session.commit()

def save_vocab(user_id, vocab):
    print("in save vocab")
    user_str = str(user_id)

    token = AuthToken.query.filter_by(userID=user_str).first()
    if token:
        token.vocab = vocab 
    else:
        token = AuthToken(userID=user_id, vocab=vocab)
        db.session.add(token)
    
    db.session.commit()

def get_tokens_from_db(user_id):
    print("Getting tokens")
    entry = AuthToken.query.filter_by(userID=user_id).first()
    print("Entry: ", entry)
    if (entry):
        salt = crypto.string_to_bytes(entry.salt)
        print("Encrypted token: ", entry.tokens)
        decrypted = crypto.decrypt_token(entry.tokens, salt)
        print("Decrypted token: ", decrypted)
        return json.loads(decrypted)
    return None

def get_model(user_id):
    token = AuthToken.query.filter_by(userID=str(user_id)).first()
    if token and token.model_data:
        model_bytes = io.BytesIO(token.model_data)
        model = joblib.load(model_bytes)
        return model
    return None

def get_vocab(user_id):
    entry = AuthToken.query.filter_by(userID=str(user_id)).first()
    if entry and entry.vocab:
        return entry.vocab
    return None

def delete_user_entry(user_id):
    token = AuthToken.query.filter_by(userID=user_id).first()
    if token:
        db.session.delete(token)
        db.session.commit()
        print(f"Deleted entry for userID: {user_id}")
    else:
        print(f"No entry found for userID: {user_id}")