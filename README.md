# Gmail Priority Filter

A personalized Gmail filter Chrome extension that automatically highlights your important emails using machine learning.

## Overview

This extension helps users surface the most important unread emails in Gmail. It leverages:
- Backend: Flask
- Machine Learning: Scikit-learn Multinomial Naive Bayes (MNB) with CountVectorizer
- Database: PostgreSQL to store user information and personalized models
- Deployment: Render

Each user gets a custom model based on their email behavior and labeling.

## How It Works

The extension predicts which unread emails are priority for each user individually. It uses features such as sender, email content, time of day sent, etc.

Workflow:
1. Submit 500 emails – creates the vocabulary for your personalized model.
2. Label read emails – mark which emails are priority.
3. Train MNB model – uses CountVectorizer and the selected features.
4. Predict priority emails – all unread emails marked as priority appear in a new Gmail label called “Priority”.

## Notes
-	This extension is not in the Chrome Web Store due to the high cost of a full security review.
- To use the extension, email me at [anishabhaskartorres@gmail.com](mailto:anishabhaskartorres@gmail.com) so the extension has access to your Gmail account.

## Getting Started (Local Setup)

If you want to run the extension locally:
1. Email me to request access
2. Clone the repo
3. Load Chrome extension in Developer Mode via chrome://extensions

## License

MIT License — see the LICENSE file for details.
