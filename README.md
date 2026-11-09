# Safe-PayMatch — Asistente de Conciliación Bancaria Inteligente

Safe-PayMatch es una aplicación de escritorio local diseñada para la conciliación bancaria y contable de condominios y empresas. Automatiza el procesamiento de extractos bancarios (PDF, Excel, CSV), asociando cada pago recibido al apartamento o inmueble correspondiente mediante un motor de memoria asociativa explicable.

## ✨ Novedades de la Versión 1.1.0
- **Mapeo Interactivo de Columnas:** Vista previa en vivo de tablas crudas de estados de cuenta con selector de roles por columna para extractos bancarios complejos o no reconocidos.
- **Reporte Contable Consolidado Multi-Carpeta:** Módulo con filtros avanzados (por estado, rango de fecha y carpetas), depuración en vivo de filas duplicadas en el preview y exportación profesional a Excel (.xlsx) y PDF formal (.pdf).
- **Sistema de Auto-Actualización Integrado:** Detección en vivo de nuevas versiones desde GitHub Releases, descarga automática en segundo plano y actualización sin pérdida de base de datos.

## 🚀 Características Principales
1. **Selector de Condominios**: Perfiles independientes para cada condominio con gestión segura.
2. **Padrón de Inmuebles Completo**: Registro de identificador, propietario, inquilino, contactos y palabras clave asociadas (pagadores terceros).
3. **Memoria Asociativa Auto-Entrenable**:
   - Aprende de cuentas bancarias recurrentes, cédulas, teléfonos y emisores.
   - Correlación automática de comisiones bancarias para extraer identificadores.
   - Refuerzo progresivo de confianza con cada confirmación.
4. **Sugerencias Explicables (Mouseover)**:
   - Tooltips interactivos que detallan con claridad el porcentaje de confianza y el motivo exacto de la sugerencia contable.
5. **Casos Especiales**: Clasificación directa de pagos no residenciales (ej. "Caney", "Salón de Fiesta", "Multas").
6. **Diseño Editorial White Signifier**:
   - Soporte para Tema Claro Editorial y Modo Oscuro OLED Black (#000000).
   - Aplicación de escritorio nativa sin dependencias externas en tiempo de ejecución.
7. **Privacidad y Seguridad Contable**:
   - 100% Offline y Local. La base de datos SQLite reside en `%APPDATA%\Safe-PayMatch` y se conserva intacta a través de todas las actualizaciones.

---

## 🛠️ Ejecución y Desarrollo

### Modo Escritorio Nativo:
```powershell
run_desktop.bat
```

### Modo Desarrollo Web (Hot-Reload):
```powershell
run_dev.bat
```

### Compilar Instalador Autónomo Windows:
```powershell
compilar_instalador.bat
```
Genera el instalador ejecutable `.exe` en `installer_output/`.
