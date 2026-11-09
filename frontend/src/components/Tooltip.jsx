import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";

export default function SuggestionTooltip({ score, razon, identificador, children }) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, showAbove: true });
  const triggerRef = useRef(null);

  // Parsear viñetas del texto de razón
  const lines = razon ? String(razon).split("\n").filter((l) => l.trim().length > 0) : [];
  const bullets = lines.filter((l) => l.startsWith("•") || l.startsWith("-")).map((l) => l.replace(/^[•\-]\s*/, ""));
  const header = lines.find((l) => !l.startsWith("•") && !l.startsWith("-")) || `Sugerido: ${identificador || "Inmueble"}`;

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const showAbove = rect.top > 260;
      setPosition({
        top: showAbove ? rect.top - 8 : rect.bottom + 8,
        left: rect.left + rect.width / 2,
        showAbove,
      });
    }
  };

  const handleMouseEnter = () => {
    updatePosition();
    setVisible(true);
  };

  const handleMouseLeave = () => {
    setVisible(false);
  };

  // Mantener la posición alineada si el usuario hace scroll
  useEffect(() => {
    if (!visible) return;
    const handleScroll = () => updatePosition();
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [visible]);

  return (
    <>
      <div
        ref={triggerRef}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          cursor: "help",
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>

      {visible &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: position.showAbove ? "auto" : `${position.top}px`,
              bottom: position.showAbove ? `${window.innerHeight - position.top}px` : "auto",
              left: `${position.left}px`,
              transform: "translateX(-50%)",
              width: "340px",
              maxWidth: "92vw",
              background: "#ffffff",
              border: "1px solid rgba(0, 0, 0, 0.14)",
              borderRadius: "12px",
              boxShadow: "0 18px 40px -4px rgba(0, 0, 0, 0.22), 0 6px 16px rgba(0, 0, 0, 0.08)",
              padding: "14px 16px",
              zIndex: 999999,
              pointerEvents: "none",
              whiteSpace: "normal",
              textAlign: "left",
            }}
          >
            {/* Cabecera del tooltip */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Sparkles size={14} style={{ color: "#111110" }} />
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#111110", letterSpacing: "-0.01em" }}>
                  Sugerencia Inteligente
                </span>
              </div>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: "999px",
                  border: "1px solid rgba(0,0,0,0.08)",
                  background:
                    score >= 80
                      ? "rgba(16, 185, 129, 0.12)"
                      : score >= 50
                      ? "rgba(245, 158, 11, 0.12)"
                      : "rgba(0,0,0,0.05)",
                  color: score >= 80 ? "#065f46" : score >= 50 ? "#92400e" : "#57534e",
                }}
              >
                {Math.round(score)}% certeza
              </span>
            </div>

            <div style={{ fontSize: "13px", fontWeight: 600, color: "#111110", marginBottom: "8px" }}>
              {identificador ? `Inmueble: ${identificador}` : header}
            </div>

            {/* Lista de razones */}
            {bullets.length > 0 ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                {bullets.map((b, idx) => (
                  <li
                    key={idx}
                    style={{
                      fontSize: "11.5px",
                      lineHeight: "1.45",
                      color: "rgba(20, 20, 19, 0.8)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "6px",
                    }}
                  >
                    <span style={{ color: "#111110", marginTop: "2px", fontWeight: 700 }}>•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: "11.5px", color: "rgba(20, 20, 19, 0.75)", lineHeight: "1.4" }}>
                {razon || "Coincidencia de datos registrados en el condominio."}
              </p>
            )}

            {/* Flechita del tooltip (arriba o abajo según showAbove) */}
            <div
              style={{
                position: "absolute",
                top: position.showAbove ? "100%" : "auto",
                bottom: position.showAbove ? "auto" : "100%",
                left: "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: position.showAbove ? "6px solid #ffffff" : "none",
                borderBottom: position.showAbove ? "none" : "6px solid #ffffff",
                filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.08))",
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}
