'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Tarea = {
  id: number
  tipo: string
  tarea: string
  estado: string
  tiempo_estimado: number
  tiempo_real?: number | null
  deadline?: string | null
  fecha_planificada?: string | null
  fecha_finalizacion?: string | null
  done?: boolean | string | null
  orden?: number | null
  excluir_plan?: boolean | null
  excluida_fecha?: string | null
  es_padre?: boolean | null
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
  accumulated: Record<string, number>
}

const STORAGE_KEY = 'gestor_foco_bloque_v2'

const TIPO_DOT: Record<string, string> = {
  Operativa: 'bg-sky-400',
  Táctica: 'bg-violet-400',
  Estratégica: 'bg-amber-400',
  Trimestral: 'bg-gray-400',
  Semanal: 'bg-gray-500',
  Mensual: 'bg-gray-600',
}

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

export default function Ejecucion({ onEditTarea, refreshKey }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [store, setStore] = useState<FocusStore>(defaultStore)
  const [hydrated, setHydrated] = useState(false)
  const [, setNowTick] = useState(Date.now())
  const [dragId, setDragId] = useState<number | null>(null)
  const storeRef = useRef<FocusStore>(defaultStore())

  useEffect(() => {
    const saved = readStore()
    setStore(saved)
    storeRef.current = saved
    setHydrated(true)
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

  const fetchTareas = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('tareas')
      .select('*')
      .order('orden', { ascending: true })
      .order('id', { ascending: false })
    setTareas(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTareas()
  }, [fetchTareas, refreshKey])

  function isDone(t: Tarea) {
    return t.done === true || (t.done as any) === 'true' || t.estado === 'Completada'
  }

  function isClosed(t: Tarea) {
    return isDone(t) || t.estado === 'Omitida'
  }

  function dateIsTodayOrPast(value?: string | null): boolean {
    const d = cleanDateValue(value)
    return !!d && d <= today
  }

  function isPlanCandidate(t: Tarea) {
    if ((t.es_padre as any) === true) return false
    if (isClosed(t)) return false
    const excluidaHoy = !!t.excluir_plan && cleanDateValue(t.excluida_fecha) === today
    if (excluidaHoy) return false
    if (t.fecha_planificada) return dateIsTodayOrPast(t.fecha_planificada)
    if (t.deadline) return dateIsTodayOrPast(t.deadline)
    return false
  }

  function currentSecondsFor(id: number, sourceStore = store) {
    const base = Number(sourceStore.accumulated[String(id)] || 0)
    if (sourceStore.running && sourceStore.activeId === id && sourceStore.startedAt) {
      return base + Math.max(0, Math.floor((Date.now() - sourceStore.startedAt) / 1000))
    }
    return base
  }

  async function persistCurrentTime(sourceStore = store) {
    const currentId = sourceStore.activeId
    if (!currentId) return sourceStore
    const seconds = currentSecondsFor(currentId, sourceStore)
    const nextStore: FocusStore = {
      ...sourceStore,
      accumulated: { ...sourceStore.accumulated, [String(currentId)]: seconds },
      startedAt: sourceStore.running ? Date.now() : null,
    }
    setStore(nextStore)
    const minutes = Math.max(0, Math.round(seconds / 60))
    await supabase.from('tareas').update({ tiempo_real: minutes, estado: 'En progreso' }).eq('id', currentId)
    return nextStore
  }

  async function addToBlock(t: Tarea) {
    setStore(prev => {
      if (prev.ids.includes(t.id)) return prev
      return {
        ...prev,
        ids: [...prev.ids, t.id],
        accumulated: { ...prev.accumulated, [String(t.id)]: Number(t.tiempo_real || 0) * 60 },
      }
    })
    await supabase.from('tareas').update({ estado: 'En progreso' }).eq('id', t.id)
    await fetchTareas()
  }

  async function removeFromBlock(id: number) {
    await persistCurrentTime(storeRef.current)
    setStore(prev => {
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
    setStore(prev => ({
      ...prev,
      activeId: id,
      running: true,
      startedAt: Date.now(),
      accumulated: { ...prev.accumulated, [String(id)]: Number(prev.accumulated[String(id)] || 0) },
    }))
    await supabase.from('tareas').update({ estado: 'En progreso' }).eq('id', id)
    await fetchTareas()
  }

  async function pauseActive() {
    const latest = await persistCurrentTime(storeRef.current)
    setStore({ ...latest, running: false, startedAt: null })
  }

  async function resumeActive() {
    if (!store.activeId) return
    setStore(prev => ({ ...prev, running: true, startedAt: Date.now() }))
  }

  async function completeTask(id: number) {
    const latest = await persistCurrentTime(storeRef.current)
    const seconds = currentSecondsFor(id, latest)
    const minutes = Math.max(1, Math.round(seconds / 60))
    const now = new Date().toISOString()
    await supabase
      .from('tareas')
      .update({ done: true, estado: 'Completada', tiempo_real: minutes, fecha_finalizacion: today, hora_finalizacion: now })
      .eq('id', id)
    setStore(prev => ({
      ...prev,
      activeId: prev.activeId === id ? null : prev.activeId,
      running: prev.activeId === id ? false : prev.running,
      startedAt: prev.activeId === id ? null : prev.startedAt,
      accumulated: { ...prev.accumulated, [String(id)]: minutes * 60 },
    }))
    await fetchTareas()
  }

  async function clearFinishedFromBlock() {
    await persistCurrentTime(storeRef.current)
    const closedIds = new Set(tareas.filter(t => storeRef.current.ids.includes(t.id)).filter(t => isClosed(t)).map(t => t.id))
    setStore(prev => {
      const nextAccumulated = { ...prev.accumulated }
      closedIds.forEach(id => delete nextAccumulated[String(id)])
      return {
        ...prev,
        ids: prev.ids.filter(id => !closedIds.has(id)),
        activeId: prev.activeId && closedIds.has(prev.activeId) ? null : prev.activeId,
        running: prev.activeId && closedIds.has(prev.activeId) ? false : prev.running,
        startedAt: prev.activeId && closedIds.has(prev.activeId) ? null : prev.startedAt,
        accumulated: nextAccumulated,
      }
    })
  }

  async function resetBlock() {
    if (!confirm('¿Cerrar el bloque actual? Las completadas se quedan completadas y las no completadas vuelven a Pendiente.')) return
    await persistCurrentTime(storeRef.current)
    const activeOpenIds = tareas.filter(t => storeRef.current.ids.includes(t.id)).filter(t => !isClosed(t)).map(t => t.id)
    if (activeOpenIds.length > 0) await supabase.from('tareas').update({ estado: 'Pendiente' }).in('id', activeOpenIds)
    setStore(defaultStore())
    await fetchTareas()
  }

  function onDropIntoBlock(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const id = dragId || Number(e.dataTransfer.getData('text/plain'))
    const task = tareas.find(t => t.id === id)
    if (task) addToBlock(task)
    setDragId(null)
  }

  const focusTasks = useMemo(() => {
    const byId = new Map(tareas.map(t => [t.id, t]))
    return store.ids.map(id => byId.get(id)).filter(Boolean) as Tarea[]
  }, [tareas, store.ids])

  const candidateTasks = useMemo(() => {
    const inBlock = new Set(store.ids)
    return tareas.filter(t => isPlanCandidate(t)).filter(t => !inBlock.has(t.id)).slice(0, 40)
  }, [tareas, store.ids])

  const activeTask = focusTasks.find(t => t.id === store.activeId) || null
  const activeSeconds = activeTask ? currentSecondsFor(activeTask.id) : 0
  const totalEstimated = focusTasks.filter(t => !isClosed(t)).reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
  const totalReal = focusTasks.reduce((s, t) => s + Math.round(currentSecondsFor(t.id) / 60), 0)

  // Resumen de rendimiento del bloque:
  // compara solo tareas cerradas/completadas, no pendientes.
  const finishedTasks = focusTasks.filter(t => isClosed(t))
  const estimatedFinished = finishedTasks.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
  const realFinished = finishedTasks.reduce((s, t) => s + Math.round(currentSecondsFor(t.id) / 60), 0)
  const finishedDiff = realFinished - estimatedFinished

  const activeEstimated = activeTask ? (activeTask.tiempo_estimado || 0) : 0
  const activeReal = activeTask ? Math.round(activeSeconds / 60) : 0
  const activeDiff = activeTask ? activeReal - activeEstimated : 0
  const completedCount = focusTasks.filter(t => isDone(t)).length
  const blockTone = totalEstimated <= 60 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : totalEstimated <= 80 ? 'text-amber-600 bg-amber-50 border-amber-100' : 'text-red-500 bg-red-50 border-red-100'

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
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-gray-500">Tarea actual</div>
              <div className="text-xs text-gray-400 mt-1">Un cronómetro por tarea. Al cambiar, se guarda el tiempo acumulado.</div>
            </div>
            {activeTask && <button onClick={() => onEditTarea?.(activeTask.id)} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-50">Abrir tarea</button>}
          </div>

          <div className="p-7">
            {focusTasks.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-7">
                <div className="border border-gray-100 rounded-xl px-4 py-3">
                  <div className="text-xl font-bold text-gray-900">{minToHM(estimatedFinished)}</div>
                  <div className="text-xs text-gray-400">Estimado completadas</div>
                </div>
                <div className="border border-gray-100 rounded-xl px-4 py-3">
                  <div className="text-xl font-bold text-gray-900">{minToHM(realFinished)}</div>
                  <div className="text-xs text-gray-400">Real completadas</div>
                </div>
                <div className={`border rounded-xl px-4 py-3 ${finishedDiff <= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
                  <div className={`text-xl font-bold ${finishedDiff <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {finishedDiff === 0 ? '=' : finishedDiff > 0 ? `+${minToHM(finishedDiff)}` : `-${minToHM(Math.abs(finishedDiff))}`}
                  </div>
                  <div className="text-xs text-gray-400">Diferencia completadas</div>
                </div>
              </div>
            )}

            {activeTask ? (
              <>
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-3"><span className={`w-2 h-2 rounded-full ${TIPO_DOT[activeTask.tipo] || 'bg-gray-300'}`} /><span className="text-xs text-gray-400 font-semibold">{activeTask.tipo} · estimada {minToHM(activeTask.tiempo_estimado || 0)}</span></div>
                  <h2 className="text-2xl font-bold text-gray-900 leading-tight max-w-3xl">{activeTask.tarea}</h2>
                  {activeTask.notas && <p className="text-sm text-gray-400 mt-2">{activeTask.notas}</p>}
                </div>

                <div className="mb-8"><div className="text-7xl font-mono font-bold tracking-tight text-gray-900">{secondsToClock(activeSeconds)}</div><div className="text-sm text-gray-400 mt-2">acumulado en esta tarea · real guardado {minToHM(Math.round(activeSeconds / 60))}</div></div>

                <div className="flex items-center gap-3">
                  {store.running && store.activeId === activeTask.id ? <button onClick={pauseActive} className="px-5 py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600">Pausar</button> : <button onClick={resumeActive} className="px-5 py-3 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-700">Reanudar</button>}
                  <button onClick={() => completeTask(activeTask.id)} className="px-5 py-3 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600">Completar</button>
                </div>
              </>
            ) : (
              <div onDragOver={e => e.preventDefault()} onDrop={onDropIntoBlock} className="min-h-[360px] rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center px-10">
                <div className="text-5xl mb-4">🎯</div><h2 className="text-xl font-bold text-gray-900">Elige una tarea del bloque</h2><p className="text-sm text-gray-400 mt-2 max-w-md">Arrastra una tarea desde el Plan del día o pulsa “Empezar” en el bloque. La tarea quedará en progreso y el tiempo se guardará aunque cambies de tarea.</p>
              </div>
            )}

            {focusTasks.length > 0 && <div className="mt-10 border-t border-gray-100 pt-5"><div className="flex items-center justify-between mb-3"><div className="text-xs uppercase tracking-wider font-bold text-gray-500">Sesión del bloque</div><div className="text-xs text-gray-400">{completedCount}/{focusTasks.length} completadas · {minToHM(totalReal)} real</div></div><div className="space-y-2">{focusTasks.map(t => { const seconds = currentSecondsFor(t.id); const active = t.id === store.activeId; const closed = isClosed(t); return <button key={t.id} onClick={() => !closed && startTask(t.id)} className={`w-full text-left flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition ${active ? 'border-gray-900 bg-gray-50' : closed ? 'border-gray-100 bg-white opacity-60' : 'border-gray-100 bg-white hover:bg-gray-50'}`}><div className="min-w-0"><div className={`text-sm font-semibold truncate ${closed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{closed ? '✓ ' : active ? '⏳ ' : '○ '}{t.tarea}</div><div className="text-xs text-gray-400 mt-0.5">{t.tipo} · estimada {minToHM(t.tiempo_estimado || 0)}</div></div><div className="text-sm font-mono font-bold text-gray-700">{secondsToClock(seconds)}</div></button> })}</div></div>}
          </div>
        </section>

        <aside className="space-y-5">
          <section onDragOver={e => e.preventDefault()} onDrop={onDropIntoBlock} className="border border-gray-100 rounded-2xl bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"><div><div className="text-xs uppercase tracking-wider font-bold text-gray-500">Bloque actual</div><div className="text-xs text-gray-400 mt-1">Arrastra aquí 4-6 tareas hasta montar 60-80 min.</div></div><div className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${blockTone}`}>{minToHM(totalEstimated)}</div></div>
            <div className="p-4">
{focusTasks.length === 0 ? <div className="border-2 border-dashed border-gray-200 rounded-xl py-12 text-center text-gray-300 text-sm">Arrastra tareas aquí</div> : <div className="space-y-2">{focusTasks.map(t => { const active = t.id === store.activeId; const closed = isClosed(t); const seconds = currentSecondsFor(t.id); return <div key={t.id} className={`rounded-xl border p-3 transition ${active ? 'border-gray-900 bg-gray-50' : closed ? 'border-gray-100 bg-gray-50/50' : 'border-gray-100 bg-white'}`}><div className="flex items-start justify-between gap-3"><button onClick={() => !closed && startTask(t.id)} className="min-w-0 text-left flex-1"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${closed ? 'bg-emerald-400' : active ? 'bg-gray-900' : TIPO_DOT[t.tipo] || 'bg-gray-300'}`} /><span className={`text-sm font-semibold truncate ${closed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{t.tarea}</span></div><div className="text-xs text-gray-400 mt-1 ml-4">{t.tipo} · estimada {minToHM(t.tiempo_estimado || 0)} · real {seconds > 0 ? minToHM(Math.round(seconds / 60)) : '0m'}</div></button>{!closed && <button onClick={() => completeTask(t.id)} className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-gray-700">Completar</button>}</div><div className="flex items-center justify-between mt-3 ml-4">{!closed ? <button onClick={() => startTask(t.id)} className="text-xs text-gray-500 hover:text-gray-900">{active ? 'Activa' : 'Empezar'}</button> : <span className="text-xs text-emerald-500 font-semibold">Completada</span>}<button onClick={() => removeFromBlock(t.id)} className="text-xs text-gray-300 hover:text-red-400">Quitar</button></div></div> })}</div>}
              <div className="mt-4"><button onClick={resetBlock} className="w-full text-xs border border-gray-200 text-gray-600 px-3 py-2.5 rounded-lg hover:bg-gray-50 font-medium">Cerrar bloque</button></div>
            </div>
          </section>

          <section className="border border-gray-100 rounded-2xl bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100"><div className="text-xs uppercase tracking-wider font-bold text-gray-500">Plan del día</div><div className="text-xs text-gray-400 mt-1">Añade solo las próximas tareas del bloque.</div></div>
            <div className="max-h-[520px] overflow-y-auto p-3 space-y-2">{loading ? <div className="py-10 text-center text-gray-300 text-sm">Cargando...</div> : candidateTasks.length === 0 ? <div className="py-10 text-center text-gray-300 text-sm">No hay tareas pendientes para añadir</div> : candidateTasks.map(t => <div key={t.id} draggable onDragStart={e => { setDragId(t.id); e.dataTransfer.setData('text/plain', String(t.id)) }} className="rounded-xl border border-gray-100 px-3 py-3 hover:bg-gray-50 cursor-grab"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${TIPO_DOT[t.tipo] || 'bg-gray-300'}`} /><div className="text-sm font-semibold text-gray-800 truncate">{t.tarea}</div></div><div className="text-xs text-gray-400 mt-1 ml-4">{t.tipo} · {minToHM(t.tiempo_estimado || 0)}</div></div><button onClick={() => addToBlock(t)} className="text-xs border border-gray-200 px-2.5 py-1.5 rounded-lg text-gray-500 hover:bg-white">Añadir</button></div></div>)}</div>
          </section>
        </aside>
      </div>
    </div>
  )
}
