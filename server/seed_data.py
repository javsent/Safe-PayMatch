from server.database import get_connection, init_db
from server.matcher import learn_from_confirmation

def seed():
    init_db()
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Crear Condominios (incluyendo Residencias Ankara)
    condominios = [
        ("Condominio Residencias Ankara", "Banco Exterior - Cuenta Corriente", "AK"),
        ("Conjunto Residencial Lomas de Mañongo", "Primera Etapa - Mañongo, Valencia", "LM"),
        ("Residencias Vistapo", "Torre A y B - Valencia", "VP"),
        ("Condominio Bahia Platinum", "Edificio Residencial Bahia Platinum", "BP"),
    ]

    for c in condominios:
        cursor.execute("""
            INSERT INTO condominios (nombre, descripcion, icono)
            VALUES (?, ?, ?)
            ON CONFLICT DO NOTHING
        """, c)

    conn.commit()

    cursor.execute("SELECT id, nombre FROM condominios")
    condo_map = {r["nombre"]: r["id"] for r in cursor.fetchall()}

    # 2. Inmuebles para Ankara (Banco Exterior)
    if "Condominio Residencias Ankara" in condo_map:
        ankara_id = condo_map["Condominio Residencias Ankara"]
        inmuebles_ankara = [
            ("17-A", "PROPIETARIO 17-A", "", "", "", "V-15995478 Cédula pagador habitual"),
            ("10-C", "PROPIETARIO 10-C", "", "", "", "V-18758401 Cédula pagador habitual"),
            ("15-B", "PROPIETARIO 15-B", "", "", "", "V-18858297 Cédula pagador habitual"),
            ("03-D", "PROPIETARIO 03-D", "", "", "", "V-12144033 Cédula pagador habitual"),
            ("17-D", "PROPIETARIO 17-D", "", "", "", "V-20181160 Cédula pagador habitual"),
            ("02-B", "PROPIETARIO 02-B", "", "", "", "V-10974317 Cédula pagador habitual"),
            ("05-B", "PROPIETARIO 05-B", "", "", "", "V-08841651 V-8841651"),
            ("07-C", "PROPIETARIO 07-C", "", "", "", "V-17192589 Cédula pagador habitual"),
            ("14-B", "PROPIETARIO 14-B", "", "", "", "V-19622304 Cédula pagador habitual"),
            ("16-B", "PROPIETARIO 16-B", "", "", "", "V-30448518 Cédula pagador habitual"),
            ("06-C", "PROPIETARIO 06-C", "", "", "", "V-6099812 Cédula pagador habitual"),
            ("08-B", "PROPIETARIO 08-B", "", "", "", "V-9771563 Cédula pagador habitual"),
            ("PH-B", "PROPIETARIO PH-B", "", "", "", "PJ 9992 Pago Móvil habitual"),
        ]

        for inm in inmuebles_ankara:
            cursor.execute("""
                INSERT INTO inmuebles (condominio_id, identificador, propietario, inquilino, telefonos, email, otros_datos)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(condominio_id, identificador) DO NOTHING
            """, (ankara_id, inm[0], inm[1], inm[2], inm[3], inm[4], inm[5]))

        # Registrar tokens iniciales de cédula aprendidos
        cursor.execute("SELECT id, identificador, otros_datos FROM inmuebles WHERE condominio_id = ?", (ankara_id,))
        for row in cursor.fetchall():
            inm_id = row["id"]
            otros = row["otros_datos"]
            import re
            ced_match = re.search(r"V-?(\d+)", otros)
            if ced_match:
                ced_val = ced_match.group(1)
                cursor.execute("""
                    INSERT INTO tokens_aprendidos (inmueble_id, tipo_token, valor_normalizado, frecuencia_confirmada, peso_confianza)
                    VALUES (?, 'cedula', ?, 3, 2.0)
                    ON CONFLICT(inmueble_id, tipo_token, valor_normalizado) DO NOTHING
                """, (inm_id, ced_val))

    conn.commit()
    conn.close()
    print("Seed updated with Ankara and Exterior data successfully!")

if __name__ == "__main__":
    seed()
