'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { fetchAllTaskTimeLogs, logSeconds, minutesFromSeconds, removeLogsAfterCompletion, TASK_TIME_UPDATED_EVENT, type TaskTimeLog, type TaskTimeUpdatedDetail } from '@/lib/taskTimeLogs'
import { fetchAllTareas } from '@/lib/supabaseTasks'
import { supabase } from '@/lib/supabase'

type Jornada = {
  fecha: string
  minutos_fichados?: number | null
}

type TiempoLog = {
  tarea_id: number
  fecha: string
  minutos: number
  segundos?: number | null
}

type TareaLite = {
  id: number
  tarea: string
  tipo: string
  estado: string
  tiempo_estimado: number
}

type TaskDetail = {
  tareaId: number
  fecha: string
  tarea: string
  tipo: string
  estado: string
  estimado: number
  registrado: number
  diferencia: number
}

type Row = {
  key: string
  label: string
  sortKey: string
  fichado: number
  real: number
  eficiencia: number | null
}

type Mode = 'dia' | 'semana' | 'mes' | 'ano'

const START_DATE = '2026-08-01'
const WEEKDAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
]

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayKey(): string {
  return dateKey(new Date())
}

function daysBetween(start: string, end: string): string[] {
  const days: string[] = []
  const current = new Date(`${start}T00:00:00`)
  const last = new Date(`${end}T00:00:00`)
  while (current <= last) {
    days.push(dateKey(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

function minToHM(min: number): string {
  const safe = Math.max(0, Math.round(min || 0))
  if (!safe) return '0m'
  const h = Math.floor(safe / 60)
  const m = safe % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' }).format(date)
}

function weekStart(date: string): string {
  const current = new Date(`${date}T00:00:00`)
  const day = current.getDay() || 7
  current.setDate(current.getDate() - day + 1)
  return dateKey(current)
}

function weekLabel(key: string): string {
  const start = new Date(`${key}T00:00:00`)
  const end = new Date(`${key}T00:00:00`)
  end.setDate(end.getDate() + 6)
  const format = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
  return `Semana ${format.format(start)} - ${format.format(end)}`
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00`).getDay()
}

function periodKey(date: string, mode: Exclude<Mode, 'dia'>): string {
  if (mode === 'semana') return weekStart(date)
  if (mode === 'mes') return date.slice(0, 7)
  return date.slice(0, 4)
}

function efficiencyMeta(value: number | null) {
  if (value === null) {
    return {
      label: 'Sin crono',
      text: 'text-gray-300',
      bg: 'bg-white',
      border: 'border-gray-100',
    }
  }
  if (value < 60) {
    return {
      label: 'Baja',
      text: 'text-red-500',
      bg: 'bg-red-50',
      border: 'border-red-200',
    }
  }
  if (value < 80) {
    return {
      label: 'Media',
      text: 'text-amber-500',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
    }
  }
  return {
    label: 'Bien',
    text: 'text-emerald-600',
    bg: 'bg-white',
    border: 'border-gray-100',
  }
}

function emptyRow(key: string, label: string, sortKey = key): Row {
  return {
    key,
    label,
    sortKey,
    fichado: 0,
    real: 0,
    eficiencia: null,
  }
}

function finalize(row: Row): Row {
  return {
    ...row,
    eficiencia: row.fichado > 0 ? Math.round((row.real / row.fichado) * 100) : null,
  }
}

export default function Rendimiento({ refreshKey = 0, cronoSeconds = 0 }: { refreshKey?: number, cronoSeconds?: number }) {
  const [loading, setLoading] = useState(true)
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [logs, setLogs] = useState<TiempoLog[]>([])
  const [tareas, setTareas] = useState<TareaLite[]>([])
  const [mode, setMode] = useState<Mode>('dia')
  const [rangeStart, setRangeStart] = useState(START_DATE)
  const [rangeEnd, setRangeEnd] = useState(todayKey())
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [expandedPeriods, setExpandedPeriods] = useState<string[]>([])
  const [editingCrono, setEditingCrono] = useState<string | null>(null)
  const [cronoInput, setCronoInput] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const [{ data: j }, t] = await Promise.all([
        supabase.from('jornadas').select('fecha,minutos_fichados').order('fecha', { ascending: false }),
        fetchAllTareas<TareaLite & { fecha_finalizacion?: string | null, done?: boolean | string | null }>('id,tarea,tipo,estado,tiempo_estimado,fecha_finalizacion,done'),
      ])
      let logs = await fetchAllTaskTimeLogs()
      const logsByTask = logs.reduce((acc: Record<number, TaskTimeLog[]>, log) => {
        if (!acc[log.tarea_id]) acc[log.tarea_id] = []
        acc[log.tarea_id].push(log)
        return acc
      }, {})
      const removed = await removeLogsAfterCompletion(t, logsByTask)
      if (removed > 0) logs = await fetchAllTaskTimeLogs()

      if (cancelled) return
      setJornadas((j || []) as Jornada[])
      setLogs(logs)
      setTareas(t)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey])

  useEffect(() => {
    const onTime = (event: Event) => {
      const detail = (event as CustomEvent<TaskTimeUpdatedDetail>).detail
      if (!detail?.tareaId || !detail.fecha) return
      const minutes = minutesFromSeconds(detail.segundos)
      setLogs(prev => {
        const rest = prev.filter(log => !(log.tarea_id === detail.tareaId && log.fecha === detail.fecha))
        return [{ tarea_id: detail.tareaId, fecha: detail.fecha, minutos: minutes, segundos: detail.segundos }, ...rest]
      })
    }
    window.addEventListener(TASK_TIME_UPDATED_EVENT, onTime)
    return () => window.removeEventListener(TASK_TIME_UPDATED_EVENT, onTime)
  }, [])

  const dailyRows = useMemo<Row[]>(() => {
    const today = todayKey()
    const byDay = new Map<string, Row>()

    const ensure = (fecha: string) => {
      if (!byDay.has(fecha)) byDay.set(fecha, emptyRow(fecha, fDate(fecha)))
      return byDay.get(fecha)!
    }

    daysBetween(START_DATE, today).forEach(ensure)

    jornadas.forEach(j => {
      if (!j.fecha || j.fecha < START_DATE || j.fecha > today) return
      ensure(j.fecha).fichado = Number(j.minutos_fichados || 0)
    })

    if (cronoSeconds > 0) {
      ensure(today).fichado = Math.floor(cronoSeconds / 60)
    }

    logs.forEach(log => {
      if (!log.fecha || log.fecha < START_DATE || log.fecha > today) return
      ensure(log.fecha).real += minutesFromSeconds(logSeconds(log))
    })

    return [...byDay.values()]
      .map(finalize)
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  }, [jornadas, logs, cronoSeconds])

  useEffect(() => {
    setEditingCrono(null)
    setExpandedPeriods([])
  }, [mode, rangeStart, rangeEnd, weekdays])

  const filteredDailyRows = useMemo<Row[]>(() => {
    const start = rangeStart && rangeStart >= START_DATE ? rangeStart : START_DATE
    const end = rangeEnd && rangeEnd <= todayKey() ? rangeEnd : todayKey()
    return dailyRows.filter(row => row.key >= start && row.key <= end && (weekdays.length === 0 || weekdays.includes(weekdayOf(row.key))))
  }, [dailyRows, rangeStart, rangeEnd, weekdays])

  const visibleRows = useMemo<Row[]>(() => {
    if (mode === 'dia') return filteredDailyRows

    const byPeriod = new Map<string, Row>()
    filteredDailyRows.forEach(row => {
      const key = periodKey(row.key, mode)
      const label = mode === 'semana' ? weekLabel(key) : mode === 'mes' ? monthLabel(key) : key
      if (!byPeriod.has(key)) byPeriod.set(key, emptyRow(key, label))
      const target = byPeriod.get(key)!
      target.fichado += row.fichado
      target.real += row.real
    })

    return [...byPeriod.values()]
      .map(finalize)
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  }, [filteredDailyRows, mode])

  const taskDetailsByPeriod = useMemo(() => {
    const tasksById = new Map<number, TareaLite>()
    tareas.forEach(tarea => tasksById.set(Number(tarea.id), tarea))

    const visibleDays = new Set(filteredDailyRows.map(row => row.key))
    const detailsByKey = new Map<string, TaskDetail[]>()
    const add = (key: string, detail: TaskDetail) => {
      if (!detailsByKey.has(key)) detailsByKey.set(key, [])
      detailsByKey.get(key)!.push(detail)
    }

    logs.forEach(log => {
      const registrado = minutesFromSeconds(logSeconds(log))
      if (!log.fecha || log.fecha < START_DATE || log.fecha > todayKey() || !visibleDays.has(log.fecha) || registrado <= 0) return
      const tarea = tasksById.get(Number(log.tarea_id))
      const estimado = Number(tarea?.tiempo_estimado || 0)
      const detail: TaskDetail = {
        tareaId: Number(log.tarea_id),
        fecha: log.fecha,
        tarea: tarea?.tarea || `Tarea ${log.tarea_id}`,
        tipo: tarea?.tipo || '',
        estado: tarea?.estado || '',
        estimado,
        registrado,
        diferencia: registrado - estimado,
      }
      add(log.fecha, detail)
      if (mode !== 'dia') add(periodKey(log.fecha, mode), detail)
    })

    detailsByKey.forEach((details, key) => {
      detailsByKey.set(key, details.sort((a, b) => b.registrado - a.registrado || a.tarea.localeCompare(b.tarea)))
    })
    return detailsByKey
  }, [filteredDailyRows, logs, tareas, mode])

  const totals = visibleRows.reduce(
    (acc, row) => {
      acc.fichado += row.fichado
      acc.real += row.real
      return acc
    },
    { fichado: 0, real: 0 },
  )
  const totalEfficiency = totals.fichado > 0 ? Math.round((totals.real / totals.fichado) * 100) : null
  const totalTone = efficiencyMeta(totalEfficiency)

  async function saveCrono(fecha: string) {
    const minutes = Math.max(0, Math.round(Number(cronoInput) || 0))
    setJornadas(prev => {
      const exists = prev.some(j => j.fecha === fecha)
      if (exists) return prev.map(j => j.fecha === fecha ? { ...j, minutos_fichados: minutes } : j)
      return [{ fecha, minutos_fichados: minutes }, ...prev]
    })
    setEditingCrono(null)
    await supabase.from('jornadas').upsert({ fecha, minutos_fichados: minutes }, { onConflict: 'fecha' })
  }

  function toggleWeekday(day: number) {
    setWeekdays(prev => {
      if (prev.length === 0) return [day]
      const next = prev.includes(day) ? prev.filter(value => value !== day) : [...prev, day]
      return next
    })
  }

  function togglePeriod(key: string) {
    setExpandedPeriods(prev => prev.includes(key) ? prev.filter(value => value !== key) : [...prev, key])
  }

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
      <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">Rendimiento</h2>
          <p className="text-xs text-gray-400 mt-1">Cronometro fichado, tiempo registrado y eficiencia en el periodo que elijas.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-gray-100 bg-gray-50 p-1">
            {[
              ['dia', 'Dia'],
              ['semana', 'Semana'],
              ['mes', 'Mes'],
              ['ano', 'Año'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMode(key as Mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${mode === key ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <label className="text-[11px] font-semibold text-gray-400">Desde
              <input type="date" min={START_DATE} max={rangeEnd || todayKey()} value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="ml-1.5 rounded-lg border border-gray-100 bg-white px-2 py-1.5 text-xs text-gray-600 outline-none focus:border-gray-400" />
            </label>
            <label className="text-[11px] font-semibold text-gray-400">Hasta
              <input type="date" min={rangeStart || START_DATE} max={todayKey()} value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="ml-1.5 rounded-lg border border-gray-100 bg-white px-2 py-1.5 text-xs text-gray-600 outline-none focus:border-gray-400" />
            </label>
            <button onClick={() => { setRangeStart(START_DATE); setRangeEnd(todayKey()) }} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-100 text-gray-400 hover:text-gray-700">Todo</button>
          </div>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <button onClick={() => setWeekdays([])} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${weekdays.length === 0 ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-400 border-gray-100 hover:text-gray-700'}`}>Todos los días</button>
            {WEEKDAYS.map(day => {
              const active = weekdays.length === 0 || weekdays.includes(day.value)
              return <button key={day.value} onClick={() => toggleWeekday(day.value)} className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition ${active ? 'border-gray-300 text-gray-700 bg-white' : 'border-gray-100 text-gray-300 bg-white'}`}>{day.label}</button>
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 p-5 border-b border-gray-100">
        <div className="rounded-xl border border-gray-100 px-4 py-3">
          <div className="text-xs font-semibold text-gray-400 uppercase">Cronometro</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{minToHM(totals.fichado)}</div>
        </div>
        <div className="rounded-xl border border-gray-100 px-4 py-3">
          <div className="text-xs font-semibold text-gray-400 uppercase">Tiempo registrado</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{minToHM(totals.real)}</div>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${totalTone.bg} ${totalTone.border}`}>
          <div className="text-xs font-semibold text-gray-400 uppercase">Eficiencia</div>
          <div className={`text-xl font-bold mt-1 ${totalTone.text}`}>{totalEfficiency === null ? '-' : `${totalEfficiency}%`}</div>
          <div className={`text-xs font-semibold mt-1 ${totalTone.text}`}>{totalTone.label}</div>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-gray-100 text-xs text-gray-400">
        Eficiencia: <span className="text-red-500 font-semibold">Baja &lt;60%</span> · <span className="text-amber-500 font-semibold">Media 60-79%</span> · <span className="text-emerald-600 font-semibold">Bien 80-100%+</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="text-left px-6 py-3 font-semibold">{mode === 'dia' ? 'Fecha' : 'Periodo'}</th>
              <th className="text-right px-4 py-3 font-semibold">Cronometro</th>
              <th className="text-right px-4 py-3 font-semibold">Tiempo registrado</th>
              <th className="text-right px-4 py-3 font-semibold">Eficiencia</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-300">Cargando rendimiento...</td></tr>
            ) : visibleRows.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-300">Sin datos de rendimiento todavia</td></tr>
            ) : visibleRows.map(row => {
              const tone = efficiencyMeta(row.eficiencia)
              const expanded = expandedPeriods.includes(row.key)
              const details = mode === 'dia' ? [] : filteredDailyRows.filter(day => periodKey(day.key, mode) === row.key)
              const taskDetails = taskDetailsByPeriod.get(row.key) || []
              const taskEstimated = taskDetails.reduce((sum, detail) => sum + detail.estimado, 0)
              const taskRegistered = taskDetails.reduce((sum, detail) => sum + detail.registrado, 0)
              const taskDiff = taskRegistered - taskEstimated
              return (
                <Fragment key={row.key}>
                  <tr onClick={() => togglePeriod(row.key)} className={`border-b border-gray-50 hover:bg-gray-50/70 ${tone.bg} cursor-pointer`}>
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{expanded ? '⌄' : '›'}</span>
                        {row.label}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-gray-700">
                      {mode === 'dia' && editingCrono === row.key ? (
                        <div className="flex items-center justify-end gap-2">
                          <input type="number" min="0" value={cronoInput} onChange={e => setCronoInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void saveCrono(row.key); if (e.key === 'Escape') setEditingCrono(null) }} className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-right text-xs outline-none focus:border-gray-500 bg-white" autoFocus />
                          <button onClick={() => void saveCrono(row.key)} className="text-xs font-bold text-emerald-600">OK</button>
                        </div>
                      ) : mode === 'dia' ? (
                        <button onClick={() => { setEditingCrono(row.key); setCronoInput(String(row.fichado || '')) }} className="hover:text-gray-900 hover:underline decoration-dotted underline-offset-4">{minToHM(row.fichado)}</button>
                      ) : minToHM(row.fichado)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-gray-900">{minToHM(row.real)}</td>
                    <td className="px-4 py-4 text-right"><div className={`font-bold ${tone.text}`}>{row.eficiencia === null ? '-' : `${row.eficiencia}%`}</div><div className={`text-[10px] font-semibold ${tone.text}`}>{tone.label}</div></td>
                  </tr>
                  {expanded && mode !== 'dia' && details.map(day => {
                    const detailTone = efficiencyMeta(day.eficiencia)
                    return <tr key={day.key} className={`border-b border-gray-50 ${detailTone.bg}`}>
                      <td className="pl-12 pr-6 py-3 text-xs font-semibold text-gray-500">{day.label}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-500">{minToHM(day.fichado)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-700">{minToHM(day.real)}</td>
                      <td className={`px-4 py-3 text-right text-xs font-bold ${detailTone.text}`}>{day.eficiencia === null ? '-' : `${day.eficiencia}%`}</td>
                    </tr>
                  })}
                  {expanded && (
                    <tr className="border-b border-gray-100 bg-white">
                      <td colSpan={4} className="px-6 py-4">
                        <div className="rounded-xl border border-gray-100 bg-gray-50/50 overflow-hidden">
                          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
                            <div>
                              <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">Tareas que suman</div>
                              <div className="text-[11px] text-gray-400">Tiempo registrado por fecha real de trabajo</div>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="rounded-full bg-white border border-gray-100 px-3 py-1 text-gray-500">Estimado {minToHM(taskEstimated)}</span>
                              <span className="rounded-full bg-gray-900 px-3 py-1 text-white">Registrado {minToHM(taskRegistered)}</span>
                              <span className={`rounded-full px-3 py-1 font-semibold ${taskDiff > 0 ? 'bg-red-50 text-red-500' : taskDiff < 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-white border border-gray-100 text-gray-500'}`}>
                                {taskDiff === 0 ? 'Dif. =' : taskDiff > 0 ? `Dif. +${minToHM(taskDiff)}` : `Dif. -${minToHM(Math.abs(taskDiff))}`}
                              </span>
                            </div>
                          </div>
                          {taskDetails.length === 0 ? (
                            <div className="px-4 py-5 text-center text-xs text-gray-300">No hay tareas registradas en este periodo.</div>
                          ) : (
                            <div className="divide-y divide-gray-100">
                              {taskDetails.map((detail, index) => (
                                <div key={`${detail.fecha}-${detail.tareaId}-${index}`} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 items-center">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-gray-900 truncate">{detail.tarea}</div>
                                    <div className="mt-0.5 text-[11px] text-gray-400">
                                      {mode === 'dia' ? '' : `${fDate(detail.fecha)} · `}{detail.tipo || 'Sin tipo'}{detail.estado ? ` · ${detail.estado}` : ''}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Estimado</div>
                                    <div className="text-xs font-bold text-gray-700">{minToHM(detail.estimado)}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Registrado</div>
                                    <div className="text-xs font-bold text-gray-900">{minToHM(detail.registrado)}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Dif.</div>
                                    <div className={`text-xs font-bold ${detail.diferencia > 0 ? 'text-red-500' : detail.diferencia < 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                                      {detail.diferencia === 0 ? '=' : detail.diferencia > 0 ? `+${minToHM(detail.diferencia)}` : `-${minToHM(Math.abs(detail.diferencia))}`}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
