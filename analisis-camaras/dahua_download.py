"""
Descarga grabaciones de un DVR/NVR Dahua (o clones con el mismo firmware:
XM, TVT, Amcrest viejos, Lorex, etc.) por rango de fecha/hora, usando el
CGI HTTP del propio equipo. No hace falta instalar SmartPSS.

Requisitos:
    pip install requests

Uso:
    1. Completá las variables de configuración más abajo (IP, usuario,
       contraseña, canal, fechas).
    2. Corré: python dahua_download.py
    3. Los archivos .dav quedan en la carpeta OUTPUT_DIR.

Notas:
- "Canal" es el número de cámara tal como aparece en el DVR (1, 2, 3...).
  En la API Dahua se numera desde 0, así que canal 1 en pantalla = 0 acá.
- Si el DVR no responde en el puerto 80, revisá el puerto HTTP configurado
  en Red > Puerto dentro del menú del DVR.
- Los archivos .dav se pueden reproducir con VLC. Si tu pipeline de
  análisis necesita .mp4, convertilos con ffmpeg:
      ffmpeg -i archivo.dav -c copy archivo.mp4
"""

import os
import requests
from requests.auth import HTTPDigestAuth
from datetime import datetime

# ───────────────────── CONFIGURACIÓN ─────────────────────
DVR_IP = "192.168.1.108"      # IP del DVR
DVR_PORT = 80                 # puerto HTTP del DVR (revisar en Red > Puerto)
USERNAME = "admin"
PASSWORD = "TU_CONTRASEÑA"

CHANNEL = 0                   # cámara 1 en pantalla = canal 0 acá (cámara 2 = 1, etc.)
START_TIME = "2026-08-25 00:00:00"
END_TIME   = "2026-08-25 23:59:59"

OUTPUT_DIR = "descargas_dvr"
# ───────────────────────────────────────────────────────────

BASE = f"http://{DVR_IP}:{DVR_PORT}"
auth = HTTPDigestAuth(USERNAME, PASSWORD)
session = requests.Session()


def cgi(params):
    r = session.get(f"{BASE}/cgi-bin/mediaFileFind.cgi", params=params, auth=auth, timeout=15)
    r.raise_for_status()
    return r.text


def parse_kv(text):
    """Convierte la respuesta 'clave=valor' línea a línea del CGI Dahua en dict."""
    out = {}
    for line in text.strip().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def find_files():
    # 1. crear el objeto de búsqueda
    resp = parse_kv(cgi({"action": "factory.create"}))
    object_id = resp.get("result")
    if not object_id:
        raise RuntimeError(f"No se pudo crear el objeto de búsqueda: {resp}")

    # 2. iniciar búsqueda con condición de canal/fecha
    cgi({
        "action": "findFile",
        "object": object_id,
        "condition.Channel": CHANNEL,
        "condition.StartTime": START_TIME,
        "condition.EndTime": END_TIME,
        "condition.Types[0]": "dav",
    })

    # 3. traer resultados en tandas
    files = []
    while True:
        resp = cgi({"action": "findNextFile", "object": object_id, "count": 100})
        kv = parse_kv(resp)
        found = int(kv.get("found", 0))
        if found == 0:
            break
        for i in range(found):
            path_key = f"items[{i}].FilePath"
            for line in resp.strip().splitlines():
                if line.startswith(path_key):
                    files.append(line.split("=", 1)[1].strip())
        if found < 100:
            break

    # 4. cerrar y destruir el objeto
    cgi({"action": "close", "object": object_id})
    cgi({"action": "destroy", "object": object_id})
    return files


def download_file(remote_path):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filename = os.path.basename(remote_path)
    local_path = os.path.join(OUTPUT_DIR, filename)
    if os.path.exists(local_path):
        print(f"  ya existe, salteo: {filename}")
        return

    url = f"{BASE}/cgi-bin/RPC_Loadfile{remote_path}"
    with session.get(url, auth=auth, stream=True, timeout=60) as r:
        r.raise_for_status()
        total = int(r.headers.get("Content-Length", 0))
        written = 0
        with open(local_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
                written += len(chunk)
        size_mb = written / (1024 * 1024)
        print(f"  descargado: {filename} ({size_mb:.1f} MB)")


def main():
    print(f"Buscando grabaciones canal {CHANNEL} entre {START_TIME} y {END_TIME}...")
    files = find_files()
    if not files:
        print("No se encontraron archivos en ese rango. Revisá canal/fechas/permisos.")
        return
    print(f"Encontrados {len(files)} archivo(s). Descargando a '{OUTPUT_DIR}/'...")
    for path in files:
        download_file(path)
    print("Listo.")


if __name__ == "__main__":
    main()
