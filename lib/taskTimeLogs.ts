import { supabase } from './supabase'

export type TaskTimeOrigin = 'ejecucion' | 'manual' | 'historico'

export type TaskTimeLog = {
  id?: number
  tarea_id: number
  fecha: string
  minutos: number
  segundos: number
  origen: TaskTimeOrigin
}

function toSeconds(value: number) {
  return Math.max(0, Math.floor(value || 0))
}

function toMinutes(seconds: number) {
  return Math.max(0, Math.round(seconds / 60))
}

export function logSeconds(log?: { segundos?: number | null, minutos?: number | null } | null): number {
  if (!log) return 0
  return Math.max(0, Math.floor(Number(log.segundos ?? Number(log.minutos || 0) * 60)))
}

export function minutesFromSeconds(seconds: number) {
  return toMinutes(seconds)
}

export function taskSecondsFromTask(task?: { tiempo_real?: number | null, tiempo_real_segundos?: number | null } | null): number {
  if (!task) return 0
  return Math.max(0, Math.floor(Number(task.tiempo_real_segundos ?? Number(task.tiempo_real || 0) * 60)))
}

export function logsTotalSeconds(logs?: TaskTimeLog[] | null): number {
  return (logs || []).reduce((sum, log) => sum + logSeconds(log), 0)
}

export function todayRealSeconds(
  logs: TaskTimeLog[] | undefined,
  today: string,
  task?: { tiempo_real?: number | null, tiempo_real_segundos?: number | null },
  minutesToday?: number,
): number {
  const fromLog = logSeconds((logs || []).find(log => log.fecha === today))
  const fromMap = Math.max(0, Math.round(minutesToday || 0)) * 60
  const otherDays = (logs || []).filter(log => log.fecha !== today).reduce((sum, log) => sum + logSeconds(log), 0)
  const impliedToday = Math.max(0, taskSecondsFromTask(task) - otherDays)
  return Math.max(fromLog, fromMap, impliedToday)
}

export function taskRealSeconds(
  task?: { tiempo_real?: number | null, tiempo_real_segundos?: number | null },
  logs?: TaskTimeLog[] | null,
): number {
  return Math.max(taskSecondsFromTask(task), logsTotalSeconds(logs))
}

export const TASK_TIME_UPDATED_EVENT = 'gestor-task-time-updated'

export type TaskTimeUpdatedDetail = {
  tareaId: number
  fecha: string
  segundos: number
  totalSegundos: number
}

export function emitTaskTimeUpdated(detail: TaskTimeUpdatedDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TASK_TIME_UPDATED_EVENT, { detail }))
}

export async function addTaskSecondsForDate(tareaId: number, fecha: string, seconds: number, origen: TaskTimeOrigin = 'ejecucion') {
  const safeSeconds = toSeconds(seconds)
  if (!tareaId || !fecha || safeSeconds <= 0) return

  const { data: existing, error: selectError } = await supabase
    .from('tarea_tiempos')
    .select('id,minutos,segundos')
    .eq('tarea_id', tareaId)
    .eq('fecha', fecha)
    .maybeSingle()

  if (selectError) {
    console.warn('No se pudo leer tarea_tiempos:', selectError)
    return
  }

  if (existing?.id) {
    const nextSeconds = Number(existing.segundos ?? Number(existing.minutos || 0) * 60) + safeSeconds
    const { error } = await supabase
      .from('tarea_tiempos')
      .update({ segundos: nextSeconds, minutos: toMinutes(nextSeconds), origen })
      .eq('id', existing.id)
    if (error) console.warn('No se pudo actualizar tarea_tiempos:', error)
    return
  }

  const { error } = await supabase
    .from('tarea_tiempos')
    .insert({ tarea_id: tareaId, fecha, segundos: safeSeconds, minutos: toMinutes(safeSeconds), origen })

  if (error) console.warn('No se pudo insertar tarea_tiempos:', error)
}

export async function setTaskSecondsForDate(tareaId: number, fecha: string, seconds: number, origen: TaskTimeOrigin = 'manual') {
  const safeSeconds = toSeconds(seconds)
  if (!tareaId || !fecha) return

  const { data: existing, error: selectError } = await supabase
    .from('tarea_tiempos')
    .select('id')
    .eq('tarea_id', tareaId)
    .eq('fecha', fecha)
    .maybeSingle()

  if (selectError) {
    console.warn('No se pudo leer tarea_tiempos:', selectError)
    return
  }

  const values = { segundos: safeSeconds, minutos: toMinutes(safeSeconds), origen }
  if (existing?.id) {
    const { error } = await supabase.from('tarea_tiempos').update(values).eq('id', existing.id)
    if (error) console.warn('No se pudo ajustar tarea_tiempos:', error)
    return
  }

  const { error } = await supabase.from('tarea_tiempos').insert({ tarea_id: tareaId, fecha, ...values })
  if (error) console.warn('No se pudo insertar tarea_tiempos:', error)
}

function isClosedTaskRow(task: { estado?: string | null, done?: boolean | string | null }) {
  return task.done === true || task.done === 'true' || task.estado === 'Completada' || task.estado === 'Omitida'
}

export async function removeLogsAfterCompletion(
  tasks: Array<{ id: number, fecha_finalizacion?: string | null, estado?: string | null, done?: boolean | string | null }>,
  logsByTask: Record<number, TaskTimeLog[]>,
): Promise<number> {
  const ids: number[] = []
  for (const task of tasks) {
    if (!isClosedTaskRow(task)) continue
    const finished = String(task.fecha_finalizacion || '').slice(0, 10)
    for (const log of logsByTask[task.id] || []) {
      if (!log.id) continue
      if (!finished || log.fecha > finished) ids.push(log.id)
    }
  }
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from('tarea_tiempos').delete().in('id', ids.slice(i, i + 100))
    if (error) console.warn('No se pudieron borrar logs posteriores al cierre:', error)
  }
  return ids.length
}

// Compatibilidad con los formularios que siguen trabajando en minutos enteros.
export function addTaskMinutesForDate(tareaId: number, fecha: string, minutes: number) {
  return addTaskSecondsForDate(tareaId, fecha, Math.max(0, Math.round(minutes || 0)) * 60, 'manual')
}

export function setTaskMinutesForDate(tareaId: number, fecha: string, minutes: number) {
  return setTaskSecondsForDate(tareaId, fecha, Math.max(0, Math.round(minutes || 0)) * 60, 'manual')
}

export async function fetchTaskMinutesForDate(fecha: string): Promise<Record<number, number>> {
  const { data, error } = await supabase
    .from('tarea_tiempos')
    .select('tarea_id,minutos,segundos')
    .eq('fecha', fecha)

  if (error) {
    console.warn('No se pudo cargar tarea_tiempos del dia:', error)
    return {}
  }

  return (data || []).reduce((acc: Record<number, number>, row: any) => {
    acc[Number(row.tarea_id)] = minutesFromSeconds(logSeconds(row))
    return acc
  }, {})
}

export async function fetchAllTaskTimeLogs(): Promise<TaskTimeLog[]> {
  const rows: TaskTimeLog[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('tarea_tiempos')
      .select('id,tarea_id,fecha,minutos,segundos,origen')
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + 999)

    if (error) {
      console.warn('No se pudo cargar tarea_tiempos:', error)
      return rows
    }

    const page = data || []
    for (const row of page) {
      const segundos = logSeconds(row)
      rows.push({
        id: row.id,
        tarea_id: Number(row.tarea_id),
        fecha: row.fecha,
        minutos: toMinutes(segundos),
        segundos,
        origen: row.origen === 'ejecucion' || row.origen === 'manual' ? row.origen : 'historico',
      })
    }

    if (page.length < 1000) break
    from += 1000
  }

  return rows
}

export async function fetchTaskTimeLogs(tareaIds: number[]): Promise<Record<number, TaskTimeLog[]>> {
  const ids = [...new Set(tareaIds.filter(Boolean))]
  if (ids.length === 0) return {}

  const acc: Record<number, TaskTimeLog[]> = {}
  const chunkSize = 200

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('tarea_tiempos')
        .select('id,tarea_id,fecha,minutos,segundos,origen')
        .in('tarea_id', chunk)
        .order('fecha', { ascending: false })
        .range(from, from + 999)

      if (error) {
        console.warn('No se pudo cargar historial de tarea_tiempos:', error)
        break
      }

      const page = data || []
      for (const row of page) {
        const tareaId = Number(row.tarea_id)
        if (!acc[tareaId]) acc[tareaId] = []
        const segundos = logSeconds(row)
        acc[tareaId].push({
          id: row.id,
          tarea_id: tareaId,
          fecha: row.fecha,
          minutos: toMinutes(segundos),
          segundos,
          origen: row.origen === 'ejecucion' || row.origen === 'manual' ? row.origen : 'historico',
        })
      }

      if (page.length < 1000) break
      from += 1000
    }
  }

  return acc
}
