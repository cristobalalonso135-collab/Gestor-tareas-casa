'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAllTareas } from '@/lib/supabaseTasks'
import { buildPlanningProposal, type PlanningProposalRow } from '@/lib/planningEngine'
import { loadAppSetting, saveAppSetting, CAPACITY_UPDATED_EVENT } from '@/lib/appSettings'
import {
  CAPACITY_KEY,
  FUTURE_ROUTINE_RESERVE_KEY,
  LOCKED_TASKS_KEY,
  ROUTINE_TYPES,
  addDays,
  dateKey,
  defaultCasaCapacity,
  defaultWorkCapacity,
  effectiveDate,
  fDate,
  isAparcada,
  isClosedTask,
  minToHM,
  planningDate,
  referenceDate,
  referenceDateKind,
  withInheritedCasa,
  EVENT_TYPE,
  LEGACY_EVENT_TYPE,
  canonicalTipo,
  reminderGroupLabel,
  reminderAnchorDate,
  reminderDateRange,
  formatReminderRange,
} from '@/lib/taskRules'
import { LOCK_CHIP, LOCK_ROW, LOCK_TITLE, TIPO_BAR, TIPO_CHIP, TIPO_DOT } from '@/lib/tipoColors'

type Tarea = {
  id: number
  tipo: string
  tarea: string
  estado: string
  tiempo_estimado: number
  fecha_solicitud: string | null
  deadline: string | null
  fecha_planificada?: string | null
  prioridad_orden?: number | null
  done: boolean
  para_casa?: boolean | null
  fecha_casa?: string | null
  excluir_plan?: boolean | null
  excluida_fecha?: string | null
  es_padre?: boolean | null
  parent_id?: number | null
  fragmento_num?: number | null
  fragmentos_total?: number | null
  es_fragmento?: boolean | null
  grupo?: string | null
}

type ProposalRow = PlanningProposalRow

type Circuit = 'trabajo' | 'casa' | 'todas'

type DisplayRow = {
  key: string
  task: Tarea
  children: Tarea[]
  isGroup: boolean
}

type Props = {
  onEditTarea?: (id: number) => void
  onCreateTarea?: (tipo: string) => void
  refreshKey?: number
  onChanged?: () => void
}

const TACTICA = 'T\u00e1ctica'
const ESTRATEGICA = 'Estrat\u00e9gica'
const EVENTO = EVENT_TYPE
const RANK_TYPES = ['Operativa', TACTICA, ESTRATEGICA, EVENTO]
const BUDGET_TYPES = ['Operativa', TACTICA, ESTRATEGICA]
const TIPO_TODAS = 'Todas'
const QUEUE_BUDGET_KEY = 'orden_trabajo_queue_budget'
const LOCKED_KEY = LOCKED_TASKS_KEY
const QUEUE_BUDGET_MINUTES: Record<Circuit, Record<string, number>> = {
  trabajo: { Operativa: 4 * 60, [TACTICA]: 12 * 60, [ESTRATEGICA]: 40 * 60 },
  casa: { Operativa: 30, [TACTICA]: 90, [ESTRATEGICA]: 6 * 60 },
  todas: { Operativa: 270, [TACTICA]: 810, [ESTRATEGICA]: 46 * 60 },
}
const QUEUE_TOTAL_MINUTES: Record<Circuit, number> = {
  trabajo: 56 * 60,
  casa: 8 * 60,
  todas: 64 * 60,
}

function mergeQueueBudget(saved?: Partial<Record<Circuit, Record<string, number>>> | null): Record<Circuit, Record<string, number>> {
  const next: Record<Circuit, Record<string, number>> = {
    trabajo: { ...QUEUE_BUDGET_MINUTES.trabajo },
    casa: { ...QUEUE_BUDGET_MINUTES.casa },
    todas: { ...QUEUE_BUDGET_MINUTES.todas },
  }
  ;(['trabajo', 'casa', 'todas'] as Circuit[]).forEach(circuit => {
    BUDGET_TYPES.forEach(type => {
      const value = saved?.[circuit]?.[type]
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) next[circuit][type] = Math.round(value)
    })
  })
  return next
}

function minutesToHoursInput(minutes: number) {
  const hours = minutes / 60
  return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 10) / 10)
}
const CIRCUIT_KEY = 'orden_trabajo_circuit'
const REMINDER_VIEW_KEY = 'orden_trabajo_reminder_view'
const CASA_CAPACITY_OVERRIDES_KEY = 'casa_capacity_overrides'
const CASA_CAPACITY_EVENT = 'gestor-casa-capacity-updated'
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const TYPE_PREFIX: Record<string, string> = { Operativa: 'OP', [TACTICA]: 'TA', [ESTRATEGICA]: 'ES', [EVENTO]: 'REC', Evento: 'REC' }

function rankBadgeClass(tipo: string, locked = false) {
  if (locked) return LOCK_CHIP
  const chip = TIPO_CHIP[tipo]
  return chip ? `${chip.bg} ${chip.text}` : 'bg-gray-100 text-gray-700'
}

function matchesCircuit(task: Tarea, circuit: Circuit) {
  if (circuit === 'todas') return true
  if (circuit === 'casa') return task.para_casa === true
  return task.para_casa !== true
}

function taskMonthKey(task: Tarea): string | null {
  const date = referenceDate(task)
  if (!date || date.startsWith('9999')) return null
  return date.slice(0, 7)
}

function matchesMonthFilter(task: Tarea, monthFilter: string) {
  if (monthFilter === 'todos') return true
  const key = taskMonthKey(task)
  if (monthFilter === 'sin-fecha') return !key
  return key === monthFilter
}

function monthChipLabel(monthKey: string) {
  const [year, month] = monthKey.split('-')
  const idx = Math.max(0, Math.min(11, (parseInt(month, 10) || 1) - 1))
  return `${MONTH_SHORT[idx]}. ${year}`
}

function isWorkType(tipo: string) {
  return RANK_TYPES.includes(canonicalTipo(tipo))
}

function isUnclassifiedTask(task: Tarea) {
  return isWorkType(task.tipo) && task.prioridad_orden == null
}

function queueTone(used: number, budget: number) {
  if (budget <= 0) {
    return used > 0
      ? { label: 'Excedido', text: 'text-red-500', bg: 'bg-red-50/50', border: 'border-red-200', bar: 'bg-red-400' }
      : { label: 'Sin hueco', text: 'text-gray-400', bg: 'bg-gray-50/60', border: 'border-gray-100', bar: 'bg-gray-200' }
  }
  const pct = Math.round((used / budget) * 100)
  if (pct < 80) return { label: 'Cabe', text: 'text-emerald-600', bg: 'bg-white', border: 'border-gray-100', bar: 'bg-emerald-400' }
  if (pct < 100) return { label: 'Justo', text: 'text-amber-600', bg: 'bg-amber-50/50', border: 'border-amber-200', bar: 'bg-amber-400' }
  return { label: 'Excedido', text: 'text-red-500', bg: 'bg-red-50/50', border: 'border-red-200', bar: 'bg-red-400' }
}

function rowPrimaryId(row: DisplayRow) {
  return (row.children[0] || row.task).id
}

function lastChild(children: Tarea[]) {
  return children[children.length - 1]
}

function rowDateTask(row: DisplayRow) {
  const focus = row.children[0] || row.task
  if (!row.isGroup) return focus
  const last = lastChild(row.children) || row.task
  return {
    ...row.task,
    fecha_casa: last.fecha_casa || row.task.fecha_casa,
    fecha_planificada: last.fecha_planificada || row.task.fecha_planificada,
    deadline: last.deadline || row.task.deadline,
    para_casa: last.para_casa === true,
  }
}

function rowIsUnclassified(row: DisplayRow) {
  if (row.isGroup) return row.children.every(isUnclassifiedTask)
  return isUnclassifiedTask(row.task)
}

function rowIsInbox(row: DisplayRow) {
  const tasks = row.isGroup ? row.children : [row.task]
  return tasks.every(task => isUnclassifiedTask(task) || isAparcada(task))
}

function daysUntil(today: string, target?: string | null): number | null {
  if (!target) return null
  return Math.floor((new Date(`${target}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000)
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

function parentTitleFromFragment(t: Tarea): string {
  return t.tarea.replace(/\s*[·-]\s*parte\s+\d+\s*\/\s*\d+\s*$/i, '').trim()
}

function displayParentFromChildren(parent: Tarea | null | undefined, children: Tarea[]): Tarea {
  const first = children[0]
  const last = lastChild(children) || first
  const fecha_casa = last?.fecha_casa || parent?.fecha_casa || null
  const fecha_planificada = last?.fecha_planificada || parent?.fecha_planificada || null
  const deadline = last?.deadline || parent?.deadline || null
  const para_casa = children.some(child => child.para_casa === true)
  const base = parent || {
    ...first,
    id: first.parent_id || first.id,
    tarea: parentTitleFromFragment(first),
    es_padre: true,
  }
  return {
    ...base,
    tiempo_estimado: children.reduce((sum, child) => sum + (child.tiempo_estimado || 0), 0),
    deadline,
    fecha_planificada,
    para_casa,
    fecha_casa,
  }
}

function htmlEscape(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default function Priorizador({ onEditTarea, onCreateTarea, refreshKey, onChanged }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [tipo, setTipo] = useState('Operativa')
  const [circuit, setCircuit] = useState<Circuit>(() => {
    if (typeof window === 'undefined') return 'trabajo'
    const saved = localStorage.getItem(CIRCUIT_KEY)
    return saved === 'casa' || saved === 'todas' || saved === 'trabajo' ? saved : 'trabajo'
  })
  const [proposalCircuit, setProposalCircuit] = useState<Circuit>('trabajo')
  const [monthFilter, setMonthFilter] = useState('todos')
  const [reminderGroupFilter, setReminderGroupFilter] = useState('todos')
  const [reminderView, setReminderView] = useState<'ranking' | 'categoria'>(() => {
    if (typeof window === 'undefined') return 'ranking'
    return localStorage.getItem(REMINDER_VIEW_KEY) === 'categoria' ? 'categoria' : 'ranking'
  })
  const [collapsedReminderGroups, setCollapsedReminderGroups] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applyingPlan, setApplyingPlan] = useState(false)
  const [proposal, setProposal] = useState<ProposalRow[] | null>(null)
  const [proposalTypeFilter, setProposalTypeFilter] = useState('Todas')
  const [proposalScope, setProposalScope] = useState('Todas')
  const [lockedIds, setLockedIds] = useState<Set<number>>(new Set())
  const [capacityOverrides, setCapacityOverrides] = useState<Record<string, number>>({})
  const [casaCapacityOverrides, setCasaCapacityOverrides] = useState<Record<string, number>>({})
  const [expandedParents, setExpandedParents] = useState<Set<number>>(new Set())
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [insertOpen, setInsertOpen] = useState(false)
  const [insertQuery, setInsertQuery] = useState('')
  const [queueBudget, setQueueBudget] = useState<Record<Circuit, Record<string, number>>>(QUEUE_BUDGET_MINUTES)
  const queueBudgetReady = useRef(false)
  const dragId = useRef<number | null>(null)
  const todayKey = useMemo(() => dateKey(new Date()), [])

  const fetchTareas = useCallback(async () => {
    setLoading(true)
    const selectBase = 'id,tipo,tarea,estado,tiempo_estimado,fecha_solicitud,deadline,fecha_planificada,prioridad_orden,done,para_casa,fecha_casa,es_padre,parent_id,fragmento_num,fragmentos_total,es_fragmento,excluir_plan,excluida_fecha'
    const configure = (query: any) => query.in('tipo', [...RANK_TYPES, LEGACY_EVENT_TYPE, ...ROUTINE_TYPES]).order('tipo', { ascending: true }).order('prioridad_orden', { ascending: true })
    try {
      try {
        const data = await fetchAllTareas<Tarea>(`${selectBase},grupo`, configure)
        setTareas(data)
      } catch (error: any) {
        if (!String(error?.message || '').includes('grupo')) throw error
        const data = await fetchAllTareas<Tarea>(selectBase, configure)
        setTareas(data)
      }
    } catch (error) {
      console.error('Error cargando priorizador:', error)
      setTareas([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTareas() }, [fetchTareas])
  useEffect(() => { if (refreshKey && refreshKey > 0) fetchTareas() }, [refreshKey, fetchTareas])

  function cleanFragmentTitle(title: string): string {
    return title
      .replace(/^Parte\s+\d+\s+de\s+\d+\s*-\s*/i, '')
      .replace(/\s*[-]\s*parte\s+\d+\s*\/\s*\d+\s*$/i, '')
      .replace(/\s*[·-]\s*parte\s+\d+\s*\/\s*\d+\s*$/i, '')
      .trim()
  }

  async function renumberFragments(parentId: number) {
    const { data, error } = await supabase
      .from('tareas')
      .select('id,tarea,fragmento_num')
      .eq('parent_id', parentId)
      .eq('es_fragmento', true)
      .order('fragmento_num', { ascending: true })
      .order('id', { ascending: true })
    if (error) {
      alert(`No pude renumerar las partes: ${error.message}`)
      return
    }
    const children = data || []
    if (children.length === 0) {
      await supabase.from('tareas').update({ es_padre: false, excluir_plan: false }).eq('id', parentId)
      return
    }
    const results = await Promise.all(children.map((child, index) => {
      const num = index + 1
      return supabase
        .from('tareas')
        .update({
          fragmento_num: num,
          fragmentos_total: children.length,
          tarea: `${cleanFragmentTitle(child.tarea)} · parte ${num}/${children.length}`,
        })
        .eq('id', child.id)
    }))
    const updateError = results.find(result => result.error)?.error
    if (updateError) alert(`No pude renumerar las partes: ${updateError.message}`)
  }

  async function refreshAfterDelete() {
    await fetchTareas()
    onChanged?.()
  }

  async function deleteTask(id: number) {
    if (!confirm('¿Eliminar esta tarea?')) return
    const { error } = await supabase.from('tareas').delete().eq('id', id)
    if (error) {
      alert(`No pude eliminar la tarea: ${error.message}`)
      return
    }
    await refreshAfterDelete()
  }

  async function deleteGroup(parent: Tarea) {
    if (!confirm(`¿Eliminar "${parent.tarea}" y todas sus partes?`)) return
    const { error: childError } = await supabase.from('tareas').delete().eq('parent_id', parent.id).eq('es_fragmento', true)
    if (childError) {
      alert(`No pude eliminar las partes: ${childError.message}`)
      return
    }
    const { error: parentError } = await supabase.from('tareas').delete().eq('id', parent.id)
    if (parentError) {
      alert(`No pude eliminar el padre: ${parentError.message}`)
      return
    }
    await refreshAfterDelete()
  }

  async function deletePart(child: Tarea) {
    if (!child.parent_id) return deleteTask(child.id)
    if (!confirm(`¿Eliminar esta parte?\n${child.tarea}`)) return
    const { error } = await supabase.from('tareas').delete().eq('id', child.id)
    if (error) {
      alert(`No pude eliminar la parte: ${error.message}`)
      return
    }
    await renumberFragments(child.parent_id)
    await refreshAfterDelete()
  }

  useEffect(() => {
    let cancelled = false
    void loadAppSetting<Record<Circuit, Record<string, number>>>(QUEUE_BUDGET_KEY, QUEUE_BUDGET_MINUTES).then(value => {
      if (cancelled) return
      setQueueBudget(mergeQueueBudget(value))
      queueBudgetReady.current = true
    })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!queueBudgetReady.current) return
    void saveAppSetting(QUEUE_BUDGET_KEY, queueBudget)
  }, [queueBudget])
  useEffect(() => {
    localStorage.setItem(CIRCUIT_KEY, circuit)
    setProposal(null)
  }, [circuit])
  useEffect(() => {
    localStorage.setItem(REMINDER_VIEW_KEY, reminderView)
  }, [reminderView])
  const locksReady = useRef(false)
  useEffect(() => {
    let cancelled = false
    void loadAppSetting<number[]>(LOCKED_KEY, []).then(ids => {
      if (cancelled) return
      setLockedIds(new Set(ids.filter(id => Number.isFinite(id))))
      locksReady.current = true
    })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!locksReady.current) return
    void saveAppSetting(LOCKED_KEY, Array.from(lockedIds))
  }, [lockedIds])

  useEffect(() => {
    const applyCapacity = (value: Record<string, number> | null | undefined) => {
      setCapacityOverrides(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
    }
    let cancelled = false
    void loadAppSetting<Record<string, number>>(CAPACITY_KEY, {}).then(value => {
      if (!cancelled) applyCapacity(value)
    })
    const readLocalCapacity = () => {
      try {
        applyCapacity(JSON.parse(localStorage.getItem(CAPACITY_KEY) || '{}'))
      } catch {
        applyCapacity({})
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === CAPACITY_KEY) readLocalCapacity()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(CAPACITY_UPDATED_EVENT, readLocalCapacity)
    return () => {
      cancelled = true
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CAPACITY_UPDATED_EVENT, readLocalCapacity)
    }
  }, [])

  useEffect(() => {
    const readCasa = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(CASA_CAPACITY_OVERRIDES_KEY) || '{}')
        setCasaCapacityOverrides(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {})
      } catch {
        setCasaCapacityOverrides({})
      }
    }
    readCasa()
    const onStorage = (event: StorageEvent) => {
      if (event.key === CASA_CAPACITY_OVERRIDES_KEY) readCasa()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(CASA_CAPACITY_EVENT, readCasa)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CASA_CAPACITY_EVENT, readCasa)
    }
  }, [])

  const listedTasks = useMemo(() => (
    tareas.filter(t => !isClosedTask(t) && t.es_padre !== true)
  ), [tareas])

  const activeTasks = useMemo(() => (
    listedTasks.filter(t => !isAparcada(t))
  ), [listedTasks])

  const parentById = useMemo(() => {
    const map = new Map<number, Tarea>()
    tareas.forEach(t => {
      if (t.es_padre === true) map.set(t.id, t)
    })
    return map
  }, [tareas])

  const circuitTasks = useMemo(() => (
    listedTasks
      .map(task => withInheritedCasa(task, parentById))
      .filter(task => matchesCircuit(task, circuit))
  ), [listedTasks, circuit, parentById])

  const openCircuitTasks = useMemo(() => (
    circuitTasks.filter(t => !isAparcada(t))
  ), [circuitTasks])

  const childrenByParent = useMemo(() => {
    const map = new Map<number, Tarea[]>()
    listedTasks.forEach(t => {
      if (!t.parent_id) return
      if (!map.has(t.parent_id)) map.set(t.parent_id, [])
      map.get(t.parent_id)!.push(t)
    })
    map.forEach(children => {
      children.sort((a, b) => {
        const an = a.fragmento_num ?? 999999
        const bn = b.fragmento_num ?? 999999
        if (an !== bn) return an - bn
        const ao = a.prioridad_orden ?? 999999
        const bo = b.prioridad_orden ?? 999999
        return ao !== bo ? ao - bo : a.id - b.id
      })
    })
    return map
  }, [listedTasks])

  const capacityForDate = useCallback((date: string) => {
    return capacityOverrides[date] ?? defaultWorkCapacity(new Date(`${date}T00:00:00`))
  }, [capacityOverrides])

  const casaCapacityForDate = useCallback((date: string) => {
    return casaCapacityOverrides[date] ?? defaultCasaCapacity(new Date(`${date}T00:00:00`))
  }, [casaCapacityOverrides])

  const availableDatesEndingAt = useCallback((endDate: string, count: number): string[] => {
    const dates: string[] = []
    let cursor = endDate
    for (let i = 0; i < 740 && dates.length < count; i += 1) {
      if (capacityForDate(cursor) > 0) dates.unshift(cursor)
      cursor = dateKey(addDays(new Date(`${cursor}T00:00:00`), -1))
    }
    if (dates.length === count) return dates
    return Array.from({ length: count }, (_, index) => dateKey(addDays(new Date(`${endDate}T00:00:00`), index - (count - 1))))
  }, [capacityForDate])

  const orderedForType = useMemo(() => (
    circuitTasks
      .filter(t => isWorkType(t.tipo) && (tipo === TIPO_TODAS || canonicalTipo(t.tipo) === tipo))
      .sort((a, b) => {
        const au = isUnclassifiedTask(a)
        const bu = isUnclassifiedTask(b)
        if (au !== bu) return au ? -1 : 1
        if (tipo === TIPO_TODAS && canonicalTipo(a.tipo) !== canonicalTipo(b.tipo)) return RANK_TYPES.indexOf(canonicalTipo(a.tipo)) - RANK_TYPES.indexOf(canonicalTipo(b.tipo))
        const ao = a.prioridad_orden ?? 999999
        const bo = b.prioridad_orden ?? 999999
        if (ao !== bo) return ao - bo
        return effectiveDate(a).localeCompare(effectiveDate(b))
      })
  ), [circuitTasks, tipo])

  function groupedCount(tasks: Tarea[]) {
    const seenParents = new Set<number>()
    let count = 0
    tasks.forEach(task => {
      const parentId = task.parent_id || 0
      if (task.es_fragmento === true && parentId) {
        if (!seenParents.has(parentId)) {
          seenParents.add(parentId)
          count += 1
        }
        return
      }
      count += 1
    })
    return count
  }

  const workTypeTasks = useMemo(() => (
    listedTasks
      .map(task => withInheritedCasa(task, parentById))
      .filter(t => isWorkType(t.tipo))
  ), [listedTasks, parentById])

  function groupedCountForType(type: string) {
    return groupedCount(workTypeTasks.filter(t => matchesCircuit(t, circuit) && canonicalTipo(t.tipo) === type))
  }

  const circuitCounts = {
    trabajo: groupedCount(workTypeTasks.filter(t => matchesCircuit(t, 'trabajo'))),
    casa: groupedCount(workTypeTasks.filter(t => matchesCircuit(t, 'casa'))),
  }

  const queueCards = useMemo(() => (
    BUDGET_TYPES.map(type => {
      const tasks = openCircuitTasks.filter(t => canonicalTipo(t.tipo) === type)
      const minutes = tasks.reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
      const seenParents = new Set<number>()
      let count = 0
      let parts = 0
      tasks.forEach(task => {
        const parentId = task.parent_id || 0
        if (task.es_fragmento === true && parentId) {
          parts += 1
          if (!seenParents.has(parentId)) {
            seenParents.add(parentId)
            count += 1
          }
          return
        }
        count += 1
      })
      const budget = queueBudget[circuit]?.[type] ?? QUEUE_BUDGET_MINUTES[circuit][type] ?? 0
      const pct = budget > 0 ? Math.round((minutes / budget) * 100) : (minutes > 0 ? 100 : 0)
      const countLabel = type === ESTRATEGICA && parts > count
        ? `${count} padres · ${parts} partes`
        : `${count} tarea${count === 1 ? '' : 's'}`
      return {
        type,
        minutes,
        budget,
        pct,
        count,
        countLabel,
        tone: queueTone(minutes, budget),
      }
    })
  ), [circuit, openCircuitTasks, queueBudget])

  const queueTotal = useMemo(() => {
    const minutes = queueCards.reduce((sum, card) => sum + card.minutes, 0)
    const count = queueCards.reduce((sum, card) => sum + card.count, 0)
    const budget = QUEUE_TOTAL_MINUTES[circuit]
    const pct = budget > 0 ? Math.round((minutes / budget) * 100) : (minutes > 0 ? 100 : 0)
    return {
      minutes,
      budget,
      pct,
      countLabel: `${count} tarea${count === 1 ? '' : 's'}`,
      tone: queueTone(minutes, budget),
    }
  }, [circuit, queueCards])

  const agendaKpis = useMemo(() => {
    const reminders = openCircuitTasks.filter(t => canonicalTipo(t.tipo) === EVENTO)
    const reminderCount = groupedCount(reminders)
    return [
      {
        key: EVENTO,
        label: 'REC',
        count: reminderCount,
        countLabel: reminderCount === 1 ? '1 recordatorio' : `${reminderCount} recordatorios`,
        badge: 'Sin carga',
        hint: '0 min. Recalcular Recordatorio va aparte.',
        clickable: true,
      },
    ]
  }, [openCircuitTasks])

  function updateQueueBudgetHours(type: string, hours: number) {
    const minutes = Math.max(0, Math.round((Number.isFinite(hours) ? hours : 0) * 60))
    setQueueBudget(prev => ({
      ...prev,
      [circuit]: { ...prev[circuit], [type]: minutes },
    }))
  }

  const typeRows = useMemo<DisplayRow[]>(() => {
    const rows: DisplayRow[] = []
    const seenParents = new Set<number>()
    orderedForType.forEach(task => {
      const parentId = task.parent_id || 0
      const parent = parentId ? parentById.get(parentId) : null
      const children = (parentId ? (childrenByParent.get(parentId) || [task]) : [task])
        .map(child => withInheritedCasa(child, parentById))
      if (task.es_fragmento === true && parentId) {
        if (seenParents.has(parentId)) return
        seenParents.add(parentId)
        rows.push({ key: `parent-${parentId}`, task: displayParentFromChildren(parent, children), children, isGroup: true })
        return
      }
      rows.push({ key: `task-${task.id}`, task, children: [task], isGroup: false })
    })
    return rows
  }, [childrenByParent, orderedForType, parentById])

  const monthChips = useMemo(() => {
    const counts = new Map<string, number>()
    typeRows.forEach(row => {
      const main = rowDateTask(row)
      const key = taskMonthKey(main) || 'sin-fecha'
      counts.set(key, (counts.get(key) || 0) + 1)
    })
    const months = [...counts.keys()].filter(key => key !== 'sin-fecha').sort()
    return {
      total: typeRows.length,
      none: counts.get('sin-fecha') || 0,
      months: months.map(key => ({ key, count: counts.get(key) || 0 })),
    }
  }, [typeRows])

  const reminderGroupChips = useMemo(() => {
    const counts = new Map<string, number>()
    let none = 0
    typeRows.forEach(row => {
      if (canonicalTipo(row.task.tipo) !== EVENTO) return
      const name = reminderGroupLabel(row.task)
      if (!name) {
        none += 1
        return
      }
      counts.set(name, (counts.get(name) || 0) + 1)
    })
    const names = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'es'))
    return {
      total: typeRows.length,
      none,
      names: names.map(name => ({ name, count: counts.get(name) || 0 })),
    }
  }, [typeRows])

  const rankByKey = useMemo(() => {
    const map = new Map<string, number>()
    const byTipo: Record<string, DisplayRow[]> = {}
    typeRows.filter(row => !rowIsUnclassified(row)).forEach(row => {
      const kind = canonicalTipo(row.task.tipo)
      if (!byTipo[kind]) byTipo[kind] = []
      byTipo[kind].push(row)
    })
    Object.values(byTipo).forEach(rows => {
      rows.forEach((row, index) => map.set(row.key, index + 1))
    })
    return map
  }, [typeRows])

  const visibleRows = useMemo<DisplayRow[]>(() => {
    const q = query.trim().toLowerCase()
    return typeRows.filter(row => {
      const main = rowDateTask(row)
      if (!matchesMonthFilter(main, monthFilter)) return false
      if (tipo === EVENTO && reminderGroupFilter !== 'todos') {
        const group = reminderGroupLabel(main)
        if (reminderGroupFilter === 'sin-categoria') {
          if (group) return false
        } else if (group !== reminderGroupFilter) return false
      }
      if (!q) return true
      const haystack = row.isGroup
        ? [
            row.task.tarea,
            row.task.estado,
            fDate(row.task.deadline),
            fDate(row.task.fecha_planificada),
            ...row.children.map(child => `${child.tarea} ${child.estado} ${reminderGroupLabel(child)} ${fDate(child.deadline)} ${fDate(child.fecha_planificada)} ${fDate(child.fecha_casa)}`),
          ].join(' ').toLowerCase()
        : [main.tarea, reminderGroupLabel(main), fDate(main.deadline), fDate(main.fecha_planificada), fDate(main.fecha_casa), main.estado].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [monthFilter, query, reminderGroupFilter, tipo, typeRows])

  useEffect(() => {
    setInsertOpen(false)
    setInsertQuery('')
  }, [tipo, circuit])

  useEffect(() => {
    if (monthFilter === 'todos') return
    if (monthFilter === 'sin-fecha' && monthChips.none > 0) return
    if (monthChips.months.some(month => month.key === monthFilter)) return
    setMonthFilter('todos')
  }, [monthChips, monthFilter])

  useEffect(() => {
    if (tipo !== EVENTO) {
      if (reminderGroupFilter !== 'todos') setReminderGroupFilter('todos')
      return
    }
    if (reminderGroupFilter === 'todos') return
    if (reminderGroupFilter === 'sin-categoria' && reminderGroupChips.none > 0) return
    if (reminderGroupChips.names.some(group => group.name === reminderGroupFilter)) return
    setReminderGroupFilter('todos')
  }, [reminderGroupChips, reminderGroupFilter, tipo])

  const rankDragEnabled = (circuit !== 'todas' || tipo !== TIPO_TODAS) && !(tipo === EVENTO && reminderView === 'categoria')
  const unclassifiedRows = useMemo(() => visibleRows.filter(rowIsInbox), [visibleRows])
  const rankedRows = useMemo(() => {
    const rows = visibleRows.filter(row => !rowIsInbox(row))
    if (circuit !== 'todas' || tipo !== TIPO_TODAS) return rows
    return [...rows].sort((a, b) => {
      const aTask = rowDateTask(a)
      const bTask = rowDateTask(b)
      const am = taskMonthKey(aTask) || '9999-99'
      const bm = taskMonthKey(bTask) || '9999-99'
      if (am !== bm) return am.localeCompare(bm)
      const ad = effectiveDate(aTask)
      const bd = effectiveDate(bTask)
      if (ad !== bd) return ad.localeCompare(bd)
      const ao = a.task.prioridad_orden ?? 999999
      const bo = b.task.prioridad_orden ?? 999999
      if (ao !== bo) return ao - bo
      return aTask.id - bTask.id
    })
  }, [circuit, tipo, visibleRows])
  const rowsToRender = useMemo(() => ([
    ...unclassifiedRows.map(row => ({ row, section: 'unclassified' as const })),
    ...rankedRows.map(row => ({ row, section: 'ranked' as const })),
  ]), [rankedRows, unclassifiedRows])

  const reminderCategoryBlocks = useMemo(() => {
    if (tipo !== EVENTO || reminderView !== 'categoria') return []
    const groups = new Map<string, typeof rowsToRender>()
    const ungrouped: typeof rowsToRender = []
    rowsToRender.forEach(item => {
      const name = reminderGroupLabel(item.row.task)
      if (!name) {
        ungrouped.push(item)
        return
      }
      if (!groups.has(name)) groups.set(name, [])
      groups.get(name)!.push(item)
    })
    const named = [...groups.entries()].sort((a, b) => {
      const ra = reminderDateRange(a[1].map(item => item.row.task))
      const rb = reminderDateRange(b[1].map(item => item.row.task))
      const da = ra.min || '9999-12-31'
      const db = rb.min || '9999-12-31'
      if (da !== db) return da.localeCompare(db)
      return a[0].localeCompare(b[0], 'es')
    })
    const blocks: Array<{ name: string, count: number, range: ReturnType<typeof reminderDateRange>, items: typeof rowsToRender }> = named.map(([name, items]) => ({
      name,
      count: items.length,
      range: reminderDateRange(items.map(item => item.row.task)),
      items: [...items].sort((a, b) => {
        const da = reminderAnchorDate(a.row.task) || '9999-12-31'
        const db = reminderAnchorDate(b.row.task) || '9999-12-31'
        if (da !== db) return da.localeCompare(db)
        return a.row.task.id - b.row.task.id
      }),
    }))
    if (ungrouped.length > 0) {
      blocks.push({
        name: 'Sin categoría',
        count: ungrouped.length,
        range: reminderDateRange(ungrouped.map(item => item.row.task)),
        items: ungrouped,
      })
    }
    return blocks
  }, [reminderView, rowsToRender, tipo])

  const listItems = useMemo(() => {
    if (tipo === EVENTO && reminderView === 'categoria') {
      return reminderCategoryBlocks.flatMap(block => {
        const header = { kind: 'header' as const, key: `reminder-group-${block.name}`, block }
        if (collapsedReminderGroups.has(block.name)) return [header]
        return [
          header,
          ...block.items.map(item => ({ kind: 'row' as const, key: item.row.key, row: item.row, section: item.section, hideMonth: true })),
        ]
      })
    }
    return rowsToRender.map(item => ({ kind: 'row' as const, key: item.row.key, row: item.row, section: item.section, hideMonth: false }))
  }, [collapsedReminderGroups, reminderCategoryBlocks, reminderView, rowsToRender, tipo])

  const canInsertType = tipo !== TIPO_TODAS && RANK_TYPES.includes(tipo)
  const insertCandidates = useMemo(() => {
    if (!canInsertType) return []
    const q = insertQuery.trim().toLowerCase()
    return typeRows.filter(row => {
      if (!rowIsInbox(row) || canonicalTipo(row.task.tipo) !== tipo) return false
      if (!q) return true
      const haystack = [row.task.tarea, fDate(row.task.deadline), fDate(row.task.fecha_planificada)].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [canInsertType, insertQuery, tipo, typeRows])

  function mergeVisibleOrder(nextVisible: Tarea[], oldVisibleIds: Set<number>, targetId: number, rankTipo: string): Tarea[] {
    const nextIds = new Set(nextVisible.map(t => t.id))
    const previousFull = activeTasks
      .filter(t => canonicalTipo(t.tipo) === rankTipo && (t.prioridad_orden != null || nextIds.has(t.id)))
      .sort((a, b) => {
        const ao = a.prioridad_orden ?? 999999
        const bo = b.prioridad_orden ?? 999999
        if (ao !== bo) return ao - bo
        return a.id - b.id
      })
    const queue = [...nextVisible]
    const slotIds = oldVisibleIds
    const slotCount = previousFull.filter(task => slotIds.has(task.id)).length
    const merged: Tarea[] = []
    const used = new Set<number>()
    let consumedSlots = 0

    previousFull.forEach(task => {
      if (nextIds.has(task.id) && !slotIds.has(task.id)) return
      if (!slotIds.has(task.id)) {
        merged.push(task)
        used.add(task.id)
        return
      }
      const remainingAfter = slotCount - consumedSlots - 1
      consumedSlots += 1
      const take = task.id === targetId ? Math.max(1, queue.length - remainingAfter) : 1
      for (let i = 0; i < take; i += 1) {
        const next = queue.shift()
        if (next && !used.has(next.id)) {
          merged.push(next)
          used.add(next.id)
        }
      }
    })
    queue.forEach(task => {
      if (!used.has(task.id)) merged.push(task)
    })
    return merged
  }

  async function saveOrder(nextVisible: Tarea[], oldVisibleIds: Set<number>, targetId: number, rankTipo: string) {
    const next = mergeVisibleOrder(nextVisible, oldVisibleIds, targetId, rankTipo)

    setSaving(true)
    const updates = next.map((t, index) => {
      const patch: Record<string, number | boolean | null> = { prioridad_orden: index + 1 }
      if (isAparcada(t)) {
        patch.excluir_plan = false
        patch.excluida_fecha = null
      }
      return supabase.from('tareas').update(patch).eq('id', t.id)
    })
    const results = await Promise.all(updates)
    const error = results.find(result => result.error)?.error
    if (error) {
      alert(`No pude guardar el ranking: ${error.message}`)
      await fetchTareas()
    } else {
      setTareas(prev => {
        const rank = new Map(next.map((t, index) => [t.id, index + 1]))
        const unparkIds = new Set(next.filter(isAparcada).map(t => t.id))
        return prev.map(t => rank.has(t.id) ? {
          ...t,
          prioridad_orden: rank.get(t.id)!,
          ...(unparkIds.has(t.id) ? { excluir_plan: false, excluida_fecha: null } : {}),
        } : t)
      })
      onChanged?.()
    }
    setSaving(false)
  }

  function onDrop(targetId: number, sourceFromEvent?: number) {
    const sourceId = sourceFromEvent || dragId.current
    dragId.current = null
    setDraggingId(null)
    setDragOverId(null)
    if (!sourceId || sourceId === targetId) return
    const sourceRow = visibleRows.find(row => rowPrimaryId(row) === sourceId)
    const targetRow = visibleRows.find(row => rowPrimaryId(row) === targetId)
    if (!sourceRow || !targetRow) return

    const sourceIsUnclassified = rowIsInbox(sourceRow)
    const targetIsUnclassified = rowIsInbox(targetRow)
    const rankTipo = canonicalTipo(sourceRow.task.tipo)
    if (canonicalTipo(targetRow.task.tipo) !== rankTipo) return

    const rankedVisible = visibleRows.filter(row => !rowIsInbox(row) && canonicalTipo(row.task.tipo) === rankTipo)

    if (targetIsUnclassified) {
      if (rankedVisible.length > 0) return
      const inbox = visibleRows.filter(row => rowIsInbox(row) && canonicalTipo(row.task.tipo) === rankTipo)
      const nextRows = inbox.filter(row => rowPrimaryId(row) !== sourceId)
      const targetIndex = nextRows.findIndex(row => rowPrimaryId(row) === targetId)
      if (targetIndex < 0) return
      nextRows.splice(targetIndex, 0, sourceRow)
      const next = nextRows.flatMap(row => row.isGroup ? row.children : [row.task])
      void saveOrder(next, new Set(), targetId, rankTipo)
      return
    }

    const oldVisibleIds = new Set(rankedVisible.flatMap(row => row.isGroup ? row.children.map(child => child.id) : [row.task.id]))
    const nextRows = sourceIsUnclassified
      ? [...rankedVisible]
      : rankedVisible.filter(row => rowPrimaryId(row) !== sourceId)
    const targetIndex = nextRows.findIndex(row => rowPrimaryId(row) === targetId)
    if (targetIndex < 0) return
    nextRows.splice(targetIndex, 0, sourceRow)
    const next = nextRows.flatMap(row => row.isGroup ? row.children : [row.task])
    void saveOrder(next, oldVisibleIds, targetId, rankTipo)
  }

  async function classifyRow(row: DisplayRow) {
    const tasks = row.isGroup ? row.children : [row.children[0] || row.task]
    const rankTipo = canonicalTipo(row.task.tipo)
    const needsRank = tasks.some(task => task.prioridad_orden == null)
    if (!needsRank) {
      setSaving(true)
      const results = await Promise.all(tasks.filter(isAparcada).map(task =>
        supabase.from('tareas').update({ excluir_plan: false, excluida_fecha: null }).eq('id', task.id)
      ))
      const error = results.find(result => result.error)?.error
      if (error) {
        alert(`No pude devolver la tarea al ranking: ${error.message}`)
        await fetchTareas()
      } else {
        const ids = new Set(tasks.map(task => task.id))
        setTareas(prev => prev.map(t => ids.has(t.id) ? { ...t, excluir_plan: false, excluida_fecha: null } : t))
        onChanged?.()
      }
      setSaving(false)
      return
    }
    const rankedVisible = visibleRows.filter(candidate => !rowIsInbox(candidate) && canonicalTipo(candidate.task.tipo) === rankTipo)
    const oldVisibleIds = new Set(rankedVisible.flatMap(candidate => candidate.isGroup ? candidate.children.map(child => child.id) : [candidate.task.id]))
    const nextRows = [...rankedVisible, row]
    const next = nextRows.flatMap(candidate => candidate.isGroup ? candidate.children : [candidate.task])
    const targetId = rowPrimaryId(rankedVisible[rankedVisible.length - 1] || row)
    await saveOrder(next, oldVisibleIds, targetId, rankTipo)
  }

  async function insertIntoRank(row: DisplayRow) {
    const rankTipo = canonicalTipo(row.task.tipo)
    const ranked = typeRows.filter(candidate => !rowIsInbox(candidate) && canonicalTipo(candidate.task.tipo) === rankTipo)
    const oldVisibleIds = new Set(ranked.flatMap(candidate => candidate.isGroup ? candidate.children.map(child => child.id) : [candidate.task.id]))
    const nextRows = [...ranked, row]
    const next = nextRows.flatMap(candidate => candidate.isGroup ? candidate.children : [candidate.task])
    const targetId = rowPrimaryId(ranked[ranked.length - 1] || row)
    await saveOrder(next, oldVisibleIds, targetId, rankTipo)
    setInsertOpen(false)
    setInsertQuery('')
  }

  function toggleLocked(id: number) {
    setLockedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroupLocked(children: Tarea[]) {
    const ids = children.map(child => child.id)
    setLockedIds(prev => {
      const next = new Set(prev)
      const allLocked = ids.every(id => next.has(id))
      ids.forEach(id => {
        if (allLocked) next.delete(id)
        else next.add(id)
      })
      return next
    })
  }

  function toggleExpandedParent(parentId: number) {
    setExpandedParents(prev => {
      const next = new Set(prev)
      if (next.has(parentId)) next.delete(parentId)
      else next.add(parentId)
      return next
    })
  }

  async function repairInvalidFragmentDates(nextDateById = new Map<number, string | null>()): Promise<boolean> {
    const updates: any[] = []

    childrenByParent.forEach((children, parentId) => {
      const sortedChildren = [...children].sort((a, b) => {
        const an = a.fragmento_num ?? 999999
        const bn = b.fragmento_num ?? 999999
        if (an !== bn) return an - bn
        return a.id - b.id
      })
      const hasInvalidCapacityDay = sortedChildren.some(child => {
        const date = nextDateById.get(child.id) || planningDate(child)
        return !!date && capacityForDate(date) <= 0
      })
      if (!hasInvalidCapacityDay || sortedChildren.length === 0) return

      const parent = parentById.get(parentId)
      const baseDate = parent?.fecha_planificada || parent?.deadline || sortedChildren
        .map(child => nextDateById.get(child.id) || planningDate(child))
        .filter((date): date is string => !!date)
        .sort()
        .at(-1)
      if (!baseDate) return

      const targetDates = availableDatesEndingAt(baseDate, sortedChildren.length)
      const usePlannedDate = !!parent?.fecha_planificada || (!parent?.deadline && sortedChildren.some(child => !!child.fecha_planificada))

      sortedChildren.forEach((child, index) => {
        const targetDate = targetDates[index]
        if (!targetDate) return
        const patch: Partial<Tarea> = {}
          if (usePlannedDate) {
            if ((nextDateById.get(child.id) || child.fecha_planificada) !== targetDate) patch.fecha_planificada = targetDate
            nextDateById.set(child.id, targetDate)
          } else {
          if (child.deadline !== targetDate) patch.deadline = targetDate
          if (child.fecha_planificada || nextDateById.has(child.id)) patch.fecha_planificada = null
        }
        if (Object.keys(patch).length > 0) {
          updates.push(supabase.from('tareas').update(patch).eq('id', child.id) as any)
        }
      })
    })

    if (updates.length === 0) return false
    const results = await Promise.all(updates)
    const error = results.find(result => result.error)?.error
    if (error) throw error
    return true
  }

  async function syncParentsToLastPart(dateById: Map<number, string | null>, isCasa: boolean) {
    const parentIds = new Set<number>()
    activeTasks.forEach(task => {
      if (task.parent_id && dateById.has(task.id)) parentIds.add(task.parent_id)
    })
    const updates = [...parentIds].flatMap(parentId => {
      const children = childrenByParent.get(parentId) || []
      const last = children[children.length - 1]
      const parent = parentById.get(parentId)
      if (!last || !parent) return []
      const lastDate = dateById.get(last.id) || (isCasa ? last.fecha_casa : last.fecha_planificada) || null
      if (!lastDate) return []
      if (isCasa) {
        if (parent.fecha_casa === lastDate && parent.para_casa === true) return []
        return [supabase.from('tareas').update({ para_casa: true, fecha_casa: lastDate }).eq('id', parentId)]
      }
      if (parent.fecha_planificada === lastDate) return []
      return [supabase.from('tareas').update({ fecha_planificada: lastDate }).eq('id', parentId)]
    })
    if (updates.length === 0) return
    const results = await Promise.all(updates)
    const error = results.find(result => result.error)?.error
    if (error) throw error
  }

  const counts = RANK_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t] = groupedCountForType(t)
    return acc
  }, {})
  const typeTotalCount = RANK_TYPES.reduce((sum, t) => sum + (counts[t] || 0), 0)

  function daysBadge(t: Tarea) {
    const date = effectiveDate(t)
    const diff = daysUntil(todayKey, date)
    if (diff === null || date === '9999-99-99') return null
    const label = diff === 0 ? 'hoy' : diff === 1 ? 'ma\u00f1ana' : diff < 0 ? `+${Math.abs(diff)}d` : `${diff}d`
    const color = diff < 0 ? 'bg-red-50 text-red-500' : diff <= 3 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
    return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${color}`}>{label}</span>
  }

  function buildAutoProposal() {
    if (circuit === 'todas') return
    const workTypes = tipo === TIPO_TODAS ? BUDGET_TYPES : RANK_TYPES.includes(tipo) ? [tipo] : null
    if (!workTypes) return
    const isCasa = circuit === 'casa'
    const futureRoutineReserveMinutes = (() => {
      if (isCasa) return 0
      try {
        const parsed = parseInt(localStorage.getItem(FUTURE_ROUTINE_RESERVE_KEY) || '120', 10)
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 120
      } catch {
        return 120
      }
    })()

    const rows = buildPlanningProposal({
      tasks: isCasa
        ? activeTasks.map(task => withInheritedCasa(task, parentById)).filter(t => t.para_casa === true)
        : activeTasks.map(task => withInheritedCasa(task, parentById)),
      lockedIds,
      today: new Date(),
      workTypes,
      capacityForDate: isCasa ? casaCapacityForDate : capacityForDate,
      futureRoutineReserveMinutes,
      excludeCasa: !isCasa,
      dateOf: isCasa ? (task => task.fecha_casa || null) : planningDate,
    })

    setProposalCircuit(circuit)
    setProposalScope(workTypes.length === 1 ? workTypes[0] : TIPO_TODAS)
    setProposalTypeFilter(workTypes.length === 1 ? workTypes[0] : TIPO_TODAS)
    setProposal(rows)
  }

  async function applyProposal() {
    if (!proposal) return
    const changes = proposal.filter(row => row.to && row.to !== row.from)
    if (changes.length === 0) {
      setProposal(null)
      return
    }

    setApplyingPlan(true)
    const isCasa = proposalCircuit === 'casa'
    const results = await Promise.all(changes.map(row =>
      isCasa
        ? supabase.from('tareas').update({ fecha_casa: row.to }).eq('id', row.id)
        : supabase.from('tareas').update({ para_casa: false, fecha_casa: null, fecha_planificada: row.to }).eq('id', row.id)
    ))
    const succeeded = changes.filter((_, index) => !results[index].error)
    const failed = changes.filter((_, index) => results[index].error)
    const firstError = results.find(result => result.error)?.error

    if (succeeded.length > 0) {
      const nextDateById = new Map(succeeded.map(row => [row.id, row.to]))
      setTareas(prev => prev.map(t => {
        if (!nextDateById.has(t.id)) return t
        const nextDate = nextDateById.get(t.id) || null
        return isCasa
          ? { ...t, fecha_casa: nextDate }
          : { ...t, para_casa: false, fecha_casa: null, fecha_planificada: nextDate }
      }))
      if (!isCasa) {
        try {
          await repairInvalidFragmentDates(nextDateById)
        } catch (repairError: any) {
          await fetchTareas()
          onChanged?.()
          setApplyingPlan(false)
          alert(`Guardé ${succeeded.length} de ${changes.length}, pero no pude ajustar las partes: ${repairError?.message || 'error desconocido'}`)
          return
        }
      }
      try {
        await syncParentsToLastPart(nextDateById, isCasa)
      } catch (syncError: any) {
        await fetchTareas()
        onChanged?.()
        setApplyingPlan(false)
        alert(`Guardé las partes, pero no pude actualizar el padre: ${syncError?.message || 'error desconocido'}`)
        return
      }
    }

    await fetchTareas()
    onChanged?.()

    if (failed.length === 0) {
      setProposal(null)
    } else {
      alert(`Apliqué ${succeeded.length} de ${changes.length}. Las que fallaron siguen en la propuesta para reintentar.${firstError?.message ? ` ${firstError.message}` : ''}`)
    }
    setApplyingPlan(false)
  }

  const visibleProposalRows = useMemo(() => {
    if (!proposal) return []
    return proposal
      .filter(row => proposalTypeFilter === 'Todas' || canonicalTipo(row.tipo) === proposalTypeFilter)
      .sort((a, b) => {
        if (canonicalTipo(a.tipo) !== canonicalTipo(b.tipo)) return RANK_TYPES.indexOf(canonicalTipo(a.tipo)) - RANK_TYPES.indexOf(canonicalTipo(b.tipo))
        const ar = a.rank || 999999
        const br = b.rank || 999999
        if (ar !== br) return ar - br
        return a.id - b.id
      })
  }, [proposal, proposalTypeFilter])

  function printWorkOrder() {
    const rowsForPrint = [...unclassifiedRows, ...rankedRows]
    if (rowsForPrint.length === 0) {
      alert('No hay tareas visibles para imprimir en este tipo.')
      return
    }

    const totalMinutes = rowsForPrint.reduce((sum, row) => (
      sum + row.children.reduce((childSum, child) => childSum + (child.tiempo_estimado || 0), 0)
    ), 0)
    const visibleParts = rowsForPrint.reduce((sum, row) => sum + (row.isGroup ? row.children.length : 1), 0)

    const rows = rowsForPrint.map((row, index) => {
      const main = rowDateTask(row)
      const date = referenceDate(main)
      const locked = row.isGroup
        ? row.children.length > 0 && row.children.every(child => lockedIds.has(child.id))
        : lockedIds.has(main.id)
      const minutes = row.children.reduce((sum, child) => sum + (child.tiempo_estimado || 0), 0)
      return `
        <tr>
          <td class="idx">${htmlEscape(TYPE_PREFIX[canonicalTipo(row.task.tipo)] || '')} ${index + 1}</td>
          <td class="task">
            <div class="title">${htmlEscape(row.task.tarea)}</div>
          </td>
          <td class="small">${htmlEscape(date ? fDate(date) : '-')}</td>
          <td class="small">${htmlEscape(minToHM(minutes))}</td>
          <td class="blank"><span class="line"></span></td>
          <td class="blank">${locked ? '<span class="locked">No mover</span>' : ''}</td>
        </tr>
      `
    }).join('')

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Orden de trabajo - ${htmlEscape(tipo === TIPO_TODAS ? 'Todos los tipos' : tipo)}</title>
<style>
  @page { size: A4 portrait; margin: 9mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111827;
    font-family: Arial, Helvetica, sans-serif;
  }
  body { width: 210mm; min-height: 297mm; }
  .page { width: 100%; padding: 5mm 4mm 4mm; }
  .top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8mm;
    border-bottom: 2.5px solid #111827;
    padding-bottom: 5mm;
    margin-bottom: 5mm;
  }
  h1 {
    margin: 0;
    font-size: 22px;
    line-height: 1;
    font-weight: 900;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }
  .subtitle {
    margin-top: 2mm;
    color: #6b7280;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .summary {
    display: flex;
    gap: 5mm;
    align-items: flex-end;
    white-space: nowrap;
  }
  .summary strong { display: block; font-size: 14px; line-height: 1.1; }
  .summary span {
    color: #6b7280;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th {
    border: 1.2px solid #111827;
    height: 7.5mm;
    padding: 1.5mm 2mm;
    text-align: left;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  td {
    border: 1px solid #d1d5db;
    height: 14mm;
    padding: 1.5mm 2mm;
    vertical-align: top;
    font-size: 9.5px;
  }
  .idx { width: 13mm; text-align: center; vertical-align: middle; padding: 0; font-weight: 700; }
  .task { width: auto; }
  .title { font-weight: 800; line-height: 1.22; }
  .small { width: 18mm; text-align: center; font-weight: 700; color: #374151; vertical-align: middle; }
  .blank { width: 24mm; color: #111827; text-align: center; vertical-align: middle; }
  .line { display: block; width: 100%; height: 7mm; border-bottom: 1.2px solid #111827; }
  .locked { display: inline-block; border: 1px solid #78716c; border-radius: 999px; padding: 1mm 2mm; color: #44403c; background: #f5f5f4; font-size: 8px; font-weight: 800; }
  @media print {
    html, body { width: 210mm; min-height: 297mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <main class="page">
    <section class="top">
      <div>
        <h1>Orden de trabajo</h1>
        <div class="subtitle">${htmlEscape(tipo === TIPO_TODAS ? 'Todos los tipos' : tipo)} · ${htmlEscape(circuit === 'casa' ? 'Casa' : circuit === 'todas' ? 'Trabajo y Casa' : 'Trabajo')} · ranking actual y hueco para marcar prioridades</div>
      </div>
      <div class="summary">
        <div><strong>${htmlEscape(fDate(todayKey))}</strong><span>Fecha</span></div>
        <div><strong>${rowsForPrint.length}</strong><span>Tareas</span></div>
        <div><strong>${visibleParts}</strong><span>Partes</span></div>
        <div><strong>${htmlEscape(minToHM(totalMinutes))}</strong><span>Estimado</span></div>
      </div>
    </section>
    <table>
      <thead>
        <tr>
          <th style="width:13mm;text-align:center;">Rank</th>
          <th>Tarea</th>
          <th style="width:18mm;text-align:center;">Fecha</th>
          <th style="width:18mm;text-align:center;">Est.</th>
          <th style="width:20mm;">Nueva prio.</th>
          <th style="width:24mm;">Ancla</th>
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
      a.download = `orden_trabajo_${tipo}_${todayKey}.html`
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  if (loading) return <div className="py-16 text-center text-gray-300 text-sm">Cargando orden de trabajo...</div>

  return (
    <div className="border border-gray-100 rounded-2xl bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-300">Circuito</span>
          <div className="inline-flex rounded-xl border border-gray-100 bg-gray-50 p-1">
            {([
              { key: 'trabajo' as const, label: 'Trabajo', count: circuitCounts.trabajo },
              { key: 'casa' as const, label: 'Casa', count: circuitCounts.casa },
              { key: 'todas' as const, label: 'Todas', count: circuitCounts.trabajo + circuitCounts.casa },
            ]).map(option => (
              <button
                key={option.key}
                type="button"
                onClick={() => setCircuit(option.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${circuit === option.key ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700'}`}>
                {option.label}
                <span className={circuit === option.key ? 'text-white/60' : 'text-gray-300'}>{option.count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-300">Tipo</span>
          {RANK_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`text-xs px-3 py-1.5 rounded-full border transition font-semibold flex items-center gap-1.5 ${tipo === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              <span className={`w-2 h-2 rounded-full ${TIPO_DOT[t]}`}></span>
              {t}
              <span className={tipo === t ? 'text-white/60' : 'text-gray-300'}>{counts[t] || 0}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTipo(TIPO_TODAS)}
            className={`text-xs px-3 py-1.5 rounded-full border transition font-semibold flex items-center gap-1.5 ${tipo === TIPO_TODAS ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            Todas
            <span className={tipo === TIPO_TODAS ? 'text-white/60' : 'text-gray-300'}>{typeTotalCount}</span>
          </button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-300">Mes</span>
          <button
            type="button"
            onClick={() => setMonthFilter('todos')}
            className={`text-[11px] px-1.5 py-0.5 font-semibold transition border-b-2 ${monthFilter === 'todos' ? 'border-gray-900 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            Todos
            <span className={`ml-1 ${monthFilter === 'todos' ? 'text-gray-400' : 'text-gray-300'}`}>{monthChips.total}</span>
          </button>
          {monthChips.none > 0 && (
            <button
              type="button"
              onClick={() => setMonthFilter('sin-fecha')}
              className={`text-[11px] px-1.5 py-0.5 font-semibold transition border-b-2 ${monthFilter === 'sin-fecha' ? 'border-gray-900 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              Sin fecha
              <span className={`ml-1 ${monthFilter === 'sin-fecha' ? 'text-gray-400' : 'text-gray-300'}`}>{monthChips.none}</span>
            </button>
          )}
          {monthChips.months.map(month => (
            <button
              key={month.key}
              type="button"
              onClick={() => setMonthFilter(month.key)}
              className={`text-[11px] px-1.5 py-0.5 font-semibold transition border-b-2 capitalize ${monthFilter === month.key ? 'border-gray-900 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {monthChipLabel(month.key)}
              <span className={`ml-1 ${monthFilter === month.key ? 'text-gray-400' : 'text-gray-300'}`}>{month.count}</span>
            </button>
          ))}
        </div>
        {tipo === EVENTO && (reminderGroupChips.names.length > 0 || reminderGroupChips.none > 0) && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-300">Grupo</span>
          <button
            type="button"
            onClick={() => setReminderGroupFilter('todos')}
            className={`text-[11px] px-1.5 py-0.5 font-semibold transition border-b-2 ${reminderGroupFilter === 'todos' ? 'border-gray-900 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            Todos
            <span className={`ml-1 ${reminderGroupFilter === 'todos' ? 'text-gray-400' : 'text-gray-300'}`}>{reminderGroupChips.total}</span>
          </button>
          {reminderGroupChips.names.map(group => (
            <button
              key={group.name}
              type="button"
              onClick={() => setReminderGroupFilter(group.name)}
              className={`text-[11px] px-1.5 py-0.5 font-semibold transition border-b-2 ${reminderGroupFilter === group.name ? 'border-gray-900 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {group.name}
              <span className={`ml-1 ${reminderGroupFilter === group.name ? 'text-gray-400' : 'text-gray-300'}`}>{group.count}</span>
            </button>
          ))}
          {reminderGroupChips.none > 0 && (
            <button
              type="button"
              onClick={() => setReminderGroupFilter('sin-categoria')}
              className={`text-[11px] px-1.5 py-0.5 font-semibold transition border-b-2 ${reminderGroupFilter === 'sin-categoria' ? 'border-gray-900 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              Sin categoría
              <span className={`ml-1 ${reminderGroupFilter === 'sin-categoria' ? 'text-gray-400' : 'text-gray-300'}`}>{reminderGroupChips.none}</span>
            </button>
          )}
        </div>
        )}
        {circuit === 'casa' && (
          <p className="text-[11px] text-gray-400 pl-[4.75rem]">Ranking y Recalcular de Casa. Escribe fecha de casa con la capacidad de Fuera de jornada. El plan de trabajo no se toca.</p>
        )}
        {circuit === 'todas' && (
          <p className="text-[11px] text-gray-400 pl-[4.75rem]">Vista de Trabajo y Casa. Recalcular está en cada circuito. Elige un tipo para arrastrar el ranking; en Todas el mes solo agrupa.</p>
        )}
        {circuit !== 'todas' && tipo !== TIPO_TODAS && tipo !== EVENTO && (
          <p className="text-[11px] text-gray-400 pl-[4.75rem]">Recalcular mueve solo {tipo}. El resto se queda en su fecha y ocupa el día.</p>
        )}
        {circuit !== 'todas' && tipo === EVENTO && (
          <p className="text-[11px] text-gray-400 pl-[4.75rem]">
            {reminderView === 'categoria'
              ? 'Agrupados por categoría. Recalcular sigue el ranking, no este agrupado.'
              : 'Ranking #1, #2… Recalcular: un recordatorio por día laborable, desde mañana.'}
          </p>
        )}
        <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="grid flex-1 min-w-[16rem] grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
          <div
            title={circuit === 'casa'
              ? 'Pendiente de Casa frente a 8h'
              : circuit === 'trabajo'
                ? 'Pendiente de trabajo frente a 56h'
                : 'Suma de trabajo y Casa frente a 64h'}
            className={`rounded-xl border px-3 py-2.5 ${queueTotal.tone.border} ${queueTotal.tone.bg}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Total · {minToHM(queueTotal.budget)}</div>
              <div className={`text-[10px] font-bold ${queueTotal.tone.text}`}>{queueTotal.tone.label} · {queueTotal.pct}%</div>
            </div>
            <div className={`mt-1 text-sm font-bold tabular-nums ${queueTotal.tone.text}`}>
              {minToHM(queueTotal.minutes)}
              <span className="text-gray-300 font-semibold"> / {minToHM(queueTotal.budget)}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className={`h-full ${queueTotal.tone.bar}`} style={{ width: `${Math.min(100, queueTotal.pct)}%` }} />
            </div>
            <div className="mt-1 text-[10px] text-gray-400">{queueTotal.countLabel}</div>
          </div>
          {queueCards.map(card => (
            <div
              key={card.type}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${card.tone.border} ${card.tone.bg} ${tipo === card.type ? 'ring-1 ring-gray-900' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  <span>{TYPE_PREFIX[card.type]} ·</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={minutesToHoursInput(card.budget)}
                    onChange={e => updateQueueBudgetHours(card.type, parseFloat(e.target.value) || 0)}
                    title="Cupo de pendiente de este tipo. No es el tiempo de cada tarea."
                    className="w-11 rounded border border-gray-200 bg-white px-1 py-0.5 text-right text-[10px] font-bold text-gray-600 outline-none focus:border-gray-400"
                  />
                  <span>h</span>
                </label>
                <button
                  type="button"
                  onClick={() => setTipo(card.type)}
                  className={`text-[10px] font-bold ${card.tone.text}`}>
                  {card.tone.label} · {card.pct}%
                </button>
              </div>
              <button
                type="button"
                onClick={() => setTipo(card.type)}
                title={circuit === 'casa'
                  ? `Pendiente de Casa frente a ${minToHM(card.budget)} de ${card.type.toLowerCase()}`
                  : circuit === 'trabajo'
                    ? `Pendiente de trabajo frente a ${minToHM(card.budget)} de ${card.type.toLowerCase()}`
                    : `Pendiente de trabajo y Casa frente a ${minToHM(card.budget)} de ${card.type.toLowerCase()}`}
                className="w-full text-left">
                <div className={`mt-1 text-sm font-bold tabular-nums ${card.tone.text}`}>
                  {minToHM(card.minutes)}
                  <span className="text-gray-300 font-semibold"> / {minToHM(card.budget)}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full ${card.tone.bar}`} style={{ width: `${Math.min(100, card.pct)}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-gray-400">{card.countLabel}</div>
              </button>
            </div>
          ))}
          {agendaKpis.map(kpi => {
            const active = kpi.clickable && tipo === kpi.key
            const bar = TIPO_BAR[kpi.key] || TIPO_BAR.Recordatorio
            return (
              <div
                key={kpi.key}
                className={`rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-left transition ${active ? 'ring-1 ring-gray-900' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{kpi.label}</div>
                  <span className={`text-[10px] font-bold ${bar.text}`}>{kpi.badge}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { if (kpi.clickable) setTipo(kpi.key) }}
                  disabled={!kpi.clickable}
                  title={kpi.hint}
                  className={`w-full text-left ${kpi.clickable ? '' : 'cursor-default'}`}>
                  <div className={`mt-1 text-sm font-bold tabular-nums whitespace-nowrap ${bar.text}`}>
                    {kpi.countLabel}
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full ${bar.bar}`} style={{ width: kpi.count > 0 ? '100%' : '0%' }} />
                  </div>
                  <div className="mt-1 text-[10px] text-gray-400">{kpi.hint}</div>
                </button>
              </div>
            )
          })}
        </div>
          <div className="flex flex-col items-stretch gap-2">
            <button
              onClick={printWorkOrder}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 font-semibold hover:bg-gray-50 hover:text-gray-800 transition">
              Imprimir tipo
            </button>
            {circuit !== 'todas' && (
            <button
              onClick={buildAutoProposal}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-semibold hover:bg-gray-700 transition">
              {tipo === TIPO_TODAS ? 'Recalcular fechas' : `Recalcular ${tipo}`}
            </button>
            )}
            {canInsertType && (
            <button
              type="button"
              onClick={() => { setInsertQuery(''); setInsertOpen(true) }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 font-semibold hover:bg-gray-50 hover:text-gray-900 transition">
              Meter {TYPE_PREFIX[tipo]}
            </button>
            )}
            {saving && <div className="text-xs text-gray-400">Guardando...</div>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar dentro del tipo seleccionado..."
            className="w-full max-w-xl border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 text-gray-700 placeholder:text-gray-300"
          />
          {tipo === EVENTO && (
            <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setReminderView('ranking')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${reminderView === 'ranking' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
                Ranking
              </button>
              <button
                type="button"
                onClick={() => setReminderView('categoria')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${reminderView === 'categoria' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
                Por categoría
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-2">
        {listItems.map((item, rowIndex) => {
          if (item.kind === 'header') {
            const collapsed = collapsedReminderGroups.has(item.block.name)
            const rangeText = formatReminderRange(item.block.range)
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setCollapsedReminderGroups(prev => {
                  const next = new Set(prev)
                  if (next.has(item.block.name)) next.delete(item.block.name)
                  else next.add(item.block.name)
                  return next
                })}
                className="flex w-full items-center gap-2 px-2 pt-4 pb-1 text-left"
                title={collapsed ? 'Mostrar recordatorios' : 'Ocultar recordatorios'}
              >
                <span className="w-3 shrink-0 text-[10px] font-bold text-rose-500">{collapsed ? '▸' : '▾'}</span>
                <span className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-rose-800">{item.block.name}</span>
                <span className="shrink-0 text-[10px] text-rose-400">{item.block.count}</span>
                <div className="h-px flex-1 bg-rose-100" />
                {rangeText
                  ? <span className="whitespace-nowrap text-[11px] tabular-nums text-rose-700">{rangeText}</span>
                  : <span className="whitespace-nowrap text-[11px] text-gray-300">Sin deadline</span>}
              </button>
            )
          }
          const { row, section } = item
          const main = row.children[0] || row.task
          const dateTask = rowDateTask(row)
          const isUnclassified = section === 'unclassified'
          const rankedIndex = isUnclassified ? -1 : rankedRows.findIndex(candidate => candidate.key === row.key)
          const rank = rankByKey.get(row.key) || rankedIndex + 1
          const locked = row.isGroup
            ? row.children.length > 0 && row.children.every(child => lockedIds.has(child.id))
            : lockedIds.has(main.id)
          const dragIdForRow = main.id
          const isDragTarget = dragOverId === dragIdForRow && draggingId !== dragIdForRow
          const expanded = row.isGroup && expandedParents.has(row.task.id)
          const minutes = row.children.reduce((sum, child) => sum + (child.tiempo_estimado || 0), 0)
          const isCasa = row.isGroup
            ? row.children.some(child => child.para_casa === true)
            : main.para_casa === true
          const prevItem = rowIndex > 0 ? listItems[rowIndex - 1] : null
          const showSectionHeader = !item.hideMonth && (rowIndex === 0 || (prevItem?.kind === 'row' && prevItem.section !== section))
          const rowMonth = taskMonthKey(dateTask) || 'sin-fecha'
          const prevMonth = prevItem?.kind === 'row' && prevItem.section === 'ranked'
            ? (taskMonthKey(rowDateTask(prevItem.row)) || 'sin-fecha')
            : null
          const showMonthHeader = !item.hideMonth && tipo !== EVENTO && !isUnclassified && monthFilter === 'todos' && prevMonth !== rowMonth
          const rankedHeader = isUnclassified
            ? 'Por clasificar'
            : monthFilter === 'sin-fecha'
              ? 'Sin fecha'
              : monthFilter === 'todos'
                ? (rowMonth === 'sin-fecha' ? 'Sin fecha' : monthChipLabel(rowMonth))
                : monthChipLabel(monthFilter)
          return (
            <div key={row.key} className="space-y-1">
            {(showSectionHeader || showMonthHeader) && (
              <div className="px-2 pt-2 pb-1 space-y-1">
                {(isUnclassified ? showSectionHeader : showMonthHeader) && (
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-100" />
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-300">
                      {rankedHeader}
                    </div>
                    <div className="h-px flex-1 bg-gray-100" />
                  </div>
                )}
                {isUnclassified && unclassifiedRows.some(u => !rankedRows.some(r => canonicalTipo(r.task.tipo) === canonicalTipo(u.task.tipo))) && (
                  <p className="text-center text-[11px] text-gray-400">Arrastra entre ellas para numerar. No hace falta un #1 previo.</p>
                )}
              </div>
            )}
            <div
              draggable={rankDragEnabled}
              onDragStart={e => {
                if (!rankDragEnabled) return
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(dragIdForRow))
                dragId.current = dragIdForRow
                setDraggingId(dragIdForRow)
              }}
              onDragEnd={() => { dragId.current = null; setDraggingId(null); setDragOverId(null) }}
              onDragOver={e => {
                if (!rankDragEnabled) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverId(dragIdForRow)
              }}
              onDrop={e => {
                if (!rankDragEnabled) return
                e.preventDefault()
                const sourceId = Number(e.dataTransfer.getData('text/plain')) || dragId.current || 0
                onDrop(dragIdForRow, sourceId)
              }}
              className={`grid grid-cols-[7.5rem_minmax(0,1fr)_190px_92px_72px_80px] items-center gap-3 rounded-xl border bg-white px-4 py-3 ${rankDragEnabled ? 'cursor-grab active:cursor-grabbing' : ''} transition ${isDragTarget ? 'border-gray-900 bg-gray-50 shadow-sm' : isCasa ? 'border-slate-200 bg-slate-50/70 shadow-[inset_3px_0_0_#64748b]' : locked ? LOCK_ROW : 'border-gray-100 hover:bg-gray-50'}`}>
              <div className="flex items-center gap-2 shrink-0">
                <span className="grid grid-cols-2 gap-0.5 rounded-md border border-gray-200 bg-gray-50 p-1.5" title="Arrastrar para ordenar">
                  {Array.from({ length: 6 }).map((_, i) => <span key={i} className="h-1 w-1 rounded-full bg-gray-400" />)}
                </span>
                <span className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-bold px-2 py-1 ${isUnclassified ? 'bg-amber-50 text-amber-700 border border-amber-100' : rankBadgeClass(row.task.tipo, locked)}`}>
                  {isUnclassified ? (rowIsUnclassified(row) ? 'Nuevo' : 'Aparcada') : `${TYPE_PREFIX[canonicalTipo(row.task.tipo)] || ''} #${rank}`}
                </span>
              </div>
              <button onClick={() => row.isGroup ? toggleExpandedParent(row.task.id) : onEditTarea?.(main.id)} className="text-left min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {row.isGroup && (
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500"
                      title={expanded ? 'Ocultar partes' : 'Ver partes'}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={expanded ? 'rotate-90' : ''}>
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </span>
                  )}
                  <div className={`min-w-0 truncate text-sm font-semibold ${locked ? LOCK_TITLE : 'text-gray-800'}`}>{row.task.tarea}</div>
                  {canonicalTipo(row.task.tipo) === EVENTO && reminderView === 'ranking' && reminderGroupLabel(row.task) && (
                    <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold text-rose-600">{reminderGroupLabel(row.task)}</span>
                  )}
                  {isCasa && circuit !== 'casa' && <span className="flex-shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Casa</span>}
                  {row.isGroup && (
                    <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">{row.children.length} partes · {minToHM(minutes)}</span>
                  )}
                </div>
              </button>
              <div className="text-xs text-gray-400 truncate flex items-center gap-1.5 justify-end">
                <span>{referenceDateKind(dateTask)} {fDate(effectiveDate(dateTask))}</span>
                {daysBadge(dateTask)}
              </div>
              {isUnclassified ? (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); void classifyRow(row) }}
                  className="justify-self-end rounded-lg border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-100 transition"
                  title="Añadir al final del ranking. Si este tipo aún no tiene #1, arrastra entre las Nuevas para numerarlas.">
                  Clasificar
                </button>
              ) : isCasa && circuit !== 'casa' ? (
                <span
                  className="justify-self-end rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600"
                  title="Fuera del circuito laboral: no entra en recálculo de trabajo">
                  Casa
                </span>
              ) : (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); row.isGroup ? toggleGroupLocked(row.children) : toggleLocked(main.id) }}
                  className={`justify-self-end rounded-lg border px-2 py-1 text-[10px] font-bold transition ${locked ? LOCK_CHIP : 'border-gray-100 bg-white text-gray-300 hover:text-gray-600 hover:border-gray-200'}`}
                  title={locked ? 'La automatizaci\u00f3n no cambiar\u00e1 esta fecha' : 'Bloquear esta tarea en su fecha actual'}>
                  {locked ? 'No mover' : 'Movible'}
                </button>
              )}
              <div className="justify-self-end flex items-center gap-0.5">
                {row.isGroup && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onEditTarea?.(row.task.id) }}
                    title="Editar padre"
                    className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-700 hover:bg-gray-50 transition">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); row.isGroup ? deleteGroup(row.task) : deleteTask(main.id) }}
                  title="Eliminar"
                  className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-200 hover:text-red-400 hover:bg-red-50 transition">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
              </div>
              <div className="text-right text-xs font-semibold text-gray-600">{minToHM(minutes)}</div>
            </div>
            {expanded && (
              <div className="ml-24 space-y-1 border-l-2 border-gray-200 pl-3">
                {row.children.map(child => (
                  <div
                    key={child.id}
                    className="grid w-full grid-cols-[minmax(0,1fr)_120px_80px_72px] items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-2 text-left hover:bg-gray-50 transition">
                    <button onClick={() => onEditTarea?.(child.id)} className="min-w-0 text-left">
                      <div className="truncate text-xs font-semibold text-gray-700">Parte {child.fragmento_num || '-'} de {child.fragmentos_total || row.children.length} - {child.tarea}</div>
                    </button>
                    <div className="text-right text-[11px] text-gray-400">{referenceDateKind(child)} {fDate(effectiveDate(child))}</div>
                    <div className="text-right text-xs font-semibold text-gray-600">{minToHM(child.tiempo_estimado || 0)}</div>
                    <div className="justify-self-end flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onEditTarea?.(child.id)}
                        title="Editar parte"
                        className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-700 hover:bg-gray-50 transition">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePart(child)}
                        title="Eliminar parte"
                        className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-200 hover:text-red-400 hover:bg-red-50 transition">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          )
        })}
        {rowsToRender.length === 0 && (
          <div className="py-14 text-center text-sm text-gray-300 space-y-3">
            <div>No hay {tipo === TIPO_TODAS ? 'tareas' : tipo.toLowerCase() + 's'} para este filtro.</div>
            {canInsertType && (
              <button
                type="button"
                onClick={() => { setInsertQuery(''); setInsertOpen(true) }}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-semibold hover:bg-gray-700 transition">
                Meter {TYPE_PREFIX[tipo]} #{(typeRows.filter(row => !rowIsInbox(row) && canonicalTipo(row.task.tipo) === tipo).length) + 1}
              </button>
            )}
          </div>
        )}
      </div>

      {insertOpen && canInsertType && (
        <div className="fixed inset-0 z-50 bg-gray-900/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Priorizador</div>
                <h3 className="text-lg font-bold text-gray-900 mt-1">Meter {TYPE_PREFIX[tipo]}</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Si no hay {tipo.toLowerCase()}s que arrastrar, crea una o mete una que aún no está numerada. Entra como {TYPE_PREFIX[tipo]} #{(typeRows.filter(row => !rowIsInbox(row) && canonicalTipo(row.task.tipo) === tipo).length) + 1}.
                </p>
              </div>
              <button type="button" onClick={() => setInsertOpen(false)} className="text-gray-400 hover:text-gray-700 text-sm border border-gray-200 rounded-lg px-3 py-2">Cerrar</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <button
                type="button"
                onClick={() => { setInsertOpen(false); onCreateTarea?.(tipo) }}
                className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700 transition">
                Crear {tipo.toLowerCase()} y numerarla
              </button>
              <input
                value={insertQuery}
                onChange={e => setInsertQuery(e.target.value)}
                placeholder={`Buscar ${tipo.toLowerCase()}s sin número...`}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 text-gray-700 placeholder:text-gray-300"
              />
            </div>
            <div className="max-h-[45vh] overflow-auto px-6 pb-5 space-y-2">
              {insertCandidates.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-300">
                  No hay {tipo.toLowerCase()}s sin número en este circuito. Crea una nueva.
                </div>
              ) : insertCandidates.map(row => {
                const main = row.children[0] || row.task
                return (
                  <div key={row.key} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-800 truncate">{row.task.tarea}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{dateMetaLine(rowDateTask(row))}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void insertIntoRank(row)}
                      disabled={saving}
                      className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                      Meter
                    </button>
                    {onEditTarea && (
                      <button
                        type="button"
                        onClick={() => onEditTarea(main.id)}
                        className="shrink-0 text-[10px] font-semibold text-gray-400 hover:text-gray-700">
                        Ver
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {proposal && (
        <div className="fixed inset-0 z-50 bg-gray-900/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-400">{'Propuesta autom\u00e1tica'}</div>
                <h3 className="text-xl font-bold text-gray-900 mt-1">
                  {proposalCircuit === 'casa'
                    ? (proposalScope === TIPO_TODAS ? 'Recalcular Casa por prioridad' : `Recalcular Casa · ${proposalScope}`)
                    : (proposalScope === TIPO_TODAS ? 'Recalcular fechas por prioridad' : `Recalcular ${proposalScope} por prioridad`)}
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  {proposalScope === EVENTO
                    ? 'Recordatorio se mueve: un aviso por día laborable, desde mañana. No ocupa carga. El resto se queda en su fecha. Anclas fijas.'
                    : proposalScope !== TIPO_TODAS
                    ? `${proposalScope} se mueve. El resto se queda en su fecha y ocupa hueco. Rutinarias y anclas fijas. Desde mañana.`
                    : proposalCircuit === 'casa'
                      ? 'Solo tareas en Casa. Anclas fijas. Escribe fecha de casa con la capacidad de Fuera de jornada, desde mañana, rellenando el día y pasando al siguiente.'
                      : 'Rutinarias y anclas fijas. Cada tipo rellena jornada desde mañana y pasa al siguiente. Casa no entra. Recordatorios no se mueven aquí; Recalcular Recordatorio va aparte.'}
                </p>
              </div>
              <button onClick={() => setProposal(null)} className="text-gray-400 hover:text-gray-700 text-sm border border-gray-200 rounded-lg px-3 py-2">Cerrar</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4 border-b border-gray-100">
              <div className="rounded-xl border border-gray-100 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Tareas colocadas</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{proposal.filter(r => r.to).length}</div>
              </div>
              <div className="rounded-xl border border-gray-100 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Cambios reales</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{proposal.filter(r => r.to && r.to !== r.from).length}</div>
              </div>
              <div className="rounded-xl border border-gray-100 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Sin hueco</div>
                <div className={`text-2xl font-bold mt-1 ${proposal.some(r => !r.to) ? 'text-red-500' : 'text-emerald-600'}`}>{proposal.filter(r => !r.to).length}</div>
              </div>
              <div className="rounded-xl border border-gray-100 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Tiempo movible</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{minToHM(proposal.reduce((s, r) => s + r.minutes, 0))}</div>
              </div>
            </div>
            {proposalScope === TIPO_TODAS && (
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {['Todas', ...RANK_TYPES].map(type => {
                  const count = type === 'Todas' ? proposal.length : proposal.filter(row => canonicalTipo(row.tipo) === type).length
                  const active = proposalTypeFilter === type
                  return (
                    <button
                      key={type}
                      onClick={() => setProposalTypeFilter(type)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200 hover:text-gray-800'}`}>
                      {type !== 'Todas' && <span className={`h-2 w-2 rounded-full ${TIPO_DOT[type] || 'bg-gray-300'}`}></span>}
                      {type}
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-400'}`}>{count}</span>
                    </button>
                  )
                })}
              </div>
              <div className="text-xs text-gray-400">
                {visibleProposalRows.length} visibles por ranking
              </div>
            </div>
            )}
            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b border-gray-100">
                  <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="text-left px-6 py-3">Ranking</th>
                    <th className="text-left px-6 py-3">Tarea</th>
                    <th className="text-left px-3 py-3">Tipo</th>
                    <th className="text-right px-3 py-3">Est.</th>
                    <th className="text-left px-3 py-3">Actual</th>
                    <th className="text-left px-3 py-3">Propuesta</th>
                    <th className="text-right px-6 py-3">{'D\u00eda'}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProposalRows.map(row => {
                    const changed = row.to && row.to !== row.from
                    const deltaText = row.delta === null ? '-' : row.delta === 0 ? '=' : row.delta > 0 ? `+${row.delta}d` : `${row.delta}d`
                    return (
                      <tr key={row.id} className={`border-b border-gray-50 ${!row.to ? 'bg-red-50/40' : changed ? 'bg-amber-50/40' : 'bg-white'}`}>
                        <td className="px-6 py-3">
                          <span className={`inline-flex min-w-14 items-center justify-center rounded-lg px-2 py-1 text-xs font-bold ${rankBadgeClass(row.tipo)}`}>
                            {TYPE_PREFIX[row.tipo] || row.tipo.slice(0, 2).toUpperCase()} #{row.rank || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <button onClick={() => onEditTarea?.(row.id)} className="text-left font-semibold text-gray-800 hover:text-gray-900">
                            {row.tarea}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                            <span className={`w-2 h-2 rounded-full ${TIPO_DOT[canonicalTipo(row.tipo)] || 'bg-gray-300'}`}></span>
                            {canonicalTipo(row.tipo)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-gray-600 font-semibold">{minToHM(row.minutes)}</td>
                        <td className="px-3 py-3 text-gray-500">{fDate(row.from)}</td>
                        <td className="px-3 py-3">
                          {row.to ? (
                            <span className="font-semibold text-gray-800">
                              {fDate(row.to)} <span className="text-xs text-gray-400">- {row.saturation}%</span>
                            </span>
                          ) : (
                            <span className="font-semibold text-red-500">Sin hueco</span>
                          )}
                        </td>
                        <td className={`px-6 py-3 text-right text-xs font-bold ${row.delta && row.delta > 0 ? 'text-red-500' : row.delta && row.delta < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{deltaText}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">
              <button onClick={() => setProposal(null)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 bg-white hover:text-gray-700">Cancelar</button>
              <button
                onClick={applyProposal}
                disabled={applyingPlan || proposal.filter(r => r.to && r.to !== r.from).length === 0}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {applyingPlan ? 'Aplicando...' : 'Aplicar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
