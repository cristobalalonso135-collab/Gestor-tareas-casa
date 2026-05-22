'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Tarea = {
  id: number
  tipo: string
  tarea: string
  notas: string
  prioridad: string
  estado: string
  tiempo_estimado: number
  fecha_solicitud: string
  deadline: string
  fecha_finalizacion: string
  done: boolean
}

const ESTADOS = ['Pendiente', 'En espera', 'En progreso', 'Completada', 'Cancelada']
const PRIORIDADES = ['Alta', 'Media', 'Baja']

const empty: Omit<Tarea, 'id'> = {
  tipo: '', tarea: '', notas: '', prioridad: 'Media', estado: 'Pendiente',
  tiempo_estimado: 0, fecha_solicitud: '', deadline: '', fecha_finalizacion: '', done: false
}

export default function Home() {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fPrio, setFPrio] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [tab, setTab] = useState<'gestionar' | 'hoy'>('gestionar')
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { fetchTareas() }, [])

  async function fetchTareas() {
    setLoading(true)
    const { data } = await supabase.from('tareas').select('*').order('id', { ascending: false })
    setTareas(data || [])
    setLoading(false)
  }

  async function saveTask() {
    if (!form.tarea.trim()) return alert('La tarea no puede estar vacía')
    setSaving(true)
    const clean = {
      ...form,
      fecha_solicitud: form.fecha_solicitud || null,
      deadline: form.deadline || null,
      fecha_finalizacion: form.fecha_finalizacion || null,
    }
    if (editId) {
      await supabase.from('tareas').update(clean).eq('id', editId)
    } else {
      await supabase.from('tareas').insert(clean)
    }
    setSaving(false)
    setModal(false)
    setForm(empty)
    setEditId(null)
    fetchTareas()
  }

  async function toggleDone(t: Tarea) {
    const newDone = !t.done
    const newEstado = newDone ? 'Completada' : 'Pendiente'
    await supabase.from('tareas').update({ done: newDone, estado: newEstado }).eq('id', t.id)
    fetchTareas()
  }

  async function deleteTask(id: number) {
    if (!confirm('¿Eliminar esta tarea?')) return
    await supabase.from('tareas').delete().eq('id', id)
    fetchTareas()
  }

  function openEdit(t: Tarea) {
    setForm({ tipo: t.tipo, tarea: t.tarea, notas: t.notas, prioridad: t.prioridad, estado: t.estado, tiempo_estimado: t.tiempo_estimado, fecha_solicitud: t.fecha_solicitud || '', deadline: t.deadline || '', fecha_finalizacion: t.fecha_finalizacion || '', done: t.done })
    setEditId(t.id)
    setModal(true)
  }

  const tipos = [...new Set(tareas.map(t => t.tipo).filter(Boolean))]

  const filtered = tareas.filter(t => {
    const q = search.toLowerCase()
    if (q && !t.tarea.toLowerCase().includes(q) && !t.tipo.toLowerCase().includes(q)) return false
    if (fEstado && t.estado !== fEstado) return false
    if (fPrio && t.prioridad !== fPrio) return false
    if (fTipo && t.tipo !== fTipo) return false
    return true
  })

  const hoy = tareas.filter(t => t.deadline === today || t.fecha_solicitud === today)

  const stats = {
    total: tareas.length,
    pendientes: tareas.filter(t => t.estado !== 'Completada' && t.estado !== 'Cancelada').length,
    completadas: tareas.filter(t => t.estado === 'Completada').length,
    tiempo: tareas.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)
  }

  const prioBadge: Record<string, string> = {
    Alta: 'bg-red-100 text-red-700', Media: 'bg-amber-100 text-amber-700', Baja: 'bg-green-100 text-green-700'
  }
  const estadoBadge: Record<string, string> = {
    Pendiente: 'bg-gray-100 text-gray-600', 'En espera': 'bg-orange-100 text-orange-700',
    'En progreso': 'bg-blue-100 text-blue-700', Completada: 'bg-green-100 text-green-700', Cancelada: 'bg-red-100 text-red-600'
  }

  const grupos: Record<string, Tarea[]> = {}
  filtered.forEach(t => { const g = t.tipo || '(Sin tipo)'; if (!grupos[g]) grupos[g] = []; grupos[g].push(t) })

  return (
    <main className="min-h-screen bg-[#f5f4f0] text-gray-900 font-sans">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Gestor de Tareas</h1>
          <p className="text-sm text-gray-400 mt-0.5">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <button onClick={() => { setForm(empty); setEditId(null); setModal(true) }}
          className="bg-[#9b1c5a] text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-[#7e1649] transition">
          + Nueva tarea
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-1 mb-6 bg-gray-200 rounded-xl p-1 w-fit">
          {(['gestionar', 'hoy'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition ${tab === t ? 'bg-white text-[#9b1c5a] shadow' : 'text-gray-500'}`}>
              {t === 'gestionar' ? '📋 Gestionar' : '🗓 Hoy'}
            </button>
          ))}
        </div>

        {tab === 'gestionar' && <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[['Total', stats.total, 'text-gray-900'], ['Pendientes', stats.pendientes, 'text-amber-600'], ['Completadas', stats.completadas, 'text-green-600'], ['Min. estimados', stats.tiempo, 'text-[#9b1c5a]']].map(([l, v, c]) => (
              <div key={l as string} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-1">{l}</div>
                <div className={`text-3xl font-black ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar tarea..."
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white flex-1 min-w-[180px] outline-none focus:border-[#9b1c5a]" />
            {[['f-tipo', fTipo, setFTipo, ['', ...tipos]],
              ['f-estado', fEstado, setFEstado, ['', ...ESTADOS]],
              ['f-prio', fPrio, setFPrio, ['', ...PRIORIDADES]]
            ].map(([k, val, setter, opts]) => (
              <select key={k as string} value={val as string} onChange={e => (setter as Function)(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#9b1c5a] cursor-pointer">
                {(opts as string[]).map(o => <option key={o} value={o}>{o || (k === 'f-tipo' ? 'Todos los tipos' : k === 'f-estado' ? 'Todos los estados' : 'Todas las prioridades')}</option>)}
              </select>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#9b1c5a] text-white">
                    {['', 'Tipo', 'Tarea / Descripción', 'Fecha solicitud', 'Deadline', 'Fecha fin', 'Prioridad', 'Tiempo (min.)', 'Estado', ''].map((h, i) => (
                      <th key={i} className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={10} className="text-center py-12 text-gray-400">Cargando...</td></tr>
                  ) : Object.keys(grupos).length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-12 text-gray-400">No hay tareas</td></tr>
                  ) : Object.entries(grupos).map(([grupo, gtareas]) => (
                    <>
                      <tr key={grupo} className="bg-orange-50">
                        <td colSpan={10} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-amber-700">
                          {grupo} <span className="text-gray-400 font-normal ml-2">{gtareas.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)} min.</span>
                        </td>
                      </tr>
                      {gtareas.map(t => (
                        <tr key={t.id} className={`border-t border-gray-100 hover:bg-pink-50 transition ${t.done ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-3">
                            <div onClick={() => toggleDone(t)} className={`w-5 h-5 rounded-full border-2 cursor-pointer flex items-center justify-center transition ${t.done ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-[#9b1c5a]'}`}>
                              {t.done && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                          </td>
                          <td className="px-3 py-3 font-medium whitespace-nowrap">{t.tipo}</td>
                          <td className="px-3 py-3 max-w-xs">
                            <div className={`truncate ${t.done ? 'line-through' : ''}`} title={t.tarea}>{t.tarea}</div>
                            {t.notas && <div className="text-xs text-gray-400 truncate mt-0.5" title={t.notas}>{t.notas}</div>}
                          </td>
                          <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">{t.fecha_solicitud ? new Date(t.fecha_solicitud + 'T12:00').toLocaleDateString('es-ES') : '—'}</td>
                          <td className={`px-3 py-3 text-xs whitespace-nowrap font-medium ${t.deadline && t.deadline < today && !t.done ? 'text-red-500' : 'text-gray-400'}`}>
                            {t.deadline ? new Date(t.deadline + 'T12:00').toLocaleDateString('es-ES') : '—'}
                            {t.deadline && t.deadline < today && !t.done ? ' ⚠️' : ''}
                          </td>
                          <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">{t.fecha_finalizacion ? new Date(t.fecha_finalizacion + 'T12:00').toLocaleDateString('es-ES') : '—'}</td>
                          <td className="px-3 py-3"><span className={`text-xs font-bold px-2 py-1 rounded-full ${prioBadge[t.prioridad] || 'bg-gray-100 text-gray-500'}`}>{t.prioridad || '—'}</span></td>
                          <td className="px-3 py-3 text-right tabular-nums">{t.tiempo_estimado || '—'}</td>
                          <td className="px-3 py-3"><span className={`text-xs font-bold px-2 py-1 rounded-full ${estadoBadge[t.estado] || 'bg-gray-100'}`}>{t.estado}</span></td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <button onClick={() => openEdit(t)} className="text-gray-400 hover:text-gray-700 p-1 rounded transition mr-1">✏️</button>
                            <button onClick={() => deleteTask(t.id)} className="text-gray-400 hover:text-red-500 p-1 rounded transition">🗑</button>
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {tab === 'hoy' && <>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-lg font-black">Tareas de hoy</h2>
              <p className="text-sm text-gray-400 mt-1">Tareas con deadline o fecha de solicitud hoy</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#9b1c5a] text-white">
                    {['', 'Tipo', 'Tarea', 'Deadline', 'Prioridad', 'Tiempo (min.)', 'Estado'].map((h, i) => (
                      <th key={i} className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hoy.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-gray-400">No hay tareas para hoy 🎉</td></tr>
                  ) : hoy.map(t => (
                    <tr key={t.id} className={`border-t border-gray-100 hover:bg-pink-50 transition ${t.done ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-3">
                        <div onClick={() => toggleDone(t)} className={`w-5 h-5 rounded-full border-2 cursor-pointer flex items-center justify-center transition ${t.done ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-[#9b1c5a]'}`}>
                          {t.done && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium">{t.tipo}</td>
                      <td className="px-3 py-3 max-w-xs"><div className={`truncate ${t.done ? 'line-through' : ''}`}>{t.tarea}</div></td>
                      <td className="px-3 py-3 text-xs text-gray-400">{t.deadline ? new Date(t.deadline + 'T12:00').toLocaleDateString('es-ES') : '—'}</td>
                      <td className="px-3 py-3"><span className={`text-xs font-bold px-2 py-1 rounded-full ${prioBadge[t.prioridad] || 'bg-gray-100'}`}>{t.prioridad || '—'}</span></td>
                      <td className="px-3 py-3 text-right">{t.tiempo_estimado || '—'}</td>
                      <td className="px-3 py-3"><span className={`text-xs font-bold px-2 py-1 rounded-full ${estadoBadge[t.estado] || 'bg-gray-100'}`}>{t.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) { setModal(false); setEditId(null) } }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-black">{editId ? 'Editar tarea' : 'Nueva tarea'}</h2>
              <button onClick={() => { setModal(false); setEditId(null) }} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">Tarea *</label>
                <input value={form.tarea} onChange={e => setForm({ ...form, tarea: e.target.value })} placeholder="Descripción de la tarea"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#9b1c5a]" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">Notas</label>
                <textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} rows={3} placeholder="Observaciones, contexto..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#9b1c5a] resize-none" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">Tipo</label>
                <input value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} placeholder="Ej: Tácticas, Reporting..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#9b1c5a]" list="tipos-list" />
                <datalist id="tipos-list">{tipos.map(t => <option key={t} value={t} />)}</datalist>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">Prioridad</label>
                <select value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#9b1c5a] bg-white">
                  {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">Estado</label>
                <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#9b1c5a] bg-white">
                  {ESTADOS.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">Tiempo estimado (min.)</label>
                <input type="number" value={form.tiempo_estimado} onChange={e => setForm({ ...form, tiempo_estimado: parseInt(e.target.value) || 0 })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#9b1c5a]" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">Fecha solicitud</label>
                <input type="date" value={form.fecha_solicitud} onChange={e => setForm({ ...form, fecha_solicitud: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#9b1c5a]" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">Deadline</label>
                <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#9b1c5a]" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">Fecha finalización</label>
                <input type="date" value={form.fecha_finalizacion} onChange={e => setForm({ ...form, fecha_finalizacion: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#9b1c5a]" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <button onClick={() => { setModal(false); setEditId(null) }} className="px-5 py-2 border border-gray-200 rounded-lg text-sm font-bold hover:bg-gray-50">Cancelar</button>
              <button onClick={saveTask} disabled={saving} className="px-5 py-2 bg-[#9b1c5a] text-white rounded-lg text-sm font-bold hover:bg-[#7e1649] disabled:opacity-50 transition">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
