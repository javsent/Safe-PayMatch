import React, { useState, useEffect, useRef } from "react";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Download,
  FileText,
  CheckCheck,
  Filter,
  Sparkles,
  Search,
  Folder,
  FolderArchive,
  FolderOpen,
  ArrowLeft,
  Plus,
  Play,
  Pause,
  Pencil,
  Check,
  Trash2,
  Clock,
  Calendar,
  Building,
  ChevronDown,
  ChevronRight,
  GitMerge,
  MoveRight,
  FolderPlus,
  X,
  SlidersHorizontal,
} from "lucide-react";
import SuggestionTooltip from "./Tooltip";
import ColumnMapperModal from "./ColumnMapperModal";
import ReporteGeneralModal from "./ReporteGeneralModal";
import {
  uploadEstadoCuenta,
  confirmarMovimiento,
  confirmarLote,
  getExportUrl,
  getExportExcelUrl,
  getExportPdfUrl,
  fetchEstadosCuenta,
  fetchEstadoCuenta,
  updateEstadoCuentaTitulo,
  deleteEstadoCuenta,
  fetchCarpetas,
  createCarpeta,
  updateCarpeta,
  deleteCarpeta,
  fusionarCarpetas,
  moverConciliacion,
  fetchBancos,
  createBanco,
  deleteBanco,
} from "../api";

export default function ConciliacionPanel({
  condominio,
  inmuebles,
  onRefreshInmuebles,
}) {
  // Estados de Navegación y Vistas: 'carpetas' | 'conciliando' | 'nueva'
  const [vista, setVista] = useState("carpetas");
  const [carpetas, setCarpetas] = useState([]);
  const [loadingCarpetas, setLoadingCarpetas] = useState(false);
  const [carpetasColapsadas, setCarpetasColapsadas] = useState({});

  const toggleCarpeta = (mesKey) => {
    setCarpetasColapsadas((prev) => ({
      ...prev,
      [mesKey]: !prev[mesKey],
    }));
  };

  // Estados de Conciliación Activa
  const [loading, setLoading] = useState(false);
  const [estadoCuenta, setEstadoCuenta] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState("ingresos"); // 'ingresos', 'todos', 'pendientes', 'confirmados'
  const [searchTerm, setSearchTerm] = useState("");
  const [bancoSeleccionado, setBancoSeleccionado] = useState("auto"); // 'auto', 'bnc', 'exterior', '100banco' o nombre personalizado
  const [bancosList, setBancosList] = useState([]);
  const [mostrarInputOtroBanco, setMostrarInputOtroBanco] = useState(false);
  const [nombreNuevoBanco, setNombreNuevoBanco] = useState("");
  const [guardandoBanco, setGuardandoBanco] = useState(false);

  useEffect(() => {
    loadBancos();
  }, []);

  const loadBancos = async () => {
    try {
      const data = await fetchBancos();
      setBancosList(data);
    } catch (e) {
      console.warn("Error cargando lista de bancos", e);
    }
  };

  const handleGuardarNuevoBanco = async () => {
    const nom = nombreNuevoBanco.trim();
    if (!nom) return;
    try {
      setGuardandoBanco(true);
      await createBanco(nom);
      await loadBancos();
      setBancoSeleccionado(nom);
      setNombreNuevoBanco("");
      setMostrarInputOtroBanco(false);
      showNotice(`Banco "${nom}" guardado en tu lista personalizada.`);
    } catch (e) {
      alert("Error al guardar banco: " + (e.message || e));
    } finally {
      setGuardandoBanco(false);
    }
  };

  const handleEliminarBanco = async (bancoNom) => {
    if (!confirm(`¿Eliminar el banco "${bancoNom}" de tu lista personalizada?`)) return;
    try {
      await deleteBanco(bancoNom);
      if (bancoSeleccionado === bancoNom) {
        setBancoSeleccionado("auto");
      }
      await loadBancos();
      showNotice(`Banco "${bancoNom}" eliminado.`);
    } catch (e) {
      alert("Error al eliminar banco: " + (e.message || e));
    }
  };
  const [esHistorico, setEsHistorico] = useState(false);
  const [tituloNuevo, setTituloNuevo] = useState("");
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [tituloTemp, setTituloTemp] = useState("");

  // Estados de Gestión Integral de Carpetas
  const [editandoCarpetaId, setEditandoCarpetaId] = useState(null);
  const [nombreCarpetaTemp, setNombreCarpetaTemp] = useState("");
  const [modalFusionar, setModalFusionar] = useState({ open: false, carpetaOrigen: null, carpetaDestinoId: "" });
  const [modalMover, setModalMover] = useState({ open: false, item: null, nuevaCarpetaId: "" });
  const [modalNuevaCarpeta, setModalNuevaCarpeta] = useState(false);
  const [nombreNuevaCarpeta, setNombreNuevaCarpeta] = useState("");
  const [carpetaModoSubida, setCarpetaModoSubida] = useState("auto"); // 'auto', 'existente', 'nueva'
  const [carpetaDestinoSubida, setCarpetaDestinoSubida] = useState("");
  const [carpetaNuevaNombreSubida, setCarpetaNuevaNombreSubida] = useState("");

  const [learningNotice, setLearningNotice] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const manualFileInputRef = useRef(null);

  // Estados de Mapeo Interactivo de Columnas y Reporte General
  const [modalColumnMapper, setModalColumnMapper] = useState({ open: false, file: null });
  const [modalReporteGeneral, setModalReporteGeneral] = useState(false);

  // Cargar lista de carpetas al seleccionar o cambiar de condominio
  useEffect(() => {
    if (condominio?.id) {
      loadCarpetas(condominio.id);
    }
  }, [condominio?.id]);

  const loadCarpetas = async (condoId) => {
    setLoadingCarpetas(true);
    try {
      const data = await fetchCarpetas(condoId);
      setCarpetas(data || []);
    } catch (err) {
      console.error("Error al cargar carpetas de conciliación:", err);
    } finally {
      setLoadingCarpetas(false);
    }
  };

  const handleIniciarRenombrarCarpeta = (e, carpeta) => {
    e.stopPropagation();
    setEditandoCarpetaId(carpeta.id);
    setNombreCarpetaTemp(carpeta.nombre);
  };

  const handleGuardarNombreCarpeta = async (e, carpetaId) => {
    e.stopPropagation();
    if (!nombreCarpetaTemp.trim()) return;
    try {
      await updateCarpeta(carpetaId, nombreCarpetaTemp.trim());
      setEditandoCarpetaId(null);
      showNotice("Nombre de la carpeta actualizado.");
      loadCarpetas(condominio.id);
    } catch (err) {
      alert("Error al renombrar carpeta: " + err.message);
    }
  };

  const handleEliminarCarpeta = async (e, carpetaId, nombre) => {
    e.stopPropagation();
    if (!confirm(`¿Deseas eliminar la carpeta "${nombre}" y todas las conciliaciones que contiene? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteCarpeta(carpetaId);
      showNotice(`Carpeta "${nombre}" eliminada.`);
      loadCarpetas(condominio.id);
    } catch (err) {
      alert("Error al eliminar carpeta: " + err.message);
    }
  };

  const handleAbrirFusionar = (e, carpeta) => {
    e.stopPropagation();
    const otras = carpetas.filter((c) => c.id !== carpeta.id);
    setModalFusionar({
      open: true,
      carpetaOrigen: carpeta,
      carpetaDestinoId: otras.length > 0 ? String(otras[0].id) : "",
    });
  };

  const handleEjecutarFusion = async () => {
    if (!modalFusionar.carpetaOrigen || !modalFusionar.carpetaDestinoId) return;
    const destId = parseInt(modalFusionar.carpetaDestinoId);
    const destCarpeta = carpetas.find((c) => c.id === destId);

    if (!confirm(`¿Confirmas fusionar la carpeta "${modalFusionar.carpetaOrigen.nombre}" dentro de "${destCarpeta?.nombre || "destino"}"? Se consolidarán sus extractos.`)) return;

    try {
      await fusionarCarpetas(modalFusionar.carpetaOrigen.id, destId);
      setModalFusionar({ open: false, carpetaOrigen: null, carpetaDestinoId: "" });
      showNotice(`¡Carpetas fusionadas exitosamente en "${destCarpeta?.nombre || "destino"}"!`);
      loadCarpetas(condominio.id);
    } catch (err) {
      alert("Error al fusionar carpetas: " + err.message);
    }
  };

  const handleAbrirMover = (e, item) => {
    e.stopPropagation();
    const otras = carpetas.filter((c) => c.id !== item.carpeta_id);
    setModalMover({
      open: true,
      item,
      nuevaCarpetaId: otras.length > 0 ? String(otras[0].id) : "",
    });
  };

  const handleEjecutarMover = async () => {
    if (!modalMover.item || !modalMover.nuevaCarpetaId) return;
    const destId = parseInt(modalMover.nuevaCarpetaId);
    try {
      await moverConciliacion(modalMover.item.id, destId);
      setModalMover({ open: false, item: null, nuevaCarpetaId: "" });
      showNotice("Conciliación transferida a la nueva carpeta.");
      loadCarpetas(condominio.id);
    } catch (err) {
      alert("Error al mover conciliación: " + err.message);
    }
  };

  const handleCrearCarpetaDirecta = async () => {
    if (!nombreNuevaCarpeta.trim()) return;
    try {
      await createCarpeta(condominio.id, nombreNuevaCarpeta.trim());
      setModalNuevaCarpeta(false);
      setNombreNuevaCarpeta("");
      showNotice("Nueva carpeta creada.");
      loadCarpetas(condominio.id);
    } catch (err) {
      alert("Error al crear carpeta: " + err.message);
    }
  };

  const handleAgregarAEstaCarpeta = (e, carpeta) => {
    e.stopPropagation();
    setCarpetaModoSubida("existente");
    setCarpetaDestinoSubida(String(carpeta.id));
    setVista("nueva");
  };

  const handleOpenConciliacion = async (estadoCuentaId) => {
    setLoading(true);
    try {
      const data = await fetchEstadoCuenta(estadoCuentaId);
      setEstadoCuenta(data);
      setMovimientos(data.movimientos || []);
      setTituloTemp(data.titulo || data.nombre_archivo || "");
      setVista("conciliando");
    } catch (err) {
      alert("Error al cargar la conciliación: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGuardarTitulo = async () => {
    if (!estadoCuenta?.estado_cuenta_id) return;
    try {
      await updateEstadoCuentaTitulo(estadoCuenta.estado_cuenta_id, tituloTemp);
      setEstadoCuenta((prev) => ({ ...prev, titulo: tituloTemp }));
      setEditandoTitulo(false);
      showNotice("Nombre de la conciliación actualizado.");
      loadCarpetas(condominio.id);
    } catch (err) {
      alert("Error al actualizar el nombre: " + err.message);
    }
  };

  const handlePausarYGuardar = async () => {
    if (editandoTitulo && tituloTemp) {
      await handleGuardarTitulo();
    }
    setVista("carpetas");
    loadCarpetas(condominio.id);
    showNotice("Conciliación guardada y pausada. Puedes continuar en cualquier momento.");
  };

  const handleDelete = async (e, id, nombre) => {
    e.stopPropagation();
    if (!confirm(`¿Deseas eliminar la conciliación "${nombre}"? Esta acción removerá sus registros asociados.`)) return;

    try {
      await deleteEstadoCuenta(id);
      showNotice("Conciliación eliminada.");
      loadCarpetas(condominio.id);
      if (estadoCuenta?.estado_cuenta_id === id) {
        setEstadoCuenta(null);
        setMovimientos([]);
        setVista("carpetas");
      }
    } catch (err) {
      alert("Error al eliminar conciliación: " + err.message);
    }
  };

  const processFileList = async (files) => {
    if (!files || files.length === 0) return;

    setLoading(true);
    try {
      let cId = null;
      let cNom = "";
      if (carpetaModoSubida === "existente" && carpetaDestinoSubida) {
        cId = parseInt(carpetaDestinoSubida);
      } else if (carpetaModoSubida === "nueva" && carpetaNuevaNombreSubida.trim()) {
        cNom = carpetaNuevaNombreSubida.trim();
      }

      const data = await uploadEstadoCuenta(
        condominio.id,
        files,
        esHistorico,
        bancoSeleccionado,
        tituloNuevo.trim(),
        cId,
        cNom
      );
      setEstadoCuenta(data);
      setMovimientos(data.movimientos || []);
      setTituloTemp(data.titulo || tituloNuevo || "Nueva Conciliación");
      setTituloNuevo("");
      setVista("conciliando");

      if (esHistorico) {
        onRefreshInmuebles();
        const archTxt = data.total_archivos > 1 ? `${data.total_archivos} archivos históricos procesados` : "Archivo histórico procesado";
        showNotice(`¡${archTxt}! ${data.total_movimientos} movimientos aprendidos en la memoria asociativa.`);
      } else {
        const bancoLabel = data.banco_detectado ? `[${data.banco_detectado}] ` : "";
        const archTxt = data.total_archivos > 1 ? `${data.total_archivos} archivos analizados: ` : "";
        showNotice(`${bancoLabel}${archTxt}${data.total_movimientos} movimientos listos para conciliar.`);
      }
      loadCarpetas(condominio.id);
    } catch (err) {
      const errMsg = err.message || "";
      if (files && files.length > 0 && (errMsg.includes("No se encontraron transacciones") || errMsg.includes("legibles") || errMsg.includes("400"))) {
        const wantMap = confirm(
          "El sistema no pudo leer automáticamente las columnas de este extracto (posible variación de formato del banco).\n\n" +
          "¿Deseas abrir el Mapeador Interactivo de Columnas para asignarlas tú mismo?"
        );
        if (wantMap) {
          setModalColumnMapper({ open: true, file: files[0] });
          return;
        }
      }
      alert("Error procesando extracto(s) bancario(s): " + errMsg);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = (e) => {
    processFileList(e.target.files);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFileList(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const showNotice = (msg) => {
    setLearningNotice(msg);
    setTimeout(() => setLearningNotice(null), 6000);
  };

  const handleConfirmRow = async (mov, targetInmuebleId, clasificacion = "") => {
    try {
      const res = await confirmarMovimiento(
        mov.id,
        targetInmuebleId,
        clasificacion || mov.clasificacion_especial || "",
        "confirmado"
      );

      const targetInm = targetInmuebleId ? inmuebles.find((i) => i.id === targetInmuebleId) : null;
      const updatedMap = new Map((res?.updated_pendientes || []).map((u) => [u.id, u]));

      let identLabel = targetInm ? targetInm.identificador : "No Aplica";
      if (!targetInmuebleId) {
        if (clasificacion === "No Identificado" || mov.clasificacion_especial === "No Identificado") {
          identLabel = "No Identificado";
        } else {
          identLabel = "No Aplica";
        }
      }

      // Actualizar estado local tanto del movimiento confirmado como de los pendientes re-evaluados (Fase 3)
      setMovimientos((prev) =>
        prev.map((m) => {
          if (m.id === mov.id) {
            return {
              ...m,
              inmueble_confirmado_id: targetInmuebleId,
              inmueble_confirmado_identificador: identLabel,
              clasificacion_especial: clasificacion || m.clasificacion_especial,
              estado_conciliacion: "confirmado",
            };
          }
          const fresh = updatedMap.get(m.id);
          if (fresh && m.estado_conciliacion === "pendiente") {
            return {
              ...m,
              inmueble_sugerido_id: fresh.inmueble_sugerido_id,
              inmueble_sugerido_identificador: fresh.inmueble_sugerido_identificador,
              score_confianza: fresh.score_confianza,
              razon_sugerencia: fresh.razon_sugerencia,
              clasificacion_especial: fresh.clasificacion_especial || m.clasificacion_especial,
            };
          }
          return m;
        })
      );

      onRefreshInmuebles();
      if (targetInmuebleId) {
        showNotice(
          `Confirmado: Pago asociado a ${targetInm?.identificador || "inmueble"}. Memoria asociativa actualizada.`
        );
      } else if (identLabel === "No Identificado") {
        showNotice(`Marcado como "No Identificado" (pendiente por verificar propietario).`);
      } else {
        showNotice(`Confirmado: Marcado como "No Aplica" (no requiere inmueble).`);
      }
    } catch (err) {
      alert("Error al confirmar: " + err.message);
    }
  };

  const handleRevertRow = async (mov) => {
    try {
      const res = await confirmarMovimiento(mov.id, null, "", "pendiente");
      const updatedMap = new Map((res?.updated_pendientes || []).map((u) => [u.id, u]));

      setMovimientos((prev) =>
        prev.map((m) => {
          if (m.id === mov.id) {
            return {
              ...m,
              inmueble_confirmado_id: null,
              inmueble_confirmado_identificador: "",
              clasificacion_especial: "",
              estado_conciliacion: "pendiente",
            };
          }
          const fresh = updatedMap.get(m.id);
          if (fresh && m.estado_conciliacion === "pendiente") {
            return {
              ...m,
              inmueble_sugerido_id: fresh.inmueble_sugerido_id,
              inmueble_sugerido_identificador: fresh.inmueble_sugerido_identificador,
              score_confianza: fresh.score_confianza,
              razon_sugerencia: fresh.razon_sugerencia,
              clasificacion_especial: fresh.clasificacion_especial || m.clasificacion_especial,
            };
          }
          return m;
        })
      );
      showNotice("Movimiento restablecido a pendiente.");
    } catch (err) {
      alert("Error al restablecer: " + err.message);
    }
  };

  const handleBatchConfirmHighConfidence = async () => {
    const candidates = movimientos.filter(
      (m) =>
        m.estado_conciliacion === "pendiente" &&
        m.haber > 0 &&
        m.inmueble_sugerido_id &&
        m.score_confianza >= 70
    );

    if (candidates.length === 0) {
      alert("No hay sugerencias de alta certeza (>=70%) pendientes por confirmar.");
      return;
    }

    if (
      !confirm(
        `¿Deseas confirmar en lote ${candidates.length} pagos sugeridos con alta certeza (>=70%)?`
      )
    )
      return;

    const payload = candidates.map((c) => ({
      movimiento_id: c.id,
      inmueble_id: c.inmueble_sugerido_id,
      clasificacion_especial: c.clasificacion_especial || "",
    }));

    try {
      const res = await confirmarLote(payload);
      const updatedMap = new Map((res?.updated_pendientes || []).map((u) => [u.id, u]));

      setMovimientos((prev) =>
        prev.map((m) => {
          const match = candidates.find((c) => c.id === m.id);
          if (match) {
            return {
              ...m,
              inmueble_confirmado_id: match.inmueble_sugerido_id,
              estado_conciliacion: "confirmado",
            };
          }
          const fresh = updatedMap.get(m.id);
          if (fresh && m.estado_conciliacion === "pendiente") {
            return {
              ...m,
              inmueble_sugerido_id: fresh.inmueble_sugerido_id,
              inmueble_sugerido_identificador: fresh.inmueble_sugerido_identificador,
              score_confianza: fresh.score_confianza,
              razon_sugerencia: fresh.razon_sugerencia,
              clasificacion_especial: fresh.clasificacion_especial || m.clasificacion_especial,
            };
          }
          return m;
        })
      );
      onRefreshInmuebles();
      showNotice(
        `¡Excelente! Se confirmaron ${candidates.length} pagos y se actualizó la memoria del sistema.`
      );
    } catch (err) {
      alert("Error en confirmación por lote: " + err.message);
    }
  };

  // Filtrado de movimientos para la tabla
  const filteredMovs = movimientos.filter((m) => {
    if (filtroTipo === "ingresos" && m.haber <= 0) return false;
    if (filtroTipo === "pendientes" && (m.estado_conciliacion === "confirmado" || m.haber <= 0))
      return false;
    if (filtroTipo === "confirmados" && m.estado_conciliacion !== "confirmado") return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchDesc = (m.descripcion || "").toLowerCase().includes(q);
      const matchRef = (m.referencia || "").toLowerCase().includes(q);
      const matchInm =
        (m.inmueble_sugerido_identificador &&
          m.inmueble_sugerido_identificador.toLowerCase().includes(q)) ||
        (m.inmueble_confirmado_identificador &&
          m.inmueble_confirmado_identificador.toLowerCase().includes(q));
      return matchDesc || matchRef || matchInm;
    }
    return true;
  });

  const totalHaber = movimientos.reduce((acc, m) => acc + (m.haber || 0), 0);
  const totalConfirmados = movimientos.filter((m) => m.estado_conciliacion === "confirmado" && m.haber > 0).length;
  const totalIngresos = movimientos.filter((m) => m.haber > 0).length;
  const pctConciliado = totalIngresos > 0 ? Math.round((totalConfirmados / totalIngresos) * 100) : 0;
  const highConfidencePending = movimientos.filter(
    (m) => m.estado_conciliacion === "pendiente" && m.haber > 0 && m.score_confianza >= 70
  ).length;

  const formatCurrency = (val) =>
    Number(val || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Agrupamiento dinámico de conciliaciones por Mes/Año (solo los meses que existen)
  const gruposPorMes = carpetas.reduce((acc, ec) => {
    const key = ec.mes_key || "otros";
    if (!acc[key]) {
      acc[key] = {
        label: ec.mes_label || "Otras Conciliaciones",
        items: [],
        totalIngresos: 0,
        totalFilas: 0,
        confirmadosCount: 0,
      };
    }
    acc[key].items.push(ec);
    acc[key].totalIngresos += Number(ec.total_ingresos || 0);
    acc[key].totalFilas += Number(ec.total_ingresos_filas || ec.total_movimientos || 0);
    acc[key].confirmadosCount += Number(ec.confirmados_count || 0);
    return acc;
  }, {});

  // Ordenar meses cronológicamente descendente
  const keysMesesOrdenados = Object.keys(gruposPorMes).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "28px 20px" }}>
      {/* Banner de aviso / feedback */}
      {learningNotice && (
        <div
          style={{
            marginBottom: "20px",
            padding: "12px 18px",
            background: "#111110",
            color: "#ffffff",
            borderRadius: "12px",
            fontSize: "13.5px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            animation: "fadeIn 0.2s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Sparkles size={16} />
            <span>{learningNotice}</span>
          </div>
          <button
            onClick={() => setLearningNotice(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 1: CARPETAS POR MES (SELECTOR INICIAL)                     */}
      {/* ============================================================== */}
      {vista === "carpetas" && (
        <div>
          {/* Cabecera del Archivador */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "16px",
              marginBottom: "28px",
              paddingBottom: "20px",
              borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <FolderArchive size={22} style={{ color: "#111110" }} />
                <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#111110", margin: 0, letterSpacing: "-0.02em" }}>
                  Carpetas de Conciliación
                </h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
                <p style={{ fontSize: "13px", color: "rgba(20, 20, 19, 0.6)", margin: 0 }}>
                  Historial contable de extractos bancarios organizados en carpetas.
                </p>
                {carpetas.length > 0 && (
                  <>
                    <span style={{ color: "rgba(20,20,19,0.3)" }}>•</span>
                    <button
                      onClick={() => {
                        const allCol = carpetas.every((c) => carpetasColapsadas[c.id]);
                        const next = {};
                        carpetas.forEach((c) => {
                          next[c.id] = !allCol;
                        });
                        setCarpetasColapsadas(next);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#111110",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: "0",
                      }}
                    >
                      {carpetas.every((c) => carpetasColapsadas[c.id]) ? "Desplegar todas" : "Minimizar todas"}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setModalReporteGeneral(true)}
                title="Generar reporte contable con filtros de fecha, estado y eliminación de duplicados"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 15px",
                  borderRadius: "10px",
                  background: "rgba(15, 23, 42, 0.05)",
                  color: "var(--color-fg, #0f172a)",
                  border: "1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.15))",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <FileText size={15} />
                <span>Generar Reporte</span>
              </button>

              <button
                onClick={() => {
                  setNombreNuevaCarpeta("");
                  setModalNuevaCarpeta(true);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 15px",
                  borderRadius: "10px",
                  background: "#ffffff",
                  color: "#111110",
                  border: "1px solid rgba(0, 0, 0, 0.14)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <FolderPlus size={15} />
                <span>Nueva Carpeta</span>
              </button>

              <button
                onClick={() => {
                  setCarpetaModoSubida("auto");
                  setCarpetaDestinoSubida("");
                  setVista("nueva");
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "9px 18px",
                  borderRadius: "10px",
                  background: "#111110",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <Plus size={16} />
                <span>Nueva Conciliación</span>
              </button>
            </div>
          </div>

          {/* Estado de carga */}
          {loadingCarpetas && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(20,20,19,0.5)", fontSize: "13.5px" }}>
              Cargando archivador de conciliaciones...
            </div>
          )}

          {/* Estado vacío: Sin conciliaciones previas */}
          {!loadingCarpetas && carpetas.length === 0 && (
            <div
              style={{
                border: "1px dashed rgba(0, 0, 0, 0.15)",
                borderRadius: "16px",
                padding: "60px 24px",
                textAlign: "center",
                background: "rgba(0, 0, 0, 0.01)",
              }}
            >
              <FolderOpen size={48} style={{ color: "rgba(20, 20, 19, 0.3)", margin: "0 auto 16px auto" }} />
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#111110", margin: "0 0 6px 0" }}>
                No hay conciliaciones registradas
              </h3>
              <p style={{ fontSize: "13px", color: "rgba(20, 20, 19, 0.6)", maxWidth: "440px", margin: "0 auto 20px auto" }}>
                Sube el primer estado de cuenta bancario en PDF o Excel para comenzar el proceso de conciliación asistido por IA.
              </p>
              <button
                onClick={() => {
                  setCarpetaModoSubida("auto");
                  setCarpetaDestinoSubida("");
                  setVista("nueva");
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 18px",
                  borderRadius: "10px",
                  background: "#111110",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <Plus size={15} />
                <span>Cargar Primer Estado de Cuenta</span>
              </button>
            </div>
          )}

          {/* Listado de Carpetas */}
          {!loadingCarpetas && carpetas.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
              {carpetas.map((carpeta) => {
                const isColapsada = !!carpetasColapsadas[carpeta.id];
                const isEditando = editandoCarpetaId === carpeta.id;
                const itemsCount = carpeta.items?.length || 0;

                return (
                  <div
                    key={carpeta.id}
                    style={{
                      border: "1px solid rgba(0, 0, 0, 0.08)",
                      borderRadius: "14px",
                      background: "#ffffff",
                      overflow: "hidden",
                    }}
                  >
                    {/* Barra de título de la carpeta */}
                    <div
                      onClick={() => toggleCarpeta(carpeta.id)}
                      title={isColapsada ? "Clic para desplegar carpeta" : "Clic para minimizar carpeta"}
                      style={{
                        padding: "16px 20px",
                        background: isColapsada ? "rgba(0, 0, 0, 0.01)" : "rgba(0, 0, 0, 0.025)",
                        borderBottom: isColapsada ? "none" : "1px solid rgba(0, 0, 0, 0.06)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "12px",
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: "1", minWidth: "280px" }}>
                        <div style={{ color: "rgba(20, 20, 19, 0.6)", display: "flex", alignItems: "center" }}>
                          {isColapsada ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                        </div>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "10px",
                            background: "#111110",
                            color: "#ffffff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Folder size={18} />
                        </div>
                        <div style={{ flex: "1" }}>
                          {isEditando ? (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: "flex", alignItems: "center", gap: "6px", maxWidth: "340px" }}
                            >
                              <input
                                type="text"
                                value={nombreCarpetaTemp}
                                onChange={(e) => setNombreCarpetaTemp(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleGuardarNombreCarpeta(e, carpeta.id);
                                  if (e.key === "Escape") setEditandoCarpetaId(null);
                                }}
                                autoFocus
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  border: "1px solid #111110",
                                  fontSize: "14px",
                                  fontWeight: 600,
                                  width: "100%",
                                  outline: "none",
                                }}
                              />
                              <button
                                onClick={(e) => handleGuardarNombreCarpeta(e, carpeta.id)}
                                title="Guardar nombre"
                                style={{
                                  padding: "5px 8px",
                                  borderRadius: "6px",
                                  background: "#111110",
                                  color: "#ffffff",
                                  border: "none",
                                  cursor: "pointer",
                                }}
                              >
                                <Check size={13} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditandoCarpetaId(null);
                                }}
                                title="Cancelar"
                                style={{
                                  padding: "5px 8px",
                                  borderRadius: "6px",
                                  background: "rgba(0,0,0,0.06)",
                                  color: "#111110",
                                  border: "none",
                                  cursor: "pointer",
                                }}
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "16px", fontWeight: 600, color: "#111110", letterSpacing: "-0.01em" }}>
                                {carpeta.nombre}
                              </span>
                              <button
                                onClick={(e) => handleIniciarRenombrarCarpeta(e, carpeta)}
                                title="Cambiar nombre de carpeta"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "rgba(20, 20, 19, 0.4)",
                                  cursor: "pointer",
                                  padding: "3px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  borderRadius: "4px",
                                }}
                              >
                                <Pencil size={13} />
                              </button>
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  padding: "2px 8px",
                                  borderRadius: "999px",
                                  background: "rgba(0, 0, 0, 0.06)",
                                  color: "rgba(20, 20, 19, 0.7)",
                                }}
                              >
                                {itemsCount} {itemsCount === 1 ? "conciliación" : "conciliaciones"}
                              </span>
                            </div>
                          )}
                          <div style={{ fontSize: "12px", color: "rgba(20, 20, 19, 0.5)", marginTop: "2px" }}>
                            {carpeta.confirmados_count || 0} de {carpeta.total_filas || 0} pagos conciliados ({carpeta.porcentaje || 0}%)
                          </div>
                        </div>
                      </div>

                      {/* Lado derecho: Acciones de carpeta y total */}
                      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                        {/* Acciones de la carpeta */}
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <button
                            onClick={(e) => handleAgregarAEstaCarpeta(e, carpeta)}
                            title="Agregar extracto directamente a esta carpeta"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              padding: "5px 10px",
                              borderRadius: "6px",
                              border: "1px solid rgba(0, 0, 0, 0.12)",
                              background: "#ffffff",
                              color: "#111110",
                              fontSize: "11.5px",
                              fontWeight: 500,
                              cursor: "pointer",
                            }}
                          >
                            <FolderPlus size={13} />
                            <span>+ Agregar</span>
                          </button>

                          {carpetas.length > 1 && (
                            <button
                              onClick={(e) => handleAbrirFusionar(e, carpeta)}
                              title="Fusionar esta carpeta con otra existente"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                padding: "5px 10px",
                                borderRadius: "6px",
                                border: "1px solid rgba(0, 0, 0, 0.12)",
                                background: "#ffffff",
                                color: "#111110",
                                fontSize: "11.5px",
                                fontWeight: 500,
                                cursor: "pointer",
                              }}
                            >
                              <GitMerge size={13} />
                              <span>Fusionar</span>
                            </button>
                          )}

                          <button
                            onClick={(e) => handleEliminarCarpeta(e, carpeta.id, carpeta.nombre)}
                            title="Eliminar carpeta y sus conciliaciones"
                            style={{
                              padding: "5px 7px",
                              borderRadius: "6px",
                              border: "1px solid rgba(239, 68, 68, 0.2)",
                              background: "rgba(239, 68, 68, 0.05)",
                              color: "#dc2626",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <div style={{ textAlign: "right", minWidth: "140px" }}>
                          <div style={{ fontSize: "11.5px", color: "rgba(20, 20, 19, 0.5)", fontWeight: 500 }}>
                            Total Recaudado
                          </div>
                          <div style={{ fontSize: "16px", fontWeight: 700, color: "#111110" }}>
                            Bs. {formatCurrency(carpeta.total_ingresos)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Fila / Tarjetas de conciliaciones dentro de la carpeta (si no está minimizada) */}
                    {!isColapsada && (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {itemsCount === 0 ? (
                          <div style={{ padding: "24px", textAlign: "center", color: "rgba(20,20,19,0.4)", fontSize: "12.5px" }}>
                            Esta carpeta está vacía. Haz clic en "+ Agregar" para subirle un extracto bancario.
                          </div>
                        ) : (
                          carpeta.items.map((ec, idx) => {
                            const isComplete = ec.porcentaje >= 100;

                            return (
                              <div
                                key={ec.id}
                                style={{
                                  padding: "16px 20px",
                                  borderBottom: idx < carpeta.items.length - 1 ? "1px solid rgba(0, 0, 0, 0.05)" : "none",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: "14px",
                                  transition: "background 0.15s ease",
                                }}
                              >
                                {/* Información de la conciliación */}
                                <div style={{ flex: "1", minWidth: "260px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#111110" }}>
                                      {ec.titulo_display}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: "11px",
                                        padding: "2px 7px",
                                        borderRadius: "6px",
                                        border: "1px solid rgba(0,0,0,0.1)",
                                        background: "#ffffff",
                                        color: "rgba(20, 20, 19, 0.7)",
                                        fontWeight: 500,
                                      }}
                                    >
                                      {ec.banco}
                                    </span>
                                  </div>

                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "14px",
                                      marginTop: "6px",
                                      fontSize: "12px",
                                      color: "rgba(20, 20, 19, 0.6)",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span>
                                      {ec.confirmados_count} / {ec.total_ingresos_filas || ec.total_movimientos} conciliados ({ec.porcentaje}%)
                                    </span>
                                    <span>•</span>
                                    <span>Total: <b>Bs. {formatCurrency(ec.total_ingresos)}</b></span>
                                    <span>•</span>
                                    <span>Subido: {new Date(ec.fecha_subida).toLocaleDateString("es-VE")}</span>
                                  </div>

                                  {/* Barra de progreso */}
                                  <div
                                    style={{
                                      width: "220px",
                                      height: "5px",
                                      background: "rgba(0, 0, 0, 0.07)",
                                      borderRadius: "999px",
                                      marginTop: "8px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: `${ec.porcentaje}%`,
                                        height: "100%",
                                        background: isComplete ? "#10b981" : "#f59e0b",
                                        borderRadius: "999px",
                                        transition: "width 0.3s ease",
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Acciones para esta conciliación */}
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <button
                                    onClick={() => handleOpenConciliacion(ec.id)}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      padding: "7px 14px",
                                      borderRadius: "8px",
                                      background: "#111110",
                                      color: "#ffffff",
                                      border: "none",
                                      fontSize: "12.5px",
                                      fontWeight: 500,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <Play size={13} fill="#ffffff" />
                                    <span>{isComplete ? "Ver Conciliación" : "Continuar"}</span>
                                  </button>

                                  {/* Botón Mover a otra carpeta */}
                                  {carpetas.length > 1 && (
                                    <button
                                      onClick={(e) => handleAbrirMover(e, ec)}
                                      title="Mover esta conciliación a otra carpeta"
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        padding: "7px 9px",
                                        borderRadius: "8px",
                                        border: "1px solid rgba(0, 0, 0, 0.12)",
                                        background: "#ffffff",
                                        color: "#111110",
                                        fontSize: "12px",
                                        fontWeight: 500,
                                        cursor: "pointer",
                                      }}
                                    >
                                      <MoveRight size={13} />
                                      <span>Mover</span>
                                    </button>
                                  )}

                                  <a
                                    href={getExportPdfUrl(ec.id)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Exportar reporte en PDF"
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "5px",
                                      padding: "7px 11px",
                                      borderRadius: "8px",
                                      border: "1px solid rgba(0, 0, 0, 0.12)",
                                      background: "#ffffff",
                                      color: "#111110",
                                      fontSize: "12px",
                                      fontWeight: 500,
                                      textDecoration: "none",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <FileText size={13} />
                                    <span>PDF</span>
                                  </a>

                                  <a
                                    href={getExportExcelUrl(ec.id)}
                                    download
                                    title="Exportar en Excel (.xlsx)"
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "5px",
                                      padding: "7px 11px",
                                      borderRadius: "8px",
                                      border: "1px solid rgba(0, 0, 0, 0.12)",
                                      background: "#ffffff",
                                      color: "#111110",
                                      fontSize: "12px",
                                      fontWeight: 500,
                                      textDecoration: "none",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <Download size={13} />
                                    <span>Excel</span>
                                  </a>

                                  <button
                                    onClick={(e) => handleDelete(e, ec.id, ec.titulo_display)}
                                    title="Eliminar conciliación"
                                    style={{
                                      padding: "7px 8px",
                                      borderRadius: "8px",
                                      border: "1px solid rgba(239, 68, 68, 0.2)",
                                      background: "rgba(239, 68, 68, 0.05)",
                                      color: "#dc2626",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 2: NUEVA CONCILIACIÓN (SUBIDA DE EXTRACTOS)              */}
      {/* ============================================================== */}
      {vista === "nueva" && (
        <div>
          {/* Barra superior para volver */}
          <div style={{ marginBottom: "20px" }}>
            <button
              onClick={() => setVista("carpetas")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "transparent",
                border: "none",
                fontSize: "13px",
                fontWeight: 500,
                color: "rgba(20, 20, 19, 0.7)",
                cursor: "pointer",
                padding: "6px 0",
              }}
            >
              <ArrowLeft size={16} />
              <span>Volver al Archivador de Carpetas</span>
            </button>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            style={{
              border: isDragging ? "2px dashed #111110" : "1px dashed rgba(0, 0, 0, 0.18)",
              borderRadius: "16px",
              padding: "40px 24px",
              textAlign: "center",
              background: isDragging ? "rgba(0, 0, 0, 0.04)" : "rgba(0, 0, 0, 0.015)",
              marginBottom: "28px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.xlsx,.csv"
              multiple
              style={{ display: "none" }}
            />

            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "14px",
                background: "#ffffff",
                border: "1px solid rgba(0,0,0,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
              }}
            >
              <UploadCloud size={26} style={{ color: "#111110" }} />
            </div>

            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111110", margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>
              Cargar Estado de Cuenta Bancario
            </h3>
            <p style={{ fontSize: "13px", color: "rgba(20, 20, 19, 0.6)", margin: "0 0 24px 0", maxWidth: "520px" }}>
              Soporta extractos del <b>BNC</b>, <b>Banco Exterior</b> y <b>100%Banco</b> en formato PDF o Excel (.xlsx / .csv).
              Puedes arrastrar múltiples archivos para consolidar un mes completo.
            </p>

            {/* Configuración de subida */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                alignItems: "center",
                maxWidth: "460px",
                width: "100%",
                marginBottom: "24px",
              }}
            >
              {/* Selector de Carpeta de Destino */}
              <div style={{ width: "100%", textAlign: "left" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "rgba(20, 20, 19, 0.7)", marginBottom: "6px", display: "block" }}>
                  Carpeta de Destino
                </label>
                <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                  <button
                    type="button"
                    onClick={() => { setCarpetaModoSubida("auto"); setCarpetaDestinoSubida(""); }}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: carpetaModoSubida === "auto" ? "1px solid #111110" : "1px solid rgba(0,0,0,0.12)",
                      background: carpetaModoSubida === "auto" ? "#111110" : "#ffffff",
                      color: carpetaModoSubida === "auto" ? "#ffffff" : "#111110",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    ✨ Auto (Unir a mes)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCarpetaModoSubida("existente")}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: carpetaModoSubida === "existente" ? "1px solid #111110" : "1px solid rgba(0,0,0,0.12)",
                      background: carpetaModoSubida === "existente" ? "#111110" : "#ffffff",
                      color: carpetaModoSubida === "existente" ? "#ffffff" : "#111110",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    📁 Existente
                  </button>
                  <button
                    type="button"
                    onClick={() => setCarpetaModoSubida("nueva")}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: carpetaModoSubida === "nueva" ? "1px solid #111110" : "1px solid rgba(0,0,0,0.12)",
                      background: carpetaModoSubida === "nueva" ? "#111110" : "#ffffff",
                      color: carpetaModoSubida === "nueva" ? "#ffffff" : "#111110",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    + Nueva
                  </button>
                </div>

                {carpetaModoSubida === "existente" && (
                  <select
                    value={carpetaDestinoSubida}
                    onChange={(e) => setCarpetaDestinoSubida(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: "#ffffff",
                      fontSize: "12.5px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="">Selecciona la carpeta donde guardarlo...</option>
                    {carpetas.map((c) => (
                      <option key={c.id} value={c.id}>
                        📁 {c.nombre} ({c.items?.length || 0} conciliaciones)
                      </option>
                    ))}
                  </select>
                )}

                {carpetaModoSubida === "nueva" && (
                  <input
                    type="text"
                    placeholder="Nombre de la nueva carpeta (ej: Noviembre 2026)"
                    value={carpetaNuevaNombreSubida}
                    onChange={(e) => setCarpetaNuevaNombreSubida(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: "#ffffff",
                      fontSize: "12.5px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                )}
              </div>

              {/* Nombre personalizado opcional */}
              <div style={{ width: "100%", textAlign: "left" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "rgba(20, 20, 19, 0.7)", marginBottom: "4px", display: "block" }}>
                  Nombre / Etiqueta de la Conciliación (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Conciliación Octubre 2026 - Principal"
                  value={tituloNuevo}
                  onChange={(e) => setTituloNuevo(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(0,0,0,0.15)",
                    background: "#ffffff",
                    fontSize: "13px",
                    color: "#111110",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Selector de Banco y Toggle de Modo Histórico */}
              <div style={{ display: "flex", gap: "12px", width: "100%", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "rgba(20, 20, 19, 0.7)" }}>
                  <span>Banco:</span>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <select
                      value={bancoSeleccionado}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "__otro__") {
                          setMostrarInputOtroBanco(true);
                        } else {
                          setMostrarInputOtroBanco(false);
                          setBancoSeleccionado(val);
                        }
                      }}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "8px",
                        border: "1px solid rgba(0, 0, 0, 0.12)",
                        background: "#ffffff",
                        fontSize: "12.5px",
                        color: "#111110",
                        fontWeight: 500,
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="auto">✨ Auto-detectar (Recomendado)</option>
                      <option value="bnc">BNC (Banco Nacional de Crédito)</option>
                      <option value="exterior">Banco Exterior</option>
                      <option value="100banco">100%Banco</option>
                      {bancosList.filter(b => b.tipo === "personalizado").map((b) => (
                        <option key={b.id} value={b.nombre}>🏦 {b.nombre} (Guardado)</option>
                      ))}
                      <option value="__otro__">➕ Otro banco...</option>
                    </select>

                    {bancosList.some(b => b.tipo === "personalizado" && b.nombre === bancoSeleccionado) && (
                      <button
                        type="button"
                        onClick={() => handleEliminarBanco(bancoSeleccionado)}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "#ef4444",
                          padding: "4px",
                          display: "flex",
                          alignItems: "center",
                          borderRadius: "4px",
                        }}
                        title={`Eliminar "${bancoSeleccionado}" de tus bancos guardados`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {mostrarInputOtroBanco && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(16, 185, 129, 0.08)", padding: "4px 8px", borderRadius: "8px", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                      <input
                        type="text"
                        placeholder="Nombre del banco (ej. Banesco)"
                        value={nombreNuevoBanco}
                        onChange={(e) => setNombreNuevoBanco(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleGuardarNuevoBanco();
                          if (e.key === "Escape") {
                            setMostrarInputOtroBanco(false);
                            setBancoSeleccionado("auto");
                          }
                        }}
                        autoFocus
                        style={{
                          padding: "5px 8px",
                          borderRadius: "6px",
                          border: "1px solid #10b981",
                          fontSize: "12px",
                          outline: "none",
                          width: "190px",
                          background: "#ffffff",
                          color: "#111110",
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleGuardarNuevoBanco}
                        disabled={guardandoBanco || !nombreNuevoBanco.trim()}
                        style={{
                          padding: "5px 10px",
                          borderRadius: "6px",
                          background: "#10b981",
                          color: "#ffffff",
                          border: "none",
                          fontSize: "11.5px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {guardandoBanco ? "..." : "Guardar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMostrarInputOtroBanco(false);
                          setBancoSeleccionado("auto");
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#71717a",
                          cursor: "pointer",
                          padding: "2px",
                          display: "flex",
                          alignItems: "center",
                        }}
                        title="Cancelar"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    color: "rgba(20, 20, 19, 0.8)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={esHistorico}
                    onChange={(e) => setEsHistorico(e.target.checked)}
                    style={{ cursor: "pointer", accentColor: "#111110" }}
                  />
                  <span>Es archivo histórico (entrenar memoria)</span>
                </label>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
              <input
                type="file"
                ref={manualFileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setModalColumnMapper({ open: true, file: e.target.files[0] });
                    e.target.value = "";
                  }
                }}
                accept=".pdf,.xlsx,.csv"
                style={{ display: "none" }}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 24px",
                  borderRadius: "10px",
                  background: "#111110",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "13.5px",
                  fontWeight: 600,
                  cursor: loading ? "wait" : "pointer",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                <span>{loading ? "Analizando y deduplicando transacciones..." : "Seleccionar Archivo(s)"}</span>
              </button>

              <button
                type="button"
                onClick={() => manualFileInputRef.current?.click()}
                disabled={loading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  background: "transparent",
                  color: "var(--color-fg-muted, #475569)",
                  border: "1px dashed var(--color-border-subtle, rgba(0,0,0,0.2))",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#111110";
                  e.currentTarget.style.color = "#111110";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border-subtle, rgba(0,0,0,0.2))";
                  e.currentTarget.style.color = "var(--color-fg-muted, #475569)";
                }}
              >
                <SlidersHorizontal size={14} />
                <span>¿Formato bancario no reconocido o columnas desordenadas? <b>Mapear interactivamente</b></span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 3: PROCESO ACTIVO DE CONCILIACIÓN                        */}
      {/* ============================================================== */}
      {vista === "conciliando" && estadoCuenta && (
        <div>
          {/* Barra superior de control y guardado */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "14px",
              marginBottom: "20px",
              paddingBottom: "16px",
              borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
            }}
          >
            {/* Lado izquierdo: Volver y Título editable */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: "1", minWidth: "300px" }}>
              <button
                onClick={handlePausarYGuardar}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  background: "#ffffff",
                  fontSize: "12.5px",
                  fontWeight: 500,
                  color: "#111110",
                  cursor: "pointer",
                }}
              >
                <ArrowLeft size={14} />
                <span>Carpetas</span>
              </button>

              {/* Título editable */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1" }}>
                {editandoTitulo ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", maxWidth: "420px" }}>
                    <input
                      type="text"
                      value={tituloTemp}
                      onChange={(e) => setTituloTemp(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleGuardarTitulo();
                        if (e.key === "Escape") setEditandoTitulo(false);
                      }}
                      autoFocus
                      style={{
                        padding: "6px 10px",
                        borderRadius: "8px",
                        border: "1px solid #111110",
                        fontSize: "14px",
                        fontWeight: 600,
                        width: "100%",
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={handleGuardarTitulo}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "8px",
                        background: "#111110",
                        color: "#ffffff",
                        border: "none",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#111110", margin: 0, letterSpacing: "-0.01em" }}>
                      {estadoCuenta.titulo || estadoCuenta.nombre_archivo || "Conciliación Bancaria"}
                    </h2>
                    <button
                      onClick={() => setEditandoTitulo(true)}
                      title="Cambiar nombre de la conciliación"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "rgba(20,20,19,0.4)",
                        cursor: "pointer",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Lado derecho: Pausar/Guardar y Exportaciones */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                onClick={handlePausarYGuardar}
                title="Guarda el estado actual de la conciliación para continuar después"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(0, 0, 0, 0.15)",
                  background: "#ffffff",
                  color: "#111110",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <Pause size={14} />
                <span>Pausar y Guardar</span>
              </button>

              <a
                href={getExportPdfUrl(estadoCuenta.estado_cuenta_id)}
                target="_blank"
                rel="noopener noreferrer"
                title="Exportar reporte contable formal en PDF (5 columnas)"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  border: "1px solid #111110",
                  background: "#111110",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 500,
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                <FileText size={14} />
                <span>Exportar PDF</span>
              </a>

              <a
                href={getExportExcelUrl(estadoCuenta.estado_cuenta_id)}
                download
                title="Exportar archivo Excel limpio para impresión"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(0, 0, 0, 0.15)",
                  background: "#ffffff",
                  color: "#111110",
                  fontSize: "13px",
                  fontWeight: 500,
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                <Download size={14} />
                <span>Excel</span>
              </a>
            </div>
          </div>

          {/* Tarjetas de Métricas de la Conciliación */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: "14px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                background: "rgba(0, 0, 0, 0.02)",
                border: "1px solid rgba(0, 0, 0, 0.07)",
                borderRadius: "12px",
              }}
            >
              <div style={{ fontSize: "12px", color: "rgba(20, 20, 19, 0.5)", fontWeight: 500 }}>
                Total Transacciones
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "#111110", marginTop: "4px" }}>
                {movimientos.length}
              </div>
            </div>

            <div
              style={{
                padding: "16px 20px",
                background: "rgba(0, 0, 0, 0.02)",
                border: "1px solid rgba(0, 0, 0, 0.07)",
                borderRadius: "12px",
              }}
            >
              <div style={{ fontSize: "12px", color: "rgba(20, 20, 19, 0.5)", fontWeight: 500 }}>
                Total Ingresos (Haber)
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "#111110", marginTop: "4px" }}>
                Bs. {formatCurrency(totalHaber)}
              </div>
            </div>

            <div
              style={{
                padding: "16px 20px",
                background: "rgba(0, 0, 0, 0.02)",
                border: "1px solid rgba(0, 0, 0, 0.07)",
                borderRadius: "12px",
              }}
            >
              <div style={{ fontSize: "12px", color: "rgba(20, 20, 19, 0.5)", fontWeight: 500 }}>
                Progreso de Conciliación
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: pctConciliado === 100 ? "#059669" : "#111110", marginTop: "4px" }}>
                {totalConfirmados} / {totalIngresos}{" "}
                <span style={{ fontSize: "14px", fontWeight: 500, color: "rgba(20,20,19,0.5)" }}>
                  ({pctConciliado}%)
                </span>
              </div>
            </div>

            <div
              style={{
                padding: "16px 20px",
                background: "rgba(0, 0, 0, 0.02)",
                border: "1px solid rgba(0, 0, 0, 0.07)",
                borderRadius: "12px",
              }}
            >
              <div style={{ fontSize: "12px", color: "rgba(20, 20, 19, 0.5)", fontWeight: 500 }}>
                Banco del Extracto
              </div>
              <div style={{ fontSize: "18px", fontWeight: 600, color: "#111110", marginTop: "4px" }}>
                {estadoCuenta?.banco_detectado || "Detectado"}
              </div>
            </div>
          </div>

          {/* Barra de Filtros, Búsqueda y Aprobación en Lote */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            {/* Píldoras de Filtro */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              {[
                { id: "ingresos", label: "Solo Créditos (Haber > 0)" },
                { id: "pendientes", label: "Pendientes" },
                { id: "confirmados", label: "Confirmados" },
                { id: "todos", label: "Todos los movimientos" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFiltroTipo(f.id)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "999px",
                    border: "1px solid",
                    borderColor: filtroTipo === f.id ? "#111110" : "rgba(0, 0, 0, 0.08)",
                    background: filtroTipo === f.id ? "#111110" : "transparent",
                    color: filtroTipo === f.id ? "#ffffff" : "rgba(20, 20, 19, 0.7)",
                    fontSize: "12.5px",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Buscador inline */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1", maxWidth: "260px" }}>
              <div style={{ position: "relative", width: "100%" }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "rgba(20,20,19,0.4)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  type="text"
                  placeholder="Buscar descripción, ref, inmueble…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    paddingLeft: "30px",
                    paddingRight: "10px",
                    paddingTop: "7px",
                    paddingBottom: "7px",
                    borderRadius: "8px",
                    border: "1px solid rgba(0,0,0,0.10)",
                    background: "#ffffff",
                    fontSize: "12.5px",
                    color: "#111110",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Aprobación en Lote */}
            {highConfidencePending > 0 && (
              <button
                type="button"
                onClick={handleBatchConfirmHighConfidence}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  background: "rgba(16, 185, 129, 0.08)",
                  color: "#065f46",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <CheckCheck size={16} />
                <span>Aprobar {highConfidencePending} sugerencias (&gt;70%)</span>
              </button>
            )}
          </div>

          {/* Tabla de Movimientos Bancarios */}
          <div
            style={{
              border: "1px solid rgba(0, 0, 0, 0.08)",
              borderRadius: "14px",
              overflow: "hidden",
              background: "#ffffff",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "rgba(0, 0, 0, 0.02)", borderBottom: "1px solid rgba(0, 0, 0, 0.08)" }}>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "#111110", width: "95px" }}>Fecha</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "#111110" }}>Descripción / Emisor</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "#111110", width: "120px" }}>Referencia</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "#111110", width: "120px", textAlign: "right" }}>
                    Monto (Haber)
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "#111110", width: "160px" }}>
                    Sugerencia IA
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "#111110", width: "150px" }}>
                    Asignar Inmueble
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "#111110", width: "120px" }}>Tipo</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "#111110", textAlign: "center", width: "80px" }}>
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMovs.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "32px", textAlign: "center", color: "rgba(20,20,19,0.5)" }}>
                      No se encontraron movimientos con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredMovs.map((m) => {
                    const isConfirmed = m.estado_conciliacion === "confirmado";
                    const isNoIdentificado =
                      isConfirmed &&
                      !m.inmueble_confirmado_id &&
                      (m.clasificacion_especial === "No Identificado" ||
                        m.inmueble_confirmado_identificador === "No Identificado");
                    const isNoAplica = isConfirmed && !m.inmueble_confirmado_id && !isNoIdentificado;

                    const activeInmId = isNoIdentificado
                      ? "no_identificado"
                      : isNoAplica
                      ? "no_aplica"
                      : m.inmueble_confirmado_id || m.inmueble_sugerido_id || "";

                    // Colores según estado y tipo de asignación (Gris para No Aplica, Ámbar para No Identificado, Verde para Inmuebles)
                    let rowBg = "transparent";
                    let rowHoverBg = "rgba(0, 0, 0, 0.02)";
                    let rowBorderBottom = "1px solid rgba(0, 0, 0, 0.04)";
                    let rowBorderLeft = "4px solid transparent";
                    let dateColor = "rgba(20, 20, 19, 0.6)";

                    if (isConfirmed) {
                      if (isNoAplica) {
                        rowBg = "#f1f5f9"; // Gris tenue elegante (slate-100)
                        rowHoverBg = "#e2e8f0"; // slate-200
                        rowBorderBottom = "1px solid rgba(148, 163, 184, 0.35)";
                        rowBorderLeft = "4px solid #64748b"; // slate-500
                        dateColor = "#475569";
                      } else if (isNoIdentificado) {
                        rowBg = "#fffbeb"; // Ámbar suave (amber-50)
                        rowHoverBg = "#fef3c7"; // amber-100
                        rowBorderBottom = "1px solid rgba(245, 158, 11, 0.35)";
                        rowBorderLeft = "4px solid #f59e0b"; // amber-500
                        dateColor = "#92400e";
                      } else {
                        rowBg = "#f0fdf4"; // Verde esmeralda (emerald-50)
                        rowHoverBg = "#dcfce7"; // emerald-100
                        rowBorderBottom = "1px solid rgba(16, 185, 129, 0.25)";
                        rowBorderLeft = "4px solid #10b981"; // emerald-500
                        dateColor = "#065f46";
                      }
                    }

                    return (
                      <tr
                        key={m.id}
                        style={{
                          borderBottom: rowBorderBottom,
                          background: rowBg,
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = rowHoverBg;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = rowBg;
                        }}
                      >
                        {/* Fecha */}
                        <td
                          style={{
                            padding: "12px 16px",
                            color: dateColor,
                            whiteSpace: "nowrap",
                            fontWeight: isConfirmed ? 600 : 400,
                            borderLeft: rowBorderLeft,
                          }}
                        >
                          {m.fecha}
                        </td>

                        {/* Descripción y metadatos */}
                        <td style={{ padding: "12px 16px", maxWidth: "340px" }}>
                          <div style={{ fontWeight: 500, color: "#111110", wordBreak: "break-word" }}>
                            {m.descripcion}
                          </div>
                          {(m.cedula_detectada || m.emisor_detectado || m.telf_detectado) && (
                            <div
                              style={{
                                display: "flex",
                                gap: "8px",
                                marginTop: "4px",
                                fontSize: "11px",
                                color: "rgba(20, 20, 19, 0.5)",
                                flexWrap: "wrap",
                              }}
                            >
                              {m.cedula_detectada && (
                                <span style={{ background: "rgba(0,0,0,0.04)", padding: "1px 6px", borderRadius: "4px" }}>
                                  CI: {m.cedula_detectada}
                                </span>
                              )}
                              {m.telf_detectado && (
                                <span style={{ background: "rgba(0,0,0,0.04)", padding: "1px 6px", borderRadius: "4px" }}>
                                  Telf: {m.telf_detectado}
                                </span>
                              )}
                              {m.emisor_detectado && (
                                <span style={{ background: "rgba(0,0,0,0.04)", padding: "1px 6px", borderRadius: "4px" }}>
                                  {m.emisor_detectado}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Referencia */}
                        <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "rgba(20, 20, 19, 0.7)" }}>
                          {m.referencia || "—"}
                        </td>

                        {/* Monto */}
                        <td
                          style={{
                            padding: "12px 16px",
                            textAlign: "right",
                            fontWeight: 600,
                            color: isNoAplica ? "#475569" : (m.haber > 0 ? "#111110" : "#dc2626"),
                            whiteSpace: "nowrap",
                          }}
                        >
                          {m.haber > 0 ? `+${formatCurrency(m.haber)}` : `-${formatCurrency(m.debe)}`}
                        </td>

                        {/* Sugerencia IA con Tooltip explicativo */}
                        <td style={{ padding: "12px 16px" }}>
                          {m.inmueble_sugerido_id ? (
                            <SuggestionTooltip
                              score={m.score_confianza}
                              razon={m.razon_sugerencia}
                              identificador={m.inmueble_sugerido_identificador}
                            >
                              <div
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  background:
                                    m.score_confianza >= 70
                                      ? "rgba(16, 185, 129, 0.08)"
                                      : "rgba(245, 158, 11, 0.08)",
                                  border: `1px solid ${
                                    m.score_confianza >= 70
                                      ? "rgba(16, 185, 129, 0.25)"
                                      : "rgba(245, 158, 11, 0.25)"
                                  }`,
                                  cursor: "help",
                                }}
                              >
                                <Sparkles
                                  size={13}
                                  style={{
                                    color: m.score_confianza >= 70 ? "#059669" : "#d97706",
                                  }}
                                />
                                <span
                                  style={{
                                    fontWeight: 600,
                                    fontSize: "12px",
                                    color: m.score_confianza >= 70 ? "#065f46" : "#92400e",
                                  }}
                                >
                                  {m.inmueble_sugerido_identificador}
                                </span>
                                <span style={{ fontSize: "11px", color: "rgba(20, 20, 19, 0.5)" }}>
                                  ({Math.round(m.score_confianza)}%)
                                </span>
                              </div>
                            </SuggestionTooltip>
                          ) : (
                            <span style={{ fontSize: "12px", color: "rgba(20, 20, 19, 0.4)" }}>
                              Sin sugerencia
                            </span>
                          )}
                        </td>

                        {/* Asignar Inmueble Manual con opciones "No Aplica" y "No Identificado" */}
                        <td style={{ padding: "12px 16px" }}>
                          <select
                            value={activeInmId}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "no_aplica") {
                                handleConfirmRow(m, null, m.clasificacion_especial === "No Identificado" ? "No Aplica" : (m.clasificacion_especial || "No Aplica"));
                              } else if (val === "no_identificado") {
                                handleConfirmRow(m, null, "No Identificado");
                              } else if (val) {
                                const cleanEsp = (m.clasificacion_especial === "No Identificado" || m.clasificacion_especial === "No Aplica") ? "" : m.clasificacion_especial;
                                handleConfirmRow(m, parseInt(val), cleanEsp);
                              } else if (isConfirmed) {
                                handleRevertRow(m);
                              }
                            }}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: "6px",
                              border: isConfirmed
                                ? isNoAplica
                                  ? "1px solid #94a3b8"
                                  : isNoIdentificado
                                  ? "1px solid #f59e0b"
                                  : "1px solid #10b981"
                                : "1px solid rgba(0, 0, 0, 0.15)",
                              background: isNoAplica
                                ? "#e2e8f0"
                                : isNoIdentificado
                                ? "#fef3c7"
                                : "#ffffff",
                              color: isNoAplica
                                ? "#334155"
                                : isNoIdentificado
                                ? "#92400e"
                                : "#111110",
                              fontWeight: isNoAplica || isNoIdentificado ? 600 : 400,
                              fontSize: "12.5px",
                              outline: "none",
                              fontFamily: "var(--font-mono)",
                              cursor: "pointer",
                            }}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="no_aplica">🚫 No Aplica (Interés / Operacional)</option>
                            <option value="no_identificado">❓ No Identificado (Por Verificar)</option>
                            {inmuebles.map((inm) => (
                              <option key={inm.id} value={inm.id}>
                                {inm.identificador} - {inm.propietario}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Clasificación Especial (Ej: Caney) */}
                        <td style={{ padding: "12px 16px" }}>
                          <select
                            value={m.clasificacion_especial === "No Identificado" || m.clasificacion_especial === "No Aplica" ? "" : (m.clasificacion_especial || "")}
                            onChange={(e) => {
                              const esp = e.target.value;
                              if (isNoAplica) {
                                handleConfirmRow(m, null, esp || "No Aplica");
                              } else if (isNoIdentificado) {
                                handleConfirmRow(m, null, "No Identificado");
                              } else {
                                const inmId = m.inmueble_confirmado_id || m.inmueble_sugerido_id;
                                if (inmId) {
                                  handleConfirmRow(m, inmId, esp);
                                } else if (esp === "Multa" || esp === "Gasto Operacional") {
                                  handleConfirmRow(m, null, esp);
                                }
                              }
                            }}
                            disabled={isNoIdentificado}
                            style={{
                              padding: "5px 8px",
                              borderRadius: "6px",
                              border: "1px solid rgba(0, 0, 0, 0.1)",
                              background: isNoIdentificado ? "rgba(0,0,0,0.03)" : (m.clasificacion_especial === "Caney" ? "rgba(245, 158, 11, 0.1)" : "transparent"),
                              color: isNoIdentificado ? "rgba(20,20,19,0.4)" : (m.clasificacion_especial === "Caney" ? "#92400e" : "#111110"),
                              fontSize: "12px",
                              fontWeight: m.clasificacion_especial && !isNoIdentificado ? 600 : 400,
                              cursor: isNoIdentificado ? "not-allowed" : "pointer",
                            }}
                          >
                            <option value="">Ordinario</option>
                            <option value="Caney">Caney / Área Social</option>
                            <option value="Salón de Fiesta">Salón de Fiesta</option>
                            <option value="Multa">Multa / Interés</option>
                            <option value="Gasto Operacional">Gasto Operacional</option>
                          </select>
                        </td>

                        {/* Estado / Acción rápida */}
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          {isConfirmed ? (
                            isNoAplica ? (
                              <div
                                title="Conciliado como No Aplica"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  color: "#64748b",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                }}
                              >
                                <CheckCircle2 size={16} />
                              </div>
                            ) : isNoIdentificado ? (
                              <div
                                title="Marcado como No Identificado (Pendiente por verificar)"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  color: "#d97706",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                }}
                              >
                                <AlertCircle size={16} />
                              </div>
                            ) : (
                              <div
                                title="Confirmado y aprendido por el sistema"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  color: "#059669",
                                  fontSize: "12px",
                                  fontWeight: 500,
                                }}
                              >
                                <CheckCircle2 size={16} />
                              </div>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (m.inmueble_sugerido_id) {
                                  handleConfirmRow(m, m.inmueble_sugerido_id);
                                }
                              }}
                              disabled={!m.inmueble_sugerido_id}
                              title={m.inmueble_sugerido_id ? "Aceptar sugerencia y aprender" : "Selecciona un inmueble"}
                              style={{
                                padding: "6px 10px",
                                borderRadius: "6px",
                                border: "1px solid rgba(0, 0, 0, 0.12)",
                                background: m.inmueble_sugerido_id ? "#111110" : "rgba(0, 0, 0, 0.05)",
                                color: m.inmueble_sugerido_id ? "#ffffff" : "rgba(20, 20, 19, 0.3)",
                                fontSize: "11.5px",
                                fontWeight: 500,
                                cursor: m.inmueble_sugerido_id ? "pointer" : "not-allowed",
                              }}
                            >
                              Aceptar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: FUSIONAR CARPETAS                                     */}
      {/* ============================================================== */}
      {modalFusionar.open && modalFusionar.carpetaOrigen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "440px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <GitMerge size={20} style={{ color: "#111110" }} />
              <h3 style={{ fontSize: "17px", fontWeight: 600, color: "#111110", margin: 0 }}>
                Fusionar Carpeta
              </h3>
            </div>

            <p style={{ fontSize: "13px", color: "rgba(20, 20, 19, 0.7)", lineHeight: "1.5", margin: "0 0 16px 0" }}>
              Se moverán todas las conciliaciones de <b>"{modalFusionar.carpetaOrigen.nombre}"</b> dentro de la carpeta destino seleccionada, y la carpeta origen se eliminará.
            </p>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "rgba(20, 20, 19, 0.7)", marginBottom: "6px", display: "block" }}>
                Carpeta Destino (donde se unificarán)
              </label>
              <select
                value={modalFusionar.carpetaDestinoId}
                onChange={(e) => setModalFusionar((prev) => ({ ...prev, carpetaDestinoId: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(0, 0, 0, 0.15)",
                  background: "#ffffff",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              >
                {carpetas
                  .filter((c) => c.id !== modalFusionar.carpetaOrigen.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      📁 {c.nombre} ({c.items?.length || 0} conciliaciones)
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setModalFusionar({ open: false, carpetaOrigen: null, carpetaDestinoId: "" })}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  background: "#ffffff",
                  color: "#111110",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEjecutarFusion}
                disabled={!modalFusionar.carpetaDestinoId}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#111110",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Confirmar Fusión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: MOVER CONCILIACIÓN A OTRA CARPETA                     */}
      {/* ============================================================== */}
      {modalMover.open && modalMover.item && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "440px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <MoveRight size={20} style={{ color: "#111110" }} />
              <h3 style={{ fontSize: "17px", fontWeight: 600, color: "#111110", margin: 0 }}>
                Mover a Otra Carpeta
              </h3>
            </div>

            <p style={{ fontSize: "13px", color: "rgba(20, 20, 19, 0.7)", lineHeight: "1.5", margin: "0 0 16px 0" }}>
              Mover <b>"{modalMover.item.titulo_display}"</b> a la siguiente carpeta:
            </p>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "rgba(20, 20, 19, 0.7)", marginBottom: "6px", display: "block" }}>
                Carpeta Destino
              </label>
              <select
                value={modalMover.nuevaCarpetaId}
                onChange={(e) => setModalMover((prev) => ({ ...prev, nuevaCarpetaId: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(0, 0, 0, 0.15)",
                  background: "#ffffff",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              >
                {carpetas
                  .filter((c) => c.id !== modalMover.item.carpeta_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      📁 {c.nombre} ({c.items?.length || 0} conciliaciones)
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setModalMover({ open: false, item: null, nuevaCarpetaId: "" })}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  background: "#ffffff",
                  color: "#111110",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEjecutarMover}
                disabled={!modalMover.nuevaCarpetaId}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#111110",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Transferir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: CREAR NUEVA CARPETA DIRECTA                           */}
      {/* ============================================================== */}
      {modalNuevaCarpeta && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <FolderPlus size={20} style={{ color: "#111110" }} />
              <h3 style={{ fontSize: "17px", fontWeight: 600, color: "#111110", margin: 0 }}>
                Crear Nueva Carpeta
              </h3>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "rgba(20, 20, 19, 0.7)", marginBottom: "6px", display: "block" }}>
                Nombre de la Carpeta
              </label>
              <input
                type="text"
                placeholder="Ej: Noviembre 2026, Auditoría Especial..."
                value={nombreNuevaCarpeta}
                onChange={(e) => setNombreNuevaCarpeta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCrearCarpetaDirecta();
                  if (e.key === "Escape") setModalNuevaCarpeta(false);
                }}
                autoFocus
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(0, 0, 0, 0.15)",
                  background: "#ffffff",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setModalNuevaCarpeta(false)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  background: "#ffffff",
                  color: "#111110",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCrearCarpetaDirecta}
                disabled={!nombreNuevaCarpeta.trim()}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#111110",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Crear Carpeta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: MAPEO INTERACTIVO DE COLUMNAS */}
      <ColumnMapperModal
        isOpen={modalColumnMapper.open}
        onClose={() => setModalColumnMapper({ open: false, file: null })}
        condominioId={condominio?.id}
        file={modalColumnMapper.file}
        carpetaId={carpetaModoSubida === "existente" && carpetaDestinoSubida ? parseInt(carpetaDestinoSubida) : null}
        carpetaNombre={carpetaModoSubida === "nueva" ? carpetaNuevaNombreSubida.trim() : ""}
        esHistorico={esHistorico}
        titulo={tituloNuevo.trim()}
        bancoNombre={bancoSeleccionado !== "auto" ? bancoSeleccionado : ""}
        onSuccess={(data) => {
          setEstadoCuenta(data);
          setMovimientos(data.movimientos || []);
          setTituloTemp(data.titulo || tituloNuevo || "Nueva Conciliación");
          setTituloNuevo("");
          setVista("conciliando");
          loadCarpetas(condominio.id);
          showNotice(`¡Extracto importado con mapeo interactivo! ${data.total_movimientos} movimientos cargados.`);
        }}
      />

      {/* MODAL 5: REPORTE GENERAL DE CONCILIACIONES Y FILTRADO */}
      <ReporteGeneralModal
        isOpen={modalReporteGeneral}
        onClose={() => setModalReporteGeneral(false)}
        condominio={condominio}
        carpetas={carpetas}
      />
    </div>
  );
}
