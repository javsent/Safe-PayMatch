import React, { useState } from "react";
import { Building, Plus, Trash2, ArrowRight, ShieldCheck, AlertCircle, Settings, HelpCircle } from "lucide-react";

export default function CondominioSelector({
  condominios,
  onSelectCondominio,
  onCreateCondominio,
  onDeleteCondominio,
  onOpenSettings,
  onStartTour,
  theme,
}) {
  const [showModal, setShowModal] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setLoading(true);
    try {
      await onCreateCondominio({
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        icono: nombre.trim().substring(0, 2).toUpperCase(),
      });
      setNombre("");
      setDescripcion("");
      setShowModal(false);
    } catch (err) {
      alert("Error creando condominio: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (deleteConfirmId === id) {
      try {
        await onDeleteCondominio(id);
        setDeleteConfirmId(null);
      } catch (err) {
        alert("Error eliminando: " + err.message);
      }
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 5000);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        background: "var(--color-bg, #ffffff)",
        color: "var(--color-fg, #141413)",
        position: "relative",
      }}
    >
      {/* Botones de acción superior derecha: Configuración y Tour */}
      <div
        style={{
          position: "absolute",
          top: "24px",
          right: "24px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        {onStartTour && (
          <button
            type="button"
            onClick={onStartTour}
            title="Ver tour interactivo"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 12px",
              borderRadius: "10px",
              border: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08))",
              background: "var(--color-card, rgba(0, 0, 0, 0.02))",
              color: "var(--color-fg-muted, #555)",
              fontSize: "12.5px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <HelpCircle size={15} />
            <span>Tour</span>
          </button>
        )}

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            title="Configuración y Preferencias"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 12px",
              borderRadius: "10px",
              border: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08))",
              background: "var(--color-card, rgba(0, 0, 0, 0.02))",
              color: "var(--color-fg-muted, #555)",
              fontSize: "12.5px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Settings size={15} />
            <span>Preferencias</span>
          </button>
        )}
      </div>

      {/* Encabezado Editorial - Inspirado en White Signifier & Chrome */}
      <div style={{ textAlign: "center", maxWidth: "600px", marginBottom: "48px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 12px",
            borderRadius: "999px",
            background: "rgba(0, 0, 0, 0.04)",
            border: "1px solid rgba(0, 0, 0, 0.06)",
            fontSize: "12px",
            fontWeight: 500,
            color: "rgba(20, 20, 19, 0.7)",
            marginBottom: "16px",
          }}
        >
          <ShieldCheck size={14} />
          <span>Conciliación Bancaria Segura & Local</span>
        </div>

        <h1
          className="font-serif"
          style={{
            fontSize: "clamp(2rem, 3.5vw, 2.75rem)",
            fontWeight: 300,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            color: "#111110",
            marginBottom: "12px",
          }}
        >
          ¿En qué condominio trabajarás hoy?
        </h1>

        <p
          style={{
            fontSize: "15px",
            color: "rgba(20, 20, 19, 0.55)",
            lineHeight: 1.5,
          }}
        >
          Selecciona un espacio residencial para conciliar pagos bancarios o gestionar el padrón de inmuebles.
        </p>
      </div>

      {/* Rejilla de Condominios Stacked */}
      <div
        style={{
          width: "100%",
          maxWidth: "680px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        {condominios.length === 0 && (
          <div
            style={{
              padding: "32px 24px",
              borderRadius: "14px",
              border: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08))",
              background: "var(--color-card, rgba(0, 0, 0, 0.02))",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "rgba(16, 185, 129, 0.1)",
                color: "#10b981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Building size={24} />
            </div>
            <h3 style={{ fontSize: "17px", fontWeight: 600, margin: 0 }}>
              Sin condominios registrados
            </h3>
            <p style={{ fontSize: "13.5px", color: "var(--color-fg-muted, #666)", maxWidth: "420px", margin: 0 }}>
              Esta es una instalación limpia. Para comenzar a conciliar extractos bancarios, agrega tu primer condominio con el botón de abajo.
            </p>
            {onStartTour && (
              <button
                type="button"
                onClick={onStartTour}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  marginTop: "6px",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border-subtle, rgba(0,0,0,0.12))",
                  background: "transparent",
                  color: "var(--color-fg, #111)",
                  fontSize: "12.5px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <HelpCircle size={14} />
                <span>Ver tour de introducción</span>
              </button>
            )}
          </div>
        )}

        {condominios.map((condo) => (
          <div
            key={condo.id}
            onClick={() => onSelectCondominio(condo)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px 24px",
              background: "rgba(0, 0, 0, 0.02)",
              border: "1px solid rgba(0, 0, 0, 0.08)",
              borderRadius: "14px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0, 0, 0, 0.045)";
              e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.18)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(0, 0, 0, 0.02)";
              e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.08)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
              {/* Badge tipográfico sobrio */}
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "10px",
                  background: "#111110",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                }}
              >
                {condo.icono || condo.nombre.substring(0, 2).toUpperCase()}
              </div>

              <div>
                <h3
                  style={{
                    fontSize: "17px",
                    fontWeight: 500,
                    color: "#111110",
                    marginBottom: "3px",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {condo.nombre}
                </h3>
                <div
                  style={{
                    fontSize: "13px",
                    color: "rgba(20, 20, 19, 0.5)",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <span>{condo.descripcion || "Administración general"}</span>
                  <span style={{ fontSize: "10px" }}>•</span>
                  <span>{condo.total_inmuebles || 0} inmuebles</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Botón eliminar cuidadoso */}
              <button
                type="button"
                onClick={(e) => handleDelete(condo.id, e)}
                title={deleteConfirmId === condo.id ? "Clic de nuevo para confirmar eliminación" : "Eliminar condominio"}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: deleteConfirmId === condo.id ? "1px solid #ef4444" : "1px solid transparent",
                  background: deleteConfirmId === condo.id ? "rgba(239, 68, 68, 0.1)" : "transparent",
                  color: deleteConfirmId === condo.id ? "#dc2626" : "rgba(20, 20, 19, 0.4)",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (deleteConfirmId !== condo.id) {
                    e.currentTarget.style.color = "#dc2626";
                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.06)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (deleteConfirmId !== condo.id) {
                    e.currentTarget.style.color = "rgba(20, 20, 19, 0.4)";
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <Trash2 size={15} />
                {deleteConfirmId === condo.id && <span>¿Confirmar?</span>}
              </button>

              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(20, 20, 19, 0.4)",
                }}
              >
                <ArrowRight size={18} />
              </div>
            </div>
          </div>
        ))}

        {/* Botón Añadir Condominio (Rectangular stacked dashed) */}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            padding: "20px 24px",
            background: "transparent",
            border: "1px dashed rgba(0, 0, 0, 0.16)",
            borderRadius: "14px",
            cursor: "pointer",
            color: "#111110",
            fontSize: "15px",
            fontWeight: 500,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.4)";
            e.currentTarget.style.background = "rgba(0, 0, 0, 0.02)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.16)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <Plus size={18} />
          <span>Añadir nuevo condominio</span>
        </button>
      </div>

      {/* Modal para Crear Condominio */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.35)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 1000,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "18px",
              padding: "32px",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.15)",
              border: "1px solid rgba(0, 0, 0, 0.08)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="font-serif"
              style={{
                fontSize: "22px",
                fontWeight: 400,
                color: "#111110",
                marginBottom: "8px",
              }}
            >
              Nuevo Condominio
            </h2>
            <p style={{ fontSize: "14px", color: "rgba(20, 20, 19, 0.6)", marginBottom: "24px" }}>
              Registra el nombre de la residencia para comenzar a conciliar sus estados de cuenta.
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px", color: "#111110" }}>
                  Nombre del Condominio *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Res. Bahia Platinum, Lomas de Mañongo..."
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid rgba(0, 0, 0, 0.15)",
                    fontSize: "14px",
                    outline: "none",
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px", color: "#111110" }}>
                  Ubicación o Detalle (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Torre A y B, Urbanización..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid rgba(0, 0, 0, 0.15)",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "10px",
                    border: "1px solid rgba(0, 0, 0, 0.1)",
                    background: "transparent",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || !nombre.trim()}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#111110",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {loading ? "Creando..." : "Crear Condominio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
