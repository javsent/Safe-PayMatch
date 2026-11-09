import io
import re
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas

from server.database import get_connection

def format_currency_ve(amount: float) -> str:
    """Formatea un número con el formato monetario venezolano: 1.234.567,89"""
    if amount is None:
        amount = 0.0
    return f"{amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def get_conciliacion_data(estado_cuenta_id: int):
    conn = get_connection()
    cursor = conn.cursor()

    # Obtener cabecera de estado de cuenta y condominio
    cursor.execute("""
        SELECT ec.id, ec.nombre_archivo, ec.banco, ec.fecha_subida,
               c.nombre as condominio_nombre
        FROM estados_cuenta ec
        JOIN condominios c ON ec.condominio_id = c.id
        WHERE ec.id = ?
    """, (estado_cuenta_id,))
    header_row = cursor.fetchone()
    if not header_row:
        conn.close()
        return None, []

    # Obtener movimientos válidos (excluir filas vacías de monto 0)
    cursor.execute("""
        SELECT m.id, m.fecha, m.referencia, m.descripcion, m.debe, m.haber,
               m.estado_conciliacion, m.clasificacion_especial,
               i_conf.identificador as inmueble_confirmado,
               i_sug.identificador as inmueble_sugerido
        FROM movimientos m
        LEFT JOIN inmuebles i_conf ON m.inmueble_confirmado_id = i_conf.id
        LEFT JOIN inmuebles i_sug ON m.inmueble_sugerido_id = i_sug.id
        WHERE m.estado_cuenta_id = ?
          AND (m.haber > 0 OR (m.debe > 0 AND m.estado_conciliacion = 'confirmado'))
        ORDER BY m.id ASC
    """, (estado_cuenta_id,))
    rows = cursor.fetchall()
    conn.close()

    movimientos = []
    total_monto = 0.0

    for r in rows:
        haber = float(r["haber"] or 0.0)
        debe = float(r["debe"] or 0.0)
        monto = haber if haber > 0 else -debe

        if r["estado_conciliacion"] == "confirmado":
            if r["inmueble_confirmado"]:
                inmueble_label = r["inmueble_confirmado"]
                if r["clasificacion_especial"] and r["clasificacion_especial"] not in ("No Aplica", "No Identificado"):
                    inmueble_label += f" ({r['clasificacion_especial']})"
            elif r["clasificacion_especial"] == "No Identificado":
                inmueble_label = "No Identificado"
            else:
                inmueble_label = "No Aplica"
                if r["clasificacion_especial"] and r["clasificacion_especial"] not in ("No Aplica", "No Identificado"):
                    inmueble_label += f" ({r['clasificacion_especial']})"
        else:
            inmueble_label = r["inmueble_sugerido"] or "Sin Asignar"
            if r["clasificacion_especial"]:
                inmueble_label += f" ({r['clasificacion_especial']})"

        desc_limpia = re.sub(r"\s+", " ", r["descripcion"] or "").strip()
        if not desc_limpia:
            desc_limpia = "Pago / Transferencia Bancaria"

        movimientos.append({
            "fecha": r["fecha"] or "",
            "referencia": r["referencia"] or "",
            "concepto": desc_limpia,
            "monto": monto,
            "inmueble": inmueble_label
        })
        total_monto += monto

    return dict(header_row), movimientos, total_monto


def generate_conciliacion_excel(estado_cuenta_id: int) -> io.BytesIO:
    header_info, movimientos, total_monto = get_conciliacion_data(estado_cuenta_id)
    if not header_info:
        raise ValueError(f"Estado de cuenta {estado_cuenta_id} no encontrado")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Conciliación"

    # Fuentes
    title_font = Font(name="Segoe UI", size=14, bold=True, color="0F172A")
    subtitle_font = Font(name="Segoe UI", size=10, color="475569")
    header_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
    data_font = Font(name="Segoe UI", size=10, color="1E293B")
    bold_data_font = Font(name="Segoe UI", size=10, bold=True, color="0F172A")
    total_font = Font(name="Segoe UI", size=11, bold=True, color="0F172A")

    # Fills
    header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    alt_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    total_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")

    # Bordes
    thin_side = Side(style="thin", color="CBD5E1")
    light_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
    double_bottom = Side(style="double", color="0F172A")
    top_thick = Side(style="medium", color="0F172A")
    total_border = Border(top=top_thick, bottom=double_bottom, left=thin_side, right=thin_side)

    # 1. Cabecera del documento
    condo_nombre = header_info.get("condominio_nombre", "Condominio").upper()
    ws["A1"] = f"{condo_nombre}"
    ws["A1"].font = title_font
    ws.merge_cells("A1:E1")

    banco = header_info.get("banco", "BNC / Exterior")
    fecha_hoy = datetime.now().strftime("%d/%m/%Y")
    ws["A2"] = f"Relación de Pagos Conciliados • Banco: {banco} • Emisión: {fecha_hoy} • Total Pagos: {len(movimientos)}"
    ws["A2"].font = subtitle_font
    ws.merge_cells("A2:E2")

    ws.row_dimensions[1].height = 24
    ws.row_dimensions[2].height = 18
    ws.row_dimensions[3].height = 10 # Fila vacía

    # 2. Encabezados de tabla (Fila 4) - Exactamente las 5 columnas solicitadas
    headers = ["Fecha", "Referencia", "Concepto", "Monto", "Inmueble"]
    for col_idx, col_name in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col_idx, value=col_name)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = light_border
        if col_name == "Monto":
            cell.alignment = Alignment(horizontal="right", vertical="center")
        elif col_name in ["Fecha", "Referencia", "Inmueble"]:
            cell.alignment = Alignment(horizontal="center", vertical="center")
        else:
            cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[4].height = 24

    # 3. Filas de datos
    current_row = 5
    for m in movimientos:
        row_data = [
            m["fecha"],
            m["referencia"],
            m["concepto"],
            m["monto"],
            m["inmueble"]
        ]
        is_even = (current_row % 2 == 0)

        for col_idx, val in enumerate(row_data, 1):
            cell = ws.cell(row=current_row, column=col_idx, value=val)
            cell.border = light_border
            if is_even:
                cell.fill = alt_fill

            if col_idx == 1: # Fecha
                cell.font = data_font
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx == 2: # Referencia
                cell.font = data_font
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.number_format = "@" # Formato texto
            elif col_idx == 3: # Concepto
                cell.font = data_font
                cell.alignment = Alignment(horizontal="left", vertical="center")
            elif col_idx == 4: # Monto
                cell.font = bold_data_font
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = "#,##0.00"
            elif col_idx == 5: # Inmueble
                cell.font = bold_data_font
                cell.alignment = Alignment(horizontal="center", vertical="center")

        ws.row_dimensions[current_row].height = 20
        current_row += 1

    # 4. Fila de Total
    total_row = current_row
    ws.cell(row=total_row, column=1, value="")
    ws.cell(row=total_row, column=2, value="")
    cell_tot_lbl = ws.cell(row=total_row, column=3, value=f"TOTAL GENERAL ({len(movimientos)} PAGOS)")
    cell_tot_lbl.font = total_font
    cell_tot_lbl.alignment = Alignment(horizontal="right", vertical="center")

    cell_tot_val = ws.cell(row=total_row, column=4, value=f"=SUM(D5:D{total_row - 1})")
    cell_tot_val.font = total_font
    cell_tot_val.alignment = Alignment(horizontal="right", vertical="center")
    cell_tot_val.number_format = "#,##0.00"

    ws.cell(row=total_row, column=5, value="")

    for c in range(1, 6):
        ws.cell(row=total_row, column=c).fill = total_fill
        ws.cell(row=total_row, column=c).border = total_border

    ws.row_dimensions[total_row].height = 26

    # Ajustar ancho de columnas para impresión perfecta
    col_widths = {
        "A": 14, # Fecha
        "B": 18, # Referencia
        "C": 48, # Concepto
        "D": 20, # Monto
        "E": 18  # Inmueble
    }
    for col_letter, width in col_widths.items():
        ws.column_dimensions[col_letter].width = width

    # Configuración de página para impresión
    ws.page_setup.orientation = ws.ORIENTATION_PORTRAIT
    ws.page_setup.paperSize = ws.PAPERSIZE_LETTER
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_setup.fitToPage = True

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


class NumberedCanvas(canvas.Canvas):
    """Canvas de ReportLab de 2 pasadas para numerar páginas dinámicamente: Página X de Y"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_footer(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_footer(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        # Línea separadora
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.5)
        self.line(36, 32, 576, 32)

        self.drawString(36, 20, "Safe-PayMatch • Conciliación Bancaria Residencial • Carpeta Contable")
        self.drawRightString(576, 20, f"Página {self._pageNumber} de {page_count}")
        self.restoreState()


def generate_conciliacion_pdf(estado_cuenta_id: int) -> io.BytesIO:
    header_info, movimientos, total_monto = get_conciliacion_data(estado_cuenta_id)
    if not header_info:
        raise ValueError(f"Estado de cuenta {estado_cuenta_id} no encontrado")

    buf = io.BytesIO()
    # Márgenes de 36pt (0.5 pulgada) para aprovechar el ancho (540pt imprimibles en carta)
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()

    # Estilos tipográficos refinados (White Signifier)
    style_kicker = ParagraphStyle(
        "Kicker",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#64748B"),
        alignment=0,
        spaceAfter=2
    )

    style_title = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#0F172A"),
        alignment=0,
        spaceAfter=4
    )

    style_sub = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
        alignment=0,
        spaceAfter=12
    )

    style_th_left = ParagraphStyle(
        "THLeft",
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
        alignment=0
    )
    style_th_center = ParagraphStyle(
        "THCenter",
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
        alignment=1
    )
    style_th_right = ParagraphStyle(
        "THRight",
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
        alignment=2
    )

    style_td_desc = ParagraphStyle(
        "TDDesc",
        fontName="Helvetica",
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#1E293B"),
        alignment=0
    )
    style_td_center = ParagraphStyle(
        "TDCenter",
        fontName="Helvetica",
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#334155"),
        alignment=1
    )
    style_td_inm = ParagraphStyle(
        "TDInm",
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0F172A"),
        alignment=1
    )
    style_td_monto = ParagraphStyle(
        "TDMonto",
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0F172A"),
        alignment=2
    )

    style_total_lbl = ParagraphStyle(
        "TotalLbl",
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#0F172A"),
        alignment=2
    )

    story = []

    # 1. Cabecera institucional
    condo_nombre = header_info.get("condominio_nombre", "Condominio").upper()
    story.append(Paragraph("REPORTE OFICIAL DE CONCILIACIÓN BANCARIA", style_kicker))
    story.append(Paragraph(condo_nombre, style_title))

    banco = header_info.get("banco", "Banco Exterior / BNC")
    fecha_emision = datetime.now().strftime("%d/%m/%Y")
    sub_text = f"Relación de Pagos e Ingresos Conciliados • Banco: <b>{banco}</b> • Fecha de Emisión: <b>{fecha_emision}</b>"
    story.append(Paragraph(sub_text, style_sub))

    # 2. Caja resumen de métricas (KPIs limpios)
    kpi_data = [
        [
            Paragraph(f"<font size=8 color='#64748B'>PAGOS CONCILIADOS</font><br/><b><font size=13 color='#0F172A'>{len(movimientos)}</font></b>", styles["Normal"]),
            Paragraph(f"<font size=8 color='#64748B'>BANCO EMISOR</font><br/><b><font size=11 color='#0F172A'>{banco}</font></b>", styles["Normal"]),
            Paragraph(f"<font size=8 color='#64748B'>TOTAL RECAUDADO (BS.)</font><br/><b><font size=14 color='#0F172A'>Bs. {format_currency_ve(total_monto)}</font></b>", styles["Normal"]),
        ]
    ]
    kpi_table = Table(kpi_data, colWidths=[150, 160, 230])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 14))

    # 3. Tabla principal con exactamente 5 columnas: Fecha, Referencia, Concepto, Monto, Inmueble
    # Anchos: 60 + 75 + 230 + 95 + 80 = 540 pt
    table_data = [
        [
            Paragraph("FECHA", style_th_center),
            Paragraph("REFERENCIA", style_th_center),
            Paragraph("CONCEPTO", style_th_left),
            Paragraph("MONTO (BS.)", style_th_right),
            Paragraph("INMUEBLE", style_th_center),
        ]
    ]

    for m in movimientos:
        table_data.append([
            Paragraph(m["fecha"], style_td_center),
            Paragraph(m["referencia"], style_td_center),
            Paragraph(m["concepto"], style_td_desc),
            Paragraph(format_currency_ve(m["monto"]), style_td_monto),
            Paragraph(m["inmueble"], style_td_inm),
        ])

    # Fila de totales al pie de la tabla
    table_data.append([
        "",
        "",
        Paragraph(f"TOTAL CONCILIADO ({len(movimientos)} PAGOS)", style_total_lbl),
        Paragraph(f"Bs. {format_currency_ve(total_monto)}", style_td_monto),
        ""
    ])

    col_widths = [60, 75, 230, 95, 80]
    t = Table(table_data, colWidths=col_widths, repeatRows=1)

    t_style = [
        # Encabezado
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),

        # Líneas internas finas
        ('LINEBELOW', (0, 1), (-1, -2), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 1), (-1, -2), 4),
        ('BOTTOMPADDING', (0, 1), (-1, -2), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),

        # Fila de totales
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#F1F5F9")),
        ('LINEABOVE', (0, -1), (-1, -1), 1.2, colors.HexColor("#0F172A")),
        ('LINEBELOW', (0, -1), (-1, -1), 1.2, colors.HexColor("#0F172A")),
        ('TOPPADDING', (0, -1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 6),
    ]

    # Zebra striping para filas de datos
    for i in range(1, len(movimientos) + 1):
        if i % 2 == 0:
            t_style.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor("#F8FAFC")))

    t.setStyle(TableStyle(t_style))
    story.append(t)

    doc.build(story, canvasmaker=NumberedCanvas)
    buf.seek(0)
    return buf


# ---------------------------------------------------------------------------
# EXPORTADORES DE REPORTES CONSOLIDADOS Y PERSONALIZADOS (DESDE CARPETAS)
# ---------------------------------------------------------------------------

def generate_custom_report_excel(
    condominio_nombre: str,
    movimientos: list,
    titulo_reporte: str = "Reporte Consolidado de Movimientos",
    subtitulo_filtros: str = ""
) -> io.BytesIO:
    """
    Genera un archivo Excel profesional con los movimientos filtrados y seleccionados
    por el usuario desde la vista general de carpetas.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Reporte de Conciliación"
    ws.views.sheetView[0].showGridLines = True

    # Paleta de Colores Corporativa
    NAVY_HEADER = "0F172A"
    ZEBRA_COLOR = "F8FAFC"
    BORDER_COLOR = "E2E8F0"
    TOTAL_BG = "F1F5F9"

    title_font = Font(name="Segoe UI", size=15, bold=True, color="0F172A")
    meta_font = Font(name="Segoe UI", size=9, bold=False, color="64748B")
    header_font = Font(name="Segoe UI", size=9, bold=True, color="FFFFFF")
    data_font = Font(name="Segoe UI", size=9, color="0F172A")
    total_font = Font(name="Segoe UI", size=10, bold=True, color="0F172A")

    header_fill = PatternFill(start_color=NAVY_HEADER, end_color=NAVY_HEADER, fill_type="solid")
    zebra_fill = PatternFill(start_color=ZEBRA_COLOR, end_color=ZEBRA_COLOR, fill_type="solid")
    total_fill = PatternFill(start_color=TOTAL_BG, end_color=TOTAL_BG, fill_type="solid")

    thin_border = Border(
        left=Side(style="thin", color=BORDER_COLOR),
        right=Side(style="thin", color=BORDER_COLOR),
        top=Side(style="thin", color=BORDER_COLOR),
        bottom=Side(style="thin", color=BORDER_COLOR)
    )
    total_border = Border(
        top=Side(style="thin", color=NAVY_HEADER),
        bottom=Side(style="double", color=NAVY_HEADER)
    )

    # Fila 1: Título Principal
    ws.merge_cells("A1:E1")
    cell_title = ws["A1"]
    cell_title.value = f"{condominio_nombre.upper()} • {titulo_reporte.upper()}"
    cell_title.font = title_font
    cell_title.alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 26

    # Fila 2: Subtítulo con rango y filtros
    ws.merge_cells("A2:E2")
    cell_meta = ws["A2"]
    sub_text = f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    if subtitulo_filtros:
        sub_text += f" | {subtitulo_filtros}"
    sub_text += f" | Total transacciones: {len(movimientos)}"
    cell_meta.value = sub_text
    cell_meta.font = meta_font
    cell_meta.alignment = Alignment(vertical="center")
    ws.row_dimensions[2].height = 18

    # Fila 3: Espaciador
    ws.row_dimensions[3].height = 8

    # Fila 4: Encabezados de Columna
    headers = ["FECHA", "REFERENCIA", "CONCEPTO / DETALLE", "MONTO (BS.)", "INMUEBLE / ESTADO"]
    for col_idx, h_text in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col_idx, value=h_text)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(
            horizontal="right" if col_idx == 4 else ("center" if col_idx in [1, 2, 5] else "left"),
            vertical="center"
        )
    ws.row_dimensions[4].height = 22

    # Filas de Datos
    curr_row = 5
    total_monto = 0.0

    for m in movimientos:
        monto_val = float(m.get("monto", 0.0) or 0.0)
        total_monto += monto_val

        r_cells = [
            ws.cell(row=curr_row, column=1, value=m.get("fecha", "")),
            ws.cell(row=curr_row, column=2, value=m.get("referencia", "")),
            ws.cell(row=curr_row, column=3, value=m.get("concepto", "")),
            ws.cell(row=curr_row, column=4, value=monto_val),
            ws.cell(row=curr_row, column=5, value=m.get("inmueble", "")),
        ]

        is_zebra = (curr_row % 2 == 0)
        for c_idx, c in enumerate(r_cells, 1):
            c.font = data_font
            c.border = thin_border
            if is_zebra:
                c.fill = zebra_fill

            if c_idx in [1, 2]:
                c.alignment = Alignment(horizontal="center", vertical="center")
            elif c_idx == 3:
                c.alignment = Alignment(horizontal="left", vertical="center")
            elif c_idx == 4:
                c.alignment = Alignment(horizontal="right", vertical="center")
                c.number_format = "#,##0.00"
            elif c_idx == 5:
                c.alignment = Alignment(horizontal="center", vertical="center")

        ws.row_dimensions[curr_row].height = 20
        curr_row += 1

    # Fila de Totales
    total_row = curr_row
    ws.cell(row=total_row, column=1, value="")
    ws.cell(row=total_row, column=2, value="")
    cell_tot_lbl = ws.cell(row=total_row, column=3, value=f"TOTAL ({len(movimientos)} PAGOS)")
    cell_tot_lbl.font = total_font
    cell_tot_lbl.alignment = Alignment(horizontal="right", vertical="center")

    cell_tot_val = ws.cell(row=total_row, column=4, value=total_monto)
    cell_tot_val.font = total_font
    cell_tot_val.alignment = Alignment(horizontal="right", vertical="center")
    cell_tot_val.number_format = "#,##0.00"

    ws.cell(row=total_row, column=5, value="")

    for c in range(1, 6):
        ws.cell(row=total_row, column=c).fill = total_fill
        ws.cell(row=total_row, column=c).border = total_border

    ws.row_dimensions[total_row].height = 26

    # Ajustar ancho de columnas
    col_widths = {"A": 14, "B": 18, "C": 48, "D": 20, "E": 20}
    for col_letter, width in col_widths.items():
        ws.column_dimensions[col_letter].width = width

    ws.page_setup.orientation = ws.ORIENTATION_PORTRAIT
    ws.page_setup.paperSize = ws.PAPERSIZE_LETTER
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_setup.fitToPage = True

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


def generate_custom_report_pdf(
    condominio_nombre: str,
    movimientos: list,
    titulo_reporte: str = "Reporte Consolidado de Movimientos",
    subtitulo_filtros: str = ""
) -> io.BytesIO:
    """
    Genera un informe formal en PDF listo para junta o asamblea con los movimientos
    seleccionados y depurados por el usuario.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()

    style_kicker = ParagraphStyle(
        "CustomKicker",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=2
    )
    style_title = ParagraphStyle(
        "CustomTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=3
    )
    style_meta = ParagraphStyle(
        "CustomMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#475569")
    )
    style_th = ParagraphStyle(
        "CustomTH",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9,
        textColor=colors.white,
        alignment=0
    )
    style_th_center = ParagraphStyle(
        "CustomTHCenter",
        parent=style_th,
        alignment=1
    )
    style_th_right = ParagraphStyle(
        "CustomTHRight",
        parent=style_th,
        alignment=2
    )
    style_td_center = ParagraphStyle(
        "CustomTDCenter",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        alignment=1,
        textColor=colors.HexColor("#0F172A")
    )
    style_td_desc = ParagraphStyle(
        "CustomTDDesc",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        alignment=0,
        textColor=colors.HexColor("#1E293B")
    )
    style_td_monto = ParagraphStyle(
        "CustomTDMonto",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        alignment=2,
        textColor=colors.HexColor("#0F172A")
    )
    style_td_inm = ParagraphStyle(
        "CustomTDInm",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        alignment=1,
        textColor=colors.HexColor("#0F172A")
    )
    style_total_lbl = ParagraphStyle(
        "CustomTotalLbl",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        alignment=2,
        textColor=colors.HexColor("#0F172A")
    )

    story = []

    # Cabecera
    story.append(Paragraph(f"CONDOMINIO • {condominio_nombre.upper()}", style_kicker))
    story.append(Paragraph(titulo_reporte, style_title))

    meta_parts = [f"Emitido el {datetime.now().strftime('%d/%m/%Y a las %H:%M')}"]
    if subtitulo_filtros:
        meta_parts.append(subtitulo_filtros)
    meta_parts.append(f"{len(movimientos)} transacciones registradas")
    story.append(Paragraph(" • ".join(meta_parts), style_meta))
    story.append(Spacer(1, 14))

    # Construir tabla
    table_data = [
        [
            Paragraph("FECHA", style_th_center),
            Paragraph("REFERENCIA", style_th_center),
            Paragraph("CONCEPTO / DETALLE", style_th),
            Paragraph("MONTO (BS.)", style_th_right),
            Paragraph("INMUEBLE / ESTADO", style_th_center),
        ]
    ]

    total_monto = 0.0
    for m in movimientos:
        monto_val = float(m.get("monto", 0.0) or 0.0)
        total_monto += monto_val
        table_data.append([
            Paragraph(str(m.get("fecha", "")), style_td_center),
            Paragraph(str(m.get("referencia", "")), style_td_center),
            Paragraph(str(m.get("concepto", "")), style_td_desc),
            Paragraph(format_currency_ve(monto_val), style_td_monto),
            Paragraph(str(m.get("inmueble", "")), style_td_inm),
        ])

    # Fila de totales
    table_data.append([
        "",
        "",
        Paragraph(f"TOTAL REPORTADO ({len(movimientos)} PAGOS)", style_total_lbl),
        Paragraph(f"Bs. {format_currency_ve(total_monto)}", style_td_monto),
        ""
    ])

    col_widths = [60, 75, 230, 95, 80]
    t = Table(table_data, colWidths=col_widths, repeatRows=1)

    t_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('LINEBELOW', (0, 1), (-1, -2), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 1), (-1, -2), 4),
        ('BOTTOMPADDING', (0, 1), (-1, -2), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#F1F5F9")),
        ('LINEABOVE', (0, -1), (-1, -1), 1.2, colors.HexColor("#0F172A")),
        ('LINEBELOW', (0, -1), (-1, -1), 1.2, colors.HexColor("#0F172A")),
        ('TOPPADDING', (0, -1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 6),
    ]

    for i in range(1, len(movimientos) + 1):
        if i % 2 == 0:
            t_style.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor("#F8FAFC")))

    t.setStyle(TableStyle(t_style))
    story.append(t)

    doc.build(story, canvasmaker=NumberedCanvas)
    buf.seek(0)
    return buf

