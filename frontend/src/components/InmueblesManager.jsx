import React, { useState, useRef } from "react";
import { Plus, Search, Edit2, Trash2, Tag, ShieldCheck, Mail, Phone, User, Info, UploadCloud, FileSpreadsheet, FileText, Download, CheckCircle2 } from "lucide-react";
import { importarInmuebles, getPlantillaExcelUrl } from "../api";

export default function InmueblesManager({
  condominio,
  inmuebles,
  onRefresh,
  onCreateInmueble,
  onUpdateInmueble,
  onDeleteInmueble,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importOption, setImportOption] = useState("gc_pdf"); // 'gc_pdf' | 'plantilla_excel'
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const importFileRef = useRef(null);
  const [editingInmueble, setEditingInmueble] = useState(null);
  const [formData, setFormData] = useState({
    identificador: "",
    propietario: "",
    inquilino: "",
    telefonos: "",
    email: "",
    otros_datos: "",
  });
  const [loading, setLoading] = useState(false);

  const filteredInmuebles = inmuebles.filter((inm) => {
    const q = searchTerm.toLowerCase();
    const handleExecuteImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setImportResult(null);
    try {
      const res = await importarInmuebles(condominio.id, file, importOption);
      setImportResult(res);
      onRefresh();
    } catch (err) {
      alert("Error en la importación: " + err.message);
    } finally {
      setImportLoading(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  return (
      inm.identificador.toLowerCase().includes(q) ||
      inm.propietario.toLowerCase().includes(q) ||
      (inm.inquilino && inm.inquilino.toLowerCase().includes(q)) ||
      (inm.email && inm.email.toLowerCase().includes(q)) ||
      (inm.otros_datos && inm.otros_datos.toLowerCase().includes(q))
    );
  });

  const openNewModal = () => {
    setEditingInmueble(null);
    setFormData({
      identificador: "",
      propietario: "",
      inquilino: "",
      telefonos: "",
      email: "",
      otros_datos: "",
    });
    setShowModal(true);
  };

  const openEditModal = (inm) => {
    setEditingInmueble(inm);
    setFormData({
      identificador: inm.identificador,
      propietario: inm.propietario,
      inquilino: inm.inquilino || "",
      telefonos: inm.telefonos || "",
      email: inm.email || "",
      otros_datos: inm.otros_datos || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.identificador.trim() || !formData.propietario.trim()) return;

    setLoading(true);
    try {
      if (editingInmueble) {
        await onUpdateInmueble(editingInmueble.id, formData);
      } else {
        await onCreateInmueble(condominio.id, formData);
      }
      setShowModal(false);
      onRefresh();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (confirm("¿Estás seguro de eliminar este inmueble? Se eliminarán también sus tokens aprendidos.")) {
      try {
        await onDeleteInmueble(id);
        onRefresh();
      } catch (err) {
        alert("Error eliminando: " + err.message);
      }
    }
  };

  const handleExecuteImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setImportResult(null);
    try {
      const res = await importarInmuebles(condominio.id, file, importOption);
      setImportResult(res);
      onRefresh();
    } catch (err) {
      alert("Error en la importación: " + err.message);
    } finally {
      setImportLoading(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  return (
    <div style={{ maxWidth: "1140px", margin: "0 auto", padding: "32px 24px" }}>
      {/* Cabecera del Padrón */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "28px",
          borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
          paddingBottom: "20px",
        }}
      >
        <div>
          <h2
            className="font-serif"
            style={{ fontSize: "28px", fontWeight: 300, color: "#111110", marginBottom: "6px" }}
          >
            Directorio de Inmuebles
          </h2>
          <p style={{ fontSize: "14px", color: "rgba(20, 20, 19, 0.6)" }}>
            Gestiona los propietarios, contactos y palabras clave que utiliza el sistema para asociar los pagos.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            onClick={() => {
              setImportResult(null);
              setShowImportModal(true);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              background: "transparent",
              color: "#111110",
              borderRadius: "10px",
              border: "1px solid rgba(0, 0, 0, 0.15)",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0, 0, 0, 0.04)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <UploadCloud size={16} />
            <span>Importar en masa</span>
          </button>

          <button
            type="button"
            onClick={openNewModal}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              background: "#111110",
              color: "#ffffff",
              borderRadius: "10px",
              border: "none",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Plus size={16} />
            <span>Nuevo Inmueble</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtro / Búsqueda */}
      <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 14px",
            background: "rgba(0, 0, 0, 0.02)",
            border: "1px solid rgba(0, 0, 0, 0.08)",
            borderRadius: "10px",
            width: "360px",
          }}
        >
          <Search size={16} style={{ color: "rgba(20, 20, 19, 0.4)" }} />
          <input
            type="text"
            placeholder="Buscar por apto, propietario, correo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: "14px",
              width: "100%",
            }}
          />
        </div>
        <span style={{ fontSize: "13px", color: "rgba(20, 20, 19, 0.5)" }}>
          {filteredInmuebles.length} de {inmuebles.length} inmuebles registrados
        </span>
      </div>

      {/* Tabla de Inmuebles */}
      <div
        style={{
          border: "1px solid rgba(0, 0, 0, 0.08)",
          borderRadius: "14px",
          overflow: "hidden",
          background: "#ffffff",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13.5px" }}>
          <thead>
            <tr style={{ background: "rgba(0, 0, 0, 0.02)", borderBottom: "1px solid rgba(0, 0, 0, 0.08)" }}>
              <th style={{ padding: "12px 18px", fontWeight: 600, color: "#111110", width: "130px" }}>Inmueble</th>
              <th style={{ padding: "12px 18px", fontWeight: 600, color: "#111110" }}>Propietario / Inquilino</th>
              <th style={{ padding: "12px 18px", fontWeight: 600, color: "#111110" }}>Contacto</th>
              <th style={{ padding: "12px 18px", fontWeight: 600, color: "#111110" }}>Otros Datos (Manual)</th>
              <th style={{ padding: "12px 18px", fontWeight: 600, color: "#111110" }}>Datos Aprendidos por Sistema</th>
              <th style={{ padding: "12px 18px", fontWeight: 600, color: "#111110", textAlign: "right" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredInmuebles.map((inm) => (
              <tr
                key={inm.id}
                style={{
                  borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
                  transition: "background 0.1s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0, 0, 0, 0.015)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {/* Identificador */}
                <td style={{ padding: "14px 18px" }}>
                  <span
                    className="font-mono"
                    style={{
                      fontWeight: 600,
                      fontSize: "13px",
                      background: "rgba(0, 0, 0, 0.05)",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      color: "#111110",
                    }}
                  >
                    {inm.identificador}
                  </span>
                </td>

                {/* Propietario / Inquilino */}
                <td style={{ padding: "14px 18px" }}>
                  <div style={{ fontWeight: 500, color: "#111110" }}>{inm.propietario}</div>
                  {inm.inquilino && (
                    <div style={{ fontSize: "12px", color: "rgba(20, 20, 19, 0.55)", marginTop: "2px" }}>
                      Inquilino: {inm.inquilino}
                    </div>
                  )}
                </td>

                {/* Contacto */}
                <td style={{ padding: "14px 18px" }}>
                  {inm.email && (
                    <div style={{ fontSize: "12.5px", color: "rgba(20, 20, 19, 0.7)" }}>{inm.email}</div>
                  )}
                  {inm.telefonos && (
                    <div className="font-mono" style={{ fontSize: "12px", color: "rgba(20, 20, 19, 0.55)" }}>
                      {inm.telefonos}
                    </div>
                  )}
                  {!inm.email && !inm.telefonos && (
                    <span style={{ color: "rgba(20, 20, 19, 0.3)", fontSize: "12px" }}>Sin contacto</span>
                  )}
                </td>

                {/* Otros Datos Relevantes (Notas Manuales) */}
                <td style={{ padding: "14px 18px", maxWidth: "220px" }}>
                  {inm.otros_datos ? (
                    <span style={{ fontSize: "12.5px", color: "rgba(20, 20, 19, 0.75)", lineHeight: 1.3 }}>
                      {inm.otros_datos}
                    </span>
                  ) : (
                    <span style={{ color: "rgba(20, 20, 19, 0.3)", fontSize: "12px" }}>—</span>
                  )}
                </td>

                {/* Datos Determinados por Sistema (Aprendidos Automáticamente) */}
                <td style={{ padding: "14px 18px" }}>
                  {inm.datos_aprendidos && inm.datos_aprendidos.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                      {inm.datos_aprendidos.map((tok, tIdx) => (
                        <span
                          key={tIdx}
                          title={`Tipo: ${tok.tipo_token} | Confirmado ${tok.frecuencia_confirmada} veces`}
                          style={{
                            fontSize: "11px",
                            padding: "2px 7px",
                            borderRadius: "999px",
                            background: "rgba(0, 0, 0, 0.04)",
                            border: "1px solid rgba(0, 0, 0, 0.07)",
                            color: "rgba(20, 20, 19, 0.7)",
                            fontFamily: tok.tipo_token === "cuenta" || tok.tipo_token === "cedula" ? "var(--font-mono)" : "inherit",
                          }}
                        >
                          {tok.valor_normalizado} ({tok.frecuencia_confirmada}✓)
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: "rgba(20, 20, 19, 0.35)", fontSize: "11.5px", fontStyle: "italic" }}>
                      Se auto-rellenará al conciliar
                    </span>
                  )}
                </td>

                {/* Acciones */}
                <td style={{ padding: "14px 18px", textAlign: "right" }}>
                  <div style={{ display: "inline-flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => openEditModal(inm)}
                      title="Editar inmueble"
                      style={{
                        padding: "6px",
                        borderRadius: "6px",
                        border: "1px solid rgba(0, 0, 0, 0.08)",
                        background: "transparent",
                        cursor: "pointer",
                        color: "rgba(20, 20, 19, 0.6)",
                      }}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(inm.id)}
                      title="Eliminar inmueble"
                      style={{
                        padding: "6px",
                        borderRadius: "6px",
                        border: "1px solid rgba(0, 0, 0, 0.08)",
                        background: "transparent",
                        cursor: "pointer",
                        color: "rgba(20, 20, 19, 0.4)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(20, 20, 19, 0.4)")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal para Crear / Editar Inmueble */}
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
              maxWidth: "540px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.15)",
              border: "1px solid rgba(0, 0, 0, 0.08)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif" style={{ fontSize: "22px", fontWeight: 400, color: "#111110", marginBottom: "6px" }}>
              {editingInmueble ? `Editar Inmueble ${editingInmueble.identificador}` : "Nuevo Inmueble"}
            </h2>
            <p style={{ fontSize: "13.5px", color: "rgba(20, 20, 19, 0.6)", marginBottom: "22px" }}>
              Solo el número de inmueble y el propietario son obligatorios. Los demás datos ayudan al sistema a aprender.
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 500, marginBottom: "5px" }}>
                    Nro. Inmueble *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 08-D, PB-4..."
                    value={formData.identificador}
                    onChange={(e) => setFormData({ ...formData, identificador: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(0, 0, 0, 0.15)",
                      fontSize: "13.5px",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 500, marginBottom: "5px" }}>
                    Nombre del Propietario *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nombre completo"
                    value={formData.propietario}
                    onChange={(e) => setFormData({ ...formData, propietario: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(0, 0, 0, 0.15)",
                      fontSize: "13.5px",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 500, marginBottom: "5px" }}>
                    Inquilino (Si aplica)
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre del inquilino"
                    value={formData.inquilino}
                    onChange={(e) => setFormData({ ...formData, inquilino: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(0, 0, 0, 0.15)",
                      fontSize: "13.5px",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 500, marginBottom: "5px" }}>
                    Teléfono(s)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 04141234567"
                    value={formData.telefonos}
                    onChange={(e) => setFormData({ ...formData, telefonos: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(0, 0, 0, 0.15)",
                      fontSize: "13.5px",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 500, marginBottom: "5px" }}>
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  placeholder="ejemplo@correo.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(0, 0, 0, 0.15)",
                    fontSize: "13.5px",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 500, marginBottom: "5px" }}>
                  Otros Datos Relevantes (Palabras clave conocidas)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: 'Sandra Guedez realiza los pagos habituales de Yosra'"
                  value={formData.otros_datos}
                  onChange={(e) => setFormData({ ...formData, otros_datos: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(0, 0, 0, 0.15)",
                    fontSize: "13.5px",
                    fontFamily: "inherit",
                    resize: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "10px",
                    border: "1px solid rgba(0, 0, 0, 0.1)",
                    background: "transparent",
                    fontSize: "13.5px",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#111110",
                    color: "#ffffff",
                    fontSize: "13.5px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {loading ? "Guardando..." : editingInmueble ? "Actualizar" : "Guardar Inmueble"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Importación en Masa */}
      {showImportModal && (
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
          onClick={() => setShowImportModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "18px",
              padding: "32px",
              width: "100%",
              maxWidth: "580px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.15)",
              border: "1px solid rgba(0, 0, 0, 0.08)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif" style={{ fontSize: "22px", fontWeight: 400, color: "#111110", marginBottom: "6px" }}>
              Importar Inmuebles en Masa
            </h2>
            <p style={{ fontSize: "13.5px", color: "rgba(20, 20, 19, 0.6)", marginBottom: "22px" }}>
              Selecciona el formato de origen para generar automáticamente todo el padrón de propietarios.
            </p>

            {/* Selector de las 2 Opciones */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
              {/* Opción 1: GC Condominio */}
              <div
                onClick={() => setImportOption("gc_pdf")}
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1.5px solid",
                  borderColor: importOption === "gc_pdf" ? "#111110" : "rgba(0, 0, 0, 0.1)",
                  background: importOption === "gc_pdf" ? "rgba(0, 0, 0, 0.025)" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <FileText size={18} style={{ color: "#111110" }} />
                  <span style={{ fontSize: "13.5px", fontWeight: 600, color: "#111110" }}>
                    GC Gestión Condominio
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: "rgba(20, 20, 19, 0.6)", lineHeight: 1.4 }}>
                  Reporte oficial de propietarios en formato PDF exportado del sistema GC.
                </p>
              </div>

              {/* Opción 2: Plantilla Excel */}
              <div
                onClick={() => setImportOption("plantilla_excel")}
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1.5px solid",
                  borderColor: importOption === "plantilla_excel" ? "#111110" : "rgba(0, 0, 0, 0.1)",
                  background: importOption === "plantilla_excel" ? "rgba(0, 0, 0, 0.025)" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <FileSpreadsheet size={18} style={{ color: "#111110" }} />
                  <span style={{ fontSize: "13.5px", fontWeight: 600, color: "#111110" }}>
                    Plantilla Excel
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: "rgba(20, 20, 19, 0.6)", lineHeight: 1.4 }}>
                  Hoja de cálculo (.xlsx) completada con los datos de cada apartamento.
                </p>
              </div>
            </div>

            {/* Si seleccionó Plantilla Excel: botón para descargar plantilla */}
            {importOption === "plantilla_excel" && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  background: "rgba(0, 0, 0, 0.02)",
                  border: "1px solid rgba(0, 0, 0, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: "12.5px", color: "rgba(20, 20, 19, 0.7)" }}>
                  ¿No tienes la plantilla oficial?
                </span>
                <a
                  href={getPlantillaExcelUrl()}
                  download
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(0, 0, 0, 0.12)",
                    background: "#ffffff",
                    color: "#111110",
                    fontSize: "12px",
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  <Download size={13} />
                  <span>Descargar Plantilla Excel</span>
                </a>
              </div>
            )}

            {/* Dropzone / Input de archivo */}
            <div
              style={{
                border: "1px dashed rgba(0, 0, 0, 0.18)",
                borderRadius: "12px",
                padding: "24px",
                textAlign: "center",
                background: "rgba(0, 0, 0, 0.015)",
                marginBottom: "20px",
              }}
            >
              <input
                type="file"
                ref={importFileRef}
                onChange={handleExecuteImport}
                accept={importOption === "gc_pdf" ? ".pdf" : ".xlsx,.xls"}
                style={{ display: "none" }}
              />

              <UploadCloud size={24} style={{ color: "#111110", margin: "0 auto 8px auto" }} />
              <div style={{ fontSize: "13.5px", fontWeight: 500, color: "#111110", marginBottom: "4px" }}>
                {importOption === "gc_pdf" ? "Selecciona el PDF de GC Condominio" : "Selecciona la Plantilla Excel (.xlsx)"}
              </div>
              <p style={{ fontSize: "12px", color: "rgba(20, 20, 19, 0.5)", marginBottom: "14px" }}>
                {importOption === "gc_pdf"
                  ? "Se extraerán los identificadores, propietarios, cédulas y correos automáticamente."
                  : "Se importarán todas las filas completadas en la hoja de cálculo."}
              </p>

              <button
                type="button"
                disabled={importLoading}
                onClick={() => importFileRef.current?.click()}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#111110",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {importLoading ? "Procesando e importando..." : "Examinar archivo"}
              </button>
            </div>

            {/* Resultado de la importación */}
            {importResult && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  color: "#065f46",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <CheckCircle2 size={16} />
                <div>
                  <strong>¡Importación exitosa!</strong> {importResult.total} inmuebles procesados (
                  {importResult.creados} nuevos, {importResult.actualizados} actualizados).
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                style={{
                  padding: "10px 18px",
                  borderRadius: "10px",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                  background: "transparent",
                  fontSize: "13.5px",
                  cursor: "pointer",
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
