const API_BASE = "/api";

export async function fetchVersion() {
  const res = await fetch(`${API_BASE}/version`);
  if (!res.ok) throw new Error("Error obteniendo versión");
  return res.json();
}

export async function fetchCondominios() {
  const res = await fetch(`${API_BASE}/condominios`);
  if (!res.ok) throw new Error("Error obteniendo condominios");
  return res.json();
}

export async function createCondominio(data) {
  const res = await fetch(`${API_BASE}/condominios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Error creando condominio");
  return res.json();
}

export async function deleteCondominio(id) {
  const res = await fetch(`${API_BASE}/condominios/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error eliminando condominio");
  return res.json();
}

export async function fetchInmuebles(condominioId) {
  const res = await fetch(`${API_BASE}/condominios/${condominioId}/inmuebles`);
  if (!res.ok) throw new Error("Error obteniendo inmuebles");
  return res.json();
}

export async function createInmueble(condominioId, data) {
  const res = await fetch(`${API_BASE}/condominios/${condominioId}/inmuebles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Error creando inmueble");
  }
  return res.json();
}

export async function updateInmueble(inmuebleId, data) {
  const res = await fetch(`${API_BASE}/inmuebles/${inmuebleId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Error actualizando inmueble");
  return res.json();
}

export async function deleteInmueble(inmuebleId) {
  const res = await fetch(`${API_BASE}/inmuebles/${inmuebleId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error eliminando inmueble");
  return res.json();
}

export function getPlantillaExcelUrl() {
  return `${API_BASE}/inmuebles/plantilla-excel`;
}

export async function importarInmuebles(condominioId, file, tipoImportacion = "auto") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("tipo_importacion", tipoImportacion);

  const res = await fetch(`${API_BASE}/condominios/${condominioId}/inmuebles/importar`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Error en la importación masiva");
  }
  return res.json();
}

export async function uploadEstadoCuenta(
  condominioId,
  files,
  esHistorico = false,
  banco = "auto",
  titulo = "",
  carpetaId = null,
  carpetaNombre = ""
) {
  const formData = new FormData();
  
  // Soportar tanto un solo archivo como un arreglo o FileList
  const fileArray = Array.isArray(files) ? files : (files instanceof FileList ? Array.from(files) : [files]);
  fileArray.forEach((f) => {
    formData.append("files", f);
  });

  formData.append("banco", banco);
  formData.append("es_historico", esHistorico);
  if (titulo) {
    formData.append("titulo", titulo);
  }
  if (carpetaId) {
    formData.append("carpeta_id", carpetaId);
  }
  if (carpetaNombre) {
    formData.append("carpeta_nombre", carpetaNombre);
  }

  const res = await fetch(`${API_BASE}/condominios/${condominioId}/conciliar/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Error al procesar los archivos");
  }
  return res.json();
}

export async function fetchCarpetas(condominioId) {
  const res = await fetch(`${API_BASE}/condominios/${condominioId}/carpetas`);
  if (!res.ok) throw new Error("Error obteniendo archivador de carpetas");
  return res.json();
}

export async function createCarpeta(condominioId, nombre, descripcion = "") {
  const res = await fetch(`${API_BASE}/condominios/${condominioId}/carpetas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre, descripcion }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Error creando carpeta");
  }
  return res.json();
}

export async function updateCarpeta(carpetaId, nombre, descripcion = null) {
  const res = await fetch(`${API_BASE}/carpetas/${carpetaId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre, descripcion }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Error renombrando carpeta");
  }
  return res.json();
}

export async function deleteCarpeta(carpetaId) {
  const res = await fetch(`${API_BASE}/carpetas/${carpetaId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Error eliminando carpeta");
  }
  return res.json();
}

export async function fusionarCarpetas(carpetaOrigenId, carpetaDestinoId) {
  const res = await fetch(`${API_BASE}/carpetas/fusionar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      carpeta_origen_id: carpetaOrigenId,
      carpeta_destino_id: carpetaDestinoId,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Error fusionando carpetas");
  }
  return res.json();
}

export async function moverConciliacion(estadoCuentaId, carpetaId) {
  const res = await fetch(`${API_BASE}/estados-cuenta/${estadoCuentaId}/mover`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ carpeta_id: carpetaId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Error moviendo conciliación");
  }
  return res.json();
}

export async function fetchEstadosCuenta(condominioId) {
  const res = await fetch(`${API_BASE}/condominios/${condominioId}/estados-cuenta`);
  if (!res.ok) throw new Error("Error obteniendo lista de conciliaciones");
  return res.json();
}

export async function fetchEstadoCuenta(estadoCuentaId) {
  const res = await fetch(`${API_BASE}/estados-cuenta/${estadoCuentaId}`);
  if (!res.ok) throw new Error("Error obteniendo conciliación");
  return res.json();
}

export async function updateEstadoCuentaTitulo(estadoCuentaId, titulo) {
  const res = await fetch(`${API_BASE}/estados-cuenta/${estadoCuentaId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titulo }),
  });
  if (!res.ok) throw new Error("Error actualizando nombre de la conciliación");
  return res.json();
}

export async function deleteEstadoCuenta(estadoCuentaId) {
  const res = await fetch(`${API_BASE}/estados-cuenta/${estadoCuentaId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error eliminando conciliación");
  return res.json();
}

export async function fetchMovimientos(estadoCuentaId) {
  const res = await fetch(`${API_BASE}/estados-cuenta/${estadoCuentaId}/movimientos`);
  if (!res.ok) throw new Error("Error obteniendo movimientos");
  return res.json();
}

export async function fetchUltimoEstadoCuenta(condominioId) {
  const res = await fetch(`${API_BASE}/condominios/${condominioId}/conciliar/ultimo`);
  if (!res.ok) throw new Error("Error obteniendo último estado de cuenta");
  return res.json();
}

export async function confirmarMovimiento(movimientoId, inmuebleId, clasificacionEspecial = "", estado = "confirmado") {
  const res = await fetch(`${API_BASE}/movimientos/confirmar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      movimiento_id: movimientoId,
      inmueble_id: inmuebleId,
      clasificacion_especial: clasificacionEspecial,
      estado_conciliacion: estado,
    }),
  });
  if (!res.ok) throw new Error("Error confirmando movimiento");
  return res.json();
}

export async function confirmarLote(confirmaciones) {
  const res = await fetch(`${API_BASE}/movimientos/confirmar-lote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmaciones }),
  });
  if (!res.ok) throw new Error("Error confirmando lote");
  return res.json();
}

export function getExportUrl(estadoCuentaId) {
  return `${API_BASE}/estados-cuenta/${estadoCuentaId}/exportar?formato=excel`;
}

export function getExportExcelUrl(estadoCuentaId) {
  return `${API_BASE}/estados-cuenta/${estadoCuentaId}/exportar?formato=excel`;
}

export function getExportPdfUrl(estadoCuentaId) {
  return `${API_BASE}/estados-cuenta/${estadoCuentaId}/exportar?formato=pdf`;
}

// ---------------------------------------------------------------------------
// MAPEO INTERACTIVO DE COLUMNAS
// ---------------------------------------------------------------------------

export async function previewTableForMapping(condominioId, file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/condominios/${condominioId}/conciliar/preview-table`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Error obteniendo vista previa de columnas");
  }
  return res.json();
}

export async function uploadWithMapping(condominioId, formData) {
  const res = await fetch(`${API_BASE}/condominios/${condominioId}/conciliar/upload-with-mapping`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Error procesando extracto con el mapeo seleccionado");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// REPORTE CONSOLIDADO DE CONCILIACIONES Y EXPORTACIÓN PERSONALIZADA
// ---------------------------------------------------------------------------

export async function fetchReporteMovimientos(condominioId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.fechaDesde) params.append("fecha_desde", filters.fechaDesde);
  if (filters.fechaHasta) params.append("fecha_hasta", filters.fechaHasta);
  if (filters.estado) params.append("estado", filters.estado);
  if (filters.carpetaId) params.append("carpeta_id", filters.carpetaId);
  if (filters.busqueda) params.append("busqueda", filters.busqueda);

  const res = await fetch(`${API_BASE}/condominios/${condominioId}/reporte-movimientos?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Error consultando transacciones para reporte");
  }
  return res.json();
}

export async function exportarReportePersonalizado(condominioId, payload) {
  const res = await fetch(`${API_BASE}/condominios/${condominioId}/exportar-reporte-personalizado`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Error al exportar reporte personalizado");
  }

  // Descargar blob
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ext = payload.formato === "pdf" ? "pdf" : "xlsx";
  const safeName = (payload.titulo_reporte || "reporte").toLowerCase().replace(/[^a-z0-9]/g, "_");
  a.download = `${safeName}_${new Date().toISOString().split("T")[0]}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// SISTEMA DE ACTUALIZACIONES (GITHUB RELEASES)
// ---------------------------------------------------------------------------

export async function checkAppUpdate() {
  const res = await fetch(`${API_BASE}/system/check-update`);
  if (!res.ok) throw new Error("Error consultando actualizaciones");
  return res.json();
}

export async function downloadAppUpdate(url, version) {
  const res = await fetch(`${API_BASE}/system/download-update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, version }),
  });
  if (!res.ok) throw new Error("Error iniciando descarga de actualización");
  return res.json();
}

export async function getAppUpdateStatus() {
  const res = await fetch(`${API_BASE}/system/download-status`);
  if (!res.ok) throw new Error("Error consultando estado de descarga");
  return res.json();
}

export async function applyAppUpdate() {
  const res = await fetch(`${API_BASE}/system/apply-update`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Error ejecutando actualizador");
  return res.json();
}

// ---------------------------------------------------------------------------
// BANCOS (SISTEMA + PERSONALIZADOS)
// ---------------------------------------------------------------------------

export async function fetchBancos() {
  const res = await fetch(`${API_BASE}/bancos`);
  if (!res.ok) throw new Error("Error obteniendo bancos");
  return res.json();
}

export async function createBanco(nombre) {
  const res = await fetch(`${API_BASE}/bancos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Error guardando banco");
  }
  return res.json();
}

export async function deleteBanco(nombre) {
  const res = await fetch(`${API_BASE}/bancos/${encodeURIComponent(nombre)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error eliminando banco");
  return res.json();
}
