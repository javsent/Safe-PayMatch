import sys
import os

# Desactivar extensiones opcionales de IA/layout que causan conflictos en entornos empaquetados
sys.modules["pymupdf.layout"] = None
sys.modules["pymupdf_layout"] = None

import io
import re
import logging
import openpyxl
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from typing import List, Optional

from server.database import get_connection, init_db, get_db_path
from server.version import get_version_info, __version__
from server.updater import (
    check_for_updates, start_download_update,
    get_download_status, apply_update_and_restart
)
from server.models import (
    CondominioCreate, CondominioResponse,
    InmuebleCreate, InmuebleUpdate, InmuebleResponse,
    ConfirmacionMovimiento, ConfirmacionLote, MovimientoResponse,
    EstadoCuentaUpdate, INMUEBLE_ALLOWED_FIELDS,
    CarpetaCreate, CarpetaUpdate, CarpetaFusionar, MoverConciliacion,
    ReportePersonalizadoExport, DownloadUpdateRequest, BancoCreate
)
import json
from server.parser_router import detect_bank_and_parse, deduplicate_movements, normalize_ref
from server.parser_generic import get_table_preview_data, parse_file_with_mapping
from server.matcher import find_best_match_for_movement, learn_from_confirmation, rescore_pending_movements
from server.importer import (
    generate_excel_template,
    parse_gc_condominio_pdf,
    parse_excel_template,
    save_imported_inmuebles
)
from server.exporter import (
    generate_conciliacion_excel, generate_conciliacion_pdf,
    generate_custom_report_excel, generate_custom_report_pdf
)

logger = logging.getLogger(__name__)

# Inicializar Base de Datos al arrancar
init_db()

app = FastAPI(title="Safe-PayMatch API", version=__version__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/version")
def api_version():
    info = get_version_info()
    info["db_path"] = get_db_path()
    return info

@app.get("/api/system/check-update")
def api_check_update():
    return check_for_updates()

@app.post("/api/system/download-update")
def api_download_update(payload: DownloadUpdateRequest, BancoCreate):
    return start_download_update(payload.url, payload.version)

@app.get("/api/system/download-status")
def api_download_status():
    return get_download_status()

@app.post("/api/system/apply-update")
def api_apply_update():
    return apply_update_and_restart()


# -------------------------------------------------------------
# BANCOS (SISTEMA + PERSONALIZADOS)
# -------------------------------------------------------------

@app.get("/api/bancos")
def list_bancos():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, nombre, created_at FROM bancos_personalizados ORDER BY nombre ASC")
    custom = [dict(r) for r in cursor.fetchall()]
    conn.close()

    bancos = [
        {"id": "auto", "nombre": "✨ Auto-detectar (Recomendado)", "tipo": "sistema"},
        {"id": "bnc", "nombre": "BNC (Banco Nacional de Crédito)", "tipo": "sistema"},
        {"id": "exterior", "nombre": "Banco Exterior", "tipo": "sistema"},
        {"id": "100banco", "nombre": "100%Banco", "tipo": "sistema"},
    ]
    for b in custom:
        bancos.append({
            "id": b["nombre"],
            "nombre": b["nombre"],
            "tipo": "personalizado"
        })
    return bancos

@app.post("/api/bancos")
def create_banco(payload: BancoCreate):
    nom = payload.nombre.strip()
    if not nom:
        raise HTTPException(status_code=400, detail="El nombre del banco no puede estar vacío.")

    sistema = ["auto", "bnc", "exterior", "100banco", "banco exterior", "banco nacional de crédito", "100%banco"]
    if nom.lower() in sistema:
        return {"ok": True, "nombre": nom, "message": "Banco del sistema"}

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT OR IGNORE INTO bancos_personalizados (nombre) VALUES (?)", (nom,))
    conn.commit()
    conn.close()
    return {"ok": True, "nombre": nom}

@app.delete("/api/bancos/{nombre}")
def delete_banco(nombre: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM bancos_personalizados WHERE nombre = ?", (nombre,))
    conn.commit()
    conn.close()
    return {"ok": True, "nombre": nombre}



# -------------------------------------------------------------
# CONDOMINIOS
# -------------------------------------------------------------

@app.get("/api/condominios")
def list_condominios():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.id, c.nombre, c.descripcion, c.icono, c.created_at,
               COUNT(i.id) as total_inmuebles
        FROM condominios c
        LEFT JOIN inmuebles i ON c.id = i.condominio_id
        GROUP BY c.id
        ORDER BY c.nombre ASC
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

@app.post("/api/condominios")
def create_condominio(data: CondominioCreate):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO condominios (nombre, descripcion, icono) VALUES (?, ?, ?)",
        (data.nombre.strip(), data.descripcion.strip(), data.icono.strip())
    )
    condo_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"id": condo_id, "nombre": data.nombre, "status": "created"}

@app.delete("/api/condominios/{condominio_id}")
def delete_condominio(condominio_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM condominios WHERE id = ?", (condominio_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "id": condominio_id}

# -------------------------------------------------------------
# INMUEBLES
# -------------------------------------------------------------

@app.get("/api/condominios/{condominio_id}/inmuebles")
def list_inmuebles(condominio_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, condominio_id, identificador, propietario, inquilino, telefonos, email, otros_datos, created_at
        FROM inmuebles
        WHERE condominio_id = ?
        ORDER BY identificador ASC
    """, (condominio_id,))
    rows = [dict(r) for r in cursor.fetchall()]

    # Adjuntar resumen de datos aprendidos
    for inm in rows:
        cursor.execute("""
            SELECT tipo_token, valor_normalizado, frecuencia_confirmada
            FROM tokens_aprendidos
            WHERE inmueble_id = ?
            ORDER BY frecuencia_confirmada DESC
            LIMIT 10
        """, (inm["id"],))
        inm["datos_aprendidos"] = [dict(t) for t in cursor.fetchall()]

    conn.close()
    return rows

@app.post("/api/condominios/{condominio_id}/inmuebles")
def create_inmueble(condominio_id: int, data: InmuebleCreate):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO inmuebles (condominio_id, identificador, propietario, inquilino, telefonos, email, otros_datos)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            condominio_id,
            data.identificador.strip(),
            data.propietario.strip(),
            data.inquilino.strip() if data.inquilino else "",
            data.telefonos.strip() if data.telefonos else "",
            data.email.strip() if data.email else "",
            data.otros_datos.strip() if data.otros_datos else ""
        ))
        inm_id = cursor.lastrowid
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Error creando inmueble (posible identificador duplicado): {e}")
    conn.close()
    return {"id": inm_id, "identificador": data.identificador, "status": "created"}

@app.put("/api/inmuebles/{inmueble_id}")
def update_inmueble(inmueble_id: int, data: InmuebleUpdate):
    conn = get_connection()
    cursor = conn.cursor()
    fields = []
    values = []
    for k, v in data.model_dump(exclude_unset=True).items():
        # Whitelist de campos permitidos para evitar SQL injection
        if k not in INMUEBLE_ALLOWED_FIELDS:
            conn.close()
            raise HTTPException(status_code=400, detail=f"Campo no permitido: {k}")
        fields.append(f"{k} = ?")
        values.append(v)
    if not fields:
        conn.close()
        return {"status": "no change"}
    values.append(inmueble_id)
    sql = f"UPDATE inmuebles SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(sql, values)
    conn.commit()
    conn.close()
    return {"status": "updated", "id": inmueble_id}

@app.delete("/api/inmuebles/{inmueble_id}")
def delete_inmueble(inmueble_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM inmuebles WHERE id = ?", (inmueble_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "id": inmueble_id}

# -------------------------------------------------------------
# IMPORTACIÓN MASIVA DE INMUEBLES & PLANTILLAS
# -------------------------------------------------------------

@app.get("/api/inmuebles/plantilla-excel")
def download_plantilla_excel():
    output = generate_excel_template()
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=plantilla_importacion_inmuebles.xlsx"}
    )

@app.post("/api/condominios/{condominio_id}/inmuebles/importar")
async def importar_inmuebles(
    condominio_id: int,
    file: UploadFile = File(...),
    tipo_importacion: str = Form("auto")
):
    content = await file.read()
    filename = file.filename.lower()

    inmuebles_extraidos = []

    # Determinar si es GC PDF o Plantilla Excel
    if tipo_importacion == "gc_pdf" or (tipo_importacion == "auto" and filename.endswith(".pdf")):
        inmuebles_extraidos = parse_gc_condominio_pdf(content)
        fuente = "Reporte GC Gestión de Condominio (PDF)"
    elif tipo_importacion == "plantilla_excel" or (tipo_importacion == "auto" and (filename.endswith(".xlsx") or filename.endswith(".xls"))):
        inmuebles_extraidos = parse_excel_template(content)
        fuente = "Plantilla de Importación Excel"
    else:
        # Intentar según extensión
        if filename.endswith(".pdf"):
            inmuebles_extraidos = parse_gc_condominio_pdf(content)
            fuente = "PDF"
        else:
            inmuebles_extraidos = parse_excel_template(content)
            fuente = "Excel"

    if not inmuebles_extraidos:
        raise HTTPException(
            status_code=400,
            detail="No se encontraron registros de inmuebles válidos en el archivo proporcionado."
        )

    stats = save_imported_inmuebles(condominio_id, inmuebles_extraidos)

    return {
        "status": "success",
        "fuente": fuente,
        "creados": stats["creados"],
        "actualizados": stats["actualizados"],
        "total": stats["total"],
        "inmuebles": inmuebles_extraidos[:5]
    }

MESES_ES = {
    "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
    "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
    "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
}

def _persist_conciliacion(
    cursor,
    conn,
    condominio_id: int,
    movimientos_finales: list,
    titulo: str,
    carpeta_id: Optional[int],
    carpeta_nombre: Optional[str],
    es_historico: bool,
    inmuebles_map: dict,
    archivos_procesados: list,
    banco_nombre: str
) -> dict:
    """
    Función centralizada para persistir en SQLite una conciliación de movimientos:
    - Deduplicación contra la base de datos
    - Resolución y asignación a carpetas
    - Sugerencias inteligentes con scoring del matcher
    - Aprendizaje automático en caso histórico
    """
    cursor.execute("""
        SELECT id, referencia, haber, debe, inmueble_confirmado_id, inmueble_sugerido_id,
               score_confianza, razon_sugerencia, estado_conciliacion, clasificacion_especial,
               fecha, tipo_operacion, descripcion
        FROM movimientos
        WHERE condominio_id = ?
    """, (condominio_id,))

    db_existing = {}
    for r in cursor.fetchall():
        r_ref = normalize_ref(r["referencia"])
        r_hab = round(float(r["haber"] or 0.0), 2)
        r_deb = round(float(r["debe"] or 0.0), 2)
        if r_ref not in ["0", ""]:
            db_existing[(r_ref, r_hab, r_deb)] = dict(r)

    # Normalizar carpeta_id y carpeta_nombre de forma defensiva
    target_carpeta_id = None
    if carpeta_id is not None and not hasattr(carpeta_id, "default"):
        try:
            target_carpeta_id = int(carpeta_id)
        except (ValueError, TypeError):
            target_carpeta_id = None

    c_nom_str = str(carpeta_nombre).strip() if (carpeta_nombre is not None and not hasattr(carpeta_nombre, "default")) else ""

    if target_carpeta_id:
        cursor.execute("SELECT id FROM carpetas WHERE id = ? AND condominio_id = ?", (target_carpeta_id, condominio_id))
        if not cursor.fetchone():
            target_carpeta_id = None

    if not target_carpeta_id:
        if c_nom_str:
            cursor.execute("SELECT id FROM carpetas WHERE condominio_id = ? AND LOWER(nombre) = LOWER(?)", (condominio_id, c_nom_str))
            c_row = cursor.fetchone()
            if c_row:
                target_carpeta_id = c_row["id"]
            else:
                cursor.execute("INSERT INTO carpetas (condominio_id, nombre) VALUES (?, ?)", (condominio_id, c_nom_str))
                target_carpeta_id = cursor.lastrowid
        else:
            primer_mov_fecha = next((m.get("fecha") for m in movimientos_finales if m.get("fecha")), "")
            nom_detectado = "Otras Conciliaciones"
            if primer_mov_fecha and "/" in primer_mov_fecha:
                parts = primer_mov_fecha.split("/")
                if len(parts) == 3:
                    m_num = parts[1].zfill(2)
                    y_num = parts[2]
                    nom_detectado = f"{MESES_ES.get(m_num, m_num)} {y_num}"

            cursor.execute("SELECT id FROM carpetas WHERE condominio_id = ? AND LOWER(nombre) = LOWER(?)", (condominio_id, nom_detectado))
            c_row = cursor.fetchone()
            if c_row:
                target_carpeta_id = c_row["id"]
            else:
                cursor.execute("INSERT INTO carpetas (condominio_id, nombre) VALUES (?, ?)", (condominio_id, nom_detectado))
                target_carpeta_id = cursor.lastrowid

    nombre_resumen = ", ".join(archivos_procesados[:3]) + (f" (+{len(archivos_procesados)-3} más)" if len(archivos_procesados) > 3 else "")
    formato_lote = "lote"
    titulo_val = titulo.strip() if titulo else ""
    cursor.execute("""
        INSERT INTO estados_cuenta (condominio_id, carpeta_id, titulo, nombre_archivo, formato, banco, total_filas, total_ingresos)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (condominio_id, target_carpeta_id, titulo_val, nombre_resumen, formato_lote, banco_nombre or "Auto", 0, 0.0))
    estado_cuenta_id = cursor.lastrowid

    todos_guardados = []
    total_ingresos_acumulado = 0.0

    for m in movimientos_finales:
        haber = round(float(m.get("haber", 0.0) or 0.0), 2)
        debe = round(float(m.get("debe", 0.0) or 0.0), 2)
        ref_norm = normalize_ref(m.get("referencia", ""))
        m["referencia"] = ref_norm

        key = (ref_norm, haber, debe) if ref_norm not in ["0", ""] else None
        existing_in_db = db_existing.get(key) if key else None

        if existing_in_db:
            if es_historico and m.get("inmueble_asignado_historico") and not existing_in_db.get("inmueble_confirmado_id"):
                historico_raw = m["inmueble_asignado_historico"].strip().upper()
                if historico_raw in inmuebles_map:
                    inm_conf_id = inmuebles_map[historico_raw]
                    cursor.execute("""
                        UPDATE movimientos
                        SET inmueble_confirmado_id = ?,
                            estado_conciliacion = 'confirmado',
                            descripcion = CASE WHEN LENGTH(?) > LENGTH(descripcion) THEN ? ELSE descripcion END
                        WHERE id = ?
                    """, (inm_conf_id, m["descripcion"], m["descripcion"], existing_in_db["id"]))
                    learn_from_confirmation(inm_conf_id, m, conn=conn)
                    existing_in_db["inmueble_confirmado_id"] = inm_conf_id
                    existing_in_db["estado_conciliacion"] = "confirmado"

            cursor.execute("""
                UPDATE movimientos
                SET estado_cuenta_id = ?
                WHERE id = ?
            """, (estado_cuenta_id, existing_in_db["id"]))

            conf_ident = None
            if existing_in_db.get("inmueble_confirmado_id"):
                for ident, i_id in inmuebles_map.items():
                    if i_id == existing_in_db["inmueble_confirmado_id"]:
                        conf_ident = ident
                        break

            sug_ident = None
            if existing_in_db.get("inmueble_sugerido_id"):
                for ident, i_id in inmuebles_map.items():
                    if i_id == existing_in_db["inmueble_sugerido_id"]:
                        sug_ident = ident
                        break

            todos_guardados.append({
                "id": existing_in_db["id"],
                "estado_cuenta_id": estado_cuenta_id,
                "nombre_archivo": m.get("_archivo_origen", ""),
                "fecha": existing_in_db["fecha"],
                "tipo_operacion": existing_in_db["tipo_operacion"],
                "descripcion": existing_in_db["descripcion"],
                "referencia": ref_norm,
                "debe": existing_in_db["debe"],
                "haber": existing_in_db["haber"],
                "inmueble_sugerido_id": existing_in_db["inmueble_sugerido_id"],
                "inmueble_sugerido_identificador": sug_ident,
                "inmueble_confirmado_id": existing_in_db["inmueble_confirmado_id"],
                "inmueble_confirmado_identificador": conf_ident,
                "score_confianza": existing_in_db["score_confianza"],
                "razon_sugerencia": existing_in_db["razon_sugerencia"],
                "estado_conciliacion": existing_in_db["estado_conciliacion"],
                "clasificacion_especial": existing_in_db["clasificacion_especial"]
            })
            total_ingresos_acumulado += haber
            continue

        match_info = find_best_match_for_movement(condominio_id, m)
        inm_sugerido_id = match_info.get("inmueble_id")
        score = match_info.get("score", 0.0)
        razon = match_info.get("razon", "")
        esp = match_info.get("clasificacion_especial", "")

        inm_confirmado_id = None
        estado_conciliacion = "pendiente"
        if es_historico and m.get("inmueble_asignado_historico"):
            historico_raw = m["inmueble_asignado_historico"].strip().upper()
            if historico_raw in inmuebles_map:
                inm_confirmado_id = inmuebles_map[historico_raw]
                estado_conciliacion = "confirmado"
                learn_from_confirmation(inm_confirmado_id, m, conn=conn)

        cursor.execute("""
            INSERT INTO movimientos (
                estado_cuenta_id, condominio_id, fecha, tipo_operacion, descripcion,
                referencia, debe, haber, saldo, emisor_detectado, cedula_detectada,
                cta_detectada, telf_detectado, inmueble_sugerido_id, inmueble_confirmado_id,
                score_confianza, razon_sugerencia, estado_conciliacion, clasificacion_especial
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            estado_cuenta_id, condominio_id, m["fecha"], m["tipo_operacion"], m["descripcion"],
            ref_norm, m["debe"], m["haber"], m["saldo"], m["emisor_detectado"],
            m["cedula_detectada"], m["cta_detectada"], m["telf_detectado"],
            inm_sugerido_id, inm_confirmado_id, score, razon, estado_conciliacion, esp
        ))
        mov_id = cursor.lastrowid
        total_ingresos_acumulado += haber

        conf_ident = None
        if inm_confirmado_id:
            for ident, i_id in inmuebles_map.items():
                if i_id == inm_confirmado_id:
                    conf_ident = ident
                    break

        todos_guardados.append({
            "id": mov_id,
            "estado_cuenta_id": estado_cuenta_id,
            "nombre_archivo": m.get("_archivo_origen", ""),
            "fecha": m["fecha"],
            "tipo_operacion": m["tipo_operacion"],
            "descripcion": m["descripcion"],
            "referencia": ref_norm,
            "debe": m["debe"],
            "haber": m["haber"],
            "inmueble_sugerido_id": inm_sugerido_id,
            "inmueble_sugerido_identificador": match_info.get("identificador"),
            "inmueble_confirmado_id": inm_confirmado_id,
            "inmueble_confirmado_identificador": conf_ident,
            "score_confianza": score,
            "razon_sugerencia": razon,
            "estado_conciliacion": estado_conciliacion,
            "clasificacion_especial": esp
        })

    cursor.execute("""
        UPDATE estados_cuenta
        SET total_filas = ?, total_ingresos = ?
        WHERE id = ?
    """, (len(todos_guardados), total_ingresos_acumulado, estado_cuenta_id))

    conn.commit()
    conn.close()

    if not todos_guardados:
        raise HTTPException(status_code=400, detail="No se encontraron transacciones legibles.")

    return {
        "estado_cuenta_id": estado_cuenta_id,
        "condominio_id": condominio_id,
        "titulo": titulo_val,
        "archivos_procesados": archivos_procesados,
        "total_archivos": len(archivos_procesados),
        "banco_detectado": banco_nombre,
        "total_movimientos": len(todos_guardados),
        "total_ingresos": total_ingresos_acumulado,
        "movimientos": todos_guardados
    }

# -------------------------------------------------------------
# ESTADOS DE CUENTA & CONCILIACIÓN
# -------------------------------------------------------------

@app.post("/api/condominios/{condominio_id}/conciliar/preview-table")
async def preview_table_for_mapping(
    condominio_id: int,
    file: UploadFile = File(...)
):
    """
    Extrae la tabla cruda del archivo (PDF, Excel o CSV) para mostrar la
    vista previa interactiva con selector de columnas en el frontend.
    """
    content = await file.read()
    filename = file.filename
    try:
        preview_data = get_table_preview_data(content, filename)
        return preview_data
    except Exception as e:
        logger.error(f"Error generando preview de tabla para {filename}: {e}")
        raise HTTPException(status_code=400, detail=f"No se pudo extraer la tabla del archivo: {e}")

@app.post("/api/condominios/{condominio_id}/conciliar/upload-with-mapping")
async def upload_estado_cuenta_with_mapping(
    condominio_id: int,
    file: UploadFile = File(...),
    mapping: str = Form(...),
    banco: str = Form("Manual"),
    es_historico: bool = Form(False),
    titulo: str = Form(""),
    carpeta_id: Optional[int] = Form(None),
    carpeta_nombre: Optional[str] = Form("")
):
    """
    Procesa e importa un extracto bancario aplicando el mapeo de columnas
    explícito definido interactivamente por el usuario.
    """
    content = await file.read()
    filename = file.filename

    try:
        col_map = json.loads(mapping)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Formato de mapeo inválido: {e}")

    # Validar campos esenciales
    if "fecha" not in col_map or "haber" not in col_map:
        raise HTTPException(status_code=400, detail="El mapeo debe incluir al menos las columnas 'Fecha' y 'Haber'.")

    parsed_col_map = {k: int(v) for k, v in col_map.items() if v is not None and str(v).isdigit()}

    banco_nombre, movs = parse_file_with_mapping(content, filename, parsed_col_map)
    if not movs:
        raise HTTPException(status_code=400, detail="No se encontraron transacciones legibles con el mapeo de columnas indicado.")

    for m in movs:
        m["_archivo_origen"] = filename

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, identificador FROM inmuebles WHERE condominio_id = ?", (condominio_id,))
    inmuebles_map = {r["identificador"].strip().upper(): r["id"] for r in cursor.fetchall()}

    movimientos_finales = deduplicate_movements(movs)

    return _persist_conciliacion(
        cursor=cursor,
        conn=conn,
        condominio_id=condominio_id,
        movimientos_finales=movimientos_finales,
        titulo=titulo,
        carpeta_id=carpeta_id,
        carpeta_nombre=carpeta_nombre,
        es_historico=es_historico,
        inmuebles_map=inmuebles_map,
        archivos_procesados=[filename],
        banco_nombre=banco_nombre or banco or "Mapeo Manual"
    )

@app.post("/api/condominios/{condominio_id}/conciliar/upload")
async def upload_estado_cuenta(
    condominio_id: int,
    files: List[UploadFile] = File(...),
    banco: str = Form("auto"),
    es_historico: bool = Form(False),
    titulo: str = Form(""),
    carpeta_id: Optional[int] = Form(None),
    carpeta_nombre: Optional[str] = Form("")
):
    if not files:
        raise HTTPException(status_code=400, detail="No se enviaron archivos para procesar.")

    conn = get_connection()
    cursor = conn.cursor()

    # Mapa de identificadores para caso histórico
    cursor.execute("SELECT id, identificador FROM inmuebles WHERE condominio_id = ?", (condominio_id,))
    inmuebles_map = {r["identificador"].strip().upper(): r["id"] for r in cursor.fetchall()}

    archivos_procesados = []
    bancos_set = set()
    todos_movs_raw = []

    for file in files:
        content = await file.read()
        filename = file.filename
        fn_lower = filename.lower()

        if not (fn_lower.endswith(".pdf") or fn_lower.endswith(".xlsx") or fn_lower.endswith(".xls") or fn_lower.endswith(".csv")):
            continue

        formato = "pdf" if fn_lower.endswith(".pdf") else ("xlsx" if fn_lower.endswith(".xlsx") or fn_lower.endswith(".xls") else "csv")

        try:
            banco_detectado, movs = detect_bank_and_parse(content, filename, banco)
        except Exception as e:
            logger.error(f"Error procesando {filename}: {e}")
            continue

        if not movs:
            continue

        bancos_set.add(banco_detectado)
        archivos_procesados.append(filename)
        for m in movs:
            m["_archivo_origen"] = filename
            todos_movs_raw.append(m)

    if not todos_movs_raw:
        conn.close()
        raise HTTPException(status_code=400, detail="No se encontraron transacciones legibles en los archivos seleccionados.")

    # DEDUPLICACIÓN INTELIGENTE: Si hay solapamiento (overlap) de extractos,
    # se conserva SIEMPRE la fila que posea mayor cantidad de datos provistos (asignación de apartamento).
    movimientos_finales = deduplicate_movements(todos_movs_raw)

    return _persist_conciliacion(
        cursor=cursor,
        conn=conn,
        condominio_id=condominio_id,
        movimientos_finales=movimientos_finales,
        titulo=titulo,
        carpeta_id=carpeta_id,
        carpeta_nombre=carpeta_nombre,
        es_historico=es_historico,
        inmuebles_map=inmuebles_map,
        archivos_procesados=archivos_procesados,
        banco_nombre=", ".join(bancos_set) if bancos_set else "Auto"
    )


# -------------------------------------------------------------
# CARPETAS DE CONCILIACIÓN (ARCHIVADOR)
# -------------------------------------------------------------

@app.get("/api/condominios/{condominio_id}/carpetas")
def list_carpetas(condominio_id: int):
    """
    Retorna la lista de carpetas del condominio junto con sus estados de cuenta anidados
    y estadísticas consolidadas.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Asegurar que estados de cuenta huérfanos se vinculen a carpetas
    cursor.execute("""
        SELECT ec.id, MIN(m.fecha) as min_fecha
        FROM estados_cuenta ec
        LEFT JOIN movimientos m ON ec.id = m.estado_cuenta_id
        WHERE ec.condominio_id = ? AND ec.carpeta_id IS NULL
        GROUP BY ec.id
    """, (condominio_id,))
    huerfanos = cursor.fetchall()
    for h in huerfanos:
        f_ref = h["min_fecha"] or ""
        nom_c = "Otras Conciliaciones"
        if f_ref and "/" in f_ref:
            parts = f_ref.split("/")
            if len(parts) == 3:
                nom_c = f"{MESES_ES.get(parts[1].zfill(2), parts[1])} {parts[2]}"
        cursor.execute("SELECT id FROM carpetas WHERE condominio_id = ? AND nombre = ?", (condominio_id, nom_c))
        c_exist = cursor.fetchone()
        if c_exist:
            c_id_t = c_exist["id"]
        else:
            cursor.execute("INSERT INTO carpetas (condominio_id, nombre) VALUES (?, ?)", (condominio_id, nom_c))
            c_id_t = cursor.lastrowid
        cursor.execute("UPDATE estados_cuenta SET carpeta_id = ? WHERE id = ?", (c_id_t, h["id"]))
    if huerfanos:
        conn.commit()

    # 2. Consultar todas las carpetas con sus estadísticas e ítems
    cursor.execute("""
        SELECT c.id as carpeta_id, c.nombre as carpeta_nombre, c.descripcion as carpeta_descripcion, c.created_at as carpeta_created_at,
               ec.id as ec_id, ec.titulo as ec_titulo, ec.nombre_archivo as ec_nombre_archivo,
               ec.formato as ec_formato, ec.banco as ec_banco, ec.total_ingresos as ec_total_ingresos,
               ec.fecha_subida as ec_fecha_subida,
               COUNT(m.id) as total_movimientos,
               COUNT(CASE WHEN m.haber > 0 THEN 1 END) as total_ingresos_filas,
               COUNT(CASE WHEN m.estado_conciliacion = 'confirmado' AND m.haber > 0 THEN 1 END) as confirmados_count,
               MIN(m.fecha) as min_fecha,
               MAX(m.fecha) as max_fecha
        FROM carpetas c
        LEFT JOIN estados_cuenta ec ON c.id = ec.carpeta_id
        LEFT JOIN movimientos m ON ec.id = m.estado_cuenta_id
        WHERE c.condominio_id = ?
        GROUP BY c.id, ec.id
        ORDER BY c.id DESC, ec.id DESC
    """, (condominio_id,))
    rows = cursor.fetchall()
    conn.close()

    carpetas_dict = {}
    for r in rows:
        c_id = r["carpeta_id"]
        if c_id not in carpetas_dict:
            carpetas_dict[c_id] = {
                "id": c_id,
                "nombre": r["carpeta_nombre"],
                "descripcion": r["carpeta_descripcion"] or "",
                "created_at": r["carpeta_created_at"],
                "items": [],
                "total_ingresos": 0.0,
                "total_filas": 0,
                "confirmados_count": 0,
            }

        if r["ec_id"]:
            tot_filas = r["total_ingresos_filas"] if r["total_ingresos_filas"] > 0 else r["total_movimientos"]
            conf = r["confirmados_count"]
            pct = round((conf / tot_filas * 100), 1) if tot_filas > 0 else 0.0
            titulo_val = (r["ec_titulo"] or "").strip()

            item_data = {
                "id": r["ec_id"],
                "carpeta_id": c_id,
                "condominio_id": condominio_id,
                "titulo": r["ec_titulo"] or "",
                "titulo_display": titulo_val if titulo_val else r["ec_nombre_archivo"],
                "nombre_archivo": r["ec_nombre_archivo"],
                "formato": r["ec_formato"],
                "banco": r["ec_banco"],
                "total_ingresos": float(r["ec_total_ingresos"] or 0.0),
                "fecha_subida": r["ec_fecha_subida"],
                "total_movimientos": r["total_movimientos"],
                "total_ingresos_filas": r["total_ingresos_filas"],
                "confirmados_count": conf,
                "porcentaje": pct,
                "min_fecha": r["min_fecha"],
                "max_fecha": r["max_fecha"],
            }
            carpetas_dict[c_id]["items"].append(item_data)
            carpetas_dict[c_id]["total_ingresos"] += float(r["ec_total_ingresos"] or 0.0)
            carpetas_dict[c_id]["total_filas"] += tot_filas
            carpetas_dict[c_id]["confirmados_count"] += conf

    resultado = list(carpetas_dict.values())
    for c in resultado:
        t_fil = c["total_filas"]
        c_conf = c["confirmados_count"]
        c["porcentaje"] = round((c_conf / t_fil * 100), 1) if t_fil > 0 else 0.0

    return resultado

@app.post("/api/condominios/{condominio_id}/carpetas")
def create_carpeta(condominio_id: int, data: CarpetaCreate):
    conn = get_connection()
    cursor = conn.cursor()
    nombre_limpio = data.nombre.strip()
    if not nombre_limpio:
        conn.close()
        raise HTTPException(status_code=400, detail="El nombre de la carpeta no puede estar vacío.")

    cursor.execute("""
        INSERT INTO carpetas (condominio_id, nombre, descripcion)
        VALUES (?, ?, ?)
    """, (condominio_id, nombre_limpio, data.descripcion.strip() if data.descripcion else ""))
    c_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"status": "created", "id": c_id, "nombre": nombre_limpio}

@app.put("/api/carpetas/{carpeta_id}")
def update_carpeta(carpeta_id: int, data: CarpetaUpdate):
    conn = get_connection()
    cursor = conn.cursor()
    nombre_limpio = data.nombre.strip()
    if not nombre_limpio:
        conn.close()
        raise HTTPException(status_code=400, detail="El nombre de la carpeta no puede estar vacío.")

    cursor.execute("""
        UPDATE carpetas
        SET nombre = ?,
            descripcion = COALESCE(?, descripcion)
        WHERE id = ?
    """, (nombre_limpio, data.descripcion, carpeta_id))
    conn.commit()
    conn.close()
    return {"status": "updated", "id": carpeta_id, "nombre": nombre_limpio}

@app.delete("/api/carpetas/{carpeta_id}")
def delete_carpeta(carpeta_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    # Desvincular de forma segura estados de cuenta para que pasen a conciliaciones sin carpeta
    cursor.execute("UPDATE estados_cuenta SET carpeta_id = NULL WHERE carpeta_id = ?", (carpeta_id,))
    cursor.execute("DELETE FROM carpetas WHERE id = ?", (carpeta_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "id": carpeta_id}

@app.post("/api/carpetas/fusionar")
def fusionar_carpetas(data: CarpetaFusionar):
    """
    Fusiona todos los estados_cuenta de carpeta_origen_id en carpeta_destino_id.
    Luego elimina la carpeta origen vacía.
    """
    if data.carpeta_origen_id == data.carpeta_destino_id:
        raise HTTPException(status_code=400, detail="No puedes fusionar una carpeta consigo misma.")

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, nombre FROM carpetas WHERE id = ?", (data.carpeta_origen_id,))
    c_orig = cursor.fetchone()
    cursor.execute("SELECT id, nombre FROM carpetas WHERE id = ?", (data.carpeta_destino_id,))
    c_dest = cursor.fetchone()

    if not c_orig or not c_dest:
        conn.close()
        raise HTTPException(status_code=404, detail="Una de las carpetas seleccionadas no existe.")

    # Mover todas las conciliaciones de la carpeta origen a la de destino
    cursor.execute("""
        UPDATE estados_cuenta
        SET carpeta_id = ?
        WHERE carpeta_id = ?
    """, (data.carpeta_destino_id, data.carpeta_origen_id))
    movidos = cursor.rowcount

    # Eliminar la carpeta origen que quedó vacía
    cursor.execute("DELETE FROM carpetas WHERE id = ?", (data.carpeta_origen_id,))

    conn.commit()
    conn.close()
    return {
        "status": "merged",
        "conciliaciones_movidas": movidos,
        "carpeta_destino_id": data.carpeta_destino_id,
        "carpeta_destino_nombre": c_dest["nombre"]
    }

@app.put("/api/estados-cuenta/{estado_cuenta_id}/mover")
def mover_conciliacion(estado_cuenta_id: int, data: MoverConciliacion):
    """
    Mueve una conciliación específica a otra carpeta.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, nombre FROM carpetas WHERE id = ?", (data.carpeta_id,))
    c_dest = cursor.fetchone()
    if not c_dest:
        conn.close()
        raise HTTPException(status_code=404, detail="La carpeta destino seleccionada no existe.")

    cursor.execute("""
        UPDATE estados_cuenta
        SET carpeta_id = ?
        WHERE id = ?
    """, (data.carpeta_id, estado_cuenta_id))
    conn.commit()
    conn.close()
    return {"status": "moved", "estado_cuenta_id": estado_cuenta_id, "nueva_carpeta_id": data.carpeta_id}

@app.get("/api/condominios/{condominio_id}/estados-cuenta")
def list_estados_cuenta(condominio_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT ec.id, ec.condominio_id, ec.carpeta_id, ec.titulo, ec.nombre_archivo, ec.formato, ec.banco,
               ec.total_filas, ec.total_ingresos, ec.fecha_subida,
               c.nombre as carpeta_nombre,
               COUNT(m.id) as total_movimientos,
               COUNT(CASE WHEN m.haber > 0 THEN 1 END) as total_ingresos_filas,
               COUNT(CASE WHEN m.estado_conciliacion = 'confirmado' AND m.haber > 0 THEN 1 END) as confirmados_count,
               MIN(m.fecha) as min_fecha,
               MAX(m.fecha) as max_fecha
        FROM estados_cuenta ec
        LEFT JOIN carpetas c ON ec.carpeta_id = c.id
        LEFT JOIN movimientos m ON ec.id = m.estado_cuenta_id
        WHERE ec.condominio_id = ?
        GROUP BY ec.id
        HAVING COUNT(m.id) > 0
        ORDER BY ec.id DESC
    """, (condominio_id,))
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        row_dict = dict(r)
        c_nom = row_dict.get("carpeta_nombre")
        fecha_ref = row_dict["min_fecha"] or row_dict["max_fecha"]
        mes_key = f"carpeta-{row_dict.get('carpeta_id')}" if row_dict.get("carpeta_id") else "otros"
        mes_label = c_nom if c_nom else "Otras Conciliaciones"

        if not c_nom and fecha_ref and "/" in fecha_ref:
            parts = fecha_ref.split("/")
            if len(parts) == 3:
                m_num = parts[1].zfill(2)
                y_num = parts[2]
                mes_key = f"{y_num}-{m_num}"
                mes_label = f"{MESES_ES.get(m_num, m_num)} {y_num}"

        tot_ing = row_dict["total_ingresos_filas"] if row_dict["total_ingresos_filas"] > 0 else row_dict["total_movimientos"]
        conf_count = row_dict["confirmados_count"]
        pct = round((conf_count / tot_ing * 100), 1) if tot_ing > 0 else 0.0

        estado = "completado" if pct >= 100 else ("en_progreso" if pct > 0 else "pendiente")

        row_dict["mes_key"] = mes_key
        row_dict["mes_label"] = mes_label
        row_dict["porcentaje"] = pct
        row_dict["estado"] = estado
        titulo_val = (row_dict.get("titulo") or "").strip()
        row_dict["titulo_display"] = titulo_val if titulo_val else row_dict["nombre_archivo"]
        result.append(row_dict)

    return result

@app.get("/api/estados-cuenta/{estado_cuenta_id}")
def get_estado_cuenta(estado_cuenta_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM estados_cuenta WHERE id = ?", (estado_cuenta_id,))
    ec_row = cursor.fetchone()
    if not ec_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Estado de cuenta no encontrado")

    ec = dict(ec_row)
    cursor.execute("""
        SELECT m.*,
               i_sug.identificador as inmueble_sugerido_identificador,
               CASE
                   WHEN i_conf.identificador IS NOT NULL THEN i_conf.identificador
                   WHEN m.estado_conciliacion = 'confirmado' AND m.clasificacion_especial = 'No Identificado' THEN 'No Identificado'
                   WHEN m.estado_conciliacion = 'confirmado' THEN 'No Aplica'
                   ELSE NULL
               END as inmueble_confirmado_identificador
        FROM movimientos m
        LEFT JOIN inmuebles i_sug ON m.inmueble_sugerido_id = i_sug.id
        LEFT JOIN inmuebles i_conf ON m.inmueble_confirmado_id = i_conf.id
        WHERE m.estado_cuenta_id = ?
        ORDER BY m.id ASC
    """, (estado_cuenta_id,))
    movs = [dict(r) for r in cursor.fetchall()]
    conn.close()

    return {
        "estado_cuenta_id": ec["id"],
        "condominio_id": ec["condominio_id"],
        "titulo": ec.get("titulo", "") or "",
        "nombre_archivo": ec["nombre_archivo"],
        "formato": ec["formato"],
        "banco_detectado": ec["banco"],
        "total_movimientos": len(movs),
        "total_ingresos": ec["total_ingresos"],
        "fecha_subida": ec["fecha_subida"],
        "movimientos": movs
    }

@app.put("/api/estados-cuenta/{estado_cuenta_id}")
def update_estado_cuenta(estado_cuenta_id: int, data: EstadoCuentaUpdate):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE estados_cuenta SET titulo = ? WHERE id = ?", (data.titulo.strip(), estado_cuenta_id))
    conn.commit()
    conn.close()
    return {"status": "updated", "id": estado_cuenta_id, "titulo": data.titulo.strip()}

@app.delete("/api/estados-cuenta/{estado_cuenta_id}")
def delete_estado_cuenta(estado_cuenta_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM estados_cuenta WHERE id = ?", (estado_cuenta_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "id": estado_cuenta_id}

@app.get("/api/condominios/{condominio_id}/conciliar/ultimo")
def get_ultimo_estado_cuenta(condominio_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM estados_cuenta
        WHERE condominio_id = ?
        ORDER BY id DESC
        LIMIT 1
    """, (condominio_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return JSONResponse(content={}, status_code=200)

    ec = dict(row)
    cursor.execute("""
        SELECT m.*,
               i_sug.identificador as inmueble_sugerido_identificador,
               CASE
                   WHEN i_conf.identificador IS NOT NULL THEN i_conf.identificador
                   WHEN m.estado_conciliacion = 'confirmado' AND m.clasificacion_especial = 'No Identificado' THEN 'No Identificado'
                   WHEN m.estado_conciliacion = 'confirmado' THEN 'No Aplica'
                   ELSE NULL
               END as inmueble_confirmado_identificador
        FROM movimientos m
        LEFT JOIN inmuebles i_sug ON m.inmueble_sugerido_id = i_sug.id
        LEFT JOIN inmuebles i_conf ON m.inmueble_confirmado_id = i_conf.id
        WHERE m.estado_cuenta_id = ?
        ORDER BY m.id ASC
    """, (ec["id"],))
    movs = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {
        "estado_cuenta_id": ec["id"],
        "condominio_id": ec["condominio_id"],
        "titulo": ec.get("titulo", "") or "",
        "nombre_archivo": ec["nombre_archivo"],
        "formato": ec["formato"],
        "banco_detectado": ec["banco"],
        "total_movimientos": len(movs),
        "total_ingresos": ec["total_ingresos"],
        "fecha_subida": ec["fecha_subida"],
        "movimientos": movs
    }

@app.get("/api/estados-cuenta/{estado_cuenta_id}/movimientos")
def get_movimientos(estado_cuenta_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT m.*,
               i_sug.identificador as inmueble_sugerido_identificador,
               CASE
                   WHEN i_conf.identificador IS NOT NULL THEN i_conf.identificador
                   WHEN m.estado_conciliacion = 'confirmado' AND m.clasificacion_especial = 'No Identificado' THEN 'No Identificado'
                   WHEN m.estado_conciliacion = 'confirmado' THEN 'No Aplica'
                   ELSE NULL
               END as inmueble_confirmado_identificador
        FROM movimientos m
        LEFT JOIN inmuebles i_sug ON m.inmueble_sugerido_id = i_sug.id
        LEFT JOIN inmuebles i_conf ON m.inmueble_confirmado_id = i_conf.id
        WHERE m.estado_cuenta_id = ?
        ORDER BY m.id ASC
    """, (estado_cuenta_id,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

@app.post("/api/movimientos/confirmar")
def confirmar_movimiento(data: ConfirmacionMovimiento):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM movimientos WHERE id = ?", (data.movimiento_id,))
    mov = cursor.fetchone()
    if not mov:
        conn.close()
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    mov_dict = dict(mov)
    estado_cuenta_id = mov_dict["estado_cuenta_id"]

    cursor.execute("""
        UPDATE movimientos
        SET inmueble_confirmado_id = ?,
            clasificacion_especial = ?,
            estado_conciliacion = ?
        WHERE id = ?
    """, (
        data.inmueble_id,
        data.clasificacion_especial or "",
        data.estado_conciliacion or "confirmado",
        data.movimiento_id
    ))
    conn.commit()

    # Si se asignó a un inmueble, entrenar tokens
    if data.inmueble_id:
        learn_from_confirmation(data.inmueble_id, mov_dict, conn=conn)
        conn.commit()

    # Fase 3: Re-evaluación en tiempo real de filas pendientes
    updated_pendientes = rescore_pending_movements(estado_cuenta_id, conn=conn)
    conn.commit()
    conn.close()

    return {
        "status": "confirmed",
        "movimiento_id": data.movimiento_id,
        "updated_pendientes": updated_pendientes
    }

@app.post("/api/movimientos/confirmar-lote")
def confirmar_lote(lote: ConfirmacionLote):
    conn = get_connection()
    cursor = conn.cursor()

    estados_afectados = set()
    for item in lote.confirmaciones:
        cursor.execute("SELECT * FROM movimientos WHERE id = ?", (item.movimiento_id,))
        mov = cursor.fetchone()
        if mov:
            mov_dict = dict(mov)
            estados_afectados.add(mov_dict["estado_cuenta_id"])
            cursor.execute("""
                UPDATE movimientos
                SET inmueble_confirmado_id = ?,
                    clasificacion_especial = ?,
                    estado_conciliacion = 'confirmado'
                WHERE id = ?
            """, (item.inmueble_id, item.clasificacion_especial or "", item.movimiento_id))
            if item.inmueble_id:
                learn_from_confirmation(item.inmueble_id, mov_dict, conn=conn)

    conn.commit()

    # Fase 3: Re-evaluación en tiempo real de filas pendientes en lotes afectados
    all_updated = []
    for ec_id in estados_afectados:
        all_updated.extend(rescore_pending_movements(ec_id, conn=conn))

    conn.commit()
    conn.close()
    return {
        "status": "batch_confirmed",
        "count": len(lote.confirmaciones),
        "updated_pendientes": all_updated
    }

@app.get("/api/condominios/{condominio_id}/conflictos")
def get_conflictos_condominio(condominio_id: int):
    """
    Fase 5: Retorna los conflictos de cédula, cuenta o teléfono registrados
    entre distintos inmuebles del mismo condominio.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT tc.*,
               i1.identificador as inmueble_existente_identificador,
               i2.identificador as inmueble_nuevo_identificador
        FROM tokens_conflictos tc
        JOIN inmuebles i1 ON tc.inmueble_existente_id = i1.id
        JOIN inmuebles i2 ON tc.inmueble_nuevo_id = i2.id
        WHERE tc.condominio_id = ?
        ORDER BY tc.id DESC
    """, (condominio_id,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

@app.post("/api/condominios/{condominio_id}/purgar-tokens")
def purgar_tokens_obsoletos(condominio_id: int):
    """
    Fase 4.3: Purga tokens con frecuencia <= 1 y no vistos en más de 18 meses (540 días).
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        DELETE FROM tokens_aprendidos
        WHERE inmueble_id IN (SELECT id FROM inmuebles WHERE condominio_id = ?)
          AND frecuencia_confirmada <= 1
          AND (julianday('now') - julianday(COALESCE(last_seen_at, updated_at))) > 540
    """, (condominio_id,))
    purgados = cursor.rowcount
    conn.commit()
    conn.close()
    return {"status": "purged", "tokens_purgados": purgados}

@app.get("/api/estados-cuenta/{estado_cuenta_id}/exportar")
def exportar_conciliacion(estado_cuenta_id: int, formato: str = "excel"):
    if formato.lower() == "pdf":
        try:
            output = generate_conciliacion_pdf(estado_cuenta_id)
        except Exception as e:
            logger.error(f"Error generando exportación PDF: {e}")
            raise HTTPException(status_code=500, detail=f"Error generando PDF: {e}")
        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=conciliacion_{estado_cuenta_id}.pdf"}
        )
    else:
        try:
            output = generate_conciliacion_excel(estado_cuenta_id)
        except Exception as e:
            logger.error(f"Error generando exportación Excel: {e}")
            raise HTTPException(status_code=500, detail=f"Error generando Excel: {e}")
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=conciliacion_{estado_cuenta_id}.xlsx"}
        )

@app.get("/api/estados-cuenta/{estado_cuenta_id}/exportar-pdf")
def exportar_conciliacion_pdf(estado_cuenta_id: int):
    try:
        output = generate_conciliacion_pdf(estado_cuenta_id)
    except Exception as e:
        logger.error(f"Error generando exportación PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {e}")
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=conciliacion_{estado_cuenta_id}.pdf"}
    )



# -------------------------------------------------------------
# REPORTE GENERAL DE CONCILIACIONES Y EXPORTACIÓN PERSONALIZADA
# -------------------------------------------------------------

@app.get("/api/condominios/{condominio_id}/reporte-movimientos")
def get_reporte_movimientos(
    condominio_id: int,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    estado: Optional[str] = "todos",
    carpeta_id: Optional[int] = None,
    busqueda: Optional[str] = None
):
    """
    Consulta consolidada de movimientos para el generador de reportes contables:
    permite filtrar por rango de fechas, estado (ej. solo no identificados/pendientes),
    carpeta o texto libre.
    """
    from datetime import datetime
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        SELECT m.id, m.fecha, m.referencia, m.descripcion, m.debe, m.haber,
               m.estado_conciliacion, m.clasificacion_especial,
               m.estado_cuenta_id, ec.titulo as estado_cuenta_titulo,
               ec.carpeta_id, c.nombre as carpeta_nombre,
               i_conf.identificador as inmueble_confirmado,
               i_sug.identificador as inmueble_sugerido
        FROM movimientos m
        JOIN estados_cuenta ec ON m.estado_cuenta_id = ec.id
        LEFT JOIN carpetas c ON ec.carpeta_id = c.id
        LEFT JOIN inmuebles i_conf ON m.inmueble_confirmado_id = i_conf.id
        LEFT JOIN inmuebles i_sug ON m.inmueble_sugerido_id = i_sug.id
        WHERE m.condominio_id = ?
    """
    params = [condominio_id]

    if carpeta_id is not None and carpeta_id > 0:
        query += " AND ec.carpeta_id = ?"
        params.append(carpeta_id)

    if estado and estado != "todos":
        if estado == "confirmado":
            query += " AND m.estado_conciliacion = 'confirmado'"
        elif estado == "pendiente":
            query += " AND (m.estado_conciliacion = 'pendiente' OR m.estado_conciliacion IS NULL)"
        elif estado == "descartado":
            query += " AND m.estado_conciliacion = 'descartado'"
        elif estado == "no_identificado":
            query += " AND (m.estado_conciliacion = 'pendiente' OR m.clasificacion_especial = 'No Identificado')"

    if busqueda and busqueda.strip():
        term = f"%{busqueda.strip()}%"
        query += " AND (m.referencia LIKE ? OR m.descripcion LIKE ? OR i_conf.identificador LIKE ? OR i_sug.identificador LIKE ?)"
        params.extend([term, term, term, term])

    query += " ORDER BY m.id ASC"

    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    conn.close()

    def parse_mov_date(d_str):
        if not d_str:
            return None
        d_clean = str(d_str).strip()
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
            try:
                return datetime.strptime(d_clean, fmt)
            except ValueError:
                pass
        return None

    dt_desde = parse_mov_date(fecha_desde) if fecha_desde else None
    dt_hasta = parse_mov_date(fecha_hasta) if fecha_hasta else None

    movimientos_res = []
    total_monto = 0.0

    for r in rows:
        m_dt = parse_mov_date(r["fecha"])
        if dt_desde and m_dt and m_dt < dt_desde:
            continue
        if dt_hasta and m_dt and m_dt > dt_hasta:
            continue

        haber = float(r["haber"] or 0.0)
        debe = float(r["debe"] or 0.0)
        monto = haber if haber > 0 else -debe

        if r["estado_conciliacion"] == "confirmado":
            if r["inmueble_confirmado"]:
                inm_label = r["inmueble_confirmado"]
                if r["clasificacion_especial"] and r["clasificacion_especial"] not in ("No Aplica", "No Identificado"):
                    inm_label += f" ({r['clasificacion_especial']})"
            elif r["clasificacion_especial"] == "No Identificado":
                inm_label = "No Identificado"
            else:
                inm_label = "No Aplica"
        else:
            inm_label = r["inmueble_sugerido"] or "Sin Asignar"
            if r["clasificacion_especial"]:
                inm_label += f" ({r['clasificacion_especial']})"

        desc_limpia = re.sub(r"\s+", " ", r["descripcion"] or "").strip()
        if not desc_limpia:
            desc_limpia = "Pago / Transferencia"

        movimientos_res.append({
            "id": r["id"],
            "fecha": r["fecha"] or "",
            "referencia": r["referencia"] or "",
            "concepto": desc_limpia,
            "monto": monto,
            "inmueble": inm_label,
            "estado_conciliacion": r["estado_conciliacion"] or "pendiente",
            "carpeta_nombre": r["carpeta_nombre"] or "Sin Carpeta",
            "clasificacion_especial": r["clasificacion_especial"] or ""
        })
        total_monto += monto

    return {
        "total_movimientos": len(movimientos_res),
        "total_monto": total_monto,
        "movimientos": movimientos_res
    }

@app.post("/api/condominios/{condominio_id}/exportar-reporte-personalizado")
def exportar_reporte_personalizado(
    condominio_id: int,
    payload: ReportePersonalizadoExport, DownloadUpdateRequest, BancoCreate
):
    """
    Genera y descarga el archivo Excel o PDF con las transacciones previsualizadas
    y ajustadas por el usuario (tras haber eliminado duplicados o filas no deseadas).
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT nombre FROM condominios WHERE id = ?", (condominio_id,))
    condo_row = cursor.fetchone()
    conn.close()

    condominio_nombre = condo_row["nombre"] if condo_row else "Condominio"

    if payload.formato.lower() == "pdf":
        try:
            output = generate_custom_report_pdf(
                condominio_nombre=condominio_nombre,
                movimientos=payload.movimientos,
                titulo_reporte=payload.titulo_reporte,
                subtitulo_filtros=payload.subtitulo_filtros or ""
            )
        except Exception as e:
            logger.error(f"Error generando reporte PDF personalizado: {e}")
            raise HTTPException(status_code=500, detail=f"Error generando reporte PDF: {e}")
        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=reporte_{condominio_id}.pdf"}
        )
    else:
        try:
            output = generate_custom_report_excel(
                condominio_nombre=condominio_nombre,
                movimientos=payload.movimientos,
                titulo_reporte=payload.titulo_reporte,
                subtitulo_filtros=payload.subtitulo_filtros or ""
            )
        except Exception as e:
            logger.error(f"Error generando reporte Excel personalizado: {e}")
            raise HTTPException(status_code=500, detail=f"Error generando reporte Excel: {e}")
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=reporte_{condominio_id}.xlsx"}
        )


# -------------------------------------------------------------
# SERVIR FRONTEND ESTÁTICO (SPA)
# -------------------------------------------------------------
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse

def _resolve_dist_dir() -> str:
    # 1. Si está empaquetado con PyInstaller (onedir / onefile)
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        meipass_dist = os.path.join(sys._MEIPASS, "frontend", "dist")
        if os.path.exists(meipass_dist):
            return meipass_dist

    # 2. Junto al ejecutable o en _internal
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
        for rel in [os.path.join("_internal", "frontend", "dist"), os.path.join("frontend", "dist")]:
            cand = os.path.join(exe_dir, rel)
            if os.path.exists(cand):
                return cand

    # 3. Modo desarrollo estándar (server/main.py -> ../frontend/dist)
    dev_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
    if os.path.exists(dev_path):
        return dev_path

    # 4. Fallback relativo al directorio de trabajo actual
    cwd_path = os.path.join(os.getcwd(), "frontend", "dist")
    return cwd_path

DIST_DIR = _resolve_dist_dir()

if os.path.exists(DIST_DIR):
    assets_dir = os.path.join(DIST_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    fonts_dir = os.path.join(DIST_DIR, "fonts")
    if os.path.exists(fonts_dir):
        app.mount("/fonts", StaticFiles(directory=fonts_dir), name="fonts")

    @app.get("/")
    async def serve_root():
        index_file = os.path.join(DIST_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return HTMLResponse("<h2>Safe-PayMatch: index.html no encontrado</h2>", status_code=500)

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Si es ruta de api, no intervenir
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="API route not found")
        file_path = os.path.join(DIST_DIR, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        index_file = os.path.join(DIST_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return HTMLResponse("<h2>Safe-PayMatch: Archivo no encontrado</h2>", status_code=404)
else:
    logger.warning(f"Frontend DIST_DIR no encontrado: {DIST_DIR}")

    @app.get("/")
    async def serve_missing_dist():
        return HTMLResponse(
            f"<h2>Error: Carpeta frontend no encontrada</h2><p>Ruta buscada: {DIST_DIR}</p>",
            status_code=500
        )
