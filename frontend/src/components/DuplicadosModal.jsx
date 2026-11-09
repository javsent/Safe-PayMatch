import React, { useState, useEffect } from "react";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Copy,
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { fetchDuplicados, resolverDuplicados } from "../api";

/**
 * DuplicadosModal
 * Muestra grupos de pagos duplicados (cross-upload) y permite al usuario
 * resolver cada grupo: mantener uno, mantener todos, o eliminar todos.
 */
export default function DuplicadosModal({ condominio, onClose, onResolved }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [decisiones, setDecisiones] = useState({}); // grupoIdx -> { accion: 'mantener_id' | 'eliminar_todos' | 'mantener_todos', mantener_id }
  const [resolviendo, setResolviendo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [gruposColapsados, setGruposColapsados] = useState({});

  useEffect(() => {
    cargarDuplicados();
  }, [condominio?.id]);

  const cargarDuplicados = async () => {
    if (!condominio?.id) return;
    setCargando(true);
    setError(null);
    try {
      const data = await fetchDuplicados(condominio.id);
      setGrupos(data.grupos || []);

      // Inicializar decisiones con la sugerencia del backend
      const dec = {};
      (data.grupos || []).forEach((g, i) => {
        dec[i] = {
          accion: g.sugerido_mantener_id ? "mantener_id" : "mantener_todos",
          mantener_id: g.sugerido_mantener_id,
        };
      });
      setDecisiones(dec);
    } catch (e) {
      setError(e.message || "Error al detectar duplicados");
    } finally {
      setCargando(false);
    }
  };

  const toggleColapsado = (idx) => {
    setGruposColapsados((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const setDecision = (grupoIdx, accion, mantener_id = null) => {
    setDecisiones((prev) => ({
      ...prev,
      [grupoIdx]: { accion, mantener_id },
    }));
  };

  const handleResolver = async () => {
    setResolviendo(true);
    try {
      const payload = {
        grupos: grupos.map((g, i) => {
          const dec = decisiones[i] || { accion: "mantener_todos" };
          const todos_ids = g.movimientos.map((m) => m.id);

          if (dec.accion === "eliminar_todos") {
            return { mantener_id: null, eliminar_ids: todos_ids };
          } else if (dec.accion === "mantener_id" && dec.mantener_id) {
            return {
              mantener_id: dec.mantener_id,
              eliminar_ids: todos_ids.filter((id) => id !== dec.mantener_id),
            };
          } else {
            // mantener_todos -> no eliminar nada
            return { mantener_id: null, eliminar_ids: [] };
          }
        }),
      };

      const res = await resolverDuplicados(condominio.id, payload);
      setResultado(res);

      // Notificar al padre para que recargue los movimientos
      if (onResolved) onResolved(res);
    } catch (e) {
      setError(e.message || "Error al resolver duplicados");
    } finally {
      setResolviendo(false);
    }
  };

  const formatMonto = (n) =>
    new Intl.NumberFormat("es-VE", {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const formatFecha = (f) => {
    if (!f) return "—";
    try {
      return new Date(f + "T00:00:00").toLocaleDateString("es-VE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return f;
    }
  };

  const estadoChip = (estado) => {
    const map = {
      confirmado: { label: "Confirmado", cls: "bg-green-500/20 text-green-400 border border-green-500/40" },
      descartado: { label: "Descartado", cls: "bg-red-500/20 text-red-400 border border-red-500/40" },
      pendiente: { label: "Pendiente", cls: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40" },
    };
    const e = map[estado] || { label: estado || "?", cls: "bg-gray-500/20 text-gray-400 border border-gray-500/40" };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.cls}`}>
        {e.label}
      </span>
    );
  };

  // ── Render: resultado post-resolución ────────────────────────────────────
  if (resultado) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Duplicados Resueltos
          </h2>
          <p className="text-gray-400 mb-6">
            Se eliminaron{" "}
            <span className="text-white font-bold">{resultado.eliminados}</span>{" "}
            {resultado.eliminados === 1 ? "pago duplicado" : "pagos duplicados"}{" "}
            de la base de datos.
          </p>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // ── Render: cargando ─────────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-10 text-center">
          <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Analizando pagos duplicados…</p>
        </div>
      </div>
    );
  }

  // ── Render: sin duplicados ───────────────────────────────────────────────
  if (!cargando && grupos.length === 0 && !error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Sin duplicados detectados
          </h2>
          <p className="text-gray-400 mb-6">
            No se encontraron pagos duplicados en los estados de cuenta cargados
            para <span className="text-white">{condominio?.nombre}</span>.
          </p>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // ── Render: lista de duplicados ──────────────────────────────────────────
  const gruposConEliminacion = grupos.filter((_, i) => {
    const dec = decisiones[i];
    if (!dec) return false;
    if (dec.accion === "eliminar_todos") return true;
    if (dec.accion === "mantener_id") {
      const todos_ids = grupos[i].movimientos.map((m) => m.id);
      return todos_ids.filter((id) => id !== dec.mantener_id).length > 0;
    }
    return false;
  });
  const totalAEliminar = gruposConEliminacion.reduce((acc, g, _) => {
    // count eliminar_ids for this group
    return acc; // We'll compute it properly in the button label
  }, 0);

  let totalEliminarCount = 0;
  grupos.forEach((g, i) => {
    const dec = decisiones[i];
    if (!dec) return;
    const todos_ids = g.movimientos.map((m) => m.id);
    if (dec.accion === "eliminar_todos") totalEliminarCount += todos_ids.length;
    else if (dec.accion === "mantener_id" && dec.mantener_id)
      totalEliminarCount += todos_ids.filter((id) => id !== dec.mantener_id).length;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#141414] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl mx-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center">
              <Copy className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Pagos Duplicados Detectados
              </h2>
              <p className="text-sm text-gray-400">
                {grupos.length} {grupos.length === 1 ? "grupo" : "grupos"} •{" "}
                {condominio?.nombre}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Aviso informativo */}
        <div className="mx-6 mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 text-sm flex items-start gap-2 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
          <span>
            Los grupos a continuación tienen pagos con la misma referencia y monto que aparecen en dos o más extractos.
            Decide qué hacer con cada uno antes de aplicar los cambios.
          </span>
        </div>

        {/* Grupos de duplicados */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {grupos.map((grupo, grupoIdx) => {
            const dec = decisiones[grupoIdx] || { accion: "mantener_todos" };
            const colapsado = gruposColapsados[grupoIdx];

            return (
              <div
                key={grupoIdx}
                className="border border-white/10 rounded-xl overflow-hidden"
              >
                {/* Cabecera del grupo */}
                <div
                  className="flex items-center justify-between p-4 bg-white/[0.03] cursor-pointer hover:bg-white/[0.06] transition-colors"
                  onClick={() => toggleColapsado(grupoIdx)}
                >
                  <div className="flex items-center gap-3">
                    {colapsado ? (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    )}
                    <div>
                      <span className="text-white font-mono text-sm font-medium">
                        Ref: {grupo.referencia}
                      </span>
                      <span className="mx-3 text-gray-600">|</span>
                      <span className="text-green-400 font-semibold text-sm">
                        Bs {formatMonto(grupo.haber)}
                      </span>
                      <span className="ml-3 text-xs text-gray-500">
                        {grupo.movimientos.length} copias encontradas
                      </span>
                    </div>
                  </div>

                  {/* Decisión actual (chip) */}
                  <div onClick={(e) => e.stopPropagation()}>
                    {dec.accion === "eliminar_todos" && (
                      <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/40">
                        Eliminar todos
                      </span>
                    )}
                    {dec.accion === "mantener_todos" && (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-500/20 text-gray-400 border border-gray-500/40">
                        Mantener todos
                      </span>
                    )}
                    {dec.accion === "mantener_id" && (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/40">
                        Mantener 1 copia
                      </span>
                    )}
                  </div>
                </div>

                {/* Movimientos del grupo (colapsable) */}
                {!colapsado && (
                  <div className="border-t border-white/10">
                    {grupo.movimientos.map((mov) => {
                      const esMantener =
                        dec.accion === "mantener_id" && dec.mantener_id === mov.id;
                      const esEliminar =
                        dec.accion === "eliminar_todos" ||
                        (dec.accion === "mantener_id" && dec.mantener_id !== mov.id);

                      return (
                        <div
                          key={mov.id}
                          className={`flex items-center gap-4 p-4 border-b border-white/5 last:border-b-0 transition-colors ${
                            esMantener
                              ? "bg-green-500/5"
                              : esEliminar
                              ? "bg-red-500/5"
                              : ""
                          }`}
                        >
                          {/* Info del movimiento */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-xs text-gray-400 font-mono">
                                {formatFecha(mov.fecha)}
                              </span>
                              {estadoChip(mov.estado_conciliacion)}
                              {mov.inmueble_confirmado_id && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40">
                                  Apt confirmado
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-200 truncate">
                              {mov.descripcion || "Sin descripción"}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Extracto:{" "}
                              <span className="text-gray-400">
                                {mov.estado_cuenta_titulo || `#${mov.estado_cuenta_id}`}
                              </span>
                              {mov.banco && (
                                <span className="ml-2 text-gray-500">
                                  · {mov.banco}
                                </span>
                              )}
                            </p>
                          </div>

                          {/* Botones de acción por movimiento */}
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              title="Mantener solo este pago (eliminar los otros)"
                              onClick={() =>
                                setDecision(grupoIdx, "mantener_id", mov.id)
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                                esMantener
                                  ? "bg-green-500/25 text-green-300 border-green-500/50"
                                  : "bg-white/5 text-gray-400 border-white/10 hover:bg-green-500/15 hover:text-green-400 hover:border-green-500/30"
                              }`}
                            >
                              Mantener este
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Acciones globales del grupo */}
                    <div className="flex gap-2 p-3 bg-white/[0.02] border-t border-white/5">
                      <button
                        onClick={() => setDecision(grupoIdx, "mantener_todos")}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                          dec.accion === "mantener_todos"
                            ? "bg-gray-500/25 text-gray-300 border-gray-500/50"
                            : "bg-white/5 text-gray-500 border-white/10 hover:bg-white/10 hover:text-gray-300"
                        }`}
                      >
                        Conservar todos
                      </button>
                      <button
                        onClick={() => setDecision(grupoIdx, "eliminar_todos")}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                          dec.accion === "eliminar_todos"
                            ? "bg-red-500/25 text-red-300 border-red-500/50"
                            : "bg-white/5 text-gray-500 border-white/10 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30"
                        }`}
                      >
                        <span className="flex items-center justify-center gap-1.5">
                          <Trash2 className="w-3 h-3" />
                          Eliminar todos
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="text-sm text-gray-400">
            {totalEliminarCount > 0 ? (
              <span>
                Se eliminarán{" "}
                <span className="text-white font-semibold">{totalEliminarCount}</span>{" "}
                {totalEliminarCount === 1 ? "pago duplicado" : "pagos duplicados"}
              </span>
            ) : (
              <span className="text-gray-600">
                Sin cambios pendientes (todos conservados)
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={resolviendo}
              className="px-5 py-2.5 rounded-xl bg-white/8 text-gray-300 text-sm font-medium hover:bg-white/15 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleResolver}
              disabled={resolviendo || totalEliminarCount === 0}
              className="px-6 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {resolviendo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Aplicando…
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Aplicar Cambios
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
