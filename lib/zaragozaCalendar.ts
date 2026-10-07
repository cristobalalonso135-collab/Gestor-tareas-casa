import { isRoutineType, LAST_WORKDAY_ROUTINE_GROUP } from './taskRules'

export const LAST_WORKDAY_ROUTINE_MONTHS = 60

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function keyFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function dateKey(date: Date): string {
  return keyFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const FIXED_HOLIDAYS: Array<[number, number]> = [
  [1, 1],
  [1, 6],
  [1, 29],
  [3, 5],
  [4, 23],
  [5, 1],
  [8, 15],
  [10, 12],
  [11, 1],
  [12, 6],
  [12, 8],
  [12, 25],
]

function withMondayTransfer(date: Date): Date[] {
  const day = date.getDay()
  if (day === 0) return [date, addDays(date, 1)]
  if (day === 6) return [date, addDays(date, 2)]
  return [date]
}

const holidayCache = new Map<number, Set<string>>()

export function zaragozaHolidayKeys(year: number): Set<string> {
  const cached = holidayCache.get(year)
  if (cached) return cached
  const keys = new Set<string>()
  const easter = easterSunday(year)
  const movable = [addDays(easter, -3), addDays(easter, -2)]
  const fixed = FIXED_HOLIDAYS.map(([month, day]) => new Date(year, month - 1, day))
  ;[...fixed, ...movable].forEach(date => {
    withMondayTransfer(date).forEach(item => keys.add(dateKey(item)))
  })
  holidayCache.set(year, keys)
  return keys
}

export function isZaragozaWorkday(value: Date | string): boolean {
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00`) : value
  if (Number.isNaN(date.getTime())) return false
  const day = date.getDay()
  if (day === 0 || day === 6) return false
  return !zaragozaHolidayKeys(date.getFullYear()).has(dateKey(date))
}

export function lastZaragozaWorkday(year: number, monthIndex0: number): string {
  const cursor = new Date(year, monthIndex0 + 1, 0)
  while (!isZaragozaWorkday(cursor)) {
    cursor.setDate(cursor.getDate() - 1)
  }
  return dateKey(cursor)
}

export function lastZaragozaWorkdaysFrom(fromIso: string, months = LAST_WORKDAY_ROUTINE_MONTHS): string[] {
  const from = String(fromIso || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return []
  const start = new Date(`${from}T00:00:00`)
  if (Number.isNaN(start.getTime())) return []
  const dates: string[] = []
  let year = start.getFullYear()
  let month = start.getMonth()
  for (let i = 0; i < months + 2 && dates.length < months; i += 1) {
    const day = lastZaragozaWorkday(year, month)
    if (day >= from) dates.push(day)
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }
  return dates
}

export type RoutineRepeat = 'no' | 'workdays' | 'weekly' | 'weekdays' | 'biweekly' | 'last-workday' | 'monthly'
export type ActiveRoutineRepeat = Exclude<RoutineRepeat, 'no'>
export type ParsedRoutineRepeat = { repeat: ActiveRoutineRepeat, weekdays: number[] }

export const ROUTINE_REPEAT_OPTIONS: { value: RoutineRepeat, label: string }[] = [
  { value: 'no', label: 'No, solo esta' },
  { value: 'workdays', label: 'Cada día laborable (Zaragoza)' },
  { value: 'weekly', label: 'Cada semana' },
  { value: 'weekdays', label: 'Días concretos' },
  { value: 'biweekly', label: 'Cada 2 semanas (mismo día)' },
  { value: 'last-workday', label: 'Último laborable del mes (Zaragoza)' },
  { value: 'monthly', label: 'Cada mes (mismo día)' },
]

const ROUTINE_REPEAT_GROUP_PREFIX = 'repetir:'

export function routineRepeatGroup(repeat: RoutineRepeat, weekdays?: number[]): string {
  if (repeat === 'no') return ''
  if (repeat === 'last-workday') return LAST_WORKDAY_ROUTINE_GROUP
  if (repeat === 'weekdays') {
    const days = [...new Set((weekdays || []).filter(day => day >= 0 && day <= 6))].sort((a, b) => a - b)
    return `${ROUTINE_REPEAT_GROUP_PREFIX}weekdays:${days.join('-')}`
  }
  return `${ROUTINE_REPEAT_GROUP_PREFIX}${repeat}`
}

export function parseRoutineRepeatGroup(grupo?: string | null): ParsedRoutineRepeat | null {
  const raw = String(grupo || '').trim()
  const lower = raw.toLowerCase()
  if (!lower) return null
  if (lower === LAST_WORKDAY_ROUTINE_GROUP) return { repeat: 'last-workday', weekdays: [] }
  if (!lower.startsWith(ROUTINE_REPEAT_GROUP_PREFIX)) return null
  const rest = lower.slice(ROUTINE_REPEAT_GROUP_PREFIX.length)
  if (rest === 'last-workday' || rest === 'workdays' || rest === 'weekly' || rest === 'biweekly' || rest === 'monthly') {
    return { repeat: rest, weekdays: [] }
  }
  if (rest.startsWith('weekdays:')) {
    const weekdays = rest.slice('weekdays:'.length).split(/[-,]/).map(item => parseInt(item, 10)).filter(day => day >= 0 && day <= 6)
    if (weekdays.length === 0) return null
    return { repeat: 'weekdays', weekdays: [...new Set(weekdays)].sort((a, b) => a - b) }
  }
  return null
}

export function hasRoutineRepeatGroup(grupo?: string | null): boolean {
  return parseRoutineRepeatGroup(grupo) != null
}

const REPEAT_DATE_CAP = 400

function parseIsoDate(value: string): Date | null {
  const iso = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function addMonthsIso(fromIso: string, months: number): string {
  const start = parseIsoDate(fromIso)
  if (!start) return fromIso
  const day = start.getDate()
  const cursor = new Date(start.getFullYear(), start.getMonth() + months, day)
  if (cursor.getDate() !== day) {
    return dateKey(new Date(start.getFullYear(), start.getMonth() + months + 1, 0))
  }
  return dateKey(cursor)
}

function eachIsoDay(fromIso: string, untilIso: string): string[] {
  const start = parseIsoDate(fromIso)
  const until = parseIsoDate(untilIso)
  if (!start || !until || until < start) return []
  const dates: string[] = []
  for (let cursor = start; cursor <= until && dates.length < REPEAT_DATE_CAP; cursor = addDays(cursor, 1)) {
    dates.push(dateKey(cursor))
  }
  return dates
}

export function routineRepeatDates(opts: {
  from: string
  months: number
  repeat: RoutineRepeat
  weekdays?: number[]
}): string[] {
  const from = String(opts.from || '').slice(0, 10)
  const indefinite = Number(opts.months) === 0
  const months = indefinite ? 1 : Math.min(LAST_WORKDAY_ROUTINE_MONTHS, Math.max(1, Number(opts.months) || 1))
  if (!from || opts.repeat === 'no') return []
  const dates = collectRoutineRepeatDates({ from, months, repeat: opts.repeat, weekdays: opts.weekdays })
  return indefinite ? dates.slice(0, 1) : dates
}

function collectRoutineRepeatDates(opts: {
  from: string
  months: number
  repeat: RoutineRepeat
  weekdays?: number[]
}): string[] {
  const { from, months } = opts
  if (opts.repeat === 'last-workday') return lastZaragozaWorkdaysFrom(from, months)
  if (opts.repeat === 'weekly' || opts.repeat === 'biweekly' || opts.repeat === 'monthly') {
    const start = parseIsoDate(from)
    if (!start) return []
    const until = parseIsoDate(addMonthsIso(from, months))
    if (!until) return [from]
    const stepDays = opts.repeat === 'weekly' ? 7 : opts.repeat === 'biweekly' ? 14 : 0
    const dates: string[] = []
    if (opts.repeat === 'monthly') {
      const startDay = start.getDate()
      for (let i = 0; i < months && dates.length < REPEAT_DATE_CAP; i += 1) {
        let cursor = new Date(start.getFullYear(), start.getMonth() + i, startDay)
        if (cursor.getDate() !== startDay) cursor = new Date(start.getFullYear(), start.getMonth() + i + 1, 0)
        if (cursor > until) break
        if (dateKey(cursor) >= from) dates.push(dateKey(cursor))
      }
      return dates
    }
    for (let i = 0; i < REPEAT_DATE_CAP; i += 1) {
      const cursor = addDays(start, i * stepDays)
      if (cursor > until) break
      dates.push(dateKey(cursor))
    }
    return dates
  }
  const until = addMonthsIso(from, months)
  const wanted = new Set((opts.weekdays || []).filter(day => day >= 0 && day <= 6))
  return eachIsoDay(from, until).filter(day => {
    const date = new Date(`${day}T00:00:00`)
    if (opts.repeat === 'workdays') return isZaragozaWorkday(date)
    return wanted.has(date.getDay())
  })
}

export function nextRoutineRepeatDate(fromIso: string, repeat: ActiveRoutineRepeat, weekdays?: number[]): string | null {
  const from = parseIsoDate(fromIso)
  if (!from) return null
  const current = dateKey(from)
  if (repeat === 'weekly') return dateKey(addDays(from, 7))
  if (repeat === 'biweekly') return dateKey(addDays(from, 14))
  if (repeat === 'monthly') {
    const next = addMonthsIso(current, 1)
    return next > current ? next : null
  }
  if (repeat === 'last-workday') {
    let year = from.getFullYear()
    let month = from.getMonth() + 1
    for (let i = 0; i < 24; i += 1) {
      if (month > 11) {
        month = 0
        year += 1
      }
      const day = lastZaragozaWorkday(year, month)
      if (day > current) return day
      month += 1
    }
    return null
  }
  const wanted = new Set((weekdays || []).filter(day => day >= 0 && day <= 6))
  for (let i = 1; i <= 40; i += 1) {
    const cursor = addDays(from, i)
    if (repeat === 'workdays' && isZaragozaWorkday(cursor)) return dateKey(cursor)
    if (repeat === 'weekdays' && wanted.has(cursor.getDay())) return dateKey(cursor)
  }
  return null
}

export function inferRoutineRepeat(task: {
  tipo?: string | null
  grupo?: string | null
}): ParsedRoutineRepeat | null {
  if (!isRoutineType(task.tipo)) return null
  return parseRoutineRepeatGroup(task.grupo)
}
