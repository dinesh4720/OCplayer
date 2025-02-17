from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__, static_folder='../frontend')
CORS(app)

# Import backend routes first
from backend import app as backend_app

# Add route to serve frontend files
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path.startswith('api/'):
        return {'error': 'Not found'}, 404
    if not path:
        return send_from_directory(app.static_folder, 'index.html')
    try:
        return send_from_directory(app.static_folder, path)
    except:
        return send_from_directory(app.static_folder, 'index.html')

# Health check endpoint
@app.route('/api/health')
def health_check():
    return jsonify({"status": "ok"})

# Import backend routes
for rule in backend_app.url_map.iter_rules():
    if rule.rule != '/':  # Avoid duplicate root route
        # Copy the endpoint function
        endpoint_func = backend_app.view_functions[rule.endpoint]
        
        # Register the route with /api prefix
        app.route(f'/api{rule.rule}', methods=rule.methods)(endpoint_func)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True) 