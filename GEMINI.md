# Safe-PayMatch — Reglas y Backlog del Agente

## ✅ FUNCIONALIDADES IMPLEMENTADAS RECIENTEMENTE

### 🗂️ Mapeo Interactivo de Columnas al Importar Estado de Cuenta (COMPLETADO)
- **Preview de tabla cruda:** Extrae hasta 12 filas de muestra con PDF (`pdfplumber`), Excel (`openpyxl`) y CSV.
- **Detección inteligente:** Sugiere roles iniciales (`fecha`, `referencia`, `descripcion`, `haber`, `debe`, `ignorar`).
- **Selector interactivo (`ColumnMapperModal.jsx`):** El usuario asigna o reasigna manualmente cada columna antes de importar.
- **Validación contable:** Verifica que existan al menos Fecha, Descripción y Haber.
- **Acceso:** Disponible con botón dedicado *"¿Formato especial? Mapear interactivamente"* en la zona de subida y como botón directo de recuperación si el parser automático no detecta movimientos legibles.

### 📑 Generador de Reporte Contable Consolidado de Conciliaciones (COMPLETADO)
- **Acceso desde el archivador principal:** Botón *"Generar Reporte"* ubicado en la cabecera de carpetas (`ConciliacionPanel.jsx`).
- **Filtros avanzados (`ReporteGeneralModal.jsx`):**
  - Rango de fechas (Desde, Hasta, botones rápidos: *Este Mes*, *Mes Anterior*, *Todo*).
  - Estado contable (*Todos*, *Solo Confirmados/Identificados*, *Solo No Identificados / Pendientes*, *Solo Descartados*).
  - Selector de carpeta específica o consolidado de todas las carpetas.
  - Búsqueda en vivo por texto en descripción, referencia o apartamento.
- **Preview interactivo con depuración:** Permite al usuario eliminar filas del reporte (ej. duplicados o transacciones que no deban figurar) con contador de excluidos y opción de restaurar antes de exportar.
- **Exportación en alta calidad:** Descarga directa en **Excel (.xlsx)** corporativo con fórmulas de suma y **PDF formal (.pdf)** con numeración de páginas dinámica.

---

## 📌 POLÍTICA OBLIGATORIA DE CONTROL DE VERSIONES (SemVer)
> **REGLA PARA TODO AGENTE (ACTUAL Y FUTURO):**
> Al realizar cambios significativos en el código, el agente **DEBE evaluar el impacto de los cambios y actualizar el número de versión** en `server/version.py`.
>
> - **MAJOR (X.0.0):** Cambios incompatibles de arquitectura, migración de base de datos no compatible hacia atrás, o reestructuración total del sistema.
> - **MINOR (1.X.0):** Nuevas funcionalidades completas de usuario (ej. Mapeo interactivo de columnas, Reporteador contable multi-carpeta, Sistema de auto-actualización desde GitHub).
> - **PATCH (1.0.X):** Correcciones de bugs, optimizaciones de rendimiento, ajustes de estilos o textos.
>
> **Fuente de verdad única:** `server/version.py` (`__version__`).
> Todos los empaquetadores (`packaging/build_desktop.py`, `packaging/installer.iss`) y el endpoint `/api/system/version` se sincronizan con este valor.

---

## Convenciones del proyecto

- **Backend:** Python 3.14 + FastAPI + SQLite (uvicorn)
- **Frontend:** React (Vite) — SPA servida por FastAPI en producción
- **Escritorio:** pywebview + PyInstaller (onedir) + Inno Setup
- **DB en producción:** `%APPDATA%\Safe-PayMatch\safe_paymatch.db` — NUNCA borrar en actualizaciones
- **DB en dev:** `server/safe_paymatch.db`
- **Modo dev:** `run_dev.bat` → navegador con hot-reload
- **Modo standalone:** `run_desktop.bat` → ventana nativa pywebview
- **Compilar:** `python packaging/build_desktop.py`
- **Instalar:** `& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" packaging/installer.iss`

## Notas técnicas críticas

- PyInstaller: usar `sys._MEIPASS` para resolver rutas de recursos en bundle
- WebView2: pasar `WEBVIEW2_RUNTIME_PATH` explícito a `webview.settings` antes de `webview.initialize()`
  para evitar que caiga al motor MSHTML (Internet Explorer 11), que no renderiza React.
- `pymupdf.layout` y `pymupdf_layout`: deben estar en `sys.modules` como `None` al inicio de `desktop.py`
  y `server/main.py` para evitar que PyMuPDF intente cargar modelos ONNX que no están incluidos.
