'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAllTareas } from '@/lib/supabaseTasks'
import { loadAppSetting } from '@/lib/appSettings'
import {
  CAPACITY_KEY,
  FUTURE_ROUTINE_RESERVE_KEY,
  dateKey,
  defaultCasaCapacity,
  defaultWorkCapacity,
  fDate,
  isClosedTask,
  isAparcada,
  loadStatus,
  minToHM,
  planningDate,
  withInheritedCasa,
  EVENT_TYPE,
  ROUTINE_TYPES,
  canonicalTipo,
  isImportedRoutine,
  isInCasaToday,
  isInWorkPlanToday,
  tipoIn,
} from '@/lib/taskRules'
import { TIPO_BAR, TIPO_DOT } from '@/lib/tipoColors'

type Tarea = {
  id: number
  tipo: string
  tarea: string
  prioridad: string
  estado: string
  tiempo_estimado: number
  deadline: string | null
  fecha_planificada?: string | null
  prioridad_orden?: number | null
  done: boolean
  excluir_plan?: boolean | null
  excluida_fecha?: string | null
  para_casa?: boolean | null
  fecha_casa?: string | null
  parent_id?: number | null
  es_fragmento?: boolean | null
  es_padre?: boolean | null
  en_plan?: boolean | null
  grupo?: string | null
}

type Props = {
  onEditTarea?: (id: number) => void
  refreshKey?: number
}

const TYPE_FILTER_KEY = 'replanificador_tipo_filter'
const CALENDAR_MODE_KEY = 'replanificador_calendar_mode'
const CASA_CAPACITY_OVERRIDES_KEY = 'casa_capacity_overrides'
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const TIPOS: string[] = [...ROUTINE_TYPES, 'Operativa', 'Táctica', 'Estratégica', EVENT_TYPE, 'Reunión']
const RUTINA_MARKS: Record<string, { code: string; title: string; border: string }> = {
  Diaria: { code: 'D', title: 'Diaria: fija', border: 'border-solid border-gray-300' },
  Bisemanal: { code: '2S', title: 'Bisemanal: 2 veces/semana', border: 'border-dashed border-gray-400' },
  Semanal: { code: 'S', title: 'Semanal: reubicable', border: 'border-dashed border-gray-400' },
  Bimensual: { code: '2M', title: 'Bimensual: 2 veces/mes', border: 'border-dotted border-gray-500' },
  Mensual: { code: 'M', title: 'Mensual: flexible', border: 'border-dotted border-gray-500' },
}
const DAY_MIX = [
  { key: 'Rutinarias', label: 'Rutinarias', types: [...ROUTINE_TYPES], bar: 'bg-gray-400', text: 'text-gray-600' },
  { key: 'Operativas', label: 'Operativas', types: ['Operativa'], bar: TIPO_BAR.Operativa.bar, text: TIPO_BAR.Operativa.text },
  { key: 'Tácticas', label: 'Tácticas', types: ['Táctica'], bar: TIPO_BAR.Táctica.bar, text: TIPO_BAR.Táctica.text },
  { key: 'Estratégicas', label: 'Estratégicas', types: ['Estratégica'], bar: TIPO_BAR.Estratégica.bar, text: TIPO_BAR.Estratégica.text },
  { key: 'Recordatorios', label: 'Recordatorios', types: [EVENT_TYPE, 'Evento'], bar: TIPO_BAR.Recordatorio.bar, text: TIPO_BAR.Recordatorio.text },
  { key: 'Reuniones', label: 'Reuniones', types: ['Reunión'], bar: TIPO_BAR.Reunión.bar, text: TIPO_BAR.Reunión.text },
]

type CalendarMode = 'trabajo' | 'casa'

function readJsonObject(key: string): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function remainingDaysOfYear(today: Date): Date[] {
  const days: Date[] = []
  const d = new Date(today)
  d.setHours(0, 0, 0, 0)
  const end = new Date(d.getFullYear(), 11, 31)
  while (d <= end) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

function daysOfMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

export default function Replanificador({ onEditTarea, refreshKey }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [capacityOverrides, setCapacityOverrides] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(localStorage.getItem(CAPACITY_KEY) || '{}')
    } catch {
      return {}
    }
  })
  const [casaCapacityOverrides, setCasaCapacityOverrides] = useState<Record<string, number>>(() => readJsonObject(CASA_CAPACITY_OVERRIDES_KEY))
  const [calendarMode, setCalendarMode] = useState<CalendarMode>(() => {
    if (typeof window === 'undefined') return 'trabajo'
    return localStorage.getItem(CALENDAR_MODE_KEY) === 'casa' ? 'casa' : 'trabajo'
  })
  const [tipoFilter, setTipoFilter] = useState<string[]>(() => {
    if (typeof window === 'undefined') return TIPOS
    try {
      const saved = JSON.parse(localStorage.getItem(TYPE_FILTER_KEY) || '[]')
      if (!Array.isArray(saved) || saved.length === 0) return TIPOS
      const mapped = saved.map((x: string) => x === 'Evento' ? EVENT_TYPE : x)
      const filtered = mapped.filter((x: string) => TIPOS.includes(x))
      const hadAllPrevious = ['Diaria', 'Semanal', 'Mensual', 'Operativa', 'Táctica', 'Estratégica'].every(t => saved.includes(t))
      const missingNewTypes = (!saved.includes('Evento') && !saved.includes(EVENT_TYPE)) || !saved.includes('Reunión') || !saved.includes('Bisemanal') || !saved.includes('Bimensual')
      if (hadAllPrevious && missingNewTypes) return TIPOS
      return filtered.length ? filtered : TIPOS
    } catch {
      return TIPOS
    }
  })
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth())
  const [futureRoutineReserveMinutes, setFutureRoutineReserveMinutes] = useState(120)
  const [loading, setLoading] = useState(true)

  const today = useMemo(() => new Date(), [])
  const todayKey = dateKey(today)
  const tomorrowKey = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    return dateKey(d)
  }, [today])
  const days = useMemo(() => remainingDaysOfYear(today), [today])

  const fetchTareas = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAllTareas<Tarea>(
        'id,tipo,tarea,prioridad,estado,tiempo_estimado,deadline,fecha_planificada,prioridad_orden,done,para_casa,fecha_casa,es_padre,parent_id,es_fragmento,excluir_plan,excluida_fecha,grupo,en_plan',
        query => query.order('deadline', { ascending: true })
      )
      setTareas(data)
    } catch (error) {
      console.error('Error cargando replanificador:', error)
      setTareas([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTareas() }, [fetchTareas])
  useEffect(() => { if (refreshKey && refreshKey > 0) fetchTareas() }, [refreshKey, fetchTareas])
  useEffect(() => {
    const onTasks = () => { fetchTareas() }
    window.addEventListener('gestor-tareas-updated', onTasks)
    return () => window.removeEventListener('gestor-tareas-updated', onTasks)
  }, [fetchTareas])
  useEffect(() => { localStorage.setItem(TYPE_FILTER_KEY, JSON.stringify(tipoFilter)) }, [tipoFilter])
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FUTURE_ROUTINE_RESERVE_KEY)
      if (!saved) return
      const parsed = parseInt(saved, 10)
      if (Number.isFinite(parsed)) setFutureRoutineReserveMinutes(Math.max(0, parsed))
    } catch {}
  }, [])
  useEffect(() => {
    localStorage.setItem(FUTURE_ROUTINE_RESERVE_KEY, String(futureRoutineReserveMinutes))
  }, [futureRoutineReserveMinutes])
  useEffect(() => {
    localStorage.setItem(CALENDAR_MODE_KEY, calendarMode)
  }, [calendarMode])

  useEffect(() => {
    const refreshCasaCapacity = () => {
      setCasaCapacityOverrides(readJsonObject(CASA_CAPACITY_OVERRIDES_KEY))
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === CAPACITY_KEY) {
        try {
          setCapacityOverrides(JSON.parse(event.newValue || '{}'))
        } catch {
          setCapacityOverrides({})
        }
      }
      if (event.key === CASA_CAPACITY_OVERRIDES_KEY) {
        refreshCasaCapacity()
      }
    }
    const onCapacityUpdated = () => {
      try {
        setCapacityOverrides(JSON.parse(localStorage.getItem(CAPACITY_KEY) || '{}'))
      } catch {
        setCapacityOverrides({})
      }
    }
    const onCasaUpdated = () => refreshCasaCapacity()
    window.addEventListener('storage', onStorage)
    window.addEventListener('gestor-capacity-updated', onCapacityUpdated)
    window.addEventListener('gestor-casa-capacity-updated', onCasaUpdated as EventListener)
    void loadAppSetting<Record<string, number>>(CAPACITY_KEY, {}).then(value => {
      setCapacityOverrides(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
    })
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('gestor-capacity-updated', onCapacityUpdated)
      window.removeEventListener('gestor-casa-capacity-updated', onCasaUpdated as EventListener)
    }
  }, [])

  function capacityForDate(d: Date): number {
    const key = dateKey(d)
    if (calendarMode === 'casa') {
      return casaCapacityOverrides[key] ?? defaultCasaCapacity(d)
    }
    return capacityOverrides[key] ?? defaultWorkCapacity(d)
  }

  function isFutureMonth(d: Date): boolean {
    return d.getFullYear() > today.getFullYear() || (d.getFullYear() === today.getFullYear() && d.getMonth() > today.getMonth())
  }

  function futureRoutineReserveForDate(d: Date, realRoutineMinutes = 0): number {
    if (calendarMode === 'casa') return 0
    const capacity = capacityForDate(d)
    if (capacity <= 0 || !isFutureMonth(d) || realRoutineMinutes > 0) return 0
    return Math.min(capacity, futureRoutineReserveMinutes)
  }

  const calendarDate = useCallback((t: Tarea): string | null => {
    if (calendarMode === 'casa') return t.fecha_casa || todayKey
    return planningDate(t)
  }, [calendarMode, todayKey])

  function toggleTipo(tipo: string) {
    setTipoFilter(prev => {
      const normalized = prev.filter(x => TIPOS.includes(x))
      const allSelected = normalized.length === TIPOS.length
      if (allSelected) return [tipo]
      if (normalized.includes(tipo)) {
        return normalized.length === 1 ? TIPOS : normalized.filter(x => x !== tipo)
      }
      return [...normalized, tipo]
    })
  }

  const parentById = useMemo(() => {
    const map = new Map<number, Tarea>()
    tareas.forEach(t => {
      if (t.es_padre === true) map.set(t.id, t)
    })
    return map
  }, [tareas])

  const activeTasks = useMemo(() => (
    tareas
      .map(t => withInheritedCasa(t, parentById))
      .filter(t => (
        !isClosedTask(t) &&
        t.es_padre !== true &&
        t.tipo !== 'Casa' &&
        !isAparcada(t) &&
        (calendarMode === 'casa' ? t.para_casa === true : t.para_casa !== true)
      ))
  ), [tareas, calendarMode, parentById])

  const filteredTasks = useMemo(() => {
    return activeTasks
      .filter(t => tipoIn(t.tipo, tipoFilter))
      .sort((a, b) => {
        const dateCompare = String(calendarDate(a) || '9999-99-99').localeCompare(String(calendarDate(b) || '9999-99-99'))
        if (dateCompare !== 0) return dateCompare
        const priorityCompare = (a.prioridad_orden ?? 999999) - (b.prioridad_orden ?? 999999)
        if (priorityCompare !== 0) return priorityCompare
        return a.id - b.id
      })
  }, [activeTasks, tipoFilter, calendarDate])

  const calendarTasks = useMemo(() => (
    filteredTasks.filter(t => {
      const key = calendarDate(t)
      return !!key && key >= tomorrowKey
    })
  ), [filteredTasks, tomorrowKey, calendarDate])

  const loadByDay = useMemo(() => {
    const map: Record<string, Tarea[]> = {}
    calendarTasks.forEach(t => {
      const key = calendarDate(t)
      if (!key) return
      if (!map[key]) map[key] = []
      map[key].push(t)
    })
    return map
  }, [calendarTasks, calendarDate])

  const planTodayTasks = useMemo(() => (
    filteredTasks.filter(t => calendarMode === 'casa' ? isInCasaToday(t, todayKey) : isInWorkPlanToday(t, todayKey))
  ), [calendarMode, filteredTasks, todayKey])

  const carryoverTasks = useMemo(() => {
    const alreadyTomorrow = new Set((loadByDay[tomorrowKey] || []).map(t => t.id))
    return planTodayTasks.filter(t => !alreadyTomorrow.has(t.id))
  }, [loadByDay, planTodayTasks, tomorrowKey])
  const carryoverMin = carryoverTasks.reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)

  const selectedMonthDays = useMemo(() => (
    daysOfMonth(today.getFullYear(), selectedMonth)
  ), [selectedMonth, today])

  const selectedMonthActiveDays = useMemo(() => (
    selectedMonthDays.filter(d => dateKey(d) >= tomorrowKey)
  ), [selectedMonthDays, tomorrowKey])

  const calendarCells = useMemo(() => {
    const firstDay = selectedMonthDays[0]
    const leadingEmpty = firstDay ? (firstDay.getDay() + 6) % 7 : 0
    const cells: Array<Date | null> = [
      ...Array.from({ length: leadingEmpty }, () => null),
      ...selectedMonthDays,
    ]
    const trailingEmpty = (7 - (cells.length % 7)) % 7
    return [
      ...cells,
      ...Array.from({ length: trailingEmpty }, () => null),
    ]
  }, [selectedMonthDays])

  const monthCapacity = selectedMonthActiveDays.reduce((sum, d) => sum + capacityForDate(d), 0)
  const monthActualPlanned = selectedMonthActiveDays.reduce((sum, d) => {
    const key = dateKey(d)
    const dated = (loadByDay[key] || []).reduce((taskSum, t) => taskSum + (t.tiempo_estimado || 0), 0)
    return sum + dated + (key === tomorrowKey ? carryoverMin : 0)
  }, 0)
  const monthRoutineReserve = selectedMonthActiveDays.reduce((sum, d) => {
    const key = dateKey(d)
    const realRoutineMinutes = (loadByDay[key] || [])
      .filter(t => isImportedRoutine(t))
      .reduce((taskSum, t) => taskSum + (t.tiempo_estimado || 0), 0)
    return sum + futureRoutineReserveForDate(d, realRoutineMinutes)
  }, 0)
  const monthPlanned = monthActualPlanned + monthRoutineReserve
  const monthTaskCount = selectedMonthActiveDays.reduce((sum, d) => {
    const key = dateKey(d)
    return sum + (loadByDay[key] || []).length + (key === tomorrowKey ? carryoverTasks.length : 0)
  }, 0)
  const monthFree = monthCapacity - monthPlanned
  const monthSaturation = monthCapacity > 0 ? Math.round((monthPlanned / monthCapacity) * 100) : monthPlanned > 0 ? null : 0
  const monthStatus = loadStatus(monthPlanned, monthCapacity)
  const availableDays = selectedMonthActiveDays.filter(d => capacityForDate(d) > 0).length
  const daysWithEstimate = selectedMonthActiveDays.filter(d => {
    const key = dateKey(d)
    return (loadByDay[key] || []).length > 0 || (key === tomorrowKey && carryoverTasks.length > 0)
  }).length
  const averageByLoadedDay = daysWithEstimate > 0 ? Math.round(monthActualPlanned / daysWithEstimate) : 0

  const visibleTotal = calendarTasks.reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
  const allTypesSelected = tipoFilter.length === TIPOS.length
  const selectedDayTasks = expandedDay ? (loadByDay[expandedDay] || []) : []
  const selectedDayCarryover = expandedDay === tomorrowKey ? carryoverTasks : []
  const selectedDayLoadTasks = [...selectedDayTasks, ...selectedDayCarryover]
  const selectedDayCapacity = expandedDay ? capacityForDate(new Date(`${expandedDay}T00:00:00`)) : 0
  const selectedDayActualPlanned = selectedDayTasks.reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
  const selectedDayCarryoverMin = selectedDayCarryover.reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
  const selectedDayRealRoutineMinutes = selectedDayTasks
    .filter(t => isImportedRoutine(t))
    .reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
  const selectedDayReserve = expandedDay ? futureRoutineReserveForDate(new Date(`${expandedDay}T00:00:00`), selectedDayRealRoutineMinutes) : 0
  const selectedDayPlanned = selectedDayActualPlanned + selectedDayCarryoverMin + selectedDayReserve
  const selectedDayExcess = selectedDayPlanned - selectedDayCapacity
  const selectedDayDate = expandedDay ? new Date(`${expandedDay}T00:00:00`) : null
  const selectedDaySaturation = selectedDayCapacity > 0 ? Math.round((selectedDayPlanned / selectedDayCapacity) * 100) : selectedDayPlanned > 0 ? null : 0
  const selectedDayScale = Math.max(selectedDayCapacity, selectedDayPlanned, 1)
  const selectedDayMix = DAY_MIX.map(item => {
    const realMinutes = selectedDayLoadTasks
      .filter(t => tipoIn(t.tipo, item.types))
      .reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
    const minutes = item.key === 'Rutinarias' ? realMinutes + selectedDayReserve : realMinutes
    return {
      ...item,
      minutes,
      pct: selectedDayCapacity > 0 ? Math.round((minutes / selectedDayCapacity) * 100) : null,
      width: Math.max(0, (minutes / selectedDayScale) * 100),
    }
  })
  const selectedDayFree = Math.max(0, selectedDayCapacity - selectedDayPlanned)
  const selectedDayFreePct = selectedDayCapacity > 0 ? Math.round((selectedDayFree / selectedDayCapacity) * 100) : null
  const selectedDayExcessPct = selectedDayCapacity > 0 && selectedDayExcess > 0 ? Math.round((selectedDayExcess / selectedDayCapacity) * 100) : null

  function renderCalendarTask(t: Tarea, carryover = false) {
    return (
      <button key={t.id} onClick={() => onEditTarea?.(t.id)} className={`w-full rounded-xl border px-3 py-3 text-left hover:bg-gray-50 transition ${carryover ? 'border-amber-100 bg-amber-50/40' : 'border-gray-100'}`}>
        <div className="flex items-start gap-3">
          <span className={`mt-1.5 w-2 h-2 rounded-full ${TIPO_DOT[t.tipo] || 'bg-gray-300'}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="text-sm font-semibold text-gray-800 leading-5 whitespace-normal break-words">{t.tarea}</div>
              {RUTINA_MARKS[t.tipo] && <span title={RUTINA_MARKS[t.tipo].title} className={`mt-0.5 inline-flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-sm border bg-white/70 px-0.5 text-[9px] font-bold leading-none text-gray-500 ${RUTINA_MARKS[t.tipo].border}`}>{RUTINA_MARKS[t.tipo].code}</span>}
              {carryover && <span className="mt-0.5 shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">{calendarMode === 'casa' ? 'Casa de hoy' : 'Plan de hoy'}</span>}
            </div>
            <div className="mt-1 text-xs text-gray-400">{canonicalTipo(t.tipo)} · {t.prioridad} · {t.estado}</div>
          </div>
          <span className="text-xs font-semibold text-gray-500">{minToHM(t.tiempo_estimado || 0)}</span>
        </div>
      </button>
    )
  }

  if (loading) {
    return <div className="py-16 text-center text-gray-300 text-sm">Cargando replanificador...</div>
  }

  return (
    <div className="space-y-6">
      <section className="border border-gray-100 rounded-2xl bg-white overflow-hidden">
        <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-3">
            <div className="inline-flex rounded-xl border border-gray-100 bg-gray-50 p-1">
              {[
                { key: 'trabajo' as const, label: 'Trabajo' },
                { key: 'casa' as const, label: 'Casa' },
              ].map(option => (
                <button
                  key={option.key}
                  onClick={() => {
                    setCalendarMode(option.key)
                    setExpandedDay(null)
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${calendarMode === option.key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-400 hover:text-gray-700'}`}>
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setTipoFilter(TIPOS)}
              className={`text-xs px-3 py-1.5 rounded-full border transition font-semibold ${allTypesSelected ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              Todos
            </button>
            {TIPOS.map(tipo => {
              const active = tipoFilter.includes(tipo)
              return (
                <button
                  key={tipo}
                  onClick={() => toggleTipo(tipo)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition font-semibold flex items-center gap-1.5 ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  <span className={`w-2 h-2 rounded-full ${TIPO_DOT[tipo] || 'bg-gray-300'}`}></span>
                  {tipo}
                </button>
              )
            })}
            </div>
          </div>
          <div className="text-right text-xs text-gray-400">
            <div><span className="font-semibold text-gray-800">{filteredTasks.length}</span> tareas</div>
            <div>{minToHM(visibleTotal)}</div>
          </div>
        </div>
      </section>

      <section className="border border-gray-100 rounded-2xl bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-gray-900">Calendario visual</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {calendarMode === 'casa'
                ? 'Mañana suma lo fechado en casa más lo que hoy sigue pendiente en Casa.'
                : 'Mañana suma lo ya fechado más todo lo que sigue en Plan del día. Capacidad por defecto: 3h de lunes a viernes.'}
            </div>
          </div>
          {calendarMode === 'trabajo' && <label className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-400">
            <span className="block font-semibold text-gray-500">Prevision rutinarias futuras</span>
            <span className="mt-1 flex items-center gap-1">
              <input
                type="number"
                min={0}
                step={5}
                value={futureRoutineReserveMinutes}
                onChange={e => setFutureRoutineReserveMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-right text-xs font-bold text-gray-800 outline-none focus:border-gray-400"
              />
              <span>min/dia laborable desde {MONTH_NAMES[(today.getMonth() + 1) % 12]}</span>
            </span>
          </label>}
          <div className="text-xs text-gray-400 text-right">
            <div>Color por carga</div>
            <div><span className="text-emerald-600 font-semibold">Bien ≤95%</span> · <span className="text-amber-600 font-semibold">Justo 96-105%</span> · <span className="text-red-500 font-semibold">Exceso &gt;105%</span></div>
          </div>
        </div>

        <div className="px-5 py-5 bg-white">
          <div className="grid grid-cols-[repeat(4,minmax(140px,1fr))] gap-3 mb-4">
            <div className={`rounded-lg border ${monthStatus.border} ${monthStatus.bg} px-3 py-3`}>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Estado del mes</div>
              <div className={`mt-1 text-lg font-bold ${monthStatus.text}`}>{monthStatus.label}</div>
              <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                {monthCapacity > 0 && <div className={`h-full ${monthStatus.bar}`} style={{ width: `${Math.min(100, monthSaturation || 0)}%` }} />}
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Capacidad mes</div>
              <div className="mt-1 text-lg font-bold text-gray-900">{minToHM(monthCapacity)}</div>
              <div className="mt-1 text-xs text-gray-400">{MONTH_NAMES[selectedMonth]} {today.getFullYear()}</div>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Estimado tareas</div>
              <div className="mt-1 text-lg font-bold text-gray-900">{minToHM(monthPlanned)}</div>
              <div className="mt-1 text-xs text-gray-400">{monthTaskCount} tareas en {MONTH_NAMES[selectedMonth]}{monthRoutineReserve > 0 ? ` · ${minToHM(monthRoutineReserve)} prevision` : ''}</div>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Hueco libre</div>
              <div className={`mt-1 text-lg font-bold ${monthFree < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                {monthFree < 0 ? `${minToHM(Math.abs(monthFree))} exceso` : minToHM(monthFree)}
              </div>
              <div className="mt-1 text-xs text-gray-400">{monthSaturation === null ? 'Sin capacidad' : `${monthSaturation}% ocupado`}</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {MONTH_NAMES.map((name, index) => {
              if (!days.some(d => d.getMonth() === index)) return null
              const active = selectedMonth === index
              return (
                <button
                  key={name}
                  onClick={() => setSelectedMonth(index)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-400 border-gray-100 hover:text-gray-700 hover:bg-gray-50'}`}>
                  {name} {today.getFullYear()}
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-[repeat(7,minmax(88px,1fr))] gap-3 mb-2">
            {WEEKDAY_HEADERS.map(day => (
              <div key={day} className="px-3 text-[10px] font-bold uppercase tracking-wide text-gray-300">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[repeat(7,minmax(88px,1fr))] gap-3">
            {calendarCells.map((d, index) => {
              if (!d) {
                return <div key={`empty-${index}`} className="min-h-[104px]" aria-hidden="true" />
              }
              const key = dateKey(d)
              if (key < tomorrowKey) {
                return <div key={key} className="min-h-[104px]" aria-hidden="true" />
              }
              const capacity = capacityForDate(d)
              const tasks = loadByDay[key] || []
              const extras = key === tomorrowKey ? carryoverTasks : []
              const extraMin = extras.reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
              const actualPlanned = tasks.reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
              const realRoutineMinutes = tasks
                .filter(t => isImportedRoutine(t))
                .reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
              const routineReserve = futureRoutineReserveForDate(d, realRoutineMinutes)
              const planned = actualPlanned + extraMin + routineReserve
              const excess = planned - capacity
              const saturation = capacity > 0 ? Math.round((planned / capacity) * 100) : planned > 0 ? 101 : 0
              const isToday = key === todayKey
              const isSelected = expandedDay === key
              const status = loadStatus(planned, capacity)
              const width = capacity > 0 ? Math.min(100, Math.round((planned / capacity) * 100)) : planned > 0 ? 100 : 0
              return (
                <button
                  key={key}
                  onClick={() => setExpandedDay(key)}
                  className={`text-left rounded-lg border p-3 min-h-[104px] transition ${isSelected ? 'border-gray-900 bg-gray-50 shadow-sm' : isToday ? 'border-blue-100 bg-blue-50/40' : `${status.border} ${status.bg} hover:bg-gray-50`}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>{DAY_NAMES[d.getDay()]} {d.getDate()}</span>
                    {capacity > 0 && <span className={`text-[10px] font-bold ${status.text}`}>{saturation}%</span>}
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    {width > 0 && <div className={`h-full ${status.bar}`} style={{ width: `${width}%` }} />}
                  </div>
                  <div className={`mt-1 text-[10px] font-semibold ${status.text}`}>{status.label}</div>
                  {extraMin > 0 && <div className="mt-0.5 text-[10px] font-semibold text-amber-600">+{minToHM(extraMin)} arrastre {calendarMode === 'casa' ? 'Casa' : 'Plan'}</div>}
                  {routineReserve > 0 && <div className="mt-0.5 text-[10px] text-gray-400">+{minToHM(routineReserve)} rutinarias prev.</div>}
                  {capacity > 0 && (
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                      <span className={`font-semibold ${status.text}`}>{minToHM(planned)} ocupado</span>
                      <span className={excess > 0 ? 'text-red-500 font-semibold' : 'text-emerald-600 font-semibold'}>
                        {excess > 0 ? `${minToHM(excess)} exceso` : `${minToHM(Math.abs(excess))} libre`}
                      </span>
                    </div>
                  )}
                  {capacity === 0 && planned > 0 && (
                    <div className="mt-1 text-[10px] font-semibold text-red-500">{minToHM(planned)} sin capacidad</div>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-4 border-t border-gray-100 pt-3 flex items-center gap-x-6 gap-y-2 flex-wrap text-xs text-gray-400">
            <span>
              <span className="font-semibold text-gray-700">{daysWithEstimate}</span> días con tareas
            </span>
            <span>
              <span className="font-semibold text-gray-700">{minToHM(monthActualPlanned)}</span> estimado real
            </span>
            {carryoverMin > 0 && selectedMonthActiveDays.some(d => dateKey(d) === tomorrowKey) && (
              <span>
                <span className="font-semibold text-amber-600">{minToHM(carryoverMin)}</span> arrastre de {calendarMode === 'casa' ? 'Casa' : 'Plan'} en mañana
              </span>
            )}
            {monthRoutineReserve > 0 && (
              <span>
                <span className="font-semibold text-gray-700">{minToHM(monthRoutineReserve)}</span> prevision rutinarias
              </span>
            )}
            <span>
              <span className="font-semibold text-gray-700">{minToHM(monthPlanned)}</span> total visual
            </span>
            <span>
              <span className="font-semibold text-gray-700">{minToHM(averageByLoadedDay)}</span> media por día con tareas
            </span>
            <span>
              <span className="font-semibold text-gray-700">{availableDays}</span> días con capacidad
            </span>
            <span>
              <span className={`font-semibold ${monthStatus.text}`}>{monthSaturation === null ? 'Sin capacidad' : `${monthSaturation}%`}</span> carga media
            </span>
          </div>
        </div>

      </section>
      {expandedDay && selectedDayDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/30 px-4 py-6" onClick={() => setExpandedDay(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4 shrink-0">
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {DAY_NAMES[selectedDayDate.getDay()]} {selectedDayDate.getDate()} {MONTH_NAMES[selectedDayDate.getMonth()]} {selectedDayDate.getFullYear()}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{fDate(expandedDay)}</div>
              </div>
              <button onClick={() => setExpandedDay(null)} className="rounded-lg border border-gray-100 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:text-gray-700 hover:bg-gray-50">
                Cerrar
              </button>
            </div>

            <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-4 gap-3 text-xs shrink-0">
              <div>
                <div className="text-gray-400">Tareas</div>
                <div className="font-bold text-gray-900">{selectedDayTasks.length + selectedDayCarryover.length}</div>
                {selectedDayCarryover.length > 0 && <div className="mt-0.5 text-[10px] text-amber-600">{selectedDayTasks.length} de este día · +{selectedDayCarryover.length} {calendarMode === 'casa' ? 'de Casa' : 'de Plan'}</div>}
              </div>
              <div>
                <div className="text-gray-400">Carga</div>
                <div className="font-bold text-gray-900">{minToHM(selectedDayPlanned)}</div>
                {selectedDayCarryoverMin > 0 && <div className="mt-0.5 text-[10px] text-amber-600">{minToHM(selectedDayActualPlanned)} fechadas · +{minToHM(selectedDayCarryoverMin)} arrastre</div>}
                {selectedDayReserve > 0 && <div className="mt-0.5 text-[10px] text-gray-400">+{minToHM(selectedDayReserve)} prevision (sin rutinarias aún)</div>}
              </div>
              <div>
                <div className="text-gray-400">Capacidad</div>
                <div className="font-bold text-gray-900">{minToHM(selectedDayCapacity)}</div>
              </div>
              <div>
                <div className="text-gray-400">Saturación</div>
                <div className={`font-bold ${selectedDayExcess > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {selectedDayCapacity === 0 && selectedDayPlanned > 0 ? 'Exceso' : selectedDaySaturation === null ? 'Sin capacidad' : `${selectedDaySaturation}%`}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-b border-gray-100 space-y-3 text-xs shrink-0">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-gray-500">Reparto del día</span>
                <span className={selectedDayExcess > 0 ? 'text-red-500 font-semibold' : 'text-emerald-600 font-semibold'}>
                  {selectedDayExcess > 0 ? `${minToHM(selectedDayExcess)} exceso` : `${minToHM(Math.abs(selectedDayExcess))} libre`}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 flex">
                {selectedDayMix.map(item => item.minutes > 0 ? (
                  <div
                    key={item.key}
                    title={`${item.label}: ${minToHM(item.minutes)}${item.pct !== null ? ` · ${item.pct}%` : ''}`}
                    className={item.bar}
                    style={{ width: `${item.width}%` }}
                  />
                ) : null)}
                {selectedDayFree > 0 && (
                  <div
                    title={`Libre: ${minToHM(selectedDayFree)}${selectedDayFreePct !== null ? ` · ${selectedDayFreePct}%` : ''}`}
                    className="bg-emerald-200"
                    style={{ width: `${(selectedDayFree / selectedDayScale) * 100}%` }}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedDayMix.filter(item => item.minutes > 0).map(item => (
                  <div key={item.key} className="rounded-lg border border-gray-100 px-2.5 py-2 min-w-[7.5rem] flex-1">
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <span className={`h-2 w-2 rounded-full ${item.bar}`} />
                      <span>{item.label}</span>
                    </div>
                    <div className={`mt-1 font-bold ${item.text}`}>
                      {item.pct === null ? '-' : `${item.pct}%`}
                      <span className="ml-1 font-semibold text-gray-400">{minToHM(item.minutes)}</span>
                    </div>
                  </div>
                ))}
                <div className="rounded-lg border border-gray-100 px-2.5 py-2 min-w-[7.5rem] flex-1">
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-200" />
                    <span>{selectedDayExcess > 0 ? 'Exceso' : 'Libre'}</span>
                  </div>
                  <div className={`mt-1 font-bold ${selectedDayExcess > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                    {selectedDayExcess > 0 ? `+${selectedDayExcessPct ?? '-'}%` : selectedDayFreePct === null ? '-' : `${selectedDayFreePct}%`}
                    <span className="ml-1 font-semibold text-gray-400">{selectedDayExcess > 0 ? minToHM(selectedDayExcess) : minToHM(selectedDayFree)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
              {selectedDayLoadTasks.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-300">Sin tareas planificadas.</div>
              ) : (
                <>
                  {selectedDayTasks.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Ya en este día · {minToHM(selectedDayActualPlanned)}</div>
                      {selectedDayTasks
                        .slice()
                        .sort((a, b) => (b.tiempo_estimado || 0) - (a.tiempo_estimado || 0))
                        .map(t => renderCalendarTask(t))}
                    </div>
                  )}
                  {selectedDayCarryover.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-amber-600">
                        Si no las cierras hoy · {minToHM(selectedDayCarryoverMin)}
                        <span className="ml-1 font-semibold text-amber-500">({calendarMode === 'casa' ? 'pendiente en Casa' : 'Plan del día'})</span>
                      </div>
                      {selectedDayCarryover
                        .slice()
                        .sort((a, b) => (b.tiempo_estimado || 0) - (a.tiempo_estimado || 0))
                        .map(t => renderCalendarTask(t, true))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
