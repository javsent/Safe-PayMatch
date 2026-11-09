import re
import io
import pdfplumber
from typing import List, Dict, Any, Tuple
from server.parser_bnc import parse_excel_or_csv, parse_bnc_pdf
from server.parser_exterior import parse_exterior_pdf
from server.parser_100banco import parse_100banco_pdf
from server.parser_generic import parse_generic

def normalize_ref(ref: Any) -> str:
    """Normaliza una referencia bancaria eliminando ceros a la izquierda para comparar entre PDF oficial y Excel."""
    s = str(ref or "").strip()
    clean = re.sub(r"^0+", "", s)
    return clean if clean else "0"

def deduplicate_movements(movimientos_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Deduplica movimientos bancarios solapados (overlap entre múltiples extractos).
    Normaliza referencias con/sin ceros a la izquierda y prioriza SIEMPRE la fila que
    posea mayor cantidad de datos suministrados por el usuario (apartamento asignado).
    """
    groups: Dict[tuple, Dict[str, Any]] = {}

    def score_richness(m: Dict[str, Any]) -> int:
        score = 0
        if m.get("inmueble_asignado_historico"):
            score += 1000  # Máxima prioridad al inmueble asignado
        if m.get("cedula_detectada"):
            score += 50
        if m.get("emisor_detectado"):
            score += 20
        if m.get("cta_detectada"):
            score += 10
        score += len(str(m.get("descripcion", "")))
        return score

    for mov in movimientos_list:
        raw_ref = str(mov.get("referencia", "")).strip()
        ref_norm = normalize_ref(raw_ref)
        haber = round(float(mov.get("haber", 0.0) or 0.0), 2)
        debe = round(float(mov.get("debe", 0.0) or 0.0), 2)
        fecha = str(mov.get("fecha", "")).strip()

        # Si no tiene referencia válida (ej: intereses bancarios)
        if not ref_norm or ref_norm in ["0", "1"]:
            key = (fecha, mov.get("descripcion", "").strip(), haber, debe)
        else:
            # Clave única independiente de ceros a la izquierda
            key = (ref_norm, haber, debe)

        if key not in groups:
            # Asegurar que la referencia guardada esté limpia
            mov["referencia"] = ref_norm if ref_norm != "0" else raw_ref
            groups[key] = mov
        else:
            existing_mov = groups[key]
            # Si el nuevo tiene inmueble y el existente no: gana el nuevo
            if mov.get("inmueble_asignado_historico") and not existing_mov.get("inmueble_asignado_historico"):
                mov["referencia"] = ref_norm if ref_norm != "0" else raw_ref
                groups[key] = mov
            elif not mov.get("inmueble_asignado_historico") and existing_mov.get("inmueble_asignado_historico"):
                # Gana el existente, descartar el nuevo sin datos
                pass
            elif score_richness(mov) > score_richness(existing_mov):
                mov["referencia"] = ref_norm if ref_norm != "0" else raw_ref
                groups[key] = mov

    return list(groups.values())

def detect_bank_and_parse(
    file_bytes: bytes,
    filename: str,
    bank_hint: str = "auto"
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Determina de manera inteligente el banco emisor del extracto bancario (o respeta el hint)
    y ejecuta el parser correspondiente.
    Retorna: (banco_detectado, lista_movimientos)
    """
    fn_lower = filename.lower()
    selected_bank = bank_hint.lower() if bank_hint else "auto"

    if fn_lower.endswith(".xlsx") or fn_lower.endswith(".xls") or fn_lower.endswith(".csv"):
        movimientos = parse_excel_or_csv(file_bytes, filename)
        if selected_bank in ["100banco", "100%banco"]:
            banco = "100%Banco"
        elif selected_bank in ["exterior"]:
            banco = "Banco Exterior"
        else:
            banco = "BNC"
        # Normalizar referencias
        for m in movimientos:
            m["referencia"] = normalize_ref(m.get("referencia", ""))
        return banco, movimientos

    sample_text = ""
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages[:2]:
                sample_text += (page.extract_text() or "") + " "
    except Exception:
        pass

    sample_upper = sample_text.upper()

    is_100banco = (
        "100%BANCO" in sample_upper or
        "100% BANCO" in sample_upper or
        "100%PAGOMOVIL" in sample_upper or
        "100% PAGO MOVIL" in sample_upper or
        ("FECHA EFEC" in sample_upper and "ABONO" in sample_upper) or
        ("CREDITO INMEDIATO" in sample_upper and "ABONO" in sample_upper)
    )

    is_exterior = (
        "BANCO EXTERIOR" in sample_upper or
        "EXTERIOR" in sample_upper or
        "TRANSF REC V" in sample_upper or
        "9742TRANSF" in sample_upper or
        "9742 TRANSF" in sample_upper or
        "SERV.CTRLES." in sample_upper
    )

    is_bnc = (
        "BANCO NACIONAL DE CREDITO" in sample_upper or
        "BNCNET" in sample_upper or
        "BNC" in sample_upper or
        "CIPOTR" in sample_upper or
        "CIRJUR" in sample_upper
    )

    detected_bank = "BNC"
    if selected_bank in ["100banco", "100%banco"] or (selected_bank == "auto" and is_100banco):
        detected_bank = "100%Banco"
        movimientos = parse_100banco_pdf(file_bytes)
    elif selected_bank == "exterior" or (selected_bank == "auto" and is_exterior and not is_bnc):
        detected_bank = "Banco Exterior"
        movimientos = parse_exterior_pdf(file_bytes)
    elif selected_bank == "bnc" or (selected_bank == "auto" and is_bnc):
        detected_bank = "BNC"
        movimientos = parse_bnc_pdf(file_bytes)
    else:
        if "9742" in sample_upper or "CARGOS" in sample_upper or "TRANSF REC" in sample_upper:
            detected_bank = "Banco Exterior"
            movimientos = parse_exterior_pdf(file_bytes)
        elif is_100banco:
            detected_bank = "100%Banco"
            movimientos = parse_100banco_pdf(file_bytes)
        else:
            detected_bank = "BNC"
            movimientos = parse_bnc_pdf(file_bytes)

    # Normalizar referencias de los movimientos extraídos
    for m in movimientos:
        m["referencia"] = normalize_ref(m.get("referencia", ""))

    # -----------------------------------------------------------------------
    # FALLBACK GENÉRICO: si el parser específico no encontró transacciones,
    # intentar con el parser universal basado en detección semántica de headers.
    # Esto cubre variaciones menores del formato (ej: "Concepto" en vez de
    # "Descripcion", columnas en distinto orden, encabezados con acentos, etc.)
    # -----------------------------------------------------------------------
    if not movimientos:
        print(f"[Router] Parser '{detected_bank}' retornó 0 movimientos. Intentando parser genérico...")
        _, movimientos_generic = parse_generic(file_bytes, filename)
        if movimientos_generic:
            print(f"[Router] Parser genérico encontró {len(movimientos_generic)} movimientos.")
            for m in movimientos_generic:
                m["referencia"] = normalize_ref(m.get("referencia", ""))
            movimientos = movimientos_generic
            # Mantener el banco detectado pero indicar que se usó parser genérico
            # para que el usuario sepa que fue un fallback
        else:
            print(f"[Router] Parser genérico tampoco encontró movimientos. Archivo posiblemente no soportado.")

    return detected_bank, movimientos
