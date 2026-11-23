import re
from datetime import datetime, date
from typing import List, Dict, Any, Tuple, Optional

MESES_ES = {
    "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
    "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
    "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
    5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
    9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
}

def clean_date_str(val: Any) -> str:
    """Extrae la cadena limpia de una celda o valor de fecha eliminando horas y saltos de línea."""
    if val is None:
        return ""
    if isinstance(val, (datetime, date)):
        return f"{val.day:02d}/{val.month:02d}/{val.year:04d}"

    s = str(val).strip()
    if not s:
        return ""

    # Si vienen saltos de línea (ej: "30/10\n31/10"), tomar la primera línea no vacía
    if "\n" in s or "\r" in s:
        lines = [line.strip() for line in re.split(r"[\r\n]+", s) if line.strip()]
        s = lines[0] if lines else ""

    # Eliminar marcas de tiempo como 00:00:00, 12:56PM, 4:54 PM, 14:30:15
    s = re.sub(r"[T\s]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?.*$", "", s)
    s = re.sub(r"\s+\d{1,2}:\d{2}.*$", "", s)
    return s.strip()


def parse_and_normalize_date(
    val: Any,
    default_year: Optional[int] = None,
    format_hint: str = "dmy"
) -> str:
    """
    Normaliza cualquier representación de fecha a formato estándar DD/MM/YYYY.
    Aplica por defecto la convención bancaria venezolana/latinoamericana (DD/MM/YYYY).
    """
    if val is None:
        return ""

    if isinstance(val, (datetime, date)):
        return f"{val.day:02d}/{val.month:02d}/{val.year:04d}"

    # Soporte para números seriales de Excel (ej: 45233)
    if isinstance(val, (int, float)) and 35000 <= val <= 65000:
        try:
            # Excel base date is 1899-12-30 due to the 1900 leap year bug
            from datetime import timedelta
            excel_base = datetime(1899, 12, 30)
            d_obj = excel_base + timedelta(days=int(val))
            return f"{d_obj.day:02d}/{d_obj.month:02d}/{d_obj.year:04d}"
        except Exception:
            pass

    s = clean_date_str(val)
    if not s:
        return ""

    # 1. Caso ISO: YYYY-MM-DD o YYYY/MM/DD
    m_iso = re.match(r"^(\d{4})[/\-\.](\d{1,2})[/\-\.](\d{1,2})$", s)
    if m_iso:
        y, m, d = int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3))
        if 1 <= m <= 12 and 1 <= d <= 31:
            return f"{d:02d}/{m:02d}/{y:04d}"

    # 2. Caso estándar de 3 componentes: D/M/Y o M/D/Y (con /, - o .)
    m_tri = re.match(r"^(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})$", s)
    if m_tri:
        p1, p2, p3 = int(m_tri.group(1)), int(m_tri.group(2)), int(m_tri.group(3))
        # Normalizar año de 2 dígitos a 4 dígitos
        if p3 < 100:
            p3 = 2000 + p3 if p3 < 70 else 1900 + p3

        # Desambiguación robusta de día y mes:
        if p1 > 12 and p2 <= 12:
            # Inequívocamente p1 es día, p2 es mes (DD/MM/YYYY)
            dia, mes = p1, p2
        elif p2 > 12 and p1 <= 12:
            # Inequívocamente p2 es día, p1 es mes (MM/DD/YYYY)
            dia, mes = p2, p1
        else:
            # Ambos <= 12 (ej: 04/11/2026):
            if format_hint == "mdy":
                mes, dia = p1, p2
            else:
                # Regla por defecto: Convención bancaria hispana DD/MM/YYYY
                dia, mes = p1, p2

        if 1 <= mes <= 12 and 1 <= dia <= 31:
            return f"{dia:02d}/{mes:02d}/{p3:04d}"

    # 3. Caso de 2 componentes: DD/MM o MM/DD (sin año)
    m_bi = re.match(r"^(\d{1,2})[/\-\.](\d{1,2})$", s)
    if m_bi:
        p1, p2 = int(m_bi.group(1)), int(m_bi.group(2))
        year = default_year or datetime.now().year
        if p1 > 12 and p2 <= 12:
            dia, mes = p1, p2
        elif p2 > 12 and p1 <= 12:
            dia, mes = p2, p1
        else:
            dia, mes = p1, p2
        if 1 <= mes <= 12 and 1 <= dia <= 31:
            return f"{dia:02d}/{mes:02d}/{year:04d}"

    return s


def detect_batch_date_format(sample_values: List[Any]) -> str:
    """
    Analiza una lista de fechas del extracto bancario para deducir si el archivo
    utiliza formato DMY (estándar bancario hispano) o MDY (anglosajón).
    """
    dmy_evidence = 0
    mdy_evidence = 0

    for val in sample_values:
        s = clean_date_str(val)
        m = re.match(r"^(\d{1,2})[/\-\.](\d{1,2})[/\-\.]\d{2,4}$", s)
        if m:
            p1, p2 = int(m.group(1)), int(m.group(2))
            if p1 > 12 and p2 <= 12:
                dmy_evidence += 1
            elif p2 > 12 and p1 <= 12:
                mdy_evidence += 1

    if mdy_evidence > 0 and dmy_evidence == 0:
        return "mdy"
    return "dmy"


def fix_swapped_dates_in_movements(
    movements: List[Dict[str, Any]],
    filename_hint: str = ""
) -> List[Dict[str, Any]]:
    """
    Corrige inteligentemente fechas que hayan sido invertidas por Excel u otras fuentes
    (por ejemplo, cuando en un archivo de Noviembre 2026 una fila tiene 04/11/2026 pero fue
    interpretada o formateada como 11/04/2026 - 11 de Abril).

    Regla: Si la gran mayoría de las fechas unívocas (día > 12) pertenecen a un mes determinado
    (ej: Mes 11 - Noviembre), y una fecha ambigua tiene su segundo componente igual a ese mes
    o su primer componente invertido, se reajusta para pertenecer consistentemente al mes correcto.
    """
    if not movements:
        return movements

    # 1. Contar meses basados en fechas completamente unívocas (donde el día > 12)
    meses_conteo: Dict[int, int] = {}
    anos_conteo: Dict[int, int] = {}

    # Analizar si en el nombre del archivo hay pistas de mes/año
    # ej: "Movimientos 3630 02-11-2026 al 06-11-2026.xlsx", "Noviembre 2026"
    mes_hint = None
    ano_hint = None
    if filename_hint:
        fn_lower = filename_hint.lower()
        for m_num, m_nom in MESES_ES.items():
            if isinstance(m_num, int) and m_nom.lower() in fn_lower:
                mes_hint = m_num
                break
        m_fn_ano = re.search(r"\b(202\d)\b", filename_hint)
        if m_fn_ano:
            ano_hint = int(m_fn_ano.group(1))

    for m in movements:
        f = m.get("fecha")
        if not f or not isinstance(f, str):
            continue
        parts = f.split("/")
        if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit() and parts[2].isdigit():
            d, mes, y = int(parts[0]), int(parts[1]), int(parts[2])
            anos_conteo[y] = anos_conteo.get(y, 0) + 1
            if d > 12 and 1 <= mes <= 12:
                meses_conteo[mes] = meses_conteo.get(mes, 0) + 1

    # Si no hay fechas unívocas con día > 12, evaluar todos los meses
    if not meses_conteo:
        for m in movements:
            f = m.get("fecha")
            if not f or not isinstance(f, str):
                continue
            parts = f.split("/")
            if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
                mes = int(parts[1])
                if 1 <= mes <= 12:
                    meses_conteo[mes] = meses_conteo.get(mes, 0) + 1

    # Mes predominante
    mes_predominante = None
    if meses_conteo:
        mes_predominante = max(meses_conteo, key=meses_conteo.get)
    elif mes_hint:
        mes_predominante = mes_hint

    if not mes_predominante:
        return movements

    # 2. Corregir cualquier fecha ambigua donde día y mes estén invertidos
    # Ej: si mes_predominante es 11 (Noviembre), y una fecha dice 11/04/2026 (mes 4, día 11),
    # pero el resto del archivo es de Noviembre -> corregir a 04/11/2026 (día 4, mes 11).
    for m in movements:
        f = m.get("fecha")
        if not f or not isinstance(f, str):
            continue
        parts = f.split("/")
        if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit() and parts[2].isdigit():
            d, mes, y = int(parts[0]), int(parts[1]), int(parts[2])
            if mes != mes_predominante and d == mes_predominante and 1 <= mes <= 31:
                # El día era el mes predominante y el mes era el día real
                nuevo_d = mes
                nuevo_m = mes_predominante
                m["fecha"] = f"{nuevo_d:02d}/{nuevo_m:02d}/{y:04d}"

    return movements


def date_to_sort_key(d_str: str) -> Tuple[int, int, int]:
    """Convierte 'DD/MM/YYYY' a (YYYY, MM, DD) para ordenamiento cronológico perfecto."""
    if not d_str or not isinstance(d_str, str):
        return (9999, 99, 99)
    # Probar DD/MM/YYYY
    parts = d_str.strip().split("/")
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        return (int(parts[2]), int(parts[1]), int(parts[0]))
    # Probar YYYY-MM-DD
    parts_iso = d_str.strip().split("-")
    if len(parts_iso) == 3 and all(p.isdigit() for p in parts_iso):
        return (int(parts_iso[0]), int(parts_iso[1]), int(parts_iso[2]))
    return (9999, 99, 99)


def compute_date_range(dates: List[str]) -> Tuple[str, str, str]:
    """
    Dada una lista de fechas en cualquier formato válido, calcula:
    (min_fecha_dd_mm_yyyy, max_fecha_dd_mm_yyyy, titulo_rango_legible)

    Ejemplos:
    - ["02/11/2026", "06/11/2026", "04/11/2026"] -> ("02/11/2026", "06/11/2026", "02/11/2026 al 06/11/2026")
    - ["23/11/2026", "23/11/2026"] -> ("23/11/2026", "23/11/2026", "23/11/2026")
    """
    valid_dates = []
    for d in dates:
        if not d:
            continue
        norm = parse_and_normalize_date(d)
        if norm and len(norm) == 10 and norm[2] == "/" and norm[5] == "/":
            valid_dates.append(norm)

    if not valid_dates:
        return ("", "", "Sin fechas")

    # Ordenar cronológicamente usando sort_key (año, mes, día)
    sorted_dates = sorted(valid_dates, key=date_to_sort_key)
    min_date = sorted_dates[0]
    max_date = sorted_dates[-1]

    if min_date == max_date:
        titulo_rango = min_date
    else:
        titulo_rango = f"{min_date} al {max_date}"

    return (min_date, max_date, titulo_rango)
