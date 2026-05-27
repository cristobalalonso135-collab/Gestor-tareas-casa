'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type Tarea = {
  id: number
  tipo: string
  tarea: string
  estado: string
  tiempo_estimado: number
  deadline: string
  done: boolean
}

type Jornada = {
  fecha: string
  minutos_fichados: number
}

type ViewMode = 'pendientes' | 'historial' | 'todo'

const TIPO_COLORS: Record<string, string> = {
  Operativa: 'bg-sky-400', Táctica: 'bg-violet-400', Estratégica: 'bg-amber-400',
  Casa: 'bg-emerald-400', Diaria: 'bg-gray-300', Semanal: 'bg-gray-400', Mensual: 'bg-gray-500',
}
const TIPO_TEXT: Record<string, string> = {
  Operativa: 'text-sky-700', Táctica: 'text-violet-700', Estratégica: 'text-amber-700',
  Casa: 'text-emerald-700', Diaria: 'text-gray-500', Semanal: 'text-gray-600', Mensual: 'text-gray-700',
}

function minToHM(min: number): string {
  if (!min) return '0m'
  const h = Math.floor(min / 60), m = min % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function getAllDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const DAY_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

type Props = {
  onEditTarea?: (id: number) => void
  refreshKey?: number
}

export default function CargaTrabajo({ onEditTarea, refreshKey }: Props) {
  const [allTareas, setAllTareas] = useState<Tarea[]>([])
  const [jornadas, setJornadas] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('pendientes')
  const [soloLaborables, setSoloLaborables] = useState(false)
  const [editingJornada, setEditingJornada] = useState<string | null>(null)
  const [jornadaInput, setJornadaInput] = useState('')
  const [savingJornada, setSavingJornada] = useState(false)

  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const todayStr = dateKey(now)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: t }, { data: j }] = await Promise.all([
      supabase.from('tareas').select('id,tipo,tarea,estado,tiempo_estimado,deadline,done'),
      supabase.from('jornadas').select('fecha,minutos_fichados')
    ])
    setAllTareas(t || [])
    const jMap: Record<string, number> = {}
    ;(j || []).forEach((row: Jornada) => { jMap[row.fecha] = row.minutos_fichados })
    setJornadas(jMap)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (refreshKey && refreshKey > 0) fetchAll()
  }, [refreshKey, fetchAll])

  async function saveJornada(fecha: string, minutos: number) {
    setSavingJornada(true)
    await supabase.from('jornadas').upsert({ fecha, minutos_fichados: minutos }, { onConflict: 'fecha' })
    setJornadas(prev => ({ ...prev, [fecha]: minutos }))
    setSavingJornada(false)
    setEditingJornada(null)
  }

  const tareas = allTareas.filter(t => {
    if (viewMode === 'pendientes') return !t.done && t.estado !== 'Omitida' && t.estado !== 'Completada'
    if (viewMode === 'historial') return t.done || t.estado === 'Omitida' || t.estado === 'Completada'
    return true
  })

  const allDays = getAllDaysInMonth(viewYear, viewMonth)
  const workdays = soloLaborables ? allDays.filter(d => d.getDay() !== 0 && d.getDay() !== 6) : allDays

  const byDay: Record<string, Tarea[]> = {}
  tareas.forEach(t => {
    if (!t.deadline) return
    if (!byDay[t.deadline]) byDay[t.deadline] = []
    byDay[t.deadline].push(t)
  })

  const retrasadas = allTareas.filter(t => t.deadline && t.deadline < todayStr && !t.done && t.estado !== 'Omitida' && t.estado !== 'Completada')
  const retrasadasTotalMin = retrasadas.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)

  const maxMin = Math.max(480, ...workdays.map(d => {
    return (byDay[dateKey(d)] || []).reduce((s, t) => s + (t.tiempo_estimado||0), 0)
  }))

  const sinDeadline = tareas.filter(t => !t.deadline)
  const totalPendiente = tareas.reduce((s, t) => s + (t.tiempo_estimado||0), 0)
  const totalConDeadline = tareas.filter(t => !!t.deadline).reduce((s, t) => s + (t.tiempo_estimado||0), 0)

  const totalFichadoMes = workdays.reduce((s, d) => s + (jornadas[dateKey(d)] || 0), 0)
  const pctOcupacion = totalFichadoMes > 0 ? Math.round((totalPendiente / totalFichadoMes) * 100) : null

  const prevMonth = () => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1)}else setViewMonth(m=>m-1) }
  const nextMonth = () => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1)}else setViewMonth(m=>m+1) }

  function barColor(totalMin: number): string {
    if (totalMin > 480) return 'bg-red-400'
    if (totalMin > 420) return 'bg-orange-400'
    if (totalMin > 360) return 'bg-yellow-300'
    return 'bg-gray-200'
  }

  function barTextColor(totalMin: number): string {
    if (totalMin > 480) return 'text-red-500'
    if (totalMin > 420) return 'text-orange-500'
    if (totalMin > 360) return 'text-yellow-500'
    return 'text-gray-400'
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-300">
      <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin mr-3"></div>
      Cargando...
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="text-base font-semibold text-gray-900 min-w-[160px] text-center">{MONTH_NAMES[viewMonth]} {viewYear}</span>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
            {([['pendientes','Pendientes'],['historial','Historial'],['todo','Todo']] as [ViewMode,string][]).map(([m,l])=>(
              <button key={m} onClick={()=>setViewMode(m)}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${viewMode===m?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={()=>setSoloLaborables(v=>!v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${soloLaborables?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            {soloLaborables?'Solo laborables':'Todos los días'}
          </button>
          <button onClick={fetchAll} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">↺ Actualizar</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label:'Tiempo total', val:minToHM(totalPendiente), sub:`${tareas.length} tareas`, alert:false },
          { label:'Con deadline', val:minToHM(totalConDeadline), sub:`${tareas.filter(t=>!!t.deadline).length} tareas`, alert:false },
          { label:'Sin deadline', val:sinDeadline.length.toString(), sub:minToHM(sinDeadline.reduce((s,t)=>s+(t.tiempo_estimado||0),0)), alert:false },
          {
            label: 'Deuda retrasada',
            val: minToHM(retrasadasTotalMin),
            sub: `${retrasadas.length} tareas retrasadas`,
            alert: retrasadas.length > 0
          },
        ].map((s,i)=>(
          <div key={i} className={`border rounded-xl p-5 ${s.alert?'border-violet-200 bg-violet-50':'border-gray-100'}`}>
            <div className={`text-2xl font-bold mb-1 ${s.alert?'text-violet-600':'text-gray-900'}`}>{s.val}</div>
            <div className="text-sm font-semibold text-gray-700 mb-0.5">{s.label}</div>
            <div className="text-xs text-gray-400">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Day bars */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="bg-white px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Distribución por día</span>
          <div className="flex items-center gap-3 ml-auto text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-200 inline-block"></span>Libre</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-300 inline-block"></span>&gt;6h</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-400 inline-block"></span>&gt;7h</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-400 inline-block"></span>&gt;8h</span>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {workdays.map(d => {
            const key = dateKey(d)
            const dayTareas = byDay[key] || []
            const totalMin = dayTareas.reduce((s,t)=>s+(t.tiempo_estimado||0),0)
            const isHoy = key === todayStr
            const fichadoMin = jornadas[key] || 0
            const pct = maxMin>0?(totalMin/maxMin)*100:0
            const jornadaPct = maxMin>0?(480/maxMin)*100:100
            const isPast = key<todayStr && !isHoy
            const isExpanded = expandedDay===key
            const color = barColor(totalMin)
            const textColor = barTextColor(totalMin)
            const pctOcDia = fichadoMin>0?Math.round((totalMin/fichadoMin)*100):null

            return (
              <div key={key} className={`${isHoy?'bg-blue-50/40':isPast?'bg-gray-50/30':'bg-white'}`}>
                <div className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50/50 transition"
                  onClick={()=>setExpandedDay(isExpanded?null:key)}>

                  <div className="w-32 flex-shrink-0">
                    <div className={`text-sm font-semibold ${isHoy?'text-blue-600':isPast?'text-gray-300':d.getDay()===0||d.getDay()===6?'text-gray-400':'text-gray-700'}`}>
                      {DAY_NAMES[d.getDay()]} {d.getDate()}
                      {isHoy&&<span className="ml-1.5 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">HOY</span>}
                    </div>
                    <div className={`text-xs mt-0.5 font-medium ${textColor}`}>
                      {totalMin>0?minToHM(totalMin):<span className="text-gray-200">—</span>}
                      {pctOcDia!==null&&<span className="ml-1.5 text-gray-400 font-normal">({pctOcDia}%)</span>}
                    </div>
                  </div>

                  <div className="flex-1 relative h-6 bg-gray-50 rounded-lg overflow-hidden">
                    <div className="absolute top-0 bottom-0 w-px bg-gray-300 z-10" style={{left:`${Math.min(jornadaPct,99)}%`}}></div>
                    {totalMin>0&&<div className={`h-full rounded-lg transition-all ${color}`} style={{width:`${Math.min(pct,100)}%`}}></div>}
                    {totalMin>480&&<div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-red-500">+{minToHM(totalMin-480)}</div>}
                  </div>

                  <div className="w-28 flex-shrink-0 flex items-center justify-end gap-1" onClick={e=>e.stopPropagation()}>
                    {editingJornada===key ? (
                      <div className="flex items-center gap-1">
                        <input type="number" value={jornadaInput}
                          onChange={e=>setJornadaInput(e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')saveJornada(key,parseInt(jornadaInput)||0);if(e.key==='Escape')setEditingJornada(null)}}
                          className="w-16 border border-gray-300 rounded px-2 py-0.5 text-xs text-center outline-none focus:border-gray-500"
                          placeholder="min" autoFocus/>
                        <button onClick={()=>saveJornada(key,parseInt(jornadaInput)||0)} disabled={savingJornada}
                          className="text-xs text-emerald-500 hover:text-emerald-600 font-bold">✓</button>
                      </div>
                    ) : (
                      <button onClick={()=>{setEditingJornada(key);setJornadaInput(fichadoMin.toString())}}
                        className={`text-xs px-2 py-1 rounded-lg border transition ${fichadoMin>0?'border-gray-200 text-gray-600 hover:bg-gray-50':'border-dashed border-gray-200 text-gray-300 hover:text-gray-400 hover:border-gray-300'}`}>
                        {fichadoMin>0?`⏱ ${minToHM(fichadoMin)}`:'+ fichado'}
                      </button>
                    )}
                  </div>

                  <div className="w-20 flex-shrink-0 flex items-center justify-end gap-2">
                    {(dayTareas.length>0||(isHoy&&retrasadas.length>0))&&<span className="text-xs text-gray-400">{dayTareas.length+(isHoy?retrasadas.length:0)} tarea{(dayTareas.length+(isHoy?retrasadas.length:0))!==1?'s':''}</span>}
                    {(dayTareas.length>0||(isHoy&&retrasadas.length>0))&&(
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        className={`text-gray-300 transition-transform ${isExpanded?'rotate-180':''}`}>
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    )}
                  </div>
                </div>

                {isExpanded&&(dayTareas.length>0||(isHoy&&retrasadas.length>0))&&(
                  <div className="px-5 pb-3 space-y-1.5 border-t border-gray-50">
                    {/* Tareas del día */}
                    {dayTareas.sort((a,b)=>(b.tiempo_estimado||0)-(a.tiempo_estimado||0)).map(t=>(
                      <div key={t.id}
                        className="flex items-center gap-3 py-1.5 px-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition group"
                        onClick={()=>onEditTarea?.(t.id)}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TIPO_COLORS[t.tipo]||'bg-gray-300'}`}></span>
                        <span className={`text-xs flex-1 truncate font-medium ${TIPO_TEXT[t.tipo]||'text-gray-600'}`} title={t.tarea}>{t.tarea}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{minToHM(t.tiempo_estimado)}</span>
                        <span className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition flex-shrink-0">✏ editar</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                          t.estado==='Completada'?'bg-emerald-100 text-emerald-600':
                          t.estado==='Omitida'?'bg-gray-100 text-gray-400':
                          t.estado==='En progreso'?'bg-blue-100 text-blue-600':
                          t.estado==='En espera'?'bg-amber-100 text-amber-600':
                          'bg-gray-100 text-gray-400'
                        }`}>{t.estado}</span>
                      </div>
                    ))}

                    {/* Retrasadas solo en HOY */}
                    {isHoy&&retrasadas.length>0&&(
                      <>
                        <div className="flex items-center gap-2 pt-2 pb-0.5">
                          <div className="flex-1 h-px bg-violet-100"></div>
                          <span className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider">Retrasadas ({retrasadas.length}) · {minToHM(retrasadasTotalMin)}</span>
                          <div className="flex-1 h-px bg-violet-100"></div>
                        </div>
                        {retrasadas.sort((a,b)=>(b.tiempo_estimado||0)-(a.tiempo_estimado||0)).map(t=>(
                          <div key={`ret-${t.id}`}
                            className="flex items-center gap-3 py-1.5 px-3 bg-violet-50/50 rounded-lg hover:bg-violet-100/50 cursor-pointer transition group"
                            onClick={()=>onEditTarea?.(t.id)}>
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TIPO_COLORS[t.tipo]||'bg-gray-300'}`}></span>
                            <span className={`text-xs flex-1 truncate font-medium ${TIPO_TEXT[t.tipo]||'text-gray-600'}`} title={t.tarea}>{t.tarea}</span>
                            <span className="text-[10px] text-violet-400 flex-shrink-0">{t.deadline}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">{minToHM(t.tiempo_estimado)}</span>
                            <span className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition flex-shrink-0">✏ editar</span>
                          </div>
                        ))}
                      </>
                    )}

                    <div className="flex justify-between pt-1 text-xs text-gray-400">
                      <span>{dayTareas.filter(t=>t.done||t.estado==='Completada').length} completadas · {dayTareas.filter(t=>t.estado==='Omitida').length} omitidas</span>
                      <span className="font-semibold text-gray-500">{minToHM(totalMin)} total</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Sin deadline */}
      {sinDeadline.length>0&&(
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="bg-white px-5 py-3 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sin deadline</span>
            <span className="ml-2 text-xs text-gray-400">— {sinDeadline.length} tarea{sinDeadline.length!==1?'s':''} · {minToHM(sinDeadline.reduce((s,t)=>s+(t.tiempo_estimado||0),0))}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {sinDeadline.map(t=>(
              <div key={t.id}
                className="flex items-center gap-3 px-5 py-3 bg-white hover:bg-gray-50 cursor-pointer transition group"
                onClick={()=>onEditTarea?.(t.id)}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TIPO_COLORS[t.tipo]||'bg-gray-300'}`}></span>
                <span className="text-sm text-gray-700 flex-1 truncate">{t.tarea}</span>
                <span className="text-xs text-gray-400">{minToHM(t.tiempo_estimado)}</span>
                <span className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition">✏ editar</span>
                <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${TIPO_TEXT[t.tipo]||'text-gray-500'}`}>{t.tipo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Promedios por día de la semana */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="bg-white px-5 py-3 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Promedio por día de la semana</span>
          <span className="ml-2 text-xs text-gray-400">— basado en {MONTH_NAMES[viewMonth]}</span>
        </div>
        <div className="grid grid-cols-7 divide-x divide-gray-50">
          {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((dayName, i) => {
            const dowIndex = i === 6 ? 0 : i + 1
            const daysOfThisType = allDays.filter(d => d.getDay() === dowIndex)
            const count = daysOfThisType.length
            const totalMin = daysOfThisType.reduce((s, d) => {
              const key = dateKey(d)
              return s + (byDay[key] || []).reduce((ss, t) => ss + (t.tiempo_estimado||0), 0)
            }, 0)
            const totalTareas = daysOfThisType.reduce((s, d) => {
              const key = dateKey(d)
              return s + (byDay[key] || []).length
            }, 0)
            const avgMin = count > 0 ? Math.round(totalMin / count) : 0
            const avgTareas = count > 0 ? (totalTareas / count).toFixed(1) : '0'
            const isWeekend = i >= 5
            return (
              <div key={dayName} className={`p-4 text-center ${isWeekend?'bg-gray-50/50':''}`}>
                <div className={`text-xs font-semibold mb-1 ${isWeekend?'text-gray-400':'text-gray-600'}`}>{dayName}</div>
                <div className={`text-[10px] mb-2 ${isWeekend?'text-gray-300':'text-gray-400'}`}>{count} {count===1?'vez':'veces'}</div>
                <div className={`text-base font-bold mb-0.5 ${isWeekend?'text-gray-300':'text-gray-800'}`}>{minToHM(avgMin)}</div>
                <div className={`text-[10px] mb-2 ${isWeekend?'text-gray-300':'text-gray-400'}`}>media/día</div>
                <div className={`text-[11px] font-semibold ${isWeekend?'text-gray-200':'text-gray-500'}`}>{minToHM(totalMin)}</div>
                <div className={`text-[10px] ${isWeekend?'text-gray-200':'text-gray-300'}`}>total</div>
                <div className={`text-[10px] mt-1 ${isWeekend?'text-gray-200':'text-gray-400'}`}>{avgTareas} tareas/día</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
