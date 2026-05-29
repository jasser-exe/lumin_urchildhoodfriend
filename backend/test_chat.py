import requests

url = 'http://127.0.0.1:8000/api/chat'
payload = {
    'message': 'Hello',
    'child_name': 'Tester',
    'mode': 'normal',
    'memory_context': '',
    'language': 'en'
}

r = requests.post(url, json=payload, timeout=10)
print('status', r.status_code)
print(r.text)
