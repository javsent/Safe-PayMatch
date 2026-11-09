import React, { useState, useEffect } from "react";
import { X, Check, AlertCircle, FileText, ArrowRight, HelpCircle, RefreshCw } from "lucide-react";
import { previewTableForMapping, uploadWithMapping } from "../api";

const FIELD_OPTIONS = [
  { key: "fecha", label: "📅 Fecha", required: true, bg: "rgba(59, 130, 246, 0.12)", color: "#2563eb", border: "rgba(59, 130, 246, 0.3)" },
  { key: "referencia", label: "🔑 Referencia", required: true, bg: "rgba(168, 85, 247, 0.12)", color: "#9333ea", border: "rgba(168, 85, 247, 0.3)" },
  { key: "descripcion", label: "📝 Descripción / Concepto", required: true, bg: "rgba(245, 158, 11, 0.12)", color: "#d97706", border: "rgba(245, 158, 11, 0.3)" },
  { key: "haber", label: "💰 Haber (Ingreso / Abono)", required: true, bg: "rgba(16, 185, 129, 0.12)", color: "#059669", border: "rgba(16, 185, 129, 0.3)" },
  { key: "debe", label: "🔻 Debe (Cargo bancario)", required: false, bg: "rgba(239, 68, 68, 0.12)", color: "#dc2626", border: "rgba(239, 68, 68, 0.3)" },
  { key: "ignore", label: "— Ignorar Columna —", required: false, bg: "rgba(0, 0, 0, 0.04)", color: "#64748b", border: "rgba(0, 0, 0, 0.08)" },
];

export default function ColumnMapperModal({
  isOpen,
  onClose,
  condominioId,
  file,
  carpetaId,
  carpetaNombre,
  esHistorico = false,
  titulo = "",
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [colAssignments, setColAssignments] = useState({}); // { [colIndex]: 'fecha' | 'referencia' | ... }
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && file && condominioId) {
      loadPreview();
    } else {
      setPreviewData(null);
      setColAssignments({});
      setErrorMsg("");
    }
  }, [isOpen, file, condominioId]);

  const loadPreview = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const data = await previewTableForMapping(condominioId, file);
      setPreviewData(data);

      // Pre-cargar asignaciones según sugerencias
      const initialMap = {};
      if (data.suggested_mapping) {
        Object.entries(data.suggested_mapping).forEach(([field, colIdx]) => {
          if (colIdx !== undefined && colIdx !== null && colIdx >= 0) {
            initialMap[colIdx] = field;
          }
        });
      }
      setColAssignments(initialMap);
    } catch (err) {
      setErrorMsg(err.message || "Error al leer la estructura del archivo.");
    } finally {
      setLoading(false);
    }
  };

  const handleAssignColumn = (colIdx, fieldKey) => {
    setColAssignments((prev) => {
      const updated = { ...prev };

      // Si el campo no es 'ignore', quitarlo de cualquier otra columna que lo tuviera
      if (fieldKey !== "ignore") {
        Object.keys(updated).forEach((idx) => {
          if (updated[idx] === fieldKey) {
            delete updated[idx];
          }
        });
        updated[colIdx] = fieldKey;
      } else {
        delete updated[colIdx];
      }

      return updated;
    });
  };

  // Validaciones
  const hasFecha = Object.values(colAssignments).includes("fecha");
  const hasReferencia = Object.values(colAssignments).includes("referencia");
  const hasDescripcion = Object.values(colAssignments).includes("descripcion");
  const hasHaber = Object.values(colAssignments).includes("haber");

  const canSubmit = hasFecha && hasDescripcion && hasHaber;

  const handleConfirm = async () => {
    if (!canSubmit) return;

    try {
      setSubmitting(true);
      setErrorMsg("");

      // Construir mapping inverso: { "fecha": col_idx, "referencia": col_idx, ... }
      const finalMapping = {};
      Object.entries(colAssignments).forEach(([colIdx, field]) => {
        if (field && field !== "ignore") {
          finalMapping[field] = parseInt(colIdx, 10);
        }
      });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(finalMapping));
      formData.append("banco", "Mapeo Manual");
      formData.append("es_historico", esHistorico ? "true" : "false");
      formData.append("titulo", titulo || "");
      if (carpetaId) formData.append("carpeta_id", carpetaId.toString());
      if (carpetaNombre) formData.append("carpeta_nombre", carpetaNombre);

      const res = await uploadWithMapping(condominioId, formData);
      if (onSuccess) {
        onSuccess(res);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Error al procesar el archivo con el mapeo seleccionado.");
    } finally {
      setSubmitting(false);
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
          maxWidth: "1150px",
          maxHeight: "92vh",
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
            padding: "20px 24px",
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
                background: "rgba(59, 130, 246, 0.1)",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileText size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, letterSpacing: "-0.01em" }}>
                Mapeo Interactivo de Columnas
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "var(--color-fg-muted, #666)" }}>
                Asigna qué columna corresponde a cada campo requerido. Funciona con cualquier banco o formato extraño.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
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

        {/* Cuerpo */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Alerta o Información del Archivo */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "10px",
              background: "var(--color-card, #f8fafc)",
              border: "1px solid var(--color-border-subtle, #e2e8f0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "13px" }}>
              <span style={{ color: "var(--color-fg-muted, #64748b)" }}>Archivo: </span>
              <strong style={{ color: "var(--color-fg, #0f172a)" }}>{file?.name || "Sin archivo"}</strong>
              {previewData?.total_rows ? (
                <span style={{ marginLeft: "12px", color: "#10b981", fontWeight: 600 }}>
                  • {previewData.total_rows} filas de datos detectadas
                </span>
              ) : null}
            </div>

            {/* Badges de Validación de Campos Obligatorios */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "11.5px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: hasFecha ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  color: hasFecha ? "#059669" : "#dc2626",
                }}
              >
                {hasFecha ? <Check size={12} /> : "✕"} Fecha *
              </span>

              <span
                style={{
                  fontSize: "11.5px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: hasReferencia ? "rgba(168, 85, 247, 0.12)" : "rgba(100, 116, 139, 0.12)",
                  color: hasReferencia ? "#9333ea" : "#64748b",
                }}
              >
                {hasReferencia ? <Check size={12} /> : "Opc."} Referencia
              </span>

              <span
                style={{
                  fontSize: "11.5px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: hasDescripcion ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  color: hasDescripcion ? "#059669" : "#dc2626",
                }}
              >
                {hasDescripcion ? <Check size={12} /> : "✕"} Descripción *
              </span>

              <span
                style={{
                  fontSize: "11.5px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: hasHaber ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  color: hasHaber ? "#059669" : "#dc2626",
                }}
              >
                {hasHaber ? <Check size={12} /> : "✕"} Haber (Ingreso) *
              </span>
            </div>
          </div>

          {errorMsg && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "10px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
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
              <p style={{ margin: 0, fontSize: "14px" }}>Leyendo estructura de la tabla del extracto bancario...</p>
            </div>
          ) : previewData?.headers?.length > 0 ? (
            <div
              style={{
                border: "1px solid var(--color-border-subtle, rgba(0,0,0,0.1))",
                borderRadius: "12px",
                overflow: "auto",
                maxHeight: "440px",
                background: "var(--color-card, #ffffff)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  fontSize: "12px",
                }}
              >
                <thead>
                  {/* Fila 1: Selectores de Asignación por Columna */}
                  <tr style={{ background: "var(--color-card, #f8fafc)", position: "sticky", top: 0, zIndex: 10 }}>
                    {previewData.headers.map((h, colIdx) => {
                      const assignedField = colAssignments[colIdx] || "ignore";
                      const opt = FIELD_OPTIONS.find((o) => o.key === assignedField) || FIELD_OPTIONS[FIELD_OPTIONS.length - 1];
                      return (
                        <th
                          key={`select-${colIdx}`}
                          style={{
                            padding: "10px 12px",
                            borderBottom: "2px solid var(--color-border-subtle, #e2e8f0)",
                            borderRight: "1px solid var(--color-border-subtle, #f1f5f9)",
                            minWidth: "175px",
                            background: opt.bg,
                            transition: "background 0.2s ease",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em", color: opt.color, fontWeight: 700 }}>
                              Columna #{colIdx + 1}
                            </span>
                            <select
                              value={assignedField}
                              onChange={(e) => handleAssignColumn(colIdx, e.target.value)}
                              style={{
                                width: "100%",
                                padding: "6px 8px",
                                borderRadius: "6px",
                                border: `1.5px solid ${opt.border}`,
                                backgroundColor: "var(--color-bg, #ffffff)",
                                color: opt.color,
                                fontWeight: 600,
                                fontSize: "11.5px",
                                cursor: "pointer",
                                outline: "none",
                              }}
                            >
                              {FIELD_OPTIONS.map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </th>
                      );
                    })}
                  </tr>

                  {/* Fila 2: Nombres Originales de los Encabezados Leídos */}
                  <tr style={{ background: "var(--color-card, #f1f5f9)", position: "sticky", top: "68px", zIndex: 9 }}>
                    {previewData.headers.map((h, colIdx) => (
                      <th
                        key={`header-${colIdx}`}
                        style={{
                          padding: "8px 12px",
                          textAlign: "left",
                          fontWeight: 600,
                          color: "var(--color-fg-muted, #475569)",
                          borderBottom: "1px solid var(--color-border-subtle, #cbd5e1)",
                          borderRight: "1px solid var(--color-border-subtle, #f1f5f9)",
                          fontSize: "11.5px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {previewData.sample_rows.map((row, rIdx) => (
                    <tr
                      key={`row-${rIdx}`}
                      style={{
                        background: rIdx % 2 === 0 ? "transparent" : "var(--color-card, rgba(0,0,0,0.015))",
                      }}
                    >
                      {row.map((cell, cIdx) => {
                        const isAssigned = colAssignments[cIdx] && colAssignments[cIdx] !== "ignore";
                        return (
                          <td
                            key={`cell-${rIdx}-${cIdx}`}
                            style={{
                              padding: "7px 12px",
                              borderBottom: "1px solid var(--color-border-subtle, #f1f5f9)",
                              borderRight: "1px solid var(--color-border-subtle, #f8fafc)",
                              color: isAssigned ? "var(--color-fg, #0f172a)" : "var(--color-fg-muted, #94a3b8)",
                              fontWeight: isAssigned ? 500 : 400,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "280px",
                            }}
                            title={cell}
                          >
                            {cell || <span style={{ opacity: 0.3 }}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--color-fg-muted, #777)" }}>
              No se detectaron tablas estructuradas en el archivo.
            </div>
          )}
        </div>

        {/* Pie del modal */}
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
          <div style={{ fontSize: "12px", color: "var(--color-fg-muted, #666)" }}>
            {!canSubmit ? (
              <span style={{ color: "#ef4444" }}>
                ⚠️ Asigna las columnas obligatorias: <b>Fecha</b>, <b>Descripción</b> y <b>Haber</b> para continuar.
              </span>
            ) : (
              <span style={{ color: "#10b981" }}>
                ✓ Mapeo listo para procesar. Haz clic en "Confirmar e Importar".
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
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
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canSubmit || submitting}
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                border: "none",
                background: canSubmit ? "#111110" : "rgba(0,0,0,0.2)",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.15s ease",
              }}
            >
              {submitting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Importando...</span>
                </>
              ) : (
                <>
                  <span>Confirmar e Importar</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
