import os
import re

emoji_map = {
    "Seed": "Seed",
    "Sapling": "Sapling",
    "Green Hero": "Green Hero",
    "Planet Protector": "Planet Protector",
    "Circular Champion": "Circular Champion",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
    "": "",
}

def clean_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    orig = content
    for old, new in emoji_map.items():
        content = content.replace(old, new)
        
    if orig != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {path}")

for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or '__pycache__' in root or 'dist' in root:
        continue
    for f in files:
        if f.endswith(('.js', '.jsx', '.py', '.json', '.html', '.css', '.md')):
            clean_file(os.path.join(root, f))
