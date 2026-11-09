import re
import io
import pymupdf
import pdfplumber
from typing import List, Dict, Any
from server.parser_bnc import clean_text, parse_amount

# Mapa de códigos bancarios comunes en Venezuela para identificar banco emisor
CODIGOS_BANCOS = {
    "0102": "Banco de Venezuela",
    "102": "Banco de Venezuela",
    "0104": "Venezolano de Crédito",
    "104": "Venezolano de Crédito",
    "0105": "Banco Mercantil",
    "105": "Banco Mercantil",
    "0108": "Banco Provincial",
    "108": "Banco Provincial",
    "0114": "Bancaribe",
    "114": "Bancaribe",
    "0115": "Banco Exterior",
    "115": "Banco Exterior",
    "0128": "Banco Caroní",
    "128": "Banco Caroní",
    "0134": "Banesco",
    "134": "Banesco",
    "0151": "BFC Banco Fondo Común",
    "151": "BFC Banco Fondo Común",
    "0156": "100%Banco",
    "156": "100%Banco",
    "0163": "Banco del Tesoro",
    "163": "Banco del Tesoro",
    "0166": "Banco Agrícola de Venezuela",
    "166": "Banco Agrícola de Venezuela",
    "0168": "Bancrecer",
    "168": "Bancrecer",
    "0169": "Mi Banco",
    "169": "Mi Banco",
    "0171": "Banco Activo",
    "171": "Banco Activo",
    "0172": "Bancamiga",
    "172": "Bancamiga",
    "0174": "Banplus",
    "174": "Banplus",
    "0175": "Banco Bicentenario",
    "175": "Banco Bicentenario",
    "0177": "BANFANB",
    "177": "BANFANB",
    "0191": "BNC (Banco Nacional de Crédito)",
    "191": "BNC (Banco Nacional de Crédito)",
}

def parse_100banco_pdf(file_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Parser para extractos y estados de cuenta de 100%Banco en formato PDF.
    Soporta:
    1. Tablas estructuradas (Fecha Efec., Referencia, Descripción Movimiento, Abono, Cargo).
    2. Capas de anotaciones FreeText (Okular, Acrobat) con apartamentos asignados históricamente.
    3. Detección inteligente de referencias cortas y banco emisor en descripciones.
    """
    movimientos: List[Dict[str, Any]] = []

    # Abrir con PyMuPDF para extraer anotaciones FreeText
    annot_doc = None
    try:
        annot_doc = pymupdf.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        print(f"Advertencia: No se pudo abrir anotaciones con PyMuPDF: {e}")

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page_idx, page in enumerate(pdf.pages):
                # 1. Extraer anotaciones de esta página si existen
                annots = []
                if annot_doc and page_idx < len(annot_doc):
                    mu_page = annot_doc[page_idx]
                    for a in mu_page.annots():
                        content = (a.info.get("content") or "").strip()
                        if content:
                            m_apto = re.search(r"\b(\d{1,2}-[A-Z0-9]{1,3}|PH-[A-Z0-9]{1,3})\b", content, re.IGNORECASE)
                            if m_apto:
                                annots.append({
                                    "y": (a.rect.y0 + a.rect.y1) / 2.0,
                                    "text": m_apto.group(1).upper()
                                })

                # 2. Buscar tablas en la página
                tables = page.find_tables()
                if not tables:
                    continue

                for table in tables:
                    extracted = table.extract()
                    if not extracted:
                        continue

                    # Determinar índices de columnas buscando la cabecera
                    date_col = 0
                    ref_col = 1
                    desc_col = 2
                    abono_col = 3
                    cargo_col = None
                    header_found = False
                    start_row = 0

                    for r_idx, row in enumerate(extracted[:3]):
                        row_lower = [str(c or "").strip().lower() for c in row]
                        row_str = " ".join(row_lower)
                        if "fecha" in row_str and ("descrip" in row_str or "movimiento" in row_str or "abono" in row_str or "referencia" in row_str):
                            header_found = True
                            start_row = r_idx + 1
                            for c_idx, cell in enumerate(row_lower):
                                if "fecha" in cell:
                                    date_col = c_idx
                                elif "referencia" in cell or "ref" in cell:
                                    ref_col = c_idx
                                elif "descrip" in cell or "movimiento" in cell or "concepto" in cell:
                                    desc_col = c_idx
                                elif "abono" in cell or "haber" in cell:
                                    abono_col = c_idx
                                elif "cargo" in cell or "debe" in cell:
                                    cargo_col = c_idx
                            break

                    # Procesar cada fila de la tabla
                    for r_idx in range(start_row, len(table.rows)):
                        row_obj = table.rows[r_idx]
                        cells = extracted[r_idx]
                        if not cells:
                            continue

                        fecha_raw = str(cells[date_col] or "").strip() if date_col < len(cells) else ""
                        ref_raw = str(cells[ref_col] or "").strip() if ref_col < len(cells) else ""
                        desc_raw = str(cells[desc_col] or "").strip() if desc_col < len(cells) else ""
                        abono_raw = str(cells[abono_col] or "").strip() if abono_col is not None and abono_col < len(cells) else ""
                        cargo_raw = str(cells[cargo_col] or "").strip() if cargo_col is not None and cargo_col < len(cells) else ""

                        # Si la fila está vacía o no tiene fecha ni montos, saltar
                        if not fecha_raw and not abono_raw and not cargo_raw:
                            continue

                        # Si la fecha es encabezado repetido
                        if "fecha" in fecha_raw.lower():
                            continue

                        monto_haber = parse_amount(abono_raw)
                        monto_debe = parse_amount(cargo_raw) if cargo_col is not None else 0.0

                        if monto_haber == 0.0 and monto_debe == 0.0:
                            continue

                        # Formatear fecha a DD/MM/YYYY
                        p_date = fecha_raw.split("/")
                        if len(p_date) == 3:
                            yyyy = p_date[2]
                            if len(yyyy) == 2:
                                yyyy = f"20{yyyy}"
                            fecha_norm = f"{p_date[0].zfill(2)}/{p_date[1].zfill(2)}/{yyyy}"
                        else:
                            fecha_norm = fecha_raw

                        # Limpiar y analizar descripción y referencias
                        clean_desc = clean_text(desc_raw)
                        banco_origen = "100%Banco"
                        cedula_detectada = ""
                        tipo_operacion = "Transferencia Recibida" if monto_haber > 0 else "Cargo Bancario"

                        # Analizar si es Crédito Inmediato
                        # Ej: Credito Inmediato 64353460 : 31082026100164353460
                        ci_match = re.search(r"Credito\s+Inmediato\s+(\d+)\s*:\s*(\d+)", desc_raw, re.IGNORECASE)
                        if ci_match:
                            short_ref = ci_match.group(1).strip()
                            full_ref = ci_match.group(2).strip()
                            tipo_operacion = "Crédito Inmediato Recibido"
                            # La referencia preferida es la corta exacta (o full)
                            clean_ref = short_ref if len(short_ref) >= 6 else ref_raw

                            # El banco emisor suele estar codificado en los primeros 3-4 dígitos del full_ref
                            # ej: 3108... -> 0108 Provincial, 8134... -> 0134 Banesco, 0105... -> 0105 Mercantil
                            if len(full_ref) >= 4:
                                bco_prefix = full_ref[:4]
                                # Probar tanto los 4 dígitos como los 3 últimos del prefijo (ej 3108 -> 108)
                                for cand in [bco_prefix, bco_prefix[-3:], bco_prefix[-4:]]:
                                    if cand in CODIGOS_BANCOS:
                                        banco_origen = CODIGOS_BANCOS[cand]
                                        break
                        elif "pagomovil" in desc_raw.lower() or "pago movil" in desc_raw.lower():
                            tipo_operacion = "Pago Móvil Recibido"
                            # Ej: 100%PagoMovil 151 436521436521 : 275431996
                            pm_bco = re.search(r"(?:100%PagoMovil|PagoMovil)\s+(\d{3,4})", desc_raw, re.IGNORECASE)
                            if pm_bco:
                                b_code = pm_bco.group(1)
                                if b_code in CODIGOS_BANCOS:
                                    banco_origen = CODIGOS_BANCOS[b_code]
                            # El número después de dos puntos suele ser la secuencia o cédula
                            pm_post = re.search(r":\s*(\d{7,10})", desc_raw)
                            if pm_post:
                                post_val = pm_post.group(1)
                                if 6 <= len(post_val) <= 8:
                                    cedula_detectada = f"V-{post_val}"
                            clean_ref = ref_raw
                        elif "intereses" in desc_raw.lower():
                            tipo_operacion = "Intereses Ganados"
                            clean_ref = ref_raw
                        else:
                            clean_ref = ref_raw

                        # Normalizar espacios en referencia
                        clean_ref = re.sub(r"\s+", "", clean_ref)

                        # Alinear anotación FreeText vertical
                        r_top = row_obj.bbox[1]
                        r_bottom = row_obj.bbox[3]
                        assigned_apto = ""
                        for a in annots:
                            if (r_top - 2.5) <= a["y"] <= (r_bottom + 2.5):
                                assigned_apto = a["text"]
                                break

                        movimientos.append({
                            "fecha": fecha_norm,
                            "tipo_operacion": tipo_operacion,
                            "descripcion": clean_desc,
                            "referencia": clean_ref,
                            "debe": monto_debe,
                            "haber": monto_haber,
                            "saldo": 0.0,
                            "emisor_detectado": "",
                            "cedula_detectada": cedula_detectada,
                            "cta_detectada": "",
                            "telf_detectado": "",
                            "banco_origen": banco_origen,
                            "inmueble_asignado_historico": assigned_apto
                        })
    except Exception as e:
        print(f"Error procesando PDF 100%Banco: {e}")

    return movimientos
