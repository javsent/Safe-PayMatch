from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal

class CondominioCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = ""
    icono: Optional[str] = ""

class CondominioResponse(BaseModel):
    id: int
    nombre: str
    descripcion: str
    icono: str
    created_at: str

class InmuebleCreate(BaseModel):
    identificador: str
    propietario: str
    inquilino: Optional[str] = ""
    telefonos: Optional[str] = ""
    email: Optional[str] = ""
    otros_datos: Optional[str] = ""

# Campos permitidos para UPDATE de inmueble (whitelist contra SQL injection)
INMUEBLE_ALLOWED_FIELDS = {"identificador", "propietario", "inquilino", "telefonos", "email", "otros_datos"}

class InmuebleUpdate(BaseModel):
    identificador: Optional[str] = None
    propietario: Optional[str] = None
    inquilino: Optional[str] = None
    telefonos: Optional[str] = None
    email: Optional[str] = None
    otros_datos: Optional[str] = None

class InmuebleResponse(BaseModel):
    id: int
    condominio_id: int
    identificador: str
    propietario: str
    inquilino: str
    telefonos: str
    email: str
    otros_datos: str
    datos_aprendidos: Optional[List[Dict[str, Any]]] = []
    created_at: str

class EstadoCuentaUpdate(BaseModel):
    titulo: str

class ConfirmacionMovimiento(BaseModel):
    movimiento_id: int
    inmueble_id: Optional[int] = None
    clasificacion_especial: Optional[str] = "" # ej 'Caney' o vacio para ordinario
    # Estado válido: solo estos tres valores permitidos
    estado_conciliacion: Optional[Literal["confirmado", "descartado", "pendiente"]] = "confirmado"

class ConfirmacionLote(BaseModel):
    confirmaciones: List[ConfirmacionMovimiento]

class MovimientoResponse(BaseModel):
    id: int
    estado_cuenta_id: int
    condominio_id: int
    fecha: str
    tipo_operacion: str
    descripcion: str
    referencia: str
    debe: float
    haber: float
    saldo: float
    emisor_detectado: str
    cedula_detectada: str
    cta_detectada: str
    telf_detectado: str
    inmueble_sugerido_id: Optional[int] = None
    inmueble_sugerido_identificador: Optional[str] = None
    inmueble_confirmado_id: Optional[int] = None
    inmueble_confirmado_identificador: Optional[str] = None
    score_confianza: float
    razon_sugerencia: str
    estado_conciliacion: Optional[str] = "pendiente"
    clasificacion_especial: str

class CarpetaCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = ""

class CarpetaUpdate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None

class CarpetaFusionar(BaseModel):
    carpeta_origen_id: int
    carpeta_destino_id: int

class MoverConciliacion(BaseModel):
    carpeta_id: int

class ReportePersonalizadoExport(BaseModel):
    titulo_reporte: str = "Reporte Consolidado de Movimientos"
    subtitulo_filtros: Optional[str] = ""
    formato: str = "excel" # "excel" o "pdf"
    movimientos: List[Dict[str, Any]]

class DownloadUpdateRequest(BaseModel):
    url: str
    version: str

class BancoCreate(BaseModel):
    nombre: str
