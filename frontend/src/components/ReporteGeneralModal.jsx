import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  FileSpreadsheet,
  FileText,
  Filter,
  Calendar,
  Trash2,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  Building2,
  ArrowUpDown
} from "lucide-react";
import { fetchReporteMovimientos, exportarReportePersonalizado } from "../api";

function formatCurrencyVE(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return "0,00";
  return Number(amount)
    .toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReporteGeneralModal({
  isOpen,
  onClose,
  condominio,
  carpetas = [],
}) {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(null); // 'excel' | 'pdf' | null
  const [errorMsg, setErrorMsg] = useState("");

  // Filtros
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos"); // 'todos' | 'confirmado' | 'pendiente' | 'no_identificado' | 'descartado'
  const [carpetaSeleccionada, setCarpetaSeleccionada] = useState("");
  const [busquedaTexto, setBusquedaTexto] = useState("");

  // Datos
  const [movimientosOriginales, setMovimientosOriginales] = useState([]);
  const [filasExcluidasIds, setFilasExcluidasIds] = useState(new Set());
  const [tituloReporte, setTituloReporte] = useState("Reporte Consolidado de Conciliación");

  // Al abrir el modal, cargar movimientos por defecto
  useEffect(() => {
    if (isOpen && condominio?.id) {
      cargarMovimientos();
    } else {
      setMovimientosOriginales([]);
      setFilasExcluidasIds(new Set());
      setErrorMsg("");
    }
  }, [isOpen, condominio?.id]);

  // Actualizar título por defecto según el filtro seleccionado
  useEffect(() => {
    if (filtroEstado === "no_identificado" || filtroEstado === "pendiente") {
      setTituloReporte("Reporte de Pagos No Identificados / Pendientes");
    } else if (filtroEstado === "confirmado") {
      setTituloReporte("Reporte de Recaudación Conciliada");
    } else if (filtroEstado === "descartado") {
      setTituloReporte("Reporte de Transacciones Descartadas");
    } else {
      setTituloReporte("Reporte Consolidado de Conciliación");
    }
  }, [filtroEstado]);

  const cargarMovimientos = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const params = {};
      if (fechaDesde) params.fechaDesde = fechaDesde;
      if (fechaHasta) params.fechaHasta = fechaHasta;
      if (filtroEstado) params.estado = filtroEstado;
      if (carpetaSeleccionada) params.carpetaId = carpetaSeleccionada;
      if (busquedaTexto) params.busqueda = busquedaTexto;

      const data = await fetchReporteMovimientos(condominio.id, params);
      setMovimientosOriginales(data.movimientos || []);
      // Resetear exclusiones al recargar consulta nueva
      setFilasExcluidasIds(new Set());
    } catch (err) {
      setErrorMsg(err.message || "Error al cargar movimientos para el reporte.");
    } finally {
      setLoading(false);
    }
  };

  // Accesos rápidos de rango de fechas
  const setRangoRapido = (tipo) => {
    const hoy = new Date();
    const pad = (n) => String(n).padStart(2, "0");

    if (tipo === "este_mes") {
      const y = hoy.getFullYear();
      const m = hoy.getMonth() + 1;
      const primerDia = `${y}-${pad(m)}-01`;
      const ultimoDia = new Date(y, m, 0).toISOString().split("T")[0];
      setFechaDesde(primerDia);
      setFechaHasta(ultimoDia);
    } else if (tipo === "mes_anterior") {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const primerDia = `${y}-${pad(m)}-01`;
      const ultimoDia = new Date(y, m, 0).toISOString().split("T")[0];
      setFechaDesde(primerDia);
      setFechaHasta(ultimoDia);
    } else if (tipo === "ultimos_30") {
      const hace30 = new Date();
      hace30.setDate(hoy.getDate() - 30);
      setFechaDesde(hace30.toISOString().split("T")[0]);
      setFechaHasta(hoy.toISOString().split("T")[0]);
    } else if (tipo === "todo") {
      setFechaDesde("");
      setFechaHasta("");
    }
  };

  // Excluir / Eliminar una fila del preview interactivo
  const handleToggleExcluirFila = (id) => {
    setFilasExcluidasIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Restaurar todas las filas excluidas
  const handleRestaurarExcluidos = () => {
    setFilasExcluidasIds(new Set());
  };

  // Lista de movimientos activos en el preview
  const movimientosActivos = useMemo(() => {
    return movimientosOriginales.filter((m) => !filasExcluidasIds.has(m.id));
  }, [movimientosOriginales, filasExcluidasIds]);

  // Totales en vivo
  const totalMontoActivo = useMemo(() => {
    return movimientosActivos.reduce((sum, m) => sum + (parseFloat(m.monto) || 0), 0);
  }, [movimientosActivos]);

  // Exportar Excel o PDF
  const handleExportar = async (formato) => {
    if (movimientosActivos.length === 0) {
      alert("No hay transacciones activas en el preview para exportar.");
      return;
    }

    try {
      setExporting(formato);
      setErrorMsg("");

      let subFiltro = "";
      if (fechaDesde || fechaHasta) {
        subFiltro += `Rango: ${fechaDesde || 'Inicio'} al ${fechaHasta || 'Fin'}`;
      }
      if (filtroEstado !== "todos") {
        const estadoLabels = {
          confirmado: "Solo Identificados",
          pendiente: "No Identificados / Pendientes",
          no_identificado: "No Identificados / Pendientes",
          descartado: "Solo Descartados",
        };
        subFiltro += (subFiltro ? " • " : "") + `Filtro: ${estadoLabels[filtroEstado] || filtroEstado}`;
      }

      const payload = {
        titulo_reporte: tituloReporte || "Reporte de Conciliación",
        subtitulo_filtros: subFiltro,
        formato: formato,
        movimientos: movimientosActivos.map((m) => ({
          fecha: m.fecha,
          referencia: m.referencia,
          concepto: m.concepto,
          monto: m.monto,
          inmueble: m.inmueble,
        })),
      };

      await exportarReportePersonalizado(condominio.id, payload);
    } catch (err) {
      setErrorMsg(err.message || "Error al exportar reporte.");
    } finally {
      setExporting(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(5px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1200px",
          height: "94vh",
          backgroundColor: "var(--color-bg, #ffffff)",
          color: "var(--color-fg, #111110)",
          borderRadius: "16px",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.25)",
          border: "1px solid var(--color-border-subtle, rgba(0,0,0,0.1))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--color-border-subtle, rgba(0,0,0,0.08))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--color-card, #fcfcfc)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "rgba(15, 23, 42, 0.08)",
                color: "var(--color-fg, #0f172a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileText size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, letterSpacing: "-0.01em" }}>
                Generador de Reportes de Conciliación
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "var(--color-fg-muted, #666)" }}>
                Filtra por fechas o estado, previsualiza y depura las transacciones antes de exportar a Excel o PDF.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--color-fg-muted, #777)",
              padding: "6px",
              borderRadius: "8px",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Barra de Filtros */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--color-border-subtle, rgba(0,0,0,0.06))",
            background: "var(--color-card, #f8fafc)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {/* Fila 1 de Controles: Fechas, Estados, Carpetas */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
            {/* Rango de Fechas */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-fg-muted, #475569)" }}>Desde:</span>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                style={{
                  padding: "5px 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border-subtle, #cbd5e1)",
                  background: "var(--color-bg, #ffffff)",
                  color: "var(--color-fg, #0f172a)",
                  fontSize: "12px",
                }}
              />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-fg-muted, #475569)" }}>Hasta:</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                style={{
                  padding: "5px 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border-subtle, #cbd5e1)",
                  background: "var(--color-bg, #ffffff)",
                  color: "var(--color-fg, #0f172a)",
                  fontSize: "12px",
                }}
              />
            </div>

            {/* Accesos rápidos */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                type="button"
                onClick={() => setRangoRapido("este_mes")}
                style={{
                  padding: "4px 8px",
                  borderRadius: "5px",
                  fontSize: "11px",
                  border: "1px solid var(--color-border-subtle, #e2e8f0)",
                  background: "var(--color-bg, #ffffff)",
                  color: "var(--color-fg, #334155)",
                  cursor: "pointer",
                }}
              >
                Este Mes
              </button>
              <button
                type="button"
                onClick={() => setRangoRapido("mes_anterior")}
                style={{
                  padding: "4px 8px",
                  borderRadius: "5px",
                  fontSize: "11px",
                  border: "1px solid var(--color-border-subtle, #e2e8f0)",
                  background: "var(--color-bg, #ffffff)",
                  color: "var(--color-fg, #334155)",
                  cursor: "pointer",
                }}
              >
                Mes Anterior
              </button>
              <button
                type="button"
                onClick={() => setRangoRapido("todo")}
                style={{
                  padding: "4px 8px",
                  borderRadius: "5px",
                  fontSize: "11px",
                  border: "1px solid var(--color-border-subtle, #e2e8f0)",
                  background: "var(--color-bg, #ffffff)",
                  color: "var(--color-fg, #334155)",
                  cursor: "pointer",
                }}
              >
                Todo el Historial
              </button>
            </div>

            {/* Filtro por Estado */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-fg-muted, #475569)" }}>Estado:</span>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1.5px solid var(--color-border-subtle, #cbd5e1)",
                  background: "var(--color-bg, #ffffff)",
                  color: "var(--color-fg, #0f172a)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <option value="todos">Todos los Movimientos</option>
                <option value="confirmado">✓ Solo Identificados / Confirmados</option>
                <option value="no_identificado">⚠️ Solo No Identificados / Pendientes</option>
                <option value="descartado">✕ Solo Descartados</option>
              </select>
            </div>

            {/* Filtro por Carpeta */}
            {carpetas.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-fg-muted, #475569)" }}>Carpeta:</span>
                <select
                  value={carpetaSeleccionada}
                  onChange={(e) => setCarpetaSeleccionada(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-border-subtle, #cbd5e1)",
                    background: "var(--color-bg, #ffffff)",
                    color: "var(--color-fg, #0f172a)",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Todas las carpetas</option>
                  {carpetas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Botón Aplicar Filtros */}
            <button
              type="button"
              onClick={cargarMovimientos}
              disabled={loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "6px",
                border: "none",
                background: "#0f172a",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              <span>Aplicar Filtros</span>
            </button>
          </div>

          {/* Fila 2: Título editable del Reporte */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-fg-muted, #475569)", minWidth: "105px" }}>
              Título del Reporte:
            </span>
            <input
              type="text"
              value={tituloReporte}
              onChange={(e) => setTituloReporte(e.target.value)}
              placeholder="Ej: Reporte de Pagos No Identificados - Octubre 2026"
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid var(--color-border-subtle, #cbd5e1)",
                background: "var(--color-bg, #ffffff)",
                color: "var(--color-fg, #0f172a)",
                fontSize: "12.5px",
                fontWeight: 500,
              }}
            />
          </div>
        </div>

        {/* Tarjetas de Resumen y Métricas en Vivo */}
        <div
          style={{
            padding: "12px 24px",
            background: "var(--color-bg, #ffffff)",
            borderBottom: "1px solid var(--color-border-subtle, rgba(0,0,0,0.06))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <div>
              <span style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-fg-muted, #64748b)", fontWeight: 700 }}>
                Pagos en Reporte
              </span>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-fg, #0f172a)" }}>
                {movimientosActivos.length}
                <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--color-fg-muted, #64748b)", marginLeft: "4px" }}>
                  (de {movimientosOriginales.length})
                </span>
              </div>
            </div>

            <div style={{ height: "24px", width: "1px", background: "var(--color-border-subtle, #e2e8f0)" }} />

            <div>
              <span style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-fg-muted, #64748b)", fontWeight: 700 }}>
                Monto Total Reportado
              </span>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#10b981" }}>
                Bs. {formatCurrencyVE(totalMontoActivo)}
              </div>
            </div>

            {filasExcluidasIds.size > 0 && (
              <>
                <div style={{ height: "24px", width: "1px", background: "var(--color-border-subtle, #e2e8f0)" }} />
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#ef4444", fontWeight: 600 }}>
                    🗑️ {filasExcluidasIds.size} {filasExcluidasIds.size === 1 ? "fila eliminada" : "filas eliminadas"} del preview
                  </span>
                  <button
                    type="button"
                    onClick={handleRestaurarExcluidos}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 8px",
                      borderRadius: "5px",
                      border: "1px solid var(--color-border-subtle, #cbd5e1)",
                      background: "transparent",
                      color: "var(--color-fg, #334155)",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <RotateCcw size={11} />
                    <span>Restaurar todas</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ fontSize: "12px", color: "var(--color-fg-muted, #64748b)" }}>
            💡 <i>Puedes eliminar filas individuales de este reporte con el botón de papelera en la tabla.</i>
          </div>
        </div>

        {/* Tabla de Previsualización */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {errorMsg && (
            <div
              style={{
                marginBottom: "12px",
                padding: "10px 14px",
                borderRadius: "8px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "#ef4444",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div style={{ padding: "60px 0", textAlign: "center", color: "var(--color-fg-muted, #777)" }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 12px" }} />
              <p style={{ margin: 0, fontSize: "14px" }}>Consultando transacciones...</p>
            </div>
          ) : movimientosOriginales.length === 0 ? (
            <div style={{ padding: "60px 0", textAlign: "center", color: "var(--color-fg-muted, #777)" }}>
              <Filter size={32} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>No se encontraron transacciones con los filtros seleccionados.</p>
              <p style={{ margin: "4px 0 0", fontSize: "13px" }}>Prueba ampliando el rango de fechas o seleccionando "Todos los Movimientos".</p>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--color-border-subtle, rgba(0,0,0,0.1))",
                borderRadius: "10px",
                overflow: "hidden",
                background: "var(--color-card, #ffffff)",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "var(--color-card, #0f172a)", color: "#ffffff" }}>
                    <th style={{ padding: "9px 12px", textAlign: "center", width: "95px" }}>FECHA</th>
                    <th style={{ padding: "9px 12px", textAlign: "center", width: "120px" }}>REFERENCIA</th>
                    <th style={{ padding: "9px 12px", textAlign: "left" }}>CONCEPTO / DESCRIPCIÓN</th>
                    <th style={{ padding: "9px 12px", textAlign: "right", width: "130px" }}>MONTO (BS.)</th>
                    <th style={{ padding: "9px 12px", textAlign: "center", width: "140px" }}>INMUEBLE / ESTADO</th>
                    <th style={{ padding: "9px 12px", textAlign: "center", width: "65px" }}>ACCIÓN</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientosOriginales.map((m, idx) => {
                    const isExcluido = filasExcluidasIds.has(m.id);
                    return (
                      <tr
                        key={m.id}
                        style={{
                          borderBottom: "1px solid var(--color-border-subtle, #f1f5f9)",
                          backgroundColor: isExcluido
                            ? "rgba(239, 68, 68, 0.05)"
                            : idx % 2 === 0
                            ? "transparent"
                            : "var(--color-card, rgba(0,0,0,0.015))",
                          opacity: isExcluido ? 0.45 : 1,
                          textDecoration: isExcluido ? "line-through" : "none",
                          transition: "background 0.15s ease",
                        }}
                      >
                        <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--color-fg-muted, #475569)" }}>
                          {m.fecha}
                        </td>

                        <td style={{ padding: "8px 12px", textAlign: "center", fontFamily: "monospace", fontWeight: 600 }}>
                          {m.referencia}
                        </td>

                        <td style={{ padding: "8px 12px", maxWidth: "340px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.concepto}>
                          {m.concepto}
                        </td>

                        <td
                          style={{
                            padding: "8px 12px",
                            textAlign: "right",
                            fontWeight: 700,
                            color: m.monto >= 0 ? "var(--color-fg, #0f172a)" : "#ef4444",
                          }}
                        >
                          {formatCurrencyVE(m.monto)}
                        </td>

                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 600,
                              background:
                                (m.es_identificado ?? (m.estado_conciliacion === "confirmado" && m.inmueble !== "No Identificado" && !m.inmueble.startsWith("Pendiente")))
                                  ? "rgba(16, 185, 129, 0.12)"
                                  : (m.es_descartado ?? m.estado_conciliacion === "descartado")
                                  ? "rgba(239, 68, 68, 0.12)"
                                  : "rgba(245, 158, 11, 0.12)",
                              color:
                                (m.es_identificado ?? (m.estado_conciliacion === "confirmado" && m.inmueble !== "No Identificado" && !m.inmueble.startsWith("Pendiente")))
                                  ? "#059669"
                                  : (m.es_descartado ?? m.estado_conciliacion === "descartado")
                                  ? "#dc2626"
                                  : "#d97706",
                            }}
                          >
                            {m.inmueble}
                          </span>
                        </td>

                        <td style={{ padding: "6px 12px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleToggleExcluirFila(m.id)}
                            title={isExcluido ? "Restaurar fila al reporte" : "Eliminar fila del reporte"}
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              color: isExcluido ? "#10b981" : "#94a3b8",
                              padding: "4px",
                              borderRadius: "4px",
                              transition: "color 0.15s ease",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = isExcluido ? "#059669" : "#ef4444")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = isExcluido ? "#10b981" : "#94a3b8")}
                          >
                            {isExcluido ? <RotateCcw size={15} /> : <Trash2 size={15} />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pie de Acciones */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--color-border-subtle, rgba(0,0,0,0.08))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--color-card, #fcfcfc)",
          }}
        >
          <div style={{ fontSize: "12.5px", color: "var(--color-fg-muted, #64748b)" }}>
            Se exportarán exactamente <b>{movimientosActivos.length} transacciones</b> por un total de{" "}
            <b style={{ color: "var(--color-fg, #0f172a)" }}>Bs. {formatCurrencyVE(totalMontoActivo)}</b>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={exporting !== null}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid var(--color-border-subtle, #cbd5e1)",
                background: "transparent",
                color: "var(--color-fg, #334155)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cerrar
            </button>

            {/* Exportar a Excel */}
            <button
              type="button"
              onClick={() => handleExportar("excel")}
              disabled={exporting !== null || movimientosActivos.length === 0}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                background: "rgba(16, 185, 129, 0.1)",
                color: "#059669",
                fontSize: "13px",
                fontWeight: 600,
                cursor: exporting !== null || movimientosActivos.length === 0 ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.15s ease",
              }}
            >
              {exporting === "excel" ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={15} />
              )}
              <span>Descargar Excel (.xlsx)</span>
            </button>

            {/* Exportar a PDF */}
            <button
              type="button"
              onClick={() => handleExportar("pdf")}
              disabled={exporting !== null || movimientosActivos.length === 0}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                border: "none",
                background: "#0f172a",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: exporting !== null || movimientosActivos.length === 0 ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.15s ease",
              }}
            >
              {exporting === "pdf" ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <FileText size={15} />
              )}
              <span>Descargar PDF (.pdf)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
