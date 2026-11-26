import unittest
from server.ref_utils import sanitize_reference, normalize_ref
from server.parser_router import detect_bank_and_parse

class TestRefSanitizer(unittest.TestCase):
    def test_scientific_notation_rescue_100banco(self):
        desc = "Credito Inmediato 07540324 : 51342026111607540324"
        raw_ref = 5.13420261116075e+19
        self.assertEqual(sanitize_reference(raw_ref, desc), "07540324")
        self.assertEqual(normalize_ref(raw_ref, desc), "7540324")

    def test_scientific_notation_str(self):
        desc = "Credito Inmediato 23975700 : 41342026111823975700"
        raw_ref = "4.13420261118239e+19"
        self.assertEqual(sanitize_reference(raw_ref, desc), "23975700")
        self.assertEqual(normalize_ref(raw_ref, desc), "23975700")

    def test_standard_int_and_float(self):
        self.assertEqual(sanitize_reference(702664975, "Com. Cred Inme"), "702664975")
        self.assertEqual(sanitize_reference(12345.0, "Pago cuota"), "12345")
        self.assertEqual(sanitize_reference("987654.0", "Pago ordinario"), "987654")

    def test_pagomovil_rescue(self):
        desc = "100%PagoMovil 105 032250227430 : 322996978"
        self.assertEqual(sanitize_reference("", desc), "322996978")

    def test_scientific_fallback(self):
        self.assertEqual(sanitize_reference("5.134e+10", "Sin datos"), "51340000000")

if __name__ == "__main__":
    unittest.main()
