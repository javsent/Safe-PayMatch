"""
updater.py - Sistema de detección, descarga y aplicación de actualizaciones desde GitHub Releases
"""

import os
import re
import sys
import json
import time
import logging
import tempfile
import threading
import subprocess
import urllib.request
import urllib.error

from server.version import __version__, __github_repo__, __app_name__

logger = logging.getLogger("updater")

# Estado global de descarga
download_state = {
    "status": "idle",  # "idle" | "downloading" | "ready" | "error"
    "percent": 0,
    "downloaded_bytes": 0,
    "total_bytes": 0,
    "installer_path": None,
    "version": None,
    "error": None,
}
_lock = threading.Lock()

def parse_semver(ver_str: str) -> tuple:
    """Convierte un string tipo 'v1.1.0' o '1.1.0-alpha' a tupla numérica (1, 1, 0)."""
    if not ver_str:
        return (0, 0, 0)
    # Extraer dígitos
    clean = re.sub(r'^[^\d]*', '', ver_str.strip())
    parts = clean.split('.')
    nums = []
    for p in parts[:3]:
        m = re.match(r'\d+', p)
        nums.append(int(m.group(0)) if m else 0)
    while len(nums) < 3:
        nums.append(0)
    return tuple(nums)

def is_newer_version(latest_str: str, current_str: str) -> bool:
    """Retorna True si latest_str es estrictamente mayor que current_str."""
    return parse_semver(latest_str) > parse_semver(current_str)

def check_for_updates() -> dict:
    """
    Consulta la API de GitHub Releases para determinar si existe una versión más reciente.
    """
    api_url = f"https://api.github.com/repos/{__github_repo__}/releases/latest"
    req = urllib.request.Request(
        api_url,
        headers={
            "User-Agent": f"{__app_name__}-Updater/{__version__}",
            "Accept": "application/vnd.github.v3+json",
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                tag_name = data.get("tag_name", "").lstrip("v")
                has_update = is_newer_version(tag_name, __version__)

                # Buscar asset .exe
                assets = data.get("assets", [])
                exe_asset = None
                for a in assets:
                    name = a.get("name", "")
                    if name.lower().endswith(".exe"):
                        exe_asset = a
                        break

                download_url = exe_asset.get("browser_download_url") if exe_asset else None
                asset_size = exe_asset.get("size", 0) if exe_asset else 0
                asset_name = exe_asset.get("name", "") if exe_asset else ""

                return {
                    "has_update": bool(has_update and download_url),
                    "current_version": __version__,
                    "latest_version": tag_name,
                    "release_name": data.get("name") or f"Versión {tag_name}",
                    "release_notes": data.get("body") or "Mejoras de rendimiento y correcciones.",
                    "published_at": data.get("published_at", ""),
                    "download_url": download_url,
                    "asset_name": asset_name,
                    "asset_size": asset_size,
                    "html_url": data.get("html_url", f"https://github.com/{__github_repo__}/releases"),
                }
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # Todavía no hay releases publicados en el repositorio
            return {
                "has_update": False,
                "current_version": __version__,
                "latest_version": __version__,
                "message": "No se encontraron releases publicados en GitHub aún.",
            }
        logger.warning(f"Error HTTP al consultar releases: {e}")
        return {
            "has_update": False,
            "current_version": __version__,
            "error": f"Error del servidor de GitHub ({e.code})",
        }
    except Exception as e:
        logger.warning(f"Error al verificar actualizaciones: {e}")
        return {
            "has_update": False,
            "current_version": __version__,
            "error": str(e),
        }

def _download_worker(url: str, version: str):
    global download_state
    temp_dir = tempfile.gettempdir()
    dest_path = os.path.join(temp_dir, f"Safe-PayMatch-Setup-v{version}.exe")

    logger.info(f"Iniciando descarga de actualización desde {url} hacia {dest_path}")
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": f"{__app_name__}-Updater/{__version__}"}
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            total_size = int(response.headers.get("content-length", 0))
            downloaded = 0
            block_size = 64 * 1024  # 64 KB

            with open(dest_path, "wb") as f:
                while True:
                    chunk = response.read(block_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    percent = int((downloaded / total_size) * 100) if total_size > 0 else 50
                    with _lock:
                        download_state["downloaded_bytes"] = downloaded
                        download_state["total_bytes"] = total_size
                        download_state["percent"] = percent

            with _lock:
                download_state["status"] = "ready"
                download_state["percent"] = 100
                download_state["installer_path"] = dest_path
                download_state["version"] = version
                download_state["error"] = None
            logger.info("Descarga de instalador completada exitosamente.")

    except Exception as e:
        logger.error(f"Error descargando instalador: {e}")
        with _lock:
            download_state["status"] = "error"
            download_state["error"] = str(e)

def start_download_update(url: str, version: str) -> dict:
    """Inicia la descarga del instalador en segundo plano."""
    global download_state
    with _lock:
        if download_state["status"] == "downloading":
            return {"ok": True, "message": "Descarga ya en progreso"}

        download_state = {
            "status": "downloading",
            "percent": 0,
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "installer_path": None,
            "version": version,
            "error": None,
        }

    thread = threading.Thread(target=_download_worker, args=(url, version), daemon=True)
    thread.start()
    return {"ok": True, "message": "Descarga iniciada"}

def get_download_status() -> dict:
    """Retorna el estado de la descarga."""
    with _lock:
        return dict(download_state)

def apply_update_and_restart() -> dict:
    """
    Ejecuta el instalador descargado y cierra la aplicación para permitir el reemplazo de archivos.
    """
    with _lock:
        installer_path = download_state.get("installer_path")
        status = download_state.get("status")

    if status != "ready" or not installer_path or not os.path.exists(installer_path):
        return {"ok": False, "error": "No hay ningún instalador listo para aplicar."}

    logger.info(f"Aplicando actualización ejecutando instalador: {installer_path}")

    # En Windows, programamos el arranque del instalador con 1.5s de delay para que
    # la app actual tenga tiempo de cerrarse y liberar todos los locks de archivos.
    if sys.platform == "win32":
        # Usamos cmd /c start con delay
        cmd = f'cmd.exe /c timeout /t 2 /nobreak >nul & start "" "{installer_path}"'
        subprocess.Popen(cmd, shell=True)
    else:
        subprocess.Popen([installer_path])

    # Detener la app en 0.8s
    def _exit():
        time.sleep(0.8)
        logger.info("Cerrando proceso Safe-PayMatch para instalación de actualización...")
        os._exit(0)

    threading.Thread(target=_exit, daemon=True).start()
    return {"ok": True, "message": "Instalador iniciado. Safe-PayMatch se cerrará para completar la actualización."}
