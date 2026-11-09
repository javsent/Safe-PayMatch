"""
parser_generic.py — Parser Universal de Extractos Bancarios

Detecta columnas por similitud semántica de encabezados en lugar de posición fija.
Funciona como fallback cuando el parser específico del banco no encuentra transacciones.

Columnas objetivo (en orden de prioridad):
  - Fecha: "fecha", "date", "dia", "día", "fec."
  - Referencia: "referencia", "ref.", "ref", "nro.", "número", "numero", "comprobante"
  - Concepto/Descripción: "concepto", "descripcion", "descripción", "detalle", "movimiento", "descripcion movimiento"
  - Haber/Abono: "haber", "abono", "abonos", "credito", "crédito", "monto", "importe", "deposito", "depósito"
  - Debe/Cargo: "debe", "cargo", "cargos", "debito", "débito", "retiro"
  - Saldo: "saldo", "balance"
"""

import re
import io
import csv
import pdfplumber
import openpyxl
from typing import List, Dict, Any, Optional, Tuple
from server.parser_bnc import clean_text, parse_amount, extract_metadata_from_description, correlate_comisiones


# ---------------------------------------------------------------------------
# Tablas de sinónimos semánticos por columna
# ---------------------------------------------------------------------------

HEADER_SYNONYMS: Dict[str, List[str]] = {
    "fecha": [
        "fecha", "date", "dia", "día", "fec", "fec.", "fecha efec", "fecha efec.",
        "fecha valor", "fecha contable", "fecha movimiento", "fecha transac"
    ],
    "referencia": [
        "referencia", "ref", "ref.", "nro", "número", "numero", "comprobante",
        "nro. operacion", "operacion", "operación", "nro operacion", "num ref",
        "numero ref", "número ref", "num. ref", "nro. ref"
    ],
    "descripcion": [
        "concepto", "descripcion", "descripción", "detalle", "movimiento",
        "descripcion movimiento", "descripción movimiento", "tipo operacion",
        "tipo operación", "tipo transaccion", "tipo transacción", "operacion",
        "glosa", "motivo", "nota"
    ],
    "haber": [
        "haber", "abono", "abonos", "credito", "crédito", "monto abono",
        "importe", "deposito", "depósito", "depositos", "depósitos",
        "monto cr", "cr", "entrada", "entradas", "ingreso", "ingresos"
    ],
    "debe": [
        "debe", "cargo", "cargos", "debito", "débito", "retiro", "retiros",
        "monto db", "db", "salida", "salidas", "egreso", "egresos",
        "monto cargo", "monto debe"
    ],
    "saldo": [
        "saldo", "balance", "saldo disponible", "saldo actual", "saldo final"
    ],
}


def _header_score(cell_text: str, synonyms: List[str]) -> int:
    """
    Puntúa cuán probable es que `cell_text` corresponda a una columna
    según sus sinónimos. Retorna 0 si no coincide.
    """
    ct = cell_text.strip().lower()
    # Coincidencia exacta → puntaje máximo
    if ct in synonyms:
        return 100
    # Comienza con algún sinónimo
    for s in synonyms:
        if ct.startswith(s):
            return 80
    # Contiene algún sinónimo (palabra completa)
    for s in synonyms:
        if re.search(r"\b" + re.escape(s) + r"\b", ct):
            return 60
    # Contiene algún sinónimo como substring
    for s in synonyms:
        if s in ct:
            return 40
    return 0


def map_columns(header_row: List[str]) -> Dict[str, int]:
    """
    Dada una fila de encabezados, determina qué columna corresponde
    a cada campo objetivo usando scoring semántico.
    Cada campo se asigna a la columna con mayor score (si supera umbral).
    """
    col_map: Dict[str, int] = {}
    # Para cada campo objetivo, buscar la mejor columna
    for field, synonyms in HEADER_SYNONYMS.items():
        best_score = 30  # Umbral mínimo
        best_col = -1
        for col_i, cell in enumerate(header_row):
            score = _header_score(cell, synonyms)
            if score > best_score:
                best_score = score
                best_col = col_i
        if best_col != -1:
            col_map[field] = best_col
    return col_map


def find_header_row(rows: List[List[str]], max_scan: int = 25) -> Tuple[int, Dict[str, int]]:
    """
    Escanea las primeras `max_scan` filas buscando la que mejor funcione
    como encabezado (aquella con mayor número de columnas reconocidas).
    Requiere al menos fecha + (haber o descripción) para ser válido.
    Retorna (header_idx, col_map) o (-1, {}) si no se encuentra nada.
    """
    best_idx = -1
    best_map: Dict[str, int] = {}
    best_recognized = 0

    for idx, row in enumerate(rows[:max_scan]):
        col_map = map_columns(row)
        recognized = len(col_map)
        # El encabezado debe tener al menos 'fecha' y algo más útil
        has_fecha = "fecha" in col_map
        has_monto = "haber" in col_map or "debe" in col_map
        if has_fecha and has_monto and recognized > best_recognized:
            best_recognized = recognized
            best_idx = idx
            best_map = col_map

    return best_idx, best_map


def _is_date(text: str) -> bool:
    """Verifica si el texto tiene forma de fecha."""
    if not text:
        return False
    patterns = [
        r"\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}",  # DD/MM/YYYY o DD-MM-YY
        r"\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}",      # YYYY-MM-DD
        r"^\d{1,2}$",                                # Solo día (ej: Banco Exterior)
    ]
    return any(re.search(p, text.strip()) for p in patterns)


def _build_movimiento(r: List[str], col_map: Dict[str, int], default_meta: Dict = None) -> Optional[Dict[str, Any]]:
    """
    Construye un dict de movimiento a partir de una fila y un col_map.
    Retorna None si la fila no tiene datos válidos.
    """
    def get(field: str, fallback: str = "") -> str:
        idx = col_map.get(field, -1)
        if idx != -1 and idx < len(r):
            return str(r[idx] or "").strip()
        return fallback

    fecha = get("fecha")
    if not _is_date(fecha):
        return None

    haber = parse_amount(get("haber"))
    debe = parse_amount(get("debe"))
    # Si ambos son 0 no es una transacción real (puede ser totalizador)
    if haber == 0.0 and debe == 0.0:
        return None

    desc = get("descripcion")
    ref = get("referencia")
    saldo = parse_amount(get("saldo"))

    meta = extract_metadata_from_description(desc)

    return {
        "fecha": fecha,
        "tipo_operacion": (
            "Pago Móvil Recibido" if "pagomovil" in desc.lower() or "pago movil" in desc.lower()
            else "Intereses Ganados" if "interes" in desc.lower()
            else "Transferencia Recibida" if haber > 0
            else "Cargo Bancario"
        ),
        "descripcion": desc,
        "referencia": ref,
        "debe": debe,
        "haber": haber,
        "saldo": saldo,
        "emisor_detectado": meta.get("emisor", ""),
        "cedula_detectada": meta.get("cedula", ""),
        "cta_detectada": meta.get("cuenta", ""),
        "telf_detectado": meta.get("telefono", ""),
        "banco_origen": meta.get("banco_origen", ""),
        "inmueble_asignado_historico": "",
    }


# ---------------------------------------------------------------------------
# Parser genérico para PDF (usando pdfplumber — tablas)
# ---------------------------------------------------------------------------

def parse_generic_pdf(file_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Parser genérico para PDF con tabla(s). Detecta encabezados semánticamente.
    """
    movimientos: List[Dict[str, Any]] = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue

                # Normalizar todas las celdas
                cleaned: List[List[str]] = [
                    [clean_text(c) for c in row]
                    for row in table
                ]

                header_idx, col_map = find_header_row(cleaned)
                if header_idx == -1 or not col_map:
                    continue

                for row in cleaned[header_idx + 1:]:
                    mov = _build_movimiento(row, col_map)
                    if mov:
                        movimientos.append(mov)

    return correlate_comisiones(movimientos)


# ---------------------------------------------------------------------------
# Parser genérico para texto plano PDF (sin tablas estructuradas)
# ---------------------------------------------------------------------------

def parse_generic_pdf_text(file_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Fallback para PDFs sin tablas: extrae texto línea a línea e intenta
    detectar filas de movimientos por patrones de fecha + monto.
    Se apoya en la primera línea que actúe como encabezado para inferir
    el orden de los campos.
    """
    movimientos: List[Dict[str, Any]] = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        all_lines: List[str] = []
        for page in pdf.pages:
            text = page.extract_text() or ""
            all_lines.extend(text.split("\n"))

    # Tokenizar cada línea en lista de celdas (por espacios múltiples o tabs)
    tokenized: List[List[str]] = []
    for line in all_lines:
        # Separar por 2+ espacios continuos (alineación de columnas)
        cells = re.split(r"  +|\t", line.strip())
        cells = [c.strip() for c in cells if c.strip()]
        if cells:
            tokenized.append(cells)

    header_idx, col_map = find_header_row(tokenized)
    if header_idx == -1 or not col_map:
        return []

    for row in tokenized[header_idx + 1:]:
        mov = _build_movimiento(row, col_map)
        if mov:
            movimientos.append(mov)

    return correlate_comisiones(movimientos)


# ---------------------------------------------------------------------------
# Parser genérico para Excel / CSV
# ---------------------------------------------------------------------------

def parse_generic_excel_csv(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
    """
    Parser genérico para Excel y CSV. Detecta encabezados semánticamente.
    """
    rows: List[List[str]] = []
    fn_lower = filename.lower()

    if fn_lower.endswith(".csv"):
        text = file_bytes.decode("utf-8", errors="replace")
        sample = text[:2048]
        # Detectar delimitador
        delimiter = ";" if sample.count(";") > sample.count(",") else ","
        reader = csv.reader(io.StringIO(text), delimiter=delimiter)
        for r in reader:
            if any(c.strip() for c in r):
                rows.append([clean_text(c) for c in r])
    else:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
            sheet = wb.active
            for row in sheet.iter_rows(values_only=True):
                cleaned = [clean_text(c) for c in row]
                if any(cleaned):
                    rows.append(cleaned)
        except Exception as e:
            print(f"[GenericParser] Error leyendo Excel: {e}")
            return []

    header_idx, col_map = find_header_row(rows)
    if header_idx == -1 or not col_map:
        return []

    movimientos: List[Dict[str, Any]] = []
    for row in rows[header_idx + 1:]:
        mov = _build_movimiento(row, col_map)
        if mov:
            movimientos.append(mov)

    return correlate_comisiones(movimientos)


# ---------------------------------------------------------------------------
# Punto de entrada principal
# ---------------------------------------------------------------------------

def parse_generic(file_bytes: bytes, filename: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Intenta parsear un extracto bancario genérico.
    Detecta automáticamente el tipo de archivo y aplica el parser apropiado.
    Retorna: ("Genérico", lista_movimientos)
    """
    fn_lower = filename.lower()
    movimientos: List[Dict[str, Any]] = []

    if fn_lower.endswith((".xlsx", ".xls", ".csv")):
        movimientos = parse_generic_excel_csv(file_bytes, filename)
    else:
        # PDF: intentar con tablas primero, luego con texto
        movimientos = parse_generic_pdf(file_bytes)
        if not movimientos:
            movimientos = parse_generic_pdf_text(file_bytes)

    return "Genérico", movimientos


# ---------------------------------------------------------------------------
# MAPEO INTERACTIVO DE COLUMNAS (PREVIEW Y PARSEO MANUAL)
# ---------------------------------------------------------------------------

def extract_raw_table_rows(file_bytes: bytes, filename: str) -> List[List[str]]:
    """
    Extrae todas las filas crudas tabulares de un archivo (PDF, Excel o CSV),
    limpiando espacios pero sin descartar encabezados ni filas.
    """
    fn_lower = filename.lower()
    rows: List[List[str]] = []

    if fn_lower.endswith((".xlsx", ".xls")):
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
            sheet = wb.active
            for r in sheet.iter_rows(values_only=True):
                cleaned = [clean_text(c) for c in r]
                if any(cleaned):
                    rows.append(cleaned)
        except Exception as e:
            print(f"[GenericParser] Error leyendo Excel en preview: {e}")

    elif fn_lower.endswith(".csv"):
        try:
            text = file_bytes.decode("utf-8", errors="replace")
            sample = text[:2048]
            delimiter = ";" if sample.count(";") > sample.count(",") else ","
            reader = csv.reader(io.StringIO(text), delimiter=delimiter)
            for r in reader:
                cleaned = [clean_text(c) for c in r]
                if any(cleaned):
                    rows.append(cleaned)
        except Exception as e:
            print(f"[GenericParser] Error leyendo CSV en preview: {e}")

    else:
        # Asumir PDF
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    tables = page.extract_tables()
                    for table in tables:
                        if not table:
                            continue
                        for r in table:
                            cleaned = [clean_text(c) for c in r]
                            if any(cleaned):
                                rows.append(cleaned)

                # Si no se extrajeron tablas estructuradas, usar líneas tokenizadas
                if not rows:
                    all_lines: List[str] = []
                    for page in pdf.pages:
                        text = page.extract_text() or ""
                        all_lines.extend(text.split("\n"))
                    for line in all_lines:
                        parts = [clean_text(p) for p in re.split(r"  +|\t", line.strip())]
                        if any(parts):
                            rows.append(parts)
        except Exception as e:
            print(f"[GenericParser] Error extrayendo filas de PDF: {e}")

    return rows


def get_table_preview_data(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """
    Genera la estructura de previsualización para el mapeador interactivo de columnas:
    - Encabezados detectados o sintéticos
    - Primeras 12 filas de muestra
    - Cantidad estimada de filas
    - Mapeo sugerido automáticamente (si se reconoció algo)
    """
    raw_rows = extract_raw_table_rows(file_bytes, filename)
    if not raw_rows:
        return {
            "filename": filename,
            "headers": [],
            "sample_rows": [],
            "total_rows": 0,
            "suggested_mapping": {},
        }

    header_idx, col_map = find_header_row(raw_rows)

    if header_idx != -1:
        headers = [h or f"Columna {i+1}" for i, h in enumerate(raw_rows[header_idx])]
        data_rows = raw_rows[header_idx + 1:]
    else:
        # Calcular el número máximo de columnas en las filas
        max_cols = max((len(r) for r in raw_rows[:25]), default=0)
        headers = [f"Columna {i+1}" for i in range(max_cols)]
        data_rows = raw_rows

    num_cols = len(headers)

    # Normalizar sample_rows al ancho de headers
    sample_rows: List[List[str]] = []
    valid_data_rows_count = 0

    for r in data_rows:
        # Rellenar o recortar para coincidir con num_cols
        padded = r[:num_cols] + [""] * max(0, num_cols - len(r))
        if any(padded):
            valid_data_rows_count += 1
            if len(sample_rows) < 12:
                sample_rows.append(padded)

    return {
        "filename": filename,
        "headers": headers,
        "sample_rows": sample_rows,
        "total_rows": valid_data_rows_count,
        "suggested_mapping": col_map,
    }


def parse_file_with_mapping(
    file_bytes: bytes,
    filename: str,
    mapping: Dict[str, int]
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parsea el archivo completo utilizando el mapeo de columnas explícito
    suministrado por el usuario:
      mapping = {"fecha": col_idx, "referencia": col_idx, "descripcion": col_idx, "haber": col_idx, "debe": col_idx}
    """
    raw_rows = extract_raw_table_rows(file_bytes, filename)
    if not raw_rows:
        return "Manual", []

    # Determinar si la primera fila es encabezado (para no incluirla)
    header_idx, _ = find_header_row(raw_rows)
    start_idx = header_idx + 1 if header_idx != -1 else 0

    fecha_col = mapping.get("fecha", -1)

    movimientos: List[Dict[str, Any]] = []
    for row in raw_rows[start_idx:]:
        # Si la fila es el mismo encabezado repetido en páginas subsiguientes, saltarla
        if fecha_col != -1 and fecha_col < len(row):
            val_fecha = str(row[fecha_col] or "").strip().lower()
            if "fecha" in val_fecha or "fec" in val_fecha:
                continue

        mov = _build_movimiento(row, mapping)
        if mov:
            movimientos.append(mov)

    # Correlacionar posibles comisiones
    movimientos_correlacionados = correlate_comisiones(movimientos)
    return "Mapeo Manual", movimientos_correlacionados
