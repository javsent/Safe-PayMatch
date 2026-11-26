import urllib.request
import json
import subprocess
import os

p = subprocess.Popen(['git', 'credential', 'fill'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
stdout, _ = p.communicate(input='protocol=https\nhost=github.com\n\n')
token = ''
for line in stdout.splitlines():
    if line.startswith('password='):
        token = line.split('=', 1)[1]

if not token:
    print('No token found in git credential')
    exit(1)

headers = {
    'Authorization': f'Bearer {token}',
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Safe-PayMatch-Release-Script'
}

release_payload = {
    'tag_name': 'v1.4.2',
    'target_commitish': 'main',
    'name': 'Safe-PayMatch v1.4.2 - Saneamiento de Referencias y Auto-Detección 100%Banco',
    'body': """## Safe-PayMatch v1.4.2

### 🔢 Saneamiento de Referencias con Notación Científica
- Eliminación total de notación científica en referencias producidas por celdas numéricas de Excel (`5.13420261116075e+19`) y decimales artificiales (`.0`).
- Rescate inteligente de la referencia bancaria original (8 dígitos) desde la descripción contable (`Crédito Inmediato`, `Pago Móvil`, comisiones).
- Saneamiento automático en inicio (`database.py`) y migraciones para extractos ya cargados en la base de datos.

### 🏦 Auto-Detección Bancaria para Excel y CSV
- Clasificación automática y precisa de extractos de 100%Banco y Banco Exterior al importar en modo Auto sin asumir BNC ciegamente.
""",
    'draft': False,
    'prerelease': False
}

req = urllib.request.Request(
    'https://api.github.com/repos/javsent/Safe-PayMatch/releases',
    data=json.dumps(release_payload).encode('utf-8'),
    headers=headers,
    method='POST'
)

try:
    with urllib.request.urlopen(req) as resp:
        release_data = json.loads(resp.read().decode())
        upload_url = release_data['upload_url'].split('{')[0]
        print(f"Release created: {release_data['html_url']}")
except Exception as e:
    print("Failed to create release (may already exist):", e)
    req_get = urllib.request.Request('https://api.github.com/repos/javsent/Safe-PayMatch/releases/tags/v1.4.2', headers=headers)
    with urllib.request.urlopen(req_get) as resp:
        release_data = json.loads(resp.read().decode())
        upload_url = release_data['upload_url'].split('{')[0]
        print(f"Using existing release: {release_data['html_url']}")

asset_path = r'C:\Users\jpina\Documents\rybak.Software\Safe-PayMatch\installer_output\Safe-PayMatch-Setup-v1.4.2.exe'
asset_name = 'Safe-PayMatch-Setup-v1.4.2.exe'
asset_size = os.path.getsize(asset_path)
print(f"Uploading {asset_name} ({asset_size} bytes)...")

with open(asset_path, 'rb') as f:
    asset_bytes = f.read()

upload_headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/octet-stream',
    'User-Agent': 'Safe-PayMatch-Release-Script',
    'Content-Length': str(asset_size)
}

upload_req = urllib.request.Request(
    f"{upload_url}?name={asset_name}",
    data=asset_bytes,
    headers=upload_headers,
    method='POST'
)

with urllib.request.urlopen(upload_req) as resp:
    res = json.loads(resp.read().decode())
    print(f"Asset uploaded successfully: {res.get('browser_download_url')}")
