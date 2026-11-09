import socket
import os
import sys
import subprocess
import uvicorn
import webbrowser
import threading
import time

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0

def free_port(port: int):
    """Intenta liberar el puerto en Windows terminando el proceso que lo ocupa."""
    if not is_port_in_use(port):
        return True
    try:
        # Buscar PID con netstat
        out = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True).decode(errors="ignore")
        for line in out.strip().splitlines():
            parts = line.split()
            if len(parts) >= 5 and "LISTENING" in line.upper():
                pid = parts[-1]
                if pid != "0" and int(pid) != os.getpid():
                    print(f"Liberando puerto {port} (cerrando instancia previa PID {pid})...")
                    subprocess.call(f"taskkill /F /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.5)
    except Exception:
        pass
    return not is_port_in_use(port)

def find_available_port(start_port: int = 8000) -> int:
    port = start_port
    while is_port_in_use(port):
        if free_port(port):
            return port
        port += 1
    return port

if __name__ == "__main__":
    port = find_available_port(8000)
    url = f"http://localhost:{port}"

    def open_browser():
        time.sleep(1.2)
        webbrowser.open(url)

    print("==================================================")
    print(" Safe-PayMatch - Conciliador Bancario Residencial")
    print(f" Servidor iniciado en: {url}")
    print("==================================================")

    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run("server.main:app", host="127.0.0.1", port=port, reload=False)
