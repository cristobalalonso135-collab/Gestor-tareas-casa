'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAllTareas } from '@/lib/supabaseTasks'
import { EVENT_TYPE, LEGACY_EVENT_TYPE, dateKey, fDate, isClosedTask, isEvento } from '@/lib/taskRules'

type Evento = {
  id: number
  tipo: string
  tarea: string
  notas?: string | null
  estado: string
  deadline: string | null
  fecha_planificada?: string | null
  fecha_solicitud?: string | null
  fecha_finalizacion?: string | null
  done: boolean
}

type Props = {
  refreshKey?: number
  onChanged?: () => void
}

function shortDate(value: string): string {
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

function eventStart(event: Pick<Evento, 'fecha_planificada' | 'deadline'>): string | null {
  return event.fecha_planificada || event.deadline || null
}

function eventEnd(event: Pick<Evento, 'fecha_planificada' | 'deadline'>): string | null {
  return event.deadline || event.fecha_planificada || null
}

function rangeLabel(event: Pick<Evento, 'fecha_planificada' | 'deadline'>): string {
  const start = eventStart(event)
  const end = eventEnd(event)
  if (!start && !end) return 'Sin fecha'
  if (!start || !end || start === end) return `${shortDate(start || end || '')} · ${fDate(start || end)}`
  return `${shortDate(start)} — ${shortDate(end)} · ${fDate(start)} – ${fDate(end)}`
}

export default function Eventos({ refreshKey, onChanged }: Props) {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [notes, setNotes] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showPast, setShowPast] = useState(false)

  const today = useMemo(() => dateKey(new Date()), [])

  const fetchEventos = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAllTareas<Evento>(
        'id,tipo,tarea,notas,estado,deadline,fecha_planificada,fecha_solicitud,fecha_finalizacion,done',
        query => query.in('tipo', [EVENT_TYPE, LEGACY_EVENT_TYPE]).order('fecha_planificada', { ascending: true }).order('deadline', { ascending: true })
      )
      setEventos(data.filter(t => isEvento(t.tipo)))
    } catch (error) {
      console.error('Error cargando recordatorios:', error)
      setEventos([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchEventos() }, [fetchEventos])
  useEffect(() => { if (refreshKey && refreshKey > 0) fetchEventos() }, [refreshKey, fetchEventos])

  const upcoming = eventos.filter(t => !isClosedTask(t) && (eventEnd(t) || '') >= today)
  const overdue = eventos.filter(t => !isClosedTask(t) && !!eventEnd(t) && eventEnd(t)! < today)
  const closed = eventos.filter(t => isClosedTask(t))

  function resetForm() {
    setTitle('')
    setFromDate('')
    setToDate('')
    setNotes('')
    setEditingId(null)
  }

  function startEdit(event: Evento) {
    setEditingId(event.id)
    setTitle(event.tarea)
    setFromDate(eventStart(event) || '')
    setToDate(eventEnd(event) || '')
    setNotes(event.notas || '')
  }

  async function saveEvent(e: React.FormEvent) {
    e.preventDefault()
    const name = title.trim()
    if (!name) {
      alert('Ponle un nombre al recordatorio.')
      return
    }
    const start = fromDate || toDate
    const end = toDate || fromDate
    if (!start || !end) {
      alert('Pon desde y hasta. Si es un solo día, pon la misma fecha en los dos.')
      return
    }
    const desde = start <= end ? start : end
    const hasta = start <= end ? end : start
    setSaving(true)
    const payload = {
      tipo: EVENT_TYPE,
      tarea: name,
      notas: notes.trim() || null,
      fecha_planificada: desde,
      deadline: hasta,
      tiempo_estimado: 0,
      tiempo_real: 0,
      prioridad: 'Media',
      estado: 'Pendiente',
      done: false,
      fecha_solicitud: today,
      solicitado_por: '',
      en_plan: false,
      para_casa: false,
      fecha_casa: null,
      prioridad_orden: null,
    }
    const result = editingId
      ? await supabase.from('tareas').update({
          tarea: payload.tarea,
          notas: payload.notas,
          fecha_planificada: payload.fecha_planificada,
          deadline: payload.deadline,
        }).eq('id', editingId)
      : await supabase.from('tareas').insert(payload)
    if (result.error) {
      setSaving(false)
      alert(`No pude guardar el recordatorio: ${result.error.message}`)
      return
    }
    setSaving(false)
    resetForm()
    await fetchEventos()
    onChanged?.()
  }

  async function closeEvent(event: Evento) {
    setSaving(true)
    const { error } = await supabase.from('tareas').update({
      done: true,
      estado: 'Completada',
      fecha_finalizacion: today,
    }).eq('id', event.id)
    setSaving(false)
    if (error) {
      alert(`No pude cerrar el recordatorio: ${error.message}`)
      return
    }
    await fetchEventos()
    onChanged?.()
  }

  async function deleteEvent(event: Evento) {
    if (!confirm(`¿Borrar “${event.tarea}”?`)) return
    setSaving(true)
    const { error } = await supabase.from('tareas').delete().eq('id', event.id)
    setSaving(false)
    if (error) {
      alert(`No pude borrar el recordatorio: ${error.message}`)
      return
    }
    if (editingId === event.id) resetForm()
    await fetchEventos()
    onChanged?.()
  }

  function EventRow({ event, overdueRow = false }: { event: Evento, overdueRow?: boolean }) {
    const closed = isClosedTask(event)
    return (
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
        closed ? 'border-gray-100 bg-gray-50/60' : overdueRow ? 'border-amber-100 bg-amber-50/40' : 'border-gray-100 bg-white'
      }`}>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-sm font-semibold ${closed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{event.tarea}</div>
          <div className="mt-0.5 text-xs text-gray-400">
            {rangeLabel(event)}
            {event.notas ? ` · ${event.notas}` : ''}
          </div>
        </div>
        {!closed && (
          <button type="button" onClick={() => void closeEvent(event)} className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800">
            Hecho
          </button>
        )}
        <button type="button" onClick={() => startEdit(event)} className="text-[10px] font-bold text-gray-400 hover:text-gray-700">
          Editar
        </button>
        <button type="button" onClick={() => void deleteEvent(event)} className="text-[10px] font-bold text-gray-300 hover:text-red-500">
          Borrar
        </button>
      </div>
    )
  }

  if (loading) {
    return <div className="border border-gray-100 rounded-xl py-16 text-center text-gray-300 text-sm">Cargando recordatorios...</div>
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Recordatorios</h2>
          <p className="mt-1 text-xs text-gray-400">
            Avisos y fechas que no ocupan el Plan como trabajo. El día que toquen, Plan del día te avisa. Si es un solo día, la misma fecha en desde y hasta.
          </p>
        </div>
        <form onSubmit={saveEvent} className="px-6 py-5 grid gap-3 md:grid-cols-[1fr_160px_160px_auto] md:items-end">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Recordatorio</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Nombre del recordatorio"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Desde</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => {
                setFromDate(e.target.value)
                if (!toDate) setToDate(e.target.value)
              }}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Hasta</label>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={e => setToDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50">
              {editingId ? 'Guardar' : 'Añadir'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50">
                Cancelar
              </button>
            )}
          </div>
          <div className="md:col-span-4">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Notas</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Opcional"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>
        </form>
      </section>

      {overdue.length > 0 && (
        <section className="rounded-xl border border-amber-100 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-100">
            <div className="text-sm font-bold text-gray-900">Pasaron y siguen abiertos</div>
            <div className="text-xs text-gray-400">{overdue.length} · ciérralos o cambia la fecha</div>
          </div>
          <div className="p-4 space-y-2">
            {overdue.map(event => <EventRow key={event.id} event={event} overdueRow />)}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-sm font-bold text-gray-900">Próximos</div>
          <div className="text-xs text-gray-400">{upcoming.length === 0 ? 'Nada en el calendario.' : `${upcoming.length} en el radar`}</div>
        </div>
        <div className="p-4 space-y-2">
          {upcoming.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-300">Cuando sepas la fecha, métela aquí.</div>
          ) : upcoming.map(event => <EventRow key={event.id} event={event} />)}
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-gray-900">Cerrados</div>
            <div className="text-xs text-gray-400">{closed.length} hechos</div>
          </div>
          {closed.length > 0 && (
            <button type="button" onClick={() => setShowPast(v => !v)} className="text-[10px] font-bold text-gray-400 hover:text-gray-700">
              {showPast ? 'Ocultar' : 'Ver'}
            </button>
          )}
        </div>
        {showPast && (
          <div className="p-4 space-y-2">
            {closed.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-300">Aún no has cerrado ninguno.</div>
            ) : closed.map(event => <EventRow key={event.id} event={event} />)}
          </div>
        )}
      </section>
    </div>
  )
}
