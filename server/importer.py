import re
import io
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
import pdfplumber
from typing import List, Dict, Any, Tuple
from server.database import get_connection

def generate_excel_template() -> io.BytesIO:
    """
    Genera un archivo XLSX formateado profesionalmente para que el usuario complete e importe inmuebles.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Inmuebles"

    # Encabezados
    headers = [
        ("Nro. Inmueble", "Obligatorio (ej: 01-A, PB-4, 15-C)"),
        ("Nombre del Propietario", "Obligatorio (Nombre y apellido)"),
        ("Inquilino", "Opcional (si aplica)"),
        ("Teléfonos", "Opcional (ej: 04141234567, 0424...)"),
        ("Email", "Opcional (uno o varios separados por ;)"),
        ("Otros Datos / Cédula", "Opcional (ej: Cédula V-12345678, notas de pago)")
    ]

    # Estilos White Signifier (Minimalista, sobrio)
    header_fill = PatternFill(start_color="111110", end_color="111110", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    thin_border = Border(
        left=Side(style='thin', color='E5E5E5'),
        right=Side(style='thin', color='E5E5E5'),
        top=Side(style='thin', color='E5E5E5'),
        bottom=Side(style='thin', color='E5E5E5')
    )

    for col_idx, (col_name, _) in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # Filas de ejemplo instructivas
    ejemplos = [
        ["01-A", "CARLOS ANDRES PEREZ", "", "04141234567", "carlos.perez@gmail.com", "V-12345678"],
        ["02-B", "YOSRA AL-KHOURI", "SANDRA GUEDEZ", "04247654321", "s.guedez@gmail.com", "Sandra Guedez realiza los pagos habituales"],
        ["03-C", "MARIA DEL VALLE ROJAS", "", "04129876543", "valle.rojas@hotmail.com", "V-18765432 Cédula titular"]
    ]

    example_font = Font(name="Segoe UI", size=10, color="262626")
    for row_idx, row_data in enumerate(ejemplos, 2):
        for col_idx, val in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = example_font
            cell.border = thin_border
            cell.alignment = Alignment(vertical="center")

    # Ajustar ancho de columnas
    col_widths = [18, 32, 22, 20, 32, 38]
    for idx, width in enumerate(col_widths, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(idx)].width = width

    ws.row_dimensions[1].height = 28

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output

def parse_gc_middle_fields(raw_text: str) -> Tuple[str, str]:
    """
    Analiza inteligentemente las columnas intermedias (RFC, CURP, Teléfonos) del reporte GC.
    Determina si el contenido es teléfono, cédula, o ambos, evitando clasificar
    números telefónicos (0414, 0424, 0034, etc.) como cédulas.
    """
    if not raw_text:
        return "", ""

    text = raw_text.strip()
    phone = ""
    cedula = ""

    # 1. Manejar notación científica si viene exportada así (ej: '3,5193903793 e+0', '5,8424...e+011')
    sci_match = re.search(r"(\d+)[,.](\d+)e\+?(\d+)?", text.replace(" ", ""))
    if sci_match:
        digits = sci_match.group(1) + sci_match.group(2)
        if digits.startswith("584"):
            phone = "04" + digits[3:11]
        elif digits.startswith("351"):
            phone = "+" + digits[:12]
        else:
            phone = digits[:12]
        text = text[:sci_match.start()] + " " + text[sci_match.end():]

    # 2. Extraer Cédula si viene explícita (V-12345678, V4.880.409, E-..., J-..., etc.)
    # Excluyendo números que empiezan por 04xx o 02xx con prefijo V accidental (ej: V0414-xxx)
    m_ced = re.search(r"\b([VEJG])\s*[-.]?\s*(\d{1,3}(?:\.\d{3}){1,3}|\d{5,8})\b", text, re.IGNORECASE)
    if m_ced:
        ced_num = m_ced.group(2).replace(".", "")
        if not (ced_num.startswith(("04", "02")) and len(ced_num) >= 9):
            ced_letter = m_ced.group(1).upper()
            cedula = f"{ced_letter}-{ced_num}"
            # Quitar la cédula encontrada para procesar el teléfono restante
            text = text[:m_ced.start()] + " " + text[m_ced.end():]

    # 3. Extraer teléfono del texto restante
    if not phone and text.strip():
        # Limpiar V accidental antes de teléfono (ej: V0414-...)
        clean_text = re.sub(r"\bV(?=0?4\d{2})", "", text, flags=re.IGNORECASE).strip()

        # Teléfonos móviles y fijos venezolanos
        m_ve = re.search(r"(\+?58\s*[-.]?\s*)?(0?4(?:14|24|12|16|26)\s*[-.]?\s*\d{3}\s*[-.]?\s*\d{4})", clean_text)
        if m_ve:
            raw_ph = m_ve.group(0)
            digits = re.sub(r"[^0-9]", "", raw_ph)
            if digits.startswith("58"):
                digits = "0" + digits[2:]
            elif not digits.startswith("0") and len(digits) == 10:
                digits = "0" + digits
            phone = digits
        else:
            # Teléfonos internacionales (0034..., 0057..., +57..., 3467...)
            m_intl = re.search(r"(\+?\d{1,4}\s*[-.]?\s*\d{6,12})", clean_text)
            if m_intl:
                phone = re.sub(r"\s+", "", m_intl.group(0))
            else:
                rem_digits = re.sub(r"[^0-9]", "", clean_text)
                if len(rem_digits) >= 7:
                    phone = rem_digits

    return cedula, phone

def parse_gc_condominio_pdf(file_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Parser robusto por coordenadas para reportes de propietarios de 'GC Gestión de Condominios'.
    """
    inmuebles = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            words = page.extract_words()
            # Filtrar encabezado y pie de página
            data_words = [w for w in words if 80 <= w["top"] <= 535]

            # Detectar identificadores de inmuebles en la primera columna (x < 80)
            id_words = [
                w for w in data_words
                if w["x0"] < 80 and re.match(r"^(\d{1,2}-[A-Z0-9]{1,3}|PH-[A-Z0-9]{1,3}|[A-Z0-9]{1,4}-[A-Z0-9]{1,4})$", w["text"])
            ]
            id_words.sort(key=lambda w: w["top"])

            for idx, id_w in enumerate(id_words):
                inm_id = id_w["text"].strip().upper()
                row_top = id_w["top"] - 4
                next_top = id_words[idx + 1]["top"] - 4 if idx + 1 < len(id_words) else 535

                row_words = [w for w in data_words if row_top <= w["top"] < next_top]

                # Segmentación inteligente de columnas
                prop_words = [w["text"] for w in row_words if 78 <= w["x0"] < 225]
                middle_words = [w["text"] for w in row_words if 220 <= w["x0"] < 435]
                email_words = [w["text"] for w in row_words if 435 <= w["x0"] < 580]

                propietario = " ".join(prop_words).strip()
                middle_text = " ".join(middle_words).strip()

                cedula, telefonos = parse_gc_middle_fields(middle_text)

                email_text = "".join(email_words)
                email_list = [em.strip() for em in email_text.split(";") if "@" in em]
                emails = "; ".join(email_list) if email_list else email_text

                otros_datos = f"Cédula {cedula}" if cedula else ""

                if inm_id and propietario:
                    inmuebles.append({
                        "identificador": inm_id,
                        "propietario": propietario,
                        "inquilino": "",
                        "telefonos": telefonos,
                        "email": emails,
                        "otros_datos": otros_datos,
                        "cedula": cedula
                    })

    return inmuebles

def parse_excel_template(file_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Parser para la plantilla oficial de Excel completada por el usuario.
    """
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows or len(rows) < 2:
        return []

    header = [str(c or "").lower() for c in rows[0]]
    col_map = {}
    for idx, h in enumerate(header):
        if "inmueble" in h or "apto" in h or "apartamento" in h:
            col_map["identificador"] = idx
        elif "propietario" in h or "nombre" in h:
            col_map["propietario"] = idx
        elif "inquilino" in h:
            col_map["inquilino"] = idx
        elif "tel" in h:
            col_map["telefonos"] = idx
        elif "email" in h or "correo" in h:
            col_map["email"] = idx
        elif "otros" in h or "nota" in h or "cédula" in h or "cedula" in h:
            col_map["otros_datos"] = idx

    inmuebles = []
    for r in rows[1:]:
        identificador = str(r[col_map.get("identificador", 0)] or "").strip()
        propietario = str(r[col_map.get("propietario", 1)] or "").strip()

        # Ignorar filas vacías, comentarios, o filas de ejemplo de la plantilla
        EXAMPLE_PROPIETARIOS = {"CARLOS ANDRES PEREZ", "YOSRA AL-KHOURI", "MARIA DEL VALLE ROJAS"}
        if (not identificador or not propietario
                or identificador.lower().startswith("ejemplo")
                or propietario.upper() in EXAMPLE_PROPIETARIOS):
            continue

        inquilino = str(r[col_map.get("inquilino", 2)] or "").strip() if "inquilino" in col_map else ""
        telefonos = str(r[col_map.get("telefonos", 3)] or "").strip() if "telefonos" in col_map else ""
        email = str(r[col_map.get("email", 4)] or "").strip() if "email" in col_map else ""
        otros = str(r[col_map.get("otros_datos", 5)] or "").strip() if "otros_datos" in col_map else ""

        # Extraer cédula de otros_datos si viene anotada
        ced_match = re.search(r"\b([VEJG]-?\d{6,9})\b", otros, re.IGNORECASE)
        cedula = ced_match.group(1).upper() if ced_match else ""

        inmuebles.append({
            "identificador": identificador.upper(),
            "propietario": propietario,
            "inquilino": inquilino,
            "telefonos": telefonos,
            "email": email,
            "otros_datos": otros,
            "cedula": cedula
        })

    return inmuebles

def save_imported_inmuebles(condominio_id: int, inmuebles_list: List[Dict[str, Any]]) -> Dict[str, int]:
    """
    Inserta o actualiza en la base de datos la lista de inmuebles y genera sus tokens aprendidos.
    """
    conn = get_connection()
    cursor = conn.cursor()

    creados = 0
    actualizados = 0

    for inm in inmuebles_list:
        identificador = inm["identificador"].strip().upper()
        propietario = inm["propietario"].strip()
        inquilino = inm.get("inquilino", "").strip()
        telefonos = inm.get("telefonos", "").strip()
        email = inm.get("email", "").strip()
        otros = inm.get("otros_datos", "").strip()
        cedula = inm.get("cedula", "").strip()

        cursor.execute("""
            SELECT id FROM inmuebles WHERE condominio_id = ? AND identificador = ?
        """, (condominio_id, identificador))
        row = cursor.fetchone()

        if row:
            inm_id = row["id"]
            cursor.execute("""
                UPDATE inmuebles
                SET propietario = ?, inquilino = ?, telefonos = ?, email = ?, otros_datos = ?
                WHERE id = ?
            """, (propietario, inquilino, telefonos, email, otros, inm_id))
            actualizados += 1
        else:
            cursor.execute("""
                INSERT INTO inmuebles (condominio_id, identificador, propietario, inquilino, telefonos, email, otros_datos)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (condominio_id, identificador, propietario, inquilino, telefonos, email, otros))
            inm_id = cursor.lastrowid
            creados += 1

        # Si tenemos cédula, insertarla directamente en tokens_aprendidos
        if cedula:
            ced_clean = re.sub(r"[^0-9]", "", cedula)
            if len(ced_clean) >= 6:
                cursor.execute("""
                    INSERT INTO tokens_aprendidos (inmueble_id, tipo_token, valor_normalizado, frecuencia_confirmada, peso_confianza)
                    VALUES (?, 'cedula', ?, 2, 1.8)
                    ON CONFLICT(inmueble_id, tipo_token, valor_normalizado) DO NOTHING
                """, (inm_id, ced_clean))

        # Si tenemos teléfonos, registrar tokens de teléfono para el conciliador
        if telefonos:
            for t_raw in re.findall(r"\d{7,12}", telefonos):
                t_clean = t_raw[-10:] if len(t_raw) >= 10 else t_raw
                if len(t_clean) >= 7 and t_clean != "0000000":
                    cursor.execute("""
                        INSERT INTO tokens_aprendidos (inmueble_id, tipo_token, valor_normalizado, frecuencia_confirmada, peso_confianza)
                        VALUES (?, 'telefono', ?, 2, 1.8)
                        ON CONFLICT(inmueble_id, tipo_token, valor_normalizado) DO NOTHING
                    """, (inm_id, t_clean))

    conn.commit()
    conn.close()

    return {"creados": creados, "actualizados": actualizados, "total": len(inmuebles_list)}
