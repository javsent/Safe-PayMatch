"""
generate_icon.py - Genera el icono de alta resolución .ico para Safe-PayMatch
Multi-resolución: 256, 128, 64, 48, 32, 16 px
"""

import os
from PIL import Image, ImageDraw

def create_safe_paymatch_icon():
    os.makedirs("packaging", exist_ok=True)
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Fondo redondeado con gradiente o color sobrio (OLED pitch black con borde esmeralda)
    margin = 8
    draw.rounded_rectangle(
        [(margin, margin), (size - margin, size - margin)],
        radius=48,
        fill=(17, 17, 16, 255),
        outline=(16, 185, 129, 255),
        width=6,
    )

    # Dibujar Escudo de Seguridad estilizado
    # Centro en (128, 128)
    shield_pts = [
        (128, 50),
        (200, 75),
        (200, 150),
        (128, 205),
        (56, 150),
        (56, 75),
    ]
    draw.polygon(shield_pts, fill=(16, 185, 129, 35), outline=(16, 185, 129, 220), width=5)

    # Dibujar Checkmark en el centro del escudo
    check_pts = [
        (96, 128),
        (118, 152),
        (165, 102),
    ]
    draw.line(check_pts, fill=(255, 255, 255, 255), width=10, joint="curve")

    # Guardar en múltiples tamaños estándar de Windows
    icon_path = os.path.join("packaging", "app.ico")
    img.save(
        icon_path,
        format="ICO",
        sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
    )
    print(f"Icono generado exitosamente en: {icon_path}")

if __name__ == "__main__":
    create_safe_paymatch_icon()
