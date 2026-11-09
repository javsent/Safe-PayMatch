"""
desktop.py - Lanzador nativo de escritorio para Safe-PayMatch
Empaqueta FastAPI + WebView2 (Edge Chromium) en una ventana de escritorio independiente.
Cero navegadores abiertos manualmente, cierre limpio y datos persistentes.
"""

import sys
import os

# Desactivar extensiones opcionales de IA/layout que causan conflictos en entornos empaquetados
sys.modules["pymupdf.layout"] = None
sys.modules["pymupdf_layout"] = None

import time
import socket
import threading
import logging
import ctypes
import traceback
import uvicorn

# Configurar entorno de producción / standalone si no está explícito
if getattr(sys, "frozen", False):
    os.environ["SAFE_PAYMATCH_PROD"] = "1"

# Configurar carpeta de logs en AppData
app_data = os.environ.get("APPDATA") or os.path.expanduser("~")
log_dir = os.path.join(app_data, "Safe-PayMatch")
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "desktop.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8", mode="w"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("desktop")

from server.version import __version__, __app_name__

def detect_webview2_runtime() -> str | None:
    """Detecta la ruta del runtime Edge Chromium WebView2 instalado en el sistema."""
    candidates = [
        r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application",
        r"C:\Program Files\Microsoft\EdgeWebView\Application",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\EdgeWebView\Application"),
    ]
    for c in candidates:
        if os.path.isdir(c):
            # Buscar subcarpetas con formato de versión (e.g. 156.0.4314.58)
            subdirs = [
                os.path.join(c, d)
                for d in os.listdir(c)
                if os.path.isdir(os.path.join(c, d)) and any(char.isdigit() for char in d)
            ]
            if subdirs:
                # Ordenar por tupla numérica de versión para tomar la más reciente
                subdirs.sort(
                    key=lambda s: [int(p) if p.isdigit() else 0 for p in os.path.basename(s).split(".")],
                    reverse=True,
                )
                logger.info(f"WebView2 Runtime detectado en subcarpeta de versión: {subdirs[0]}")
                return subdirs[0]
            logger.info(f"WebView2 Runtime detectado en carpeta base: {c}")
            return c
    return None

def find_free_port(start_port: int = 8000, max_tries: int = 50) -> int:
    """Busca un puerto libre en localhost para evitar colisiones."""
    for port in range(start_port, start_port + max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start_port

def show_error_box(title: str, msg: str):
    """Muestra una alerta nativa de Windows si ocurre algún error crítico."""
    logger.error(f"[{title}] {msg}")
    try:
        ctypes.windll.user32.MessageBoxW(0, msg, title, 0x10)  # 0x10 = MB_ICONERROR
    except Exception:
        print(f"[{title}] {msg}", file=sys.stderr)

server_error = []

def run_server(port: int):
    """Ejecuta el servidor FastAPI con uvicorn en segundo plano."""
    try:
        from server.main import app
        config = uvicorn.Config(
            app=app,
            host="127.0.0.1",
            port=port,
            log_level="warning",
            access_log=False,
        )
        server = uvicorn.Server(config)
        server.run()
    except Exception as e:
        server_error.append(traceback.format_exc())
        logger.error(f"Error en servidor Uvicorn: {e}")

def wait_for_server(port: int, timeout: float = 12.0) -> bool:
    """Espera activamente a que el servidor FastAPI esté respondiendo."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        if server_error:
            return False
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except (OSError, ConnectionRefusedError):
            time.sleep(0.15)
    return False

def resolve_icon_path() -> str | None:
    """Localiza el icono app.ico en dev o empaquetado."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        p = os.path.join(sys._MEIPASS, "packaging", "app.ico")
        if os.path.exists(p):
            return p
    exe_dir = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__))
    candidates = [
        os.path.join(exe_dir, "packaging", "app.ico"),
        os.path.join(exe_dir, "_internal", "packaging", "app.ico"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "packaging", "app.ico"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def main():
    try:
        import webview

        # Configurar WebView2 Runtime explícitamente para evitar caída en MSHTML (IE11)
        w2_path = detect_webview2_runtime()
        if w2_path:
            webview.settings["WEBVIEW2_RUNTIME_PATH"] = w2_path

        # Inicializar subsistema GUI y validar motor Chromium
        guilib = webview.initialize()
        renderer = getattr(guilib, "renderer", None)
        logger.info(f"pywebview inicializado con renderer: {renderer}")

        if renderer == "mshtml":
            logger.warning("Alerta: El sistema intentó usar MSHTML (Internet Explorer).")
            # Si no detectó WebView2, advertir al usuario
            if not w2_path:
                show_error_box(
                    "Microsoft Edge WebView2 requerido",
                    "Safe-PayMatch requiere Microsoft Edge WebView2 Runtime para visualizar la interfaz moderna.\n\n"
                    "Por favor descargue e instale WebView2 Runtime desde la página oficial de Microsoft."
                )
                sys.exit(1)

        port = find_free_port(8000)
        logger.info(f"Iniciando Safe-PayMatch v{__version__} en 127.0.0.1:{port}...")

        # Iniciar Uvicorn en hilo daemon (se cerrará automáticamente al salir de la app)
        server_thread = threading.Thread(target=run_server, args=(port,), daemon=True)
        server_thread.start()

        if not wait_for_server(port):
            err_msg = "\n".join(server_error) if server_error else "El servidor local no respondió a tiempo."
            show_error_box("Error iniciando Safe-PayMatch", f"No se pudo arrancar el motor interno:\n\n{err_msg}")
            sys.exit(1)

        url = f"http://127.0.0.1:{port}"
        title = f"{__app_name__} v{__version__} - Conciliación Bancaria"
        icon_path = resolve_icon_path()

        # Crear ventana nativa con motor WebView2 (Edge Chromium de Windows)
        window = webview.create_window(
            title=title,
            url=url,
            width=1280,
            height=820,
            min_size=(960, 600),
            text_select=True,
            zoomable=True,
        )

        # Iniciar bucle de eventos de la ventana nativa (Edge Chromium)
        logger.info("Abriendo ventana de interfaz nativa...")
        webview.start(icon=icon_path, private_mode=False)
        logger.info("Safe-PayMatch cerrado correctamente.")

    except Exception:
        show_error_box("Error en Safe-PayMatch", f"Ocurrió un error inesperado:\n\n{traceback.format_exc()}")
        sys.exit(1)

if __name__ == "__main__":
    main()
