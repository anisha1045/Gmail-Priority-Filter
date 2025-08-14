from flask import Flask, jsonify, request
import re
import ast
import json
import numpy as np
from db import get_vocab
from sklearn.naive_bayes import MultinomialNB
from scipy.sparse import csr_matrix, hstack
from datetime import datetime
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.feature_extraction import FeatureHasher
from sklearn.model_selection import train_test_split
import joblib
import os
from db import get_vocab, save_vocab
app = Flask(__name__)

max_vocab = 500
num_gen_words = 50
cats = ["Multithreaded", "Spam", "Personal", "Social", "Promotional", "Updates", "Forums"]

# retrieve feature_probs and words arrays from generated string
def preprocess_gen_data(feature_probs, words):

    feature_probs = [feature_probs.get(key) for key in cats]
    probs_given_priority = np.array(feature_probs)
    probs_given_non_priority = 1 - probs_given_priority
    feature_probs = np.vstack([probs_given_non_priority, probs_given_priority])

    return feature_probs, words

# robust scales the size, adds 1 feature to the resulting matrix
def scale_size(data):
    # Scale data using robust scaling (based on IQR).
    size_in_kb = np.round(data / 1024)

    # Bucket into 25KB units
    bucketed = (size_in_kb // 25).astype(int)
    clipped = np.clip(bucketed, 0, 50)
    return csr_matrix(clipped.reshape(-1, 1))

def bin_links(data):
    binned = data // 5
    clipped = np.clip(binned, 0, 20)
    return csr_matrix(clipped.reshape(-1, 1))

# normalizes the date by time of day sent, adds 1 feature to resulting vector
def normalize_date(date_array):
    """Normalize internal dates as seconds since midnight divided by 86400."""
    timestamps = (date_array.astype(int) / 1000).astype(int)  # Convert to seconds
    hours = (timestamps // 3600) % 24
    minutes = (timestamps % 3600) // 60
    seconds = timestamps % 60
    total_seconds = hours * 3600 + minutes * 60 + seconds
    normalized_dates = total_seconds // 7200
    return csr_matrix(normalized_dates[:, np.newaxis])

# vectorizes text with count vectorizer, adds max_words features to resulting vector
def vectorize_text(text_array, vocab, train, gen_words=None, max_vocab=500):
    print("IN VECTORIZE TEXT")

    if gen_words is None:
        gen_words = []

    final_vocab_list = vocab + [w for w in gen_words if w not in vocab]
    vocab = final_vocab_list
    print("FInal vocab list", vocab)
    final_vocab = {word: i for i, word in enumerate(final_vocab_list)}

    # set feature probs
    vocab_size = len(final_vocab)
    feature_prob_ = np.full((2, vocab_size), 1)
    for word in gen_words:
        feature_prob_[1, final_vocab[word]] = 3

    # initialize vectorizer with fixed vocab
    cvect = CountVectorizer(vocabulary=final_vocab)
    vector = cvect.transform(text_array)
    print("Nonzero entries in vector:", vector.nnz)
    return csr_matrix(vector), feature_prob_, vocab


# feature hashes the sender, contributes 15 to the resulting vector
def hash_sender(senders, num_buckets=15):
    """Feature hashing for senders."""
    hasher = FeatureHasher(n_features=num_buckets, input_type='string')
    senders = [[sender] for sender in senders]
    sender_vector = hasher.transform(senders)
    return csr_matrix(np.abs(sender_vector).astype(int))

def preprocess_data(data, uiud, gen_words = []):
    # text data
    senders = np.array([row['sender'] for row in data])
    # print("Senders: ", senders)
    texts = np.array([f"{row['subject']} {row['content']}" for row in data])
    # print("Subject and Content: ", combined_text)

    # binary data
    keys = ['multiThread', 'spam', 'personal', 'social', 'promotional', 'updates', 'forums']
    cats = np.array([[record[key] for key in keys] for record in data])
    # print(categories)

    # numerical data
    sizes = np.array([row['sizeEstimate'] for row in data])
    # print("Size Estimates: ", size_estimates)
    times = np.array([row['internalDate'] for row in data])
    # print("Internal Dates: ", internal_dates)

    # number of links
    num_links = np.array([row['numLinks'] for row in data])

    # labels
    labels = np.array([row['priority'] for row in data])
    # print("Labels: ", labels)
    
    # scale size_estimate
    size_vector = scale_size(sizes)

    # scale num_links
    links_vector = bin_links(num_links)

    # Vectorize subject and content combined
    vocab = get_vocab(uiud)
    text_vector, feature_prob_, new_vocab = vectorize_text(texts, vocab, True, gen_words)
    if (gen_words != []):
        save_vocab(uiud, new_vocab)

    # Normalize internal date
    date_vector = normalize_date(times)

    # Hash senders
    sender_vector = hash_sender(senders)

    # Convert categorical np arrays into csr matrices
    cats = csr_matrix(cats)

    # contribute 8 features to resulting matrix
    data = hstack([size_vector, text_vector, date_vector, sender_vector, links_vector, cats])

    return feature_prob_, data, labels