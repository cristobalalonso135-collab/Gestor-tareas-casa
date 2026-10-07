export type TaskLike = {
  tipo?: string | null
  estado?: string | null
  done?: boolean | string | null
  deadline?: string | null
  fecha_planificada?: string | null
  para_casa?: boolean | null
  fecha_casa?: string | null
  excluir_plan?: boolean | null
  excluida_fecha?: string | null
  es_padre?: boolean | null
  parent_id?: number | null
  grupo?: string | null
  en_plan?: boolean | null
}

export const ROUTINE_TYPES = ['Diaria', 'Bisemanal', 'Semanal', 'Bimensual', 'Mensual'] as const
export const WORK_TYPES = ['Operativa', 'Táctica', 'Estratégica'] as const
export const EVENT_TYPE = 'Recordatorio'
export const LEGACY_EVENT_TYPE = 'Evento'
export const MEETING_TYPE = 'Reunión'

export const CAPACITY_KEY = 'carga_capacity_overrides'
export const CASA_CAPACITY_OVERRIDES_KEY = 'casa_capacity_overrides'
export const PREVISION_KEY = 'carga_prevision_overrides'
export const FUTURE_ROUTINE_RESERVE_KEY = 'replanificador_future_routine_reserve_minutes'
export const LOCKED_TASKS_KEY = 'orden_trabajo_locked_tasks'
export const REMINDER_GROUP_ORDER_KEY = 'recordatorio_grupo_orden'
export const REMINDER_GROUP_COLLAPSED_KEY = 'recordatorio_grupo_collapsed'
export const LAST_WORKDAY_ROUTINE_GROUP = 'último laborable'

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

export function fDate(value?: string | null, fallback = '-'): string {
  if (!value) return fallback
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return fallback
  return `${d}/${m}/${y}`
}

export function minToHM(min: number): string {
  if (!min) return '0m'
  const safe = Math.max(0, Math.round(min))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function isClosedTask(t: TaskLike): boolean {
  return t.done === true || t.done === 'true' || t.estado === 'Completada' || t.estado === 'Omitida'
}

export function isRoutineType(tipo?: string | null): boolean {
  return !!tipo && ROUTINE_TYPES.includes(tipo as (typeof ROUTINE_TYPES)[number])
}

export function routineNombreFromTitle(nombre: string): string {
  return String(nombre || '').replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}$/, '').trim()
}

export function datedRoutineTitle(nombre: string, dateIso: string): string {
  const name = routineNombreFromTitle(nombre)
  if (!name) return fDate(dateIso)
  return `${name} ${fDate(dateIso)}`
}

export function isLastWorkdayRoutine(t: {
  tipo?: string | null
  tarea?: string | null
  grupo?: string | null
  fecha_planificada?: string | null
  deadline?: string | null
}): boolean {
  if (!isRoutineType(t.tipo)) return false
  return reminderGroupLabel(t).toLowerCase() === LAST_WORKDAY_ROUTINE_GROUP
}

export function isImportedRoutine(t: {
  tipo?: string | null
  tarea?: string | null
  grupo?: string | null
  fecha_planificada?: string | null
  deadline?: string | null
}): boolean {
  return isRoutineType(t.tipo) && !isLastWorkdayRoutine(t)
}

export function isWorkType(tipo?: string | null): boolean {
  return !!tipo && WORK_TYPES.includes(tipo as (typeof WORK_TYPES)[number])
}

export function isEvento(tipo?: string | null): boolean {
  return tipo === EVENT_TYPE || tipo === LEGACY_EVENT_TYPE
}

export function canonicalTipo(tipo?: string | null): string {
  if (isEvento(tipo)) return EVENT_TYPE
  return String(tipo || '')
}

export function tipoIn(tipo: string | null | undefined, list: readonly string[]): boolean {
  const canonical = canonicalTipo(tipo)
  return list.some(item => canonicalTipo(item) === canonical)
}

export function reminderGroupLabel(t: { grupo?: string | null }): string {
  return String(t.grupo || '').trim()
}

export function reminderAnchorDate(t: { deadline?: string | null, fecha_planificada?: string | null }): string {
  const deadline = String(t.deadline || '').slice(0, 10)
  if (deadline) return deadline
  return String(t.fecha_planificada || '').slice(0, 10)
}

export function reminderDateRange(tasks: Array<{ deadline?: string | null, fecha_planificada?: string | null }>) {
  const dates = tasks.map(reminderAnchorDate).filter(Boolean).sort()
  if (dates.length === 0) return { min: '', max: '', days: 0 }
  const min = dates[0]
  const max = dates[dates.length - 1]
  const days = Math.max(0, Math.round((new Date(`${max}T00:00:00`).getTime() - new Date(`${min}T00:00:00`).getTime()) / 86400000))
  return { min, max, days }
}

export function formatReminderRange(range: { min: string, max: string, days: number }): string {
  if (!range.min) return ''
  if (!range.max || range.min === range.max) return fDate(range.min)
  const dayLabel = range.days === 1 ? '1 día' : `${range.days} días`
  return `${fDate(range.min)} → ${fDate(range.max)} · ${dayLabel}`
}

export function isReunion(tipo?: string | null): boolean {
  return tipo === MEETING_TYPE
}

function padClock(value: string): string {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return ''
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`
}

function clockToMinutes(value: string): number | null {
  const clock = padClock(value)
  if (!clock) return null
  const [hours, minutes] = clock.split(':').map(Number)
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function reunionNombreFromTitle(tarea: string): string {
  return String(tarea || '')
    .trim()
    .replace(/^Reuni[oó]n\s+/i, '')
    .replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}$/, '')
    .trim()
}

export function reunionTitle(nombre: string, dateIso: string): string {
  const name = reunionNombreFromTitle(nombre)
  return `Reunión ${name} ${fDate(dateIso)}`.trim()
}

export function parseMeetingSchedule(notas?: string | null): { start: string, end: string, lugar: string, body: string } {
  const raw = String(notas || '')
  const [firstLine, ...rest] = raw.split('\n')
  const match = String(firstLine || '').trim().match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})(?:\s*·\s*(.+))?$/)
  if (!match) return { start: '', end: '', lugar: '', body: raw }
  return {
    start: padClock(match[1]),
    end: padClock(match[2]),
    lugar: String(match[3] || '').trim(),
    body: rest.join('\n').trim(),
  }
}

export function formatMeetingNotes(start: string, end: string, lugar: string, body: string): string {
  const clockStart = padClock(start)
  const clockEnd = padClock(end)
  const head = clockStart && clockEnd
    ? `${clockStart}-${clockEnd}${lugar.trim() ? ` · ${lugar.trim()}` : ''}`
    : ''
  const notes = String(body || '').trim()
  if (head && notes) return `${head}\n${notes}`
  return head || notes
}

export function meetingMinutes(start: string, end: string): number {
  const from = clockToMinutes(start)
  const to = clockToMinutes(end)
  if (from == null || to == null || to <= from) return 0
  return to - from
}

export type MeetingRepeat = 'no' | 'daily' | 'weekly' | 'monthly'

const WEEKDAY_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export function weekdayNameEs(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return WEEKDAY_ES[d.getDay()] || ''
}

export function meetingRepeatDates(startIso: string, untilIso: string, repeat: MeetingRepeat): string[] {
  if (!startIso) return []
  if (repeat === 'no' || !untilIso) return [startIso]
  const start = new Date(`${startIso}T00:00:00`)
  const until = new Date(`${untilIso}T00:00:00`)
  if (Number.isNaN(start.getTime())) return []
  if (Number.isNaN(until.getTime()) || until < start) return [startIso]
  const dates: string[] = []
  const startDay = start.getDate()
  for (let i = 0; i < 80; i += 1) {
    let cursor: Date
    if (repeat === 'daily') cursor = addDays(start, i)
    else if (repeat === 'weekly') cursor = addDays(start, i * 7)
    else {
      cursor = new Date(start.getFullYear(), start.getMonth() + i, startDay)
      if (cursor.getDate() !== startDay) cursor = new Date(start.getFullYear(), start.getMonth() + i + 1, 0)
    }
    if (cursor > until) break
    dates.push(dateKey(cursor))
  }
  return dates.length ? dates : [startIso]
}

export const APARCADA_FECHA = '9999-12-31'

export function isAparcada(t: Pick<TaskLike, 'excluir_plan' | 'excluida_fecha'>): boolean {
  if (t.excluir_plan !== true) return false
  const raw = String(t.excluida_fecha || '').trim()
  return raw.slice(0, 10) === APARCADA_FECHA
}

export function isoDay(value?: string | null): string {
  return String(value || '').slice(0, 10)
}

export function isDateTodayOrPast(value: string | null | undefined, today: string): boolean {
  const day = isoDay(value)
  return !!day && day <= today
}

export function isExcludedFromPlanOn(t: Pick<TaskLike, 'excluir_plan' | 'excluida_fecha'>, today: string): boolean {
  return t.excluir_plan === true && isoDay(t.excluida_fecha) === today
}

export function isInWorkPlanToday(t: TaskLike, today: string): boolean {
  if (isClosedTask(t) || t.es_padre === true || t.para_casa === true || isAparcada(t)) return false
  if (isExcludedFromPlanOn(t, today)) return false
  if (t.fecha_planificada) return isDateTodayOrPast(t.fecha_planificada, today)
  if (t.deadline) return isDateTodayOrPast(t.deadline, today)
  return t.en_plan === true
}

export function isInCasaToday(t: TaskLike, today: string): boolean {
  if (isClosedTask(t) || t.es_padre === true || t.para_casa !== true || isAparcada(t)) return false
  return isDateTodayOrPast(t.fecha_casa || today, today)
}

export function planningDate(t: TaskLike): string | null {
  return t.fecha_planificada || t.deadline || null
}

export function referenceDate(t: TaskLike): string | null {
  if (t.fecha_casa) return t.fecha_casa
  return t.fecha_planificada || t.deadline || null
}

export function referenceDateKind(t: TaskLike): 'Casa' | 'Plan' | 'DL' {
  if (t.fecha_casa) return 'Casa'
  if (t.fecha_planificada) return 'Plan'
  return 'DL'
}

export function effectiveDate(t: TaskLike): string {
  return referenceDate(t) || '9999-99-99'
}

export function withInheritedCasa<T extends TaskLike>(task: T, parentById: Map<number, T>): T {
  if (task.para_casa === true || !task.parent_id) return task
  const parent = parentById.get(task.parent_id)
  if (parent?.para_casa !== true) return task
  return {
    ...task,
    para_casa: true,
    fecha_casa: task.fecha_casa || parent.fecha_casa || null,
  }
}

export function defaultWorkCapacity(date: Date): number {
  const day = date.getDay()
  if (day === 0 || day === 6) return 0
  return 180
}

export function defaultCasaCapacity(date: Date): number {
  const day = date.getDay()
  if (day === 0 || day === 1 || day === 2 || day === 3) return 120
  return 0
}

export function defaultWorkdayForecast(date: Date): number {
  const day = date.getDay()
  if (day === 0 || day === 6) return 0
  return 480
}

export function loadStatus(used: number, capacity: number) {
  if (capacity <= 0) {
    return used > 0
      ? { label: 'Exceso', bar: 'bg-red-400', text: 'text-red-500', color: 'text-red-500', bg: 'bg-red-50/50', border: 'border-red-200' }
      : { label: 'Sin capacidad', bar: 'bg-gray-200', text: 'text-gray-400', color: 'text-gray-400', bg: 'bg-gray-50/60', border: 'border-gray-100' }
  }

  const pct = Math.round((used / capacity) * 100)
  if (pct <= 95) return { label: 'Bien', bar: 'bg-emerald-400', text: 'text-emerald-600', color: 'text-emerald-600', bg: 'bg-emerald-50/50', border: 'border-emerald-100' }
  if (pct <= 105) return { label: 'Justo', bar: 'bg-amber-400', text: 'text-amber-600', color: 'text-amber-600', bg: 'bg-amber-50/50', border: 'border-amber-200' }
  return { label: 'Exceso', bar: 'bg-red-400', text: 'text-red-500', color: 'text-red-500', bg: 'bg-red-50/50', border: 'border-red-200' }
}
