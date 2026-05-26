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
  fecha_finalizacion: string
  done: boolean
  solicitado_por: string
  orden: number
  en_plan: boolean
  hora_finalizacion?: string
  excluir_plan?: boolean
}

const TIPOS_FORM = ['Operativa', 'Táctica', 'Estratégica']
const TIPOS_ALL  = ['Diaria', 'Semanal', 'Mensual', 'Operativa', 'Táctica', 'Estratégica', 'Casa']
const RUTINARIAS = ['Diaria', 'Semanal', 'Mensual']
const ESTADOS    = ['Pendiente', 'En espera', 'En progreso', 'Completada', 'Omitida']
const PRIORIDADES = ['Alta', 'Media', 'Baja']

const TABS = [
  { key: 'Todas',       label: 'Todas',        emoji: '◈',  sub: '' },
  { key: 'Plan',        label: 'Plan del día', emoji: '☀️', sub: '' },
  { key: 'Rutinaria',   label: 'Rutinarias',   emoji: '🔁', sub: '' },
  { key: 'Operativa',   label: 'Operativas',   emoji: '⚡', sub: '≤30 min' },
  { key: 'Táctica',     label: 'Tácticas',     emoji: '🎯', sub: '≤120 min' },
  { key: 'Estratégica', label: 'Estratégicas', emoji: '🔭', sub: '>120 min' },
  { key: 'Casa',        label: 'Casa',         emoji: '🏠', sub: '' },
  { key: 'Completadas', label: 'Historial',    emoji: '📁', sub: '' },
  { key: 'Carga',       label: 'Carga de trabajo', emoji: '📊', sub: '' },
]

const empty: Omit<Tarea, 'id'> = {
  tipo: 'Operativa', tarea: '', notas: '', prioridad: 'Media', estado: 'Pendiente',
  tiempo_estimado: 0, tiempo_real: 0, fecha_solicitud: '', deadline: '',
  fecha_finalizacion: '', done: false, solicitado_por: '', orden: 0, en_plan: false
}

const TIPO_COLORS: Record<string, { bg: string, text: string, dot: string }> = {
  Operativa:   { bg: 'bg-sky-50',     text: 'text-sky-700',     dot: 'bg-sky-400' },
  Táctica:     { bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-400' },
  Estratégica: { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  Casa:        { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  Diaria:      { bg: 'bg-gray-100',   text: 'text-gray-600',    dot: 'bg-gray-400' },
  Semanal:     { bg: 'bg-gray-100',   text: 'text-gray-600',    dot: 'bg-gray-500' },
  Mensual:     { bg: 'bg-gray-100',   text: 'text-gray-600',    dot: 'bg-gray-600' },
}

const ESTADO_COLORS: Record<string, { bg: string, text: string }> = {
  Pendiente:     { bg: 'bg-gray-100',   text: 'text-gray-500' },
  'En espera':   { bg: 'bg-amber-50',   text: 'text-amber-600' },
  'En progreso': { bg: 'bg-blue-50',    text: 'text-blue-600' },
  Completada:    { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  Omitida:       { bg: 'bg-gray-100',   text: 'text-gray-400' },
}

const MASTER_COLS = [
  { key: 'tipo',            label: 'tipo *',            hint: 'Diaria / Semanal / Mensual / Operativa / Táctica / Estratégica / Casa' },
  { key: 'tarea',           label: 'tarea *',           hint: 'Texto libre con fecha al final. Ej: Fichar entrada 01/06/2026' },
  { key: 'notas',           label: 'notas',             hint: 'Texto libre' },
  { key: 'solicitado_por',  label: 'solicitado_por *',  hint: 'Nombre o equipo' },
  { key: 'prioridad',       label: 'prioridad *',       hint: 'Alta / Media / Baja' },
  { key: 'estado',          label: 'estado *',          hint: 'Pendiente / En espera / En progreso / Completada' },
  { key: 'tiempo_estimado', label: 'tiempo_estimado *', hint: 'Número entero (minutos)' },
  { key: 'tiempo_real',     label: 'tiempo_real',       hint: 'Número entero (minutos)' },
  { key: 'fecha_solicitud', label: 'fecha_solicitud *', hint: 'DD/MM/AAAA' },
  { key: 'deadline',        label: 'deadline *',        hint: 'DD/MM/AAAA' },
]

function diasRetrasoFn(deadline: string, today: string): number { return diasRetraso(deadline, today) }
function diasRetraso(deadline: string, today: string): number {
  if (!deadline || deadline >= today) return 0
  return Math.floor((new Date(today).getTime() - new Date(deadline).getTime()) / 86400000)
}

function fDate(d: string) {
  if (!d) return '—'
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

function GeneralKpis({ tareas, filtered, tab, today }: { tareas: any[], filtered: any[], tab: string, today: string }) {
  const total = filtered.length
  const tEst = filtered.reduce((s: number, t: any) => s + (t.tiempo_estimado || 0), 0)
  const completadasHoy = tareas.filter((t: any) => t.fecha_finalizacion === today && (t.done || t.estado === 'Completada')).length
  const avgMin = total > 0 ? Math.round(tEst / total) : 0

  return (
    <div className="grid grid-cols-4 gap-5 mb-8">
      <KpiCard label="Tareas" val={total} sub={tab === 'Completadas' ? 'en historial' : 'sin completar'}/>
      <KpiCard label="Tiempo estimado" val={minToHM(tEst)} sub={`${avgMin}m de media`}/>
      <KpiCard label="Completadas hoy" val={completadasHoy} sub="marcadas hoy"/>
      <KpiCard label="Tareas activas total" val={tareas.filter((t: any) => !t.done && t.estado !== 'Omitida').length} sub={minToHM(tareas.filter((t: any) => !t.done && t.estado !== 'Omitida').reduce((s: number, t: any) => s + (t.tiempo_estimado || 0), 0))}/>
    </div>
  )
}

function PlanKpis({ tareas, filtered, cronoSeconds, cronoRunning, onStart, onPause, onReset, formatCrono, today, previsionMin, setPrevisionMin, onAdjustStart }:
  { tareas: any[], filtered: any[], cronoSeconds: number, cronoRunning: boolean, onStart: ()=>void, onPause: ()=>void, onReset: ()=>void, formatCrono: (s:number)=>string, today: string, previsionMin: number, setPrevisionMin: (v:number)=>void, onAdjustStart: (hhmm:string)=>void }) {

  const [editingPrev, setEditingPrev] = useState(false)
  const [prevInput, setPrevInput] = useState(String(previsionMin))
  const [editingStart, setEditingStart] = useState(false)
  const [startInput, setStartInput] = useState('09:00')

  const total = filtered.length
  const hechas = filtered.filter((t: any) => t.done || t.estado === 'Completada' || t.estado === 'Omitida').length
  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0

  const tEstTotal = filtered.reduce((s: number, t: any) => s + (t.tiempo_estimado || 0), 0)
  const tEstHecho = filtered.filter((t: any) => t.done || t.estado === 'Completada').reduce((s: number, t: any) => s + (t.tiempo_estimado || 0), 0)
  const tRealHecho = filtered.filter((t: any) => t.done || t.estado === 'Completada').reduce((s: number, t: any) => s + (t.tiempo_real || 0), 0)
  const tEstPendiente = filtered.filter((t: any) => !t.done && t.estado !== 'Completada' && t.estado !== 'Omitida').reduce((s: number, t: any) => s + (t.tiempo_estimado || 0), 0)
  const pctTiempo = tEstTotal > 0 ? Math.round((tEstHecho / tEstTotal) * 100) : 0

  const cronoMin = Math.floor(cronoSeconds / 60)
  const tiempoRestante = Math.max(0, previsionMin - cronoMin)
  const gap = tiempoRestante - tEstPendiente

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center gap-4 bg-gray-50 border border-gray-100 rounded-xl px-5 py-3">
        <div className="flex items-center gap-2">
          {!cronoRunning ? (
            <button onClick={onStart}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 transition">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              {cronoSeconds > 0 ? 'Reanudar' : 'Iniciar'}
            </button>
          ) : (
            <button onClick={onPause}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              Pausar
            </button>
          )}
          {cronoSeconds > 0 && (
            <button onClick={onReset} className="px-3 py-2 border border-gray-200 text-gray-400 rounded-lg text-sm hover:bg-white transition">↺</button>
          )}
        </div>

        <div className="text-2xl font-mono font-bold text-gray-900 min-w-[90px]">{formatCrono(cronoSeconds)}</div>

        {/* Hora inicio editable */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-gray-400">Inicio:</span>
          {editingStart ? (
            <div className="flex items-center gap-1">
              <input type="time" value={startInput} onChange={e=>setStartInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'){onAdjustStart(startInput);setEditingStart(false)}if(e.key==='Escape')setEditingStart(false)}}
                className="w-24 border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-gray-500" autoFocus/>
              <button onClick={()=>{onAdjustStart(startInput);setEditingStart(false)}} className="text-xs text-emerald-500 font-bold">OK</button>
            </div>
          ) : (
            <button onClick={()=>setEditingStart(true)}
              className="text-xs font-semibold text-gray-600 border border-dashed border-gray-300 px-2 py-1 rounded hover:bg-white hover:border-gray-400 transition"
              title="Ajustar segun hora de fichaje">
              Ajustar
            </button>
          )}
        </div>

        {previsionMin > 0 && (
          <div className="flex-1 flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${cronoMin > previsionMin ? 'bg-red-400' : 'bg-emerald-400'}`}
                style={{width:`${Math.min(100, previsionMin > 0 ? (cronoMin/previsionMin)*100 : 0)}%`}}>
              </div>
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">{minToHM(cronoMin)} / {minToHM(previsionMin)}</span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400">Previsión:</span>
          {editingPrev ? (
            <div className="flex items-center gap-1">
              <input type="number" value={prevInput} onChange={e=>setPrevInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'){setPrevisionMin(parseInt(prevInput)||480);setEditingPrev(false)}if(e.key==='Escape')setEditingPrev(false)}}
                className="w-16 border border-gray-300 rounded px-2 py-1 text-xs text-center outline-none focus:border-gray-500" autoFocus/>
              <span className="text-xs text-gray-400">min</span>
              <button onClick={()=>{setPrevisionMin(parseInt(prevInput)||480);setEditingPrev(false)}} className="text-xs text-emerald-500 font-bold">✓</button>
            </div>
          ) : (
            <button onClick={()=>{setPrevInput(previsionMin.toString());setEditingPrev(true)}}
              className="text-xs font-semibold text-gray-600 border border-gray-200 px-2 py-1 rounded hover:bg-white transition">
              {minToHM(previsionMin)}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-5">
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

        {(() => {
          const tRealDone = filtered.filter((t: any) => t.done || t.estado === 'Completada').reduce((s: number, t: any) => s + (t.tiempo_real || 0), 0)
          const diff = tRealDone - cronoMin
          const noData = cronoMin === 0
          const pctUso = cronoMin > 0 ? Math.round((tRealDone / cronoMin) * 100) : 0
          const bueno = diff >= 0
          return (
            <div className={`border rounded-xl p-5 transition ${noData ? 'border-gray-100' : bueno ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`text-2xl font-bold ${noData ? 'text-gray-300' : bueno ? 'text-emerald-600' : 'text-red-500'}`}>
                  {noData ? '—' : (diff >= 0 ? '+' : '-') + minToHM(Math.abs(diff))}
                </span>
                {!noData && <span className={`text-sm font-semibold ${bueno ? 'text-emerald-400' : 'text-red-300'}`}>{pctUso}%</span>}
              </div>
              <div className="text-sm font-semibold text-gray-700 mb-1">Rendimiento</div>
              {noData ? (
                <div className="text-xs text-gray-400">Inicia el cronómetro</div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${bueno ? 'bg-emerald-400' : 'bg-red-400'}`} style={{width:`${Math.min(pctUso, 100)}%`}}></div>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {`Fichado ${minToHM(cronoMin)} · Trabajado ${minToHM(tRealDone)}`}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {(() => {
          const restJornada = Math.max(0, previsionMin - cronoMin)
          const margen = restJornada - tEstPendiente
          return (
            <div className={`border rounded-xl p-5 transition ${margen >= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`text-2xl font-bold ${margen >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {margen >= 0 ? `+${minToHM(margen)}` : `-${minToHM(Math.abs(margen))}`}
                </span>
                <span className={`text-sm font-semibold ${margen >= 0 ? 'text-emerald-400' : 'text-red-300'}`}>
                  {margen >= 0 ? '✓ Llegas' : '⚠ No llegas'}
                </span>
              </div>
              <div className="text-sm font-semibold text-gray-700 mb-1">Jornada</div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Restante: {minToHM(restJornada)}</span>
                  <span>Pendiente: {minToHM(tEstPendiente)}</span>
                </div>
                <div className="flex items-center gap-0">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden relative">
                    <div className={`h-full rounded-full transition-all ${margen >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                      style={{width:`${restJornada > 0 ? Math.min(100, (tEstPendiente / restJornada) * 100) : 100}%`}}></div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
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
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState<number | null>(null)
  const [tab, setTab] = useState('Plan')
  const [saving, setSaving] = useState(false)
  const [cargaRefreshKey, setCargaRefreshKey] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number, skipped: number, toDelete: Tarea[], errors: string[] } | null>(null)

  const [tiempoRealModal, setTiempoRealModal] = useState<{tarea: Tarea, action: 'complete'|'omit'} | null>(null)
  const [tiempoRealInput, setTiempoRealInput] = useState('')

  const [previsionMin, setPrevisionMin] = useState(480)
  const [cronoRunning, setCronoRunning] = useState(false)
  const [cronoSeconds, setCronoSeconds] = useState(0)
  const cronoRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cronoStartRef = useRef<number | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  useEffect(() => { fetchTareas(); autoArchivarAyer() }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!colResizing.current) return
      const diff = e.clientX - colResizing.current.startX
      setColWidths(prev => {
        const next = [...prev]
        next[colResizing.current!.col] = Math.max(48, colResizing.current!.startW + diff)
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
      const isDone = t.done === true || (t.done as any) === 'true'
      const isInactive = isDone || t.estado === 'Omitida' || t.estado === 'Completada'
      if (tab === 'Todas') return !isInactive
      if (tab === 'Completadas') return isInactive
      if (tab === 'Plan') {
        if (!isInactive && isEnPlan({...t, done: isDone})) return true
        if (isInactive && t.fecha_finalizacion === today && !t.excluir_plan) return true
        return false
      }
      if (tab === 'Rutinaria') { if (isInactive || !RUTINARIAS.includes(t.tipo) || isEnPlan({...t, done: isDone})) return false }
      return !isInactive && t.tipo === tab && !isEnPlan({...t, done: isDone})
    })
  }
  const tabFiltered = getTabFiltered()
  const fechaSolOpts = uniq(tabFiltered.map(t => t.fecha_solicitud ? fDate(t.fecha_solicitud) : ''))
  const deadlineOpts = uniq(tabFiltered.map(t => t.deadline ? fDate(t.deadline) : ''))
  const fechaFinOpts = uniq(tabFiltered.filter(t => t.fecha_finalizacion).map(t => fDate(t.fecha_finalizacion)))
  const tipoOpts = uniq(tabFiltered.map(t => t.tipo))
  const estadoOpts = uniq(tabFiltered.map(t => t.estado))

  function isEnPlan(t: Tarea): boolean {
    const isDone = t.done === true || (t.done as any) === 'true'
    if (isDone || t.estado === 'Omitida' || t.estado === 'Completada') return false
    if (t.excluir_plan) return false
    if (t.deadline && t.deadline <= today) return true
    return !!t.en_plan
  }

  function getFiltered(all: Tarea[]): Tarea[] {
    const result = all.filter(t => {
      const isDone = t.done === true || (t.done as any) === 'true'
      const isInactive = isDone || t.estado === 'Omitida' || t.estado === 'Completada'

      if (tab === 'Todas') { if (isInactive) return false }
      else if (tab === 'Completadas') { if (!isInactive) return false }
      else if (tab === 'Plan') {
        const inPlan = (!isInactive && isEnPlan({...t, done: isDone})) ||
          (isInactive && t.fecha_finalizacion === today && !t.excluir_plan)
        if (!inPlan) return false
      }
      else if (tab === 'Rutinaria') { if (isInactive || !RUTINARIAS.includes(t.tipo) || isEnPlan({...t, done: isDone})) return false }
      else { if (isInactive || t.tipo !== tab || isEnPlan({...t, done: isDone})) return false }

      if (fTarea && !t.tarea.toLowerCase().includes(fTarea.toLowerCase()) && !(t.notas||'').toLowerCase().includes(fTarea.toLowerCase())) return false
      if (fTipo.size > 0 && !fTipo.has(t.tipo)) return false
      if (fEstado.size > 0 && !fEstado.has(t.estado)) return false
      if (fFechaSol.size > 0 && !fFechaSol.has(fDate(t.fecha_solicitud))) return false
      if (fDeadline.size > 0 && !fDeadline.has(fDate(t.deadline))) return false
      if (fFechaFin.size > 0 && !fFechaFin.has(fDate(t.fecha_finalizacion))) return false
      return true
    })

    // Helper: inactive check
    const isInact = (t: any) => t.done === true || (t.done as any) === 'true' || t.estado === 'Omitida' || t.estado === 'Completada'

    if (sortCol) {
      result.sort((a, b) => {
        // In Plan, inactive always at bottom
        if (tab === 'Plan') {
          const aI = isInact(a), bI = isInact(b)
          if (aI && !bI) return 1
          if (!aI && bI) return -1
          if (aI && bI) return (a.hora_finalizacion||'') > (b.hora_finalizacion||'') ? 1 : -1
        }
        let av: any, bv: any
        if (sortCol === 'tarea') { av = a.tarea?.toLowerCase()||''; bv = b.tarea?.toLowerCase()||'' }
        else if (sortCol === 'tipo') { av = a.tipo; bv = b.tipo }
        else if (sortCol === 'estado') { av = a.estado; bv = b.estado }
        else if (sortCol === 'deadline') { av = a.deadline||'9999'; bv = b.deadline||'9999' }
        else if (sortCol === 'fecha_solicitud') { av = a.fecha_solicitud||''; bv = b.fecha_solicitud||'' }
        else if (sortCol === 'tiempo_estimado') { av = a.tiempo_estimado||0; bv = b.tiempo_estimado||0 }
        else if (sortCol === 'tiempo_real') { av = a.tiempo_real||0; bv = b.tiempo_real||0 }
        else { av = 0; bv = 0 }
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
      return result
    }

    // No sortCol: pure orden, inactive at bottom in Plan
    return result.sort((a, b) => {
      if (tab === 'Plan') {
        const aI = isInact(a), bI = isInact(b)
        if (aI && !bI) return 1
        if (!aI && bI) return -1
        if (aI && bI) return (a.hora_finalizacion||'') > (b.hora_finalizacion||'') ? 1 : -1
      }
      return (a.orden ?? 0) - (b.orden ?? 0)
    })
  }

  const filtered = getFiltered(tareas)
  const hasFilters = !!(fTarea || fTipo.size || fEstado.size || fFechaSol.size || fDeadline.size || fFechaFin.size)
  function handleSort(col: string) {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortCol(null); setSortDir('asc') }
    } else {
      setSortCol(col); setSortDir('asc')
    }
  }

  function clearFilters() { setFTarea(''); setFTipo(new Set()); setFEstado(new Set()); setFFechaSol(new Set()); setFDeadline(new Set()); setFFechaFin(new Set()); setSortCol(null) }

  const stats = {
    activas: tareas.filter(t => t.done !== true && (t.done as any) !== 'true' && t.estado !== 'Omitida' && t.estado !== 'Completada').length,
    plan: tareas.filter(t => isEnPlan(t)).length,
    completadas: tareas.filter(t => t.done === true || (t.done as any) === 'true' || t.estado === 'Omitida' || t.estado === 'Completada').length,
    minutos: tareas.filter(t => t.done !== true && (t.done as any) !== 'true' && t.estado !== 'Omitida' && t.estado !== 'Completada').reduce((s, t) => s + (t.tiempo_estimado||0), 0),
  }

  const tabCount = (key: string) => {
    if (key==='Todas') return stats.activas
    if (key==='Plan') return stats.plan
    if (key==='Completadas') return stats.completadas
    if (key==='Rutinaria') return tareas.filter(x => RUTINARIAS.includes(x.tipo) && !x.done && x.estado !== 'Omitida' && x.estado !== 'Completada' && !isEnPlan(x)).length
    return tareas.filter(x => x.tipo===key && !x.done && x.estado !== 'Omitida' && x.estado !== 'Completada' && !isEnPlan(x)).length
  }

  function onDragStart(idx: number) { dragIdx.current = idx; setDragging(idx) }
  function onDragEnter(idx: number) { dragOver.current = idx; setDragOverIdx(idx) }
  async function onDrop() {
    if (dragIdx.current === null || dragOver.current === null || dragIdx.current === dragOver.current) {
      setDragging(null); setDragOverIdx(null); return
    }
    const newList = [...filtered]
    const [moved] = newList.splice(dragIdx.current, 1)
    newList.splice(dragOver.current, 0, moved)
    const idToOrden: Record<number, number> = {}
    newList.forEach((t, i) => { idToOrden[t.id] = i + 1 })
    setTareas(prev => prev.map(t => idToOrden[t.id] !== undefined ? { ...t, orden: idToOrden[t.id] } : t))
    dragIdx.current = null; dragOver.current = null
    setDragging(null); setDragOverIdx(null)
    await Promise.all(newList.map((t, i) => supabase.from('tareas').update({ orden: i+1 }).eq('id', t.id)))
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
      .neq('fecha_finalizacion', null as any)

    // Reset excluir_plan for active tasks that were excluded on a previous day
    await supabase.from('tareas')
      .update({ excluir_plan: false, excluida_fecha: null })
      .eq('excluir_plan', true)
      .lt('excluida_fecha', today)
      .neq('estado', 'Completada')
      .neq('estado', 'Omitida')
      .eq('done', false)
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
    const { tarea, tipo, notas, solicitado_por, prioridad, tiempo_estimado, fecha_solicitud, deadline, en_plan } = t
    await supabase.from('tareas').insert({
      tarea: `${tarea} (copia)`,
      tipo, notas, solicitado_por, prioridad,
      estado: 'Pendiente',
      tiempo_estimado,
      fecha_solicitud: fecha_solicitud || null,
      deadline: deadline || null,
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

  function startCrono() {
    if (cronoRunning) return
    cronoStartRef.current = Date.now() - cronoSeconds * 1000
    cronoRef.current = setInterval(() => {
      setCronoSeconds(Math.floor((Date.now() - cronoStartRef.current!) / 1000))
    }, 1000)
    setCronoRunning(true)
  }

  // Ajustar cronÃ³metro segÃºn hora de fichaje real
  function adjustCronoFromStart(hhmm: string) {
    if (!hhmm) return
    const [h, m] = hhmm.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return
    const now = new Date()
    const startDate = new Date()
    startDate.setHours(h, m, 0, 0)
    const elapsedSecs = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / 1000))
    setCronoSeconds(elapsedSecs)
    if (cronoRunning) {
      // Re-anchor running timer
      cronoStartRef.current = Date.now() - elapsedSecs * 1000
    }
  }

  function pauseCrono() {
    if (cronoRef.current) clearInterval(cronoRef.current)
    setCronoRunning(false)
    saveCronoToday(Math.floor(cronoSeconds / 60))
  }

  function resetCrono() {
    if (cronoRef.current) clearInterval(cronoRef.current)
    setCronoRunning(false)
    setCronoSeconds(0)
    cronoStartRef.current = null
  }

  async function saveCronoToday(minutos: number) {
    await supabase.from('jornadas').upsert(
      { fecha: today, minutos_fichados: minutos },
      { onConflict: 'fecha' }
    )
  }

  function formatCrono(secs: number): string {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
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
    const clean = { ...form, fecha_solicitud: form.fecha_solicitud||null, deadline: form.deadline||null, fecha_finalizacion: form.fecha_finalizacion||null }
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
    setForm({ tipo:t.tipo, tarea:t.tarea, notas:t.notas||'', prioridad:t.prioridad, estado:t.estado, tiempo_estimado:t.tiempo_estimado, tiempo_real:t.tiempo_real||0, fecha_solicitud:t.fecha_solicitud||'', deadline:t.deadline||'', fecha_finalizacion:t.fecha_finalizacion||'', done:t.done, solicitado_por:(t as any).solicitado_por||'', orden:t.orden||0, en_plan:t.en_plan||false, excluir_plan:t.excluir_plan||false })
    setErrors({}); setEditId(t.id); setModal(true)
  }

  function openNew() {
    setForm({ ...empty, tipo: TIPOS_FORM.includes(tab) ? tab : 'Operativa' })
    setErrors({}); setEditId(null); setModal(true)
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
    const rows = tareas.map(t => [t.tipo,t.tarea,t.notas||'',(t as any).solicitado_por||'',t.prioridad,t.estado,t.tiempo_estimado||0,t.tiempo_real||0,fDate(t.fecha_solicitud),fDate(t.deadline)].join(';'))
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
    if (lines.length < 2) { setImportResult({added:0,skipped:0,toDelete:[],errors:['Archivo vacío']}); setImporting(false); return }

    const keyMap: Record<string,number> = {}
    parseLine(lines[0]).forEach((h,i) => { keyMap[h.replace(/\*/g,'').toLowerCase().trim().replace(/\s/g,'_')] = i })
    const get = (row: string[], key: string) => { const idx=keyMap[key]; return idx!==undefined?(row[idx]||'').trim():'' }

    const second = parseLine(lines[1])
    const isHint = second[0] && (second[0].includes('/')||second[0].toLowerCase().includes('texto')||second[0].toLowerCase().includes('número'))
    const dataStart = isHint ? 2 : 1

    const csvNames = new Set<string>()
    const inserts: any[] = []
    const errs: string[] = []
    const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(t => t.orden||0)) : 0

    for (let i=dataStart; i<lines.length; i++) {
      const row = parseLine(lines[i]); if (row.every(c=>!c)) continue
      const rn=i+1
      const tarea=get(row,'tarea'), tipo=get(row,'tipo'), sp=get(row,'solicitado_por')
      const tr=get(row,'tiempo_estimado'), fr=get(row,'fecha_solicitud'), dr=get(row,'deadline')
      if (!tarea){errs.push(`Fila ${rn}: falta "tarea"`);continue}
      if (!tipo){errs.push(`Fila ${rn}: falta "tipo"`);continue}
      if (!sp){errs.push(`Fila ${rn}: falta "solicitado_por"`);continue}
      if (!tr){errs.push(`Fila ${rn}: falta "tiempo_estimado"`);continue}
      if (!fr){errs.push(`Fila ${rn}: falta "fecha_solicitud"`);continue}
      if (!dr){errs.push(`Fila ${rn}: falta "deadline"`);continue}
      const fs=parseDate(fr); if(!fs){errs.push(`Fila ${rn}: fecha_solicitud inválida`);continue}
      const dl=parseDate(dr); if(!dl){errs.push(`Fila ${rn}: deadline inválido`);continue}

      csvNames.add(tarea)
      const exists = tareas.find(t => t.tarea === tarea)
      if (!exists) {
        inserts.push({ tipo,tarea,notas:get(row,'notas')||null,solicitado_por:sp,prioridad:get(row,'prioridad')||'Media',estado:get(row,'estado')||'Pendiente',tiempo_estimado:parseInt(tr)||0,tiempo_real:parseInt(get(row,'tiempo_real'))||0,fecha_solicitud:fs,deadline:dl,fecha_finalizacion:null,done:false,en_plan:false,orden:maxOrden+inserts.length+1 })
      }
    }

    const toDelete = tareas.filter(t => !csvNames.has(t.tarea) && !t.done)

    let added = 0
    if (inserts.length > 0) {
      const { error } = await supabase.from('tareas').insert(inserts)
      if (error) errs.push(`Error al guardar: ${error.message}`)
      else { added = inserts.length; fetchTareas() }
    }

    const skipped = tareas.filter(t => csvNames.has(t.tarea)).length
    setImportResult({ added, skipped, toDelete, errors: errs })
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleConfirmDelete(selected: number[]) {
    setDeleting(true)
    await Promise.all(selected.map(id => supabase.from('tareas').delete().eq('id', id)))
    setDeleting(false)
    setImportResult(null)
    fetchTareas()
  }

  const inputCls = (err?:string) => `w-full border rounded-lg px-3 py-2 text-sm outline-none transition bg-white text-gray-800 placeholder:text-gray-300 ${err?'border-red-300 focus:border-red-400':'border-gray-200 focus:border-gray-400'}`
  const selectCls = (err?:string) => `w-full border rounded-lg px-3 py-2 text-sm outline-none transition bg-white text-gray-800 cursor-pointer appearance-none pr-8 ${err?'border-red-300':'border-gray-200 focus:border-gray-400'}`

  const showNewBtn = !['Completadas','Rutinaria','Casa'].includes(tab)

  const ResizeHandle = ({ col }: { col: number }) => (
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
      `}</style>

      <div className="border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-12 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-gray-900 flex items-center justify-center flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            </div>
            <span className="font-semibold text-gray-900 text-sm tracking-tight">Gestor de Tareas</span>
            <span className="text-gray-200">·</span>
            <span className="text-gray-400 text-xs capitalize">{new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadMaster} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">↓ Maestro</button>
            <button onClick={()=>{setImportResult(null);setImportModal(true)}} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">↑ Importar</button>
            <button onClick={exportCSV} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">↓ Exportar</button>
            {tab === 'Plan' && filtered.some(t => (t.done===true||(t.done as any)==='true'||t.estado==='Completada'||t.estado==='Omitida') && t.fecha_finalizacion===today) && (
              <button onClick={archivarDia} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">Archivar día</button>
            )}
            {showNewBtn&&<button onClick={openNew} className="text-xs text-white bg-gray-900 hover:bg-gray-700 px-4 py-1.5 rounded-lg transition font-semibold">+ Nueva tarea</button>}
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-12 pt-10 pb-16">

        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div className="flex items-center gap-0.5 flex-wrap">
            {TABS.map(({key,label,emoji,sub})=>{
              const count=tabCount(key); const isActive=tab===key
              return(
                <button key={key} onClick={()=>setTab(key)} title={sub||undefined}
                  className={`px-3.5 py-2 rounded-lg text-sm transition font-medium flex items-center gap-2 ${isActive?'bg-gray-900 text-white':'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}>
                  <span>{emoji}</span>
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

        {tab === 'Carga' ? <CargaTrabajo onEditTarea={(id) => { const t = tareas.find(x => x.id === id); if (t) openEdit(t) }} refreshKey={cargaRefreshKey} /> : <>

        {tab === 'Plan' ? (
          <PlanKpis tareas={tareas} filtered={filtered} cronoSeconds={cronoSeconds} cronoRunning={cronoRunning} onStart={startCrono} onPause={pauseCrono} onReset={resetCrono} formatCrono={formatCrono} today={today} previsionMin={previsionMin} setPrevisionMin={setPrevisionMin} onAdjustStart={adjustCronoFromStart}/>
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
                  <ResizeHandle col={0}/>
                </th>
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="Tipo" options={tipoOpts} value={fTipo} onChange={setFTipo} onSort={()=>handleSort('tipo')} sortDir={sortDir} isSorted={sortCol==='tipo'}/>
                  <ResizeHandle col={1}/>
                </th>
                <th className="relative px-4 select-none text-center">
                  <TextFilter value={fTarea} onChange={setFTarea} onSort={()=>handleSort('tarea')} sortDir={sortDir} isSorted={sortCol==='tarea'}/>
                  <ResizeHandle col={2}/>
                </th>
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="F. Solic." options={fechaSolOpts} value={fFechaSol} onChange={setFFechaSol} onSort={()=>handleSort('fecha_solicitud')} sortDir={sortDir} isSorted={sortCol==='fecha_solicitud'}/>
                  <ResizeHandle col={3}/>
                </th>
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="Deadline" options={deadlineOpts} value={fDeadline} onChange={setFDeadline} onSort={()=>handleSort('deadline')} sortDir={sortDir} isSorted={sortCol==='deadline'}/>
                  <ResizeHandle col={4}/>
                </th>
                <th className="relative px-3 text-center select-none">
                  <button onClick={()=>handleSort('tiempo_estimado')} className="flex items-center gap-1 mx-auto text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600">
                    Est.{sortCol==='tiempo_estimado'&&<span>{sortDir==='asc'?'↑':'↓'}</span>}
                  </button>
                  <ResizeHandle col={5}/>
                </th>
                <th className="relative px-3 text-center select-none">
                  <button onClick={()=>handleSort('tiempo_real')} className="flex items-center gap-1 mx-auto text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600">
                    Real{sortCol==='tiempo_real'&&<span>{sortDir==='asc'?'↑':'↓'}</span>}
                  </button>
                  <ResizeHandle col={6}/>
                </th>
                <th className="relative px-3 text-center select-none">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dif.</span>
                  <ResizeHandle col={7}/>
                </th>
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="Estado" options={estadoOpts} value={fEstado} onChange={setFEstado} onSort={()=>handleSort('estado')} sortDir={sortDir} isSorted={sortCol==='estado'}/>
                  <ResizeHandle col={8}/>
                </th>
                <th className="relative px-3 select-none text-center">
                  <ResizeHandle col={9}/>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading?(
                <tr><td colSpan={10} className="text-center py-20 text-gray-300 text-sm">
                  <div className="flex flex-col items-center gap-3"><div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin"></div>Cargando...</div>
                </td></tr>
              ):filtered.length===0?(
                <tr><td colSpan={10} className="text-center py-20 text-sm">
                  <div className="flex flex-col items-center gap-2 text-gray-300">
                    <span className="text-4xl">{tab==='Plan'?'☀️':tab==='Completadas'?'✓':'○'}</span>
                    <span>{hasFilters?'Sin resultados para estos filtros':tab==='Plan'?'Sin tareas para hoy':tab==='Completadas'?'Aún no hay completadas':'Sin tareas aquí'}</span>
                  </div>
                </td></tr>
              ):filtered.map((t,idx)=>{
                const tIsInactive = t.done===true||(t.done as any)==='true'||t.estado==='Completada'||t.estado==='Omitida'
                const firstInactiveIdx = filtered.findIndex(x => x.done===true||(x.done as any)==='true'||x.estado==='Completada'||x.estado==='Omitida')
                const showDivider = tab==='Plan' && tIsInactive && idx===firstInactiveIdx

                const tipoC=TIPO_COLORS[t.tipo]
                const estC=ESTADO_COLORS[t.estado]
                const retraso=diasRetraso(t.deadline,today)
                const tEst=t.tiempo_estimado||0
                const tReal=t.tiempo_real||0
                const dif=tReal>0?tReal-tEst:null
                const autoplan=!!(t.deadline&&t.deadline<=today&&!t.done&&t.estado!=='Omitida')
                const enplan=isEnPlan(t)
                const excluido=!!t.excluir_plan
                const isDone=t.done===true||(t.done as any)==='true'
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
                    draggable={!sortCol}
                    onDragStart={()=>onDragStart(idx)}
                    onDragEnter={()=>onDragEnter(idx)}
                    onDragEnd={onDrop}
                    onDragOver={e=>e.preventDefault()}
                    className={`border-b border-gray-50 group transition-colors ${isDragging?'opacity-40':''} ${isOver?'border-t-2 border-t-gray-400':''} ${idx%2===1?'bg-blue-50/20 hover:bg-blue-50/60':'bg-white hover:bg-blue-50/60'}`}
                    style={{height:52,cursor:sortCol?'default':'grab'}}>

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
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition text-base">⏭</button>
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
                                {excluido && <span className="text-[9px] font-semibold bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">⊘ sin plan</span>}
                              </div>
                            )}
                            {isHoy && <span className="text-[9px] font-bold bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">hoy</span>}
                            {diasRestantes > 0 && <span className="text-[9px] font-bold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">{diasRestantes}d</span>}
                          </div>
                        )
                      })()}
                    </td>

                    <td className="px-3 text-center text-[11px] tabular-nums text-gray-500">{tEst?`${tEst}m`:'—'}</td>
                    <td className="px-3 text-center text-[11px] tabular-nums text-gray-500">{tReal?`${tReal}m`:'—'}</td>

                    <td className="px-3 text-center">
                      {dif!==null?(
                        <span className={`text-xs font-semibold tabular-nums ${dif>0?'text-red-400':dif<0?'text-emerald-500':'text-gray-400'}`}>
                          {dif>0?`+${dif}m`:dif<0?`${dif}m`:'='}
                        </span>
                      ):<span className="text-xs text-gray-200">—</span>}
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
                        <button onClick={()=>openEdit(t)} title="Editar" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition">
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
              <button onClick={()=>{setModal(false);setEditId(null)}} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition text-gray-400">✕</button>
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
              <button onClick={()=>setImportModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition text-gray-400">✕</button>
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
                    <div className={`border rounded-xl p-3 text-center ${importResult.toDelete.length>0?'bg-red-50 border-red-100':'bg-gray-50 border-gray-100'}`}>
                      <div className={`text-xl font-bold ${importResult.toDelete.length>0?'text-red-500':'text-gray-400'}`}>{importResult.toDelete.length}</div>
                      <div className={`text-xs mt-0.5 ${importResult.toDelete.length>0?'text-red-500':'text-gray-400'}`}>Ya no están</div>
                    </div>
                  </div>
                  {importResult.errors.length>0&&(
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
                      <p className="text-xs font-semibold text-red-600 mb-1">{importResult.errors.length} error(es):</p>
                      {importResult.errors.map((e,i)=><p key={i} className="text-xs text-red-500">{e}</p>)}
                    </div>
                  )}
                  {importResult.toDelete.length>0&&(
                    <DeleteConfirm tasks={importResult.toDelete} onConfirm={handleConfirmDelete} deleting={deleting}/>
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
                {tiempoRealModal.action==='complete'?'✓ Completar':'⏭ Omitir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function DeleteConfirm({ tasks, onConfirm, deleting }: { tasks: Tarea[], onConfirm: (ids: number[]) => void, deleting: boolean }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  useEffect(() => { setSelected(new Set(tasks.map(t=>t.id))) }, [tasks])
  const toggle = (id: number) => {
    setSelected(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })
  }
  return (
    <div className="border border-amber-100 bg-amber-50 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-amber-700">Estas tareas ya no están en el CSV. ¿Eliminarlas?</p>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {tasks.map(t=>(
          <label key={t.id} className="flex items-center gap-2 cursor-pointer py-1 hover:bg-amber-100/50 px-1 rounded-lg">
            <input type="checkbox" checked={selected.has(t.id)} onChange={()=>toggle(t.id)} className="rounded"/>
            <span className="text-xs text-gray-700 truncate">{shortTaskName(t.tarea)}</span>
            <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{t.tipo}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={()=>onConfirm([...selected])} disabled={selected.size===0||deleting}
          className="ml-auto px-4 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 disabled:opacity-40 transition">
          {deleting?'Eliminando...':`Eliminar ${selected.size}`}
        </button>
      </div>
    </div>
  )
}
