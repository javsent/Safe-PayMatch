"""
build_desktop.py - Automatización de compilación para Safe-PayMatch
1. Compila el frontend Vite -> frontend/dist
2. Empaqueta el ejecutable nativo con PyInstaller
"""

import os
import sys
import subprocess
import shutil

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

def run_command(cmd, cwd=None, description=""):
    print(f"\n[BUILD] >>> {description} ({' '.join(cmd) if isinstance(cmd, list) else cmd})")
    res = subprocess.run(cmd, cwd=cwd or ROOT_DIR, shell=True)
    if res.returncode != 0:
        print(f"[ERROR] Falló: {description}")
        sys.exit(res.returncode)
    print(f"[OK] {description} completado.")

def main():
    from server.version import __version__, __app_name__
    print("=" * 60)
    print(f" COMPILADOR STANDALONE DE ESCRITORIO: {__app_name__} v{__version__}")
    print("=" * 60)

    # 1. Compilar Frontend
    frontend_dir = os.path.join(ROOT_DIR, "frontend")
    run_command("npm run build", cwd=frontend_dir, description="Compilación de Frontend Vite")

    # 2. Generar icono si no existe
    icon_path = os.path.join(ROOT_DIR, "packaging", "app.ico")
    if not os.path.exists(icon_path):
        run_command("python packaging/generate_icon.py", cwd=ROOT_DIR, description="Generación de icono .ico")

    # 3. Construir comando PyInstaller
    dist_folder = os.path.join(ROOT_DIR, "dist")
    build_folder = os.path.join(ROOT_DIR, "build")

    # Limpiar compilaciones anteriores si existen
    if os.path.exists(build_folder):
        shutil.rmtree(build_folder, ignore_errors=True)
    out_app_folder = os.path.join(dist_folder, "Safe-PayMatch")
    if os.path.exists(out_app_folder):
        shutil.rmtree(out_app_folder, ignore_errors=True)

    hidden_imports = [
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespans",
        "uvicorn.lifespans.auto",
        "fastapi",
        "fastapi.staticfiles",
        "fastapi.responses",
        "starlette",
        "pydantic",
        "pydantic_core",
        "reportlab",
        "openpyxl",
        "pdfplumber",
        "pymupdf",
        "rapidfuzz",
        "webview",
        "webview.platforms.winforms",
        "webview.platforms.edgechromium",
        "clr_loader",
        "pythonnet",
    ]

    hidden_args = " ".join([f"--hidden-import {mod}" for mod in hidden_imports])

    exclude_modules = [
        "pymupdf.layout",
        "pymupdf_layout",
        "onnxruntime",
        "cv2",
        "tensorflow",
        "torch",
        "torchvision",
        "scipy",
    ]
    exclude_args = " ".join([f"--exclude-module {mod}" for mod in exclude_modules])

    frontend_dist_source = os.path.join(ROOT_DIR, "frontend", "dist")
    add_data_args = (
        f'--add-data "{frontend_dist_source};frontend/dist" '
        f'--add-data "{icon_path};packaging"'
    )

    pyinstaller_cmd = (
        f'python -m PyInstaller '
        f'--name "Safe-PayMatch" '
        f'--noconsole '
        f'--onedir '
        f'-y '
        f'--icon "{icon_path}" '
        f'{add_data_args} '
        f'{hidden_args} '
        f'{exclude_args} '
        f'--clean '
        f'desktop.py'
    )

    run_command(pyinstaller_cmd, cwd=ROOT_DIR, description="Compilación nativa con PyInstaller")

    print("\n" + "=" * 60)
    print(" ¡COMPILACIÓN EXITOSA!")
    print(f" Binarios listos en: {os.path.join(dist_folder, 'Safe-PayMatch')}")
    print(f" Ejecutable principal: {os.path.join(dist_folder, 'Safe-PayMatch', 'Safe-PayMatch.exe')}")
    print("=" * 60)

if __name__ == "__main__":
    main()
