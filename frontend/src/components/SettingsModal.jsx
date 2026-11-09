import React, { useState, useEffect } from "react";
import {
  Settings,
  Sun,
  Moon,
  HelpCircle,
  Database,
  ShieldCheck,
  X,
  Check,
  Info,
  Laptop,
  RefreshCw,
  Sparkles,
  Download,
  AlertCircle,
} from "lucide-react";
import {
  fetchVersion,
  checkAppUpdate,
  downloadAppUpdate,
  getAppUpdateStatus,
  applyAppUpdate,
} from "../api";

export default function SettingsModal({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  onStartTour,
}) {
  const [versionInfo, setVersionInfo] = useState({
    version: "1.1.0",
    app_name: "Safe-PayMatch",
    channel: "stable",
    db_path: "Cargando...",
  });

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadVersion();
    }
  }, [isOpen]);

  const loadVersion = async () => {
    try {
      const data = await fetchVersion();
      setVersionInfo(data);
    } catch (e) {
      console.warn("No se pudo obtener versión de backend", e);
    }
  };

  const handleCheckUpdate = async () => {
    try {
      setCheckingUpdate(true);
      setUpdateResult(null);
      const res = await checkAppUpdate();
      setUpdateResult(res);
    } catch (e) {
      setUpdateResult({ error: e.message || "Error al verificar actualizaciones" });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownload = async () => {
    if (!updateResult?.download_url) return;
    try {
      setDownloading(true);
      await downloadAppUpdate(updateResult.download_url, updateResult.latest_version);
      const poll = setInterval(async () => {
        try {
          const st = await getAppUpdateStatus();
          setDownloadProgress(st.percent || 0);
          if (st.status === "ready") {
            clearInterval(poll);
            setDownloading(false);
            setUpdateReady(true);
          } else if (st.status === "error") {
            clearInterval(poll);
            setDownloading(false);
            alert("Error descargando actualización: " + st.error);
          }
        } catch {
          clearInterval(poll);
          setDownloading(false);
        }
      }, 500);
    } catch (e) {
      setDownloading(false);
      alert("Error: " + e.message);
    }
  };

  const handleApply = async () => {
    try {
      await applyAppUpdate();
    } catch (e) {
      alert("Error aplicando actualización: " + e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        animation: "fadeIn 0.2s ease-out",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-content"
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "var(--color-bg, #ffffff)",
          color: "var(--color-fg, #141413)",
          borderRadius: "18px",
          border: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1))",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.35)",
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          position: "relative",
        }}
      >
        {/* Cabecera */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "var(--color-primary, #111110)",
                color: "var(--color-primary-fg, #ffffff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Settings size={20} />
            </div>
            <div>
              <h2
                className="font-serif"
                style={{ fontSize: "20px", fontWeight: 600, margin: 0, color: "var(--color-fg, #111)" }}
              >
                Configuración & Preferencias
              </h2>
              <span style={{ fontSize: "12px", color: "var(--color-fg-muted, #737373)" }}>
                Safe-PayMatch v{versionInfo.version}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-fg-muted, #888)",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Sección: Tema visual (Light vs OLED Dark) */}
        <div>
          <label
            style={{
              fontSize: "13px",
              fontWeight: 600,
              display: "block",
              marginBottom: "10px",
              color: "var(--color-fg, #111)",
            }}
          >
            Tema de la Interfaz
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {/* Opción Claro */}
            <button
              type="button"
              onClick={() => onThemeChange("light")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px",
                borderRadius: "12px",
                border: "2px solid",
                borderColor: theme === "light" ? "var(--color-primary, #111)" : "var(--color-border-subtle, rgba(0,0,0,0.1))",
                background: theme === "light" ? "rgba(0, 0, 0, 0.04)" : "transparent",
                color: "var(--color-fg, #111)",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: "#f4f4f3",
                  color: "#111",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sun size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 600 }}>Modo Claro</div>
                <div style={{ fontSize: "11px", color: "var(--color-fg-subtle, #888)" }}>Editorial blanco</div>
              </div>
              {theme === "light" && <Check size={16} />}
            </button>

            {/* Opción OLED Dark */}
            <button
              type="button"
              onClick={() => onThemeChange("dark")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px",
                borderRadius: "12px",
                border: "2px solid",
                borderColor: theme === "dark" ? "#10b981" : "var(--color-border-subtle, rgba(0,0,0,0.1))",
                background: theme === "dark" ? "rgba(16, 185, 129, 0.1)" : "transparent",
                color: "var(--color-fg, #111)",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: "#000000",
                  color: "#ffffff",
                  border: "1px solid #333",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Moon size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 600 }}>Modo OLED</div>
                <div style={{ fontSize: "11px", color: "var(--color-fg-subtle, #888)" }}>Negro puro (#000)</div>
              </div>
              {theme === "dark" && <Check size={16} color="#10b981" />}
            </button>
          </div>
        </div>

        {/* Sección: Guía Interactiva */}
        <div>
          <label
            style={{
              fontSize: "13px",
              fontWeight: 600,
              display: "block",
              marginBottom: "10px",
              color: "var(--color-fg, #111)",
            }}
          >
            Guía y Soporte
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              borderRadius: "12px",
              border: "1px solid var(--color-border-subtle, rgba(0,0,0,0.1))",
              background: "var(--color-card, rgba(0,0,0,0.02))",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <HelpCircle size={20} color="var(--color-fg-muted, #666)" />
              <div>
                <div style={{ fontSize: "13.5px", fontWeight: 500 }}>Tutorial Guiado</div>
                <div style={{ fontSize: "11.5px", color: "var(--color-fg-subtle, #888)" }}>
                  Recorre paso a paso las funciones principales
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onStartTour();
              }}
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                border: "1px solid var(--color-border-focus, rgba(0,0,0,0.2))",
                background: "var(--color-primary, #111)",
                color: "var(--color-primary-fg, #fff)",
                fontSize: "12.5px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Hacer Tour de nuevo
            </button>
          </div>
        </div>

        {/* Sección: Actualizaciones de Software (GitHub) */}
        <div>
          <label
            style={{
              fontSize: "13px",
              fontWeight: 600,
              display: "block",
              marginBottom: "8px",
              color: "var(--color-fg, #111)",
            }}
          >
            Actualizaciones del Sistema
          </label>
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              border: "1px solid var(--color-border-subtle, rgba(0,0,0,0.1))",
              background: "var(--color-card, rgba(0,0,0,0.02))",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Sparkles size={18} color="#10b981" />
                <div>
                  <div style={{ fontSize: "13.5px", fontWeight: 600 }}>
                    Safe-PayMatch v{versionInfo.version}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-fg-subtle, #888)" }}>
                    Canal: {versionInfo.channel || "stable"} • Repositorio GitHub: javsent/Safe-PayMatch
                  </div>
                </div>
              </div>

              {!updateResult?.has_update && !updateReady && (
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "8px",
                    border: "1px solid var(--color-border-subtle, rgba(0,0,0,0.15))",
                    background: "transparent",
                    color: "var(--color-fg, #111)",
                    fontSize: "12.5px",
                    fontWeight: 500,
                    cursor: checkingUpdate ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <RefreshCw size={13} className={checkingUpdate ? "animate-spin" : ""} />
                  {checkingUpdate ? "Buscando..." : "Buscar actualizaciones"}
                </button>
              )}
            </div>

            {/* Resultado de la búsqueda */}
            {updateResult && !updateResult.has_update && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "rgba(16, 185, 129, 0.08)",
                  color: "#10b981",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Check size={14} />
                <span>
                  {updateResult.message || "Tu aplicación está actualizada a la versión más reciente."}
                </span>
              </div>
            )}

            {updateResult && updateResult.has_update && !updateReady && (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#10b981" }}>
                    ¡Nueva versión v{updateResult.latest_version} disponible!
                  </span>
                  {!downloading ? (
                    <button
                      type="button"
                      onClick={handleDownload}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "none",
                        background: "#10b981",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Download size={13} />
                      Descargar e Instalar
                    </button>
                  ) : (
                    <span style={{ fontSize: "12px", color: "#10b981", fontWeight: 600 }}>
                      Descargando... {downloadProgress}%
                    </span>
                  )}
                </div>
                {updateResult.release_notes && (
                  <div
                    style={{
                      fontSize: "11.5px",
                      color: "var(--color-fg-muted, #555)",
                      maxHeight: "80px",
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {updateResult.release_notes}
                  </div>
                )}
              </div>
            )}

            {updateReady && (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid rgba(16, 185, 129, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: 600 }}>
                  Instalador descargado y listo para aplicar.
                </span>
                <button
                  type="button"
                  onClick={handleApply}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "6px",
                    border: "none",
                    background: "#10b981",
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Reiniciar y Actualizar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sección: Base de Datos y Datos Locales */}
        <div>
          <label
            style={{
              fontSize: "13px",
              fontWeight: 600,
              display: "block",
              marginBottom: "8px",
              color: "var(--color-fg, #111)",
            }}
          >
            Almacenamiento Local de Datos
          </label>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              border: "1px solid var(--color-border-subtle, rgba(0,0,0,0.1))",
              background: "var(--color-card, rgba(0,0,0,0.02))",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 500 }}>
              <Database size={15} color="#10b981" />
              <span>Base de Datos SQLite Activa:</span>
            </div>
            <code
              style={{
                fontSize: "11.5px",
                wordBreak: "break-all",
                color: "var(--color-fg-muted, #555)",
                background: "rgba(0,0,0,0.05)",
                padding: "6px 8px",
                borderRadius: "6px",
              }}
            >
              {versionInfo.db_path}
            </code>
            <div style={{ fontSize: "11px", color: "var(--color-fg-subtle, #888)", marginTop: "2px" }}>
              Los datos residen en tu equipo local y nunca se sobreescriben al actualizar la aplicación.
            </div>
          </div>
        </div>

        {/* Pie informativo de privacidad */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "12px",
            borderTop: "1px solid var(--color-border-subtle, rgba(0,0,0,0.08))",
            fontSize: "11.5px",
            color: "var(--color-fg-subtle, #888)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <ShieldCheck size={14} color="#10b981" />
            <span>100% Offline & Seguro</span>
          </div>
          <span>Safe-PayMatch Build 2026</span>
        </div>
      </div>
    </div>
  );
}
