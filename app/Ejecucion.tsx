'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAllTareas } from '@/lib/supabaseTasks'
import { emitTaskTimeUpdated, fetchTaskTimeLogs, logSeconds, minutesFromSeconds, setTaskSecondsForDate, type TaskTimeLog } from '@/lib/taskTimeLogs'
import { withInheritedCasa, isAparcada, canonicalTipo } from '@/lib/taskRules'
import { spawnNextRepeatingRoutineById, type SpawnRepeatNotice } from '@/lib/spawnRepeatingRoutine'
import { TIPO_DOT } from '@/lib/tipoColors'
import { groupTasksByRoutine, routinePlanSort } from './routineBlocks'
import RoutineSpawnNotice from './RoutineSpawnNotice'

type Tarea = {
  id: number
  tipo: string
  tarea: string
  estado: string
  tiempo_estimado: number
  tiempo_real?: number | null
  tiempo_real_segundos?: number | null
  deadline?: string | null
  fecha_planificada?: string | null
  fecha_finalizacion?: string | null
  done?: boolean | string | null
  orden?: number | null
  en_plan?: boolean | null
  excluir_plan?: boolean | null
  excluida_fecha?: string | null
  para_casa?: boolean | null
  fecha_casa?: string | null
  es_padre?: boolean | null
  parent_id?: number | null
  notas?: string | null
}

type Props = {
  onEditTarea?: (id: number) => void
  refreshKey?: number
  jornadaMin?: number
  cronoSeconds?: number
}

type FocusStore = {
  ids: number[]
  activeId: number | null
  running: boolean
  startedAt: number | null
  sessionDate?: string
  accumulated: Record<string, number>
}

type BlockSummary = {
  estimatedBlock: number
  registeredBlock: number
  estimatedCompleted: number
  realCompleted: number
  completedDiff: number
  completionPct: number
  completed: number
  omitted: number
  pending: number
  total: number
}

const STORAGE_KEY = 'gestor_foco_bloque_v2'

function cleanDateValue(value?: string | null): string {
  if (!value) return ''
  const raw = String(value).trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const es = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (es) {
    const d = es[1].padStart(2, '0')
    const m = es[2].padStart(2, '0')
    const y = es[3]
    return `${y}-${m}-${d}`
  }
  return raw.slice(0, 10)
}

function minToHM(min: number): string {
  const safe = Math.max(0, Math.round(min || 0))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function secondsToClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function secondsToInput(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const minutes = Math.floor(safe / 60)
  const secs = safe % 60
  return secs ? `${minutes}:${String(secs).padStart(2, '0')}` : String(minutes)
}

function parseDurationInput(value: string): number {
  const text = value.trim()
  if (!text) return 0
  const parts = text.split(':').map(Number)
  if (parts.length === 2 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 60 + parts[1])
  if (parts.length === 3 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2])
  return Math.max(0, Math.round(Number(text) || 0) * 60)
}

function fDate(d?: string | null): string {
  if (!d) return ''
  const [y, m, dd] = cleanDateValue(d).split('-')
  return `${dd}/${m}/${y}`
}

function htmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function defaultStore(): FocusStore {
  return { ids: [], activeId: null, running: false, startedAt: null, accumulated: {} }
}

function readStore(): FocusStore {
  if (typeof window === 'undefined') return defaultStore()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultStore()
    const parsed = JSON.parse(raw)
  return {
      ids: Array.isArray(parsed.ids) ? parsed.ids.map(Number).filter(Boolean) : [],
      activeId: parsed.activeId ? Number(parsed.activeId) : null,
      running: !!parsed.running,
      startedAt: parsed.startedAt ? Number(parsed.startedAt) : null,
      sessionDate: typeof parsed.sessionDate === 'string' ? parsed.sessionDate : undefined,
      accumulated: parsed.accumulated && typeof parsed.accumulated === 'object' ? parsed.accumulated : {},
    }
  } catch {
    return defaultStore()
  }
}

function writeStore(store: FocusStore) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export default function Ejecucion({ onEditTarea, refreshKey, cronoSeconds = 0 }: Props) {
  const [today, setToday] = useState(localDateKey())
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [store, setStore] = useState<FocusStore>(defaultStore)
  const [timeLogsByTask, setTimeLogsByTask] = useState<Record<number, TaskTimeLog[]>>({})
  const [hydrated, setHydrated] = useState(false)
  const [, setNowTick] = useState(Date.now())
  const [dragId, setDragId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [manualMinutes, setManualMinutes] = useState('')
  const [blockSummary, setBlockSummary] = useState<BlockSummary | null>(null)
  const [spawnNotice, setSpawnNotice] = useState<SpawnRepeatNotice | null>(null)
  const storeRef = useRef<FocusStore>(defaultStore())

  function commitStore(next: FocusStore) {
    const dated = { ...next, sessionDate: today }
    storeRef.current = dated
    setStore(dated)
    writeStore(dated)
    return dated
  }

  function updateStore(updater: (current: FocusStore) => FocusStore) {
    return commitStore(updater(storeRef.current))
  }

  useEffect(() => {
    const saved = readStore()
    const initialDate = localDateKey()
    const sameDay = !saved.sessionDate || saved.sessionDate === initialDate
    const normalized = sameDay
      ? { ...saved, sessionDate: initialDate }
      : { ...saved, running: false, startedAt: null, sessionDate: initialDate, accumulated: {} }
    setStore(normalized)
    storeRef.current = normalized
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || storeRef.current.sessionDate === today) return
    const current = storeRef.current
    const next = { ...current, running: false, startedAt: null, sessionDate: today, accumulated: {} }
    storeRef.current = next
    setStore(next)
    writeStore(next)
  }, [hydrated, today])

  useEffect(() => {
    const onBlockUpdated = (event: Event) => {
      const next = (event as CustomEvent<FocusStore>).detail
      if (!next || !Array.isArray(next.ids)) return
      storeRef.current = next
      setStore(next)
    }
    window.addEventListener('gestor-foco-bloque-updated', onBlockUpdated)
    return () => window.removeEventListener('gestor-foco-bloque-updated', onBlockUpdated)
  }, [])

  useEffect(() => {
    storeRef.current = store

    // Importante:
    // No escribimos localStorage hasta haber leído el estado guardado.
    // Si no, al cambiar de pestaña se monta el componente con defaultStore()
    // y borra el bloque activo antes de recuperarlo.
    if (!hydrated) return

    writeStore(store)
  }, [store, hydrated])

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const refreshToday = () => setToday(localDateKey())
    refreshToday()
    const id = setInterval(refreshToday, 60000)
    return () => clearInterval(id)
  }, [])

  const fetchTareas = useCallback(async () => {
    setLoading(true)
    const rows = await fetchAllTareas<Tarea>('*', query => query.order('orden', { ascending: true }).order('id', { ascending: false }))
    setTareas(rows)
    setTimeLogsByTask(await fetchTaskTimeLogs(rows.map(t => t.id)))
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTareas()
  }, [fetchTareas, refreshKey])

  useEffect(() => {
    const refreshAfterTaskChange = () => { fetchTareas() }
    window.addEventListener('gestor-tareas-updated', refreshAfterTaskChange)
    return () => window.removeEventListener('gestor-tareas-updated', refreshAfterTaskChange)
  }, [fetchTareas])

  const isDone = useCallback((t: Tarea) => {
    return t.done === true || (t.done as any) === 'true' || t.estado === 'Completada'
  }, [])

  const isClosed = useCallback((t: Tarea) => {
    return isDone(t) || t.estado === 'Omitida'
  }, [isDone])

  const parentById = useMemo(() => {
    const map = new Map<number, Tarea>()
    tareas.forEach(t => {
      if (t.es_padre === true) map.set(t.id, t)
    })
    return map
  }, [tareas])

  const dateIsTodayOrPast = useCallback((value?: string | null): boolean => {
    const d = cleanDateValue(value)
    return !!d && d <= today
  }, [today])

  const isPlanCandidate = useCallback((t: Tarea) => {
    if (t.es_padre === true) return false
    if (isClosed(t)) return false
    if (isAparcada(t)) return false
    const excluidaHoy = !!t.excluir_plan && cleanDateValue(t.excluida_fecha) === today
    if (excluidaHoy) return false
    if (withInheritedCasa(t, parentById).para_casa === true) return false
    if (t.fecha_planificada) return dateIsTodayOrPast(t.fecha_planificada)
    if (t.deadline) return dateIsTodayOrPast(t.deadline)
    return !!t.en_plan
  }, [dateIsTodayOrPast, isClosed, parentById, today])

  function currentSecondsFor(id: number, sourceStore = store) {
    const base = Number(sourceStore.accumulated[String(id)] ?? todaySecondsForTask(id))
    if (sourceStore.running && sourceStore.activeId === id && sourceStore.startedAt) {
      return base + Math.max(0, Math.floor((Date.now() - sourceStore.startedAt) / 1000))
    }
    return base
  }

  function persistRunningSlice() {
    if (!hydrated) return
    void persistCurrentTime(storeRef.current)
  }

  const persistRunningSliceRef = useRef(persistRunningSlice)
  persistRunningSliceRef.current = persistRunningSlice

  useEffect(() => {
    const onHide = () => persistRunningSliceRef.current()
    const onShow = () => setNowTick(Date.now())
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide()
      else onShow()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHide)
    window.addEventListener('focus', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('focus', onShow)
    }
  }, [])

  function historicalSecondsForTask(id: number): number {
    const task = tareas.find(t => t.id === id)
    const logs = timeLogsByTask[id] || []
    const todaySeconds = todaySecondsForTask(id)
    const pastLoggedSeconds = logs
      .filter(log => log.fecha !== today)
      .reduce((sum, log) => sum + logSeconds(log), 0)
    const taskSeconds = Number(task?.tiempo_real_segundos ?? Number(task?.tiempo_real || 0) * 60)
    return Math.max(pastLoggedSeconds, Math.max(0, taskSeconds - todaySeconds))
  }

  function totalWithTodaySeconds(id: number, todaySeconds: number): number {
    return historicalSecondsForTask(id) + Math.max(0, Math.floor(todaySeconds || 0))
  }

  useEffect(() => {
    if (!hydrated || loading) return
    const activeId = storeRef.current.activeId
    const activeTask = tareas.find(task => task.id === activeId)
    if (activeTask && isClosed(activeTask)) {
      const current = storeRef.current
      const next = { ...current, activeId: null, running: false, startedAt: null }
      storeRef.current = next
      setStore(next)
      writeStore(next)
    }
  }, [hydrated, isClosed, loading, tareas])

  async function persistCurrentTime(sourceStore = store) {
    const currentId = sourceStore.activeId
    if (!currentId) return sourceStore
    const seconds = currentSecondsFor(currentId, sourceStore)
    const nextStore: FocusStore = {
      ...sourceStore,
      accumulated: { ...sourceStore.accumulated, [String(currentId)]: seconds },
      startedAt: sourceStore.running ? Date.now() : null,
    }
    commitStore(nextStore)
    const todaySeconds = Math.max(0, Math.floor(seconds))
    await setTaskSecondsForDate(currentId, today, todaySeconds, 'ejecucion')
    setTimeLogsByTask(prev => {
      const currentLogs = prev[currentId] || []
      const todayLog = currentLogs.find(log => log.fecha === today)
      const nextLogs = todayLog
        ? currentLogs.map(log => log.fecha === today ? { ...log, segundos: todaySeconds, minutos: Math.round(todaySeconds / 60), origen: 'ejecucion' as const } : log)
        : [{ tarea_id: currentId, fecha: today, segundos: todaySeconds, minutos: Math.round(todaySeconds / 60), origen: 'ejecucion' as const }, ...currentLogs]
      return { ...prev, [currentId]: nextLogs }
    })
    const totalSeconds = totalWithTodaySeconds(currentId, seconds)
    await supabase.from('tareas').update({ tiempo_real: minutesFromSeconds(totalSeconds), tiempo_real_segundos: totalSeconds }).eq('id', currentId)
    emitTaskTimeUpdated({ tareaId: currentId, fecha: today, segundos: todaySeconds, totalSegundos: totalSeconds })
    return nextStore
  }

  async function addToBlock(t: Tarea) {
    updateStore(prev => {
      if (prev.ids.includes(t.id)) return prev
      return {
        ...prev,
        ids: [...prev.ids, t.id],
        accumulated: { ...prev.accumulated, [String(t.id)]: currentSecondsFor(t.id, prev) },
      }
    })
    await supabase.from('tareas').update({ estado: 'En progreso' }).eq('id', t.id)
    await fetchTareas()
  }

  async function removeFromBlock(id: number) {
    await persistCurrentTime(storeRef.current)
    updateStore(prev => {
      const nextAccumulated = { ...prev.accumulated }
      delete nextAccumulated[String(id)]
      return {
        ...prev,
        ids: prev.ids.filter(x => x !== id),
        activeId: prev.activeId === id ? null : prev.activeId,
        running: prev.activeId === id ? false : prev.running,
        startedAt: prev.activeId === id ? null : prev.startedAt,
        accumulated: nextAccumulated,
      }
    })
    const t = tareas.find(x => x.id === id)
    if (t && !isClosed(t)) await supabase.from('tareas').update({ estado: 'Pendiente' }).eq('id', id)
    await fetchTareas()
  }

  async function startTask(id: number) {
    const current = storeRef.current
    if (current.activeId && current.activeId !== id) await persistCurrentTime(current)
    updateStore(prev => ({
      ...prev,
      activeId: id,
      running: true,
      startedAt: Date.now(),
        accumulated: {
          ...prev.accumulated,
          [String(id)]: currentSecondsFor(id, prev),
      },
    }))
    await supabase.from('tareas').update({ estado: 'En progreso' }).eq('id', id)
    await fetchTareas()
  }

  async function pauseActive() {
    const latest = await persistCurrentTime(storeRef.current)
    commitStore({ ...latest, running: false, startedAt: null })
  }

  async function resumeActive() {
    const current = storeRef.current
    if (!current.activeId) return
    commitStore({ ...current, running: true, startedAt: Date.now() })
  }

  async function setActiveManualTime() {
    const current = storeRef.current
    const currentId = current.activeId
    if (!currentId) return
    const nextTodaySeconds = parseDurationInput(manualMinutes)
    const nextStore: FocusStore = {
      ...current,
      startedAt: current.running ? Date.now() : null,
      accumulated: { ...current.accumulated, [String(currentId)]: nextTodaySeconds },
    }
    commitStore(nextStore)
    await setTaskSecondsForDate(currentId, today, nextTodaySeconds)
    setTimeLogsByTask(prev => {
      const currentLogs = prev[currentId] || []
      const todayLog = currentLogs.find(log => log.fecha === today)
      const nextLogs = todayLog
        ? currentLogs.map(log => log.fecha === today ? { ...log, segundos: nextTodaySeconds, minutos: Math.round(nextTodaySeconds / 60), origen: 'manual' as const } : log)
        : [{ tarea_id: currentId, fecha: today, segundos: nextTodaySeconds, minutos: Math.round(nextTodaySeconds / 60), origen: 'manual' as const }, ...currentLogs]
      return { ...prev, [currentId]: nextLogs }
    })
    const totalSeconds = totalWithTodaySeconds(currentId, nextTodaySeconds)
    await supabase.from('tareas').update({ tiempo_real: minutesFromSeconds(totalSeconds), tiempo_real_segundos: totalSeconds }).eq('id', currentId)
    emitTaskTimeUpdated({ tareaId: currentId, fecha: today, segundos: nextTodaySeconds, totalSegundos: totalSeconds })
  }

  async function completeTask(id: number) {
    const latest = await persistCurrentTime(storeRef.current)
    const seconds = currentSecondsFor(id, latest)
    const taskSeconds = Math.max(0, Math.floor(seconds))
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('tareas')
      .update({ done: true, estado: 'Completada', tiempo_real: minutesFromSeconds(totalWithTodaySeconds(id, taskSeconds)), tiempo_real_segundos: totalWithTodaySeconds(id, taskSeconds), fecha_finalizacion: today, hora_finalizacion: now })
      .eq('id', id)
    if (error) {
      alert(`No pude completar la tarea: ${error.message}`)
      return
    }
    await setTaskSecondsForDate(id, today, taskSeconds, 'ejecucion')
    await spawnNextRepeatingRoutineById(id).then(result => {
      if (result.status === 'error') {
        alert(`Completé esta, pero no pude crear la siguiente: ${result.message}`)
        return
      }
      if (result.status === 'created' || result.status === 'exists') setSpawnNotice(result)
    })
    updateStore(prev => ({
      ...prev,
      activeId: prev.activeId === id ? null : prev.activeId,
      running: prev.activeId === id ? false : prev.running,
      startedAt: prev.activeId === id ? null : prev.startedAt,
      accumulated: { ...prev.accumulated, [String(id)]: taskSeconds },
    }))
    await fetchTareas()
  }

  async function resetBlock() {
    if (!confirm('¿Cerrar el bloque actual? Las completadas se quedan completadas y las no completadas vuelven a Pendiente.')) return
    const latest = await persistCurrentTime(storeRef.current)
    const blockTasks = latest.ids.map(id => tareas.find(t => t.id === id)).filter(Boolean) as Tarea[]
    const completedTasks = blockTasks.filter(t => isDone(t))
    const estimatedBlock = blockTasks.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
    const registeredBlock = blockTasks.reduce((s, t) => s + Math.round(currentSecondsFor(t.id, latest) / 60), 0)
    const estimatedCompleted = completedTasks.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
    const realCompleted = completedTasks.reduce((s, t) => s + Math.round(currentSecondsFor(t.id, latest) / 60), 0)
    const completed = completedTasks.length
    const omitted = blockTasks.filter(t => t.estado === 'Omitida').length
    const pending = Math.max(0, blockTasks.length - completed - omitted)
    const completionPct = blockTasks.length > 0 ? Math.round(((completed + omitted) / blockTasks.length) * 100) : 0

    setBlockSummary({
      estimatedBlock,
      registeredBlock,
      estimatedCompleted,
      realCompleted,
      completedDiff: realCompleted - estimatedCompleted,
      completionPct,
      completed,
      omitted,
      pending,
      total: blockTasks.length,
    })

    const activeOpenIds = blockTasks.filter(t => !isClosed(t)).map(t => t.id)
    if (activeOpenIds.length > 0) await supabase.from('tareas').update({ estado: 'Pendiente' }).in('id', activeOpenIds)
    commitStore(defaultStore())
    await fetchTareas()
  }

  function onDropIntoBlock(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const id = dragId || Number(e.dataTransfer.getData('text/plain'))
    const task = tareas.find(t => t.id === id)
    if (task) addToBlock(task)
    setDragId(null)
    setDragOverId(null)
  }

  const focusTasks = useMemo(() => {
    const byId = new Map(tareas.map(t => [t.id, t]))
    return store.ids.map(id => byId.get(id)).filter(Boolean) as Tarea[]
  }, [tareas, store.ids])

  // El bloque conserva las cerradas para poder resumirlo al terminar, pero la
  // lista operativa solo enseña tareas pendientes que siguen en Plan del día.
  const visibleFocusTasks = useMemo(() => {
    return focusTasks.filter(t => !isClosed(t) && isPlanCandidate(t))
  }, [focusTasks, isClosed, isPlanCandidate])

  const candidateTasks = useMemo(() => {
    const inBlock = new Set(store.ids)
    return tareas.filter(t => isPlanCandidate(t)).filter(t => !inBlock.has(t.id)).sort(routinePlanSort)
  }, [isPlanCandidate, tareas, store.ids])

  const candidateSections = useMemo(() => groupTasksByRoutine(candidateTasks), [candidateTasks])

  const todayTotalPending = candidateTasks.length + visibleFocusTasks.length
  const todayPendingOutsideBlock = candidateTasks.length

  function reorderBlockTask(sourceId: number, targetId: number) {
    if (!sourceId || !targetId || sourceId === targetId) return
    const visibleIds = visibleFocusTasks.map(t => t.id)
    const sourceIndex = visibleIds.indexOf(sourceId)
    const targetIndex = visibleIds.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0) return

    const nextVisibleIds = [...visibleIds]
    const [moved] = nextVisibleIds.splice(sourceIndex, 1)
    nextVisibleIds.splice(targetIndex, 0, moved)

    const visibleSet = new Set(visibleIds)
    updateStore(prev => {
      let nextVisibleIndex = 0
      return {
        ...prev,
        ids: prev.ids.map(id => visibleSet.has(id) ? nextVisibleIds[nextVisibleIndex++] : id),
      }
    })
    setDragId(null)
    setDragOverId(null)
  }

  async function reorderTodayTask(sourceId: number, targetId: number) {
    if (!sourceId || !targetId || sourceId === targetId) return
    const sourceIndex = candidateTasks.findIndex(t => t.id === sourceId)
    const targetIndex = candidateTasks.findIndex(t => t.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return

    const nextCandidates = [...candidateTasks]
    const [moved] = nextCandidates.splice(sourceIndex, 1)
    nextCandidates.splice(targetIndex, 0, moved)

    const candidateSlots = candidateTasks
      .map(t => tareas.findIndex(row => row.id === t.id))
      .filter(index => index >= 0)
      .sort((a, b) => a - b)
    const nextRows = [...tareas]
    const updates = nextCandidates.map((task, index) => {
      const slot = candidateSlots[index]
      const previousOrder = tareas[slot]?.orden
      const orden = previousOrder == null ? slot + 1 : previousOrder
      nextRows[slot] = { ...task, orden }
      return { id: task.id, orden }
    })

    setTareas(nextRows)
    setDragId(null)
    setDragOverId(null)
    await Promise.all(updates.map(({ id, orden }) => supabase.from('tareas').update({ orden }).eq('id', id)))
  }

  function todaySecondsForTask(id: number): number {
    const log = (timeLogsByTask[id] || []).find(item => item.fecha === today)
    return Number(logSeconds(log))
  }

  function todayMinutesForTask(id: number): number {
    return Math.round(todaySecondsForTask(id) / 60)
  }

  function logSummaryForTask(id: number): string {
    const logs = timeLogsByTask[id] || []
    if (logs.length === 0) return ''
    return logs.slice(0, 3).map(log => `${fDate(log.fecha)} ${minToHM(minutesFromSeconds(logSeconds(log)))}`).join(' · ')
  }

  const activeTask = focusTasks.find(t => t.id === store.activeId) || null
  const timedTaskId = activeTask?.id ?? store.activeId
  const activeSeconds = timedTaskId ? currentSecondsFor(timedTaskId) : 0
  useEffect(() => {
    if (!activeTask) {
      setManualMinutes('')
      return
    }
    setManualMinutes(secondsToInput(currentSecondsFor(activeTask.id)))
    // Solo sincronizamos al cambiar de tarea; mientras corre el crono, el input queda editable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTask?.id])

  const totalEstimated = focusTasks.filter(t => !isClosed(t)).reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
  const totalReal = focusTasks.reduce((s, t) => s + Math.round(currentSecondsFor(t.id) / 60), 0)

  // Resumen de rendimiento del bloque:
  // compara solo tareas cerradas/completadas, no pendientes.
  const finishedTasks = focusTasks.filter(t => isClosed(t))
  const estimatedFinished = finishedTasks.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
  const realFinished = finishedTasks.reduce((s, t) => s + Math.round(currentSecondsFor(t.id) / 60), 0)
  const finishedDiff = realFinished - estimatedFinished

  const completedCount = focusTasks.filter(t => isDone(t)).length
  const blockTone = totalEstimated <= 60 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : totalEstimated <= 80 ? 'text-amber-600 bg-amber-50 border-amber-100' : 'text-red-500 bg-red-50 border-red-100'
  const dayCronoMin = Math.floor((cronoSeconds || 0) / 60)
  const nextHourBlockMin = dayCronoMin > 0 && dayCronoMin % 60 === 0 ? 60 : 60 - (dayCronoMin % 60)
  const routeProgress = Math.min(100, Math.round((totalEstimated / 80) * 100))
  const routeLabel = totalEstimated < 45
    ? `Añade ${minToHM(45 - totalEstimated)} para montar bloque`
    : totalEstimated < 60
      ? `Corto: faltan ${minToHM(60 - totalEstimated)} para 1h`
      : totalEstimated <= 80
        ? 'Bloque equilibrado'
        : `${minToHM(totalEstimated - 80)} sobre 80m`
  const routeBar = totalEstimated < 45 ? 'bg-gray-300' : totalEstimated < 60 ? 'bg-sky-400' : totalEstimated <= 80 ? 'bg-emerald-400' : 'bg-red-400'
  const blockTargetMin = totalEstimated === 0 ? 60 : Math.max(60, Math.ceil(totalEstimated / 60) * 60)
  const blockDeltaMin = totalEstimated - blockTargetMin
  const focusFitLabel = totalEstimated === 0
    ? 'Añade tareas al foco'
    : blockDeltaMin === 0
      ? `Bloque de ${minToHM(blockTargetMin)} exacto`
      : blockDeltaMin > 0
        ? `Sobran ${minToHM(blockDeltaMin)} de ${minToHM(blockTargetMin)}`
        : `Faltan ${minToHM(Math.abs(blockDeltaMin))} para ${minToHM(blockTargetMin)}`

  async function printExecutionBlock() {
    const printTasks = visibleFocusTasks
    if (printTasks.length === 0) {
      alert('No hay tareas en el bloque para imprimir.')
      return
    }

    await persistCurrentTime(storeRef.current)
    const totalEstimatedPrint = printTasks.reduce((sum, task) => sum + (task.tiempo_estimado || 0), 0)
    const rows = printTasks.map((task, index) => {
      return `
        <tr>
          <td class="idx">${index + 1}</td>
          <td class="task">
            <div class="title">${htmlEscape(task.tarea)}</div>
            <div class="meta">${htmlEscape(task.tipo)}</div>
          </td>
          <td class="time">${htmlEscape(minToHM(task.tiempo_estimado || 0))}</td>
          <td class="blank"></td>
        </tr>
      `
    }).join('')

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Bloque de ejecucion - ${htmlEscape(fDate(today))}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
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
    height: 8mm;
    padding: 1.5mm 2mm;
    text-align: left;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  td {
    border: 1px solid #d1d5db;
    height: 16mm;
    padding: 1.8mm 2.2mm;
    vertical-align: top;
    font-size: 9.5px;
  }
  .idx {
    width: 9mm;
    text-align: center;
    vertical-align: middle;
    padding: 0;
    font-weight: 800;
  }
  .task { width: auto; }
  .title { font-weight: 800; line-height: 1.25; }
  .meta { margin-top: 1mm; color: #6b7280; font-size: 8.5px; line-height: 1.25; }
  .time {
    width: 22mm;
    text-align: center;
    vertical-align: middle;
    font-weight: 800;
  }
  .blank { width: 32mm; }
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
        <h1>Bloque de ejecucion</h1>
        <div class="subtitle">Sesion actual de foco</div>
      </div>
      <div class="summary">
        <div><strong>${htmlEscape(fDate(today))}</strong><span>Fecha</span></div>
        <div><strong>${printTasks.length}</strong><span>Tareas</span></div>
        <div><strong>${htmlEscape(minToHM(totalEstimatedPrint))}</strong><span>Estimado</span></div>
      </div>
    </section>
    <table>
      <thead>
        <tr>
          <th style="width:9mm;text-align:center;">#</th>
          <th>Tarea / detalle</th>
          <th style="width:22mm;text-align:center;">Est.</th>
          <th style="width:32mm;">Real</th>
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
      a.download = `bloque_ejecucion_${today}.html`
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-300 text-sm">
        Cargando bloque...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(360px,0.9fr)] gap-6 items-start">
        <section className="border border-gray-100 rounded-2xl bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-white to-gray-50/70">
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-gray-500">Tarea actual</div>
            </div>
            {activeTask && <button onClick={() => onEditTarea?.(activeTask.id)} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-50">Abrir tarea</button>}
          </div>

          <div className="p-7">
            {activeTask ? (
              <>
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-3"><span className={`w-2 h-2 rounded-full ${TIPO_DOT[canonicalTipo(activeTask.tipo)] || 'bg-gray-300'}`} /><span className="text-xs text-gray-400 font-semibold">{canonicalTipo(activeTask.tipo)} · estimada {minToHM(activeTask.tiempo_estimado || 0)}</span></div>
                  <h2 className="text-2xl font-bold text-gray-900 leading-tight max-w-3xl">{activeTask.tarea}</h2>
                  {activeTask.notas && <p className="text-sm text-gray-400 mt-2">{activeTask.notas}</p>}
                  <p className="text-xs text-gray-400 mt-2">
                    Hoy {minToHM(todayMinutesForTask(activeTask.id))} · Total {minToHM(Math.round(activeSeconds / 60))}
                    {logSummaryForTask(activeTask.id) && <span> · {logSummaryForTask(activeTask.id)}</span>}
                  </p>
                </div>

                <div className="mb-8"><div className="text-7xl font-mono font-bold tracking-tight text-gray-900">{secondsToClock(activeSeconds)}</div><div className="text-sm text-gray-400 mt-2">cronómetro de hoy · hoy guardado {minToHM(todayMinutesForTask(activeTask.id))}</div></div>

                <div className="flex items-center gap-3">
                  {store.running && store.activeId === activeTask.id ? <button onClick={pauseActive} className="px-5 py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600">Pausar</button> : <button onClick={resumeActive} className="px-5 py-3 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-700">Reanudar</button>}
                  <button onClick={() => completeTask(activeTask.id)} className="px-5 py-3 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600">Completar</button>
                  <div className="ml-auto flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <span className="text-xs font-medium text-gray-400">Ajustar</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manualMinutes}
                      onChange={e => setManualMinutes(e.target.value)}
                      placeholder="min o m:ss"
                      className="w-24 bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm font-semibold text-gray-900 outline-none focus:border-gray-400"
                    />
                    <span className="text-xs text-gray-400">min / m:ss</span>
                    <button onClick={setActiveManualTime} className="text-xs bg-white border border-gray-200 px-2.5 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100">Aplicar</button>
                  </div>
                </div>
              </>
            ) : store.activeId ? (
              <div className="min-h-[360px] flex flex-col items-center justify-center text-center px-10">
                <div className="text-7xl font-mono font-bold tracking-tight text-gray-900">{secondsToClock(activeSeconds)}</div>
                <p className="text-sm text-gray-400 mt-3">{store.running ? 'Sigue contando. Cargando la tarea…' : 'Cargando la tarea…'}</p>
              </div>
            ) : (
              <div onDragOver={e => e.preventDefault()} onDrop={onDropIntoBlock} className="min-h-[360px] rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center px-10">
                <div className="text-5xl mb-4">🎯</div><h2 className="text-xl font-bold text-gray-900">Elige una tarea del bloque</h2><p className="text-sm text-gray-400 mt-2 max-w-md">Haz clic en una tarea de Sesión del bloque para empezar. El tiempo se guarda aunque cambies de tarea.</p>
              </div>
            )}

            {visibleFocusTasks.length > 0 && (
              <div className="mt-10 border-t border-gray-100 pt-5">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider font-bold text-gray-500">Sesión del bloque</div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="text-xs rounded-full bg-gray-900 px-3 py-1.5 font-semibold text-white">Estimado bloque {minToHM(totalEstimated)}</span>
                      <span className="text-xs rounded-full bg-gray-50 border border-gray-100 px-2.5 py-1 text-gray-500">Real {minToHM(totalReal)}</span>
                      <span className="text-xs rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-600">Restante {minToHM(totalEstimated)}</span>
                      <span className="text-xs text-gray-400">{completedCount}/{focusTasks.length} completadas</span>
                      <span className="text-xs rounded-full border border-gray-100 bg-white px-2.5 py-1 text-gray-500">Est. completadas {minToHM(estimatedFinished)}</span>
                      <span className="text-xs rounded-full border border-gray-100 bg-white px-2.5 py-1 text-gray-500">Real completadas {minToHM(realFinished)}</span>
                      <span className={`text-xs rounded-full border px-2.5 py-1 font-semibold ${finishedDiff <= 0 ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-red-100 bg-red-50 text-red-500'}`}>
                        Dif. {finishedDiff === 0 ? '=' : finishedDiff > 0 ? `+${minToHM(finishedDiff)}` : `-${minToHM(Math.abs(finishedDiff))}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={printExecutionBlock} className="text-xs border border-gray-200 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">Imprimir bloque</button>
                    <button onClick={resetBlock} className="text-xs border border-gray-200 text-gray-500 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">Cerrar bloque</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {visibleFocusTasks.map(t => {
                    const seconds = currentSecondsFor(t.id)
                    const active = t.id === store.activeId
                    const closed = isClosed(t)
                    return (
                      <div
                        key={t.id}
                        draggable={!closed}
                        onDragStart={e => {
                          if (closed) return
                          setDragId(t.id)
                          e.dataTransfer.setData('text/plain', String(t.id))
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={e => {
                          if (closed) return
                          e.preventDefault()
                          setDragOverId(t.id)
                        }}
                        onDrop={e => {
                          e.preventDefault()
                          e.stopPropagation()
                          reorderBlockTask(Number(e.dataTransfer.getData('text/plain')) || dragId || 0, t.id)
                        }}
                        onDragEnd={() => {
                          setDragId(null)
                          setDragOverId(null)
                        }}
                        className={`w-full flex items-start justify-between gap-3 px-4 py-3 rounded-xl border transition ${active ? 'border-gray-900 bg-gray-50' : closed ? 'border-gray-100 bg-white opacity-60' : dragOverId === t.id && dragId !== t.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100 bg-white hover:bg-gray-50'} ${closed ? '' : 'cursor-grab active:cursor-grabbing'}`}
                      >
                        <span className="mt-0.5 text-gray-300 text-sm leading-5 select-none">⋮⋮</span>
                        <button onClick={() => !closed && startTask(t.id)} className="min-w-0 flex-1 text-left">
                          <div className={`text-sm font-semibold whitespace-normal break-words leading-5 ${closed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {closed ? '✓ ' : active ? '⏳ ' : '○ '}{t.tarea}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{canonicalTipo(t.tipo)} · estimada {minToHM(t.tiempo_estimado || 0)} · hoy {minToHM(todayMinutesForTask(t.id))}</div>
                        </button>
                        <div className="flex items-center gap-3 pt-0.5">
                          <div className="text-sm font-mono font-bold text-gray-700 whitespace-nowrap">{secondsToClock(seconds)}</div>
                          {!closed && (
                            <button onClick={() => removeFromBlock(t.id)} className="text-xs border border-gray-200 text-gray-400 px-2.5 py-1.5 rounded-lg hover:border-red-100 hover:bg-red-50 hover:text-red-500">
                              Quitar
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section onDragOver={e => e.preventDefault()} onDrop={onDropIntoBlock} className="hidden border border-gray-100 rounded-2xl bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider font-bold text-gray-500">Bloque actual</div>
                  <div className="text-xs text-gray-400 mt-1">Cronómetro día {minToHM(dayCronoMin)} · siguiente bloque natural {minToHM(nextHourBlockMin)}</div>
                </div>
                <div className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${blockTone}`}>{minToHM(totalEstimated)}</div>
              </div>
              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full ${routeBar}`} style={{ width: `${routeProgress}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-gray-400">{focusFitLabel || routeLabel}</div>
              </div>
            </div>
            <div className="p-4">
{focusTasks.length === 0 ? <div className="border-2 border-dashed border-gray-200 rounded-xl py-12 text-center text-gray-300 text-sm">Arrastra tareas aquí</div> : <div className="space-y-2">{focusTasks.map(t => { const active = t.id === store.activeId; const closed = isClosed(t); const seconds = currentSecondsFor(t.id); const summary = logSummaryForTask(t.id); return <div key={t.id} className={`rounded-xl border p-3 transition ${active ? 'border-gray-900 bg-gray-50' : closed ? 'border-gray-100 bg-gray-50/50' : 'border-gray-100 bg-white'}`}><div className="flex items-start justify-between gap-3"><button onClick={() => !closed && startTask(t.id)} className="min-w-0 text-left flex-1"><div className="flex items-start gap-2"><span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${closed ? 'bg-emerald-400' : active ? 'bg-gray-900' : TIPO_DOT[t.tipo] || 'bg-gray-300'}`} /><span className={`text-sm font-semibold whitespace-normal break-words leading-5 ${closed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{t.tarea}</span></div><div className="text-xs text-gray-400 mt-1 ml-4">{t.tipo} · estimada {minToHM(t.tiempo_estimado || 0)} · total {seconds > 0 ? minToHM(Math.round(seconds / 60)) : '0m'} · hoy {minToHM(todayMinutesForTask(t.id))}</div>{summary && <div className="text-[10px] text-gray-300 mt-0.5 ml-4">{summary}</div>}</button>{!closed && <button onClick={() => completeTask(t.id)} className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-gray-700">Completar</button>}</div><div className="flex items-center justify-between mt-3 ml-4">{!closed ? <button onClick={() => startTask(t.id)} className="text-xs text-gray-500 hover:text-gray-900">{active ? 'Activa' : 'Empezar'}</button> : <span className="text-xs text-emerald-500 font-semibold">Completada</span>}<button onClick={() => removeFromBlock(t.id)} className="text-xs text-gray-300 hover:text-red-400">Quitar</button></div></div> })}</div>}
              <div className="mt-4"><button onClick={resetBlock} className="w-full text-xs border border-gray-200 text-gray-600 px-3 py-2.5 rounded-lg hover:bg-gray-50 font-medium">Cerrar bloque</button></div>
            </div>
          </section>

          <section className="border border-gray-100 rounded-2xl bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50/70"><div className="flex items-start justify-between gap-3"><div><div className="text-xs uppercase tracking-wider font-bold text-gray-500">Tareas de hoy</div><div className="text-xs text-gray-400 mt-1">Añade lo siguiente al foco cuando te quepa.</div></div><div className="flex flex-wrap justify-end gap-2"><div className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-100 bg-white text-gray-700">{todayPendingOutsideBlock}/{todayTotalPending} por añadir</div><div className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-100 bg-white text-gray-700">Cronómetro día {minToHM(dayCronoMin)}</div></div></div></div>
            <div className="p-3 space-y-3">{loading ? <div className="py-10 text-center text-gray-300 text-sm">Cargando...</div> : candidateTasks.length === 0 ? <div className="py-10 text-center text-gray-300 text-sm">No hay tareas pendientes para añadir</div> : candidateSections.map(section => (
              <div key={section.key} className="space-y-2">
                <div className={`px-1 text-[10px] uppercase tracking-wider font-bold ${section.key === 'resto' ? 'text-gray-300' : 'text-gray-400'}`}>
                  {section.label}
                </div>
                {section.tasks.map(t => <div key={t.id} draggable onDragStart={e => { setDragId(t.id); e.dataTransfer.setData('text/plain', String(t.id)) }} onDragOver={e => { e.preventDefault(); setDragOverId(t.id) }} onDrop={e => { e.preventDefault(); reorderTodayTask(Number(e.dataTransfer.getData('text/plain')) || dragId || 0, t.id) }} onDragEnd={() => { setDragId(null); setDragOverId(null) }} className={`rounded-xl border px-3 py-3 hover:bg-gray-50 cursor-grab transition ${dragOverId === t.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-start gap-2"><span className="mt-0.5 text-gray-300 text-sm leading-5">⋮⋮</span><span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${TIPO_DOT[t.tipo] || 'bg-gray-300'}`} /><div className="text-sm font-semibold text-gray-800 whitespace-normal break-words leading-5">{t.tarea}</div></div><div className="text-xs text-gray-400 mt-1 ml-9">{t.tipo} · {minToHM(t.tiempo_estimado || 0)}</div></div><button onClick={() => addToBlock(t)} className="text-xs font-medium text-gray-300 hover:text-gray-600">Añadir</button></div></div>)}
              </div>
            ))}</div>
          </section>
        </aside>
      </div>
      {blockSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Bloque cerrado</div>
                <h2 className="mt-1 text-2xl font-bold text-gray-900">Resumen del bloque</h2>
              </div>
              <button onClick={() => setBlockSummary(null)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50">Cerrar</button>
            </div>

            <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Estimado bloque</div>
                <div className="mt-2 text-2xl font-bold text-gray-900">{minToHM(blockSummary.estimatedBlock)}</div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Registrado bloque</div>
                <div className="mt-2 text-2xl font-bold text-gray-900">{minToHM(blockSummary.registeredBlock)}</div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Cerradas</div>
                <div className="mt-2 text-2xl font-bold text-gray-900">{blockSummary.completed + blockSummary.omitted}/{blockSummary.total}</div>
              </div>
              <div className={`rounded-xl border px-4 py-4 ${blockSummary.completedDiff <= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Dif. completadas</div>
                <div className={`mt-2 text-2xl font-bold ${blockSummary.completedDiff <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {blockSummary.completedDiff === 0 ? '=' : blockSummary.completedDiff > 0 ? `+${minToHM(blockSummary.completedDiff)}` : `-${minToHM(Math.abs(blockSummary.completedDiff))}`}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 px-6 py-5">
              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Estimado completadas</div>
                  <div className="mt-1 text-xl font-bold text-gray-900">{minToHM(blockSummary.estimatedCompleted)}</div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Real completadas</div>
                  <div className="mt-1 text-xl font-bold text-gray-900">{minToHM(blockSummary.realCompleted)}</div>
                </div>
              </div>
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-700">Avance del bloque</span>
                <span className="font-bold text-gray-900">{blockSummary.completionPct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full bg-gray-900" style={{ width: `${blockSummary.completionPct}%` }} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-600">{blockSummary.completed} completadas</span>
                <span className="rounded-full bg-gray-50 px-3 py-1.5 font-semibold text-gray-500">{blockSummary.omitted} omitidas</span>
                <span className="rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-600">{blockSummary.pending} pendientes devueltas</span>
              </div>
            </div>
          </div>
        </div>
      )}
      <RoutineSpawnNotice notice={spawnNotice} onAccept={() => setSpawnNotice(null)} />
    </div>
  )
}
