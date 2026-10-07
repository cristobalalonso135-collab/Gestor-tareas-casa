'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAllTareas } from '@/lib/supabaseTasks'
import { loadAppSetting, saveAppSetting, LOCKS_UPDATED_EVENT, CASA_CAPACITY_UPDATED_EVENT } from '@/lib/appSettings'
import {
  CAPACITY_KEY,
  CASA_CAPACITY_OVERRIDES_KEY,
  FUTURE_ROUTINE_RESERVE_KEY,
  LOCKED_TASKS_KEY,
  addDays,
  dateKey,
  defaultCasaCapacity,
  defaultWorkCapacity,
  fDate,
  isAparcada,
  isClosedTask,
  isImportedRoutine,
  isRoutineType,
  isWorkType,
  loadStatus,
  minToHM,
  planningDate,
  withInheritedCasa,
  canonicalTipo,
} from '@/lib/taskRules'
import { TIPO_DOT } from '@/lib/tipoColors'

type Tarea = {
  id: number
  tipo: string
  tarea: string
  estado: string
  tiempo_estimado: number
  deadline: string | null
  fecha_solicitud?: string | null
  fecha_planificada?: string | null
  fecha_casa?: string | null
  fecha_finalizacion?: string | null
  hora_finalizacion?: string | null
  prioridad_orden?: number | null
  done: boolean
  excluir_plan?: boolean | null
  excluida_fecha?: string | null
  para_casa?: boolean | null
  es_padre?: boolean | null
  parent_id?: number | null
}

type Props = {
  onEditTarea?: (id: number) => void
  refreshKey?: number
  onChanged?: () => void
}

type ListFilter = 'faltan' | 'hechas' | 'omitidas' | 'pospuestas' | 'todas'
type ListSort = 'dia' | 'tiempo'
type BudgetFate = 'pendiente' | 'hecha' | 'omitida' | 'pospuesta' | 'missing'
type FrozenTaskMeta = { casa: boolean, date: string | null }
type FrozenTasks = Record<string, FrozenTaskMeta>
type WeekBudgetSnap = {
  ids: number[]
  frozen: boolean
  workUsed?: number
  casaUsed?: number
  workCapacity?: number
  casaCapacity?: number
  loadFromIds?: boolean
  tasks?: FrozenTasks
  closedAt?: string
}
type WeekBudgetMap = Record<string, WeekBudgetSnap>

function hasPlanLoadPhoto(snap?: WeekBudgetSnap | null): snap is WeekBudgetSnap & {
  workUsed: number
  casaUsed: number
  workCapacity: number
  casaCapacity: number
} {
  return !!snap?.frozen
    && snap.loadFromIds === true
    && typeof snap.workUsed === 'number'
    && typeof snap.casaUsed === 'number'
    && typeof snap.workCapacity === 'number'
    && typeof snap.casaCapacity === 'number'
}

function closedLoadFromIds(
  ids: number[],
  byId: Map<number, Tarea>,
  days: string[],
  weekStart: string,
  workCapacityForDate: (date: string) => number,
  casaCapacityForDate: (date: string) => number,
  futureRoutineReserveMinutes: number,
  frozenTasks?: FrozenTasks | null,
) {
  let workUsed = 0
  let casaUsed = 0
  const routinesByDate: Record<string, number> = {}
  ids.forEach(id => {
    const t = byId.get(id)
    if (!t) return
    const min = t.tiempo_estimado || 0
    if (isCasaTask(t, frozenTasks)) {
      casaUsed += min
      return
    }
    workUsed += min
    if (isImportedRoutine(t)) {
      const date = weekDateOf(t, frozenTasks) || planningDate(t)
      if (date) routinesByDate[date] = (routinesByDate[date] || 0) + min
    }
  })
  const workCapacity = days.reduce((sum, date) => sum + workCapacityForDate(date), 0)
  const casaCapacity = days.reduce((sum, date) => sum + casaCapacityForDate(date), 0)
  days.forEach(date => {
    if (date > weekStart && workCapacityForDate(date) > 0 && !(routinesByDate[date] > 0)) {
      workUsed += Math.min(workCapacityForDate(date), futureRoutineReserveMinutes)
    }
  })
  return { workUsed, casaUsed, workCapacity, casaCapacity }
}

function closedDaysFromIds(ids: number[], byId: Map<number, Tarea>, days: string[], frozenTasks?: FrozenTasks | null) {
  const map: Record<string, { work: number, casa: number, doneWork: number, doneCasa: number }> = {}
  days.forEach(date => {
    map[date] = { work: 0, casa: 0, doneWork: 0, doneCasa: 0 }
  })
  ids.forEach(id => {
    const t = byId.get(id)
    if (!t) return
    const date = weekDateOf(t, frozenTasks)
    if (!date || !map[date]) return
    const min = t.tiempo_estimado || 0
    const casa = isCasaTask(t, frozenTasks)
    if (casa) map[date].casa += min
    else map[date].work += min
    if (isClosedTask(t) && t.estado !== 'Omitida') {
      if (casa) map[date].doneCasa += min
      else map[date].doneWork += min
    }
  })
  return map
}

function snapshotFrozenTasks(ids: number[], byId: Map<number, Tarea>): FrozenTasks {
  const tasks: FrozenTasks = {}
  ids.forEach(id => {
    const t = byId.get(id)
    if (!t) return
    tasks[String(id)] = { casa: isCasaTask(t), date: weekDateOf(t) }
  })
  return tasks
}

function tightnessOf(nowPct: number | null, startPct: number | null) {
  if (nowPct == null || startPct == null) return null
  const delta = nowPct - startPct
  if (delta >= 8) {
    return { label: 'Más prieto que al inicio', hint: `${nowPct}% ahora · ${startPct}% al fijar`, tone: 'red' as const }
  }
  if (delta <= -8) {
    return { label: 'Más holgado que al inicio', hint: `${nowPct}% ahora · ${startPct}% al fijar`, tone: 'green' as const }
  }
  return { label: 'Como al inicio', hint: `${nowPct}% ahora · ${startPct}% al fijar`, tone: 'gray' as const }
}

const WEEK_BUDGET_KEY = 'semana_budget'
const LOCKED_KEY = LOCKED_TASKS_KEY
const TYPE_PREFIX: Record<string, string> = { Operativa: 'OP', Táctica: 'TA', Estratégica: 'ES', Recordatorio: 'REC', Evento: 'REC', Reunión: 'REU' }
const TYPE_ORDER: Record<string, number> = { Diaria: 0, Bisemanal: 1, Semanal: 2, Bimensual: 3, Mensual: 4, Reunión: 5, Recordatorio: 6, Evento: 6, Operativa: 7, Táctica: 8, Estratégica: 9 }
const FATE_CHIP: Record<Exclude<BudgetFate, 'missing'>, { label: string, className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-amber-50 text-amber-700' },
  hecha: { label: 'Hecha', className: 'bg-emerald-50 text-emerald-600' },
  omitida: { label: 'Omitida', className: 'bg-gray-100 text-gray-400' },
  pospuesta: { label: 'Pospuesta', className: 'bg-red-50 text-red-600' },
}
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

function mondayOf(date: Date): Date {
  const d = new Date(date)
  const diff = (d.getDay() + 6) % 7
  return addDays(d, -diff)
}

function shortDate(value: string): string {
  const d = new Date(`${value}T00:00:00`)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function formatClosedAt(value?: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${date} ${time}`
}

function pctOf(used: number, capacity: number): number | null {
  if (capacity <= 0) return used > 0 ? 100 : null
  return Math.round((used / capacity) * 100)
}

function inRange(date: string | null | undefined, start: string, end: string) {
  return !!date && date >= start && date <= end
}

function gapLabel(used: number, capacity: number) {
  const gap = capacity - used
  if (capacity <= 0 && used <= 0) return 'Sin hueco'
  if (gap >= 0) return `${minToHM(gap)} libre`
  return `${minToHM(Math.abs(gap))} de más`
}

function pctText(pct: number | null) {
  return pct == null ? '—' : `${pct}%`
}

function rankLabel(t: Tarea): string {
  if (isRoutineType(t.tipo)) return t.tipo
  if (!isWorkType(t.tipo) || t.prioridad_orden == null) return t.tipo
  return `${TYPE_PREFIX[canonicalTipo(t.tipo)] || t.tipo.slice(0, 2).toUpperCase()} #${t.prioridad_orden}`
}

function isCasaTask(t: Tarea, frozen?: FrozenTasks | null) {
  const meta = frozen?.[String(t.id)]
  if (meta) return meta.casa
  return t.para_casa === true
}

function weekDateOf(t: Tarea, frozen?: FrozenTasks | null): string | null {
  const meta = frozen?.[String(t.id)]
  if (meta) return meta.date
  if (isCasaTask(t)) return t.fecha_casa || null
  return planningDate(t)
}

function livePlanOrCasaDate(t: Tarea): string | null {
  if (t.para_casa === true || t.fecha_casa) return t.fecha_casa || null
  return t.fecha_planificada || null
}

function budgetFateOf(t: Tarea | undefined, weekStart: string, weekEnd: string): BudgetFate {
  if (!t) return 'missing'
  if (t.estado === 'Omitida') return 'omitida'
  if (isClosedTask(t)) return 'hecha'
  const live = livePlanOrCasaDate(t)
  if (live && live > weekEnd) return 'pospuesta'
  return 'pendiente'
}

function taskOnDate(t: Tarea, date: string, frozen?: FrozenTasks | null) {
  return weekDateOf(t, frozen) === date
}

function sortWeekTasks(a: Tarea, b: Tarea, frozen?: FrozenTasks | null) {
  const aClosed = isClosedTask(a)
  const bClosed = isClosedTask(b)
  if (aClosed !== bClosed) return aClosed ? 1 : -1
  const ad = weekDateOf(a, frozen) || a.fecha_finalizacion || ''
  const bd = weekDateOf(b, frozen) || b.fecha_finalizacion || ''
  if (ad !== bd) return ad.localeCompare(bd)
  const at = TYPE_ORDER[a.tipo] ?? 99
  const bt = TYPE_ORDER[b.tipo] ?? 99
  if (at !== bt) return at - bt
  return (a.prioridad_orden ?? 999999) - (b.prioridad_orden ?? 999999) || a.id - b.id
}

function sortListTasks(a: Tarea, b: Tarea, sort: ListSort, frozen?: FrozenTasks | null) {
  if (sort === 'tiempo') {
    const diff = (b.tiempo_estimado || 0) - (a.tiempo_estimado || 0)
    if (diff !== 0) return diff
  }
  return sortWeekTasks(a, b, frozen)
}

export default function Planificacion({ onEditTarea, refreshKey }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [lockedIds, setLockedIds] = useState<Set<number>>(new Set())
  const [capacityOverrides, setCapacityOverrides] = useState<Record<string, number>>({})
  const [casaCapacityOverrides, setCasaCapacityOverrides] = useState<Record<string, number>>({})
  const [futureRoutineReserveMinutes, setFutureRoutineReserveMinutes] = useState(120)
  const [weekOffset, setWeekOffset] = useState(0)
  const [listFilter, setListFilter] = useState<ListFilter>('faltan')
  const [listSort, setListSort] = useState<ListSort>('dia')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [budgetSnap, setBudgetSnap] = useState<WeekBudgetMap>({})
  const [loading, setLoading] = useState(true)
  const [closingBudget, setClosingBudget] = useState(false)
  const backfilledWeeks = useRef<Set<string>>(new Set())

  const today = useMemo(() => dateKey(new Date()), [])
  const todayDate = useMemo(() => new Date(`${today}T00:00:00`), [today])
  const isSunday = todayDate.getDay() === 0

  const weekStart = useMemo(() => dateKey(addDays(mondayOf(todayDate), weekOffset * 7)), [todayDate, weekOffset])
  const weekEnd = useMemo(() => dateKey(addDays(new Date(`${weekStart}T00:00:00`), 6)), [weekStart])
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => dateKey(addDays(new Date(`${weekStart}T00:00:00`), index))), [weekStart])

  const fetchTareas = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAllTareas<Tarea>(
        'id,tipo,tarea,estado,tiempo_estimado,deadline,fecha_solicitud,fecha_planificada,fecha_casa,fecha_finalizacion,prioridad_orden,done,para_casa,es_padre,parent_id,excluir_plan,excluida_fecha',
        query => query.order('deadline', { ascending: true })
      )
      setTareas(data)
    } catch (error) {
      console.error('Error cargando planificacion:', error)
      setTareas([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTareas() }, [fetchTareas])
  useEffect(() => { if (refreshKey && refreshKey > 0) fetchTareas() }, [refreshKey, fetchTareas])
  useEffect(() => { setSelectedDay(null) }, [weekOffset])

  useEffect(() => {
    const loadLocal = () => {
      try {
        const ids = JSON.parse(localStorage.getItem(LOCKED_KEY) || '[]') as number[]
        setLockedIds(new Set(ids.filter(id => Number.isFinite(id))))
      } catch {
        setLockedIds(new Set())
      }
      try {
        setCapacityOverrides(JSON.parse(localStorage.getItem(CAPACITY_KEY) || '{}'))
      } catch {
        setCapacityOverrides({})
      }
      try {
        setCasaCapacityOverrides(JSON.parse(localStorage.getItem(CASA_CAPACITY_OVERRIDES_KEY) || '{}'))
      } catch {
        setCasaCapacityOverrides({})
      }
      try {
        const parsed = parseInt(localStorage.getItem(FUTURE_ROUTINE_RESERVE_KEY) || '120', 10)
        setFutureRoutineReserveMinutes(Number.isFinite(parsed) ? Math.max(0, parsed) : 120)
      } catch {
        setFutureRoutineReserveMinutes(120)
      }
      try {
        const snap = JSON.parse(localStorage.getItem(WEEK_BUDGET_KEY) || '{}') as WeekBudgetMap
        if (snap && typeof snap === 'object' && !Array.isArray(snap)) setBudgetSnap(snap)
      } catch {
        setBudgetSnap({})
      }
    }

    loadLocal()
    void loadAppSetting<number[]>(LOCKED_KEY, []).then(ids => {
      setLockedIds(new Set(ids.filter(id => Number.isFinite(id))))
    })
    void loadAppSetting<Record<string, number>>(CAPACITY_KEY, {}).then(value => {
      setCapacityOverrides(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
    })
    void loadAppSetting<Record<string, number>>(CASA_CAPACITY_OVERRIDES_KEY, {}).then(value => {
      setCasaCapacityOverrides(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
    })
    void loadAppSetting<WeekBudgetMap>(WEEK_BUDGET_KEY, {}).then(value => {
      if (value && typeof value === 'object' && !Array.isArray(value)) setBudgetSnap(value)
    })
    const onStorage = () => loadLocal()
    window.addEventListener('storage', onStorage)
    window.addEventListener('gestor-capacity-updated', onStorage)
    window.addEventListener(CASA_CAPACITY_UPDATED_EVENT, onStorage)
    window.addEventListener(LOCKS_UPDATED_EVENT, onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('gestor-capacity-updated', onStorage)
      window.removeEventListener(CASA_CAPACITY_UPDATED_EVENT, onStorage)
      window.removeEventListener(LOCKS_UPDATED_EVENT, onStorage)
    }
  }, [])

  const workCapacityForDate = useCallback((date: string) => {
    return capacityOverrides[date] ?? defaultWorkCapacity(new Date(`${date}T00:00:00`))
  }, [capacityOverrides])

  const casaCapacityForDate = useCallback((date: string) => {
    return casaCapacityOverrides[date] ?? defaultCasaCapacity(new Date(`${date}T00:00:00`))
  }, [casaCapacityOverrides])

  const parentById = useMemo(() => {
    const map = new Map<number, Tarea>()
    tareas.forEach(t => {
      if (t.es_padre === true) map.set(t.id, t)
    })
    return map
  }, [tareas])
  const budgetLeaves = useMemo(() => tareas.filter(t => t.es_padre !== true), [tareas])
  const leaves = useMemo(() => budgetLeaves.filter(t => !isAparcada(t)), [budgetLeaves])
  const snap = budgetSnap[weekStart]
  const frozenIds = snap?.frozen ? new Set(snap.ids) : null
  const frozenTasks = snap?.frozen ? snap.tasks : undefined
  const budgetClosed = !!frozenIds

  const belongsToWeek = useCallback((t: Tarea, start: string, end: string) => {
    const parked = withInheritedCasa(t, parentById)
    const date = parked.para_casa === true ? parked.fecha_casa || null : planningDate(parked)
    if (isClosedTask(t)) return inRange(t.fecha_finalizacion, start, end) || inRange(date, start, end) || inRange(weekDateOf(t, frozenTasks), start, end)
    return inRange(date, start, end)
  }, [frozenTasks, parentById])

  const weekTasks = useMemo(() => {
    const source = frozenIds ? budgetLeaves : leaves
    const list = frozenIds
      ? source.filter(t => frozenIds.has(t.id))
      : source.filter(t => belongsToWeek(t, weekStart, weekEnd))
    return list.sort((a, b) => sortWeekTasks(a, b, frozenTasks))
  }, [belongsToWeek, budgetLeaves, frozenIds, frozenTasks, leaves, weekEnd, weekStart])

  const fateOf = useCallback((t: Tarea) => budgetFateOf(withInheritedCasa(t, parentById), weekStart, weekEnd), [parentById, weekEnd, weekStart])

  const pendientes = weekTasks.filter(t => fateOf(t) === 'pendiente')
  const hechas = weekTasks.filter(t => fateOf(t) === 'hecha')
  const omitidas = weekTasks.filter(t => fateOf(t) === 'omitida')
  const pospuestas = useMemo(() => {
    if (frozenIds) {
      const inList = new Set(weekTasks.map(t => t.id))
      const fromList = weekTasks.filter(t => fateOf(t) === 'pospuesta')
      const missing = leaves.filter(t => frozenIds.has(t.id) && !inList.has(t.id) && fateOf(t) === 'pospuesta')
      return [...fromList, ...missing].sort((a, b) => sortWeekTasks(a, b, frozenTasks))
    }
    return weekTasks.filter(t => fateOf(t) === 'pospuesta')
  }, [fateOf, frozenIds, frozenTasks, leaves, weekTasks])

  const faltan = pendientes
  const total = frozenIds ? frozenIds.size : weekTasks.length
  const faltanMin = pendientes.reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)

  const weekIdKey = useMemo(() => weekTasks.map(t => t.id).sort((a, b) => a - b).join(','), [weekTasks])

  const plannedStats = useMemo(() => {
    if (!frozenIds) return null
    const byId = new Map(budgetLeaves.map(t => [t.id, t]))
    let done = 0
    let doneMin = 0
    let omitted = 0
    let omittedMin = 0
    let left = 0
    let leftMin = 0
    let postponed = 0
    let postponedMin = 0
    frozenIds.forEach(id => {
      const raw = byId.get(id)
      const t = raw ? withInheritedCasa(raw, parentById) : raw
      const min = t?.tiempo_estimado || 0
      const fate = budgetFateOf(t, weekStart, weekEnd)
      if (fate === 'omitida') {
        omitted += 1
        omittedMin += min
        return
      }
      if (fate === 'hecha') {
        done += 1
        doneMin += min
        return
      }
      if (fate === 'pospuesta') {
        postponed += 1
        postponedMin += min
        return
      }
      left += 1
      leftMin += min
    })
    const totalPlanned = frozenIds.size
    return {
      total: totalPlanned,
      done,
      doneMin,
      omitted,
      omittedMin,
      left,
      leftMin,
      postponed,
      postponedMin,
      pct: totalPlanned > 0 ? Math.round((done / totalPlanned) * 100) : 0,
    }
  }, [budgetLeaves, frozenIds, parentById, weekEnd, weekStart])

  const pendingWork = pendientes.filter(t => !isCasaTask(t, frozenTasks))
  const pendingCasa = pendientes.filter(t => isCasaTask(t, frozenTasks))
  const pendingWorkMin = pendingWork.reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
  const pendingCasaMin = pendingCasa.reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)

  const tasksById = useMemo(() => new Map(leaves.map(t => [t.id, t])), [leaves])
  const recoveredLoad = useMemo(() => {
    if (!frozenIds) return null
    return closedLoadFromIds(
      [...frozenIds],
      tasksById,
      days,
      weekStart,
      workCapacityForDate,
      casaCapacityForDate,
      futureRoutineReserveMinutes,
      frozenTasks,
    )
  }, [casaCapacityForDate, days, frozenIds, frozenTasks, futureRoutineReserveMinutes, tasksById, weekStart, workCapacityForDate])

  const previewLoad = useMemo(() => closedLoadFromIds(
    weekTasks.map(t => t.id),
    tasksById,
    days,
    weekStart,
    workCapacityForDate,
    casaCapacityForDate,
    futureRoutineReserveMinutes,
    frozenTasks,
  ), [casaCapacityForDate, days, frozenTasks, futureRoutineReserveMinutes, tasksById, weekStart, weekTasks, workCapacityForDate])

  const closedDays = useMemo(() => {
    if (!frozenIds) return null
    return closedDaysFromIds([...frozenIds], tasksById, days, frozenTasks)
  }, [days, frozenIds, frozenTasks, tasksById])

  const savedPhoto = hasPlanLoadPhoto(snap)
  const closedLoad = savedPhoto
    ? { workUsed: snap.workUsed, casaUsed: snap.casaUsed, workCapacity: snap.workCapacity, casaCapacity: snap.casaCapacity }
    : recoveredLoad
  const loadPhoto = !!closedLoad

  const remainingDates = days.filter(date => date > today)
  const remainWorkDays = remainingDates.filter(date => workCapacityForDate(date) > 0).length
  const remainWorkCap = remainingDates.reduce((sum, date) => sum + workCapacityForDate(date), 0)
  const remainCasaCap = remainingDates.reduce((sum, date) => sum + casaCapacityForDate(date), 0)
  const remainUsed = pendingWorkMin + pendingCasaMin
  const remainCap = remainWorkCap + remainCasaCap
  const remainWorkStatus = loadStatus(pendingWorkMin, remainWorkCap)
  const remainCasaStatus = loadStatus(pendingCasaMin, remainCasaCap)
  const remainTotalStatus = loadStatus(remainUsed, remainCap)
  const remainWorkPct = pctOf(pendingWorkMin, remainWorkCap)
  const remainCasaPct = pctOf(pendingCasaMin, remainCasaCap)
  const remainPct = pctOf(remainUsed, remainCap)

  const workUsed = loadPhoto && closedLoad ? closedLoad.workUsed : previewLoad.workUsed
  const casaUsed = loadPhoto && closedLoad ? closedLoad.casaUsed : previewLoad.casaUsed
  const workCapacity = loadPhoto && closedLoad ? closedLoad.workCapacity : previewLoad.workCapacity
  const casaCapacity = loadPhoto && closedLoad ? closedLoad.casaCapacity : previewLoad.casaCapacity

  useEffect(() => {
    if (loading || !snap?.frozen || !recoveredLoad || hasPlanLoadPhoto(snap) || backfilledWeeks.current.has(weekStart)) return
    backfilledWeeks.current.add(weekStart)
    let cancelled = false
    void (async () => {
      const map = await loadAppSetting<WeekBudgetMap>(WEEK_BUDGET_KEY, {})
      if (cancelled) return
      const current = map[weekStart] || snap
      if (!current?.frozen || hasPlanLoadPhoto(current)) {
        setBudgetSnap(map)
        return
      }
      const next: WeekBudgetMap = {
        ...map,
        [weekStart]: { ...current, ...recoveredLoad, loadFromIds: true },
      }
      setBudgetSnap(next)
      await saveAppSetting(WEEK_BUDGET_KEY, next)
    })()
    return () => { cancelled = true }
  }, [loading, recoveredLoad, snap, weekStart])

  async function closeBudget() {
    if (closingBudget) return
    if (weekEnd < today) {
      alert('Esta semana ya pasó. El budget se fija el domingo o durante la propia semana.')
      return
    }
    const ids = budgetClosed && snap?.ids?.length
      ? snap.ids
      : (weekIdKey ? weekIdKey.split(',').map(Number).filter(Number.isFinite) : [])
    if (ids.length === 0) {
      alert('No hay tareas en esta semana para fijar.')
      return
    }
    const photo = closedLoadFromIds(ids, tasksById, days, weekStart, workCapacityForDate, casaCapacityForDate, futureRoutineReserveMinutes)
    const confirmText = `¿Fijar el budget de ${shortDate(weekStart)} — ${shortDate(weekEnd)}?\n\n${ids.length} tareas · ${minToHM(photo.workUsed + photo.casaUsed)} / ${minToHM(photo.workCapacity + photo.casaCapacity)}.\nSemana solo seguirá este set: hechas, omitidas, pospuestas y pendientes.`
    if (!confirm(confirmText)) return
    setClosingBudget(true)
    const map = await loadAppSetting<WeekBudgetMap>(WEEK_BUDGET_KEY, {})
    const next: WeekBudgetMap = {
      ...map,
      [weekStart]: { ids, frozen: true, ...photo, loadFromIds: true, tasks: snapshotFrozenTasks(ids, tasksById), closedAt: new Date().toISOString() },
    }
    setBudgetSnap(next)
    await saveAppSetting(WEEK_BUDGET_KEY, next)
    setClosingBudget(false)
  }

  const dayScopeTasks = useMemo(() => {
    if (!selectedDay) return weekTasks
    return weekTasks.filter(t => taskOnDate(t, selectedDay, frozenTasks))
  }, [frozenTasks, selectedDay, weekTasks])

  const scopedWeekTasks = selectedDay ? dayScopeTasks : weekTasks

  const scopedFateCounts = useMemo(() => {
    const counts = { pendiente: 0, hecha: 0, omitida: 0, pospuesta: 0, pendienteMin: 0, hechaMin: 0, omitidaMin: 0, pospuestaMin: 0, total: 0 }
    scopedWeekTasks.forEach(t => {
      const fate = fateOf(t)
      if (fate === 'missing') return
      counts.total += 1
      counts[fate] += 1
      if (fate === 'pendiente') counts.pendienteMin += t.tiempo_estimado || 0
      if (fate === 'hecha') counts.hechaMin += t.tiempo_estimado || 0
      if (fate === 'omitida') counts.omitidaMin += t.tiempo_estimado || 0
      if (fate === 'pospuesta') counts.pospuestaMin += t.tiempo_estimado || 0
    })
    return counts
  }, [fateOf, scopedWeekTasks])

  const visibleWeekTasks = useMemo(
    () => scopedWeekTasks.filter(t => {
      const fate = fateOf(t)
      if (listFilter === 'faltan') return fate === 'pendiente'
      if (listFilter === 'hechas') return fate === 'hecha'
      if (listFilter === 'omitidas') return fate === 'omitida'
      if (listFilter === 'pospuestas') return fate === 'pospuesta'
      return true
    }).sort((a, b) => sortListTasks(a, b, listSort, frozenTasks)),
    [fateOf, frozenTasks, listFilter, listSort, scopedWeekTasks]
  )

  const listSections = useMemo(() => {
    const groups: { key: ListFilter, title: string, hint: string, fate: BudgetFate }[] = [
      { key: 'faltan', title: 'Pendientes', hint: 'Siguen en el budget de esta semana', fate: 'pendiente' },
      { key: 'hechas', title: 'Hechas', hint: 'En el día planificado, aunque las terminarás otro', fate: 'hecha' },
      { key: 'omitidas', title: 'Omitidas', hint: 'No las vas a hacer', fate: 'omitida' },
      { key: 'pospuestas', title: 'Pospuestas', hint: 'Fecha en otra semana', fate: 'pospuesta' },
    ]
    const wanted = listFilter === 'todas' ? groups : groups.filter(group => group.key === listFilter)
    return wanted
      .map(group => ({
        ...group,
        tasks: visibleWeekTasks.filter(t => fateOf(t) === group.fate),
      }))
      .filter(section => section.tasks.length > 0)
  }, [fateOf, listFilter, visibleWeekTasks])

  const canActOnBudget = weekEnd >= today
  const visibleCount = listSections.reduce((sum, section) => sum + section.tasks.length, 0)

  const carryover = faltan.filter(t => {
    const date = weekDateOf(t, frozenTasks)
    return !!date && date < today && date >= weekStart
  })
  const carryoverMin = carryover.reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
  const carryoverDayLabels = [...new Set(carryover.map(t => weekDateOf(t, frozenTasks)).filter((date): date is string => !!date))]
    .sort()
    .map(date => WEEKDAYS[(new Date(`${date}T00:00:00`).getDay() + 6) % 7].toLowerCase())

  const weekStatus = loadStatus(workUsed, workCapacity)
  const casaStatus = loadStatus(casaUsed, casaCapacity)
  const totalUsed = workUsed + casaUsed
  const totalCapacity = workCapacity + casaCapacity
  const totalStatus = loadStatus(totalUsed, totalCapacity)
  const workPct = pctOf(workUsed, workCapacity)
  const casaPct = pctOf(casaUsed, casaCapacity)
  const totalPct = pctOf(totalUsed, totalCapacity)
  const tightness = loadPhoto ? tightnessOf(remainPct, totalPct) : null
  const weekTitle = weekOffset === 0
    ? (isSunday ? 'Semana que cierra' : 'Esta semana')
    : weekOffset === 1 ? 'Próxima semana' : weekOffset === -1 ? 'Semana pasada' : `Semana ${weekOffset > 0 ? '+' : ''}${weekOffset}`
  const daysLeftLabel = remainWorkDays === 0 ? 'sin días por delante' : remainWorkDays === 1 ? '1 día por delante' : `${remainWorkDays} días por delante`
  const tightnessClass = tightness?.tone === 'red' ? 'text-red-500' : tightness?.tone === 'green' ? 'text-emerald-600' : 'text-gray-700'
  const closedAtLabel = formatClosedAt(snap?.closedAt)

  if (loading) {
    return <div className="border border-gray-100 rounded-xl py-16 text-center text-gray-300 text-sm">Cargando planificacion...</div>
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Semana</h2>
            <p className="mt-1 text-xs text-gray-400">
              {isSunday && weekOffset === 0
                ? 'Domingo: cierra esta semana. Hechas, pendientes, omitidas y pospuestas, trabajo y casa. Luego fija el cubo de la próxima.'
                : isSunday && weekOffset === 1
                  ? 'Fija el cubo de la semana que entra. Semana solo seguirá ese set.'
                  : loadPhoto
                    ? 'Foto del domingo. Solo ese set: hechas, omitidas, pospuestas y pendientes. Pulsa un día para ver trabajo y casa.'
                    : 'El domingo fijas el cubo. Durante la semana Semana es el marcador de ese set, sin añadidas.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <button type="button" onClick={() => setWeekOffset(v => v - 1)} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">←</button>
            {[
              { offset: 0, label: 'Esta' },
              { offset: 1, label: 'Próxima' },
            ].map(option => (
              <button
                key={option.label}
                type="button"
                onClick={() => setWeekOffset(option.offset)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${weekOffset === option.offset ? 'border-gray-900 text-gray-900' : 'border-gray-200 text-gray-400 hover:text-gray-700'}`}>
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setWeekOffset(-1)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold border ${weekOffset === -1 ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-300 hover:text-gray-500'}`}>
              Pasada
            </button>
            <button type="button" onClick={() => setWeekOffset(v => v + 1)} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">→</button>
          </div>
        </div>

        <div className="px-6 py-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-300">{weekTitle}</div>
            <div className="text-lg font-black text-gray-900">{shortDate(weekStart)} — {shortDate(weekEnd)}</div>
          </div>
          {budgetClosed && plannedStats && (
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Budget fijado</div>
              {closedAtLabel && (
                <div className="mt-0.5 text-sm font-black text-gray-900">{closedAtLabel}</div>
              )}
              <div className="mt-0.5 text-xs font-semibold text-gray-500">
                {plannedStats.total} tareas · {totalPct == null ? '—' : `${totalPct}%`}
              </div>
            </div>
          )}
        </div>

        {isSunday && weekOffset === 0 && (
          <div className="mx-5 mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-black text-gray-900">Cerrar la semana</div>
              <div className="mt-0.5 text-xs text-gray-500">
                Mira cuántas has hecho y cuántas dejas. Trabajo y casa van aparte. Cuando termines, fija el cubo de la próxima.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWeekOffset(1)}
              className="shrink-0 rounded-xl bg-gray-900 px-5 py-3 text-sm font-black text-white hover:bg-gray-700">
              Fijar próxima
            </button>
          </div>
        )}

        {canActOnBudget && !(isSunday && weekOffset === 0) && (
          <div className={`mx-5 mb-4 flex flex-col gap-3 rounded-xl px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${budgetClosed ? 'border-2 border-gray-900 bg-white' : 'bg-gray-900 text-white'}`}>
            <div className="min-w-0">
              <div className={`text-sm font-black ${budgetClosed ? 'text-gray-900' : 'text-white'}`}>
                Fijar cubo
              </div>
              <div className={`mt-0.5 text-xs ${budgetClosed ? 'text-gray-500' : 'text-white/70'}`}>
                {budgetClosed
                  ? closedAtLabel
                    ? `Fijado el ${closedAtLabel}. Si pulsas, actualiza Casa y día de cada tarea según están ahora.`
                    : 'Semana ya mira este set. Si pulsas, actualiza Casa y día de cada tarea según están ahora.'
                  : isSunday && weekOffset === 1
                    ? 'Congela las tareas de la semana que entra: hechas, omitidas, pospuestas y pendientes.'
                    : 'Sin esto Semana no congela el set. Fija las tareas de esta semana: hechas, omitidas, pospuestas y pendientes.'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void closeBudget()}
              disabled={closingBudget}
              className={`shrink-0 rounded-xl px-5 py-3 text-sm font-black disabled:opacity-40 ${budgetClosed ? 'bg-gray-900 text-white hover:bg-gray-700' : 'bg-white text-gray-900 hover:bg-gray-100'}`}>
              {closingBudget ? 'Fijando...' : 'Fijar cubo'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 px-5 pb-5">
          <div className={`rounded-lg border ${totalStatus.border} ${totalStatus.bg} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">Budget</div>
                <div className="text-[10px] font-semibold text-gray-300">{loadPhoto ? (closedAtLabel ? `Foto ${closedAtLabel}` : 'Foto al fijar') : 'Plan actual'}</div>
              </div>
              <div className={`text-sm font-black ${totalStatus.color}`}>{totalPct == null ? '—' : `${totalPct}%`}</div>
            </div>
            <div className="mt-3 space-y-2.5">
              {[
                { label: 'Trabajo', used: workUsed, cap: workCapacity, pct: workPct, status: weekStatus },
                { label: 'Casa', used: casaUsed, cap: casaCapacity, pct: casaPct, status: casaStatus },
                { label: 'Total', used: totalUsed, cap: totalCapacity, pct: totalPct, status: totalStatus },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-semibold text-gray-500">{row.label}</span>
                    <span className={`font-bold tabular-nums ${row.status.color}`}>
                      {minToHM(row.used)} / {minToHM(row.cap)} · {row.pct == null ? '—' : `${row.pct}%`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full ${row.status.bar}`} style={{ width: `${Math.min(100, row.pct || 0)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs font-semibold text-gray-500">{gapLabel(totalUsed, totalCapacity)} al {loadPhoto ? 'fijar' : 'plan'}</div>
          </div>

          {plannedStats ? (
            <div className={`rounded-lg border p-4 ${plannedStats.left || carryover.length ? 'border-amber-200 bg-amber-50/40' : plannedStats.postponed ? 'border-red-100 bg-red-50/30' : 'border-emerald-100 bg-emerald-50/40'}`}>
              <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">{isSunday && weekOffset === 0 ? 'Cierre' : 'Cómo vamos'}</div>
              <div className={`mt-2 text-xl font-black ${plannedStats.left ? 'text-amber-600' : plannedStats.postponed ? 'text-red-500' : 'text-emerald-600'}`}>
                {plannedStats.done}
                <span className="text-base font-bold text-gray-300"> / {plannedStats.total} hechas</span>
              </div>
              <div className="text-xs text-gray-400">{plannedStats.pct}% del budget · {minToHM(plannedStats.doneMin)}</div>
              <div className="mt-3 space-y-1 text-xs font-semibold">
                <div className="flex justify-between gap-3">
                  <span className="text-amber-600">Pendientes</span>
                  <span className="tabular-nums text-gray-700">{plannedStats.left} · {minToHM(plannedStats.leftMin)}</span>
                </div>
                {carryover.length > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-red-500">Arrastre {carryoverDayLabels.join(', ')}</span>
                    <span className="tabular-nums text-gray-700">{carryover.length} · {minToHM(carryoverMin)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-gray-400">Omitidas</span>
                  <span className="tabular-nums text-gray-700">{plannedStats.omitted} · {minToHM(plannedStats.omittedMin)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-red-500">Pospuestas</span>
                  <span className="tabular-nums text-gray-700">{plannedStats.postponed} · {minToHM(plannedStats.postponedMin)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className={`rounded-lg border p-4 ${faltan.length ? 'border-amber-200 bg-amber-50/40' : 'border-emerald-100 bg-emerald-50/40'}`}>
              <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">{isSunday && weekOffset === 0 ? 'Cierre' : 'Cómo vamos'}</div>
              <div className={`mt-2 text-xl font-black ${faltan.length ? 'text-amber-600' : 'text-emerald-600'}`}>{hechas.length}<span className="text-base font-bold text-gray-300"> / {total || 0} hechas</span></div>
              <div className="text-xs text-gray-400">{minToHM(faltanMin)} pendientes · {omitidas.length} omit. Fija el budget el domingo.</div>
              {carryover.length > 0 && (
                <div className="mt-3 text-xs font-semibold text-red-500">Arrastre {carryoverDayLabels.join(', ')}: {carryover.length} · {minToHM(carryoverMin)}</div>
              )}
            </div>
          )}

          <div className={`rounded-lg border p-4 ${remainTotalStatus.border} ${remainTotalStatus.bg}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">Previsión</div>
                <div className="text-[10px] font-semibold text-gray-300">pendiente del budget / capacidad desde mañana · hoy no cuenta</div>
              </div>
              <div className={`text-sm font-black ${remainTotalStatus.color}`}>{remainPct == null ? '—' : `${remainPct}%`}</div>
            </div>
            <div className="mt-3 space-y-2.5">
              {[
                { label: 'Trabajo', used: pendingWorkMin, cap: remainWorkCap, pct: remainWorkPct, status: remainWorkStatus },
                { label: 'Casa', used: pendingCasaMin, cap: remainCasaCap, pct: remainCasaPct, status: remainCasaStatus },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-semibold text-gray-500">{row.label}</span>
                    <span className={`font-bold tabular-nums ${row.status.color}`}>
                      {minToHM(row.used)} / {minToHM(row.cap)} · {row.pct == null ? '—' : `${row.pct}%`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full ${row.status.bar}`} style={{ width: `${Math.min(100, row.pct || 0)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className={`mt-3 text-sm font-black ${tightnessClass}`}>
              {tightness ? tightness.label : gapLabel(remainUsed, remainCap)}
            </div>
            <div className="text-xs text-gray-400">
              {tightness
                ? `${tightness.hint}. Si no da, pospón a otra semana.`
                : `${gapLabel(remainUsed, remainCap)} en ${daysLeftLabel}`}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-300">Días</div>
            <div className="mt-0.5 text-[10px] text-gray-400">
              Carga del budget frente a capacidad. Pulsa un día para filtrar el listado.
            </div>
          </div>
          {selectedDay && (
            <button type="button" onClick={() => setSelectedDay(null)} className="text-[10px] font-bold text-gray-400 hover:text-gray-700">
              Ver toda la semana
            </button>
          )}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map(date => {
            const weekdayIndex = (new Date(`${date}T00:00:00`).getDay() + 6) % 7
            const workCap = workCapacityForDate(date)
            const casaCap = casaCapacityForDate(date)
            const liveWork = pendingWork.filter(t => weekDateOf(t, frozenTasks) === date).reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
            const liveCasa = pendingCasa.filter(t => weekDateOf(t, frozenTasks) === date).reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
            const planned = closedDays?.[date]
            const workMin = planned ? planned.work : liveWork
            const casaMin = planned ? planned.casa : liveCasa
            const dayTotal = workMin + casaMin
            const dayDen = workCap + casaCap
            const workPctDay = pctOf(workMin, workCap)
            const casaPctDay = pctOf(casaMin, casaCap)
            const totalPctDay = pctOf(dayTotal, dayDen)
            const totalSt = loadStatus(dayTotal, dayDen)
            const workColor = loadStatus(workMin, workCap).color
            const casaColor = loadStatus(casaMin, casaCap).color
            const dayTasks = weekTasks.filter(t => taskOnDate(t, date, frozenTasks))
            const dayPending = dayTasks.filter(t => fateOf(t) === 'pendiente').length
            const dayDone = dayTasks.filter(t => fateOf(t) === 'hecha').length
            const dayOmitted = dayTasks.filter(t => fateOf(t) === 'omitida').length
            const dayPostponed = dayTasks.filter(t => fateOf(t) === 'pospuesta').length
            const leftover = date < today && dayPending > 0
            const isToday = date === today
            const isSelected = selectedDay === date
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDay(current => current === date ? null : date)}
                className={`min-h-[148px] rounded-lg border p-3 text-left transition ${isSelected ? 'border-gray-900 ring-1 ring-gray-900' : leftover ? 'border-red-200' : isToday ? 'border-gray-900' : totalSt.border} ${leftover ? 'bg-red-50/40' : totalSt.bg}`}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-300">{WEEKDAYS[weekdayIndex]}</div>
                <div className="text-sm font-black text-gray-900">{shortDate(date)}</div>
                <div className="mt-2 space-y-0.5 text-[10px] tabular-nums">
                  <div className={`flex justify-between gap-1 ${workColor}`}>
                    <span>Trabajo {minToHM(workMin)} / {minToHM(workCap)}</span>
                    <span className="font-bold">{pctText(workPctDay)}</span>
                  </div>
                  <div className={`flex justify-between gap-1 ${casaColor}`}>
                    <span>Casa {minToHM(casaMin)} / {minToHM(casaCap)}</span>
                    <span className="font-bold">{pctText(casaPctDay)}</span>
                  </div>
                  <div className={`flex justify-between gap-1 font-semibold ${totalSt.color}`}>
                    <span>Total {minToHM(dayTotal)} / {minToHM(dayDen)}</span>
                    <span>{pctText(totalPctDay)}</span>
                  </div>
                </div>
                <div className={`mt-2 text-[10px] font-semibold ${leftover ? 'text-red-500' : 'text-gray-400'}`}>
                  {leftover ? `Quedan ${dayPending}` : `${dayDone} hechas`}
                  {dayPending > 0 && !leftover ? ` · ${dayPending} pte.` : ''}
                  {dayOmitted > 0 ? ` · ${dayOmitted} omit.` : ''}
                  {dayPostponed > 0 ? ` · ${dayPostponed} posp.` : ''}
                </div>
              </button>
            )
          })}
        </div>
        {selectedDay && (
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-600">Había {scopedFateCounts.total}</span>
            <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">Pendientes {scopedFateCounts.pendiente} · {minToHM(scopedFateCounts.pendienteMin)}</span>
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">Hechas {scopedFateCounts.hecha} · {minToHM(scopedFateCounts.hechaMin)}</span>
            <span className="rounded-md bg-gray-50 px-2 py-1 text-gray-500">Omitidas {scopedFateCounts.omitida} · {minToHM(scopedFateCounts.omitidaMin)}</span>
            <span className="rounded-md bg-red-50 px-2 py-1 text-red-600">Pospuestas {scopedFateCounts.pospuesta} · {minToHM(scopedFateCounts.pospuestaMin)}</span>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-gray-900">{selectedDay ? `Listado · ${shortDate(selectedDay)}` : 'Listado de la semana'}</div>
            <div className="text-xs text-gray-400">
              {selectedDay
                ? `Había ${scopedFateCounts.total}: ${scopedFateCounts.pendiente} pte. · ${scopedFateCounts.hecha} hechas · ${scopedFateCounts.omitida} omit. · ${scopedFateCounts.pospuesta} posp.`
                : plannedStats
                  ? `Del budget: ${plannedStats.done} hechas · ${plannedStats.left} pendientes · ${plannedStats.omitted} omitidas · ${plannedStats.postponed} pospuestas.`
                  : `${total} en el plan. Fija el budget el domingo para congelar la foto.`}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              {([
                { key: 'dia' as const, label: 'Día' },
                { key: 'tiempo' as const, label: 'Tiempo' },
              ]).map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setListSort(option.key)}
                  title={option.key === 'tiempo' ? 'Las más largas primero, para ver cuál sacar' : 'Por día, como está planificado'}
                  className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold ${listSort === option.key ? 'border-gray-900 text-gray-900' : 'border-gray-100 text-gray-400 hover:text-gray-700'}`}>
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
            {([
              { key: 'faltan' as const, label: 'Pendientes', count: selectedDay ? scopedFateCounts.pendiente : faltan.length },
              { key: 'hechas' as const, label: 'Hechas', count: selectedDay ? scopedFateCounts.hecha : hechas.length },
              { key: 'omitidas' as const, label: 'Omitidas', count: selectedDay ? scopedFateCounts.omitida : omitidas.length },
              { key: 'pospuestas' as const, label: 'Pospuestas', count: selectedDay ? scopedFateCounts.pospuesta : pospuestas.length },
              { key: 'todas' as const, label: 'Todas', count: selectedDay ? scopedFateCounts.total : total },
            ]).map(option => (
              <button
                key={option.key}
                type="button"
                onClick={() => setListFilter(option.key)}
                className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold ${listFilter === option.key ? 'border-gray-900 text-gray-900' : 'border-gray-100 text-gray-400 hover:text-gray-700'}`}>
                {option.label} {option.count}
              </button>
            ))}
            </div>
          </div>
        </div>
        <div className="p-4 space-y-5">
          {visibleCount === 0 ? (
            <div className="py-10 text-center text-sm text-gray-300">
              {listFilter === 'faltan' ? (selectedDay ? 'Nada pendiente este día.' : 'Nada pendiente esta semana.') : 'Nada en este filtro.'}
            </div>
          ) : listSections.map(section => (
            <div key={section.key} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{section.title} {section.tasks.length}</div>
                <div className="text-[10px] text-gray-300">{section.hint}</div>
              </div>
              {section.tasks.map(task => {
                const fate = fateOf(task)
                const chip = fate === 'missing' ? null : FATE_CHIP[fate]
                const plannedDate = weekDateOf(task, frozenTasks)
                const leftover = fate === 'pendiente' && !!plannedDate && plannedDate < today && plannedDate >= weekStart
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                      fate === 'pospuesta'
                        ? 'border-red-100 bg-red-50/30'
                        : fate === 'omitida'
                          ? 'border-gray-100 bg-gray-50/60'
                          : fate === 'hecha'
                            ? 'border-emerald-100 bg-emerald-50/40'
                            : leftover
                              ? 'border-red-100 bg-red-50/20'
                              : 'border-gray-100 bg-white'
                    }`}>
                    <button type="button" onClick={() => onEditTarea?.(task.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-2 w-2 rounded-full ${TIPO_DOT[task.tipo] || 'bg-gray-300'}`} />
                        <span className={`truncate text-sm font-semibold ${fate === 'hecha' || fate === 'omitida' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{task.tarea}</span>
                        {isCasaTask(task, frozenTasks) && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Casa</span>}
                        {chip && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${chip.className}`}>{chip.label}</span>}
                        {leftover && <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-500">Arrastre</span>}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {rankLabel(task)} · plan {fDate(plannedDate)}
                        {fate === 'hecha' && task.fecha_finalizacion ? ` · hecha ${fDate(task.fecha_finalizacion)}` : ''}
                        {fate === 'pospuesta' && livePlanOrCasaDate(withInheritedCasa(task, parentById)) ? ` · ahora ${fDate(livePlanOrCasaDate(withInheritedCasa(task, parentById)))}` : ''}
                      </div>
                    </button>
                    <div className="text-xs font-semibold text-gray-500">{minToHM(task.tiempo_estimado || 0)}</div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
