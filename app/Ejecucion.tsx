'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Tarea = {
  id: number
  tipo: string
  tarea: string
  estado: string
  tiempo_estimado: number
  tiempo_real: number | null
  deadline: string | null
  fecha_planificada?: string | null
  fecha_finalizacion: string | null
  hora_finalizacion?: string | null
  done: boolean
  orden?: number | null
  en_plan?: boolean | null
  excluir_plan?: boolean | null
  excluida_fecha?: string | null
  es_padre?: boolean | null
}

type Props = {
  onEditTarea?: (id: number) => void
  refreshKey?: number
  jornadaMin?: number
  cronoSeconds?: number
}

const STORAGE = {
  running: 'gestor_ejecucion_running',
  elapsed: 'gestor_ejecucion_elapsed_seconds',
  startedAt: 'gestor_ejecucion_started_at',
  focusIds: 'gestor_ejecucion_focus_ids',
  completedIds: 'gestor_ejecucion_completed_ids',
  lastCompletion: 'gestor_ejecucion_last_completion_seconds',
}

const TIPO_DOT: Record<string, string> = {
  Diaria: 'bg-gray-300',
  Semanal: 'bg-gray-400',
  Mensual: 'bg-gray-500',
  Operativa: 'bg-sky-400',
  Táctica: 'bg-violet-400',
  Estratégica: 'bg-amber-400',
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function minToHM(min: number): string {
  const safe = Math.max(0, Math.round(min || 0))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function signedMinToHM(min: number): string {
  const sign = min >= 0 ? '+' : '-'
  return `${sign}${minToHM(Math.abs(min))}`
}

function secondsToClock(seconds: number): string {
  const sign = seconds < 0 ? '-' : ''
  const abs = Math.abs(seconds)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = abs % 60

  if (h > 0) return `${sign}${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${sign}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function isInactive(t: Tarea) {
  return t.done === true || t.estado === 'Completada' || t.estado === 'Omitida'
}

function shortTaskName(name: string): string {
  const match = name.match(/^(.*?)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return name
  const [, title, day, month] = match
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${title} · ${parseInt(day)} ${months[parseInt(month)-1]}`
}

function readIds(key: string): number[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : []
  } catch {
    return []
  }
}

function writeIds(key: string, ids: number[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify([...new Set(ids)]))
}

export default function Ejecucion({ onEditTarea, refreshKey, jornadaMin: jornadaMinProp, cronoSeconds = 0 }: Props) {
  const today = dateKey(new Date())

  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)

  const [running, setRunning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [focusIds, setFocusIds] = useState<number[]>([])
  const [completedIds, setCompletedIds] = useState<number[]>([])
  const [lastCompletionSeconds, setLastCompletionSeconds] = useState(0)
  const [hoverPoint, setHoverPoint] = useState<{ label: string, value: string, x: number, y: number, color: string } | null>(null)
  const [restoredSession, setRestoredSession] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const jornadaMin = jornadaMinProp || 510
  const cronoPlanMin = Math.floor((cronoSeconds || 0) / 60)

  async function fetchTareas() {
    setLoading(true)

    const { data } = await supabase
      .from('tareas')
      .select('id,tipo,tarea,estado,tiempo_estimado,tiempo_real,deadline,fecha_planificada,fecha_finalizacion,hora_finalizacion,done,orden,en_plan,excluir_plan,excluida_fecha,es_padre')
      .order('orden', { ascending: true })
      .order('id', { ascending: false })

    setTareas((data || []) as Tarea[])
    setLoading(false)
  }

  useEffect(() => { fetchTareas() }, [])
  useEffect(() => { if (refreshKey && refreshKey > 0) fetchTareas() }, [refreshKey])

  // Restaurar sesión de foco aunque cambies de pestaña
  useEffect(() => {
    if (typeof window === 'undefined') return

    const storedElapsed = parseInt(localStorage.getItem(STORAGE.elapsed) || '0') || 0
    const storedStartedAt = parseInt(localStorage.getItem(STORAGE.startedAt) || '0') || 0
    const storedRunning = localStorage.getItem(STORAGE.running) === 'true'

    setFocusIds(readIds(STORAGE.focusIds))
    setCompletedIds(readIds(STORAGE.completedIds))
    setLastCompletionSeconds(parseInt(localStorage.getItem(STORAGE.lastCompletion) || '0') || 0)

    if (storedRunning && storedStartedAt > 0) {
      const liveElapsed = storedElapsed + Math.max(0, Math.floor((Date.now() - storedStartedAt) / 1000))
      setElapsedSeconds(liveElapsed)
      setRunning(true)
    } else {
      setElapsedSeconds(storedElapsed)
      setRunning(false)
    }

    setRestoredSession(true)
  }, [])

  const activeProgressIds = useMemo(() => {
    return tareas
      .filter(t => (t.es_padre as any) !== true)
      .filter(t => !isInactive(t))
      .filter(t => t.estado === 'En progreso')
      .map(t => t.id)
  }, [tareas])

  // Cualquier tarea marcada En progreso entra automáticamente en la sesión de foco
  useEffect(() => {
    if (!restoredSession || loading) return
    if (activeProgressIds.length === 0) return
    setFocusIds(prev => {
      const next = [...new Set([...prev, ...activeProgressIds])]
      writeIds(STORAGE.focusIds, next)
      return next
    })
  }, [activeProgressIds.join(','), restoredSession, loading])

  const foco = useMemo(() => {
    return tareas
      .filter(t => (t.es_padre as any) !== true)
      .filter(t => focusIds.includes(t.id) || t.estado === 'En progreso')
      .filter(t => t.estado !== 'Omitida')
      .sort((a,b) => {
        const ai = focusIds.indexOf(a.id)
        const bi = focusIds.indexOf(b.id)
        if (ai !== -1 && bi !== -1) return ai - bi
        return (a.orden || 0) - (b.orden || 0)
      })
  }, [tareas, focusIds])

  const activeFoco = foco.filter(t => !(t.done || t.estado === 'Completada'))
  const completedFoco = foco.filter(t => t.done || t.estado === 'Completada' || completedIds.includes(t.id))

  useEffect(() => {
    if (typeof window === 'undefined' || !restoredSession) return

    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      localStorage.setItem(STORAGE.running, 'false')
      localStorage.setItem(STORAGE.elapsed, String(elapsedSeconds))
      localStorage.removeItem(STORAGE.startedAt)
      return
    }

    const baseElapsed = elapsedSeconds
    const startedAt = Date.now()

    localStorage.setItem(STORAGE.running, 'true')
    localStorage.setItem(STORAGE.elapsed, String(baseElapsed))
    localStorage.setItem(STORAGE.startedAt, String(startedAt))

    intervalRef.current = setInterval(() => {
      const next = baseElapsed + Math.floor((Date.now() - startedAt) / 1000)
      setElapsedSeconds(next)
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [running, restoredSession])

  useEffect(() => {
    if (typeof window === 'undefined' || !restoredSession) return
    localStorage.setItem(STORAGE.elapsed, String(elapsedSeconds))
  }, [elapsedSeconds, running, restoredSession])

  const totalFocoMin = foco.reduce((s,t) => s + (t.tiempo_estimado || 0), 0)
  const totalFocoSeconds = totalFocoMin * 60
  const remainingSeconds = totalFocoSeconds - elapsedSeconds
  const overSeconds = Math.max(0, -remainingSeconds)
  const elapsedMin = Math.floor(elapsedSeconds / 60)
  const usedPct = totalFocoSeconds > 0 ? Math.min(100, (elapsedSeconds / totalFocoSeconds) * 100) : 0

  const completadasHoy = useMemo(() => {
    return tareas
      .filter(t => (t.es_padre as any) !== true)
      .filter(t => t.fecha_finalizacion === today && (t.done || t.estado === 'Completada'))
      .sort((a,b) => (a.hora_finalizacion || '').localeCompare(b.hora_finalizacion || ''))
  }, [tareas, today])

  function isPlanActivoHoy(t: Tarea) {
    if ((t.es_padre as any) === true) return false
    if (isInactive(t)) return false

    const excluidaHoy = !!t.excluir_plan && t.excluida_fecha === today
    if (excluidaHoy) return false

    // Si tiene fecha planificada, manda esa fecha.
    // Así no entra por deadline en otros días.
    if (t.fecha_planificada) return t.fecha_planificada === today

    if (t.deadline && t.deadline <= today) return true
    return !!t.en_plan
  }

  const planDia = useMemo(() => {
    return tareas
      .filter(t => (t.es_padre as any) !== true)
      .filter(t => t.estado !== 'Omitida')
      .filter(t => {
        const completadaHoy = (t.done || t.estado === 'Completada') &&
          t.fecha_finalizacion === today &&
          !t.excluir_plan

        const pendienteHoy = isPlanActivoHoy(t)

        return completadaHoy || pendienteHoy
      })
  }, [tareas, today])


  const completadasPlanDia = planDia.filter(
    t => t.done || t.estado === 'Completada'
  )

  const pendientesPlanDia = planDia.filter(
    t => !(t.done || t.estado === 'Completada')
  )

  // Naranja: estimado pendiente = tareas del Plan del día NO completadas y NO omitidas.
  // Va bajando conforme completas tareas.
  const estimadoHoy = pendientesPlanDia.reduce((s,t)=>s+(t.tiempo_estimado || 0), 0)

  // Verde: estimado acumulado de lo ya completado.
  const estimadoCompletado = completadasPlanDia.reduce((s,t)=>s+(t.tiempo_estimado || 0), 0)

  // Gris: real acumulado = real de completadas + foco activo vivo.
  const realCompletado = completadasPlanDia.reduce((s,t)=>s+(t.tiempo_real || 0), 0)
  const realVivo = realCompletado + elapsedMin

  // Violeta: jornada restante = horas planificadas menos cronómetro general del Plan del día.
  const jornadaRestante = jornadaMin - cronoPlanMin

  // Margen operativo = jornada restante menos estimado pendiente.
  const margen = jornadaRestante - estimadoHoy

  const desviacionRealVsEstimado = estimadoCompletado - realCompletado

  function getCurrentElapsedSeconds() {
    // Fuente única para completar: lo que ves en pantalla.
    // Evitamos localStorage aquí porque puede arrastrar restos antiguos y descuadrar el tiempo real.
    return elapsedSeconds
  }

  async function completar(t: Tarea) {
    if (t.done || t.estado === 'Completada') return

    const now = new Date().toISOString()
    const currentElapsed = getCurrentElapsedSeconds()

    // Regla estable:
    // - Primera tarea completada en este foco = tiempo desde 0 hasta ahora.
    // - Segunda y siguientes = desde la última completada hasta ahora.
    // Miramos tareas REALMENTE completadas en BD dentro del foco, no restos viejos de localStorage.
    const hasCompletedAlreadyInFocus = foco.some(x =>
      x.id !== t.id && (x.done || x.estado === 'Completada')
    )

    const previousCompletion = hasCompletedAlreadyInFocus
      ? Math.max(0, lastCompletionSeconds || parseInt(localStorage.getItem(STORAGE.lastCompletion) || '0') || 0)
      : 0

    const deltaSeconds = Math.max(0, currentElapsed - previousCompletion)
    const realMin = Math.max(1, Math.round(deltaSeconds / 60))

    await supabase
      .from('tareas')
      .update({
        done: true,
        estado: 'Completada',
        fecha_finalizacion: today,
        hora_finalizacion: now,
        tiempo_real: realMin
      })
      .eq('id', t.id)

    const nextCompleted = [...new Set([...completedIds, t.id])]
    setCompletedIds(nextCompleted)
    writeIds(STORAGE.completedIds, nextCompleted)

    setLastCompletionSeconds(currentElapsed)
    setElapsedSeconds(currentElapsed)
    localStorage.setItem(STORAGE.lastCompletion, String(currentElapsed))
    localStorage.setItem(STORAGE.elapsed, String(currentElapsed))

    await fetchTareas()
  }

  async function quitarDeFoco(t: Tarea) {
    const nextFocus = focusIds.filter(id => id !== t.id)
    const nextCompleted = completedIds.filter(id => id !== t.id)

    setFocusIds(nextFocus)
    setCompletedIds(nextCompleted)
    writeIds(STORAGE.focusIds, nextFocus)
    writeIds(STORAGE.completedIds, nextCompleted)

    if (!(t.done || t.estado === 'Completada')) {
      await supabase.from('tareas').update({ estado: 'Pendiente' }).eq('id', t.id)
      await fetchTareas()
    }
  }

  function toggleRunning() {
    if (running) {
      const currentElapsed = getCurrentElapsedSeconds()
      setElapsedSeconds(currentElapsed)
      setRunning(false)
      localStorage.setItem(STORAGE.running, 'false')
      localStorage.setItem(STORAGE.elapsed, String(currentElapsed))
      localStorage.removeItem(STORAGE.startedAt)
      return
    }

    // Si empiezas una sesión nueva desde cero, la primera tarea contará desde cero.
    if (elapsedSeconds === 0) {
      setLastCompletionSeconds(0)
      localStorage.setItem(STORAGE.lastCompletion, '0')
    }

    setRunning(true)
  }

  function resetTimer() {
    setRunning(false)
    setElapsedSeconds(0)
    setLastCompletionSeconds(0)
    setCompletedIds([])
    localStorage.setItem(STORAGE.running, 'false')
    localStorage.setItem(STORAGE.elapsed, '0')
    localStorage.setItem(STORAGE.lastCompletion, '0')
    localStorage.setItem(STORAGE.completedIds, '[]')
    localStorage.removeItem(STORAGE.startedAt)
  }

  const chartMaxX = Math.max(jornadaMin, realVivo, 60)
  const chartMaxY = Math.max(jornadaMin, estimadoHoy, realVivo, estimadoCompletado, jornadaRestante, 60)

  const width = 900
  const height = 360
  const pad = 58

  function sx(x: number) {
    return pad + (Math.min(x, chartMaxX) / chartMaxX) * (width - pad * 2)
  }

  function sy(y: number) {
    return height - pad - (Math.min(Math.max(y, 0), chartMaxY) / chartMaxY) * (height - pad * 2)
  }

  // Naranja: total estimado del Plan del día.
  const estimatedTodayPath = `M ${sx(0)} ${sy(estimadoHoy)} L ${sx(realVivo)} ${sy(estimadoHoy)}`

  // Verde: estimado ya completado.
  const estimatedCompletedPath = `M ${sx(0)} ${sy(0)} L ${sx(realVivo)} ${sy(estimadoCompletado)}`

  // Gris: real acumulado.
  const realPath = `M ${sx(0)} ${sy(0)} L ${sx(realVivo)} ${sy(realVivo)}`

  // Violeta: jornada restante.
  const jornadaRestantePath = `M ${sx(0)} ${sy(jornadaMin)} L ${sx(realVivo)} ${sy(jornadaRestante)}`

  const timerTone =
    remainingSeconds < 0 ? 'text-red-500' :
    usedPct >= 85 ? 'text-orange-500' :
    'text-gray-900'

  const barTone =
    remainingSeconds < 0 ? 'bg-red-400' :
    usedPct >= 85 ? 'bg-orange-400' :
    'bg-emerald-400'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-300">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin mr-3"></div>
        Cargando ejecución...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <div className="border border-gray-100 rounded-xl p-4">
          <div className="text-xl font-bold text-gray-900">{minToHM(jornadaMin)}</div>
          <div className="text-xs font-semibold text-gray-500 mt-1">Jornada planificada</div>
        </div>
        <div className="border border-gray-100 rounded-xl p-4">
          <div className="text-xl font-bold text-gray-900">{minToHM(estimadoHoy)}</div>
          <div className="text-xs font-semibold text-gray-500 mt-1">Estimado pendiente</div>
        </div>
        <div className="border border-gray-100 rounded-xl p-4">
          <div className="text-xl font-bold text-gray-900">{minToHM(realVivo)}</div>
          <div className="text-xs font-semibold text-gray-500 mt-1">Real tareas</div>
        </div>
        <div className={`border rounded-xl p-4 ${margen >= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
          <div className={`text-xl font-bold ${margen >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{signedMinToHM(margen)}</div>
          <div className="text-xs font-semibold text-gray-500 mt-1">Llegas / no llegas</div>
        </div>
      </div>

      <div className="border border-gray-100 rounded-xl bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ejecución</div>
            <div className="text-xs text-gray-400 mt-1">
              Foco por tareas <span className="font-semibold text-gray-500">En progreso</span>. Al completar, se guarda el tiempo real por tramo.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {foco.length > 0 && (
              <>
                <button
                  onClick={toggleRunning}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${running ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-gray-900 text-white hover:bg-gray-700'}`}
                >
                  {running ? 'Pausar' : elapsedSeconds > 0 ? 'Reanudar' : 'Iniciar'}
                </button>

                <button
                  onClick={resetTimer}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:bg-gray-50 transition"
                >
                  ↺
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-5 grid grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
          <div>
            <div className="flex items-end justify-between mb-4">
              <div>
                <div className={`text-5xl font-mono font-bold tracking-tight ${timerTone}`}>
                  {foco.length === 0 ? '00:00' : secondsToClock(remainingSeconds)}
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  {foco.length === 0
                    ? 'Sin tareas en foco'
                    : `${minToHM(elapsedMin)} consumidos · ${minToHM(totalFocoMin)} estimados`}
                </div>
              </div>

              {overSeconds > 0 && (
                <div className="text-right">
                  <div className="text-sm font-semibold text-red-500">+{minToHM(Math.ceil(overSeconds / 60))}</div>
                  <div className="text-xs text-gray-400">sobre estimación</div>
                </div>
              )}
            </div>

            <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-5">
              <div className={`h-full rounded-full transition-all ${barTone}`} style={{width: `${usedPct}%`}}></div>
            </div>

            <div className="border border-gray-100 rounded-xl p-6">
              <div className="flex items-start justify-between mb-5 gap-6">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ritmo del día</div>
                  <div className="text-xs text-gray-400 mt-1">Estimado vs real y margen de jornada.</div>
                </div>

                <div className={`text-sm font-bold whitespace-nowrap ${jornadaRestante >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  Jornada {signedMinToHM(jornadaRestante)}
                </div>
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 mb-5 text-xs">
                <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
                  <div className="flex items-center gap-2 font-semibold text-violet-700"><span className="w-3 h-0.5 bg-violet-400 inline-block"></span>Jornada restante</div>
                  <div className="text-violet-400 mt-1">Horas que te quedan según el cronómetro general.</div>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                  <div className="flex items-center gap-2 font-semibold text-amber-700"><span className="w-3 h-0.5 bg-amber-500 inline-block"></span>Estimado pendiente</div>
                  <div className="text-amber-500 mt-1">Tiempo estimado aún no completado.</div>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                  <div className="flex items-center gap-2 font-semibold text-emerald-700"><span className="w-3 h-0.5 bg-emerald-500 inline-block"></span>Estimado completado</div>
                  <div className="text-emerald-500 mt-1">Estimado que ya has completado.</div>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-2 font-semibold text-gray-700"><span className="w-3 h-0.5 bg-gray-400 inline-block"></span>Real acumulado</div>
                  <div className="text-gray-400 mt-1">Real completado + foco activo.</div>
                </div>
              </div>

              <div className="relative overflow-visible">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[360px] overflow-visible">
                  <line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} stroke="#e5e7eb" />
                  <line x1={pad} y1={pad} x2={pad} y2={height-pad} stroke="#e5e7eb" />

                  {[0.25,0.5,0.75,1].map(v => {
                    const y = sy(chartMaxY * v)
                    return (
                      <g key={v}>
                        <line x1={pad} y1={y} x2={width-pad} y2={y} stroke="#f3f4f6" />
                        <text x={pad - 12} y={y + 4} textAnchor="end" className="fill-gray-300 text-[11px]">{minToHM(chartMaxY * v)}</text>
                      </g>
                    )
                  })}

                  <path d={jornadaRestantePath} fill="none" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" />
                  <path d={estimatedTodayPath} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
                  <path d={estimatedCompletedPath} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
                  <path d={realPath} fill="none" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" />

                  {[
                    { label: 'Jornada restante', value: signedMinToHM(jornadaRestante), cx: sx(realVivo), cy: sy(jornadaRestante), color: '#a78bfa' },
                    { label: 'Estimado pendiente', value: minToHM(estimadoHoy), cx: sx(realVivo), cy: sy(estimadoHoy), color: '#f59e0b' },
                    { label: 'Estimado completado', value: minToHM(estimadoCompletado), cx: sx(realVivo), cy: sy(estimadoCompletado), color: '#10b981' },
                    { label: 'Real acumulado', value: minToHM(realVivo), cx: sx(realVivo), cy: sy(realVivo), color: '#9ca3af' },
                  ].map(p => (
                    <circle
                      key={p.label}
                      cx={p.cx}
                      cy={p.cy}
                      r="7"
                      fill={p.color}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoverPoint({ label: p.label, value: p.value, x: p.cx, y: p.cy, color: p.color })}
                      onMouseMove={() => setHoverPoint({ label: p.label, value: p.value, x: p.cx, y: p.cy, color: p.color })}
                      onMouseLeave={() => setHoverPoint(null)}
                    />
                  ))}

                  <text x={pad} y={height - 18} className="fill-gray-300 text-[11px]">0</text>
                  <text x={width - pad} y={height - 18} textAnchor="end" className="fill-gray-300 text-[11px]">{minToHM(chartMaxX)}</text>
                  <text x={pad} y={height - 4} className="fill-gray-300 text-[10px]">tiempo real</text>
                </svg>

                {hoverPoint && (
                  <div
                    className="absolute z-20 pointer-events-none rounded-lg border border-gray-100 bg-white shadow-lg px-3 py-2 text-xs"
                    style={{
                      left: `calc(${(hoverPoint.x / width) * 100}% + 10px)`,
                      top: `calc(${(hoverPoint.y / height) * 100}% - 10px)`,
                    }}
                  >
                    <div className="flex items-center gap-2 font-semibold text-gray-700">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hoverPoint.color }}></span>
                      {hoverPoint.label}
                    </div>
                    <div className="text-gray-400 mt-1">{hoverPoint.value}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Foco</span>
              <span className="text-xs text-gray-400">{foco.length} tarea{foco.length !== 1 ? 's' : ''}</span>
            </div>

            {foco.length === 0 ? (
              <div className="p-5 text-sm text-gray-400">
                Marca una o varias tareas como <span className="font-semibold text-gray-500">En progreso</span> desde el Plan del día.
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {foco.map(t => {
                  const done = t.done || t.estado === 'Completada'
                  return (
                    <div key={t.id} className={`p-4 transition ${done ? 'bg-emerald-50/40' : 'hover:bg-gray-50/70'}`}>
                      <div className="flex items-start gap-3">
                        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${done ? 'bg-emerald-400' : TIPO_DOT[t.tipo] || 'bg-gray-300'}`}></span>

                        <div className="min-w-0 flex-1">
                          <div className={`text-sm font-semibold truncate ${done ? 'text-emerald-700 line-through decoration-emerald-300' : 'text-gray-900'}`} title={t.tarea}>
                            {shortTaskName(t.tarea)}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {done ? `Completada · real ${minToHM(t.tiempo_real || 0)} · estimada ${minToHM(t.tiempo_estimado || 0)}` : `${t.tipo} · ${minToHM(t.tiempo_estimado || 0)}`}
                          </div>
                        </div>

                        {!done && (
                          <button
                            onClick={() => completar(t)}
                            className="px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition flex-shrink-0"
                          >
                            Completar
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <button onClick={() => onEditTarea?.(t.id)} className="text-xs text-gray-400 hover:text-gray-700 transition">
                          Abrir
                        </button>

                        <button onClick={() => quitarDeFoco(t)} className="text-xs text-gray-300 hover:text-gray-500 transition">
                          Quitar de foco
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
