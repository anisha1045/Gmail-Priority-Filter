import numpy as np
from scipy.sparse import csr_matrix, hstack
from flask import Flask, jsonify, request
from preprocess import preprocess_data
from sklearn.naive_bayes import MultinomialNB
from dotenv import load_dotenv
import sys
import os
from openai import OpenAI
import joblib
import base64
import io

app = Flask(__name__)
load_dotenv()
NUM_BUCKETS = 15
MAX_VOCAB = 500
openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
cats = ["Multithreaded", "Spam", "Personal", "Social", "Promotional", "Updates", "Forums"]



app = Flask(__name__)

# Initialize Redis client
# r = redis.Redis(host='localhost', port=8080, db=0)

# set up receiving signal to save string 
# @app.route('/send-string', methods=['POST'])
# @app.route('/send-string/', methods=['POST'])
# def receive_string():
#     print("Request received")
#     print("Headers:", request.headers)
#     print("Data:", request.get_data())  # Raw request body
    
#     try:
#         data = request.json
#         print("Parsed JSON:", data)
#         input_string = data.get("string")
#         if not input_string:
#             return jsonify({"status": "error", "message": "Missing input_string in request"}), 400
        
#         # Store the input string in Redis using user_id as the key

#         return jsonify({"status": "success", "message": "String received and stored in Redis"})
#     except Exception as e:
#         print("Error:", e)
#         return jsonify({"status": "error", "message": str(e)}), 400

# set up receiving signal to start training: 
    
def train_model(model, data, labels, feature_probs = [], word_probs = []):

    print("Done preprocessing")
    with open("output.txt", "w") as f:
        sys.stdout = f  # Redirect print output to the file

        print("Data: ", data)
        print()
        print("Labels", labels)

        # Reset stdout back to default
        sys.stdout = sys.__stdout__
        
        # # combine all feature_probs for words and categories into one feature_prob
        if (model is None and feature_probs is not None and word_probs is not None):
            class_counts = np.array([95, 5], dtype=float)
            size_fc = csr_matrix(np.array([[1], [1]]))
            print("Word probs: ", word_probs)
            word_counts = csr_matrix(word_probs)
            print("Word counts: ", word_counts)
            date_fc =  csr_matrix(np.array([[1], [1]]))
            links_fc =  csr_matrix(np.array([[2], [2]]))
            sender_fc =  csr_matrix(np.ones((2, 15)))
            cat_fc = csr_matrix(feature_probs)
            feature_counts = hstack([size_fc, word_counts, date_fc, sender_fc, links_fc, cat_fc], dtype=float)
            data = feature_counts
            labels = np.array([0, 1])
            # seed the model
            model = MultinomialNB(alpha=0.01)

            # model.partial_fit(data, labels, classes=[0, 1])
            
            # model.feature_count_ = feature_counts
            # model.class_count_ = class_counts
            # print("Feature counts: ", feature_counts)
            # print("Class count: ", class_counts)
            # model.feature_count_ = feature_counts.toarray().astype(np.float64)  # convert sparse to dense
            # model.class_count_ = np.array(class_counts, dtype=np.float64)
            # model.classes_ = np.array([0, 1])

            # model._update_feature_log_prob(model.alpha)
            # model._update_class_log_prior()

        # train the model
        model.partial_fit(data, labels, classes=[0, 1])

        # test it on inbox
        # data = fetch_data(True)
        # print(model.predict(data))
        model_bytes = io.BytesIO()
        joblib.dump(model, model_bytes)
        model_bytes.seek(0) 

        print("Model Trained")
        return model_bytes