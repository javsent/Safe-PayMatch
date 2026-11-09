import React, { useState } from "react";
import {
  Building2,
  Users,
  FileUp,
  FolderTree,
  Sparkles,
  Download,
  CheckCircle2,
  X,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
} from "lucide-react";

const TOUR_STEPS = [
  {
    icon: ShieldCheck,
    title: "Bienvenido a Safe-PayMatch",
    subtitle: "Conciliación Bancaria Local & Inteligente",
    description:
      "Safe-PayMatch es una herramienta de escritorio diseñada para automatizar la conciliación de pagos de condominios con 100% de privacidad local. Tus datos bancarios y registros nunca salen de tu equipo.",
    highlight: "Cero nube, cero telemetría, máxima seguridad.",
  },
  {
    icon: Building2,
    title: "1. Condominios Aislados",
    subtitle: "Gestión Multi-Condominio",
    description:
      "Puedes administrar múltiples residencias o edificios de manera independiente. Cada condominio cuenta con su propio directorio de inmuebles, historial de extractos y memoria de aprendizaje.",
    highlight: "Crea tu primer condominio con un nombre y una sigla distintiva.",
  },
  {
    icon: Users,
    title: "2. Directorio de Inmuebles",
    subtitle: "Importación en 1 Clic",
    description:
      "Antes de conciliar, carga la lista de apartamentos y propietarios. Puedes importar directamente el archivo PDF de Gastos Comunes o utilizar la plantilla en Excel descargable.",
    highlight: "Soporta formatos estándar de administradoras como T4-1-A, PB-4, 08-D.",
  },
  {
    icon: FileUp,
    title: "3. Carga Inteligente de Extractos",
    subtitle: "Auto-detección y Adaptabilidad",
    description:
      "Arrastra o selecciona tus estados de cuenta bancarios en formato PDF, Excel o CSV. Soporta BNC, Banco Exterior, 100%Banco y un parser universal basado en encabezados (Fecha, Referencia, Concepto, Haber).",
    highlight: "El sistema detecta automáticamente columnas y formatos.",
  },
  {
    icon: FolderTree,
    title: "4. Archivador y Carpetas",
    subtitle: "Organización por Mes o Proyecto",
    description:
      "Evita el desorden organizando tus conciliaciones en carpetas mensuales o temáticas. Puedes fusionar carpetas duplicadas, renombrarlas o mover conciliaciones fácilmente.",
    highlight: "Las conciliaciones de un mismo mes se integran a la misma carpeta.",
  },
  {
    icon: Sparkles,
    title: "5. Motor de Aprendizaje Asociativo",
    subtitle: "Cada Confirmación Vuelve al Sistema Más Rápido",
    description:
      "El algoritmo sugiere coincidencias analizando montos, cédulas, teléfonos y conceptos. Cuando confirmas una sugerencia, Safe-PayMatch memoriza los tokens para predecir futuros pagos automáticamente.",
    highlight: "Con cada mes conciliado, el tiempo de trabajo se reduce drásticamente.",
  },
  {
    icon: Download,
    title: "6. Exportación y Auditoría",
    subtitle: "Reportes Profesionales Listos",
    description:
      "Una vez conciliados los movimientos, descarga reportes detallados en Excel estructurado o PDF listo para imprimir y presentar a las juntas de condominio.",
    highlight: "¡Estás listo para comenzar a usar Safe-PayMatch!",
  },
];

export default function GuidedTour({ isOpen, onClose }) {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const IconComponent = step.icon;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      handleFinish();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleFinish = () => {
    try {
      localStorage.setItem("safe_paymatch_tour_completed", "true");
    } catch (e) {
      console.warn("No se pudo guardar en localStorage", e);
    }
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        className="modal-content"
        style={{
          width: "100%",
          maxWidth: "540px",
          background: "var(--color-bg, #ffffff)",
          color: "var(--color-fg, #141413)",
          borderRadius: "18px",
          border: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1))",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.35)",
          padding: "32px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          position: "relative",
        }}
      >
        {/* Botón cerrar X arriba */}
        <button
          type="button"
          onClick={handleFinish}
          title="Cerrar tour"
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
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

        {/* Encabezado del paso con Icono */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "18px" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "14px",
              background: "var(--color-primary, #111110)",
              color: "var(--color-primary-fg, #ffffff)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <IconComponent size={26} />
          </div>

          <div style={{ flex: 1, paddingRight: "24px" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--color-fg-subtle, #737373)",
              }}
            >
              {step.subtitle}
            </span>
            <h2
              className="font-serif"
              style={{
                fontSize: "22px",
                fontWeight: 600,
                margin: "4px 0 0",
                lineHeight: 1.25,
                color: "var(--color-fg, #111)",
              }}
            >
              {step.title}
            </h2>
          </div>
        </div>

        {/* Descripción del paso */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p
            style={{
              fontSize: "14.5px",
              lineHeight: 1.6,
              color: "var(--color-fg-muted, rgba(20, 20, 19, 0.75))",
            }}
          >
            {step.description}
          </p>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              fontSize: "13px",
              fontWeight: 500,
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{step.highlight}</span>
          </div>
        </div>

        {/* Indicadores de progreso (dots) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          {TOUR_STEPS.map((_, idx) => (
            <div
              key={idx}
              onClick={() => setCurrentStep(idx)}
              style={{
                width: idx === currentStep ? "22px" : "7px",
                height: "7px",
                borderRadius: "999px",
                background:
                  idx === currentStep
                    ? "var(--color-primary, #111)"
                    : "var(--color-border-focus, rgba(0,0,0,0.15))",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            />
          ))}
        </div>

        {/* Pie de navegación */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "8px",
            borderTop: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08))",
          }}
        >
          <button
            type="button"
            onClick={handleFinish}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-fg-subtle, #737373)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              padding: "8px 12px",
              borderRadius: "8px",
            }}
          >
            Omitir tour
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  border: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.12))",
                  background: "transparent",
                  color: "var(--color-fg, #111)",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <ChevronLeft size={16} />
                <span>Anterior</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 18px",
                borderRadius: "10px",
                border: "none",
                background: "var(--color-primary, #111110)",
                color: "var(--color-primary-fg, #ffffff)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              }}
            >
              <span>{isLast ? "¡Comenzar a usar!" : "Siguiente"}</span>
              {!isLast && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
