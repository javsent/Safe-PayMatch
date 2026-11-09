import React, { useState, useEffect } from "react";
import {
  fetchCondominios,
  createCondominio,
  deleteCondominio,
  fetchInmuebles,
  createInmueble,
  updateInmueble,
  deleteInmueble,
} from "./api";
import CondominioSelector from "./components/CondominioSelector";
import ConciliacionPanel from "./components/ConciliacionPanel";
import InmueblesManager from "./components/InmueblesManager";
import SettingsModal from "./components/SettingsModal";
import GuidedTour from "./components/GuidedTour";
import UpdateNotification from "./components/UpdateNotification";
import { Building2, Layers, Users, ChevronLeft, ShieldCheck, Settings } from "lucide-react";

export default function App() {
  const [condominios, setCondominios] = useState([]);
  const [selectedCondominio, setSelectedCondominio] = useState(null);
  const [inmuebles, setInmuebles] = useState([]);
  const [activeTab, setActiveTab] = useState("conciliacion"); // 'conciliacion' | 'inmuebles'
  const [loading, setLoading] = useState(true);

  // Tema: 'light' o 'dark' (OLED Black)
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("safe_paymatch_theme") || "light";
    } catch {
      return "light";
    }
  });

  // Modales de configuración y tour
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showTour, setShowTour] = useState(false);

  // Aplicar clase theme al body
  useEffect(() => {
    if (theme === "dark") {
      document.body.classList.add("theme-dark");
      document.body.classList.remove("theme-light");
    } else {
      document.body.classList.add("theme-light");
      document.body.classList.remove("theme-dark");
    }
    try {
      localStorage.setItem("safe_paymatch_theme", theme);
    } catch (e) {
      console.warn("Error guardando tema", e);
    }
  }, [theme]);

  // Cargar condominios al montar y verificar tour inicial
  useEffect(() => {
    loadCondominios();
    try {
      const tourDone = localStorage.getItem("safe_paymatch_tour_completed");
      if (!tourDone) {
        setShowTour(true);
      }
    } catch {
      // Ignorar si localStorage no está disponible
    }
  }, []);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
  };

  const loadCondominios = async () => {
    try {
      setLoading(true);
      const data = await fetchCondominios();
      setCondominios(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadInmuebles = async (condoId) => {
    try {
      const data = await fetchInmuebles(condoId);
      setInmuebles(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectCondominio = (condo) => {
    setSelectedCondominio(condo);
    setActiveTab("conciliacion");
    loadInmuebles(condo.id);
  };

  const handleCreateCondominio = async (data) => {
    await createCondominio(data);
    await loadCondominios();
  };

  const handleDeleteCondominio = async (id) => {
    await deleteCondominio(id);
    if (selectedCondominio?.id === id) {
      setSelectedCondominio(null);
    }
    await loadCondominios();
  };

  if (!selectedCondominio) {
    return (
      <>
        <CondominioSelector
          condominios={condominios}
          onSelectCondominio={handleSelectCondominio}
          onCreateCondominio={handleCreateCondominio}
          onDeleteCondominio={handleDeleteCondominio}
          onOpenSettings={() => setShowSettingsModal(true)}
          onStartTour={() => setShowTour(true)}
          theme={theme}
        />
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          theme={theme}
          onThemeChange={handleThemeChange}
          onStartTour={() => setShowTour(true)}
        />
        <GuidedTour
          isOpen={showTour}
          onClose={() => setShowTour(false)}
        />
        <UpdateNotification />
      </>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg, #ffffff)", color: "var(--color-fg, #141413)", display: "flex", flexDirection: "column" }}>
      {/* Barra de Navegación Superior - Estilo White Signifier */}
      <header
        style={{
          borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "0 24px",
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo y Botón de Volver al Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button
              type="button"
              onClick={() => setSelectedCondominio(null)}
              title="Cambiar de condominio"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "8px",
                border: "1px solid rgba(0, 0, 0, 0.08)",
                background: "rgba(0, 0, 0, 0.02)",
                color: "rgba(20, 20, 19, 0.7)",
                fontSize: "12.5px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(0, 0, 0, 0.05)";
                e.currentTarget.style.color = "#111110";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(0, 0, 0, 0.02)";
                e.currentTarget.style.color = "rgba(20, 20, 19, 0.7)";
              }}
            >
              <ChevronLeft size={15} />
              <span>Condominios</span>
            </button>

            <div style={{ height: "20px", width: "1px", background: "rgba(0, 0, 0, 0.1)" }} />

            {/* Condominio Activo */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "6px",
                  background: "#111110",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                {selectedCondominio.icono || selectedCondominio.nombre.substring(0, 2).toUpperCase()}
              </div>
              <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-fg, #111110)", letterSpacing: "-0.01em" }}>
                {selectedCondominio.nombre}
              </span>
            </div>
          </div>

          {/* Tabs de Navegación y Botón de Opciones */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <nav style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setActiveTab("conciliacion")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "7px 16px",
                  borderRadius: "999px",
                  border: "1px solid",
                  borderColor: activeTab === "conciliacion" ? "var(--color-primary, #111110)" : "transparent",
                  background: activeTab === "conciliacion" ? "var(--color-primary, #111110)" : "transparent",
                  color: activeTab === "conciliacion" ? "var(--color-primary-fg, #ffffff)" : "var(--color-fg-muted, rgba(20, 20, 19, 0.65))",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <Layers size={14} />
                <span>Conciliación</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("inmuebles")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "7px 16px",
                  borderRadius: "999px",
                  border: "1px solid",
                  borderColor: activeTab === "inmuebles" ? "var(--color-primary, #111110)" : "transparent",
                  background: activeTab === "inmuebles" ? "var(--color-primary, #111110)" : "transparent",
                  color: activeTab === "inmuebles" ? "var(--color-primary-fg, #ffffff)" : "var(--color-fg-muted, rgba(20, 20, 19, 0.65))",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <Users size={14} />
                <span>Directorio de Inmuebles ({inmuebles.length})</span>
              </button>
            </nav>

            <div style={{ height: "20px", width: "1px", background: "var(--color-border-subtle, rgba(0, 0, 0, 0.1))" }} />

            {/* Botón de Configuración y Preferencias */}
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              title="Configuración, Tema & Tour"
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                border: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1))",
                background: "var(--color-card, rgba(0, 0, 0, 0.02))",
                color: "var(--color-fg-muted, #555)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Settings size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main style={{ flex: 1, paddingBottom: "48px" }}>
        {activeTab === "conciliacion" ? (
          <ConciliacionPanel
            condominio={selectedCondominio}
            inmuebles={inmuebles}
            onRefreshInmuebles={() => loadInmuebles(selectedCondominio.id)}
          />
        ) : (
          <InmueblesManager
            condominio={selectedCondominio}
            inmuebles={inmuebles}
            onRefresh={() => loadInmuebles(selectedCondominio.id)}
            onCreateInmueble={createInmueble}
            onUpdateInmueble={updateInmueble}
            onDeleteInmueble={deleteInmueble}
          />
        )}
      </main>

      {/* Modales de Configuración y Tour */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        theme={theme}
        onThemeChange={handleThemeChange}
        onStartTour={() => setShowTour(true)}
      />
      <GuidedTour
        isOpen={showTour}
        onClose={() => setShowTour(false)}
      />
      <UpdateNotification />
    </div>
  );
}
