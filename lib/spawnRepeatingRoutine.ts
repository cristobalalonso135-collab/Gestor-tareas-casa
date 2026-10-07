import { supabase } from './supabase'
import { datedRoutineTitle, isRoutineType, routineNombreFromTitle } from './taskRules'
import { inferRoutineRepeat, nextRoutineRepeatDate, routineRepeatGroup, ROUTINE_REPEAT_OPTIONS } from './zaragozaCalendar'

const SPAWN_SELECT = 'id, tipo, tarea, notas, prioridad, tiempo_estimado, solicitado_por, grupo, fecha_planificada, deadline, fecha_solicitud, orden'

type SpawnableTask = {
  id: number
  tipo?: string | null
  tarea?: string | null
  notas?: string | null
  prioridad?: string | null
  tiempo_estimado?: number | null
  solicitado_por?: string | null
  grupo?: string | null
  fecha_planificada?: string | null
  deadline?: string | null
  fecha_solicitud?: string | null
  orden?: number | null
}

export type SpawnRepeatNotice = {
  status: 'created' | 'exists'
  title: string
  date: string
  cadence: string
  count?: number
}

export type SpawnRepeatResult =
  | SpawnRepeatNotice
  | { status: 'skipped' }
  | { status: 'error'; message: string }

function cadenceLabel(repeat: string): string {
  return ROUTINE_REPEAT_OPTIONS.find(option => option.value === repeat)?.label || 'Se repite'
}

export async function spawnNextRepeatingRoutineById(id: number): Promise<SpawnRepeatResult> {
  const { data, error } = await supabase.from('tareas').select(SPAWN_SELECT).eq('id', id).maybeSingle()
  if (error) {
    console.error('No pude leer la rutinaria para repetirla', error)
    return { status: 'error', message: error.message }
  }
  if (!data) return { status: 'skipped' }
  return spawnNextRepeatingRoutine(data as SpawnableTask)
}

function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function taskDate(task: { fecha_planificada?: string | null, deadline?: string | null, fecha_solicitud?: string | null }): string {
  return String(task.fecha_planificada || task.deadline || task.fecha_solicitud || '').slice(0, 10)
}

export async function spawnNextRepeatingRoutine(task: SpawnableTask): Promise<SpawnRepeatResult> {
  if (!isRoutineType(task.tipo)) return { status: 'skipped' }
  const rule = inferRoutineRepeat(task)
  if (!rule) return { status: 'skipped' }
  const current = taskDate(task)
  const baseName = routineNombreFromTitle(String(task.tarea || ''))
  if (!current || !baseName) return { status: 'skipped' }

  const { data: siblings, error: siblingsError } = await supabase
    .from('tareas')
    .select('tarea, fecha_planificada, deadline, fecha_solicitud')
    .eq('tipo', task.tipo)
  if (siblingsError) {
    console.error('No pude leer la serie para repetirla', siblingsError)
    return { status: 'error', message: siblingsError.message }
  }
  const latest = (siblings || []).reduce((max, row) => {
    if (routineNombreFromTitle(String(row.tarea || '')) !== baseName) return max
    const date = taskDate(row)
    return date > max ? date : max
  }, '')
  if (latest && current < latest) return { status: 'skipped' }

  const today = todayIso()
  const dates: string[] = []
  let cursor = nextRoutineRepeatDate(current, rule.repeat, rule.weekdays)
  let guard = 0
  while (cursor && cursor < today && guard < 500) {
    dates.push(cursor)
    cursor = nextRoutineRepeatDate(cursor, rule.repeat, rule.weekdays)
    guard += 1
  }
  if (cursor) dates.push(cursor)
  if (dates.length === 0) return { status: 'skipped' }

  const cadence = cadenceLabel(rule.repeat)
  const { data: lastOrden } = await supabase.from('tareas').select('orden').order('orden', { ascending: false }).limit(1)
  let orden = Number(lastOrden?.[0]?.orden || 0)
  const created: string[] = []
  for (const next of dates) {
    const title = datedRoutineTitle(baseName, next)
    const { data: existing, error: existingError } = await supabase.from('tareas').select('id').eq('tarea', title).limit(1)
    if (existingError) {
      console.error('No pude comprobar si ya existe la siguiente rutinaria', existingError)
      return { status: 'error', message: existingError.message }
    }
    if (existing && existing.length > 0) continue
    orden += 1
    const { error: insertError } = await supabase.from('tareas').insert({
      tipo: task.tipo,
      tarea: title,
      notas: task.notas || '',
      prioridad: task.prioridad || 'Media',
      estado: 'Pendiente',
      done: false,
      tiempo_estimado: task.tiempo_estimado || 0,
      tiempo_real: 0,
      tiempo_real_segundos: 0,
      fecha_solicitud: next,
      deadline: next,
      fecha_planificada: next,
      solicitado_por: task.solicitado_por || '',
      grupo: task.grupo || routineRepeatGroup(rule.repeat, rule.weekdays),
      orden,
      en_plan: false,
      excluir_plan: false,
      para_casa: false,
    })
    if (insertError) {
      console.error('No pude crear la siguiente rutinaria', insertError)
      return { status: 'error', message: insertError.message }
    }
    created.push(title)
  }

  const lastDate = dates[dates.length - 1]
  const lastTitle = datedRoutineTitle(baseName, lastDate)
  if (created.length === 0) return { status: 'exists', title: lastTitle, date: lastDate, cadence, count: dates.length }
  return { status: 'created', title: created.length === 1 ? created[0] : lastTitle, date: lastDate, cadence, count: created.length }
}

