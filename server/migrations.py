import sqlite3
import os
import re

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "safe_paymatch.db")

def run_db_upgrades():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Asegurar columna last_seen_at en tokens_aprendidos
    try:
        cursor.execute("ALTER TABLE tokens_aprendidos ADD COLUMN last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
        print("[MIGRATION] Agregada columna last_seen_at a tokens_aprendidos")
    except sqlite3.OperationalError:
        pass

    # 2. Asegurar tabla tokens_conflictos
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tokens_conflictos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        condominio_id INTEGER NOT NULL,
        tipo_token TEXT NOT NULL,
        valor_normalizado TEXT NOT NULL,
        inmueble_existente_id INTEGER NOT NULL,
        inmueble_nuevo_id INTEGER NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 3. Limpieza de tokens ruidosos de alias_concepto
    # Stop words ampliadas a purgar:
    noisy_words = [
        "apto", "apartamento", "residencia", "residencias", "meses", "cuotas", "cuota", "mes",
        "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
        "octubre", "noviembre", "diciembre", "pmpc", "luxor", "lnmediato", "aterceros",
        "pagomovil", "pago", "movil", "eur", "obp", "ref", "monto", "transferencia", "transf",
        "rec", "banco", "cta", "telf", "ced", "exterior", "100pagomovil", "100banco", "100",
        "hernandez", "enrique", "alejandro"
    ]
    placeholders = ",".join(["?"] * len(noisy_words))
    cursor.execute(f"""
        DELETE FROM tokens_aprendidos
        WHERE tipo_token = 'alias_concepto' AND valor_normalizado IN ({placeholders})
    """, noisy_words)
    deleted_noisy = cursor.rowcount
    print(f"[CLEANUP] Eliminados {deleted_noisy} tokens ruidosos de alias_concepto")

    # 4. Eliminar alias_concepto que son cédulas disfrazadas (ej. v18758401)
    cursor.execute("SELECT id, valor_normalizado FROM tokens_aprendidos WHERE tipo_token = 'alias_concepto'")
    rows = cursor.fetchall()
    cedula_like_ids = []
    for r in rows:
        val = r["valor_normalizado"]
        if re.match(r"^[vejg]?\d{5,}$", val, re.IGNORECASE) or len(val) < 4:
            cedula_like_ids.append(r["id"])

    if cedula_like_ids:
        c_placeholders = ",".join(["?"] * len(cedula_like_ids))
        cursor.execute(f"DELETE FROM tokens_aprendidos WHERE id IN ({c_placeholders})", cedula_like_ids)
        print(f"[CLEANUP] Eliminados {len(cedula_like_ids)} alias_concepto que eran cédulas o tokens < 4 letras")

    # 5. Eliminar alias_concepto que aparecen en 3 o más apartamentos distintos (demasiado genéricos)
    cursor.execute("""
        SELECT valor_normalizado
        FROM tokens_aprendidos
        WHERE tipo_token = 'alias_concepto'
        GROUP BY valor_normalizado
        HAVING COUNT(DISTINCT inmueble_id) >= 3
    """)
    generic_tokens = [r["valor_normalizado"] for r in cursor.fetchall()]
    if generic_tokens:
        g_placeholders = ",".join(["?"] * len(generic_tokens))
        cursor.execute(f"DELETE FROM tokens_aprendidos WHERE tipo_token = 'alias_concepto' AND valor_normalizado IN ({g_placeholders})", generic_tokens)
        print(f"[CLEANUP] Eliminados {len(generic_tokens)} alias_concepto que aparecían en 3+ inmuebles: {generic_tokens}")

    # 6. Corregir cédulas en conflicto conocidas de la auditoría:
    # 17192589 está en 07-C y 09-D -> la descripción dice 07-C, eliminar de 09-D
    cursor.execute("""
        DELETE FROM tokens_aprendidos
        WHERE tipo_token = 'cedula' AND valor_normalizado = '17192589'
        AND inmueble_id IN (SELECT id FROM inmuebles WHERE identificador = '09-D')
    """)
    # 18763569 está en 11-D y 12-D -> descripción dice 11-D, eliminar de 12-D
    cursor.execute("""
        DELETE FROM tokens_aprendidos
        WHERE tipo_token = 'cedula' AND valor_normalizado = '18763569'
        AND inmueble_id IN (SELECT id FROM inmuebles WHERE identificador = '12-D')
    """)

    # 7. Migración de Carpetas de Conciliación
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

    try:
        cursor.execute("ALTER TABLE estados_cuenta ADD COLUMN carpeta_id INTEGER REFERENCES carpetas(id) ON DELETE SET NULL")
    except sqlite3.OperationalError:
        pass

    MESES_MAP = {
        "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
        "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
        "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
    }

    # Obtener estados_cuenta sin carpeta_id
    cursor.execute("""
        SELECT ec.id, ec.condominio_id, ec.titulo, ec.nombre_archivo, ec.fecha_subida,
               MIN(m.fecha) as min_fecha
        FROM estados_cuenta ec
        LEFT JOIN movimientos m ON ec.id = m.estado_cuenta_id
        WHERE ec.carpeta_id IS NULL
        GROUP BY ec.id
    """)
    ecs_sin_carpeta = cursor.fetchall()
    print(f"[CARPETAS] Conciliaciones pendientes de asociar a carpetas: {len(ecs_sin_carpeta)}")

    for ec in ecs_sin_carpeta:
        c_id = ec["condominio_id"]
        fecha_ref = ec["min_fecha"]
        nombre_carpeta = "Otras Conciliaciones"

        if fecha_ref and "/" in fecha_ref:
            parts = fecha_ref.split("/")
            if len(parts) == 3:
                m_num = parts[1].zfill(2)
                y_num = parts[2]
                nombre_carpeta = f"{MESES_MAP.get(m_num, m_num)} {y_num}"

        # Verificar si ya existe carpeta con este nombre para este condominio
        cursor.execute("SELECT id FROM carpetas WHERE condominio_id = ? AND nombre = ?", (c_id, nombre_carpeta))
        c_row = cursor.fetchone()
        if c_row:
            target_carpeta_id = c_row["id"]
        else:
            cursor.execute("INSERT INTO carpetas (condominio_id, nombre) VALUES (?, ?)", (c_id, nombre_carpeta))
            target_carpeta_id = cursor.lastrowid
            print(f"[CARPETAS] Creada carpeta '{nombre_carpeta}' para condominio {c_id}")

        cursor.execute("UPDATE estados_cuenta SET carpeta_id = ? WHERE id = ?", (target_carpeta_id, ec["id"]))

    conn.commit()
    conn.close()
    print("[MIGRATION & CLEANUP] Proceso completado exitosamente.")

if __name__ == "__main__":
    run_db_upgrades()
