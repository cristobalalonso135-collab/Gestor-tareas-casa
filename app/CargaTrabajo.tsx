'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type Tarea = {
  id: number
  tipo: string
  tarea: string
  estado: string
  tiempo_estimado: number
  deadline: string | null
  fecha_planificada?: string | null
  done: boolean
  es_padre?: boolean | null
  es_fragmento?: boolean | null
  parent_id?: number | null
}

type Jornada = {
  fecha: string
  minutos_s: number
}

const TIPO_COLORS: Record<string, string> = {
  'Operativa': 'bg-sky-400',
  'Táctica': 'bg-violet-400',
  'Estratégica': 'bg-amber-400',
  'Trimestral': 'bg-gray-300',
  'Semanal': 'bg-gray-400',
  'Mensual': 'bg-gray-500',
}
const TIPO_TEXT: Record<string, string> = {
  'Operativa': 'text-sky-700',
  'Táctica': 'text-violet-700',
  'Estratégica': 'text-amber-700',
  'Trimestral': 'text-gray-500',
  'Semanal': 'text-gray-600',
  'Mensual': 'text-gray-700',
}

function minToHM(min: number): string {
  if (!min) return '0m'
  const h = Math.floor(min / 60), m = min % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function getAllDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fDate(d?: string | null): string {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
}

function isInactive(t: Tarea): boolean {
  return !!t.done || t.estado === 'Omitida' || t.estado === 'Completada'
}

function planningDate(t: Tarea): string | null {
  return t.fecha_planificada || t.deadline || null
}

const DAY_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const TIPOS_FILTRO = ['Semanal', 'Mensual', 'Trimestral', 'Operativa', 'Táctica', 'Estratégica']
type AtrasoFilter = 'todas' | 'retrasadas' | 'no_retrasadas'

type Props = {
  onEditTarea?: (id: number) => void
  refreshKey?: number
}

export default function CargaTrabajo({ onEditTarea, refreshKey }: Props) {
  const [allTareas, setAllTareas] = useState<Tarea[]>([])
  const [jornadas, setJornadas] = useState<Record<string, number>>({})
  const [capacityOverrides, setCapacityOverrides] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(localStorage.getItem('carga_capacity_overrides') || '{}')
    } catch {
      return {}
    }
  })
  const [loading, setLoading] = useState(true)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [soloLaborables, setSoloLaborables] = useState(false)
  const [editingJornada, setEditingJornada] = useState<string | null>(null)
  const [jornadaInput, setJornadaInput] = useState('')
  const [savingJornada, setSavingJornada] = useState(false)
  const [editingCapacity, setEditingCapacity] = useState<string | null>(null)
  const [capacityInput, setCapacityInput] = useState('')
  const [editingPlanDateId, setEditingPlanDateId] = useState<number | null>(null)
  const [planDateInput, setPlanDateInput] = useState('')
  const [savingPlanDate, setSavingPlanDate] = useState(false)
  const [tipoFilter, setTipoFilter] = useState<string[]>(() => {
    if (typeof window === 'undefined') return TIPOS_FILTRO
    try {
      const saved = localStorage.getItem('carga_tipo_filter')
      if (!saved) return TIPOS_FILTRO
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed.filter((x: string) => TIPOS_FILTRO.includes(x)) : TIPOS_FILTRO
    } catch {
      return TIPOS_FILTRO
    }
  })
  const [atrasoFilter, setAtrasoFilter] = useState<AtrasoFilter>(() => {
    if (typeof window === 'undefined') return 'todas'
    const saved = localStorage.getItem('carga_atraso_filter') as AtrasoFilter | null
    return saved === 'retrasadas' || saved === 'no_retrasadas' ? saved : 'todas'
  })

  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const todayStr = dateKey(now)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: t, error: tError }, { data: j }] = await Promise.all([
      supabase
        .from('tareas')
        .select('id,tipo,tarea,estado,tiempo_estimado,deadline,fecha_planificada,done,es_padre,es_fragmento,parent_id'),
      supabase.from('jornadas').select('fecha,minutos_s')
    ])

    if (tError) {
      console.error('Error cargando CargaTrabajo:', tError)
      setAllTareas([])
    } else {
      setAllTareas(t || [])
    }

    const jMap: Record<string, number> = {}
    ;(j || []).forEach((row: Jornada) => { jMap[row.fecha] = row.minutos_s })
    setJornadas(jMap)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (refreshKey && refreshKey > 0) fetchAll()
  }, [refreshKey, fetchAll])

  useEffect(() => {
    localStorage.setItem('carga_tipo_filter', JSON.stringify(tipoFilter))
  }, [tipoFilter])

  useEffect(() => {
    localStorage.setItem('carga_atraso_filter', atrasoFilter)
  }, [atrasoFilter])

  useEffect(() => {
    localStorage.setItem('carga_capacity_overrides', JSON.stringify(capacityOverrides))
  }, [capacityOverrides])

function defaultCapacityForDate(d: Date): number {
  const day = d.getDay()

  if (day === 0) return 150 // domingo 2h30
  if (day === 6) return 240 // sábado 4h

  return 90 // lunes-viernes 1h30
}

  function capacityForDate(d: Date): number {
    const key = dateKey(d)
    return capacityOverrides[key] ?? defaultCapacityForDate(d)
  }

  function saveCapacity(fecha: string, minutos: number) {
    const clean = Math.max(0, Math.round(minutos || 0))
    setCapacityOverrides(prev => ({ ...prev, [fecha]: clean }))
    setEditingCapacity(null)
  }

  function resetCapacity(fecha: string) {
    setCapacityOverrides(prev => {
      const next = { ...prev }
      delete next[fecha]
      return next
    })
    setEditingCapacity(null)
  }

  function toggleTipo(tipo: string) {
    setTipoFilter(prev => prev.includes(tipo) ? prev.filter(x => x !== tipo) : [...prev, tipo])
  }

  async function saveJornada(fecha: string, minutos: number) {
    setSavingJornada(true)
    await supabase.from('jornadas').upsert({ fecha, minutos_s: minutos }, { onConflict: 'fecha' })
    setJornadas(prev => ({ ...prev, [fecha]: minutos }))
    setSavingJornada(false)
    setEditingJornada(null)
  }

  async function savePlanDate(t: Tarea, fecha: string) {
    setSavingPlanDate(true)
    const cleanFecha = fecha || null
    const { error } = await supabase
      .from('tareas')
      .update({ fecha_planificada: cleanFecha })
      .eq('id', t.id)

    if (error) alert(`No pude guardar la fecha planificada: ${error.message}`)
    else {
      setAllTareas(prev => prev.map(x => x.id === t.id ? { ...x, fecha_planificada: cleanFecha } : x))
      setEditingPlanDateId(null)
      setPlanDateInput('')
    }
    setSavingPlanDate(false)
  }

  const tareasBase = allTareas.filter(t => t.es_padre !== true)

  // En Carga de trabajo solo mostramos carga activa/pendiente.
  // El historial no aporta para planificar capacidad y ensuciaba la vista.
  const tareasActivas = tareasBase.filter(t => !isInactive(t) && t.tipo !== 'Casa')
  const allTiposSelected = tipoFilter.length === TIPOS_FILTRO.length
  const tipoFilterSet = new Set(tipoFilter)
  const isRetrasada = (t: Tarea) => !!t.deadline && t.deadline < todayStr
  const tareasPorTipo = tareasActivas.filter(t => tipoFilterSet.has(t.tipo))
  const tareas = tareasPorTipo.filter(t => {
    if (atrasoFilter === 'retrasadas') return isRetrasada(t)
    if (atrasoFilter === 'no_retrasadas') return !isRetrasada(t)
    return true
  })

  const allDays = getAllDaysInMonth(viewYear, viewMonth)
  const workdays = soloLaborables ? allDays.filter(d => d.getDay() !== 0 && d.getDay() !== 6) : allDays
  const futureWorkdays = workdays.filter(d => dateKey(d) >= todayStr)
  const capacityByDay: Record<string, number> = {}
  workdays.forEach(d => { capacityByDay[dateKey(d)] = capacityForDate(d) })

  const byDay: Record<string, Tarea[]> = {}
  tareas.forEach(t => {
    const key = planningDate(t)
    if (!key) return
    if (!byDay[key]) byDay[key] = []
    byDay[key].push(t)
  })

  const byDayTotal: Record<string, Tarea[]> = {}
  tareasActivas.forEach(t => {
    const key = planningDate(t)
    if (!key) return
    if (!byDayTotal[key]) byDayTotal[key] = []
    byDayTotal[key].push(t)
  })

  // Retrasadas sin fecha planificada: aparecen como deuda en HOY, no todos los días.
  // Si una tarea retrasada tiene fecha_planificada, aparece en ese día, pero mantiene badge de retraso.
  const retrasadasSinPlan = tareas.filter(t =>
    t.deadline &&
    t.deadline < todayStr &&
    !t.fecha_planificada
  )
  const retrasadasPlanificadas = tareas.filter(t =>
    t.deadline &&
    t.deadline < todayStr &&
    !!t.fecha_planificada
  )
  const retrasadasSinPlanTotal = tareasActivas.filter(t =>
    t.deadline &&
    t.deadline < todayStr &&
    !t.fecha_planificada
  )
  const retrasadasTotalMin = retrasadasSinPlan.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
  const retrasadasTotalMinReal = retrasadasSinPlanTotal.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)

  const maxMin = Math.max(480, ...workdays.map(d => {
    const key = dateKey(d)
    const planned = (byDay[key] || []).reduce((s, t) => s + (t.tiempo_estimado||0), 0)
    return Math.max(planned, capacityByDay[key] || 0)
  }), retrasadasTotalMin)

  const isInViewedMonth = (key?: string | null) => {
    if (!key) return false
    const d = new Date(`${key}T00:00:00`)
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth
  }

  const tareasMes = tareas.filter(t => isInViewedMonth(planningDate(t)))
  const tareasActivasMes = tareasActivas.filter(t => isInViewedMonth(planningDate(t)))

  const retrasadasSinPlanMes = retrasadasSinPlan.filter(t => isInViewedMonth(t.deadline))
  const retrasadasPlanificadasMes = retrasadasPlanificadas.filter(t => isInViewedMonth(planningDate(t)))
  const retrasadasTotalMinMes = retrasadasSinPlanMes.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)

  const sinFecha = tareas.filter(t => !planningDate(t))
  const tareasMesFuturas = tareasMes.filter(t => {
    const key = planningDate(t)
    return !!key && key >= todayStr
  })
  const tareasActivasMesFuturas = tareasActivasMes.filter(t => {
    const key = planningDate(t)
    return !!key && key >= todayStr
  })
  const totalPendiente = tareasMesFuturas.reduce((s, t) => s + (t.tiempo_estimado||0), 0)
  const totalPendienteReal = tareasActivasMesFuturas.reduce((s, t) => s + (t.tiempo_estimado||0), 0)
  const totalConFecha = tareasMesFuturas.filter(t => !!planningDate(t)).reduce((s, t) => s + (t.tiempo_estimado||0), 0)

  const mediaPorTarea = tareasMesFuturas.length > 0 ? Math.round(totalPendiente / tareasMesFuturas.length) : 0
  const tareasFinSemana = tareasMesFuturas.filter(t => {
    const key = planningDate(t)
    if (!key) return false
    const d = new Date(`${key}T00:00:00`)
    return d.getDay() === 0 || d.getDay() === 6
  })
  const totalFinSemana = tareasFinSemana.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)

  const totalCapacityMes = futureWorkdays.reduce((s, d) => s + capacityForDate(d), 0)
  const totalLibreMes = Math.max(0, totalCapacityMes - totalPendiente)
  const sobrecargaUtil = futureWorkdays.reduce((s, d) => {
    const key = dateKey(d)
    const capacity = capacityForDate(d)
    const planned = ((byDay[key] || []).reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)) + (key === todayStr ? retrasadasTotalMin : 0)

    // Exceso real sobre la capacidad del día:
    // L-V 5h, S-D 2h, o la capacidad manual que hayas puesto.
    return s + Math.max(0, planned - capacity)
  }, 0)
  const diasEnRiesgo = futureWorkdays.filter(d => {
    const key = dateKey(d)
    const capacity = capacityForDate(d)
    const planned = ((byDay[key] || []).reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)) + (key === todayStr ? retrasadasTotalMin : 0)
    return capacity > 0 && planned > capacity
  }).length
  const totalFueraCapacidad = Math.max(0, totalPendiente - totalCapacityMes)
  const pctCapacidad = totalCapacityMes > 0 ? Math.round((totalPendiente / totalCapacityMes) * 100) : null
  const diasSinCapacidad = futureWorkdays.filter(d => capacityForDate(d) === 0).length

  const availableSlots = workdays
    .map(d => {
      const key = dateKey(d)
      const planned = ((byDay[key] || []).reduce((s, t) => s + (t.tiempo_estimado || 0), 0)) + (key === todayStr ? retrasadasTotalMin : 0)
      const capacity = capacityForDate(d)
      const free = capacity - planned
      return { key, d, planned, capacity, free }
    })
    .filter(x => x.key > todayStr && x.capacity > 0 && x.free >= 15)
    .slice(0, 8)

  const totalMes = workdays.reduce((s, d) => s + (jornadas[dateKey(d)] || 0), 0)
  const pctOcupacion = pctCapacidad
  const retrasadasActivasCount = tareasPorTipo.filter(t => isRetrasada(t)).length
  const noRetrasadasActivasCount = tareasPorTipo.filter(t => !isRetrasada(t)).length

  const prevMonth = () => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1)}else setViewMonth(m=>m-1) }
  const nextMonth = () => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1)}else setViewMonth(m=>m+1) }

  function barColor(totalMin: number): string {
    if (totalMin > 420) return 'bg-red-400'     // >7h
    if (totalMin > 360) return 'bg-orange-400'  // >6h
    if (totalMin > 300) return 'bg-yellow-300'  // >5h
    return 'bg-gray-200'
  }

  function barTextColor(totalMin: number): string {
    if (totalMin > 420) return 'text-red-500'     // >7h
    if (totalMin > 360) return 'text-orange-500'  // >6h
    if (totalMin > 300) return 'text-yellow-500'  // >5h
    return 'text-gray-400'
  }

  function renderTaskRow(t: Tarea, variant: 'normal' | 'overdue' = 'normal') {
    const isOverdue = !!t.deadline && t.deadline < todayStr && !isInactive(t)
    const isPlanned = !!t.fecha_planificada
    const delayDays = isOverdue && t.deadline ? Math.abs(daysBetween(todayStr, t.deadline)) : 0

    return (
      <div key={variant === 'overdue' ? `ret-${t.id}` : t.id}
        className={`flex items-center gap-3 py-1.5 px-3 rounded-lg cursor-pointer transition group ${variant === 'overdue' ? 'bg-violet-50/70 hover:bg-violet-100/70' : 'bg-gray-50 hover:bg-gray-100'}`}
        onClick={()=>onEditTarea?.(t.id)}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TIPO_COLORS[t.tipo]||'bg-gray-300'}`}></span>
        <span className={`text-xs flex-1 truncate font-medium ${TIPO_TEXT[t.tipo]||'text-gray-600'}`} title={t.tarea}>{t.tarea}</span>

        {isOverdue && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 font-semibold flex-shrink-0" title={`Deadline original: ${fDate(t.deadline)}`}>
            +{delayDays}d
          </span>
        )}

        {isPlanned && isOverdue && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 font-semibold flex-shrink-0" title="Replanificada">
            plan {fDate(t.fecha_planificada)}
          </span>
        )}

        <span className="text-xs text-gray-400 flex-shrink-0">{minToHM(t.tiempo_estimado)}</span>

        <div className="flex-shrink-0" onClick={e=>e.stopPropagation()}>
          {editingPlanDateId === t.id ? (
            <div className="flex items-center gap-1">
              <input type="date" value={planDateInput}
                onChange={e=>setPlanDateInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')savePlanDate(t,planDateInput);if(e.key==='Escape')setEditingPlanDateId(null)}}
                className="w-32 border border-gray-300 rounded px-2 py-0.5 text-xs outline-none focus:border-gray-500" autoFocus/>
              <button onClick={()=>savePlanDate(t,planDateInput)} disabled={savingPlanDate}
                className="text-xs text-emerald-500 hover:text-emerald-600 font-bold">✓</button>
            </div>
          ) : (
            <button onClick={()=>{setEditingPlanDateId(t.id);setPlanDateInput(t.fecha_planificada || planningDate(t) || todayStr)}}
              className={`text-[10px] px-2 py-1 rounded-lg border transition ${isPlanned?'border-blue-100 text-blue-500 bg-blue-50 hover:bg-blue-100':'border-dashed border-gray-200 text-gray-300 hover:text-gray-500 hover:border-gray-300'}`}
              title="Cambiar fecha planificada">
              {isPlanned ? '📍 replan.' : '+ plan'}
            </button>
          )}
        </div>

        <span className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition flex-shrink-0">✏ editar</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
          t.estado==='Completada'?'bg-emerald-100 text-emerald-600':
          t.estado==='Omitida'?'bg-gray-100 text-gray-400':
          t.estado==='En progreso'?'bg-blue-100 text-blue-600':
          t.estado==='En espera'?'bg-amber-100 text-amber-600':
          'bg-gray-100 text-gray-400'
        }`}>{t.estado}</span>
      </div>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-300">
      <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin mr-3"></div>
      Cargando...
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="text-base font-semibold text-gray-900 min-w-[160px] text-center">{MONTH_NAMES[viewMonth]} {viewYear}</span>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={()=>setSoloLaborables(v=>!v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${soloLaborables?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            {soloLaborables?'Solo laborables':'Todos los días'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="border border-gray-100 rounded-xl bg-white px-4 py-3 -mt-2 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-16">Tipo</span>
          <button
            onClick={() => setTipoFilter(TIPOS_FILTRO)}
            className={`text-xs px-3 py-1.5 rounded-full border transition font-semibold shadow-sm ${allTiposSelected ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
            Todos
          </button>
          {TIPOS_FILTRO.map(tipo => {
            const selected = tipoFilter.includes(tipo)
            return (
              <button key={tipo}
                onClick={() => toggleTipo(tipo)}
                className={`text-xs px-3 py-1.5 rounded-full border transition font-semibold shadow-sm ${selected ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                {tipo}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap border-t border-gray-50 pt-3">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-16">Estado</span>

          <button
            onClick={() => setAtrasoFilter('todas')}
            className={`text-xs px-3 py-1.5 rounded-full border transition font-medium flex items-center gap-1.5 ${atrasoFilter === 'todas' ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            Todas
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${atrasoFilter === 'todas' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}`}>{tareasPorTipo.length}</span>
          </button>

          <button
            onClick={() => setAtrasoFilter('retrasadas')}
            className={`text-xs px-3 py-1.5 rounded-full border transition font-medium flex items-center gap-1.5 ${atrasoFilter === 'retrasadas' ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            Retrasadas
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${atrasoFilter === 'retrasadas' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}`}>{retrasadasActivasCount}</span>
          </button>

          <button
            onClick={() => setAtrasoFilter('no_retrasadas')}
            className={`text-xs px-3 py-1.5 rounded-full border transition font-medium flex items-center gap-1.5 ${atrasoFilter === 'no_retrasadas' ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            No retrasadas
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${atrasoFilter === 'no_retrasadas' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}`}>{noRetrasadasActivasCount}</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label:'Capacidad del mes', val:minToHM(totalCapacityMes), sub:'', tone:'default' },
          { label:'Trabajo planificado', val:minToHM(totalPendiente), sub:'', tone:'default' },
          { label:'Hueco libre', val:minToHM(totalLibreMes), sub:'', tone: totalLibreMes > 0 ? 'free' : 'default' },
          {
            label: 'Sobrecarga',
            val: sobrecargaUtil > 0 ? minToHM(sobrecargaUtil) : 'OK',
            sub: '',
            tone: sobrecargaUtil > 0 ? 'debt' : 'free'
          },
        ].map((s,i)=>{
          const toneClass = s.tone === 'debt'
            ? 'border-violet-200 bg-violet-50'
            : s.tone === 'free'
              ? 'border-emerald-200 bg-emerald-50'
              : s.tone === 'weekend'
                ? 'border-rose-200 bg-rose-50'
                : 'border-gray-100'
          const valueClass = s.tone === 'debt'
            ? 'text-violet-600'
            : s.tone === 'free'
              ? 'text-emerald-600'
              : s.tone === 'weekend'
                ? 'text-rose-500'
                : 'text-gray-900'
          return (
            <div key={i} className={`border rounded-xl p-5 ${toneClass}`}>
              <div className={`text-2xl font-bold mb-1 ${valueClass}`}>{s.val}</div>
              <div className="text-sm font-semibold text-gray-700 mb-0.5">{s.label}</div>
              {s.sub && <div className="text-xs text-gray-400">{s.sub}</div>}
            </div>
          )
        })}
      </div>

      {pctOcupacion !== null && (
        <div className="text-xs text-gray-400 -mt-2">
          Ocupación del mes según capacidad disponible: <span className="font-semibold text-gray-600">{pctOcupacion}%</span>
        </div>
      )}

      {availableSlots.length > 0 && (
        <div className="border border-emerald-100 bg-emerald-50 rounded-xl px-5 py-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Huecos disponibles</div>
              <div className="text-xs text-emerald-600/70 mt-0.5">Próximos días donde puedes encajar tareas sin abrir una a una.</div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {availableSlots.map(slot => (
              <button key={slot.key}
                onClick={() => setExpandedDay(slot.key)}
                className="bg-white border border-emerald-100 rounded-lg px-3 py-2 text-left hover:bg-emerald-50 transition">
                <div className="text-xs font-semibold text-gray-700">{DAY_NAMES[slot.d.getDay()]} {slot.d.getDate()}</div>
                <div className="text-sm font-bold text-emerald-600">{minToHM(slot.free)} libres</div>
                <div className="text-[10px] text-gray-400">{minToHM(slot.planned)} / {minToHM(slot.capacity)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Day bars */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="bg-white px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Distribución por día</span>
          <div className="flex items-center gap-3 ml-auto text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-200 inline-block"></span>Libre</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-300 inline-block"></span>&le;100%</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-300 inline-block"></span>100-120%</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-400 inline-block"></span>&gt;120%</span>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {workdays.map(d => {
            const key = dateKey(d)
            const dayTareasBase = byDay[key] || []
            const dayTareas = key === todayStr ? [...dayTareasBase, ...retrasadasSinPlan] : dayTareasBase
            const dayTareasTotalBase = byDayTotal[key] || []
            const dayTareasTotal = key === todayStr ? [...dayTareasTotalBase, ...retrasadasSinPlanTotal] : dayTareasTotalBase
            const totalMin = dayTareas.reduce((s,t)=>s+(t.tiempo_estimado||0),0)
            const totalMinReal = dayTareasTotal.reduce((s,t)=>s+(t.tiempo_estimado||0),0)
            const isHoy = key === todayStr
            const Min = jornadas[key] || 0
            const capacidadMin = capacityForDate(d)
            const libreMin = capacidadMin - totalMin
            const pct = maxMin>0?(totalMin/maxMin)*100:0
            const jornadaPct = maxMin>0?(capacidadMin/maxMin)*100:100
            const isPast = key<todayStr && !isHoy
            const isExpanded = expandedDay===key
            const ocupacionPct = capacidadMin > 0 ? Math.round((totalMin / capacidadMin) * 100) : 0
            const color = capacidadMin === 0
              ? 'bg-gray-100'
              : ocupacionPct > 120
                ? 'bg-red-400'
                : ocupacionPct > 100
                  ? 'bg-orange-400'
                  : totalMin > 0
                    ? 'bg-emerald-300'
                    : 'bg-gray-200'
            const textColor = capacidadMin === 0
              ? 'text-gray-300'
              : ocupacionPct > 120
                ? 'text-red-500'
                : ocupacionPct > 100
                  ? 'text-orange-500'
                  : totalMin > 0
                    ? 'text-emerald-600'
                    : 'text-gray-400'
            const pctOcDia = capacidadMin > 0 ? ocupacionPct : null
            const plannedOverdue = dayTareasBase.filter(t => t.deadline && t.deadline < todayStr && t.fecha_planificada)

            return (
              <div key={key} className={`${isHoy?'bg-blue-50/40':isPast?'bg-gray-50/30':'bg-white'}`}>
                <div className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50/50 transition"
                  onClick={()=>setExpandedDay(isExpanded?null:key)}>

                  <div className="w-32 flex-shrink-0">
                    <div className={`text-sm font-semibold ${isHoy?'text-blue-600':isPast?'text-gray-300':d.getDay()===0||d.getDay()===6?'text-gray-400':'text-gray-700'}`}>
                      {DAY_NAMES[d.getDay()]} {d.getDate()}
                      {isHoy&&<span className="ml-1.5 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">HOY</span>}
                    </div>
                    <div className={`text-xs mt-0.5 font-medium ${textColor}`}>
                      {totalMin>0?minToHM(totalMin):<span className="text-gray-200">—</span>}
                      {pctOcDia!==null&&<span className="ml-1.5 text-gray-400 font-normal">/ {minToHM(capacidadMin)} · {pctOcDia}%</span>}
                      {capacidadMin===0&&<span className="ml-1.5 text-gray-300 font-normal">0h cap.</span>}
                    </div>
                    {(!allTiposSelected || atrasoFilter !== 'todas') && totalMinReal > 0 && (
                      <div className="text-[10px] text-gray-300 mt-0.5">
                        {minToHM(totalMin)} filt. · {minToHM(totalMinReal)} total
                      </div>
                    )}
                  </div>

                  <div className="flex-1 relative h-6 bg-gray-50 rounded-lg overflow-hidden">
                    <div className="absolute top-0 bottom-0 w-px bg-gray-300 z-10" style={{left:`${Math.min(jornadaPct,99)}%`}}></div>
                    {totalMin>0&&<div className={`h-full rounded-lg transition-all ${color}`} style={{width:`${Math.min(pct,100)}%`}}></div>}
                    {capacidadMin>0&&totalMin>capacidadMin&&<div className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold ${ocupacionPct > 120 ? 'text-red-500' : 'text-orange-500'}`}>+{minToHM(totalMin-capacidadMin)} exceso</div>}
                    {capacidadMin>0&&totalMin>0&&totalMin<=capacidadMin&&<div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600">{minToHM(capacidadMin-totalMin)} margen</div>}
                    {plannedOverdue.length>0&&<div className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-violet-600">{plannedOverdue.length} retras.</div>}
                  </div>

                  <div className="w-56 flex-shrink-0 flex items-center justify-end gap-1" onClick={e=>e.stopPropagation()}>
                    {editingCapacity===key ? (
                      <div className="flex items-center gap-1">
                        <input type="number" value={capacityInput}
                          onChange={e=>setCapacityInput(e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')saveCapacity(key,parseInt(capacityInput)||0);if(e.key==='Escape')setEditingCapacity(null)}}
                          className="w-16 border border-gray-300 rounded px-2 py-0.5 text-xs text-center outline-none focus:border-gray-500"
                          placeholder="min" autoFocus/>
                        <button onClick={()=>saveCapacity(key,parseInt(capacityInput)||0)}
                          className="text-xs text-emerald-500 hover:text-emerald-600 font-bold">✓</button>
                        <button onClick={()=>resetCapacity(key)}
                          className="text-xs text-gray-300 hover:text-gray-500">reset</button>
                      </div>
                    ) : (
                      <button onClick={()=>{setEditingCapacity(key);setCapacityInput(String(capacidadMin))}}
                        className={`text-xs px-2 py-1 rounded-lg border transition ${capacityOverrides[key] !== undefined ? 'border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                        title="Capacidad disponible para planificar este día">
                        cap. {minToHM(capacidadMin)}
                      </button>
                    )}

                    {editingJornada===key ? (
                      <div className="flex items-center gap-1">
                        <input type="number" value={jornadaInput}
                          onChange={e=>setJornadaInput(e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')saveJornada(key,parseInt(jornadaInput)||0);if(e.key==='Escape')setEditingJornada(null)}}
                          className="w-16 border border-gray-300 rounded px-2 py-0.5 text-xs text-center outline-none focus:border-gray-500"
                          placeholder="min" autoFocus/>
                        <button onClick={()=>saveJornada(key,parseInt(jornadaInput)||0)} disabled={savingJornada}
                          className="text-xs text-emerald-500 hover:text-emerald-600 font-bold">✓</button>
                      </div>
                    ) : (
                      <button onClick={()=>{setEditingJornada(key);setJornadaInput(Min.toString())}}
                        className={`text-xs px-2 py-1 rounded-lg border transition ${Min>0?'border-gray-200 text-gray-600 hover:bg-gray-50':'border-dashed border-gray-200 text-gray-300 hover:text-gray-400 hover:border-gray-300'}`}>
                        {Min>0?`⏱ ${minToHM(Min)}`:'+ '}
                      </button>
                    )}
                  </div>

                  <div className="w-20 flex-shrink-0 flex items-center justify-end gap-2">
                    {dayTareas.length>0&&<span className="text-xs text-gray-400">{dayTareas.length} tarea{dayTareas.length!==1?'s':''}</span>}
                    {dayTareas.length>0&&(
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        className={`text-gray-300 transition-transform ${isExpanded?'rotate-180':''}`}>
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    )}
                  </div>
                </div>

                {isExpanded&&dayTareas.length>0&&(
                  <div className="px-5 pb-3 space-y-1.5 border-t border-gray-50">
                    {isHoy&&retrasadasSinPlan.length>0&&(
                      <>
                        <div className="flex items-center gap-2 pt-2 pb-0.5">
                          <div className="flex-1 h-px bg-violet-100"></div>
                          <span className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider">Retrasadas sin plan ({retrasadasSinPlan.length}) · {minToHM(retrasadasTotalMin)}</span>
                          <div className="flex-1 h-px bg-violet-100"></div>
                        </div>
                        {retrasadasSinPlan.sort((a,b)=>(b.tiempo_estimado||0)-(a.tiempo_estimado||0)).map(t=>renderTaskRow(t, 'overdue'))}
                      </>
                    )}

                    {dayTareasBase.length>0&&(
                      <>
                        {isHoy&&retrasadasSinPlan.length>0&&(
                          <div className="flex items-center gap-2 pt-2 pb-0.5">
                            <div className="flex-1 h-px bg-gray-100"></div>
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Planificadas en este día</span>
                            <div className="flex-1 h-px bg-gray-100"></div>
                          </div>
                        )}
                        {dayTareasBase.sort((a,b)=>(b.tiempo_estimado||0)-(a.tiempo_estimado||0)).map(t=>renderTaskRow(t))}
                      </>
                    )}

                    <div className="flex justify-between pt-1 text-xs text-gray-400">
                      <span>{dayTareas.filter(t=>t.done||t.estado==='Completada').length} completadas · {dayTareas.filter(t=>t.estado==='Omitida').length} omitidas</span>
                      <span className="font-semibold text-gray-500">{minToHM(totalMin)} / {minToHM(capacidadMin)} · {libreMin>=0 ? `${minToHM(libreMin)} libre` : `${minToHM(Math.abs(libreMin))} exceso`}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Sin fecha */}
      {sinFecha.length>0&&(
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="bg-white px-5 py-3 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sin fecha</span>
            <span className="ml-2 text-xs text-gray-400">— {sinFecha.length} tarea{sinFecha.length!==1?'s':''} · {minToHM(sinFecha.reduce((s,t)=>s+(t.tiempo_estimado||0),0))}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {sinFecha.map(t=>(
              <div key={t.id}
                className="flex items-center gap-3 px-5 py-3 bg-white hover:bg-gray-50 cursor-pointer transition group"
                onClick={()=>onEditTarea?.(t.id)}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TIPO_COLORS[t.tipo]||'bg-gray-300'}`}></span>
                <span className="text-sm text-gray-700 flex-1 truncate">{t.tarea}</span>
                <span className="text-xs text-gray-400">{minToHM(t.tiempo_estimado)}</span>
                <button onClick={(e)=>{e.stopPropagation();setEditingPlanDateId(t.id);setPlanDateInput(todayStr)}}
                  className="text-[10px] px-2 py-1 rounded-lg border border-dashed border-gray-200 text-gray-300 hover:text-gray-500 hover:border-gray-300">
                  + plan
                </button>
                <span className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition">✏ editar</span>
                <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${TIPO_TEXT[t.tipo]||'text-gray-500'}`}>{t.tipo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
