import re
import unicodedata
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from rapidfuzz import fuzz
from server.database import get_connection

def normalize_text(text: Optional[str]) -> str:
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text)
    clean = "".join([c for c in nfkd if not unicodedata.combining(c)])
    return re.sub(r"[^a-zA-Z0-9\s]", " ", clean.lower()).strip()

STOP_WORDS = {
    "de", "la", "el", "los", "las", "un", "una", "por", "para", "con", "en", "a",
    "del", "al", "pago", "abono", "condominio", "condom", "cond", "mes", "cuota", "meses", "cuotas",
    "transferencia", "banco", "cta", "telf", "ced", "emisor", "recibido", "inmediato",
    "credito", "net", "bnc", "banesco", "mercantil", "provincial", "venezuela", "usd",
    "exterior", "transf", "trans", "rec", "serv", "ctrles", "centro", "valen", "cred",
    "inmed", "env", "nj", "com", "comision", "terceros", "aproveed", "movil", "cargo",
    "cargos", "abonos", "saldo", "total", "internet", "cuenta", "ofic", "servicio",
    "ref", "monto", "eur", "obp", "residencia", "residencias", "apartamento", "apto",
    "pmpc", "luxor", "lnmediato", "aterceros",
    # Meses del año
    "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
    "septiembre", "octubre", "noviembre", "diciembre",
    # Códigos bancarios de 4 dígitos del Banco Exterior que contaminan el aprendizaje
    "9742", "9734", "8014", "0720", "9048",
    # Términos específicos de 100%Banco
    "100pagomovil", "pagomovil", "100banco", "100"
}

def extract_meaningful_tokens(text: str) -> List[str]:
    """
    Extrae palabras de longitud >= 3 no contenidas en STOP_WORDS.
    Nota: La detección de códigos de inmuebles (ej. '9B' -> '09-B') opera independientemente
    en build_apartment_regex sobre el texto completo sin depender de esta función.
    """
    norm = normalize_text(text)
    words = norm.split()
    tokens = [w for w in words if len(w) >= 3 and w not in STOP_WORDS]
    return tokens

def build_apartment_regex(identificador: str) -> List[str]:
    """
    Genera patrones regex para detectar menciones de un inmueble en conceptos de pago,
    soportando variaciones comunes como:
    - Cero opcional: '9B', '9-B', '9 B' para '09-B'
    - Cero presente: '09B', '09-B', '09 B' para '9-B'
    - Separadores flexibles (guión, espacio o pegado)
    - Formatos Penthouse: 'PHA', 'PH A', 'PH-A', 'PH1', 'PH-01'
    - Formatos Torre: 'T1-4A', 'T1-04-A', 'Torre 1 4A'
    - Formatos Letra-Número: 'A-1', 'A1', 'A-01'
    """
    raw = identificador.strip()
    patterns = []

    # 1. Caso Num-Letra: ej '09-B', '9-B', '14-C', '11-AB', '01-A'
    m1 = re.match(r"^0*(\d+)[-_/\s]*([a-zA-Z]+)$", raw)
    if m1:
        num = m1.group(1)
        let = m1.group(2).lower()
        if len(num) == 1:
            patterns.append(r"\b0?" + num + r"[\s\-_]*" + let + r"\b")
        else:
            patterns.append(r"\b" + num + r"[\s\-_]*" + let + r"\b")

    # 2. Caso PH: ej 'PH-A', 'PHA', 'PH-1', 'PH-01'
    m2 = re.match(r"^ph[-_/\s]*0*([a-zA-Z0-9]+)$", raw, re.IGNORECASE)
    if m2:
        suf = m2.group(1).lower()
        if suf.isdigit() and len(suf) == 1:
            patterns.append(r"\bph[\s\-_]*0?" + suf + r"\b")
        else:
            patterns.append(r"\bph[\s\-_]*" + suf + r"\b")

    # 3. Caso Torre-Piso-Letra: ej 'T1-04-A', 'T1-4A'
    m3 = re.match(r"^t(?:orre)?[-_/\s]*(\d+)[-_/\s]*0*(\d+)[-_/\s]*([a-zA-Z]+)$", raw, re.IGNORECASE)
    if m3:
        tow, fl, let = m3.group(1), m3.group(2), m3.group(3).lower()
        patterns.append(r"\bt(?:orre)?\s*" + tow + r"[\s\-_]*0?" + fl + r"[\s\-_]*" + let + r"\b")

    # 4. Caso Letra-Num: ej 'A-01', 'A-1'
    m4 = re.match(r"^([a-zA-Z]+)[-_/\s]*0*(\d+)$", raw)
    if m4:
        let, num = m4.group(1).lower(), m4.group(2)
        if len(num) == 1:
            patterns.append(r"\b" + let + r"\s*0?" + num + r"\b")
        else:
            patterns.append(r"\b" + let + r"\s*" + num + r"\b")

    # Fallback general con 0 opcional
    id_norm = normalize_text(raw)
    fallback_pat = re.sub(r"\b0+(\d+)", r"0?\1", id_norm)
    fallback_pat = re.escape(fallback_pat).replace(r"\ ", r"\s*").replace(r"0\?", r"0?")
    patterns.append(r"\b" + fallback_pat + r"\b")

    return list(dict.fromkeys(patterns))

def _calculate_token_decay(last_seen_str: Optional[str], updated_at_str: Optional[str]) -> float:
    """
    Calcula el factor de decaimiento temporal en memoria (Fase 4):
    - > 24 meses (730 días): factor 0.20
    - > 12 meses (365 días): factor 0.50
    - <= 12 meses: factor 1.00
    """
    date_str = last_seen_str or updated_at_str
    if not date_str:
        return 1.0
    try:
        # SQLite CURRENT_TIMESTAMP format: YYYY-MM-DD HH:MM:SS
        date_clean = date_str.split(".")[0]
        token_dt = datetime.strptime(date_clean, "%Y-%m-%d %H:%M:%S")
        days = (datetime.utcnow() - token_dt).days
        if days > 730:
            return 0.20
        elif days > 365:
            return 0.50
        return 1.00
    except Exception:
        return 1.00

def find_best_match_for_movement(
    condominio_id: int,
    movimiento: Dict[str, Any]
) -> Dict[str, Any]:
    desc = movimiento.get("descripcion", "")
    emisor = movimiento.get("emisor_detectado", "")
    cedula = movimiento.get("cedula_detectada", "")
    cuenta = movimiento.get("cta_detectada", "")
    telefono = movimiento.get("telf_detectado", "")

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, identificador, propietario, inquilino, telefonos, email, otros_datos
        FROM inmuebles
        WHERE condominio_id = ?
    """, (condominio_id,))
    inmuebles = [dict(row) for row in cursor.fetchall()]

    if not inmuebles:
        conn.close()
        return {
            "inmueble_id": None,
            "identificador": None,
            "score": 0.0,
            "razon": "No hay inmuebles registrados en este condominio.",
            "clasificacion_especial": ""
        }

    cursor.execute("""
        SELECT t.id, t.inmueble_id, t.tipo_token, t.valor_normalizado, t.frecuencia_confirmada,
               t.peso_confianza, t.last_seen_at, t.updated_at, i.identificador
        FROM tokens_aprendidos t
        JOIN inmuebles i ON t.inmueble_id = i.id
        WHERE i.condominio_id = ?
    """, (condominio_id,))
    tokens_db = [dict(row) for row in cursor.fetchall()]
    conn.close()

    clasificacion_especial = ""
    desc_norm = normalize_text(desc)
    if "caney" in desc_norm:
        clasificacion_especial = "Caney"
    elif "salon" in desc_norm or "fiesta" in desc_norm:
        clasificacion_especial = "Salón de Fiesta"
    elif "multa" in desc_norm:
        clasificacion_especial = "Multa"

    # Extraer tokens del concepto eliminando los números de cuenta largos
    desc_no_cta = re.sub(r"\b\d{10,20}\b", " ", desc)
    desc_tokens = extract_meaningful_tokens(desc_no_cta)
    emisor_norm = normalize_text(emisor)
    cedula_clean = re.sub(r"[^0-9]", "", cedula)
    telefono_clean = re.sub(r"[^0-9]", "", telefono)[-10:] if telefono else ""
    cuenta_clean = re.sub(r"[^0-9]", "", cuenta)[-10:] if cuenta else ""

    candidates: List[Tuple[float, Dict[str, Any], List[str]]] = []

    for inm in inmuebles:
        inm_id = inm["id"]
        identificador = inm["identificador"]
        id_norm = normalize_text(identificador)
        propietario_norm = normalize_text(inm["propietario"])
        inquilino_norm = normalize_text(inm.get("inquilino", ""))
        email_norm = normalize_text(inm.get("email", ""))
        otros_norm = normalize_text(inm.get("otros_datos", ""))
        telefonos_inm = re.findall(r"\d{7,12}", inm.get("telefonos", ""))

        score = 0.0
        reasons = []

        # 1. Regla Cuenta Bancaria Aprendida
        if cuenta_clean and len(cuenta_clean) >= 6:
            matching_cta = [
                t for t in tokens_db
                if t["inmueble_id"] == inm_id and t["tipo_token"] == "cuenta" and cuenta_clean in t["valor_normalizado"]
            ]
            if matching_cta:
                decay = _calculate_token_decay(matching_cta[0].get("last_seen_at"), matching_cta[0].get("updated_at"))
                puntos = round(95.0 * decay, 1)
                score += puntos
                reasons.append(f"Número de cuenta bancaria ({cuenta[-6:]}) coincide con pagos confirmados (+{puntos} pts)")

        # 2. Regla Cédula de Identidad (Con penalización por conflicto si está en 2+ aptos - Fase 2)
        if cedula_clean and len(cedula_clean) >= 6:
            matching_ced = [
                t for t in tokens_db
                if t["tipo_token"] == "cedula" and cedula_clean in t["valor_normalizado"]
            ]
            inm_ids_con_ced = {t["inmueble_id"] for t in matching_ced}
            if inm_id in inm_ids_con_ced:
                t_match = [t for t in matching_ced if t["inmueble_id"] == inm_id][0]
                decay = _calculate_token_decay(t_match.get("last_seen_at"), t_match.get("updated_at"))
                n_conflictos = len(inm_ids_con_ced)
                if n_conflictos > 1:
                    aporte = round((90.0 / n_conflictos) * decay, 1)
                    score += aporte
                    reasons.append(f"Cédula {cedula} compartida con {n_conflictos} apartamentos (+{aporte} pts)")
                else:
                    aporte = round(90.0 * decay, 1)
                    score += aporte
                    reasons.append(f"Cédula {cedula} coincide con el titular/pagador habitual registrado (+{aporte} pts)")

        # 3. Regla Teléfono
        if telefono_clean and len(telefono_clean) >= 7:
            matching_telf = [
                t for t in tokens_db
                if t["inmueble_id"] == inm_id and t["tipo_token"] == "telefono" and telefono_clean in t["valor_normalizado"]
            ]
            telf_in_ficha = any(telefono_clean in t for t in telefonos_inm)
            if matching_telf or telf_in_ficha:
                decay = 1.0
                if matching_telf:
                    decay = _calculate_token_decay(matching_telf[0].get("last_seen_at"), matching_telf[0].get("updated_at"))
                puntos = round(85.0 * decay, 1)
                score += puntos
                reasons.append(f"Teléfono de pago móvil ({telefono[-7:]}) coincide con el contacto registrado (+{puntos} pts)")

        # 4. Regla Emisor
        if emisor_norm:
            sim_prop = fuzz.token_set_ratio(emisor_norm, propietario_norm)
            sim_inq = fuzz.token_set_ratio(emisor_norm, inquilino_norm) if inquilino_norm else 0
            best_person_sim = max(sim_prop, sim_inq)

            if best_person_sim >= 85:
                score += 75.0
                reasons.append(f"Emisor '{emisor}' coincide con '{inm['propietario']}' ({int(best_person_sim)}% similitud)")
            elif best_person_sim >= 65:
                score += 45.0
                reasons.append(f"Emisor '{emisor}' tiene coincidencia parcial con '{inm['propietario']}'")

            # Emisores aprendidos
            matching_emisores = [
                t for t in tokens_db
                if t["inmueble_id"] == inm_id and t["tipo_token"] == "emisor"
            ]
            for t in matching_emisores:
                sim_token = fuzz.token_set_ratio(emisor_norm, t["valor_normalizado"])
                if sim_token >= 80:
                    decay = _calculate_token_decay(t.get("last_seen_at"), t.get("updated_at"))
                    puntos = round(70.0 * decay, 1)
                    score += puntos
                    reasons.append(f"Emisor '{emisor}' coincide con pagador histórico confirmado de este apartamento (+{puntos} pts)")
                    break

        # 5. Mención Explícita del Apartamento en Concepto
        # Soporta variaciones completas (ej: 9B -> 09-B, PHA -> PH-A, Torre 1 4A -> T1-04-A)
        matched_variation = None
        for pat in build_apartment_regex(identificador):
            m_var = re.search(pat, desc_norm, re.IGNORECASE)
            if m_var:
                matched_variation = m_var.group(0).strip()
                break

        if matched_variation:
            score += 75.0
            reasons.append(f"Concepto menciona el inmueble '{identificador}' (variación detectada: '{matched_variation.upper()}')")
        else:
            # Buscar variaciones como "apto 1A" o partes clave si tiene múltiples palabras
            clean_id_words = [w for w in id_norm.split() if len(w) >= 2]
            if len(clean_id_words) >= 2 and all(re.search(r"\b" + re.escape(w) + r"\b", desc_norm) for w in clean_id_words):
                score += 60.0
                reasons.append(f"Concepto contiene las referencias clave del inmueble: {' '.join(clean_id_words)}")

        # 6. Regla Palabras clave en 'Otros datos' o Email (ej. Sandra Guedez en notas de Yosra)
        if otros_norm or email_norm:
            combined_notes = f"{otros_norm} {email_norm}"
            for tok in desc_tokens + ([emisor_norm] if emisor_norm else []):
                for single_word in tok.split():
                    if len(single_word) >= 4 and single_word in combined_notes:
                        score += 65.0
                        reasons.append(f"Palabra clave '{single_word.upper()}' coincide con la ficha o notas del inmueble")
                        break

        # 7. Tokens aprendidos del concepto (Fase 1: sólo tokens de longitud >= 4 y no genéricos)
        matching_alias = [
            t for t in tokens_db
            if t["inmueble_id"] == inm_id and t["tipo_token"] == "alias_concepto"
            and len(t["valor_normalizado"]) >= 4
            and t["valor_normalizado"] in desc_tokens
        ]
        if matching_alias:
            alias_val = matching_alias[0]["valor_normalizado"]
            decay = _calculate_token_decay(matching_alias[0].get("last_seen_at"), matching_alias[0].get("updated_at"))
            puntos = round(45.0 * decay, 1)
            score += puntos
            reasons.append(f"Concepto contiene el término recurrente '{alias_val}' (+{puntos} pts)")

        if score > 0:
            candidates.append((score, inm, reasons))

    if not candidates:
        return {
            "inmueble_id": None,
            "identificador": None,
            "score": 0.0,
            "razon": "No se encontraron coincidencias suficientes.",
            "clasificacion_especial": clasificacion_especial
        }

    candidates.sort(key=lambda x: x[0], reverse=True)
    best_score, best_inm, best_reasons = candidates[0]

    # Fase 2 - 2.1: Detección de empates y near-ties (margen < 20 pts)
    is_near_tie = False
    alt_inm_info = ""
    if len(candidates) >= 2:
        second_score, second_inm, _ = candidates[1]
        if (best_score - second_score) < 20.0 and best_score >= 30.0:
            is_near_tie = True
            alt_inm_info = f"'{second_inm['identificador']}' ({int(second_score)} pts)"

    # Fase 2 - 2.3: Bonus de consistencia (si el apartamento gana por 3+ reglas distintas)
    if len(best_reasons) >= 3:
        best_score = min(best_score * 1.10, 99.0)
        best_reasons.append("Alta consistencia: múltiples reglas coincidentes")

    final_score = min(best_score, 99.0)

    # Si hay near-tie, limitar score a máx 55% y marcar ambigüedad
    if is_near_tie:
        final_score = min(final_score, 55.0)
        best_reasons.append(f"Posible ambigüedad: margen estrecho con {alt_inm_info}")

    if final_score < 30.0:
        return {
            "inmueble_id": None,
            "identificador": None,
            "score": round(final_score, 1),
            "razon": "Coincidencias de baja certeza: " + "; ".join(best_reasons),
            "clasificacion_especial": clasificacion_especial
        }

    razon_str = f"Sugerido: {best_inm['identificador']} ({int(final_score)}% confianza).\n• " + "\n• ".join(best_reasons)
    if clasificacion_especial:
        razon_str += f"\n• Nota: Clasificado como concepto especial '{clasificacion_especial}'."

    return {
        "inmueble_id": best_inm["id"],
        "identificador": best_inm["identificador"],
        "score": round(final_score, 1),
        "razon": razon_str,
        "clasificacion_especial": clasificacion_especial
    }


def learn_from_confirmation(inmueble_id: int, movimiento: Dict[str, Any], conn=None):
    """
    Registra y refuerza los tokens asociados a un inmueble cuando el usuario confirma un movimiento.
    Implementa:
    - Validación de conflictos de cédula/cuenta/teléfono entre apartamentos (Fase 5)
    - Filtro de cédulas en alias_concepto (Fase 1.3)
    - Umbral mínimo >= 4 caracteres para alias_concepto (Fase 1.2)
    - Bloqueo de alias_concepto genéricos presentes en >= 2 otros inmuebles (Fase 1.5)
    - Registro de last_seen_at para decaimiento temporal (Fase 4.1)
    """
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()

    # Obtener el condominio_id del inmueble
    cursor.execute("SELECT condominio_id, identificador FROM inmuebles WHERE id = ?", (inmueble_id,))
    inm_row = cursor.fetchone()
    if not inm_row:
        if should_close:
            conn.close()
        return

    condominio_id = inm_row["condominio_id"]
    tokens_to_learn = []

    # 1. Cuenta
    cta = movimiento.get("cta_detectada") or movimiento.get("cuenta")
    if cta and len(str(cta)) >= 10:
        cta_norm = re.sub(r"[^0-9]", "", str(cta))
        tokens_to_learn.append(("cuenta", cta_norm))

    # 2. Cédula
    ced = movimiento.get("cedula_detectada") or movimiento.get("cedula")
    if ced and len(str(ced)) >= 6:
        ced_norm = re.sub(r"[^0-9]", "", str(ced))
        tokens_to_learn.append(("cedula", ced_norm))

    # 3. Teléfono
    telf = movimiento.get("telf_detectado") or movimiento.get("telefono")
    if telf and len(str(telf)) >= 7 and str(telf) != "000000000000":
        telf_norm = re.sub(r"[^0-9]", "", str(telf))[-10:]
        tokens_to_learn.append(("telefono", telf_norm))

    # 4. Emisor
    emisor = movimiento.get("emisor_detectado") or movimiento.get("emisor")
    if emisor and len(str(emisor).strip()) >= 3:
        emisor_norm = normalize_text(str(emisor))
        tokens_to_learn.append(("emisor", emisor_norm))

    # 5. Tokens significativos del concepto
    desc = movimiento.get("descripcion", "")
    for tok in extract_meaningful_tokens(desc):
        # Fase 1: longitud >= 4, no puramente dígitos, no formato cédula (ej v18758401), no STOP_WORDS
        if len(tok) >= 4 and not tok.isdigit() and tok not in STOP_WORDS:
            if re.match(r"^[vejg]?\d{5,}$", tok, re.IGNORECASE):
                # Es una cédula disfrazada en el concepto: si no teníamos cédula, aprenderla como cédula
                ced_extraida = re.sub(r"[^0-9]", "", tok)
                if len(ced_extraida) >= 6 and not any(t[0] == "cedula" for t in tokens_to_learn):
                    tokens_to_learn.append(("cedula", ced_extraida))
                continue

            # Fase 1.5: No aprender si ya aparece en >= 2 otros inmuebles del mismo condominio
            cursor.execute("""
                SELECT COUNT(DISTINCT t.inmueble_id)
                FROM tokens_aprendidos t
                JOIN inmuebles i ON t.inmueble_id = i.id
                WHERE i.condominio_id = ?
                  AND t.tipo_token = 'alias_concepto'
                  AND t.valor_normalizado = ?
                  AND t.inmueble_id != ?
            """, (condominio_id, tok, inmueble_id))
            count_other_inm = cursor.fetchone()[0]
            if count_other_inm >= 2:
                # Token demasiado genérico entre apartamentos (ej: 'pmpc', 'luxor', meses)
                continue

            tokens_to_learn.append(("alias_concepto", tok))

    for tipo, valor in tokens_to_learn:
        # Fase 5: Validación de conflictos para tokens unívocos (cedula, cuenta, telefono)
        is_conflict = False
        if tipo in ("cedula", "cuenta", "telefono"):
            cursor.execute("""
                SELECT t.inmueble_id, i.identificador
                FROM tokens_aprendidos t
                JOIN inmuebles i ON t.inmueble_id = i.id
                WHERE i.condominio_id = ?
                  AND t.tipo_token = ?
                  AND t.valor_normalizado = ?
                  AND t.inmueble_id != ?
            """, (condominio_id, tipo, valor, inmueble_id))
            conflict_rows = cursor.fetchall()
            if conflict_rows:
                is_conflict = True
                for c_row in conflict_rows:
                    cursor.execute("""
                        INSERT INTO tokens_conflictos (condominio_id, tipo_token, valor_normalizado, inmueble_existente_id, inmueble_nuevo_id)
                        VALUES (?, ?, ?, ?, ?)
                    """, (condominio_id, tipo, valor, c_row["inmueble_id"], inmueble_id))

        # Si hay conflicto, no aumentar desmedidamente el peso de confianza
        peso_increment = 0.05 if is_conflict else 0.20
        peso_max = 1.5 if is_conflict else 3.0

        cursor.execute(f"""
            INSERT INTO tokens_aprendidos (inmueble_id, tipo_token, valor_normalizado, frecuencia_confirmada, peso_confianza, last_seen_at)
            VALUES (?, ?, ?, 1, 1.0, CURRENT_TIMESTAMP)
            ON CONFLICT(inmueble_id, tipo_token, valor_normalizado) DO UPDATE SET
                frecuencia_confirmada = frecuencia_confirmada + 1,
                peso_confianza = MIN(peso_confianza + {peso_increment}, {peso_max}),
                last_seen_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
        """, (inmueble_id, tipo, valor))

    if should_close:
        conn.commit()
        conn.close()


def rescore_pending_movements(estado_cuenta_id: int, conn=None) -> List[Dict[str, Any]]:
    """
    Fase 3: Re-evalúa en tiempo real todas las transacciones pendientes del estado de cuenta,
    aplicando el conocimiento recién adquirido tras una confirmación.
    Actualiza la base de datos y retorna los datos actualizados para reflejar en el frontend.
    """
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()

    # 1. Obtener condominio_id
    cursor.execute("SELECT condominio_id FROM estados_cuenta WHERE id = ?", (estado_cuenta_id,))
    ec_row = cursor.fetchone()
    if not ec_row:
        if should_close:
            conn.close()
        return []
    condominio_id = ec_row["condominio_id"]

    # 2. Obtener movimientos pendientes
    cursor.execute("""
        SELECT * FROM movimientos
        WHERE estado_cuenta_id = ? AND estado_conciliacion = 'pendiente'
    """, (estado_cuenta_id,))
    movs_pendientes = [dict(r) for r in cursor.fetchall()]

    if not movs_pendientes:
        if should_close:
            conn.close()
        return []

    # Mapa de inmuebles para nombres
    cursor.execute("SELECT id, identificador FROM inmuebles WHERE condominio_id = ?", (condominio_id,))
    inmuebles_map = {r["id"]: r["identificador"] for r in cursor.fetchall()}

    updated_records = []
    for m in movs_pendientes:
        match_info = find_best_match_for_movement(condominio_id, m)
        inm_sug_id = match_info.get("inmueble_id")
        score = match_info.get("score", 0.0)
        razon = match_info.get("razon", "")
        esp = match_info.get("clasificacion_especial", "")

        cursor.execute("""
            UPDATE movimientos
            SET inmueble_sugerido_id = ?,
                score_confianza = ?,
                razon_sugerencia = ?,
                clasificacion_especial = CASE WHEN clasificacion_especial = '' THEN ? ELSE clasificacion_especial END
            WHERE id = ?
        """, (inm_sug_id, score, razon, esp, m["id"]))

        updated_records.append({
            "id": m["id"],
            "inmueble_sugerido_id": inm_sug_id,
            "inmueble_sugerido_identificador": inmuebles_map.get(inm_sug_id) if inm_sug_id else None,
            "score_confianza": score,
            "razon_sugerencia": razon,
            "clasificacion_especial": esp if not m.get("clasificacion_especial") else m["clasificacion_especial"]
        })

    if should_close:
        conn.commit()
        conn.close()

    return updated_records
