import re
import io
import pymupdf
import pdfplumber
from datetime import datetime
from typing import List, Dict, Any
from server.parser_bnc import clean_text, parse_amount

def parse_exterior_pdf(file_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Parser robusto para estados de cuenta de Banco Exterior.
    Soporta:
    1. PDF Oficial con tablas y columnas estructuradas (Día, Referencia, Descripción, Cargos, Abonos).
    2. PDF exportado de Excel / texto plano con soporte para capas de anotaciones FreeText (Okular, Acrobat).
    """
    # Intentar primero con PyMuPDF para capturar capas de texto y anotaciones FreeText
    try:
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
        has_annots = False
        for p in doc:
            if list(p.annots()):
                has_annots = True
                break

        # Si tiene texto y formato exportado o anotaciones
        first_page_text = doc[0].get_text()
        is_official = "Estado de cuenta y comprobante por cargos efectuados" in first_page_text or "Resumen de transacciones" in first_page_text

        if not is_official:
            # Procesar formato exportado con alineación de anotaciones
            movs = parse_exterior_text_and_annots(doc)
            if movs:
                return movs
    except Exception as e:
        print(f"Error procesando con PyMuPDF: {e}")

    # Fallback o PDF oficial con tablas: usar pdfplumber
    return parse_exterior_official_pdfplumber(file_bytes)

def parse_exterior_text_and_annots(doc: pymupdf.Document) -> List[Dict[str, Any]]:
    all_movimientos = []

    for page in doc:
        # 1. Extraer anotaciones FreeText con su posición vertical central
        annots = []
        for a in page.annots():
            content = (a.info.get("content") or "").strip()
            if content:
                m_apto = re.search(r"\b(\d{1,2}-[A-Z0-9]{1,3}|PH-[A-Z0-9]{1,3})\b", content, re.IGNORECASE)
                apto_val = m_apto.group(1).upper() if m_apto else content.split()[0].upper()
                annots.append({
                    "y": (a.rect.y0 + a.rect.y1) / 2.0,
                    "text": apto_val
                })

        # 2. Extraer palabras con bboxes
        words = page.get_text("words")
        if not words:
            continue

        words.sort(key=lambda w: (w[1], w[0]))
        lines = []
        curr_line = []
        curr_y = None

        for w in words:
            wy = (w[1] + w[3]) / 2.0
            if curr_y is None or abs(wy - curr_y) <= 4.0:
                curr_line.append(w)
                curr_y = wy
            else:
                lines.append((curr_y, curr_line))
                curr_line = [w]
                curr_y = wy
        if curr_line:
            lines.append((curr_y, curr_line))

        # 3. Procesar cada renglón
        for line_y, line_words in lines:
            line_str = " ".join([w[4] for w in line_words]).strip()

            tokens = line_str.split()
            date_idx = -1
            for idx, tok in enumerate(tokens):
                if re.match(r"^\d{1,2}/\d{1,2}/\d{2,4}$", tok):
                    date_idx = idx
                    break

            if date_idx == -1:
                continue

            desc_part = " ".join(tokens[:date_idx])
            fecha_part = tokens[date_idx]

            parts_date = fecha_part.split("/")
            if len(parts_date) == 3 and len(parts_date[2]) == 2:
                fecha_part = f"{parts_date[0].zfill(2)}/{parts_date[1].zfill(2)}/20{parts_date[2]}"

            ref_part = tokens[date_idx + 1] if date_idx + 1 < len(tokens) else ""

            monto_val = 0.0
            for tok in tokens[date_idx + 2:]:
                clean_tok = tok.replace("+", "").replace("-", "").strip()
                if re.match(r"^[\d\.,]+$", clean_tok):
                    monto_val = parse_amount(clean_tok)
                    break

            is_intereses = "INTERESES" in desc_part.upper()

            # Alinear anotación cercana si no es intereses
            assigned_apto = ""
            if not is_intereses:
                for a in annots:
                    if abs(a["y"] - line_y) <= 8.0:
                        assigned_apto = a["text"]
                        break

                if not assigned_apto and len(tokens) > date_idx + 2:
                    last_token = tokens[-1].replace("+", "").strip()
                    if re.match(r"^(\d{1,2}-[A-Z0-9]{1,3}|PH-[A-Z0-9]{1,3})$", last_token, re.IGNORECASE):
                        assigned_apto = last_token.upper()

            # Extraer Cédula
            cedula = ""
            ced_m = re.search(r"([VEJG]\d{6,9})", desc_part, re.IGNORECASE)
            if ced_m:
                raw_c = ced_m.group(1).upper()
                cedula = f"{raw_c[0]}-{raw_c[1:]}"

            clean_desc = desc_part
            clean_desc = re.sub(r"^(9742|9734|8014|0720|9048)", r"\1 ", clean_desc)
            clean_desc = re.sub(r"(TRANSF|PAGOM[OÓ]VIL|INTERESES)", r" \1 ", clean_desc)
            clean_desc = re.sub(r"(REC|ATERCEROS|APROVEED)", r" \1 ", clean_desc)
            clean_desc = re.sub(r"([VEJG]\d+)", r" \1", clean_desc)
            clean_desc = clean_text(clean_desc)

            tipo_op = "Transferencia Recibida" if monto_val > 0 else "Cargo Bancario"
            if "PAGOM" in desc_part.upper():
                tipo_op = "Pago Móvil Recibido"
            elif is_intereses:
                tipo_op = "Intereses Ganados"

            all_movimientos.append({
                "fecha": fecha_part,
                "tipo_operacion": tipo_op,
                "descripcion": clean_desc,
                "referencia": ref_part,
                "debe": 0.0,
                "haber": monto_val,
                "saldo": 0.0,
                "emisor_detectado": "",
                "cedula_detectada": cedula,
                "cta_detectada": "",
                "telf_detectado": "",
                "banco_origen": "Banco Exterior",
                "inmueble_asignado_historico": assigned_apto
            })

    return all_movimientos

def parse_exterior_official_pdfplumber(file_bytes: bytes) -> List[Dict[str, Any]]:
    movimientos = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        all_text = ""
        for p in pdf.pages:
            all_text += (p.extract_text() or "") + "\n"

        # Fallback dinámico: si no se puede determinar el período, usar el mes actual
        mes_ano = datetime.now().strftime("%m/%Y")
        lapso_match = re.search(r"Del\s+(\d{1,2})/(\d{1,2})/(\d{2,4})\s+Al", all_text, re.IGNORECASE)
        if lapso_match:
            mes_ano = f"{lapso_match.group(2).zfill(2)}/{lapso_match.group(3)}"

        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue
                header_idx = -1
                col_map = {}
                for idx, row in enumerate(table):
                    row_str = " ".join([str(c or "") for c in row]).lower()
                    if ("día" in row_str or "dia" in row_str) and ("referencia" in row_str) and ("descrip" in row_str):
                        header_idx = idx
                        for col_i, col_name in enumerate(row):
                            c_low = clean_text(col_name).lower()
                            if ("día" in c_low or "dia" in c_low) and "dia" not in col_map:
                                col_map["dia"] = col_i
                            elif "referencia" in c_low:
                                col_map["referencia"] = col_i
                            elif "descrip" in c_low:
                                col_map["descripcion"] = col_i
                            elif "cargos" in c_low:
                                col_map["cargos"] = col_i
                            elif "abonos" in c_low:
                                col_map["abonos"] = col_i
                            elif "saldos" in c_low or "saldo" in c_low:
                                col_map["saldo"] = col_i
                        break

                if header_idx != -1:
                    for r in table[header_idx + 1:]:
                        if not r or len(r) <= max(col_map.values(), default=0):
                            continue
                        dia_val = clean_text(r[col_map.get("dia", 0)])
                        if not dia_val.isdigit() or len(dia_val) > 2:
                            continue

                        fecha = f"{dia_val.zfill(2)}/{mes_ano}"
                        ref = clean_text(r[col_map.get("referencia", 2)])
                        desc = clean_text(r[col_map.get("descripcion", 3)])
                        cargos = parse_amount(r[col_map.get("cargos", 5)]) if "cargos" in col_map else 0.0
                        abonos = parse_amount(r[col_map.get("abonos", 6)]) if "abonos" in col_map else 0.0
                        saldo = parse_amount(r[col_map.get("saldo", 7)]) if "saldo" in col_map else 0.0

                        cedula = ""
                        ced_match = re.search(r"\b([VEJG]-?\d{6,9})\b", desc, re.IGNORECASE)
                        if ced_match:
                            cedula = ced_match.group(1).upper()
                            if "-" not in cedula and len(cedula) > 2:
                                cedula = f"{cedula[0]}-{cedula[1:]}"

                        tipo_op = "Transferencia Recibida" if abonos > 0 else "Cargo Bancario"
                        if "COMISION" in desc.upper() or "COMIS" in desc.upper():
                            tipo_op = "Comisión Bancaria"
                        elif "PAGO MÓVIL" in desc.upper() or "PAGOMOVIL" in desc.upper():
                            tipo_op = "Pago Móvil Recibido"

                        movimientos.append({
                            "fecha": fecha,
                            "tipo_operacion": tipo_op,
                            "descripcion": desc,
                            "referencia": ref,
                            "debe": cargos,
                            "haber": abonos,
                            "saldo": saldo,
                            "emisor_detectado": "",
                            "cedula_detectada": cedula,
                            "cta_detectada": "",
                            "telf_detectado": "",
                            "banco_origen": "Banco Exterior",
                            "inmueble_asignado_historico": ""
                        })

    return movimientos
