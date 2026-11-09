"""
version.py - Control de versiones centralizado de Safe-PayMatch
SemVer: MAJOR.MINOR.PATCH

Reglas de versionado:
- MAJOR: Cambios estructurales mayores o incompatibilidades de base de datos.
- MINOR: Nuevas funcionalidades significativas (ej. Mapeo interactivo, Reporteador, Auto-updater).
- PATCH: Corrección de errores, parches y mejoras menores de UI.
"""

__version__ = "1.3.0"
__app_name__ = "Safe-PayMatch"
__build_date__ = "2026-11-09"
__channel__ = "stable"
__github_repo__ = "javsent/Safe-PayMatch"

def get_version_info():
    return {
        "version": __version__,
        "app_name": __app_name__,
        "build_date": __build_date__,
        "channel": __channel__,
        "github_repo": __github_repo__,
    }

