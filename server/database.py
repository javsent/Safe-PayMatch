import sqlite3
import os
import sys
from typing import List, Dict, Any, Optional

def get_db_path() -> str:
    """
    Resuelve dinámicamente la ruta de la base de datos:
    1. Si se define SAFE_PAYMATCH_DB_PATH, se respeta esa ruta explícita.
    2. Si se ejecuta en modo standalone empaquetado (PyInstaller) o con SAFE_PAYMATCH_PROD=1,
       se almacena en %APPDATA%/Safe-PayMatch/safe_paymatch.db para que actualizaciones
       nunca sobreescriban los datos del usuario.
    3. En desarrollo local por defecto, se utiliza el archivo local en server/safe_paymatch.db.
    """
    env_path = os.environ.get("SAFE_PAYMATCH_DB_PATH")
    if env_path:
        os.makedirs(os.path.dirname(os.path.abspath(env_path)), exist_ok=True)
        return env_path

    # Modo empaquetado / producción
    is_frozen = getattr(sys, "frozen", False)
    is_prod = os.environ.get("SAFE_PAYMATCH_PROD") == "1"

    if is_frozen or is_prod:
        app_data = os.environ.get("APPDATA") or os.path.expanduser("~")
        data_dir = os.path.join(app_data, "Safe-PayMatch")
        os.makedirs(data_dir, exist_ok=True)
        return os.path.join(data_dir, "safe_paymatch.db")

    # Modo desarrollo
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "safe_paymatch.db")

DB_PATH = get_db_path()

def get_connection():
    # Recalcular ruta por si cambió el entorno en runtime
    current_path = get_db_path()
    conn = sqlite3.connect(current_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA cache_size = -64000;")  # 64 MB de caché en RAM para lecturas ultra-rápidas
    conn.execute("PRAGMA temp_store = MEMORY;")   # Operaciones temporales en RAM
    conn.execute("PRAGMA mmap_size = 268435456;") # 256 MB memory-mapped I/O
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Tabla Condominios
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS condominios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        descripcion TEXT DEFAULT '',
        icono TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Tabla Inmuebles
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inmuebles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        condominio_id INTEGER NOT NULL,
        identificador TEXT NOT NULL, -- Ej: T4-1-A, PB-4, 08-D, 15-C
        propietario TEXT NOT NULL,
        inquilino TEXT DEFAULT '',
        telefonos TEXT DEFAULT '',
        email TEXT DEFAULT '',
        otros_datos TEXT DEFAULT '', -- Notas manuales clave, ej: 'Sandra Guedez paga por Yosra'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
        UNIQUE(condominio_id, identificador)
    );
    """)

    # Tabla Tokens Aprendidos por Inmueble (Memoria asociativa del sistema)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tokens_aprendidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inmueble_id INTEGER NOT NULL,
        tipo_token TEXT NOT NULL, -- 'cuenta', 'cedula', 'telefono', 'emisor', 'alias_concepto'
        valor_normalizado TEXT NOT NULL,
        frecuencia_confirmada INTEGER DEFAULT 1,
        peso_confianza REAL DEFAULT 1.0,
        last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
        UNIQUE(inmueble_id, tipo_token, valor_normalizado)
    );
    """)

    # Migración defensiva: asegurar columna last_seen_at en tokens_aprendidos
    try:
        cursor.execute("ALTER TABLE tokens_aprendidos ADD COLUMN last_seen_at TIMESTAMP")
        cursor.execute("UPDATE tokens_aprendidos SET last_seen_at = updated_at WHERE last_seen_at IS NULL")
    except sqlite3.OperationalError:
        pass

    # Tabla Registro de Conflictos de Tokens
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tokens_conflictos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        condominio_id INTEGER NOT NULL,
        tipo_token TEXT NOT NULL,
        valor_normalizado TEXT NOT NULL,
        inmueble_existente_id INTEGER NOT NULL,
        inmueble_nuevo_id INTEGER NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
        FOREIGN KEY (inmueble_existente_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
        FOREIGN KEY (inmueble_nuevo_id) REFERENCES inmuebles(id) ON DELETE CASCADE
    );
    """)

    # Tabla Carpetas de Conciliación (Archivador mensual o temático)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS carpetas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        condominio_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        descripcion TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE
    );
    """)

    # Tabla Estados de Cuenta (Archivos cargados)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS estados_cuenta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        condominio_id INTEGER NOT NULL,
        carpeta_id INTEGER,
        titulo TEXT DEFAULT '', -- Nombre personalizado dado por el usuario
        nombre_archivo TEXT NOT NULL,
        formato TEXT NOT NULL, -- 'pdf' o 'xlsx' o 'csv'
        banco TEXT DEFAULT 'BNC',
        total_filas INTEGER DEFAULT 0,
        total_ingresos REAL DEFAULT 0,
        fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
        FOREIGN KEY (carpeta_id) REFERENCES carpetas(id) ON DELETE SET NULL
    );
    """)

    # Migración defensiva: asegurar columna titulo, carpeta_id, fecha_inicio y fecha_fin si la tabla ya existía
    try:
        cursor.execute("ALTER TABLE estados_cuenta ADD COLUMN titulo TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE estados_cuenta ADD COLUMN carpeta_id INTEGER REFERENCES carpetas(id) ON DELETE SET NULL")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE estados_cuenta ADD COLUMN fecha_inicio TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE estados_cuenta ADD COLUMN fecha_fin TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    # Tabla Movimientos Bancarios
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        estado_cuenta_id INTEGER NOT NULL,
        condominio_id INTEGER NOT NULL,
        fecha TEXT NOT NULL,
        cod_transaccion TEXT DEFAULT '',
        tipo_transaccion TEXT DEFAULT '',
        tipo_operacion TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        referencia TEXT NOT NULL,
        debe REAL DEFAULT 0.0,
        haber REAL DEFAULT 0.0,
        saldo REAL DEFAULT 0.0,
        -- Metadatos detectados
        emisor_detectado TEXT DEFAULT '',
        cedula_detectada TEXT DEFAULT '',
        cta_detectada TEXT DEFAULT '',
        telf_detectado TEXT DEFAULT '',
        -- Estado de Conciliación
        inmueble_sugerido_id INTEGER,
        inmueble_confirmado_id INTEGER,
        score_confianza REAL DEFAULT 0.0,
        razon_sugerencia TEXT DEFAULT '',
        estado_conciliacion TEXT DEFAULT 'pendiente', -- 'pendiente', 'confirmado', 'descartado'
        clasificacion_especial TEXT DEFAULT '', -- 'Caney', 'Salón', 'Multa', 'Ordinario'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (estado_cuenta_id) REFERENCES estados_cuenta(id) ON DELETE CASCADE,
        FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
        FOREIGN KEY (inmueble_sugerido_id) REFERENCES inmuebles(id) ON DELETE SET NULL,
        FOREIGN KEY (inmueble_confirmado_id) REFERENCES inmuebles(id) ON DELETE SET NULL
    );
    """)

    
    # Tabla Bancos Personalizados (Guardados por el usuario)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS bancos_personalizados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ''')

    # Limpieza defensiva de inconsistencia: movimientos con inmueble asignado
    # que conservaron clasificación residual 'No Identificado' o 'no_identificado'
    cursor.execute('''
        UPDATE movimientos
        SET clasificacion_especial = ''
        WHERE inmueble_confirmado_id IS NOT NULL
          AND clasificacion_especial IN ('No Identificado', 'no_identificado')
    ''')

    # Saneamiento defensivo: reparar referencias con notación científica residual de Excel
    try:
        from server.ref_utils import sanitize_reference
        cursor.execute("SELECT id, referencia, descripcion FROM movimientos WHERE instr(lower(referencia), 'e+') > 0 OR instr(lower(referencia), 'e-') > 0")
        bad_refs = cursor.fetchall()
        if bad_refs:
            repaired = []
            for r in bad_refs:
                clean = sanitize_reference(r["referencia"], desc=r["descripcion"])
                if clean != r["referencia"]:
                    repaired.append((clean, r["id"]))
            if repaired:
                cursor.executemany("UPDATE movimientos SET referencia = ? WHERE id = ?", repaired)
    except Exception:
        pass

    # Índices de alto rendimiento para consultas instantáneas y navegación sin lag
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_movimientos_condominio ON movimientos(condominio_id)",
        "CREATE INDEX IF NOT EXISTS idx_movimientos_estado_cuenta ON movimientos(estado_cuenta_id)",
        "CREATE INDEX IF NOT EXISTS idx_movimientos_ref ON movimientos(referencia)",
        "CREATE INDEX IF NOT EXISTS idx_movimientos_inm_conf ON movimientos(inmueble_confirmado_id)",
        "CREATE INDEX IF NOT EXISTS idx_movimientos_inm_sug ON movimientos(inmueble_sugerido_id)",
        "CREATE INDEX IF NOT EXISTS idx_movimientos_estado_conc ON movimientos(estado_conciliacion)",
        "CREATE INDEX IF NOT EXISTS idx_estados_cuenta_condo ON estados_cuenta(condominio_id)",
        "CREATE INDEX IF NOT EXISTS idx_estados_cuenta_carpeta ON estados_cuenta(carpeta_id)",
        "CREATE INDEX IF NOT EXISTS idx_carpetas_condo ON carpetas(condominio_id)",
        "CREATE INDEX IF NOT EXISTS idx_inmuebles_condo ON inmuebles(condominio_id)",
        "CREATE INDEX IF NOT EXISTS idx_tokens_inmueble ON tokens_aprendidos(inmueble_id)",
        "CREATE INDEX IF NOT EXISTS idx_tokens_tipo_val ON tokens_aprendidos(tipo_token, valor_normalizado)"
    ]
    for idx_sql in indexes:
        cursor.execute(idx_sql)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DB_PATH)
