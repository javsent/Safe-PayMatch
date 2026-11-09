import re
import csv
import io
import openpyxl
from typing import List, Dict, Any, Optional

def clean_text(text: Optional[str]) -> str:
    if not text:
        return ""
    # Reemplazar múltiples espacios y saltos de línea por un solo espacio
    return re.sub(r"\s+", " ", str(text)).strip()

def parse_amount(val: Any) -> float:
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace(" ", "").replace("+", "")
    if not s:
        return 0.0
    # Manejar formatos como 109.669,19 o 71,127.45 o 109669.19 o -1.645,04
    # Si tiene comas y puntos:
    if "," in s and "." in s:
        if s.rfind(".") > s.rfind(","):
            # Formato anglosajón / US: 71,127.45
            s = s.replace(",", "")
        else:
            # Típico formato venezolano / europeo: 109.669,19
            s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        # Solo coma: 109669,19
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0

def extract_metadata_from_description(desc: str) -> Dict[str, str]:
    meta = {
        "emisor": "",
        "cedula": "",
        "cuenta": "",
        "telefono": "",
        "concepto_limpio": "",
        "banco_origen": ""
    }
    if not desc:
        return meta

    # 1. Teléfono
    telf_match = re.search(r"TELF\.?:?\s*(\d{10,12})", desc, re.IGNORECASE)
    if telf_match and telf_match.group(1) != "000000000000":
        meta["telefono"] = telf_match.group(1)

    # 2. Cuenta bancaria (20 dígitos o al menos 10 dígitos)
    cta_match = re.search(r"CTA\.?:?\s*(\d{10,20})", desc, re.IGNORECASE)
    if cta_match:
        meta["cuenta"] = cta_match.group(1)
    else:
        # Buscar cuenta de transferencia entre cuentas
        cta_alt = re.search(r"CUENTA NRO\.?\s*(\d{10,20})", desc, re.IGNORECASE)
        if cta_alt:
            meta["cuenta"] = cta_alt.group(1)

    # 3. Cédula
    ced_match = re.search(r"(?:CED\.?:?\s*|DE:\s*)([VEJG]-?\d{6,9})", desc, re.IGNORECASE)
    if ced_match:
        meta["cedula"] = ced_match.group(1).upper()
    else:
        # Búsqueda libre de V-12345678 o V12345678
        ced_alt = re.search(r"\b([VEJG]-?\d{6,9})\b", desc, re.IGNORECASE)
        if ced_alt:
            meta["cedula"] = ced_alt.group(1).upper()

    # 4. Emisor
    emisor_match = re.search(r"EMISOR\s*:\s*([^,\n\r]+)", desc, re.IGNORECASE)
    if emisor_match:
        meta["emisor"] = emisor_match.group(1).strip()
    else:
        # Caso transferencia BNC entre cuentas:
        # TRANSFERENCIA RECIBIDA DEL BCO. NACIONAL DE CREDITO A NOMBRE DE: V-019525777 OJEDA CORREA MARIA GABRIELA DE LA CUENTA
        emisor_bnc = re.search(r"A NOMBRE DE:\s*(?:[VEJG]-?\d+\s+)?([^,\n\r]+?)\s+DE LA CUENTA", desc, re.IGNORECASE)
        if emisor_bnc:
            meta["emisor"] = emisor_bnc.group(1).strip()
        else:
            # Caso comision: RECIBIDO DE: V-013809925 DE BCO.: BANCO PROVINCIAL POR : ABONO PHA T4
            recibido_bco = re.search(r"DE BCO\.:\s*([^,\n\r]+?)\s+POR\s*:", desc, re.IGNORECASE)
            if recibido_bco:
                meta["banco_origen"] = recibido_bco.group(1).strip()

    # 5. Banco
    banco_match = re.search(r"BANCO:(\d{4})", desc, re.IGNORECASE)
    if banco_match:
        meta["banco_origen"] = banco_match.group(1)

    return meta

def correlate_comisiones(movimientos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    En BNC, cada Crédito Inmediato (CIPOTR) viene seguido de una Comisión (CIRJUR).
    La comisión contiene la Cédula (V-XXXXX) y el Banco emisor con la misma referencia base.
    Esta función enriquece los créditos inmediatos con la cédula detectada en su comisión respectiva.
    """
    # Mapeo por últimos 6-8 dígitos de referencia o concepto adyacente
    for i, mov in enumerate(movimientos):
        if mov.get("haber", 0) > 0 and not mov.get("cedula_detectada"):
            # Buscar en la siguiente fila si es comisión del mismo banco/concepto
            if i + 1 < len(movimientos):
                next_mov = movimientos[i + 1]
                if "COMISION" in next_mov.get("tipo_operacion", "").upper() or "CIRJUR" in next_mov.get("tipo_transaccion", "").upper() or "COMISION" in next_mov.get("descripcion", "").upper():
                    meta_com = extract_metadata_from_description(next_mov.get("descripcion", ""))
                    if meta_com.get("cedula") and not mov.get("cedula_detectada"):
                        mov["cedula_detectada"] = meta_com["cedula"]
                    if meta_com.get("banco_origen") and not mov.get("banco_origen"):
                        mov["banco_origen"] = meta_com["banco_origen"]
    return movimientos

def parse_excel_or_csv(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
    rows = []
    filename_lower = filename.lower()

    if filename_lower.endswith(".csv"):
        text = file_bytes.decode("utf-8", errors="replace")
        # Detectar delimitador (, o ;)
        sample = text[:1024]
        delimiter = ";" if sample.count(";") > sample.count(",") else ","
        reader = csv.reader(io.StringIO(text), delimiter=delimiter)
        for r in reader:
            if any(cell.strip() for cell in r):
                rows.append([clean_text(c) for c in r])
    else:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        sheet = wb.active
        for row in sheet.iter_rows(values_only=True):
            cleaned_row = [clean_text(c) for c in row]
            if any(cleaned_row):
                rows.append(cleaned_row)

    # Identificar encabezado usando scoring semántico amplio
    header_idx = -1
    col_map = {}

    # Sinónimos semánticos para identificar columnas con variaciones
    _SYNONYMS = {
        "fecha":          ["fecha", "date", "dia", "día", "fec", "fec.", "fecha efec", "fecha valor", "fecha movimiento"],
        "tipo_operacion": ["tipo operacion", "tipo operación", "tipo transaccion", "tipo transacción", "tipo", "operacion", "operación"],
        "descripcion":    ["concepto", "descripcion", "descripción", "detalle", "movimiento", "descripcion movimiento", "glosa", "motivo"],
        "referencia":     ["referencia", "ref", "ref.", "nro", "número", "numero", "comprobante", "nro. operacion", "num ref"],
        "debe":           ["debe", "cargo", "cargos", "debito", "débito", "retiro", "retiros", "monto cargo", "monto db", "db"],
        "haber":          ["haber", "abono", "abonos", "credito", "crédito", "monto abono", "deposito", "depósito", "importe", "cr", "entrada", "ingreso"],
        "saldo":          ["saldo", "balance", "saldo disponible", "saldo actual"],
        "inmueble_asignado": ["apartamento", "inmueble", "apto", "unidad"],
    }

    def _sem_score(cell: str, synonyms: list) -> int:
        ct = cell.strip().lower()
        if ct in synonyms:
            return 100
        for s in synonyms:
            if ct.startswith(s):
                return 80
        for s in synonyms:
            if re.search(r"\b" + re.escape(s) + r"\b", ct):
                return 60
        for s in synonyms:
            if s in ct:
                return 40
        return 0

    best_recognized = 0
    for idx, r in enumerate(rows[:25]):
        candidate_map = {}
        for field, synonyms in _SYNONYMS.items():
            best_col = -1
            best_sc = 30
            for col_i, cell in enumerate(r):
                sc = _sem_score(cell, synonyms)
                if sc > best_sc:
                    best_sc = sc
                    best_col = col_i
            if best_col != -1:
                candidate_map[field] = best_col

        has_fecha = "fecha" in candidate_map
        has_monto = "haber" in candidate_map or "debe" in candidate_map
        recognized = len(candidate_map)
        if has_fecha and has_monto and recognized > best_recognized:
            best_recognized = recognized
            header_idx = idx
            col_map = candidate_map

    # Si no encontró header semántico, aplicar fallback posicional estándar BNC
    if header_idx == -1:
        header_idx = 0
        col_map = {"fecha": 1, "tipo_operacion": 2, "descripcion": 3, "referencia": 4, "debe": 5, "haber": 6}

    movimientos = []
    for r in rows[header_idx + 1:]:
        if len(r) <= max(col_map.values(), default=0):
            continue
        fecha = r[col_map.get("fecha", 0)] if "fecha" in col_map and col_map["fecha"] < len(r) else ""
        # Verificar que fecha tenga formato fecha básico
        if not re.search(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", fecha):
            continue

        tipo_op = r[col_map.get("tipo_operacion", 1)] if "tipo_operacion" in col_map and col_map["tipo_operacion"] < len(r) else "Movimiento"
        desc = r[col_map.get("descripcion", 2)] if "descripcion" in col_map and col_map["descripcion"] < len(r) else ""
        ref = r[col_map.get("referencia", 3)] if "referencia" in col_map and col_map["referencia"] < len(r) else ""
        debe = parse_amount(r[col_map.get("debe", 4)]) if "debe" in col_map and col_map["debe"] < len(r) else 0.0
        haber = parse_amount(r[col_map.get("haber", 5)]) if "haber" in col_map and col_map["haber"] < len(r) else 0.0
        saldo = parse_amount(r[col_map.get("saldo", 6)]) if "saldo" in col_map and col_map["saldo"] < len(r) else 0.0

        # Si viene una columna de apartamento manual (ej: 08-D, 15-C, etc.)
        inmueble_previo = ""
        if "inmueble_asignado" in col_map and col_map["inmueble_asignado"] < len(r):
            inmueble_previo = r[col_map["inmueble_asignado"]].strip()
        elif len(r) > 6 and r[-1].strip() and not re.match(r"^[\d\.,]+$", r[-1].strip()):
            # La última columna a veces contiene el apartamento anotado
            inmueble_previo = r[-1].strip()

        meta = extract_metadata_from_description(desc)

        movimientos.append({
            "fecha": fecha,
            "tipo_operacion": tipo_op,
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
            "inmueble_asignado_historico": inmueble_previo
        })

    return correlate_comisiones(movimientos)

def parse_bnc_pdf(file_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Parser robusto para estados de cuenta BNC en formato PDF usando pdfplumber.
    Detecta encabezados semánticamente y reutiliza el col_map entre páginas,
    por lo que funciona aunque solo la primera página tenga encabezado.
    """
    import pdfplumber

    _SYN_PDF = {
        "fecha":        ["fecha", "date", "dia", "día", "fec", "fecha efec", "fecha valor"],
        "cod_tx":       ["código", "codigo", "cod", "cod."],
        "tipo_op":      ["tipo operacion", "tipo operación", "tipo transaccion", "tipo transacción", "tipo"],
        "descripcion":  ["concepto", "descripcion", "descripción", "detalle", "movimiento", "glosa"],
        "referencia":   ["referencia", "ref", "ref.", "nro", "número", "numero", "comprobante"],
        "debe":         ["debe", "cargo", "cargos", "debito", "débito", "retiro", "monto db"],
        "haber":        ["haber", "abono", "abonos", "credito", "crédito", "deposito", "depósito", "importe"],
        "saldo":        ["saldo", "balance", "saldo disponible"],
    }

    def _pdf_score(cell: str, synonyms: list) -> int:
        ct = cell.strip().lower()
        if ct in synonyms: return 100
        for s in synonyms:
            if ct.startswith(s): return 80
        for s in synonyms:
            if re.search(r"\b" + re.escape(s) + r"\b", ct): return 60
        for s in synonyms:
            if s in ct: return 40
        return 0

    def _find_header(table):
        best_recognized = 0
        best_idx = -1
        best_map = {}
        for idx, row in enumerate(table[:25]):
            cand_map = {}
            for field, syns in _SYN_PDF.items():
                bst = -1; bsc = 30
                for col_i, col_name in enumerate(row):
                    sc = _pdf_score(clean_text(col_name or ""), syns)
                    if sc > bsc: bsc = sc; bst = col_i
                if bst != -1: cand_map[field] = bst
            has_f = "fecha" in cand_map
            has_m = "haber" in cand_map or "debe" in cand_map
            if has_f and has_m and len(cand_map) > best_recognized:
                best_recognized = len(cand_map)
                best_idx = idx
                best_map = cand_map
        return best_idx, best_map

    def _safe_get(row, idx, default=""):
        return clean_text(row[idx]) if idx is not None and idx < len(row) else default

    def _safe_amount(row, idx, default=0.0):
        return parse_amount(row[idx]) if idx is not None and idx < len(row) else default

    def _process_rows(table, col_map, start_idx, movimientos):
        for r in table[start_idx:]:
            if not r:
                continue
            fecha = _safe_get(r, col_map.get("fecha", 0))
            if not re.search(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", fecha):
                continue

            tipo_op_idx = col_map.get("tipo_op") or col_map.get("tipo_tx")
            tipo_op = _safe_get(r, tipo_op_idx) if tipo_op_idx is not None else ""

            desc = _safe_get(r, col_map.get("descripcion"))
            ref  = _safe_get(r, col_map.get("referencia"))
            debe  = _safe_amount(r, col_map.get("debe"))
            haber = _safe_amount(r, col_map.get("haber"))
            saldo = _safe_amount(r, col_map.get("saldo")) if "saldo" in col_map else 0.0

            # Extraer monto de celda con '+' si haber/debe no están mapeados
            if haber == 0.0 and debe == 0.0:
                for cell in r:
                    cell_s = str(cell or "").strip()
                    if cell_s.startswith("+"):
                        candidate = parse_amount(cell_s.lstrip("+"))
                        if candidate > 0:
                            haber = candidate
                            break

            if haber == 0.0 and debe == 0.0:
                continue

            meta = extract_metadata_from_description(desc)
            movimientos.append({
                "fecha": fecha,
                "tipo_operacion": tipo_op or ("Transferencia Recibida" if haber > 0 else "Cargo Bancario"),
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
                "inmueble_asignado_historico": ""
            })

    movimientos = []
    # col_map global persistente entre páginas: las páginas sin encabezado
    # usan el col_map detectado en la última página que sí lo tenía.
    global_col_map = {}

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue
                header_idx, col_map = _find_header(table)
                if header_idx != -1:
                    global_col_map = col_map
                    _process_rows(table, col_map, header_idx + 1, movimientos)
                elif global_col_map:
                    # Sin encabezado en esta tabla: usar col_map de página anterior
                    _process_rows(table, global_col_map, 0, movimientos)

    return correlate_comisiones(movimientos)
