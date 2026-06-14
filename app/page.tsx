'use client'

import { Fragment, useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import CargaTrabajo from './CargaTrabajo'

type Tarea = {
  id: number
  tipo: string
  tarea: string
  notas: string
  prioridad: string
  estado: string
  tiempo_estimado: number
  tiempo_real: number
  fecha_solicitud: string
  deadline: string
  fecha_planificada?: string | null
  fecha_finalizacion: string
  done: boolean | string
  solicitado_por: string
  orden: number
  en_plan: boolean
  hora_finalizacion?: string
  excluir_plan?: boolean
  excluida_fecha?: string | null
  parent_id?: number | null
  fragmento_num?: number | null
  fragmentos_total?: number | null
  es_fragmento?: boolean
  es_padre?: boolean
}

type TareaImportPayload = {
  tipo: string
  tarea: string
  notas: string | null
  solicitado_por: string
  prioridad: string
  estado: string
  tiempo_estimado: number
  tiempo_real: number
  fecha_solicitud: string
  deadline: string
  fecha_planificada: string | null
  fecha_finalizacion: string | null
  hora_finalizacion: string | null
  done: boolean
  en_plan: boolean
  excluir_plan: boolean
}

type DuplicateImport = {
  id: number
  actual: Tarea
  update: TareaImportPayload
}

const TIPOS_FORM = ['Operativa', 'Táctica', 'Estratégica']
const TIPOS_ALL  = ['Semanal', 'Mensual', 'Trimestral', 'Operativa', 'Táctica', 'Estratégica']
const RUTINARIAS = ['Semanal', 'Mensual', 'Trimestral']
const ESTADOS    = ['Pendiente', 'En espera', 'En progreso', 'Completada', 'Omitida']
const PRIORIDADES = ['Alta', 'Media', 'Baja']

const TABS = [
  { key: 'Todas',       label: 'Todas',        emoji: '●',  sub: '' },
  { key: 'Plan',        label: 'Plan del día', emoji: '☀️', sub: '' },
  { key: 'Rutinaria',   label: 'Rutinarias',   emoji: '🔁', sub: '' },
  { key: 'Operativa',   label: 'Operativas',   emoji: '⚡', sub: '<=30 min' },
  { key: 'Táctica',     label: 'Tácticas',     emoji: '🎯', sub: '<=120 min' },
  { key: 'Estratégica', label: 'Estratégicas', emoji: '🔭', sub: '>120 min' },
  { key: 'Completadas', label: 'Historial',    emoji: '📁', sub: '' },
  { key: 'Carga',       label: 'Carga de trabajo', emoji: '📊', sub: '' },
]

const MODULES = [
  { key: 'tareas', label: 'Tareas', description: 'Plan, listado por vistas y carga de trabajo.', status: 'Activo', tone: 'bg-gray-900 text-white', accent: 'bg-gray-900', meta: 'Disponible' },
  { key: 'dinero', label: 'Dinero', description: 'Rendimientos, ingresos, gastos y evolución.', status: 'Pendiente', tone: 'bg-emerald-50 text-emerald-700', accent: 'bg-emerald-500', meta: 'Finanzas' },
  { key: 'salud', label: 'Salud y hábitos', description: 'Hábitos, musculación, indicadores y seguimiento.', status: 'Pendiente', tone: 'bg-rose-50 text-rose-700', accent: 'bg-rose-500', meta: 'Rutinas' },
  { key: 'pareja', label: 'Amor', description: 'Ciclo, lenguajes del amor y planes para cuidar la relación.', status: 'Activo', tone: 'bg-violet-50 text-violet-700', accent: 'bg-violet-500', meta: 'Cuidado' },
  { key: 'dentistas', label: 'Dentistas', description: 'Proyecto, tareas, hitos y próximos pasos.', status: 'Pendiente', tone: 'bg-sky-50 text-sky-700', accent: 'bg-sky-500', meta: 'Proyecto' },
]

const empty: Omit<Tarea, 'id'> = {
  tipo: 'Operativa', tarea: '', notas: '', prioridad: 'Media', estado: 'Pendiente',
  tiempo_estimado: 0, tiempo_real: 0, fecha_solicitud: '', deadline: '', fecha_planificada: '',
  fecha_finalizacion: '', done: false, solicitado_por: '', orden: 0, en_plan: false
}

const TIPO_COLORS: Record<string, { bg: string, text: string, dot: string }> = {
  Operativa:   { bg: 'bg-sky-50',     text: 'text-sky-700',     dot: 'bg-sky-400' },
  'Táctica':     { bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-400' },
  'Estratégica': { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  Semanal:     { bg: 'bg-gray-100',   text: 'text-gray-600',    dot: 'bg-gray-500' },
  Mensual:     { bg: 'bg-gray-100',   text: 'text-gray-600',    dot: 'bg-gray-600' },
  Trimestral:  { bg: 'bg-gray-100',   text: 'text-gray-600',    dot: 'bg-gray-700' },
}

const ESTADO_COLORS: Record<string, { bg: string, text: string }> = {
  Pendiente:     { bg: 'bg-gray-100',   text: 'text-gray-500' },
  'En espera':   { bg: 'bg-amber-50',   text: 'text-amber-600' },
  'En progreso': { bg: 'bg-blue-50',    text: 'text-blue-600' },
  Completada:    { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  Omitida:       { bg: 'bg-gray-100',   text: 'text-gray-400' },
}

const MASTER_COLS = [
  { key: 'tipo',            label: 'tipo *',            hint: 'Semanal / Mensual / Trimestral / Operativa / Táctica / Estratégica' },
  { key: 'tarea',           label: 'tarea *',           hint: 'Texto libre con fecha al final. Ej: Fichar entrada 01/06/2026' },
  { key: 'notas',           label: 'notas',             hint: 'Texto libre' },
  { key: 'solicitado_por',  label: 'solicitado_por *',  hint: 'Nombre o equipo' },
  { key: 'prioridad',       label: 'prioridad *',       hint: 'Alta / Media / Baja' },
  { key: 'estado',          label: 'estado *',          hint: 'Pendiente / En espera / En progreso / Completada' },
  { key: 'tiempo_estimado', label: 'tiempo_estimado *', hint: 'Número entero (minutos)' },
  { key: 'tiempo_real',     label: 'tiempo_real',       hint: 'Número entero (minutos)' },
  { key: 'fecha_solicitud', label: 'fecha_solicitud *', hint: 'DD/MM/AAAA' },
  { key: 'deadline',        label: 'deadline *',        hint: 'DD/MM/AAAA' },
  { key: 'fecha_planificada', label: 'fecha_planificada', hint: 'Opcional. DD/MM/AAAA. Día en el que quieres trabajarla' },
]

function diasRetrasoFn(deadline: string, today: string): number { return diasRetraso(deadline, today) }
function diasRetraso(deadline: string, today: string): number {
  if (!deadline || deadline >= today) return 0
  return Math.floor((new Date(today).getTime() - new Date(deadline).getTime()) / 86400000)
}

function fDate(d: string) {
  if (!d) return '-'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

function parseDate(raw: string): string | null {
  if (!raw?.trim()) return null
  const s = raw.trim()
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/')
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function minToHM(min: number): string {
  if (!min) return '0m'
  const h = Math.floor(min / 60), m = min % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function KpiCard({ label, val, sub, accent }: { label: string, val: string | number, sub?: string, accent?: boolean }) {
  return (
    <div className={`border rounded-xl p-5 transition ${accent ? 'border-blue-100 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
      <div className={`text-2xl font-bold mb-1 ${accent ? 'text-blue-600' : 'text-gray-900'}`}>{val}</div>
      <div className="text-sm font-semibold text-gray-700 mb-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  )
}

function GeneralKpis({ tareas, filtered, tab, today }: { tareas: Tarea[], filtered: Tarea[], tab: string, today: string }) {
  const total = filtered.length
  const tEst = filtered.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
  const completadasHoy = tareas.filter(t => t.fecha_finalizacion === today && (t.done || t.estado === 'Completada')).length
  const avgMin = total > 0 ? Math.round(tEst / total) : 0
  const activas = tareas.filter(t => !t.done && t.estado !== 'Omitida')

  return (
    <div className="grid grid-cols-4 gap-5 mb-8">
      <KpiCard label="Tareas" val={total} sub={tab === 'Completadas' ? 'en historial' : 'sin completar'}/>
      <KpiCard label="Tiempo estimado" val={minToHM(tEst)} sub={`${avgMin}m de media`}/>
      <KpiCard label="Completadas hoy" val={completadasHoy} sub="marcadas hoy"/>
      <KpiCard label="Tareas activas total" val={activas.length} sub={minToHM(activas.reduce((s, t) => s + (t.tiempo_estimado || 0), 0))}/>
    </div>
  )
}

function PlanKpis({ filtered }: { filtered: Tarea[] }) {
  const total = filtered.length
  const hechas = filtered.filter(t => t.done || t.estado === 'Completada' || t.estado === 'Omitida').length
  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0

  const tEstTotal = filtered.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
  const tEstHecho = filtered.filter(t => t.done || t.estado === 'Completada').reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
  const pendientes = filtered.filter(t => !t.done && t.estado !== 'Completada' && t.estado !== 'Omitida')
  const pendientesCount = pendientes.length
  const pendientesMin = pendientes.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
  const hoy = new Date().toISOString().split('T')[0]
  const vencenHoy = pendientes.filter(t => t.deadline === hoy).length
  const retrasadas = pendientes.filter(t => t.deadline && t.deadline < hoy).length
  const pctTiempo = tEstTotal > 0 ? Math.round((tEstHecho / tEstTotal) * 100) : 0

  return (
    <div className="mb-8 space-y-4">
      {(() => {
        const completadas = filtered.filter(t => t.done || t.estado === 'Completada')
        const estCompletadas = completadas.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
        const realCompletadas = completadas.reduce((s, t) => s + (t.tiempo_real || 0), 0)
        const diffCompletadas = realCompletadas - estCompletadas

        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border border-gray-100 rounded-lg px-3 py-2 bg-white">
              <div className="text-sm font-semibold text-gray-500">{minToHM(estCompletadas)}</div>
              <div className="text-[11px] text-gray-300">Estimado completadas</div>
            </div>
            <div className="border border-gray-100 rounded-lg px-3 py-2 bg-white">
              <div className="text-sm font-semibold text-gray-500">{minToHM(realCompletadas)}</div>
              <div className="text-[11px] text-gray-300">Real completadas</div>
            </div>
            <div className="border border-gray-100 rounded-lg px-3 py-2 bg-white">
              <div className={`text-sm font-semibold ${diffCompletadas <= 0 ? 'text-gray-500' : 'text-red-400'}`}>
                {diffCompletadas === 0 ? '=' : diffCompletadas > 0 ? `+${minToHM(diffCompletadas)}` : `-${minToHM(Math.abs(diffCompletadas))}`}
              </div>
              <div className="text-[11px] text-gray-300">Diferencia completadas</div>
            </div>
          </div>
        )
      })()}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition">
          <div className="text-2xl font-bold text-gray-900 mb-1">{hechas}<span className="text-gray-300 text-lg font-normal">/{total}</span></div>
          <div className="text-sm font-semibold text-gray-700 mb-1">Tareas</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gray-900 rounded-full" style={{width:`${pct}%`}}></div>
            </div>
            <span className="text-xs text-gray-400">{pct}%</span>
          </div>
        </div>

        <div className="border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition">
          <div className="text-2xl font-bold text-gray-900 mb-1">{minToHM(tEstHecho)}<span className="text-gray-300 text-lg font-normal"> / {minToHM(tEstTotal)}</span></div>
          <div className="text-sm font-semibold text-gray-700 mb-1">Tiempo estimado</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gray-900 rounded-full" style={{width:`${pctTiempo}%`}}></div>
            </div>
            <span className="text-xs text-gray-400">{pctTiempo}%</span>
          </div>
        </div>

        <div className="border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition">
          <div className="text-2xl font-bold text-gray-900 mb-1">{pendientesCount}<span className="text-gray-300 text-lg font-normal"> pendientes</span></div>
          <div className="text-sm font-semibold text-gray-700 mb-1">Por resolver</div>
          <div className="text-xs text-gray-400">{minToHM(pendientesMin)} estimadas</div>
        </div>

        <div className="border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition">
          <div className="text-2xl font-bold text-gray-900 mb-1">{vencenHoy}<span className="text-gray-300 text-lg font-normal"> hoy</span></div>
          <div className="text-sm font-semibold text-gray-700 mb-1">Deadline</div>
          <div className={`text-xs ${retrasadas > 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {retrasadas > 0 ? `${retrasadas} atrasadas` : 'Sin atrasos'}
          </div>
        </div>
      </div>
    </div>
  )
}

function shortTaskName(tarea: string): string {
  const match = tarea.match(/^(.*?)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return tarea
  const [, name, day, month] = match
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${name} · ${parseInt(day)} ${months[parseInt(month)-1]}`
}

function dateOnly(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function daysBetween(from: Date, to: Date) {
  return Math.round((dateOnly(to).getTime() - dateOnly(from).getTime()) / 86400000)
}

function formatShortDate(value: string) {
  return parseLocalDate(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const AMOR_CICLO = {
  ultimaReal: '2026-05-23',
  proximaEstimada: '2026-06-26',
  chocolate: ['2026-06-24', '2026-06-25'],
}

const LOVE_LANGUAGES = [
  { key: 'calidad', label: 'Tiempo de calidad', hint: 'Un rato sin móvil, paseo, cena o conversación tranquila.' },
  { key: 'servicio', label: 'Actos de servicio', hint: 'Quitarle carga: resolver algo, ayudar o anticiparte.' },
  { key: 'comunicacion', label: 'Comunicación', hint: 'Preguntar, escuchar y no ir directo a corregir.' },
  { key: 'palabras', label: 'Palabras de afirmación', hint: 'Decir algo concreto que valoras de ella.' },
  { key: 'contacto', label: 'Contacto físico', hint: 'Abrazo, mano, caricia o cercanía si le apetece.' },
  { key: 'detalles', label: 'Detalles/regalos', hint: 'Chocolate, nota, flor, merienda o sorpresa pequeña.' },
]

const PLANES_AMOR = [
  { tipo: 'Tranquilo', nombre: 'Paseo por Plaza del Pilar y ribera del Ebro', detalle: 'Plan suave para hablar, parar y acabar tomando algo.' },
  { tipo: 'Cultural', nombre: 'Museo + café', detalle: 'Pablo Gargallo, Goya, CaixaForum o Pablo Serrano.' },
  { tipo: 'Noche', nombre: 'Magia o monólogo', detalle: 'El Sótano Mágico, Teatro de las Esquinas o El Refugio del Crápula.' },
  { tipo: 'Diferente', nombre: 'Taller creativo', detalle: 'Cerámica, pintura, vino y pintura o una cata tranquila.' },
  { tipo: 'Escapada', nombre: 'Monasterio de Piedra o Albarracín', detalle: 'Para un día completo cuando haya energía y tiempo.' },
]

function AmorPanel({ onBack }: { onBack: () => void }) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const today = dateOnly(new Date())
  const lastPeriod = parseLocalDate(AMOR_CICLO.ultimaReal)
  const nextPeriod = parseLocalDate(AMOR_CICLO.proximaEstimada)
  const cycleDay = Math.max(1, daysBetween(lastPeriod, today) + 1)
  const daysToPeriod = daysBetween(today, nextPeriod)
  const cycleLength = Math.max(1, daysBetween(lastPeriod, nextPeriod))
  const progress = Math.min(100, Math.max(0, Math.round((cycleDay / cycleLength) * 100)))

  const phase = cycleDay <= 5
    ? { name: 'Menstruación', tone: 'bg-rose-50 text-rose-700 border-rose-100', need: 'calma, descanso y cero presión' }
    : cycleDay <= 12
      ? { name: 'Folicular', tone: 'bg-emerald-50 text-emerald-700 border-emerald-100', need: 'planes ligeros, ilusión y energía compartida' }
      : cycleDay <= 17
        ? { name: 'Ovulación', tone: 'bg-sky-50 text-sky-700 border-sky-100', need: 'conexión, presencia y planes más sociales' }
        : { name: 'Lútea', tone: 'bg-violet-50 text-violet-700 border-violet-100', need: 'paciencia, cariño estable y actos de servicio' }

  const recommendations = [
    'Hazle la vida un poco más fácil hoy con un acto de servicio pequeño.',
    'Valida antes de solucionar: escucha, pregunta y acompaña.',
    daysToPeriod <= 14 ? 'Plan mejor tranquilo que exigente: paseo, cena fácil o película.' : 'Puedes proponer algo con más movimiento si la notas con energía.',
  ]

  function toggle(key: string) {
    setDone(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <main className="min-h-screen bg-gray-50/60 text-gray-900">
      <div className="border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 h-14 flex items-center justify-between">
          <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">Volver</button>
          <span className="font-semibold text-gray-900 text-sm tracking-tight">Amor</span>
          <span className="w-[70px]"></span>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 pt-8 pb-16 space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-violet-500 uppercase tracking-wider mb-2">Cuidar la relación</div>
            <h1 className="text-3xl font-bold text-gray-950 tracking-tight">Amor</h1>
            <p className="text-sm text-gray-500 mt-2 max-w-2xl">Ciclo, gestos diarios, lenguajes del amor y planes para elegir mejor cómo estar presente.</p>
          </div>
          <div className="text-xs text-gray-400">Última regla real: {formatShortDate(AMOR_CICLO.ultimaReal)} · Próxima estimada: {formatShortDate(AMOR_CICLO.proximaEstimada)}</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2 border border-gray-100 rounded-xl bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-500">Ciclo actual</div>
                <div className="mt-2 text-3xl font-bold text-gray-950">Día {cycleDay}</div>
              </div>
              <span className={`text-xs font-semibold border rounded-lg px-3 py-1.5 ${phase.tone}`}>{phase.name}</span>
            </div>
            <div className="mt-5 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-gray-900 rounded-full" style={{ width: `${progress}%` }}></div>
            </div>
            <div className="mt-3 flex justify-between text-xs text-gray-400">
              <span>{formatShortDate(AMOR_CICLO.ultimaReal)}</span>
              <span>{daysToPeriod >= 0 ? `faltan ${daysToPeriod} días` : `${Math.abs(daysToPeriod)} días de retraso`}</span>
              <span>{formatShortDate(AMOR_CICLO.proximaEstimada)}</span>
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl bg-white p-5">
            <div className="text-sm font-semibold text-gray-500">Qué necesita más</div>
            <div className="mt-3 text-xl font-bold text-gray-950 leading-snug">{phase.need}</div>
            <p className="text-xs text-gray-400 mt-3">Orientativo, basado en el calendario que tienes en Excel.</p>
          </div>

          <div className="border border-gray-100 rounded-xl bg-white p-5">
            <div className="text-sm font-semibold text-gray-500">Chocolate</div>
            <div className="mt-3 text-xl font-bold text-gray-950">{AMOR_CICLO.chocolate.map(formatShortDate).join(' y ')}</div>
            <p className="text-xs text-gray-400 mt-3">Tu forecast lo marca como señal premenstrual.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="border border-gray-100 rounded-xl bg-white p-5">
            <div className="text-sm font-semibold text-gray-900 mb-4">Hoy, mejor así</div>
            <div className="space-y-3">
              {recommendations.map(item => (
                <div key={item} className="flex gap-3 text-sm text-gray-600">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0"></span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="xl:col-span-2 border border-gray-100 rounded-xl bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Lenguajes del amor</div>
                <div className="text-xs text-gray-400 mt-1">{done.size}/{LOVE_LANGUAGES.length} cuidados marcados hoy</div>
              </div>
              <div className="text-xs text-gray-400">Del Excel Ilaria</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {LOVE_LANGUAGES.map(item => {
                const active = done.has(item.key)
                return (
                  <button key={item.key} onClick={() => toggle(item.key)}
                    className={`text-left border rounded-xl p-4 transition ${active ? 'border-violet-200 bg-violet-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center text-xs ${active ? 'bg-violet-600 border-violet-600 text-white' : 'border-gray-200 text-transparent'}`}>✓</span>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                        <div className="text-xs text-gray-400 mt-1 leading-relaxed">{item.hint}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="border border-gray-100 rounded-xl bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-gray-900">Planes</div>
              <div className="text-xs text-gray-400 mt-1">Ideas sacadas de tu documento de planes.</div>
            </div>
            <span className="text-xs text-gray-400">{PLANES_AMOR.length} ideas</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {PLANES_AMOR.map(plan => (
              <div key={plan.nombre} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition">
                <div className="text-[11px] font-semibold text-violet-500 uppercase tracking-wider">{plan.tipo}</div>
                <div className="text-sm font-bold text-gray-900 mt-2">{plan.nombre}</div>
                <div className="text-xs text-gray-400 mt-2 leading-relaxed">{plan.detalle}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

function ColFilter({ label, options, value, onChange, onSort, sortDir, isSorted }: {
  label: string, options: string[], value: Set<string>, onChange: (v: Set<string>) => void,
  onSort?: () => void, sortDir?: 'asc'|'desc', isSorted?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { if (open) setTimeout(() => searchRef.current?.focus(), 50) }, [open])

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  const allSelected = filtered.every(o => value.has(o))

  function toggleOption(o: string) {
    const next = new Set(value)
    if (next.has(o)) next.delete(o); else next.add(o)
    onChange(next)
  }
  function toggleAll() {
    if (allSelected) {
      const next = new Set(value)
      filtered.forEach(o => next.delete(o))
      onChange(next)
    } else {
      const next = new Set(value)
      filtered.forEach(o => next.add(o))
      onChange(next)
    }
  }

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1 h-full w-full">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center justify-center gap-1 text-center text-xs font-semibold uppercase tracking-wider transition flex-1 ${value.size > 0 ? 'text-gray-800' : 'text-gray-400'} hover:text-gray-700`}>
        {label}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
        {value.size > 0 && <span className="w-4 h-4 rounded-full bg-gray-800 text-white text-[9px] flex items-center justify-center flex-shrink-0 font-bold">{value.size}</span>}
      </button>
      {onSort && (
        <button onClick={onSort} className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition ${isSorted ? 'text-gray-700' : 'text-gray-300 hover:text-gray-500'}`}>
          {isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </button>
      )}
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-30 w-52 py-2">
          <div className="px-2 mb-1">
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..." className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-gray-400 text-gray-700 placeholder:text-gray-300"/>
          </div>
          <div className="border-b border-gray-100 mx-2 mb-1"></div>
          <button onClick={toggleAll} className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 flex items-center gap-2">
            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${allSelected ? 'bg-gray-800 border-gray-800' : 'border-gray-300'}`}>
              {allSelected && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
            </div>
            <span className="font-medium">{allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}</span>
          </button>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(o => (
              <button key={o} onClick={() => toggleOption(o)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${value.has(o) ? 'bg-gray-800 border-gray-800' : 'border-gray-300'}`}>
                  {value.has(o) && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                </div>
                <span className={value.has(o) ? 'text-gray-800 font-medium' : 'text-gray-500'}>{o}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-2 text-xs text-gray-300">Sin resultados</div>}
          </div>
          {value.size > 0 && (
            <div className="border-t border-gray-100 mx-2 mt-1 pt-1">
              <button onClick={() => { onChange(new Set()); setOpen(false) }} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 hover:bg-gray-50 rounded-lg transition">
                Limpiar filtro
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TextFilter({ value, onChange, onSort, sortDir, isSorted }: {
  value: string, onChange: (v: string) => void,
  onSort?: () => void, sortDir?: 'asc'|'desc', isSorted?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])
  return (
    <div ref={ref} className="relative inline-flex items-center gap-1 h-full w-full">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center justify-center gap-1 text-center text-xs font-semibold uppercase tracking-wider transition flex-1 ${value ? 'text-gray-800' : 'text-gray-400'} hover:text-gray-700`}>
        Tarea
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
        {value && <span className="w-1.5 h-1.5 rounded-full bg-gray-700 ml-0.5"></span>}
      </button>
      {onSort && (
        <button onClick={onSort} className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition ${isSorted ? 'text-gray-700' : 'text-gray-300 hover:text-gray-500'}`}>
          {isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </button>
      )}
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-30 w-52 p-2">
          <input ref={inputRef} value={value} onChange={e => onChange(e.target.value)} placeholder="Buscar tarea..."
            onKeyDown={e => e.key === 'Enter' && setOpen(false)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-gray-400 text-gray-700 placeholder:text-gray-300"/>
          {value && (
            <button onClick={() => { onChange(''); setOpen(false) }} className="mt-1 w-full text-xs text-gray-400 hover:text-gray-600 py-1 hover:bg-gray-50 rounded-lg transition">
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  )
}


function Field({label, error, children, full}: {label: string, error?: string, children: React.ReactNode, full?: boolean}) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? 'col-span-2' : ''}`}>
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
      {children}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}

export default function Home() {
  const [activeModule, setActiveModule] = useState<string | null>(null)
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState<number | null>(null)
  const [tab, setTab] = useState('Plan')
  const [mounted, setMounted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cargaRefreshKey, setCargaRefreshKey] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number, skipped: number, duplicates: DuplicateImport[], errors: string[] } | null>(null)

  const [tiempoRealModal, setTiempoRealModal] = useState<{tarea: Tarea, action: 'complete'|'omit'} | null>(null)
  const [tiempoRealInput, setTiempoRealInput] = useState('')

  const [fragmentModal, setFragmentModal] = useState<Tarea | null>(null)
  const [fragmentSize, setFragmentSize] = useState(120)
  const [fragmentParts, setFragmentParts] = useState<{ minutes: number, deadline: string }[]>([])

  function buildFragmentParts(t: Tarea, size: number) {
    const total = t.tiempo_estimado || 0
    const safeSize = Math.max(1, size || 120)
    const parts = Math.max(1, Math.ceil(total / safeSize))

    return Array.from({ length: parts }, (_, i) => {
      const remaining = total - (i * safeSize)

      return {
        minutes: Math.min(safeSize, Math.max(0, remaining)),
        deadline: t.deadline || today
      }
    })
  }

  function openFragmentModal(t: Tarea) {
    const size = Math.min(120, Math.max(1, t.tiempo_estimado || 120))
    setFragmentSize(size)
    setFragmentParts(buildFragmentParts(t, size))
    setFragmentModal(t)
  }

  function updateFragmentSize(value: number) {
    const safe = Math.max(1, value || 120)
    setFragmentSize(safe)

    if (fragmentModal) {
      setFragmentParts(buildFragmentParts(fragmentModal, safe))
    }
  }

  function updateFragmentPart(index: number, patch: Partial<{ minutes: number, deadline: string }>) {
    setFragmentParts(prev => prev.map((part, i) => i === index ? { ...part, ...patch } : part))
  }

  const fragmentPartsTotal = fragmentParts.reduce((sum, part) => sum + (part.minutes || 0), 0)

  const [, setDeleting] = useState(false)

  const [fTarea, setFTarea] = useState('')
  const [fTipo, setFTipo] = useState<Set<string>>(new Set())
  const [fEstado, setFEstado] = useState<Set<string>>(new Set())
  const [fFechaSol, setFFechaSol] = useState<Set<string>>(new Set())
  const [fDeadline, setFDeadline] = useState<Set<string>>(new Set())
  const [fFechaFin, setFFechaFin] = useState<Set<string>>(new Set())
  const [sortCol, setSortCol] = useState<string|null>(null)
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc')

  const dragIdx = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [colWidths, setColWidths] = useState([90, 130, 340, 110, 120, 60, 60, 60, 130, 80])
  const colResizing = useRef<{ col: number, startX: number, startW: number } | null>(null)
  const today = new Date().toISOString().split('T')[0]

  function cleanDateValue(value?: string | null): string {
    if (!value) return ''

    const raw = String(value).trim()

    // ISO normal: 2026-06-04 o 2026-06-04T10:00:00
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

    // Formato español: 04/06/2026
    const es = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (es) {
      const d = es[1].padStart(2, '0')
      const m = es[2].padStart(2, '0')
      const y = es[3]
      return `${y}-${m}-${d}`
    }

    return raw.slice(0, 10)
  }

  function dateIsTodayOrPast(value?: string | null): boolean {
    const d = cleanDateValue(value)
    return !!d && d <= today
  }

  useEffect(() => {
    const savedTab = localStorage.getItem('gestor_tab')
    if (savedTab && TABS.some(t => t.key === savedTab)) setTab(savedTab)
    // gestor_tab_restored
  }, [])

  useEffect(() => {
    setMounted(true)
    const savedTab = localStorage.getItem('gestor_tab') || 'Plan'
    setTab(TABS.some(t => t.key === savedTab) ? savedTab : 'Plan')
    // gestor_tab_mounted_restore
  }, [])

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem('gestor_tab', tab)
  }, [tab, mounted])

  useEffect(() => {
    if (!mounted) return
    if (tab === 'Plan') fetchTareas()
  }, [tab, mounted])

  useEffect(() => {
    async function init() {
      await autoArchivarAyer()
      await fetchTareas()
    }
    init()
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const resizing = colResizing.current
      if (!resizing) return

      const diff = e.clientX - resizing.startX

      setColWidths(prev => {
        const next = [...prev]
        next[resizing.col] = Math.max(48, resizing.startW + diff)
        return next
      })
    }
    const onUp = () => { colResizing.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  async function fetchTareas() {
    setLoading(true)
    const { data } = await supabase.from('tareas').select('*').order('orden', { ascending: true }).order('id', { ascending: false })
    setTareas(data || [])
    setLoading(false)
  }

  const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort()

  function getTabFiltered(): Tarea[] {
    return tareas.filter(t => {
      const isDone = t.done === true || t.done === 'true'
      const isInactive = isDone || t.estado === 'Omitida' || t.estado === 'Completada'
      const isParent = t.es_padre === true
      if (isParent) return false

      const normalized = { ...t, done: isDone }
      const inPlanToday = isEnPlan(normalized)

      if (tab === 'Todas') return !isInactive
      if (tab === 'Completadas') return isInactive

      if (tab === 'Plan') {
        if (!isInactive && inPlanToday) return true
        if (isInactive && cleanDateValue(t.fecha_finalizacion) === today && !t.excluir_plan) return true
        return false
      }

      // Regla de siempre:
      // si una tarea entra en Plan del día, desaparece de Rutinarias/Operativas/Tácticas/Estratégicas.
      if (tab === 'Rutinaria') {
        return !isInactive && RUTINARIAS.includes(t.tipo) && !inPlanToday
      }

      return !isInactive && t.tipo === tab && !inPlanToday
    })
  }
  const tabFiltered = getTabFiltered()
  const fechaSolOpts = uniq(tabFiltered.map(t => t.fecha_solicitud ? fDate(t.fecha_solicitud) : ''))
  const deadlineOpts = uniq(tabFiltered.map(t => t.deadline ? fDate(t.deadline) : ''))
  const tipoOpts = uniq(tabFiltered.map(t => t.tipo))
  const estadoOpts = uniq(tabFiltered.map(t => t.estado))

  function isEnPlan(t: Tarea): boolean {
    const isDone = t.done === true || t.done === 'true'
    if (isDone || t.estado === 'Omitida' || t.estado === 'Completada' || t.es_padre === true) return false

    const excluidaHoy = !!t.excluir_plan && cleanDateValue(t.excluida_fecha) === today
    if (excluidaHoy) return false

    // Si tiene fecha planificada:
    // futura => no sale todavía
    // hoy o pasada => sí sale en Plan del día
    if (t.fecha_planificada) return dateIsTodayOrPast(t.fecha_planificada)

    // Si NO tiene fecha planificada:
    // entra por deadline vencido o de hoy
    if (t.deadline) return dateIsTodayOrPast(t.deadline)

    return !!t.en_plan
  }

  function getFiltered(all: Tarea[]): Tarea[] {
    const result = all.filter(t => {
      const isDone = t.done === true || t.done === 'true'
      const isInactive = isDone || t.estado === 'Omitida' || t.estado === 'Completada'
      const isParent = t.es_padre === true
      if (isParent) return false

      const normalized = { ...t, done: isDone }
      const inPlanToday = isEnPlan(normalized)

      if (tab === 'Todas') {
        if (isInactive) return false
      } else if (tab === 'Completadas') {
        if (!isInactive) return false
      } else if (tab === 'Plan') {
        const inPlan = (!isInactive && inPlanToday) ||
          (isInactive && cleanDateValue(t.fecha_finalizacion) === today && !t.excluir_plan)
        if (!inPlan) return false
      } else if (tab === 'Rutinaria') {
        if (isInactive || !RUTINARIAS.includes(t.tipo) || inPlanToday) return false
      } else {
        if (isInactive || t.tipo !== tab || inPlanToday) return false
      }

      if (fTarea && !t.tarea.toLowerCase().includes(fTarea.toLowerCase()) && !(t.notas||'').toLowerCase().includes(fTarea.toLowerCase())) return false
      if (fTipo.size > 0 && !fTipo.has(t.tipo)) return false
      if (fEstado.size > 0 && !fEstado.has(t.estado)) return false
      if (fFechaSol.size > 0 && !fFechaSol.has(fDate(t.fecha_solicitud))) return false
      if (fDeadline.size > 0 && !fDeadline.has(fDate(t.deadline))) return false
      if (fFechaFin.size > 0 && !fFechaFin.has(fDate(t.fecha_finalizacion))) return false
      return true
    })

    if (sortCol) {
      result.sort((a, b) => {
        let av = a[sortCol as keyof Tarea]
        let bv = b[sortCol as keyof Tarea]

        if (sortCol === 'deadline' || sortCol === 'fecha_solicitud' || sortCol === 'fecha_finalizacion' || sortCol === 'fecha_planificada') {
          av = cleanDateValue(String(av || '')) || '9999-12-31'
          bv = cleanDateValue(String(bv || '')) || '9999-12-31'
        } else if (sortCol === 'tiempo_estimado' || sortCol === 'tiempo_real') {
          av = Number(av || 0)
          bv = Number(bv || 0)
        } else {
          av = String(av || '').toLowerCase()
          bv = String(bv || '').toLowerCase()
        }

        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }
  const filtered = getFiltered(tareas)
  const isInactiveForPlan = (t: Tarea) =>
    t.done === true ||
    t.done === 'true' ||
    t.estado === 'Completada' ||
    t.estado === 'Omitida'

  // Solo afecta a la tabla: pendientes arriba, completadas/omitidas hoy abajo.
  // Los KPIs siguen usando `filtered`, así cuentan todo el Plan del día.
  const displayFiltered = tab === 'Plan'
    ? [
        ...filtered.filter(t => !isInactiveForPlan(t)),
        ...filtered
          .filter(t => isInactiveForPlan(t))
          .sort((a, b) => {
            const aTime = String(a.hora_finalizacion || '')
            const bTime = String(b.hora_finalizacion || '')
            const aDate = cleanDateValue(a.fecha_finalizacion)
            const bDate = cleanDateValue(b.fecha_finalizacion)

            // Completadas/omitidas abajo, ordenadas por finalización:
            // primera terminada arriba, última terminada abajo.
            const aKey = `${aDate}T${aTime}`
            const bKey = `${bDate}T${bTime}`

            if (aKey < bKey) return -1
            if (aKey > bKey) return 1
            return (a.id || 0) - (b.id || 0)
          }),
      ]
    : filtered

  const hasFilters = !!(fTarea || fTipo.size || fEstado.size || fFechaSol.size || fDeadline.size || fFechaFin.size)
  function handleSort(col: string) {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortCol(null); setSortDir('asc') }
    } else {
      setSortCol(col); setSortDir('asc')
    }
  }

  // limpiar filtros al cambiar de pestaña
  useEffect(() => {
    setFTarea('')
    setFTipo(new Set())
    setFEstado(new Set())
    setFFechaSol(new Set())
    setFDeadline(new Set())
    setFFechaFin(new Set())
    setSortCol(null)
    setSortDir('asc')
  }, [tab])


  function clearFilters() { setFTarea(''); setFTipo(new Set()); setFEstado(new Set()); setFFechaSol(new Set()); setFDeadline(new Set()); setFFechaFin(new Set()); setSortCol(null) }

  const tareasNoPadre = tareas.filter(t => t.es_padre !== true)

  const stats = {
    activas: tareasNoPadre.filter(t => t.done !== true && t.done !== 'true' && t.estado !== 'Omitida' && t.estado !== 'Completada').length,
    plan: tareasNoPadre.filter(t => isEnPlan(t)).length,
    completadas: tareasNoPadre.filter(t => t.done === true || t.done === 'true' || t.estado === 'Omitida' || t.estado === 'Completada').length,
    minutos: tareasNoPadre.filter(t => t.done !== true && t.done !== 'true' && t.estado !== 'Omitida' && t.estado !== 'Completada').reduce((s, t) => s + (t.tiempo_estimado||0), 0),
  }

  const tabCount = (key: string) => {
    if (key==='Todas') return stats.activas
    if (key==='Plan') return stats.plan
    if (key==='Completadas') return stats.completadas
    if (key==='Carga') return 0
    if (key==='Rutinaria') return tareasNoPadre.filter(x => RUTINARIAS.includes(x.tipo) && !x.done && x.estado !== 'Omitida' && x.estado !== 'Completada' && !isEnPlan(x)).length
    return tareasNoPadre.filter(x => x.tipo===key && !x.done && x.estado !== 'Omitida' && x.estado !== 'Completada' && !isEnPlan(x)).length
  }

  function onDragStart(idx: number) {
    if (sortCol) return
    dragIdx.current = idx
    setDragging(idx)
  }

  function onDragEnter(idx: number) {
    if (sortCol) return
    dragOver.current = idx
    setDragOverIdx(idx)
  }

  async function onDrop() {
    if (sortCol) {
      dragIdx.current = null
      dragOver.current = null
      setDragging(null)
      setDragOverIdx(null)
      return
    }

    if (dragIdx.current === null || dragOver.current === null || dragIdx.current === dragOver.current) {
      setDragging(null); setDragOverIdx(null); return
    }
    const newList = [...displayFiltered]
    const [moved] = newList.splice(dragIdx.current, 1)
    newList.splice(dragOver.current, 0, moved)
    const idToOrden: Record<number, number> = {}
    newList.forEach((t, i) => { idToOrden[t.id] = i + 1 })
    setTareas(prev => prev.map(t => idToOrden[t.id] !== undefined ? { ...t, orden: idToOrden[t.id] } : t))
    dragIdx.current = null
    dragOver.current = null
    setDragging(null)
    setDragOverIdx(null)
    setSortCol(null)
    setSortDir('asc')

    await Promise.all(
      newList.map((t, i) =>
        supabase.from('tareas').update({ orden: i + 1 }).eq('id', t.id)
      )
    )

    await fetchTareas()
  }

  async function togglePlan(t: Tarea) {
    const autoplan = !!(t.deadline && t.deadline <= today)
    if (autoplan) {
      const dias = diasRetrasoFn(t.deadline, today)
      const msg = dias > 0
        ? `Esta tarea tiene ${dias} día(s) de retraso. ¿Quieres sacarla del Plan del día igualmente? Seguirá marcada como retrasada.`
        : `Esta tarea tiene deadline hoy. ¿Quieres sacarla del Plan del día?`
      if (!confirm(msg)) return
      const newExcluir = !t.excluir_plan
      await supabase.from('tareas').update({
        excluir_plan: newExcluir,
        excluida_fecha: newExcluir ? today : null,
        en_plan: false
      }).eq('id', t.id)
    } else {
      await supabase.from('tareas').update({ en_plan: !t.en_plan, excluir_plan: false }).eq('id', t.id)
    }
    fetchTareas()
  }

  async function completeTask(t: Tarea) {
    if (!t.tiempo_real || t.tiempo_real === 0) {
      setTiempoRealInput('')
      setTiempoRealModal({ tarea: t, action: 'complete' })
      return
    }
    const now = new Date().toISOString()
    await supabase.from('tareas').update({ done: true, estado: 'Completada', fecha_finalizacion: today, hora_finalizacion: now }).eq('id', t.id)
    fetchTareas()
  }

  async function omitTask(t: Tarea) {
    if (!t.tiempo_real || t.tiempo_real === 0) {
      setTiempoRealInput('')
      setTiempoRealModal({ tarea: t, action: 'omit' })
      return
    }
    const now = new Date().toISOString()
    await supabase.from('tareas').update({ done: false, estado: 'Omitida', fecha_finalizacion: today, hora_finalizacion: now }).eq('id', t.id)
    fetchTareas()
  }

  async function confirmTiempoReal() {
    if (!tiempoRealModal) return
    const mins = parseInt(tiempoRealInput) || 0
    if (tiempoRealModal.action === 'complete' && mins <= 0) return
    const { tarea } = tiempoRealModal
    const now = new Date().toISOString()
    if (tiempoRealModal.action === 'complete') {
      await supabase.from('tareas').update({ done: true, estado: 'Completada', fecha_finalizacion: today, hora_finalizacion: now, tiempo_real: mins }).eq('id', tarea.id)
    } else {
      await supabase.from('tareas').update({ done: false, estado: 'Omitida', fecha_finalizacion: today, hora_finalizacion: now, tiempo_real: mins }).eq('id', tarea.id)
    }
    setTiempoRealModal(null)
    setTiempoRealInput('')
    fetchTareas()
  }

  async function archivarDia() {
    if (!confirm('¿Archivar todas las tareas completadas y omitidas de hoy? Se moverán al Historial.')) return
    await supabase.from('tareas')
      .update({ excluir_plan: true })
      .or(`estado.eq.Completada,estado.eq.Omitida`)
      .eq('fecha_finalizacion', today)
    fetchTareas()
  }

  async function autoArchivarAyer() {
    // Archive completed/omitted from previous days
    await supabase.from('tareas')
      .update({ excluir_plan: true })
      .or(`estado.eq.Completada,estado.eq.Omitida`)
      .lt('fecha_finalizacion', today)
      .not('fecha_finalizacion', 'is', null)

    // Reset excluir_plan for active tasks excluded on previous days.
    // Así, si siguen retrasadas, vuelven al Plan del día al día siguiente.
    await supabase.from('tareas')
      .update({ excluir_plan: false, excluida_fecha: null })
      .eq('excluir_plan', true)
      .lt('excluida_fecha', today)
      .not('estado', 'in', '("Completada","Omitida")')
  }

  async function undoTask(t: Tarea) {
    await supabase.from('tareas').update({ done: false, estado: 'Pendiente', fecha_finalizacion: null, hora_finalizacion: null }).eq('id', t.id)
    fetchTareas()
  }

  async function deleteTask(id: number) {
    if (!confirm('¿Eliminar esta tarea?')) return
    await supabase.from('tareas').delete().eq('id', id)
    fetchTareas()
  }

  async function duplicateTask(t: Tarea) {
    const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(x => x.orden||0)) : 0
    const { tarea, tipo, notas, solicitado_por, prioridad, tiempo_estimado, fecha_solicitud, deadline, fecha_planificada, en_plan } = t
    await supabase.from('tareas').insert({
      tarea: `${tarea} (copia)`,
      tipo, notas, solicitado_por, prioridad,
      estado: 'Pendiente',
      tiempo_estimado,
      fecha_solicitud: fecha_solicitud || null,
      deadline: deadline || null,
      fecha_planificada: fecha_planificada || null,
      fecha_finalizacion: null,
      hora_finalizacion: null,
      done: false,
      en_plan: en_plan || false,
      excluir_plan: false,
      tiempo_real: 0,
      orden: maxOrden + 1
    })
    fetchTareas()
  }

  function openFragmentar(t: Tarea) {
    if (!t.tiempo_estimado || t.tiempo_estimado <= 0) {
      alert('Esta tarea no tiene tiempo estimado. Añade un tiempo estimado antes de fragmentarla.')
      return
    }
    setFragmentSize(Math.min(120, Math.max(1, t.tiempo_estimado || 120)))
    openFragmentModal(t)
  }

  async function fragmentTask(t: Tarea) {
    const partsConfig = fragmentParts
      .map(part => ({
        minutes: Math.max(0, Math.round(part.minutes || 0)),
        deadline: part.deadline || t.deadline || today
      }))
      .filter(part => part.minutes > 0)

    if (partsConfig.length === 0) {
      alert('Necesitas al menos una parte con minutos.')
      return
    }

    const totalOriginal = t.tiempo_estimado || 0
    const totalParts = partsConfig.reduce((sum, part) => sum + part.minutes, 0)

    if (totalOriginal > 0 && totalParts !== totalOriginal) {
      const ok = confirm(`Las partes suman ${totalParts}m, pero la tarea original tenía ${totalOriginal}m. ¿Quieres continuar igualmente?`)
      if (!ok) return
    }

    const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(x => x.orden || 0)) : 0
    const parts = partsConfig.length

    const inserts = partsConfig.map((part, i) => ({
      tipo: t.tipo,
      tarea: `${t.tarea} · parte ${i + 1}/${parts}`,
      notas: t.notas || null,
      solicitado_por: t.solicitado_por,
      prioridad: t.prioridad,
      estado: 'Pendiente',
      tiempo_estimado: part.minutes,
      tiempo_real: 0,
      fecha_solicitud: t.fecha_solicitud || today,
      deadline: part.deadline,
      fecha_planificada: null,
      fecha_finalizacion: null,
      hora_finalizacion: null,
      done: false,
      en_plan: false,
      excluir_plan: false,
      orden: maxOrden + i + 1,
      parent_id: t.id,
      fragmento_num: i + 1,
      fragmentos_total: parts,
      es_fragmento: true,
      es_padre: false
    }))

    const { error: insertError } = await supabase.from('tareas').insert(inserts)

    if (insertError) {
      alert(`Error al crear fragmentos: ${insertError.message}`)
      return
    }

    const { error: updateError } = await supabase
      .from('tareas')
      .update({
        es_padre: true,
        estado: 'En espera',
        en_plan: false,
        excluir_plan: true
      })
      .eq('id', t.id)

    if (updateError) {
      alert(`Fragmentos creados, pero no pude actualizar la tarea padre: ${updateError.message}`)
    }

    setFragmentModal(null)
    setFragmentParts([])
    fetchTareas()
  }

  function validate() {
    const e: Record<string,string> = {}
    if (!form.tarea.trim()) e.tarea = 'Obligatorio'
    if (!form.tipo) e.tipo = 'Obligatorio'
    if (!form.estado) e.estado = 'Obligatorio'
    if (!form.prioridad) e.prioridad = 'Obligatorio'
    if (!form.tiempo_estimado) e.tiempo_estimado = 'Obligatorio'
    if (!form.fecha_solicitud) e.fecha_solicitud = 'Obligatorio'
    if (!form.deadline) e.deadline = 'Obligatorio'
    if (!form.solicitado_por.trim()) e.solicitado_por = 'Obligatorio'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function saveTask() {
    if (!validate()) return
    setSaving(true)
    const clean = {
      ...form,
      fecha_solicitud: form.fecha_solicitud||null,
      deadline: form.deadline||null,
      fecha_planificada: form.fecha_planificada || null,
      fecha_finalizacion: form.fecha_finalizacion||null
    }
    if (editId) {
      await supabase.from('tareas').update(clean).eq('id', editId)
    } else {
      const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(t => t.orden||0)) : 0
      await supabase.from('tareas').insert({ ...clean, orden: maxOrden+1 })
    }
    setSaving(false); setModal(false); setForm(empty); setErrors({}); setEditId(null)
    setCargaRefreshKey(k => k + 1)
    fetchTareas()
  }

  function openEdit(t: Tarea) {
    if (t.deadline && t.deadline < today && !t.done && t.estado !== 'Omitida') {
      if (!confirm(`Esta tarea tiene ${diasRetrasoFn(t.deadline, today)} día(s) de retraso. ¿Quieres editarla de todas formas?`)) return
    }
    setForm({ tipo:t.tipo, tarea:t.tarea, notas:t.notas||'', prioridad:t.prioridad, estado:t.estado, tiempo_estimado:t.tiempo_estimado, tiempo_real:t.tiempo_real||0, fecha_solicitud:t.fecha_solicitud||'', deadline:t.deadline||'', fecha_planificada:t.fecha_planificada||'', fecha_finalizacion:t.fecha_finalizacion||'', done:t.done, solicitado_por:t.solicitado_por||'', orden:t.orden||0, en_plan:t.en_plan||false, excluir_plan:t.excluir_plan||false })
    setErrors({}); setEditId(t.id); setModal(true)
  }

  function openNew() {
    setForm({ ...empty, tipo: TIPOS_FORM.includes(tab) ? tab : 'Operativa' })
    setErrors({}); setEditId(null); setModal(true)
  }

  function downloadHojaTrabajo() {
    const rows = Array.from({ length: 12 }, (_, i) => `
      <tr>
        <td class="idx">${i + 1}</td>
        <td class="task"></td>
        <td class="time"></td>
        <td class="time"></td>
      </tr>
    `).join('')

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Hoja de tareas</title>
<style>
  @page {
    size: A4;
    margin: 10mm;
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font-family: Arial, Helvetica, sans-serif;
  }

  body {
    width: 210mm;
    min-height: 297mm;
  }

  .page {
    width: 100%;
    padding: 6mm 8mm 4mm 8mm;
  }

  .top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20mm;
    border-bottom: 2.5px solid #111;
    padding-bottom: 7mm;
    margin-bottom: 8mm;
  }

  h1 {
    margin: 0;
    font-size: 28px;
    line-height: 1;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .date {
    font-size: 13px;
    white-space: nowrap;
    padding-bottom: 1mm;
  }

  .date span {
    display: inline-block;
    width: 48mm;
    border-bottom: 1.4px solid #111;
    height: 7mm;
    vertical-align: bottom;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  th {
    border: 1.3px solid #111;
    height: 9mm;
    padding: 2mm 3mm;
    text-align: left;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  td {
    border: 1px solid #555;
    height: 17.7mm;
    padding: 2mm 3mm;
    vertical-align: top;
    font-size: 12px;
  }

  .idx {
    width: 9mm;
    text-align: center;
    vertical-align: middle;
    font-size: 13px;
    color: #111;
    padding: 0;
  }

  .task {
    width: auto;
  }

  .time {
    width: 23mm;
  }

  @media print {
    html, body {
      width: 210mm;
      height: 297mm;
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      page-break-after: avoid;
    }
  }
</style>
</head>
<body>
  <main class="page">
    <section class="top">
      <h1>Hoja de tareas</h1>
      <div class="date">Fecha: <span></span></div>
    </section>

    <table>
      <thead>
        <tr>
          <th style="width:9mm;text-align:center;">#</th>
          <th>Tarea / notas</th>
          <th style="width:23mm;">Est.</th>
          <th style="width:23mm;">Real</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </main>

  <script>
    window.onload = () => {
      window.focus()
      window.print()
    }
  </script>
</body>
</html>`

    const printWindow = window.open('', '_blank', 'width=900,height=1200')
    if (!printWindow) {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'hoja_de_tareas.html'
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  function downloadMaster() {
    const header = MASTER_COLS.map(c => c.label).join(';')
    const hint   = MASTER_COLS.map(c => c.hint).join(';')
    const blob = new Blob(['\ufeff' + [header, hint].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download='maestro_tareas.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function exportCSV() {
    const header = MASTER_COLS.map(c => c.label).join(';')
    const rows = tareas.map(t => [t.tipo,t.tarea,t.notas||'',t.solicitado_por||'',t.prioridad,t.estado,t.tiempo_estimado||0,t.tiempo_real||0,fDate(t.fecha_solicitud),fDate(t.deadline),fDate(t.fecha_planificada||'')].join(';'))
    const blob = new Blob(['\ufeff' + [header,...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`tareas_${today}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true); setImportResult(null)
    const text = await file.text()
    const firstLine = text.split('\n')[0]
    const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ','
    const parseLine = (line: string) => line.split(sep).map(c => c.trim().replace(/^"|"$/g,''))
    const lines = text.split('\n').map(l=>l.trim()).filter(Boolean)
    if (lines.length < 2) { setImportResult({added:0,skipped:0,duplicates:[],errors:['Archivo vacío']}); setImporting(false); return }

    const keyMap: Record<string,number> = {}
    parseLine(lines[0]).forEach((h,i) => { keyMap[h.replace(/\*/g,'').toLowerCase().trim().replace(/\s/g,'_')] = i })
    const get = (row: string[], key: string) => { const idx=keyMap[key]; return idx!==undefined?(row[idx]||'').trim():'' }

    const second = parseLine(lines[1])
    const isHint = second[0] && (second[0].includes('/')||second[0].toLowerCase().includes('texto')||second[0].toLowerCase().includes('número'))
    const dataStart = isHint ? 2 : 1

    const inserts: (TareaImportPayload & { orden: number })[] = []
    const duplicates: DuplicateImport[] = []
    const errs: string[] = []
    const seenCsv = new Set<string>()
    const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(t => t.orden||0)) : 0

    for (let i=dataStart; i<lines.length; i++) {
      const row = parseLine(lines[i]); if (row.every(c=>!c)) continue
      const rn=i+1
      const tarea=get(row,'tarea'), tipo=get(row,'tipo'), sp=get(row,'solicitado_por')
      const tr=get(row,'tiempo_estimado'), fr=get(row,'fecha_solicitud'), dr=get(row,'deadline'), fpr=get(row,'fecha_planificada')
      if (!tarea){errs.push(`Fila ${rn}: falta "tarea"`);continue}
      if (seenCsv.has(tarea)){errs.push(`Fila ${rn}: tarea repetida dentro del CSV: "${tarea}"`);continue}
      seenCsv.add(tarea)
      if (!tipo){errs.push(`Fila ${rn}: falta "tipo"`);continue}
      if (!sp){errs.push(`Fila ${rn}: falta "solicitado_por"`);continue}
      if (!tr){errs.push(`Fila ${rn}: falta "tiempo_estimado"`);continue}
      if (!fr){errs.push(`Fila ${rn}: falta "fecha_solicitud"`);continue}
      if (!dr){errs.push(`Fila ${rn}: falta "deadline"`);continue}
      const fs=parseDate(fr); if(!fs){errs.push(`Fila ${rn}: fecha_solicitud inválida`);continue}
      const dl=parseDate(dr); if(!dl){errs.push(`Fila ${rn}: deadline inválido`);continue}
      const fp = fpr ? parseDate(fpr) : null
      if (fpr && !fp) { errs.push(`Fila ${rn}: fecha_planificada inválida`); continue }

      const payload = {
        tipo,tarea,notas:get(row,'notas')||null,solicitado_por:sp,prioridad:get(row,'prioridad')||'Media',
        estado:get(row,'estado')||'Pendiente',tiempo_estimado:parseInt(tr)||0,tiempo_real:parseInt(get(row,'tiempo_real'))||0,
        fecha_solicitud:fs,deadline:dl,fecha_planificada:fp,fecha_finalizacion:null,hora_finalizacion:null,done:false,en_plan:false,excluir_plan:false
      }

      const exists = tareas.find(t => t.tarea === tarea)
      if (exists) {
        duplicates.push({ id: exists.id, actual: exists, update: payload })
      } else {
        inserts.push({ ...payload, orden:maxOrden+inserts.length+1 })
      }
    }

    let added = 0
    if (inserts.length > 0) {
      const { error } = await supabase.from('tareas').insert(inserts)
      if (error) errs.push(`Error al guardar: ${error.message}`)
      else { added = inserts.length; fetchTareas() }
    }

    setImportResult({ added, skipped: duplicates.length, duplicates, errors: errs })
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleConfirmOverwrite(selected: DuplicateImport[]) {
    if (!selected.length) return

    setDeleting(true)

    for (const item of selected) {
      await supabase
        .from('tareas')
        .update(item.update)
        .eq('id', item.id)
    }

    setDeleting(false)
    setImportResult(null)
    fetchTareas()
  }

  async function handleImportDuplicatesAnyway(selected: DuplicateImport[]) {
    if (!selected.length) return

    setDeleting(true)

    const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(t => t.orden || 0)) : 0

    const inserts = selected.map((item, i) => ({
      ...item.update,
      orden: maxOrden + i + 1
    }))

    const { error } = await supabase.from('tareas').insert(inserts)

    if (error) {
      alert(`Error al importar duplicadas: ${error.message}`)
    }

    setDeleting(false)
    setImportResult(null)
    fetchTareas()
  }

  const inputCls = (err?:string) => `w-full border rounded-lg px-3 py-2 text-sm outline-none transition bg-white text-gray-800 placeholder:text-gray-300 ${err?'border-red-300 focus:border-red-400':'border-gray-200 focus:border-gray-400'}`
  const selectCls = (err?:string) => `w-full border rounded-lg px-3 py-2 text-sm outline-none transition bg-white text-gray-800 cursor-pointer appearance-none pr-8 ${err?'border-red-300':'border-gray-200 focus:border-gray-400'}`

  const showNewBtn = !['Completadas','Rutinaria','Casa'].includes(tab)

  const renderResizeHandle = (col: number) => (
    <span
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        colResizing.current = { col, startX: e.clientX, startW: colWidths[col] }
      }}
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none group/resize"
      title="Arrastra para cambiar el ancho"
    >
      <span className="absolute right-0 top-2 bottom-2 w-px bg-gray-200 group-hover/resize:bg-gray-500 transition-colors"></span>
    </span>
  )

  if (!activeModule) {
    return (
      <main className="min-h-screen bg-gray-50/60 text-gray-900">
        <div className="border-b border-gray-100 bg-white/90 backdrop-blur">
          <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-md bg-gray-900 flex items-center justify-center flex-shrink-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              </div>
              <span className="font-semibold text-gray-900 text-sm tracking-tight">Gestor hogar</span>
            </div>
            <span className="text-gray-400 text-xs" suppressHydrationWarning>{new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>
          </div>
        </div>

        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 pt-10 pb-16">
          <div className="mb-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Casa</div>
              <h1 className="text-3xl font-bold text-gray-950 tracking-tight">Panel de casa</h1>
              <p className="text-sm text-gray-500 mt-2 max-w-2xl">Tus áreas principales en una sola entrada, con tareas ya funcionando y el resto preparado para crecer.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white">5 apartados</span>
              <span className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white">2 activos</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {MODULES.map(module => {
              const enabled = module.key === 'tareas' || module.key === 'pareja'
              return (
                <button
                  key={module.key}
                  onClick={() => enabled ? setActiveModule(module.key) : setActiveModule(module.key)}
                  className={`group relative overflow-hidden border rounded-xl bg-white p-5 text-left transition min-h-[172px] ${enabled ? 'border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'}`}
                >
                  <div className={`absolute inset-x-0 top-0 h-1 ${module.accent}`}></div>
                  <div className="flex h-full flex-col justify-between gap-6">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{module.meta}</div>
                          <div className="text-lg font-bold text-gray-950 mt-1">{module.label}</div>
                        </div>
                        <span className={`text-[11px] px-2 py-1 rounded-lg font-semibold ${module.tone}`}>{module.status}</span>
                      </div>
                      <div className="text-sm text-gray-500 mt-4 leading-relaxed">{module.description}</div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={enabled ? 'text-gray-900 font-semibold' : 'text-gray-400 font-medium'}>
                        {enabled ? 'Abrir' : 'Pendiente'}
                      </span>
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${enabled ? 'bg-gray-900 text-white group-hover:bg-gray-700' : 'bg-gray-50 text-gray-300 group-hover:text-gray-400'}`}>→</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </main>
    )
  }

  if (activeModule === 'pareja') {
    return <AmorPanel onBack={() => setActiveModule(null)} />
  }

  if (activeModule !== 'tareas') {
    const activeModuleMeta = MODULES.find(item => item.key === activeModule)
    return (
      <main className="min-h-screen bg-white text-gray-900">
        <div className="border-b border-gray-100 bg-white">
          <div className="max-w-screen-2xl mx-auto px-12 h-14 flex items-center justify-between">
            <button onClick={() => setActiveModule(null)} className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">Volver</button>
            <span className="font-semibold text-gray-900 text-sm tracking-tight">{activeModuleMeta?.label}</span>
            <span className="w-[70px]"></span>
          </div>
        </div>
        <div className="max-w-screen-2xl mx-auto px-12 pt-10 pb-16">
          <div className="border border-dashed border-gray-200 rounded-xl p-10 bg-gray-50/50">
            <div className="text-lg font-bold text-gray-900">{activeModuleMeta?.label}</div>
            <p className="text-sm text-gray-400 mt-2 max-w-xl">{activeModuleMeta?.description}</p>
            <div className="mt-5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Pendiente de desarrollar</div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <style jsx global>{`
        .gestor-table th,
        .gestor-table td {
          text-align: center;
          vertical-align: middle;
        }

        .gestor-table th {
          position: relative;
        }

        .gestor-table td > .flex,
        .gestor-table td > div.flex {
          justify-content: center;
        }

        .gestor-table .text-left {
          text-align: center;
        }

        .gestor-table .items-start {
          align-items: center;
        }

        .divide-task-btn {
          color: #d1d5db;
        }

        .divide-task-btn:hover {
          color: #7c3aed;
          background-color: #f5f3ff;
        }

        .divide-task-btn svg {
          stroke: currentColor;
          transition: color 150ms ease, stroke 150ms ease;
        }
      `}</style>

      <div className="border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-12 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-gray-900 flex items-center justify-center flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            </div>
            <button onClick={() => setActiveModule(null)} className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition">Inicio</button>
            <span className="font-semibold text-gray-900 text-sm tracking-tight">Tareas</span>
            <span className="text-gray-200">·</span>
            <span className="text-gray-400 text-xs capitalize" suppressHydrationWarning>{new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>
          </div>
          <div className="flex items-center gap-2">
            {mounted && <>
              <button onClick={downloadMaster} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">↓ Maestro</button>
              <button onClick={downloadHojaTrabajo} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">Hoja de trabajo</button>
              <button onClick={()=>{setImportResult(null);setImportModal(true)}} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">↑ Importar</button>
              <button onClick={exportCSV} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">↓ Exportar</button>
              {showNewBtn&&<button onClick={openNew} className="text-xs text-white bg-gray-900 hover:bg-gray-700 px-4 py-1.5 rounded-lg transition font-semibold">+ Nueva tarea</button>}
            </>}
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-12 pt-10 pb-16">

        <div className="mb-8 space-y-2">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-0.5 flex-wrap">
              {TABS.map(({key,label,emoji,sub})=>{
                const count=tabCount(key); const isActive=tab===key
                return(
                  <button key={key} onClick={()=>setTab(key)} title={sub||undefined}
                    className={`px-3.5 py-2 rounded-lg text-sm transition font-medium flex items-center gap-2 ${isActive?'bg-gray-900 text-white':'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}>
                    {emoji && <span>{emoji}</span>}
                    <span className="flex items-baseline gap-1.5">
                      {label}
                      {sub&&<span className={`text-[10px] font-normal ${isActive?'text-white/60':'text-gray-300'}`}>{sub}</span>}
                    </span>
                    {count>0&&<span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${isActive?'bg-white/20 text-white':'bg-gray-100 text-gray-400'}`}>{count}</span>}
                  </button>
                )
              })}
            </div>
            {hasFilters&&tab!=='Carga'&&(
              <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">Limpiar filtros</button>
            )}
          </div>
        </div>

        {tab === 'Carga' ? <CargaTrabajo onEditTarea={(id) => { const t = tareas.find(x => x.id === id); if (t) openEdit(t) }} refreshKey={cargaRefreshKey} /> : <>

        {tab === 'Plan' ? (
          <PlanKpis filtered={filtered}/>
        ) : (
          <GeneralKpis tareas={tareas} filtered={filtered} tab={tab} today={today}/>
        )}

        {tab === 'Plan' && !sortCol && (
          <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
            <span>Arrastra las filas para reordenarlas. Para ordenar por columna usa las flechas ↕ de la cabecera.</span>
          </div>
        )}

        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="gestor-table w-full text-sm border-collapse table-fixed text-center" style={{textAlign:"center"}}>
            <colgroup>
{colWidths.map((w,i) => <col key={i} style={{width:`${w}px`}}/>)}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200 bg-white" style={{height:44,whiteSpace:'nowrap'}}>
                <th className="relative px-3 select-none text-center">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Acciones</span>
                  {renderResizeHandle(0)}
                </th>
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="Tipo" options={tipoOpts} value={fTipo} onChange={setFTipo} onSort={()=>handleSort('tipo')} sortDir={sortDir} isSorted={sortCol==='tipo'}/>
                  {renderResizeHandle(1)}
                </th>
                <th className="relative px-4 select-none text-center">
                  <TextFilter value={fTarea} onChange={setFTarea} onSort={()=>handleSort('tarea')} sortDir={sortDir} isSorted={sortCol==='tarea'}/>
                  {renderResizeHandle(2)}
                </th>
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="F. Solic." options={fechaSolOpts} value={fFechaSol} onChange={setFFechaSol} onSort={()=>handleSort('fecha_solicitud')} sortDir={sortDir} isSorted={sortCol==='fecha_solicitud'}/>
                  {renderResizeHandle(3)}
                </th>
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="Deadline" options={deadlineOpts} value={fDeadline} onChange={setFDeadline} onSort={()=>handleSort('deadline')} sortDir={sortDir} isSorted={sortCol==='deadline'}/>
                  {renderResizeHandle(4)}
                </th>
                <th className="relative px-3 text-center select-none">
                  <button onClick={()=>handleSort('tiempo_estimado')} className="flex items-center gap-1 mx-auto text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600">
                    Est.{sortCol==='tiempo_estimado'&&<span>{sortDir==='asc'?'↑':'↓'}</span>}
                  </button>
                  {renderResizeHandle(5)}
                </th>
                <th className="relative px-3 text-center select-none">
                  <button onClick={()=>handleSort('tiempo_real')} className="flex items-center gap-1 mx-auto text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600">
                    Real{sortCol==='tiempo_real'&&<span>{sortDir==='asc'?'↑':'↓'}</span>}
                  </button>
                  {renderResizeHandle(6)}
                </th>
                <th className="relative px-3 text-center select-none">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dif.</span>
                  {renderResizeHandle(7)}
                </th>
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="Estado" options={estadoOpts} value={fEstado} onChange={setFEstado} onSort={()=>handleSort('estado')} sortDir={sortDir} isSorted={sortCol==='estado'}/>
                  {renderResizeHandle(8)}
                </th>
                <th className="relative px-3 select-none text-center">
                  {renderResizeHandle(9)}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading?(
                <tr><td colSpan={10} className="text-center py-20 text-gray-300 text-sm">
                  <div className="flex flex-col items-center gap-3"><div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin"></div>Cargando...</div>
                </td></tr>
              ):displayFiltered.length===0?(
                <tr><td colSpan={10} className="text-center py-20 text-sm">
                  <div className="flex flex-col items-center gap-2 text-gray-300">
                    <span className="text-4xl">{tab==='Plan'?'Plan':tab==='Completadas'?'OK':'Sin'}</span>
                    <span>{hasFilters?'Sin resultados para estos filtros':tab==='Plan'?'Sin tareas para hoy':tab==='Completadas'?'Aún no hay completadas':'Sin tareas aquí'}</span>
                  </div>
                </td></tr>
              ):displayFiltered.map((t,idx)=>{
                const tIsInactive = t.done===true||t.done==='true'||t.estado==='Completada'||t.estado==='Omitida'
                const firstInactiveIdx = displayFiltered.findIndex(x => isInactiveForPlan(x))
                const showDivider = tab==='Plan' && tIsInactive && idx===firstInactiveIdx

                const tipoC=TIPO_COLORS[t.tipo]
                const estC=ESTADO_COLORS[t.estado]
                const retraso=diasRetraso(t.deadline,today)
                const tEst=t.tiempo_estimado||0
                const tReal=t.tiempo_real||0
                const dif=tReal>0?tReal-tEst:null
                const autoplan=!!(t.deadline&&t.deadline<=today&&!t.done&&t.estado!=='Omitida')
                const enplan=isEnPlan(t)
                const isDone=t.done===true||t.done==='true'
                const isDragging=dragging===idx
                const isOver=dragOverIdx===idx&&!isDragging

                return <Fragment key={`task-row-${t.id}`}>
                  {showDivider && (
                    <tr key={`divider-${t.id}`}>
                      <td colSpan={10} className="px-6 py-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-gray-100"></div>
                          <span className="text-[10px] text-gray-300 font-medium uppercase tracking-wider">Completadas y omitidas hoy</span>
                          <div className="flex-1 h-px bg-gray-100"></div>
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr key={t.id}
                    draggable={!sortCol && !tIsInactive}
                    onDragStart={()=>{ if (!tIsInactive) onDragStart(idx) }}
                    onDragEnter={()=>{ if (!tIsInactive) onDragEnter(idx) }}
                    onDragEnd={onDrop}
                    onDragOver={e=>e.preventDefault()}
                    className={`border-b border-gray-50 group transition-colors ${isDragging?'opacity-40':''} ${isOver?'border-t-2 border-t-gray-400':''} ${idx%2===1?'bg-blue-50/20 hover:bg-blue-50/60':'bg-white hover:bg-blue-50/60'}`}
                    style={{height:52,cursor:(sortCol || tIsInactive)?'default':'grab'}}>

                    <td className="px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {t.done||t.estado==='Omitida' ? (
                          <button onClick={()=>undoTask(t)} title="Deshacer"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-amber-400 hover:text-amber-600 hover:bg-amber-50 transition">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                          </button>
                        ) : (<>
                          <button onClick={()=>completeTask(t)} title="Marcar como hecha"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                          </button>
                          <button onClick={()=>omitTask(t)} title="Omitir"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition text-base">⏭</button>
                          <button onClick={()=>togglePlan(t)}
                            title={t.excluir_plan ? 'Volver al Plan del día' : autoplan ? 'Sacar del Plan del día' : enplan ? 'Quitar del Plan' : 'Añadir al Plan'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition ${t.excluir_plan ? 'text-gray-200 hover:text-gray-400 hover:bg-gray-50' : autoplan ? 'text-amber-400 hover:text-amber-600 hover:bg-amber-50' : enplan ? 'text-blue-500 bg-blue-50 hover:bg-blue-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                          </button>
                        </>)}
                      </div>
                    </td>

                    <td className="px-4 text-center">
                      <div className="flex justify-center">
                      {tipoC?(
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md ${tipoC.bg} ${tipoC.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tipoC.dot}`}></span>
                          {t.tipo}
                        </span>
                      ):<span className="text-xs text-gray-400">{t.tipo}</span>}
                      </div>
                    </td>

                    <td className="px-4 min-w-0 text-center">
                      <div className={`text-[11px] leading-tight truncate ${isDone||t.estado==='Omitida'||t.estado==='Completada'?'line-through text-gray-300':'text-gray-500'}`} title={t.tarea}>
                        {shortTaskName(t.tarea)}
                      </div>
                      {t.notas&&<div className="text-[10px] leading-tight text-gray-300 truncate mt-0.5" title={t.notas}>{t.notas}</div>}
                    </td>

                    <td className="px-4 text-[11px] text-gray-400 whitespace-nowrap text-center">{fDate(t.fecha_solicitud)}</td>

                    <td className="px-4 whitespace-nowrap text-center">
                      {(() => {
                        const isRetrasada = retraso > 0 && !isDone && t.estado !== 'Omitida' && t.estado !== 'Completada'
                        const isHoy = t.deadline === today && !isDone && t.estado !== 'Omitida' && t.estado !== 'Completada'
                        const diasRestantes = t.deadline && t.deadline > today && !isDone && t.estado !== 'Omitida' && t.estado !== 'Completada'
                          ? Math.ceil((new Date(t.deadline).getTime() - new Date(today).getTime()) / 86400000) : 0
                        return (
                          <div className="flex flex-col gap-0.5 items-center">
                            <span className={`text-[11px] font-medium ${isRetrasada ? 'text-red-400' : 'text-gray-400'}`}>{fDate(t.deadline)}</span>
                            {isRetrasada && (
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] font-bold bg-red-100 text-red-500 px-2 py-0.5 rounded-full">+{retraso}d</span>
                                
                              </div>
                            )}
                            {isHoy && <span className="text-[9px] font-bold bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">hoy</span>}
                            {diasRestantes > 0 && <span className="text-[9px] font-bold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">{diasRestantes}d</span>}
                          </div>
                        )
                      })()}
                    </td>

                    <td className="px-3 text-center text-[11px] tabular-nums text-gray-500">{tEst?`${tEst}m`:'-'}</td>
                    <td className="px-3 text-center text-[11px] tabular-nums text-gray-500">{tReal?`${tReal}m`:'-'}</td>

                    <td className="px-3 text-center">
                      {dif!==null?(
                        <span className={`text-xs font-semibold tabular-nums ${dif>0?'text-red-400':dif<0?'text-emerald-500':'text-gray-400'}`}>
                          {dif>0?`+${dif}m`:dif<0?`${dif}m`:'='}
                        </span>
                      ):<span className="text-xs text-gray-200">-</span>}
                    </td>

                    <td className="px-4 text-center">
                      {estC?(
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${estC.bg} ${estC.text}`}>{t.estado}</span>
                      ):<span className="text-xs text-gray-400">{t.estado}</span>}
                    </td>

                    <td className="px-3 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={()=>duplicateTask(t)} title="Duplicar" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        </button>
                        <button onClick={()=>openFragmentar(t)} title="Dividir tarea" className="divide-task-btn w-7 h-7 flex items-center justify-center rounded-lg hover:bg-violet-50 transition">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="5" width="18" height="14" rx="2"/>
                            <path d="M12 5v14"/>
                            <path d="M8 9l-2 3 2 3"/>
                            <path d="M16 9l2 3-2 3"/>
                          </svg>
                        </button>

                        <button onClick={()=>openEdit(t)} title="Editar" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-rose-600 hover:bg-rose-50 transition">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={()=>deleteTask(t.id)} title="Eliminar" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-200 hover:text-red-400 hover:bg-red-50 transition">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              })}
            </tbody>
          </table>
        </div>
      </> }
      </div>

      {modal&&(
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={e=>{if(e.target===e.currentTarget){setModal(false);setEditId(null)}}}>
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-100" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">{editId?'Editar tarea':'Nueva tarea'}</h2>
              <button onClick={()=>{setModal(false);setEditId(null)}} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition text-gray-400">x</button>
            </div>
            <div className="px-7 py-6 grid grid-cols-2 gap-5">
              <Field label="Tarea *" error={errors.tarea} full>
                <input value={form.tarea} onChange={e=>setForm({...form,tarea:e.target.value})} placeholder="Ej: Fichar entrada" className={inputCls(errors.tarea)}/>
              </Field>
              <Field label="Notas" full>
                <textarea value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} rows={2} placeholder="Observaciones opcionales..." className={`${inputCls()} resize-none`}/>
              </Field>
              <Field label="Tipo *" error={errors.tipo}>
                <select value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})} className={selectCls(errors.tipo)}>
                  {(editId?TIPOS_ALL:TIPOS_FORM).map(t=><option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Estado *" error={errors.estado}>
                <select value={form.estado} onChange={e=>setForm({...form,estado:e.target.value})} className={selectCls(errors.estado)}>
                  {ESTADOS.map(e=><option key={e}>{e}</option>)}
                </select>
              </Field>
              <Field label="Prioridad *" error={errors.prioridad}>
                <select value={form.prioridad} onChange={e=>setForm({...form,prioridad:e.target.value})} className={selectCls(errors.prioridad)}>
                  {PRIORIDADES.map(p=><option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Tiempo estimado (min.) *" error={errors.tiempo_estimado}>
                <input type="number" value={form.tiempo_estimado||''} onChange={e=>setForm({...form,tiempo_estimado:parseInt(e.target.value)||0})} placeholder="30" className={inputCls(errors.tiempo_estimado)}/>
              </Field>
              <Field label="Tiempo real (min.)">
                <input type="number" value={form.tiempo_real||''} onChange={e=>setForm({...form,tiempo_real:parseInt(e.target.value)||0})} placeholder="0" className={inputCls()}/>
              </Field>
              <Field label="Solicitado por *" error={errors.solicitado_por}>
                <input value={form.solicitado_por} onChange={e=>setForm({...form,solicitado_por:e.target.value})} placeholder="Nombre o equipo" className={inputCls(errors.solicitado_por)}/>
              </Field>
              <Field label="Fecha solicitud *" error={errors.fecha_solicitud}>
                <input type="date" value={form.fecha_solicitud} onChange={e=>setForm({...form,fecha_solicitud:e.target.value})} className={inputCls(errors.fecha_solicitud)}/>
              </Field>
              <Field label="Deadline *" error={errors.deadline}>
                <input type="date" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})} className={inputCls(errors.deadline)}/>
              </Field>
              <Field label="Fecha planificada">
                <input
                  type="date"
                  value={form.fecha_planificada || ''}
                  onChange={e=>setForm({...form,fecha_planificada:e.target.value})}
                  className={inputCls()}
                />
              </Field>
              {editId&&(
                <Field label="Plan del día" full>
                  <label className="flex items-center gap-2 cursor-pointer" onClick={()=>setForm({...form,en_plan:!form.en_plan})}>
                    <div className={`w-9 h-5 rounded-full transition-colors relative ${form.en_plan?'bg-gray-900':'bg-gray-200'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.en_plan?'left-4':'left-0.5'}`}></div>
                    </div>
                    <span className="text-sm text-gray-600">{form.en_plan?'Incluida en el Plan del día':'No incluida'}</span>
                  </label>
                </Field>
              )}
            </div>
            <div className="flex justify-end gap-2 px-7 py-5 border-t border-gray-100">
              <button onClick={()=>{setModal(false);setEditId(null)}} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition text-gray-600">Cancelar</button>
              <button onClick={saveTask} disabled={saving} className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 transition">
                {saving?'Guardando...':editId?'Guardar cambios':'Crear tarea'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importModal&&(
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={e=>{if(e.target===e.currentTarget)setImportModal(false)}}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Importar tareas</h2>
              <button onClick={()=>setImportModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition text-gray-400">x</button>
            </div>
            <div className="px-7 py-6 space-y-5">
              {!importResult?(
                <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition ${importing?'border-gray-200 bg-gray-50':'border-gray-200 hover:border-gray-400 hover:bg-gray-50'}`}>
                  {importing?(
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                      <span className="text-sm">Analizando archivo...</span>
                    </div>
                  ):(
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <span className="text-sm font-medium text-gray-600">Selecciona tu CSV</span>
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleImport} disabled={importing}/>
                </label>
              ):(
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                      <div className="text-xl font-bold text-emerald-600">{importResult.added}</div>
                      <div className="text-xs text-emerald-600 mt-0.5">Añadidas</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                      <div className="text-xl font-bold text-gray-500">{importResult.skipped}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Sin cambios</div>
                    </div>
                    <div className={`border rounded-xl p-3 text-center ${importResult.duplicates.length>0?'bg-blue-50 border-blue-100':'bg-gray-50 border-gray-100'}`}>
                      <div className={`text-xl font-bold ${importResult.duplicates.length>0?'text-blue-600':'text-gray-400'}`}>{importResult.duplicates.length}</div>
                      <div className={`text-xs mt-0.5 ${importResult.duplicates.length>0?'text-blue-600':'text-gray-400'}`}>Duplicadas</div>
                    </div>
                  </div>
                  {importResult.errors.length>0&&(
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
                      <p className="text-xs font-semibold text-red-600 mb-1">{importResult.errors.length} error(es):</p>
                      {importResult.errors.map((e,i)=><p key={i} className="text-xs text-red-500">{e}</p>)}
                    </div>
                  )}
                  {importResult.duplicates.length>0&&(
                    <DuplicateConfirm tasks={importResult.duplicates} onConfirm={handleConfirmOverwrite} onAddAnyway={handleImportDuplicatesAnyway}/>
                  )}
                  <button onClick={()=>setImportResult(null)} className="w-full text-xs text-gray-500 hover:text-gray-700 border border-gray-200 py-2 rounded-lg hover:bg-gray-50 transition">
                    Importar otro archivo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {fragmentModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-xl border border-gray-100 shadow-2xl overflow-hidden">
            <div className="px-7 py-5 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Dividir tarea</h2>
                <p className="text-xs text-gray-400 mt-1 line-clamp-1">{fragmentModal.tarea}</p>
              </div>
              <button onClick={() => { setFragmentModal(null); setFragmentParts([]) }} className="text-gray-300 hover:text-gray-500 transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="p-7 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <Field label="Tiempo total">
                  <input
                    value={`${fragmentModal.tiempo_estimado || 0}m`}
                    disabled
                    className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500"
                  />
                </Field>

                <Field label="Máximo por parte">
                  <input
                    type="number"
                    value={fragmentSize}
                    onChange={e => updateFragmentSize(parseInt(e.target.value) || 120)}
                    className={inputCls()}
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-violet-700">
                    Se crearán {fragmentParts.length} parte{fragmentParts.length === 1 ? '' : 's'}
                  </div>
                  <div className={`text-xs mt-0.5 ${fragmentPartsTotal === (fragmentModal.tiempo_estimado || 0) ? 'text-violet-500' : 'text-red-400'}`}>
                    Suma partes: {minToHM(fragmentPartsTotal)} / {minToHM(fragmentModal.tiempo_estimado || 0)}
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/70 text-violet-500 flex items-center justify-center">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h6"/>
                    <path d="M14 7h6"/>
                    <path d="M4 17h6"/>
                    <path d="M14 17h6"/>
                    <path d="M10 7l4 10"/>
                    <path d="M14 7l-4 10"/>
                  </svg>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Partes y deadlines</div>
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {fragmentParts.map((part, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-700">Parte {i + 1}/{fragmentParts.length}</div>
                          <div className="text-xs text-gray-400 truncate">
                            {fragmentModal.tarea} · parte {i + 1}/{fragmentParts.length}
                          </div>
                        </div>
                        <button
                          onClick={() => setFragmentParts(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-300 hover:text-red-400 transition"
                          title="Quitar parte"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Minutos">
                          <input
                            type="number"
                            value={part.minutes}
                            onChange={e => updateFragmentPart(i, { minutes: parseInt(e.target.value) || 0 })}
                            className={inputCls()}
                          />
                        </Field>

                        <Field label="Deadline">
                          <input
                            type="date"
                            value={part.deadline}
                            onChange={e => updateFragmentPart(i, { deadline: e.target.value })}
                            className={inputCls()}
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setFragmentParts(prev => [...prev, { minutes: Math.max(1, fragmentSize || 120), deadline: fragmentModal.deadline || today }])}
                  className="mt-3 w-full border border-dashed border-gray-200 rounded-xl py-2 text-xs font-semibold text-gray-400 hover:text-violet-600 hover:border-violet-200 hover:bg-violet-50 transition"
                >
                  + Añadir parte
                </button>
              </div>
            </div>

            <div className="px-7 py-5 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-2">
              <button
                onClick={() => { setFragmentModal(null); setFragmentParts([]) }}
                className="px-4 py-2 border border-gray-200 bg-white rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300 transition"
              >
                Cancelar
              </button>

              <button
                onClick={() => fragmentTask(fragmentModal)}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 transition disabled:opacity-40"
                disabled={fragmentParts.length === 0}
              >
                Dividir tarea
              </button>
            </div>
          </div>
        </div>
      )}

      {tiempoRealModal&&(
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={e=>{if(e.target===e.currentTarget)setTiempoRealModal(null)}}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100 p-7" onClick={e=>e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              {tiempoRealModal.action==='complete'?'¿Cuánto has tardado?':'¿Cuánto tiempo has dedicado?'}
            </h3>
            <p className="text-xs text-gray-400 mb-5 truncate">{tiempoRealModal.tarea.tarea}</p>
            <div className="flex items-center gap-3 mb-6">
              <input type="number" min="1" value={tiempoRealInput} onChange={e=>setTiempoRealInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')confirmTiempoReal()}} placeholder="minutos" autoFocus
                className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-gray-400 text-gray-800 placeholder:text-gray-300"/>
              <span className="text-sm text-gray-400">min</span>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setTiempoRealModal(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={confirmTiempoReal}
                disabled={tiempoRealModal.action==='complete'&&(!tiempoRealInput||parseInt(tiempoRealInput)<=0)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-40 ${tiempoRealModal.action==='complete'?'bg-emerald-500 hover:bg-emerald-600':'bg-gray-700 hover:bg-gray-600'}`}>
                {tiempoRealModal.action==='complete'?'OK Completar':'Omitir Omitir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function DuplicateConfirm({ tasks, onConfirm, onAddAnyway }: { tasks: DuplicateImport[], onConfirm: (items: DuplicateImport[]) => void, onAddAnyway: (items: DuplicateImport[]) => void }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    setSelected(new Set(tasks.map(t => t.id)))
  }, [tasks])

  const toggle = (id: number) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const selectedItems = tasks.filter(t => selected.has(t.id))
  const effectiveItems = selectedItems.length > 0 ? selectedItems : tasks

  return (
    <div className="border border-blue-100 bg-blue-50 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-blue-700">
        Estas tareas ya existen en la app. Elige si quieres sustituirlas o importarlas igualmente.
      </p>

      <div className="space-y-1 max-h-40 overflow-y-auto">
        {tasks.map(item => (
          <label key={item.id} className="flex items-center gap-2 cursor-pointer py-1 hover:bg-blue-100/50 px-1 rounded-lg">
            <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="rounded"/>
            <span className="text-xs text-gray-700 truncate">{shortTaskName(item.update.tarea || item.actual.tarea || '')}</span>
            <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{item.update.tipo || item.actual.tipo || ''}</span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => onAddAnyway(effectiveItems)}
          className="px-4 py-1.5 bg-white border border-blue-300 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 hover:border-blue-400 transition"
          title="No sobrescribir: importar igualmente y mantener ambas"
        >
          No, añadir igual
        </button>

        <button
          type="button"
          onClick={() => onConfirm(effectiveItems)}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm"
          style={{ backgroundColor: '#2563eb', color: '#ffffff', border: '1px solid #2563eb' }}
          title="Sí: sustituir la tarea existente por la del CSV"
        >
          Sí, sobrescribir
        </button>
      </div>
    </div>
  )
}
