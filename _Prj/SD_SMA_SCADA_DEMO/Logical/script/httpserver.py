#!/usr/bin/env python3
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Fix CORS issue

# Data storage
data_store = []


@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        data = request.get_json()
        print(f"Received POST data: {data}")
        return jsonify({"status": "success", "data": data}), 200
    return "Flask Server Running"


# Postman push data (POST) / Frontend get data (GET)
@app.route('/data', methods=['GET', 'POST'])
def api_data():
    global data_store

    if request.method == 'POST':
        data = request.get_json()
        if data:
            if isinstance(data, list):
                data_store = data
            else:
                data_store.append(data)
            print(f"Received: {data}")
            return jsonify({"status": "success", "count": len(data_store)}), 200
        return jsonify({"status": "error"}), 400

    # GET - Frontend fetches data
    return jsonify(data_store), 200


if __name__ == '__main__':
    print("=" * 50)
    print("Flask Server Started")
    print("=" * 50)
    print("POST (Postman):  http://127.0.0.1:8000/api/data")
    print("GET  (Frontend): http://127.0.0.1:8000/api/data")
    print("=" * 50)
    app.run(host='0.0.0.0', port=8000, debug=True)