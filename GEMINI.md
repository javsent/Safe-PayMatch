# Safe-PayMatch — Reglas y Backlog del Agente

## ✅ FUNCIONALIDADES IMPLEMENTADAS RECIENTEMENTE

### 🔢 Saneamiento de Referencias con Notación Científica y Auto-Detección 100%Banco (COMPLETADO v1.4.2)
- **Eliminación total de notación científica en referencias:** Módulo centralizado `server/ref_utils.py` que detecta y corrige floats de Excel con exponente (`5.13420261116075e+19`) y decimales artificiales (`.0`).
- **Rescate inteligente desde descripción contable:** Para extractos de 100%Banco y Pago Móvil, rescata la referencia original de 8 dígitos (`07540324`, `23975700`, etc.) preservada íntegramente en la descripción de "Crédito Inmediato" o comisiones bancarias.
- **Auto-detección bancaria en Excel/CSV:** Si el banco está configurado en "auto", el enrutador inspecciona el contenido de las transacciones para clasificar correctamente archivos de 100%Banco y Banco Exterior en lugar de asumir BNC ciegamente.
- **Saneamiento automático en inicio y migraciones:** Rutina de auto-reparación en `database.py:init_db()` y `migrations.py` que corrige cualquier movimiento histórico corrupto en SQLite.

### 🕒 Indicador de Última Conciliación y Orden por Prioridad (COMPLETADO)
- **Fecha de última conciliación en tarjeta:** Cada condominio en el panel de selección muestra a un costado la fecha y hora relativa de su último extracto bancario procesado (ej. *Hoy (1:18 p. m.)*, *Hace 4 días*, o en ámbar *Sin conciliar aún*).
- **Selector inteligente de ordenamiento:** Barra de herramientas superior que permite alternar entre:
  - **Prioridad:** Coloca al tope los condominios que nunca han sido conciliados o llevan más tiempo sin procesar extractos para priorizar la carga de trabajo.
  - **A - Z:** Orden alfabético tradicional.
  - **Recientes:** Los condominios trabajados más recientemente primero.
- **Consultas optimizadas:** Cálculo en subquery SQL directo en `GET /api/condominios` para máxima velocidad sin N+1 queries.

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

### 🏦 Soporte para Bancos Personalizados ("Otro banco...") (COMPLETADO)
- **Opción "➕ Otro banco...":** En el selector de banco al subir extractos contables.
- **Entrada interactiva:** Input inline para escribir el nombre del banco (ej. Banesco, Banco de Venezuela, Mercantil, Bancamiga).
- **Persistencia en SQLite:** Los nombres de bancos agregados por el usuario se guardan en la tabla `bancos_personalizados` y persisten permanentemente.
- **Acceso rápido y gestión:** Los bancos guardados aparecen directamente en el selector con el prefijo `🏦 [Nombre] (Guardado)` e incluyen un botón 🗑️ para eliminarlos de la lista.
- **Compatibilidad con parsers y mapeo:** Se integra automáticamente con el parser genérico y con el modal interactivo de mapeo de columnas para preservar el nombre del banco en la conciliación.

### 📅 Titulación Automática por Rango de Fechas y Subtítulo de Archivo (COMPLETADO v1.4.0)
- **Rango cronológico en títulos:** Cada extracto en la lista de conciliaciones muestra automáticamente como título principal el rango de fechas real de sus pagos ordenados de más antiguo a más reciente (ej. *02/11/2026 al 06/11/2026*, o *23/11/2026* si es un solo día).
- **Subtítulo descriptivo con contexto de usuario:** Muestra de forma limpia el nombre del archivo original subido (`.xlsx`, `.pdf`) o la nota personalizada del usuario para conservar todo el contexto sin saturar la vista.
- **Columnas persistentes en SQLite:** `fecha_inicio` y `fecha_fin` en `estados_cuenta` calculadas con precisión cronológica (año, mes, día).

### ⚖️ Discriminación Contable de Pagos "No Identificado" (COMPLETADO v1.4.0)
- **Separación de métricas de conciliación:** Los pagos marcados como "No Identificado" ya no se cuentan falsamente como conciliados.
- **Desglose exacto en lista y carpeta:** Muestra claramente *X / Total conciliados* y desglosa en ámbar *• Y no identificados*.
- **Barra de progreso visual bicolor:** Segmento verde para pagos conciliados identificados y segmento ámbar para pagos no identificados.

### 🚫 Filtro Inteligente de Saldos Negativos en Reportes (COMPLETADO v1.4.0)
- **Ocultar saldos negativos por defecto:** En el modal del generador de reportes contables (`ReporteGeneralModal.jsx`), los débitos bancarios, comisiones y egresos vienen automáticamente ocultos para evitar eliminarlos manualmente uno por uno.
- **Control interactivo visible:** Switch/checkbox para alternar con un clic entre ver solo ingresos o incluir todos los movimientos bancarios.

### 🧭 Normalización y Detección Robusta de Fechas Bancarias (COMPLETADO v1.4.0)
- **Módulo centralizado `server/date_utils.py`:** Convención estándar bancaria hispana/venezolana `DD/MM/YYYY` por defecto (`dayfirst=True`).
- **Desambiguación inteligente a nivel de lote:** Si un extracto contiene fechas como `15/11/2026` o `23/11/2026`, el sistema deduce con certeza absoluta que el archivo es del mes 11 (Noviembre) y corrige automáticamente celdas ambiguas o invertidas por Excel (ej. `4/11/2026` interpretado erróneamente por configuraciones regionales en inglés como 11 de abril).
- **Limpieza de metadatos de hora y multilínea:** Elimina automáticamente residuos de marcas de tiempo (`00:00:00`, `12:56PM`, saltos de línea de PDF/Excel).

### 🛡️ Confirmación con Botón "Aceptar" al Asignar Apartamento (COMPLETADO v1.4.0)
- **Prevención de asignaciones accidentales:** Al seleccionar una opción en el menú desplegable de apartamentos, el sistema ya no guarda automáticamente.
- **Flujo seguro y compacto (v1.4.1):** Mantiene la selección con borde verde suave de previsualización. La columna se amplió a 220px y el control inline se compactó a un botón iconográfico `[ ✓ ]` (28px) y cancelar `[ ✕ ]`, permitiendo que el nombre del apartamento permanezca 100% visible y legible en el menú desplegable. Permite rectificar o cancelar antes de guardar.

### 📥 Plantilla Oficial de Conciliación Bancaria en Excel (.xlsx) (COMPLETADO v1.4.0)
- **Botón de descarga en "Nueva Conciliación":** En la zona de subida de extractos contables se incorporó el botón verde esmeralda *"📥 Descargar plantilla Excel (.xlsx) para rellenar manualmente"*.
- **Estructura 100% compatible:** Contiene las columnas esenciales (`Fecha`, `Referencia`, `Descripción`, `Haber`, `Debe`, `Apartamento`) con formatos numéricos preconfigurados (`#,##0.00`) y formato de texto para preservar ceros a la izquierda en referencias.
- **Hoja de instrucciones integrada:** Incluye guía clara paso a paso para el usuario y ejemplos con formatos venezolanos listos para ser procesados sin errores por el parser automático.

### ⚡ Optimización Integral de Rendimiento, Desplazamiento y Base de Datos (COMPLETADO v1.4.1)
- **12 Índices de alta velocidad en SQLite:** Creados en `movimientos`, `estados_cuenta`, `carpetas`, `inmuebles` y `tokens_aprendidos` (`condominio_id`, `estado_cuenta_id`, `referencia`, `inmueble_confirmado_id`, `carpeta_id`, etc.), eliminando escaneos completos de tablas.
- **Pragmas SQLite de memoria:** Activación de caché en RAM de 64MB (`cache_size = -64000`), `synchronous = NORMAL`, `temp_store = MEMORY` y memoria mapeada de 256MB (`mmap_size = 268435456`) en `server/database.py`.
- **Eliminación del problema N+1 en inmuebles:** `list_inmuebles` ahora recupera los tokens aprendidos de todo el condominio en una única consulta agrupada por IDs en vez de ejecutar una consulta SQL individual por cada apartamento.
- **Virtualización CSS de renderizado (`content-visibility: auto`):** Aplicada a las filas `<tr>` de movimientos bancarios para que Chromium/WebView2 difiera el diseño y pintado de filas fuera de pantalla, logrando un desplazamiento fluido a 60fps sin tirones.
- **Memoización de componentes y métricas React:**
  - `inmueblesOptions`: El listado de opciones del selector de inmuebles se calcula una sola vez con `useMemo`, eliminando la creación de decenas de miles de nodos DOM en cada render.
  - Métricas agregadas (`totalHaber`, `totalConfirmados`, `totalNoIdentificados`, `pctConciliado`, etc.) unificadas en un único recorrido O(N) memoizado en `ConciliacionPanel.jsx`.
  - Agrupación por meses (`gruposPorMes`) memoizada.

### 🧭 Navegación Contextual e Inteligente en Header Sticky (COMPLETADO v1.4.1)
- **Botón contextual por nivel jerárquico:** Cuando el usuario se encuentra dentro de una conciliación o subiendo un nuevo extracto y se desplaza hacia abajo por las filas de movimientos, el botón anclado en la cabecera superior fija (*sticky header*) se transforma automáticamente en `[ < Volver a Conciliaciones ]` con acento visual esmeralda suave.
- **Guardado y pausa automática:** Al hacer clic en este botón, guarda el estado actual, titulación y pausa la conciliación de forma segura, regresando directamente a la vista de carpetas y extractos del condominio actual sin salirse de él.
- **Acceso directo secundario (`/ Condominios`):** Mantiene un enlace discreto al lado para los casos en que el usuario sí desee salir directamente al selector general de condominios con un solo clic.
- **Alineación de barra de búsqueda según mejores prácticas UI:** El buscador de movimientos se reubicó al extremo derecho de la barra de herramientas junto a las acciones por lote, dejando las píldoras de filtrado a la izquierda sin espacios vacíos extraños en el centro, e incluyendo botón de borrado rápido (`✕`).

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
