import re
from typing import Any

def sanitize_reference(ref: Any, desc: str = "") -> str:
    """
    Sanea referencias bancarias. Corrige:
    - Notación científica producida por Excel (ej. 5.13420261116075e+19).
    - Números de punto flotante de Excel (ej. 123456.0 -> 123456).
    - Rescate de la referencia real desde la descripción bancaria (100%Banco, Pago Móvil, etc.).
    """
    desc_str = str(desc or "").strip()
    is_scientific = False
    val_str = ""

    if ref is None:
        val_str = ""
    elif isinstance(ref, float):
        if ref.is_integer() and "e" not in str(ref).lower():
            val_str = str(int(ref))
        else:
            is_scientific = "e" in str(ref).lower()
            val_str = str(ref).strip()
    elif isinstance(ref, int):
        val_str = str(ref)
    else:
        val_str = str(ref).strip()
        if re.match(r"^\d+\.0+$", val_str):
            val_str = val_str.split(".")[0]
        elif re.search(r"[eE][+-]?\d+", val_str):
            is_scientific = True

    needs_rescue = is_scientific or val_str in ("", "0", "0.0")

    if desc_str:
        # Prioridad 1: 100%Banco "Credito Inmediato <ref_corta> : <ref_larga>"
        # Ej: "Credito Inmediato 07540324 : 51342026111607540324"
        m_cred = re.search(r"Credito Inmediato\s+(\d+)\s*:\s*(\d+)", desc_str, re.IGNORECASE)
        if m_cred and needs_rescue:
            return m_cred.group(1)

        # Prioridad 2: 100%PagoMovil u otros pagos móviles con ": <ref>"
        # Ej: "100%PagoMovil 105 032250227430 : 322996978"
        m_pm = re.search(r"(?:100%PagoMovil|Pago\s*Movil|P2C|P2P)[^:]*?:\s*([A-Za-z0-9]{6,})", desc_str, re.IGNORECASE)
        if m_pm and needs_rescue:
            return m_pm.group(1)

        # Prioridad 3: Transacciones con ": <ref>"
        # Ej: "Transf. IB BCV:01050261611261065298 : IB6018601121130904"
        m_colon = re.search(r":\s*([A-Za-z0-9]{6,})\b", desc_str)
        if m_colon and needs_rescue:
            return m_colon.group(1)

        # Prioridad 4: Marcadores explícitos de referencia
        # Ej: "Ref: 12345678" o "Comprobante 987654"
        m_ref = re.search(r"(?:Ref(?:erencia)?|Comprobante|Nro|Num|Operaci[oó]n|Doc)[:\s#]+([A-Za-z0-9]{6,})", desc_str, re.IGNORECASE)
        if m_ref and needs_rescue:
            return m_ref.group(1)

    if is_scientific:
        try:
            return f"{int(round(float(val_str)))}"
        except Exception:
            return val_str

    return val_str

def normalize_ref(ref: Any, desc: str = "") -> str:
    """Normaliza una referencia bancaria saneando notación científica y eliminando ceros a la izquierda."""
    s = sanitize_reference(ref, desc)
    clean = re.sub(r"^0+", "", s)
    return clean if clean else "0"
