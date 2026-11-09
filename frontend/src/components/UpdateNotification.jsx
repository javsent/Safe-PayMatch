import React, { useState, useEffect } from "react";
import {
  Download,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import {
  checkAppUpdate,
  downloadAppUpdate,
  getAppUpdateStatus,
  applyAppUpdate,
} from "../api";

export default function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState({
    status: "idle",
    percent: 0,
    downloaded_bytes: 0,
    total_bytes: 0,
    error: null,
  });
  const [isChecking, setIsChecking] = useState(false);
  const [applying, setApplying] = useState(false);

  // Comprobar automáticamente 3 segundos después de cargar la aplicación
  useEffect(() => {
    const timer = setTimeout(() => {
      runCheckQuietly();
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Polling de descarga cuando esté en progreso
  useEffect(() => {
    let interval = null;
    if (downloadStatus.status === "downloading") {
      interval = setInterval(async () => {
        try {
          const status = await getAppUpdateStatus();
          setDownloadStatus(status);
        } catch (e) {
          console.error("Error consultando estado de descarga", e);
        }
      }, 500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [downloadStatus.status]);

  const runCheckQuietly = async () => {
    try {
      const data = await checkAppUpdate();
      if (data && data.has_update) {
        setUpdateInfo(data);
      }
    } catch {
      // Si no hay internet o GitHub no responde, fallar silenciosamente
    }
  };

  const handleStartDownload = async () => {
    if (!updateInfo?.download_url) return;
    try {
      setDownloadStatus((prev) => ({ ...prev, status: "downloading", percent: 0 }));
      await downloadAppUpdate(updateInfo.download_url, updateInfo.latest_version);
    } catch (e) {
      setDownloadStatus((prev) => ({
        ...prev,
        status: "error",
        error: e.message || "Error al iniciar descarga",
      }));
    }
  };

  const handleApplyUpdate = async () => {
    try {
      setApplying(true);
      await applyAppUpdate();
    } catch (e) {
      setApplying(false);
      alert("Error al aplicar actualización: " + e.message);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  // Si no hay actualización disponible, no renderizar nada flotante
  if (!updateInfo || !updateInfo.has_update) return null;

  return (
    <>
      {/* Toast / Banner flotante no intrusivo en esquina inferior derecha */}
      {!showModal && (
        <div
          onClick={() => setShowModal(true)}
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9990,
            background: "linear-gradient(135deg, #18181b 0%, #09090b 100%)",
            color: "#ffffff",
            padding: "12px 18px",
            borderRadius: "14px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            cursor: "pointer",
            animation: "slideInUp 0.3s ease-out",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "rgba(16, 185, 129, 0.2)",
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Sparkles size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
              <span>Nueva versión v{updateInfo.latest_version} disponible</span>
            </div>
            <div style={{ fontSize: "11px", color: "#a1a1aa" }}>
              Haz clic para actualizar Safe-PayMatch
            </div>
          </div>
          <button
            type="button"
            style={{
              background: "#10b981",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              marginLeft: "6px",
            }}
          >
            Ver
          </button>
        </div>
      )}

      {/* Modal de Actualización */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "520px",
              background: "var(--color-bg, #ffffff)",
              color: "var(--color-fg, #141413)",
              borderRadius: "16px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1))",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08))",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "rgba(16, 185, 129, 0.12)",
                    color: "#10b981",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                    Actualización de Safe-PayMatch
                  </h3>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--color-fg-subtle, #71717a)" }}>
                    Versión actual: v{updateInfo.current_version} → Nueva: <b>v{updateInfo.latest_version}</b>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={applying}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-fg-muted, #71717a)",
                  padding: "4px",
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Contenido */}
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Notas de la versión */}
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--color-fg-subtle, #71717a)",
                    display: "block",
                    marginBottom: "8px",
                  }}
                >
                  Novedades de esta versión ({updateInfo.release_name})
                </label>
                <div
                  style={{
                    maxHeight: "160px",
                    overflowY: "auto",
                    padding: "12px 14px",
                    background: "var(--color-card, rgba(0, 0, 0, 0.03))",
                    borderRadius: "10px",
                    border: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08))",
                    fontSize: "12.5px",
                    lineHeight: "1.5",
                    whiteSpace: "pre-wrap",
                    color: "var(--color-fg, #141413)",
                  }}
                >
                  {updateInfo.release_notes || "Mejoras de rendimiento y correcciones generales."}
                </div>
              </div>

              {/* Barra de progreso si está descargando */}
              {downloadStatus.status === "downloading" && (
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    background: "var(--color-card, rgba(0, 0, 0, 0.03))",
                    border: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08))",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "12px",
                      marginBottom: "6px",
                      fontWeight: 600,
                    }}
                  >
                    <span>Descargando instalador...</span>
                    <span>
                      {formatBytes(downloadStatus.downloaded_bytes)} / {formatBytes(downloadStatus.total_bytes)} (
                      {downloadStatus.percent}%)
                    </span>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      background: "rgba(0, 0, 0, 0.1)",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${downloadStatus.percent}%`,
                        background: "#10b981",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Estado: Listo para aplicar */}
              {downloadStatus.status === "ready" && (
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "12px",
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <CheckCircle2 size={22} color="#10b981" />
                  <div style={{ fontSize: "12.5px" }}>
                    <b>¡Instalador descargado!</b>
                    <div style={{ color: "var(--color-fg-subtle, #555)" }}>
                      Al hacer clic en <b>Instalar y Reiniciar</b>, Safe-PayMatch se cerrará momentáneamente para aplicar la actualización.
                    </div>
                  </div>
                </div>
              )}

              {/* Error si ocurre */}
              {downloadStatus.status === "error" && (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "10px",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "#ef4444",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <AlertCircle size={16} />
                  <span>{downloadStatus.error}</span>
                </div>
              )}

              {/* Mensaje de seguridad contable */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "11.5px",
                  color: "var(--color-fg-subtle, #71717a)",
                  padding: "8px 0",
                }}
              >
                <ShieldCheck size={16} color="#10b981" />
                <span>
                  <b>Garantía de integridad:</b> Tu base de datos y conciliaciones no se modificarán ni perderán.
                </span>
              </div>
            </div>

            {/* Footer con botones de acción */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08))",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--color-card, rgba(0, 0, 0, 0.01))",
              }}
            >
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={applying}
                style={{
                  padding: "9px 16px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.15))",
                  background: "transparent",
                  color: "var(--color-fg, #141413)",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Recordar más tarde
              </button>

              {downloadStatus.status === "idle" && (
                <button
                  type="button"
                  onClick={handleStartDownload}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#10b981",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Download size={16} />
                  Descargar e Instalar (v{updateInfo.latest_version})
                </button>
              )}

              {downloadStatus.status === "downloading" && (
                <button
                  type="button"
                  disabled
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "rgba(16, 185, 129, 0.5)",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <RefreshCw size={16} className="animate-spin" />
                  Descargando... {downloadStatus.percent}%
                </button>
              )}

              {downloadStatus.status === "ready" && (
                <button
                  type="button"
                  onClick={handleApplyUpdate}
                  disabled={applying}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#10b981",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: applying ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {applying ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Iniciando instalador...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      Instalar y Reiniciar Ahora
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
