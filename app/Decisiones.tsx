'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchAllTareas } from '@/lib/supabaseTasks'
import { loadAppSetting, LOCKS_UPDATED_EVENT } from '@/lib/appSettings'
import {
  CAPACITY_KEY,
  FUTURE_ROUTINE_RESERVE_KEY,
  LOCKED_TASKS_KEY,
  addDays,
  dateKey,
  defaultCasaCapacity,
  defaultWorkCapacity,
  fDate,
  isClosedTask,
  isAparcada,
  isEvento,
  isImportedRoutine,
  isRoutineType,
  isWorkType,
  canonicalTipo,
  loadStatus,
  minToHM,
  planningDate,
  referenceDate,
  withInheritedCasa,
} from '@/lib/taskRules'
import { TIPO_DOT } from '@/lib/tipoColors'

type Tarea = {
  id: number
  tipo: string
  tarea: string
  estado: string
  tiempo_estimado: number
  fecha_solicitud?: string | null
  deadline: string | null
  fecha_planificada?: string | null
  prioridad_orden?: number | null
  done: boolean
  excluir_plan?: boolean | null
  excluida_fecha?: string | null
  para_casa?: boolean | null
  fecha_casa?: string | null
  es_padre?: boolean | null
  parent_id?: number | null
  fragmento_num?: number | null
  fragmentos_total?: number | null
  es_fragmento?: boolean | null
}

type Props = {
  onEditTarea?: (id: number) => void
  refreshKey?: number
}

type DayRisk = {
  date: string
  used: number
  capacity: number
  tasks: Tarea[]
}

type RankedDecisionTask = {
  task: Tarea
  rank: number
}

const CASA_CAPACITY_OVERRIDES_KEY = 'casa_capacity_overrides'
const CASA_CAPACITY_EVENT = 'gestor-casa-capacity-updated'
const WORK_TYPES = ['Operativa', 'Táctica', 'Estratégica']
const TYPE_PREFIX: Record<string, string> = { Operativa: 'OP', Táctica: 'TA', Estratégica: 'ES' }
const TYPE_DOT = TIPO_DOT

function isClosed(t: Tarea) {
  return isClosedTask(t)
}

function daysBetween(from: string, to: string) {
  return Math.floor((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000)
}

function sortByPressure(a: Tarea, b: Tarea) {
  const ad = referenceDate(a) || '9999-99-99'
  const bd = referenceDate(b) || '9999-99-99'
  if (ad !== bd) return ad.localeCompare(bd)
  const ar = a.prioridad_orden ?? 999999
  const br = b.prioridad_orden ?? 999999
  if (ar !== br) return ar - br
  return a.id - b.id
}

function rankLabel(t: Tarea, rankOverride?: number) {
  if (!isWorkType(t.tipo)) return ''
  return `${TYPE_PREFIX[t.tipo] || t.tipo.slice(0, 2).toUpperCase()} #${rankOverride ?? t.prioridad_orden ?? '-'}`
}

function parentTitleFromFragment(t: Tarea): string {
  return t.tarea.replace(/\s*[·-]\s*parte\s+\d+\s*\/\s*\d+\s*$/i, '').trim()
}

function displayParentFromChildren(parent: Tarea | null | undefined, children: Tarea[]): Tarea {
  const first = children[0]
  const sorted = [...children].sort((a, b) => {
    const an = a.fragmento_num ?? 999999
    const bn = b.fragmento_num ?? 999999
    if (an !== bn) return an - bn
    return a.id - b.id
  })
  const latestPlanned = sorted
    .map(child => child.fecha_planificada)
    .filter((value): value is string => !!value)
    .sort()
    .at(-1)
  const latestDeadline = sorted
    .map(child => child.deadline)
    .filter((value): value is string => !!value)
    .sort()
    .at(-1)
  const base = parent || first

  return {
    ...base,
    id: parent?.id || first.parent_id || first.id,
    tarea: parent?.tarea || parentTitleFromFragment(first),
    tiempo_estimado: sorted.reduce((sum, child) => sum + (child.tiempo_estimado || 0), 0),
    deadline: latestDeadline || base.deadline,
    fecha_planificada: latestPlanned || null,
    para_casa: children.some(child => child.para_casa === true) || base.para_casa,
    fecha_casa: sorted[sorted.length - 1]?.fecha_casa || base.fecha_casa,
    es_padre: true,
  }
}

function dateMetaLine(t: Tarea) {
  const parts = [
    `Sol. ${fDate(t.fecha_solicitud)}`,
    `DL ${fDate(t.deadline)}`,
    `Plan ${fDate(t.fecha_planificada)}`,
  ]
  if (t.para_casa === true || t.fecha_casa) parts.push(`Casa ${fDate(t.fecha_casa)}`)
  return parts.join(' - ')
}

function DecisionTask({ task, onEditTarea, detail, rank }: { task: Tarea, onEditTarea?: (id: number) => void, detail?: string, rank?: number }) {
  return (
    <button
      type="button"
      onClick={() => onEditTarea?.(task.id)}
      className="w-full rounded-xl border border-gray-100 bg-white px-4 py-3 text-left transition hover:border-gray-200 hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${TYPE_DOT[task.tipo] || 'bg-gray-300'}`} />
            {rankLabel(task, rank) && <span className="rounded-md bg-gray-900 px-2 py-0.5 text-[10px] font-bold text-white">{rankLabel(task, rank)}</span>}
            <span className="truncate text-sm font-semibold text-gray-900">{task.tarea}</span>
          </div>
          <div className="mt-1 text-xs text-gray-400">
            {canonicalTipo(task.tipo)} · {minToHM(task.tiempo_estimado || 0)} · {dateMetaLine(task)}
            {detail ? ` · ${detail}` : ''}
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-gray-400">Abrir</span>
      </div>
    </button>
  )
}

function DecisionSection({
  id,
  title,
  subtitle,
  count,
  tone = 'gray',
  children,
}: {
  id?: string
  title: string
  subtitle: string
  count: number | string
  tone?: 'red' | 'amber' | 'emerald' | 'gray' | 'orange'
  children: ReactNode
}) {
  const tones = {
    red: 'border-red-100 bg-red-50/40 text-red-500',
    amber: 'border-amber-100 bg-amber-50/50 text-amber-600',
    emerald: 'border-emerald-100 bg-emerald-50/50 text-emerald-600',
    gray: 'border-gray-100 bg-white text-gray-900',
    orange: 'border-orange-100 bg-orange-50/40 text-orange-700',
  }

  return (
    <section id={id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white scroll-mt-4">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <p className="mt-1 text-xs text-gray-400">{subtitle}</p>
        </div>
        <div className={`rounded-xl border px-3 py-1.5 text-sm font-bold ${tones[tone]}`}>{count}</div>
      </div>
      <div className="space-y-2 p-4">{children}</div>
    </section>
  )
}

function DayRiskList({
  days,
  expandedDay,
  setExpandedDay,
  keyPrefix,
  onEditTarea,
}: {
  days: DayRisk[]
  expandedDay: string | null
  setExpandedDay: (value: string | null) => void
  keyPrefix: string
  onEditTarea?: (id: number) => void
}) {
  if (days.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-300">No hay días críticos en el horizonte.</div>
  }

  return (
    <>
      {days.map(day => {
        const status = loadStatus(day.used, day.capacity)
        const loadPct = day.capacity > 0 ? Math.round((day.used / day.capacity) * 100) : null
        const excessPct = day.capacity > 0 ? Math.round(((day.used - day.capacity) / day.capacity) * 100) : null
        const key = `${keyPrefix}-${day.date}`
        const expanded = expandedDay === key
        const dayTasks = [...day.tasks].sort(sortByPressure)
        const taskMinutes = dayTasks.reduce((sum, task) => sum + (task.tiempo_estimado || 0), 0)
        const reserveMinutes = Math.max(0, day.used - taskMinutes)
        return (
          <div key={key} className={`rounded-xl border ${status.bg} ${status.border}`}>
            <button
              type="button"
              onClick={() => setExpandedDay(expanded ? null : key)}
              className="w-full px-4 py-3 text-left"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-gray-900">{fDate(day.date)}</div>
                  <div className={`mt-1 text-xs font-semibold ${status.text}`}>{status.label}{loadPct !== null ? ` · ${loadPct}%` : ''} · {dayTasks.length} {dayTasks.length === 1 ? 'tarea' : 'tareas'}</div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${status.text}`}>
                    {day.capacity <= 0
                      ? `${minToHM(day.used)} sin capacidad`
                      : `${minToHM(Math.max(0, day.used - day.capacity))} exceso · +${excessPct}%`}
                  </div>
                  <div className="text-xs text-gray-400">{minToHM(day.used)} / {minToHM(day.capacity)}</div>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full ${status.bar}`} style={{ width: `${day.capacity > 0 ? Math.min(100, loadPct || 0) : 100}%` }} />
              </div>
            </button>
            {expanded && (
              <div className="space-y-2 border-t border-white/60 px-4 py-3">
                {dayTasks.length ? dayTasks.map(task => (
                  <DecisionTask key={task.id} task={task} onEditTarea={onEditTarea} />
                )) : (
                  <div className="py-2 text-center text-xs text-gray-400">No hay tareas sueltas este día.</div>
                )}
                {reserveMinutes > 0 && (
                  <div className="rounded-lg border border-gray-100 bg-white/70 px-3 py-2 text-xs text-gray-500">
                    Previsión de rutinarias: {minToHM(reserveMinutes)}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

export default function Decisiones({ onEditTarea, refreshKey }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [lockedIds, setLockedIds] = useState<Set<number>>(new Set())
  const [capacityOverrides, setCapacityOverrides] = useState<Record<string, number>>({})
  const [casaCapacityOverrides, setCasaCapacityOverrides] = useState<Record<string, number>>({})
  const [futureRoutineReserveMinutes, setFutureRoutineReserveMinutes] = useState(120)
  const [loading, setLoading] = useState(true)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const today = useMemo(() => dateKey(new Date()), [])

  const loadLocalRules = useCallback(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCKED_TASKS_KEY) || '[]') as number[]
      setLockedIds(new Set(parsed.filter(id => Number.isFinite(id))))
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
  }, [])

  const fetchTareas = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAllTareas<Tarea>(
        'id,tipo,tarea,estado,tiempo_estimado,fecha_solicitud,deadline,fecha_planificada,prioridad_orden,done,para_casa,fecha_casa,es_padre,parent_id,fragmento_num,fragmentos_total,es_fragmento,excluir_plan,excluida_fecha',
        query => query.order('deadline', { ascending: true })
      )
      setTareas(data)
    } catch (error) {
      console.error('Error cargando decisiones:', error)
      setTareas([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadLocalRules()
    fetchTareas()
    void loadAppSetting<number[]>(LOCKED_TASKS_KEY, []).then(ids => {
      setLockedIds(new Set(ids.filter(id => Number.isFinite(id))))
    })
    void loadAppSetting<Record<string, number>>(CAPACITY_KEY, {}).then(value => {
      setCapacityOverrides(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
    })
  }, [fetchTareas, loadLocalRules])

  useEffect(() => { if (refreshKey && refreshKey > 0) fetchTareas() }, [refreshKey, fetchTareas])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if ([LOCKED_TASKS_KEY, CAPACITY_KEY, FUTURE_ROUTINE_RESERVE_KEY, CASA_CAPACITY_OVERRIDES_KEY].includes(event.key || '')) loadLocalRules()
    }
    const onLocalChange = () => loadLocalRules()
    window.addEventListener('storage', onStorage)
    window.addEventListener('gestor-capacity-updated', onLocalChange)
    window.addEventListener(CASA_CAPACITY_EVENT, onLocalChange)
    window.addEventListener(LOCKS_UPDATED_EVENT, onLocalChange)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('gestor-capacity-updated', onLocalChange)
      window.removeEventListener(CASA_CAPACITY_EVENT, onLocalChange)
      window.removeEventListener(LOCKS_UPDATED_EVENT, onLocalChange)
    }
  }, [loadLocalRules])

  const capacityForDate = useCallback((value: string) => {
    return capacityOverrides[value] ?? defaultWorkCapacity(new Date(`${value}T00:00:00`))
  }, [capacityOverrides])

  const casaCapacityForDate = useCallback((value: string) => {
    return casaCapacityOverrides[value] ?? defaultCasaCapacity(new Date(`${value}T00:00:00`))
  }, [casaCapacityOverrides])

  const parentById = useMemo(() => {
    const map = new Map<number, Tarea>()
    tareas.forEach(task => {
      if (task.es_padre === true) map.set(task.id, task)
    })
    return map
  }, [tareas])

  const activeTasks = useMemo(() => (
    tareas
      .filter(t => !isClosed(t) && t.es_padre !== true && !isAparcada(t) && !isEvento(t.tipo))
      .map(t => withInheritedCasa(t, parentById))
  ), [parentById, tareas])
  const workTasks = useMemo(() => activeTasks.filter(t => t.para_casa !== true), [activeTasks])
  const casaTasks = useMemo(() => activeTasks.filter(t => t.para_casa === true), [activeTasks])
  const rankedWorkTasks = useMemo(() => workTasks.filter(t => isWorkType(t.tipo)), [workTasks])

  const childrenByParent = useMemo(() => {
    const map = new Map<number, Tarea[]>()
    activeTasks.forEach(task => {
      if (!task.parent_id || task.es_fragmento !== true) return
      if (!map.has(task.parent_id)) map.set(task.parent_id, [])
      map.get(task.parent_id)!.push(task)
    })
    map.forEach(children => {
      children.sort((a, b) => {
        const an = a.fragmento_num ?? 999999
        const bn = b.fragmento_num ?? 999999
        if (an !== bn) return an - bn
        const ar = a.prioridad_orden ?? 999999
        const br = b.prioridad_orden ?? 999999
        return ar !== br ? ar - br : a.id - b.id
      })
    })
    return map
  }, [activeTasks])

  const rankedDecisionRows = useMemo<RankedDecisionTask[]>(() => {
    const rows: RankedDecisionTask[] = []

    WORK_TYPES.forEach(type => {
      const seenParents = new Set<number>()
      let rank = 0
      const ordered = rankedWorkTasks
        .filter(task => task.tipo === type && task.prioridad_orden != null)
        .sort((a, b) => {
          const ar = a.prioridad_orden ?? 999999
          const br = b.prioridad_orden ?? 999999
          if (ar !== br) return ar - br
          return sortByPressure(a, b)
        })

      ordered.forEach(task => {
        const parentId = task.parent_id || 0
        if (task.es_fragmento === true && parentId) {
          if (seenParents.has(parentId)) return
          seenParents.add(parentId)
          rank += 1
          const parent = parentById.get(parentId)
          const children = childrenByParent.get(parentId) || [task]
          const displayParent = displayParentFromChildren(parent, children)
          rows.push({
            task: {
              ...displayParent,
              tipo: task.tipo,
              prioridad_orden: task.prioridad_orden,
            },
            rank,
          })
          return
        }

        rank += 1
        rows.push({ task, rank })
      })
    })

    return rows
  }, [childrenByParent, parentById, rankedWorkTasks])

  const unclassified = useMemo(() => rankedWorkTasks
    .filter(t => t.prioridad_orden == null)
    .sort(sortByPressure)
    .slice(0, 10), [rankedWorkTasks])

  const overdue = useMemo(() => workTasks
    .filter(t => {
      const date = referenceDate(t)
      return !!date && date < today
    })
    .sort(sortByPressure), [today, workTasks])
  const overdueShown = overdue.slice(0, 10)

  const longTasks = useMemo(() => rankedWorkTasks
    .filter(t => t.tipo === 'Estratégica' && !t.es_fragmento && (t.tiempo_estimado || 0) > 90)
    .sort((a, b) => (b.tiempo_estimado || 0) - (a.tiempo_estimado || 0))
    .slice(0, 8), [rankedWorkTasks])

  const rankingConflicts = useMemo(() => {
    const rows: { task: Tarea, taskRank: number, previous: Tarea, previousRank: number }[] = []
    WORK_TYPES.forEach(type => {
      const ordered = rankedDecisionRows.filter(row => row.task.tipo === type)
      let latest: RankedDecisionTask | null = null
      ordered.forEach(row => {
        if (latest && planningDate(latest.task) && planningDate(row.task) && planningDate(latest.task)! > planningDate(row.task)!) {
          rows.push({ task: row.task, taskRank: row.rank, previous: latest.task, previousRank: latest.rank })
        }
        if (!latest || (planningDate(row.task) || '0000-00-00') > (planningDate(latest.task) || '0000-00-00')) latest = row
      })
    })
    return rows.slice(0, 8)
  }, [rankedDecisionRows])

  const dayRisks = useMemo(() => {
    const byDate: Record<string, DayRisk> = {}
    const horizon = Array.from({ length: 45 }, (_, i) => dateKey(addDays(new Date(`${today}T00:00:00`), i)))
    horizon.forEach(date => { byDate[date] = { date, used: 0, capacity: capacityForDate(date), tasks: [] } })

    workTasks.forEach(task => {
      const date = planningDate(task)
      if (!date || date < today || !byDate[date]) return
      byDate[date].used += task.tiempo_estimado || 0
      byDate[date].tasks.push(task)
    })

    horizon.forEach(date => {
      const day = byDate[date]
      const hasRealRoutine = day.tasks.some(task => isImportedRoutine(task))
      const isFutureMonth = date.slice(0, 7) > today.slice(0, 7)
      if (day.capacity > 0 && isFutureMonth && !hasRealRoutine) {
        day.used += Math.min(day.capacity, futureRoutineReserveMinutes)
      }
    })

    return Object.values(byDate)
      .filter(day => day.used > 0 && (day.capacity <= 0 || day.used / day.capacity > 1.2))
      .sort((a, b) => {
        const ae = a.capacity <= 0 ? a.used : a.used - a.capacity
        const be = b.capacity <= 0 ? b.used : b.used - b.capacity
        if (be !== ae) return be - ae
        return a.date.localeCompare(b.date)
      })
  }, [capacityForDate, futureRoutineReserveMinutes, today, workTasks])

  const casaDayRisks = useMemo(() => {
    const byDate: Record<string, DayRisk> = {}
    const horizon = Array.from({ length: 45 }, (_, i) => dateKey(addDays(new Date(`${today}T00:00:00`), i)))
    horizon.forEach(date => { byDate[date] = { date, used: 0, capacity: casaCapacityForDate(date), tasks: [] } })

    casaTasks.forEach(task => {
      const date = task.fecha_casa || null
      if (!date || date < today || !byDate[date]) return
      byDate[date].used += task.tiempo_estimado || 0
      byDate[date].tasks.push(task)
    })

    return Object.values(byDate)
      .filter(day => day.used > 0 && (day.capacity <= 0 || day.used / day.capacity > 1.2))
      .sort((a, b) => {
        const ae = a.capacity <= 0 ? a.used : a.used - a.capacity
        const be = b.capacity <= 0 ? b.used : b.used - b.capacity
        if (be !== ae) return be - ae
        return a.date.localeCompare(b.date)
      })
  }, [casaCapacityForDate, casaTasks, today])

  const lockedProblems = useMemo(() => workTasks
    .filter(t => lockedIds.has(t.id))
    .filter(t => {
      const date = planningDate(t)
      return !!date && (date < today || capacityForDate(date) <= 0)
    })
    .sort(sortByPressure)
    .slice(0, 8), [capacityForDate, lockedIds, today, workTasks])

  const homeToday = useMemo(() => activeTasks
    .filter(t => t.para_casa === true && (t.fecha_casa || today) <= today)
    .sort((a, b) => (a.fecha_casa || today).localeCompare(b.fecha_casa || today) || sortByPressure(a, b))
    .slice(0, 8), [activeTasks, today])

  const parkedToClassify = useMemo(() => tareas
    .filter(t => !isClosed(t) && t.es_padre !== true && isAparcada(t))
    .sort(sortByPressure), [tareas])
  const parkedShown = parkedToClassify.slice(0, 12)

  const redCount = overdue.length + dayRisks.length + casaDayRisks.length + lockedProblems.length
  const reviewCount = unclassified.length + rankingConflicts.length + longTasks.length + homeToday.length + parkedToClassify.length

  function jumpTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading) {
    return <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-300">Cargando decisiones...</div>
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Decisiones</h2>
            <p className="mt-1 text-sm text-gray-400">Prioriza lo que requiere criterio antes de recalcular o ejecutar.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-xl border px-3 py-2 text-sm font-bold ${redCount > 0 ? 'border-red-100 bg-red-50 text-red-500' : 'border-emerald-100 bg-emerald-50 text-emerald-600'}`}>
              {redCount} en rojo
            </span>
            <span className={`rounded-xl border px-3 py-2 text-sm font-bold ${reviewCount > 0 ? 'border-amber-100 bg-amber-50 text-amber-600' : 'border-emerald-100 bg-emerald-50 text-emerald-600'}`}>
              {reviewCount} a revisar
            </span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: 'dias-rojo', label: 'Días en exceso', count: dayRisks.length, tone: 'red' },
            { id: 'dias-casa', label: 'Exceso casa', count: casaDayRisks.length, tone: 'red' },
            { id: 'aparcadas', label: 'Por clasificar', count: parkedToClassify.length, tone: 'amber' },
            { id: 'vencidas', label: 'Vencidas', count: overdue.length, tone: 'red' },
            { id: 'anclas', label: 'Anclas', count: lockedProblems.length, tone: 'red' },
            { id: 'jerarquia', label: 'Jerarquía', count: rankingConflicts.length, tone: 'amber' },
            { id: 'clasificar', label: 'Sin clasificar', count: unclassified.length, tone: 'amber' },
            { id: 'casa', label: 'Casa hoy', count: homeToday.length, tone: 'gray' },
            { id: 'largas', label: 'Largas', count: longTasks.length, tone: 'orange' },
          ].map(chip => {
            const active = chip.count > 0
            const color = !active
              ? 'border-gray-100 bg-gray-50 text-gray-300'
              : chip.tone === 'red'
                ? 'border-red-100 bg-red-50 text-red-600'
                : chip.tone === 'amber'
                  ? 'border-amber-100 bg-amber-50 text-amber-600'
                : chip.tone === 'orange'
                    ? 'border-orange-100 bg-orange-50 text-orange-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => jumpTo(chip.id)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition ${color}`}
              >
                {chip.count} {chip.label}
              </button>
            )
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <DecisionSection id="aparcadas" title="Por clasificar" subtitle="Aparcadas fuera del Plan y de Casa, a la espera de reclasificar. Conservan deadline y fecha planificada." count={parkedToClassify.length} tone={parkedToClassify.length ? 'amber' : 'emerald'}>
          {parkedShown.length ? (
            <>
              {parkedShown.map(task => (
                <DecisionTask key={task.id} task={task} onEditTarea={onEditTarea} detail="aparcada" />
              ))}
              {parkedToClassify.length > parkedShown.length && (
                <div className="px-1 pt-1 text-xs text-amber-600">Y {parkedToClassify.length - parkedShown.length} más en la pestaña Por clasificar.</div>
              )}
            </>
          ) : <div className="py-8 text-center text-sm text-gray-300">Nada aparcado pendiente de clasificar.</div>}
        </DecisionSection>

        <DecisionSection id="dias-rojo" title="Días en exceso" subtitle="Próximos 45 días de trabajo por encima del 120% de capacidad, o con trabajo en un día sin capacidad." count={dayRisks.length} tone={dayRisks.length ? 'red' : 'emerald'}>
          <DayRiskList days={dayRisks} expandedDay={expandedDay} setExpandedDay={setExpandedDay} keyPrefix="trabajo" onEditTarea={onEditTarea} />
        </DecisionSection>

        <DecisionSection id="dias-casa" title="Días en exceso · Casa" subtitle="Próximos 45 días fuera de jornada por encima del 120% de capacidad, o con trabajo en un día sin hueco (L-X 2h, J-S 0, D 2h)." count={casaDayRisks.length} tone={casaDayRisks.length ? 'red' : 'emerald'}>
          <DayRiskList days={casaDayRisks} expandedDay={expandedDay} setExpandedDay={setExpandedDay} keyPrefix="casa" onEditTarea={onEditTarea} />
        </DecisionSection>

        <DecisionSection id="vencidas" title="Vencidas abiertas" subtitle="Trabajo normal con fecha de referencia anterior a hoy (Casa, plan o deadline)." count={overdue.length} tone={overdue.length ? 'red' : 'emerald'}>
          {overdueShown.length ? overdueShown.map(task => (
            <DecisionTask key={task.id} task={task} onEditTarea={onEditTarea} detail={`+${Math.abs(daysBetween(today, referenceDate(task)!))}d`} />
          )) : <div className="py-8 text-center text-sm text-gray-300">No hay vencidas abiertas.</div>}
        </DecisionSection>

        <DecisionSection id="anclas" title="Anclas problemáticas" subtitle="No mover vencidas o colocadas en días sin capacidad." count={lockedProblems.length} tone={lockedProblems.length ? 'red' : 'emerald'}>
          {lockedProblems.length ? lockedProblems.map(task => {
            const date = planningDate(task)
            const detail = date && capacityForDate(date) <= 0 ? 'día sin capacidad' : 'vencida'
            return <DecisionTask key={task.id} task={task} onEditTarea={onEditTarea} detail={detail} />
          }) : <div className="py-8 text-center text-sm text-gray-300">Las anclas no tienen alertas evidentes.</div>}
        </DecisionSection>

        <DecisionSection id="jerarquia" title="Jerarquía rara" subtitle="Una tarea inferior aparece antes que una superior dentro del mismo tipo." count={rankingConflicts.length} tone={rankingConflicts.length ? 'amber' : 'emerald'}>
          {rankingConflicts.length ? rankingConflicts.map(({ task, taskRank, previous, previousRank }) => (
            <DecisionTask key={`${previous.id}-${task.id}`} task={task} rank={taskRank} onEditTarea={onEditTarea} detail={`antes que ${rankLabel(previous, previousRank)}`} />
          )) : <div className="py-8 text-center text-sm text-gray-300">No veo conflictos claros de jerarquía.</div>}
        </DecisionSection>

        <DecisionSection id="clasificar" title="Sin clasificar" subtitle="OP/TA/ES nuevas que todavía no entran bien al ranking." count={unclassified.length} tone={unclassified.length ? 'amber' : 'emerald'}>
          {unclassified.length ? unclassified.map(task => (
            <DecisionTask key={task.id} task={task} onEditTarea={onEditTarea} />
          )) : <div className="py-8 text-center text-sm text-gray-300">No hay tareas pendientes de clasificar.</div>}
        </DecisionSection>

        <DecisionSection id="casa" title="Fuera de jornada pendiente" subtitle="Tareas derivadas a casa con fecha de hoy o anterior." count={homeToday.length} tone={homeToday.length ? 'gray' : 'emerald'}>
          {homeToday.length ? homeToday.map(task => (
            <DecisionTask key={task.id} task={task} onEditTarea={onEditTarea} detail={`casa ${fDate(task.fecha_casa || today)}`} />
          )) : <div className="py-8 text-center text-sm text-gray-300">Nada urgente fuera de jornada.</div>}
        </DecisionSection>

        <DecisionSection id="largas" title="Estratégicas largas" subtitle="Candidatas a partir en bloques más manejables." count={longTasks.length} tone={longTasks.length ? 'orange' : 'emerald'}>
          {longTasks.length ? longTasks.map(task => (
            <DecisionTask key={task.id} task={task} onEditTarea={onEditTarea} detail="sin partir" />
          )) : <div className="py-8 text-center text-sm text-gray-300">No hay estratégicas largas sin fragmentar.</div>}
        </DecisionSection>
      </div>
    </div>
  )
}
