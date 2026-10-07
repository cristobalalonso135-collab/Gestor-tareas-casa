'use client'

import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { fetchAllTareas } from '@/lib/supabaseTasks'
import { fetchAllTaskTimeLogs, fetchTaskTimeLogs, logSeconds, minutesFromSeconds, removeLogsAfterCompletion, setTaskMinutesForDate, setTaskSecondsForDate, TASK_TIME_UPDATED_EVENT, todayRealSeconds, taskRealSeconds, type TaskTimeLog, type TaskTimeUpdatedDetail } from '@/lib/taskTimeLogs'
import CargaTrabajo from './CargaTrabajo'
import Ejecucion from './Ejecucion'
import Priorizador from './Priorizador'
import Replanificador from './Replanificador'
import Rendimiento from './Rendimiento'
import Planificacion from './Planificacion'
import Decisiones from './Decisiones'
import RoutineSpawnNotice from './RoutineSpawnNotice'
import { routineBlockForTask, routineGroupRank, routinePlanSort } from './routineBlocks'
import { loadAppSetting, saveAppSetting, readLocalSetting } from '@/lib/appSettings'
import {
  CAPACITY_KEY,
  CASA_CAPACITY_OVERRIDES_KEY,
  PREVISION_KEY,
  defaultWorkCapacity,
  defaultWorkdayForecast,
  loadStatus,
  APARCADA_FECHA,
  defaultCasaCapacity,
  isAparcada,
  isClosedTask,
  isEvento,
  isRoutineType,
  isReunion,
  EVENT_TYPE,
  ROUTINE_TYPES,
  canonicalTipo,
  reunionTitle,
  reunionNombreFromTitle,
  parseMeetingSchedule,
  formatMeetingNotes,
  meetingMinutes,
  meetingRepeatDates,
  weekdayNameEs,
  datedRoutineTitle,
  type MeetingRepeat,
  withInheritedCasa,
  reminderGroupLabel,
  reminderAnchorDate,
  reminderDateRange,
  formatReminderRange,
  REMINDER_GROUP_ORDER_KEY,
  REMINDER_GROUP_COLLAPSED_KEY,
} from '@/lib/taskRules'
import { TIPO_CHIP, TIPO_DOT, TIPO_TEXT } from '@/lib/tipoColors'
import { LAST_WORKDAY_ROUTINE_MONTHS, inferRoutineRepeat, nextRoutineRepeatDate, routineRepeatDates, routineRepeatGroup, ROUTINE_REPEAT_OPTIONS, type RoutineRepeat } from '@/lib/zaragozaCalendar'
import { spawnNextRepeatingRoutineById, type SpawnRepeatNotice } from '@/lib/spawnRepeatingRoutine'

type Tarea = {
  id: number
  tipo: string
  tarea: string
  notas: string
  prioridad: string
  estado: string
  tiempo_estimado: number
  tiempo_real: number
  tiempo_real_segundos?: number | null
  fecha_solicitud: string
  deadline: string
  fecha_planificada?: string | null
  fecha_finalizacion: string
  done: boolean
  solicitado_por: string
  orden: number
  prioridad_orden?: number | null
  en_plan: boolean
  hora_finalizacion?: string
  excluir_plan?: boolean
  excluida_fecha?: string | null
  aparcada?: boolean
  para_casa?: boolean | null
  fecha_casa?: string | null
  parent_id?: number | null
  fragmento_num?: number | null
  fragmentos_total?: number | null
  es_fragmento?: boolean
  es_padre?: boolean
  grupo?: string | null
}

const TIPOS_FORM: string[] = [...ROUTINE_TYPES, 'Operativa', 'Táctica', 'Estratégica', EVENT_TYPE, 'Reunión']
const TIPOS_ALL: string[] = [...ROUTINE_TYPES, 'Operativa', 'Táctica', 'Estratégica', EVENT_TYPE, 'Reunión']
const ESTADOS    = ['Pendiente', 'En espera', 'En progreso', 'Completada', 'Omitida']
const PRIORIDADES = ['Alta', 'Media', 'Baja']
const WORK_TYPES_FOR_PRIORITY = new Set(['Operativa', 'T\u00e1ctica', 'Estrat\u00e9gica', EVENT_TYPE])
const WEEKDAY_CHIPS = [
  { day: 1, label: 'L' },
  { day: 2, label: 'M' },
  { day: 3, label: 'X' },
  { day: 4, label: 'J' },
  { day: 5, label: 'V' },
  { day: 6, label: 'S' },
  { day: 0, label: 'D' },
]

const TABS = [
  { key: 'Todas',       label: 'Todas',        emoji: '◈',  sub: '' },
  { key: 'Rutinaria',   label: 'Rutinarias',   emoji: '🔁', sub: '' },
  { key: 'Operativa',   label: 'Operativas',   emoji: '⚡', sub: '≤30 min' },
  { key: 'Táctica',     label: 'Tácticas',     emoji: '🎯', sub: '≤90 min' },
  { key: 'Estratégica', label: 'Estratégicas', emoji: '⛰️', sub: '>90 min' },
  { key: EVENT_TYPE,    label: 'Recordatorios', emoji: '📍', sub: 'aviso' },
  { key: 'Reunión',     label: 'Reuniones',    emoji: '📅', sub: 'bloque' },
  { key: 'Completadas', label: 'Historial',    emoji: '📁', sub: '' },
  { key: 'Plan',          label: 'Plan',         emoji: '☀️', sub: '' },
  { key: 'Casa',          label: 'Casa',         emoji: '🌙', sub: '' },
  { key: 'Ejecucion',     label: 'Ejecución',    emoji: '▶', sub: '' },
  { key: 'Aplazadas',     label: 'Clasificar',   emoji: '📥', sub: '' },
  { key: 'Decisiones',    label: 'Decisiones',   emoji: '❗', sub: '' },
  { key: 'Rendimiento',   label: 'Rendimiento',  emoji: '📉', sub: '' },
  { key: 'Carga',         label: 'Carga',        emoji: '📊', sub: '' },
  { key: 'Replanificar',  label: 'Calendario',   emoji: '🗓️', sub: '' },
  { key: 'Planificacion', label: 'Semana',       emoji: '🧭', sub: '' },
  { key: 'Priorizar',     label: 'Priorizador',  emoji: '📌', sub: '' },
]

const NAV_GROUPS: { label: string, keys: string[] }[] = [
  { label: 'Listas', keys: ['Todas', 'Rutinaria', 'Operativa', 'Táctica', 'Estratégica', EVENT_TYPE, 'Reunión', 'Completadas'] },
  { label: 'Hoy', keys: ['Plan', 'Casa', 'Ejecucion'] },
  { label: 'Revisar', keys: ['Aplazadas', 'Decisiones', 'Rendimiento'] },
  { label: 'Planificar', keys: ['Carga', 'Replanificar', 'Planificacion', 'Priorizar'] },
]

const TYPE_NAV_DOT: Record<string, string> = {
  Rutinaria: TIPO_DOT.Diaria,
  Operativa: TIPO_DOT.Operativa,
  Táctica: TIPO_DOT.Táctica,
  Estratégica: TIPO_DOT.Estratégica,
  [EVENT_TYPE]: TIPO_DOT[EVENT_TYPE],
  Reunión: TIPO_DOT.Reunión,
}

const empty: Omit<Tarea, 'id'> = {
  tipo: 'Operativa', tarea: '', notas: '', prioridad: 'Media', estado: 'Pendiente',
  tiempo_estimado: 0, tiempo_real: 0, tiempo_real_segundos: 0, fecha_solicitud: '', deadline: '', fecha_planificada: '',
  fecha_finalizacion: '', done: false, solicitado_por: '', orden: 0, en_plan: false, aparcada: false, para_casa: false, fecha_casa: '',
  grupo: ''
}

const TIPO_COLORS = TIPO_CHIP

const RUTINA_MARKS: Record<string, { code: string, title: string, border: string }> = {
  Diaria: { code: 'D', title: 'Diaria: fija', border: 'border-solid border-gray-300' },
  Bisemanal: { code: '2S', title: 'Bisemanal: 2 veces/semana', border: 'border-dashed border-gray-400' },
  Semanal: { code: 'S', title: 'Semanal: reubicable', border: 'border-dashed border-gray-400' },
  Bimensual: { code: '2M', title: 'Bimensual: 2 veces/mes', border: 'border-dotted border-gray-500' },
  Mensual: { code: 'M', title: 'Mensual: flexible', border: 'border-dotted border-gray-500' },
}

const ESTADO_COLORS: Record<string, { bg: string, text: string }> = {
  Pendiente:     { bg: 'bg-gray-100',   text: 'text-gray-500' },
  'En espera':   { bg: 'bg-amber-50',   text: 'text-amber-600' },
  'En progreso': { bg: 'bg-blue-50',    text: 'text-blue-600' },
  Completada:    { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  Omitida:       { bg: 'bg-gray-100',   text: 'text-gray-400' },
}

const MASTER_COLS = [
  { key: 'tipo',            label: 'tipo *',            hint: 'Diaria / Bisemanal (2×/semana) / Semanal / Bimensual (2×/mes) / Mensual / Operativa / Táctica / Estratégica / Recordatorio (aviso, 0 min) / Reunión (bloque con hora)' },
  { key: 'tarea',           label: 'tarea *',           hint: 'Texto libre con fecha al final. Reunión: Reunión Budget Puma 11/09/2026' },
  { key: 'notas',           label: 'notas',             hint: 'Texto libre' },
  { key: 'solicitado_por',  label: 'solicitado_por *',  hint: 'Nombre o equipo' },
  { key: 'prioridad',       label: 'prioridad *',       hint: 'Alta / Media / Baja' },
  { key: 'estado',          label: 'estado *',          hint: 'Pendiente / En espera / En progreso / Completada' },
  { key: 'tiempo_estimado', label: 'tiempo_estimado *', hint: 'Minutos. Vacío si Recordatorio. En Reunión, duración de la hora inicio-fin' },
  { key: 'tiempo_real',     label: 'tiempo_real',       hint: 'Número entero (minutos)' },
  { key: 'fecha_solicitud', label: 'fecha_solicitud *', hint: 'DD/MM/AAAA' },
  { key: 'deadline',        label: 'deadline *',        hint: 'DD/MM/AAAA' },
  { key: 'fecha_planificada', label: 'fecha_planificada', hint: 'Opcional. DD/MM/AAAA. Día en el que quieres trabajarla' },
]

const EXPORT_COLS: { key: string, label: string }[] = [
  { key: 'lista', label: 'lista' },
  { key: 'id', label: 'id' },
  { key: 'tipo', label: 'tipo' },
  { key: 'tarea', label: 'tarea' },
  { key: 'notas', label: 'notas' },
  { key: 'solicitado_por', label: 'solicitado_por' },
  { key: 'prioridad', label: 'prioridad' },
  { key: 'estado', label: 'estado' },
  { key: 'tiempo_estimado', label: 'tiempo_estimado' },
  { key: 'tiempo_real', label: 'tiempo_real' },
  { key: 'fecha_solicitud', label: 'fecha_solicitud' },
  { key: 'deadline', label: 'deadline' },
  { key: 'fecha_planificada', label: 'fecha_planificada' },
  { key: 'grupo', label: 'grupo' },
  { key: 'created_at', label: 'created_at' },
  { key: 'done', label: 'done' },
  { key: 'fecha_finalizacion', label: 'fecha_finalizacion' },
  { key: 'hora_finalizacion', label: 'hora_finalizacion' },
  { key: 'tiempo_real_segundos', label: 'tiempo_real_segundos' },
  { key: 'orden', label: 'orden' },
  { key: 'prioridad_orden', label: 'prioridad_orden' },
  { key: 'en_plan', label: 'en_plan' },
  { key: 'excluir_plan', label: 'excluir_plan' },
  { key: 'excluida_fecha', label: 'excluida_fecha' },
  { key: 'aparcada', label: 'aparcada' },
  { key: 'para_casa', label: 'para_casa' },
  { key: 'fecha_casa', label: 'fecha_casa' },
  { key: 'parent_id', label: 'parent_id' },
  { key: 'es_padre', label: 'es_padre' },
  { key: 'es_fragmento', label: 'es_fragmento' },
  { key: 'fragmento_num', label: 'fragmento_num' },
  { key: 'fragmentos_total', label: 'fragmentos_total' },
]

function diasRetrasoFn(deadline: string, today: string): number { return diasRetraso(deadline, today) }
function diasRetraso(deadline: string, today: string): number {
  if (!deadline || deadline >= today) return 0
  return Math.floor((new Date(today).getTime() - new Date(deadline).getTime()) / 86400000)
}

function fDate(d: string) {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

function exportDate(value?: string | null) {
  if (!value) return ''
  const iso = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function exportDateTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    const day = exportDate(value)
    const time = String(value).slice(11, 16)
    return time ? `${day} ${time}` : day
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function exportBool(value: unknown) {
  if (value === true || value === 'true') return 'Sí'
  if (value === false || value === 'false') return 'No'
  return ''
}

const EXPORT_DATE_KEYS = new Set(['fecha_solicitud', 'deadline', 'fecha_planificada', 'fecha_finalizacion', 'fecha_casa', 'excluida_fecha'])
const EXPORT_BOOL_KEYS = new Set(['done', 'en_plan', 'excluir_plan', 'para_casa', 'es_padre', 'es_fragmento'])
const EXPORT_NUMBER_KEYS = new Set(['id', 'tiempo_estimado', 'tiempo_real', 'tiempo_real_segundos', 'orden', 'prioridad_orden', 'parent_id', 'fragmento_num', 'fragmentos_total'])

function exportCell(task: { [key: string]: any }, key: string): string | number {
  if (key === 'lista') return isClosedTask(task) ? 'Historial' : 'Activas'
  if (key === 'aparcada') return isAparcada(task) ? 'Sí' : 'No'
  if (key === 'created_at') return exportDateTime(task.created_at)
  if (EXPORT_DATE_KEYS.has(key)) return exportDate(task[key])
  if (EXPORT_BOOL_KEYS.has(key)) return exportBool(task[key])
  if (EXPORT_NUMBER_KEYS.has(key)) {
    const value = task[key]
    if (value === null || value === undefined || value === '') return ''
    return Number(value)
  }
  return task[key] ?? ''
}

function exportSheetRange(colCount: number, rowCount: number) {
  return `A1:${columnName(colCount)}${Math.max(rowCount, 1)}`
}

function asExcelTable(sheet: XLSX.WorkSheet, colCount: number, rowCount: number) {
  const ref = exportSheetRange(colCount, rowCount)
  sheet['!ref'] = ref
  sheet['!autofilter'] = { ref }
  ;(sheet as any)['!views'] = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }]
}

function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function notifySupabaseError(error: { message?: string } | null | undefined, action: string) {
  if (!error) return false
  alert(`No pude ${action}: ${error.message || 'error desconocido'}${grupoColumnHint(error.message)}`)
  return true
}

function grupoColumnHint(message?: string) {
  if (!message || !/column .*grupo|grupo.*does not exist/i.test(message)) return ''
  return '\n\nFalta la columna grupo en Supabase. En el SQL Editor pega y ejecuta:\n\nalter table public.tareas add column if not exists grupo text;'
}

function cleanDateForKpi(value?: string | null): string {
  if (!value) return ''
  const raw = String(value).trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return raw.slice(0, 10)
}

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftDateKey(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00`)
  d.setDate(d.getDate() + days)
  return localDateKey(d)
}

function monthKey(value: string): string {
  return value.slice(0, 7)
}

function addMonths(value: string, months: number): string {
  const d = new Date(`${value}-01T00:00:00`)
  d.setMonth(d.getMonth() + months)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function daysOfMonth(value: string): string[] {
  const [year, month] = value.split('-').map(Number)
  const total = new Date(year, month, 0).getDate()
  return Array.from({ length: total }, (_, index) => `${value}-${String(index + 1).padStart(2, '0')}`)
}

function monthLabel(value: string): string {
  const date = new Date(`${value}-01T00:00:00`)
  return date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
}

function parseDate(raw: string): string | null {
  if (!raw?.trim()) return null
  const s = raw.trim()
  const isValidDate = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  }
  const buildDate = (y: number, m: number, d: number) => {
    if (!isValidDate(y, m, d)) return null
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }
  const excelSerial = Number(s)
  if (/^\d+(\.\d+)?$/.test(s) && excelSerial > 20000 && excelSerial < 80000) {
    const date = XLSX.SSF.parse_date_code(excelSerial)
    if (date) return buildDate(date.y, date.m, date.d)
  }
  const slashOrDash = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/)
  if (slashOrDash) {
    const [, d, m, year] = slashOrDash
    const y = year.length === 2 ? 2000 + Number(year) : Number(year)
    return buildDate(y, Number(m), Number(d))
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  return null
}

function xmlEscape(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function columnName(index: number): string {
  let n = index
  let name = ''
  while (n > 0) {
    const mod = (n - 1) % 26
    name = String.fromCharCode(65 + mod) + name
    n = Math.floor((n - mod) / 26)
  }
  return name
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function makeZip(files: { path: string, content: string }[]): Blob {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  const writeU16 = (view: DataView, pos: number, value: number) => view.setUint16(pos, value, true)
  const writeU32 = (view: DataView, pos: number, value: number) => view.setUint32(pos, value >>> 0, true)

  for (const file of files) {
    const name = encoder.encode(file.path)
    const data = encoder.encode(file.content)
    const crc = crc32(data)

    const local = new Uint8Array(30 + name.length)
    const localView = new DataView(local.buffer)
    writeU32(localView, 0, 0x04034b50)
    writeU16(localView, 4, 20)
    writeU16(localView, 6, 0)
    writeU16(localView, 8, 0)
    writeU16(localView, 10, 0)
    writeU16(localView, 12, 0)
    writeU32(localView, 14, crc)
    writeU32(localView, 18, data.length)
    writeU32(localView, 22, data.length)
    writeU16(localView, 26, name.length)
    writeU16(localView, 28, 0)
    local.set(name, 30)

    localParts.push(local, data)

    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    writeU32(centralView, 0, 0x02014b50)
    writeU16(centralView, 4, 20)
    writeU16(centralView, 6, 20)
    writeU16(centralView, 8, 0)
    writeU16(centralView, 10, 0)
    writeU16(centralView, 12, 0)
    writeU16(centralView, 14, 0)
    writeU32(centralView, 16, crc)
    writeU32(centralView, 20, data.length)
    writeU32(centralView, 24, data.length)
    writeU16(centralView, 28, name.length)
    writeU16(centralView, 30, 0)
    writeU16(centralView, 32, 0)
    writeU16(centralView, 34, 0)
    writeU16(centralView, 36, 0)
    writeU32(centralView, 38, 0)
    writeU32(centralView, 42, offset)
    central.set(name, 46)
    centralParts.push(central)

    offset += local.length + data.length
  }

  const centralDirectory = concatBytes(centralParts)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  writeU32(endView, 0, 0x06054b50)
  writeU16(endView, 4, 0)
  writeU16(endView, 6, 0)
  writeU16(endView, 8, files.length)
  writeU16(endView, 10, files.length)
  writeU32(endView, 12, centralDirectory.length)
  writeU32(endView, 16, offset)
  writeU16(endView, 20, 0)

  const zipBytes = concatBytes([...localParts, centralDirectory, end])
  const blobPart = zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer

  return new Blob([blobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function xlsxCell(ref: string, value: string | number, style = 0): string {
  const styleAttr = style ? ` s="${style}"` : ''
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t>${xmlEscape(value)}</t></is></c>`
}

function buildMasterWorkbook(today: string): Blob {
  const todayEs = fDate(today)
  const rows: string[] = []
  rows.push(`<row r="1">${MASTER_COLS.map((col, i) => xlsxCell(`${columnName(i + 1)}1`, col.label, 1)).join('')}</row>`)

  for (let r = 2; r <= 13; r += 1) {
    const values = [
      'Operativa',
      '',
      '',
      '',
      'Media',
      'Pendiente',
      '',
      '',
      todayEs,
      todayEs,
      '',
    ]
    rows.push(`<row r="${r}">${values.map((value, i) => xlsxCell(`${columnName(i + 1)}${r}`, value)).join('')}</row>`)
  }

  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="18" customWidth="1"/>
    <col min="2" max="2" width="42" customWidth="1"/>
    <col min="3" max="4" width="22" customWidth="1"/>
    <col min="5" max="6" width="16" customWidth="1"/>
    <col min="7" max="8" width="20" customWidth="1"/>
    <col min="9" max="11" width="18" customWidth="1"/>
  </cols>
  <sheetData>${rows.join('')}</sheetData>
  <dataValidations count="3">
    <dataValidation type="list" allowBlank="0" showErrorMessage="1" sqref="A2:A13"><formula1>"${TIPOS_ALL.join(',')}"</formula1></dataValidation>
    <dataValidation type="list" allowBlank="0" showErrorMessage="1" sqref="E2:E13"><formula1>"Alta,Media,Baja"</formula1></dataValidation>
    <dataValidation type="list" allowBlank="0" showErrorMessage="1" sqref="F2:F13"><formula1>"Pendiente,En espera,En progreso,Completada"</formula1></dataValidation>
  </dataValidations>
</worksheet>`

  return makeZip([
    {
      path: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      path: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      path: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Maestro tareas" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      path: 'xl/styles.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`,
    },
    { path: 'xl/worksheets/sheet1.xml', content: worksheet },
  ])
}

async function readImportRows(file: File): Promise<string[][]> {
  const isExcel = /\.(xlsx|xlsm|xls)$/i.test(file.name)
  const cleanCell = (value: unknown) => String(value ?? '').trim().replace(/"{2,}/g, '"')

  if (isExcel) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, dateNF: 'dd/mm/yyyy' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return []

    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      dateNF: 'dd/mm/yyyy',
      defval: '',
    })

    return rows
      .map(row => row.map(cleanCell))
      .filter(row => row.some(Boolean))
  }

  const text = await file.text()
  const firstLine = text.split('\n')[0]
  const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ','
  const parseLine = (line: string) => {
    const cells: string[] = []
    let cell = ''
    let quoted = false

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      const next = line[i + 1]

      if (char === '"' && quoted && next === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = !quoted
      } else if (char === sep && !quoted) {
        cells.push(cleanCell(cell))
        cell = ''
      } else {
        cell += char
      }
    }

    cells.push(cleanCell(cell))
    return cells
  }

  return text
    .split('\n')
    .map(line => parseLine(line.trim()))
    .filter(row => row.some(Boolean))
}

function minToHM(min: number): string {
  if (!min) return '0m'
  const h = Math.floor(min / 60), m = min % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatCount(n: number): string {
  const safe = Math.round(Number(n) || 0)
  return String(Math.abs(safe)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function secondsToDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function KpiCard({ label, val, sub, accent }: { label: string, val: string | number, sub?: string, accent?: boolean }) {
  return (
    <div className={`border rounded-xl p-5 transition ${accent ? 'border-blue-100 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
      <div className={`text-2xl font-bold mb-1 ${accent ? 'text-blue-600' : 'text-gray-900'}`}>{val}</div>
      <div className="text-sm font-semibold text-gray-700 mb-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  )
}
function GeneralKpis({ tareas, filtered, tab, today }: { tareas: any[], filtered: any[], tab: string, today: string }) {
  const workTareas = tareas
  const total = filtered.length
  const tEst = filtered.reduce((s: number, t: any) => s + (t.tiempo_estimado || 0), 0)
  const completadasHoy = workTareas.filter((t: any) => t.fecha_finalizacion === today && (t.done || t.estado === 'Completada')).length
  const avgMin = total > 0 ? Math.round(tEst / total) : 0
  const strategicParts = tab === 'Estratégica'
    ? filtered.reduce((sum: number, t: any) => sum + (Array.isArray(t.__children) ? t.__children.length : 1), 0)
    : total
  const totalLabel = tab === 'Estratégica' && strategicParts > total ? `${formatCount(total)} (${formatCount(strategicParts)})` : formatCount(total)

  if (tab === 'Casa') {
    const casaDateForKpi = (t: any) => {
      const raw = cleanDateForKpi(t.fecha_casa || '') || today
      return raw < today ? today : raw
    }
    const casaHoy = filtered.filter((t: any) => casaDateForKpi(t) === today)
    const casaHoyMin = casaHoy.reduce((s: number, t: any) => s + (t.tiempo_estimado || 0), 0)
    return (
      <div className="grid grid-cols-2 gap-5 mb-8">
        <KpiCard label="Tareas fuera de jornada" val={formatCount(total)} sub={`${formatCount(casaHoy.length)} para hoy`}/>
        <KpiCard label="Tiempo estimado" val={minToHM(tEst)} sub={`${minToHM(casaHoyMin)} hoy`}/>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-4 gap-5 mb-8">
      <KpiCard label="Tareas" val={totalLabel} sub={tab === 'Estratégica' && strategicParts > total ? 'padres (partes)' : tab === 'Completadas' ? 'en historial' : 'sin completar'}/>
      <KpiCard label="Tiempo estimado" val={minToHM(tEst)} sub={`${avgMin}m de media`}/>
      <KpiCard label="Completadas hoy" val={formatCount(completadasHoy)} sub="marcadas hoy"/>
      <KpiCard label="Tareas activas total" val={formatCount(workTareas.filter((t: any) => !t.done && t.estado !== 'Omitida').length)} sub={minToHM(workTareas.filter((t: any) => !t.done && t.estado !== 'Omitida').reduce((s: number, t: any) => s + (t.tiempo_estimado || 0), 0))}/>
    </div>
  )
}

function PlanKpis({ filtered, taskMinutesToday, taskLogsByTask, today, cronoSeconds, cronoRunning, onStart, onPause, onReset, formatCrono, previsionMin, dayCapacityMin, setPrevisionMin, onAdjustStart, onAdjustEnd, casaHoyCount, casaHoyMin, onOpenCasa }:
  { filtered: any[], taskMinutesToday: Record<number, number>, taskLogsByTask: Record<number, TaskTimeLog[]>, today: string, cronoSeconds: number, cronoRunning: boolean, onStart: ()=>void, onPause: ()=>void, onReset: ()=>void, formatCrono: (s:number)=>string, previsionMin: number, dayCapacityMin: number, setPrevisionMin: (v:number)=>void, onAdjustStart: (hhmm:string)=>void, onAdjustEnd: (hhmm:string)=>void, casaHoyCount: number, casaHoyMin: number, onOpenCasa: ()=>void }) {

  const [editingPrev, setEditingPrev] = useState(false)
  const [prevInput, setPrevInput] = useState(String(previsionMin))
  const [editingStart, setEditingStart] = useState(false)
  const [startInput, setStartInput] = useState('09:00')
  const [editingEnd, setEditingEnd] = useState(false)
  const [endInput, setEndInput] = useState('17:30')

  const total = filtered.length
  const hechas = filtered.filter((t: any) => t.done || t.estado === 'Completada' || t.estado === 'Omitida').length
  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0

  const estimatedForToday = (t: any) => {
    if (isEvento(t.tipo)) return 0
    const workedBeforeTodaySeconds = (taskLogsByTask[t.id] || [])
      .filter(log => log.fecha < today)
      .reduce((s, log) => s + logSeconds(log), 0)
    const workedBeforeTodayMin = minutesFromSeconds(workedBeforeTodaySeconds)
    return Math.max(0, (t.tiempo_estimado || 0) - workedBeforeTodayMin)
  }

  const tEstTotal = filtered.reduce((s: number, t: any) => s + estimatedForToday(t), 0)
  const tEstHecho = filtered.filter((t: any) => t.done || t.estado === 'Completada').reduce((s: number, t: any) => s + estimatedForToday(t), 0)
  const tEstPendiente = filtered.filter((t: any) => !t.done && t.estado !== 'Completada' && t.estado !== 'Omitida').reduce((s: number, t: any) => s + estimatedForToday(t), 0)
  const pctTiempo = tEstTotal > 0 ? Math.round((tEstHecho / tEstTotal) * 100) : 0
  const plannedTodayLoad = filtered
    .filter((t: any) => t.estado !== 'Omitida' && t.para_casa !== true)
    .reduce((s: number, t: any) => s + estimatedForToday(t), 0)
  const plannedTodayPct = dayCapacityMin > 0 ? Math.round((plannedTodayLoad / dayCapacityMin) * 100) : plannedTodayLoad > 0 ? 999 : 0
  const plannedTodayExcess = Math.max(0, plannedTodayLoad - dayCapacityMin)
  const plannedTodayTone = loadStatus(plannedTodayLoad, dayCapacityMin)
  const showPlannedTodayWarning = plannedTodayLoad > dayCapacityMin

  const cronoMin = Math.floor(cronoSeconds / 60)
  const realTodayFor = (t: any) => minutesFromSeconds(todayRealSeconds(taskLogsByTask[t.id], today, t, taskMinutesToday[t.id]))

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center gap-4 bg-gray-50 border border-gray-100 rounded-xl px-5 py-3">
        <div className="flex items-center gap-2">
          {!cronoRunning ? (
            <button onClick={onStart}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 transition">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              {cronoSeconds > 0 ? 'Reanudar' : 'Iniciar'}
            </button>
          ) : (
            <button onClick={onPause}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              Pausar
            </button>
          )}
          {cronoSeconds > 0 && (
            <button onClick={onReset} className="px-3 py-2 border border-gray-200 text-gray-400 rounded-lg text-sm hover:bg-white transition">↺</button>
          )}
        </div>

        <div className="text-2xl font-mono font-bold text-gray-900 min-w-[90px]">{formatCrono(cronoSeconds)}</div>

        {/* Hora inicio editable */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-gray-400">Inicio:</span>
          {editingStart ? (
            <div className="flex items-center gap-1">
              <input type="time" value={startInput} onChange={e=>setStartInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'){onAdjustStart(startInput);setEditingStart(false)}if(e.key==='Escape')setEditingStart(false)}}
                className="w-24 border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-gray-500" autoFocus/>
              <button onClick={()=>{onAdjustStart(startInput);setEditingStart(false)}} className="text-xs text-emerald-500 font-bold">OK</button>
            </div>
          ) : (
            <button onClick={()=>setEditingStart(true)}
              className="text-xs font-semibold text-gray-600 border border-dashed border-gray-300 px-2 py-1 rounded hover:bg-white hover:border-gray-400 transition"
              title="Ajustar segun hora de fichaje">
              Ajustar
            </button>
          )}
        </div>

        {/* Hora fin editable */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-gray-400">Fin:</span>
          {editingEnd ? (
            <div className="flex items-center gap-1">
              <input type="time" value={endInput} onChange={e=>setEndInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'){onAdjustEnd(endInput);setEditingEnd(false)}if(e.key==='Escape')setEditingEnd(false)}}
                className="w-24 border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-gray-500" autoFocus/>
              <button onClick={()=>{onAdjustEnd(endInput);setEditingEnd(false)}} className="text-xs text-emerald-500 font-bold">OK</button>
            </div>
          ) : (
            <button onClick={()=>setEditingEnd(true)}
              className="text-xs font-semibold text-gray-600 border border-dashed border-gray-300 px-2 py-1 rounded hover:bg-white hover:border-gray-400 transition"
              title="Ajustar segun hora de fin de fichaje">
              Ajustar
            </button>
          )}
        </div>

        {previsionMin > 0 && (
          <div className="flex-1 flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${cronoMin > previsionMin ? 'bg-red-400' : 'bg-emerald-400'}`}
                style={{width:`${Math.min(100, previsionMin > 0 ? (cronoMin/previsionMin)*100 : 0)}%`}}>
              </div>
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">{minToHM(cronoMin)} / {minToHM(previsionMin)}</span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400">Previsión:</span>
          {editingPrev ? (
            <div className="flex items-center gap-1">
              <input type="number" value={prevInput} onChange={e=>setPrevInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'){setPrevisionMin(parseInt(prevInput)||previsionMin);setEditingPrev(false)}if(e.key==='Escape')setEditingPrev(false)}}
                className="w-16 border border-gray-300 rounded px-2 py-1 text-xs text-center outline-none focus:border-gray-500" autoFocus/>
              <span className="text-xs text-gray-400">min</span>
              <button onClick={()=>{setPrevisionMin(parseInt(prevInput)||previsionMin);setEditingPrev(false)}} className="text-xs text-emerald-500 font-bold">✓</button>
            </div>
          ) : (
            <button onClick={()=>{setPrevInput(previsionMin.toString());setEditingPrev(true)}}
              className="text-xs font-semibold text-gray-600 border border-gray-200 px-2 py-1 rounded hover:bg-white transition">
              {minToHM(previsionMin)}
            </button>
          )}
        </div>
      </div>

      {showPlannedTodayWarning && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${plannedTodayTone.border} ${plannedTodayTone.bg}`}>
          <span className={`font-bold ${plannedTodayTone.text}`}>Carga planificada hoy</span>
          <span className="text-gray-500">{minToHM(plannedTodayLoad)} / {minToHM(dayCapacityMin)}</span>
          <span className={`font-bold ${plannedTodayTone.text}`}>
            {plannedTodayPct > 999 ? '+999%' : `${plannedTodayPct}%`} · +{minToHM(plannedTodayExcess)} sobre capacidad
          </span>
        </div>
      )}

      {casaHoyCount > 0 && (
        <button
          type="button"
          onClick={onOpenCasa}
          className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-sm hover:bg-slate-100/80 transition"
        >
          <span className="font-bold text-slate-700">Fuera de jornada hoy</span>
          <span className="text-gray-500">{casaHoyCount} {casaHoyCount === 1 ? 'tarea' : 'tareas'}</span>
          <span className="font-bold text-slate-700">{minToHM(casaHoyMin)}</span>
          <span className="ml-auto text-xs text-slate-400">Ver Casa</span>
        </button>
      )}

      {(() => {
        const completadas = filtered.filter((t: any) => t.done || t.estado === 'Completada')
        const estCompletadas = completadas.reduce((s: number, t: any) => s + estimatedForToday(t), 0)
        const realCompletadas = completadas.reduce((s: number, t: any) => s + realTodayFor(t), 0)
        const diffCompletadas = realCompletadas - estCompletadas

        return (
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-gray-100 rounded-xl px-4 py-3 bg-white">
              <div className="text-lg font-bold text-gray-900">{minToHM(estCompletadas)}</div>
              <div className="text-xs text-gray-400">Estimado completadas</div>
            </div>
            <div className="border border-gray-100 rounded-xl px-4 py-3 bg-white">
              <div className="text-lg font-bold text-gray-900">{minToHM(realCompletadas)}</div>
              <div className="text-xs text-gray-400">Real completadas</div>
            </div>
            <div className={`border rounded-xl px-4 py-3 ${diffCompletadas <= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
              <div className={`text-lg font-bold ${diffCompletadas <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {diffCompletadas === 0 ? '=' : diffCompletadas > 0 ? `+${minToHM(diffCompletadas)}` : `-${minToHM(Math.abs(diffCompletadas))}`}
              </div>
              <div className="text-xs text-gray-400">Diferencia completadas</div>
            </div>
          </div>
        )
      })()}

      <div className="grid grid-cols-4 gap-5">
        <div className="border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition">
          <div className="text-2xl font-bold text-gray-900 mb-1">{formatCount(hechas)}<span className="text-gray-300 text-lg font-normal">/{formatCount(total)}</span></div>
          <div className="text-sm font-semibold text-gray-700 mb-1">Tareas</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gray-900 rounded-full" style={{width:`${pct}%`}}></div>
            </div>
            <span className="text-xs text-gray-400">{pct}%</span>
          </div>
        </div>

        <div className="border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition">
          <div className="text-2xl font-bold text-gray-900 mb-1">{minToHM(tEstHecho)}<span className="text-gray-300 text-lg font-normal"> / {minToHM(tEstTotal)}</span></div>
          <div className="text-sm font-semibold text-gray-700 mb-1">Tiempo estimado</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gray-900 rounded-full" style={{width:`${pctTiempo}%`}}></div>
            </div>
            <span className="text-xs text-gray-400">{pctTiempo}%</span>
          </div>
        </div>

        {(() => {
          const tRealTrabajado = filtered.reduce((s: number, t: any) => s + realTodayFor(t), 0)
          const diff = tRealTrabajado - cronoMin
          const noData = cronoMin === 0
          const pctUso = cronoMin > 0 ? Math.round((tRealTrabajado / cronoMin) * 100) : 0
          const bueno = diff >= 0
          return (
            <div className={`border rounded-xl p-5 transition ${noData ? 'border-gray-100' : bueno ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`text-2xl font-bold ${noData ? 'text-gray-300' : bueno ? 'text-emerald-600' : 'text-red-500'}`}>
                  {noData ? '—' : (diff >= 0 ? '+' : '-') + minToHM(Math.abs(diff))}
                </span>
                {!noData && <span className={`text-sm font-semibold ${bueno ? 'text-emerald-400' : 'text-red-300'}`}>{pctUso}%</span>}
              </div>
              <div className="text-sm font-semibold text-gray-700 mb-1">Rendimiento</div>
              {noData ? (
                <div className="text-xs text-gray-400">Inicia el cronómetro</div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${bueno ? 'bg-emerald-400' : 'bg-red-400'}`} style={{width:`${Math.min(pctUso, 100)}%`}}></div>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {`Fichado ${minToHM(cronoMin)} · Trabajado ${minToHM(tRealTrabajado)}`}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {(() => {
          const restJornada = Math.max(0, previsionMin - cronoMin)
          const margen = restJornada - tEstPendiente
          const saturacion = restJornada > 0
            ? Math.round((tEstPendiente / restJornada) * 100)
            : tEstPendiente > 0 ? 999 : 0
          const tone = saturacion <= 95
            ? { border: 'border-emerald-100', bg: 'bg-emerald-50', text: 'text-emerald-600', soft: 'text-emerald-400', bar: 'bg-emerald-400' }
            : saturacion <= 105
              ? { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-600', soft: 'text-amber-400', bar: 'bg-amber-400' }
              : { border: 'border-red-100', bg: 'bg-red-50', text: 'text-red-500', soft: 'text-red-300', bar: 'bg-red-400' }
          return (
            <div className={`border rounded-xl p-5 transition ${tone.border} ${tone.bg}`}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`text-2xl font-bold ${tone.text}`}>
                  {saturacion > 999 ? '+999%' : `${saturacion}%`}
                </span>
                <span className={`text-sm font-semibold ${tone.soft}`}>{margen >= 0 ? `+${minToHM(margen)}` : `-${minToHM(Math.abs(margen))}`}</span>
              </div>
              <div className="text-sm font-semibold text-gray-700 mb-1">Jornada</div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Restante: {minToHM(restJornada)}</span>
                  <span>Pendiente: {minToHM(tEstPendiente)}</span>
                </div>
                <div className="flex items-center gap-0">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden relative">
                    <div className={`h-full rounded-full transition-all ${tone.bar}`}
                      style={{width:`${Math.min(100, saturacion)}%`}}></div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function shortTaskName(tarea: string): string {
  const match = tarea.match(/^(.*?)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return tarea
  const [, name, day, month] = match
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${name} · ${parseInt(day)} ${months[parseInt(month)-1]}`
}

function parentTitleFromFragment(t: Tarea): string {
  return t.tarea.replace(/\s*[·-]\s*parte\s+\d+\s*\/\s*\d+\s*$/i, '').trim()
}

function displayParentFromChildren(parent: Tarea | null | undefined, children: Tarea[]): Tarea {
  const first = children[0]
  const last = children[children.length - 1] || first
  if (parent) {
    return {
      ...parent,
      tiempo_estimado: children.reduce((sum, child) => sum + (child.tiempo_estimado || 0), 0),
      deadline: last?.deadline || parent.deadline,
      fecha_planificada: last?.fecha_planificada || parent.fecha_planificada,
      fecha_casa: last?.fecha_casa || parent.fecha_casa,
      para_casa: parent.para_casa === true || children.some(child => child.para_casa === true),
    }
  }
  return {
    ...first,
    id: first.parent_id || first.id,
    tarea: parentTitleFromFragment(first),
    tiempo_estimado: children.reduce((sum, child) => sum + (child.tiempo_estimado || 0), 0),
    deadline: last?.deadline || first.deadline,
    fecha_planificada: last?.fecha_planificada || first.fecha_planificada,
    fecha_casa: last?.fecha_casa || first.fecha_casa,
    es_padre: true,
  }
}

function groupCasaDayTasks(tasks: Tarea[], parents: Map<number, Tarea>): Tarea[] {
  const grouped = new Map<number, Tarea[]>()
  tasks.forEach(task => {
    const parentId = task.parent_id || 0
    if (task.es_fragmento === true && parentId) {
      if (!grouped.has(parentId)) grouped.set(parentId, [])
      grouped.get(parentId)!.push(task)
    }
  })
  const rows: Tarea[] = []
  const seen = new Set<number>()
  tasks.forEach(task => {
    const parentId = task.parent_id || 0
    if (task.es_fragmento === true && parentId) {
      if (seen.has(parentId)) return
      seen.add(parentId)
      const children = (grouped.get(parentId) || [task]).sort((a, b) => (a.fragmento_num || 999999) - (b.fragmento_num || 999999) || a.id - b.id)
      const display = displayParentFromChildren(parents.get(parentId), children)
      rows.push({
        ...display,
        tiempo_estimado: children.reduce((sum, child) => sum + (child.tiempo_estimado || 0), 0),
        fecha_casa: display.fecha_casa || children[0]?.fecha_casa,
        es_fragmento: false,
        __children: children,
      } as Tarea)
      return
    }
    rows.push(task)
  })
  return rows
}

function casaLeafTasks(rows: Tarea[]): Tarea[] {
  return rows.flatMap(row => {
    const children = (row as { __children?: Tarea[] }).__children
    return children?.length ? children : [row]
  })
}

function ColFilter({ label, options, value, onChange, onSort, sortDir, isSorted }: {
  label: string, options: string[], value: Set<string>, onChange: (v: Set<string>) => void,
  onSort?: () => void, sortDir?: 'asc'|'desc', isSorted?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { if (open) setTimeout(() => searchRef.current?.focus(), 50) }, [open])

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  const allSelected = filtered.every(o => value.has(o))

  function toggleOption(o: string) {
    const next = new Set(value)
    if (next.has(o)) next.delete(o); else next.add(o)
    onChange(next)
  }
  function toggleAll() {
    if (allSelected) {
      const next = new Set(value)
      filtered.forEach(o => next.delete(o))
      onChange(next)
    } else {
      const next = new Set(value)
      filtered.forEach(o => next.add(o))
      onChange(next)
    }
  }

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1 h-full w-full">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center justify-center gap-1 text-center text-xs font-semibold uppercase tracking-wider transition flex-1 ${value.size > 0 ? 'text-gray-800' : 'text-gray-400'} hover:text-gray-700`}>
        {label}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
        {value.size > 0 && <span className="w-4 h-4 rounded-full bg-gray-800 text-white text-[9px] flex items-center justify-center flex-shrink-0 font-bold">{value.size}</span>}
      </button>
      {onSort && (
        <button onClick={onSort} className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition ${isSorted ? 'text-gray-700' : 'text-gray-300 hover:text-gray-500'}`}>
          {isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </button>
      )}
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-30 w-52 py-2">
          <div className="px-2 mb-1">
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..." className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-gray-400 text-gray-700 placeholder:text-gray-300"/>
          </div>
          <div className="border-b border-gray-100 mx-2 mb-1"></div>
          <button onClick={toggleAll} className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 flex items-center gap-2">
            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${allSelected ? 'bg-gray-800 border-gray-800' : 'border-gray-300'}`}>
              {allSelected && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
            </div>
            <span className="font-medium">{allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}</span>
          </button>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(o => (
              <button key={o} onClick={() => toggleOption(o)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${value.has(o) ? 'bg-gray-800 border-gray-800' : 'border-gray-300'}`}>
                  {value.has(o) && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                </div>
                <span className={value.has(o) ? 'text-gray-800 font-medium' : 'text-gray-500'}>{o}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-2 text-xs text-gray-300">Sin resultados</div>}
          </div>
          {value.size > 0 && (
            <div className="border-t border-gray-100 mx-2 mt-1 pt-1">
              <button onClick={() => { onChange(new Set()); setOpen(false) }} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 hover:bg-gray-50 rounded-lg transition">
                Limpiar filtro
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TextFilter({ value, onChange, onSort, sortDir, isSorted }: {
  value: string, onChange: (v: string) => void,
  onSort?: () => void, sortDir?: 'asc'|'desc', isSorted?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])
  return (
    <div ref={ref} className="relative inline-flex items-center gap-1 h-full w-full">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center justify-center gap-1 text-center text-xs font-semibold uppercase tracking-wider transition flex-1 ${value ? 'text-gray-800' : 'text-gray-400'} hover:text-gray-700`}>
        Tarea
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
        {value && <span className="w-1.5 h-1.5 rounded-full bg-gray-700 ml-0.5"></span>}
      </button>
      {onSort && (
        <button onClick={onSort} className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition ${isSorted ? 'text-gray-700' : 'text-gray-300 hover:text-gray-500'}`}>
          {isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </button>
      )}
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-30 w-52 p-2">
          <input ref={inputRef} value={value} onChange={e => onChange(e.target.value)} placeholder="Buscar tarea..."
            onKeyDown={e => e.key === 'Enter' && setOpen(false)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-gray-400 text-gray-700 placeholder:text-gray-300"/>
          {value && (
            <button onClick={() => { onChange(''); setOpen(false) }} className="mt-1 w-full text-xs text-gray-400 hover:text-gray-600 py-1 hover:bg-gray-50 rounded-lg transition">
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  )
}


function Field({label, error, children, full}: {label: string, error?: string, children: React.ReactNode, full?: boolean}) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? 'col-span-2' : ''}`}>
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
      {children}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}

export default function Home() {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [taskMinutesToday, setTaskMinutesToday] = useState<Record<number, number>>({})
  const [taskLogsByTask, setTaskLogsByTask] = useState<Record<number, TaskTimeLog[]>>({})
  const [taskTimeLogs, setTaskTimeLogs] = useState<TaskTimeLog[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [meetingStart, setMeetingStart] = useState('10:00')
  const [meetingEnd, setMeetingEnd] = useState('11:00')
  const [meetingRepeat, setMeetingRepeat] = useState<MeetingRepeat>('no')
  const [meetingUntil, setMeetingUntil] = useState('')
  const [routineRepeat, setRoutineRepeat] = useState<RoutineRepeat>('no')
  const [routineRepeatMonths, setRoutineRepeatMonths] = useState(0)
  const [routineRepeatWeekdays, setRoutineRepeatWeekdays] = useState<number[]>([])
  const [editId, setEditId] = useState<number | null>(null)
  const [tab, setTab] = useState('Plan')
  const [mounted, setMounted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cargaRefreshKey, setCargaRefreshKey] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number, skipped: number, duplicates: any[], errors: string[] } | null>(null)

  const [tiempoRealModal, setTiempoRealModal] = useState<{tarea: Tarea, action: 'complete'|'omit'} | null>(null)
  const [tiempoRealInput, setTiempoRealInput] = useState('')
  const [spawnNotice, setSpawnNotice] = useState<SpawnRepeatNotice | null>(null)
  const [rankOnCreate, setRankOnCreate] = useState(false)

  const [fragmentModal, setFragmentModal] = useState<Tarea | null>(null)
  const [fragmentSize, setFragmentSize] = useState(90)
  const [fragmentParts, setFragmentParts] = useState<{ minutes: number, deadline: string }[]>([])
  const [capacityOverrides, setCapacityOverrides] = useState<Record<string, number>>({})
  const [casaCapacityOverrides, setCasaCapacityOverrides] = useState<Record<string, number>>({})
  const casaCapacityReady = useRef(false)
  const [expandedCasaDay, setExpandedCasaDay] = useState<string | null>(null)
  const [casaMonth, setCasaMonth] = useState(monthKey(localDateKey()))
  const [unparkCasaDay, setUnparkCasaDay] = useState<string | null>(null)
  const [unparkSelected, setUnparkSelected] = useState<Set<number>>(new Set())
  const [unparkDateEdits, setUnparkDateEdits] = useState<Record<number, { fecha_planificada: string, deadline: string }>>({})
  const [unparkCasaSaving, setUnparkCasaSaving] = useState(false)

  function buildFragmentParts(t: Tarea, size: number) {
    const total = t.tiempo_estimado || 0
    const safeSize = Math.max(1, size || 90)
    const parts = Math.max(1, Math.ceil(total / safeSize))

    return Array.from({ length: parts }, (_, i) => {
      const remaining = total - (i * safeSize)

      return {
        minutes: Math.min(safeSize, Math.max(0, remaining)),
        deadline: t.deadline || today
      }
    })
  }

  function openFragmentModal(t: Tarea) {
    const size = Math.min(90, Math.max(1, t.tiempo_estimado || 90))
    setFragmentSize(size)
    setFragmentParts(buildFragmentParts(t, size))
    setFragmentModal(t)
  }

  function updateFragmentSize(value: number) {
    const safe = Math.max(1, value || 90)
    setFragmentSize(safe)

    if (fragmentModal) {
      setFragmentParts(buildFragmentParts(fragmentModal, safe))
    }
  }

  function updateFragmentPart(index: number, patch: Partial<{ minutes: number, deadline: string }>) {
    setFragmentParts(prev => prev.map((part, i) => i === index ? { ...part, ...patch } : part))
  }

  const fragmentPartsTotal = fragmentParts.reduce((sum, part) => sum + (part.minutes || 0), 0)

  const [previsionOverrides, setPrevisionOverrides] = useState<Record<string, number>>({})
  const [cronoRunning, setCronoRunning] = useState(false)
  const [cronoSeconds, setCronoSeconds] = useState(0)
  const cronoRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cronoStartRef = useRef<number | null>(null)
  const cronoReadyRef = useRef(false)
  const [deleting, setDeleting] = useState(false)

  const [fTarea, setFTarea] = useState('')
  const [fTipo, setFTipo] = useState<Set<string>>(new Set())
  const [fEstado, setFEstado] = useState<Set<string>>(new Set())
  const [fFechaSol, setFFechaSol] = useState<Set<string>>(new Set())
  const [fDeadline, setFDeadline] = useState<Set<string>>(new Set())
  const [fFechaFin, setFFechaFin] = useState<Set<string>>(new Set())
  const [sortCol, setSortCol] = useState<string|null>(null)
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc')
  const [expandedStrategicParents, setExpandedStrategicParents] = useState<Set<number>>(new Set())

  const dragTaskId = useRef<number | null>(null)
  const dragOverTaskId = useRef<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragGroupName = useRef<string | null>(null)
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null)
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null)
  const [reminderGroupOrder, setReminderGroupOrder] = useState<string[]>([])
  const reminderGroupOrderReady = useRef(false)
  const [collapsedReminderGroups, setCollapsedReminderGroups] = useState<string[]>(() => {
    const local = readLocalSetting<string[]>(REMINDER_GROUP_COLLAPSED_KEY, [])
    return Array.isArray(local) ? local.filter(name => typeof name === 'string' && name.trim()) : []
  })
  const [executionBlockIds, setExecutionBlockIds] = useState<Set<number>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  const [colWidths, setColWidths] = useState([90, 130, 340, 110, 120, 60, 60, 60, 130, 80])
  const colResizing = useRef<{ col: number, startX: number, startW: number } | null>(null)
  const [today, setToday] = useState(localDateKey())

  useEffect(() => {
    const refreshToday = () => setToday(localDateKey())
    refreshToday()
    const interval = window.setInterval(refreshToday, 60000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    try {
      setCasaCapacityOverrides(JSON.parse(localStorage.getItem(CASA_CAPACITY_OVERRIDES_KEY) || '{}'))
    } catch {
      setCasaCapacityOverrides({})
    }
    void loadAppSetting<Record<string, number>>(CASA_CAPACITY_OVERRIDES_KEY, {}).then(value => {
      if (cancelled) return
      setCasaCapacityOverrides(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
      casaCapacityReady.current = true
    })
    void loadAppSetting<string[]>(REMINDER_GROUP_ORDER_KEY, []).then(value => {
      if (cancelled) return
      setReminderGroupOrder(Array.isArray(value) ? value.filter(name => typeof name === 'string' && name.trim()) : [])
      reminderGroupOrderReady.current = true
    })
    void loadAppSetting<string[]>(REMINDER_GROUP_COLLAPSED_KEY, []).then(value => {
      if (cancelled) return
      setCollapsedReminderGroups(Array.isArray(value) ? value.filter(name => typeof name === 'string' && name.trim()) : [])
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!casaCapacityReady.current) return
    void saveAppSetting(CASA_CAPACITY_OVERRIDES_KEY, casaCapacityOverrides)
  }, [casaCapacityOverrides])

  function casaCapacityForDate(value: string): number {
    return casaCapacityOverrides[value] ?? defaultCasaCapacity(new Date(`${value}T00:00:00`))
  }

  function updateCasaCapacityForDate(date: string, value: number) {
    const clean = Math.max(0, Math.round(value || 0))
    setCasaCapacityOverrides(prev => {
      const next = { ...prev, [date]: clean }
      if (clean === defaultCasaCapacity(new Date(`${date}T00:00:00`))) delete next[date]
      return next
    })
  }

  function defaultCapacityForDate(value: string): number {
    return defaultWorkCapacity(new Date(`${value}T00:00:00`))
  }

  function defaultPrevisionForDate(value: string): number {
    return defaultWorkdayForecast(new Date(`${value}T00:00:00`))
  }

  const previsionMin = previsionOverrides[today] ?? defaultPrevisionForDate(today)

  function setPrevisionMin(value: number) {
    const clean = Math.max(0, Math.round(value || 0))
    setPrevisionOverrides(prev => {
      const next = { ...prev, [today]: clean }
      if (typeof window !== 'undefined') {
        localStorage.setItem(PREVISION_KEY, JSON.stringify(next))
        window.dispatchEvent(new CustomEvent('gestor-prevision-updated'))
      }
      return next
    })
  }

  function capacityForDate(value: string): number {
    if (typeof window !== 'undefined') {
      try {
        const latest = JSON.parse(localStorage.getItem(CAPACITY_KEY) || '{}') as Record<string, number>
        return latest[value] ?? capacityOverrides[value] ?? defaultCapacityForDate(value)
      } catch {
        return capacityOverrides[value] ?? defaultCapacityForDate(value)
      }
    }
    return capacityOverrides[value] ?? defaultCapacityForDate(value)
  }

  function availableDatesEndingAt(endDate: string, count: number, capacityOf = capacityForDate): string[] {
    const dates: string[] = []
    let cursor = endDate
    for (let i = 0; i < 740 && dates.length < count; i += 1) {
      if (capacityOf(cursor) > 0) dates.unshift(cursor)
      cursor = shiftDateKey(cursor, -1)
    }
    if (dates.length === count) return dates
    return Array.from({ length: count }, (_, index) => shiftDateKey(endDate, index - (count - 1)))
  }

  function availableCasaDatesEndingAt(endDate: string, count: number): string[] {
    return availableDatesEndingAt(endDate, count, casaCapacityForDate)
  }

  function planDateCapacitySummary() {
    const planDate = form.fecha_planificada || ''
    if (form.para_casa) return null
    if (!planDate) return null
    const capacity = capacityForDate(planDate)
    const alreadyPlanned = tareas
      .filter(t => t.id !== editId)
      .filter(t => !t.done && t.estado !== 'Completada' && t.estado !== 'Omitida' && t.es_padre !== true)
      .filter(t => !parkedHome(t))
      .filter(t => cleanDateValue(t.fecha_planificada || t.deadline) === planDate)
      .reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
    const withCurrent = alreadyPlanned + (isEvento(form.tipo) ? 0 : isReunion(form.tipo) ? meetingMinutes(meetingStart, meetingEnd) : (form.tiempo_estimado || 0))
    const free = capacity - withCurrent
    const pct = capacity > 0 ? Math.round((withCurrent / capacity) * 100) : withCurrent > 0 ? null : 0
    const pctForTone = pct ?? 999
    const tone = capacity === 0
      ? 'border-gray-100 bg-gray-50 text-gray-400'
      : pctForTone <= 95
        ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
        : pctForTone <= 105
          ? 'border-amber-200 bg-amber-50 text-amber-600'
          : 'border-red-100 bg-red-50 text-red-500'
    return { capacity, alreadyPlanned, withCurrent, free, pct, tone }
  }

  function cleanDateValue(value?: string | null): string {
    if (!value) return ''

    const raw = String(value).trim()

    // ISO normal: 2026-06-04 o 2026-06-04T10:00:00
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

    // Formato español: 04/06/2026
    const es = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (es) {
      const d = es[1].padStart(2, '0')
      const m = es[2].padStart(2, '0')
      const y = es[3]
      return `${y}-${m}-${d}`
    }

    return raw.slice(0, 10)
  }

  function dateIsTodayOrPast(value?: string | null): boolean {
    const d = cleanDateValue(value)
    return !!d && d <= today
  }

  useEffect(() => {
    setMounted(true)
    const savedTab = localStorage.getItem('gestor_tab') || 'Plan'
    setTab(savedTab === 'Eventos' || savedTab === 'Evento' ? EVENT_TYPE : savedTab === 'Reuniones' ? 'Reunión' : savedTab)
    try {
      setCapacityOverrides(JSON.parse(localStorage.getItem(CAPACITY_KEY) || '{}'))
    } catch {
      setCapacityOverrides({})
    }
    void loadAppSetting<Record<string, number>>(CAPACITY_KEY, {}).then(value => {
      setCapacityOverrides(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
    })
    try {
      setPrevisionOverrides(JSON.parse(localStorage.getItem(PREVISION_KEY) || '{}'))
    } catch {
      setPrevisionOverrides({})
    }
    // gestor_tab_mounted_restore
  }, [])

  useEffect(() => {
    const syncCapacity = () => {
      try {
        setCapacityOverrides(JSON.parse(localStorage.getItem(CAPACITY_KEY) || '{}'))
      } catch {
        setCapacityOverrides({})
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === CAPACITY_KEY) {
        syncCapacity()
      }
      if (event.key === PREVISION_KEY) {
        try {
          setPrevisionOverrides(JSON.parse(event.newValue || '{}'))
        } catch {
          setPrevisionOverrides({})
        }
      }
    }
    const onPrevisionUpdated = () => {
      try {
        setPrevisionOverrides(JSON.parse(localStorage.getItem(PREVISION_KEY) || '{}'))
      } catch {
        setPrevisionOverrides({})
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('gestor-capacity-updated', syncCapacity as EventListener)
    window.addEventListener('gestor-prevision-updated', onPrevisionUpdated as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('gestor-capacity-updated', syncCapacity as EventListener)
      window.removeEventListener('gestor-prevision-updated', onPrevisionUpdated as EventListener)
    }
  }, [])

  function refreshExecutionBlockIds() {
    if (typeof window === 'undefined') return
    try {
      const parsed = JSON.parse(localStorage.getItem('gestor_foco_bloque_v2') || '{}')
      const ids = Array.isArray(parsed.ids) ? parsed.ids.map(Number).filter(Boolean) : []
      setExecutionBlockIds(new Set(ids))
    } catch {
      setExecutionBlockIds(new Set())
    }
  }

  useEffect(() => {
    refreshExecutionBlockIds()
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'gestor_foco_bloque_v2') refreshExecutionBlockIds()
    }
    const onFocus = () => refreshExecutionBlockIds()
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    const onTime = (event: Event) => {
      const detail = (event as CustomEvent<TaskTimeUpdatedDetail>).detail
      if (!detail?.tareaId) return
      const todayMinutes = minutesFromSeconds(detail.segundos)
      const totalMinutes = minutesFromSeconds(detail.totalSegundos)
      setTaskMinutesToday(prev => ({ ...prev, [detail.tareaId]: todayMinutes }))
      setTaskLogsByTask(prev => {
        const logs = prev[detail.tareaId] || []
        const current = logs.find(log => log.fecha === detail.fecha)
        const nextLog: TaskTimeLog = {
          id: current?.id,
          tarea_id: detail.tareaId,
          fecha: detail.fecha,
          minutos: todayMinutes,
          segundos: detail.segundos,
          origen: 'ejecucion',
        }
        return { ...prev, [detail.tareaId]: [nextLog, ...logs.filter(log => log.fecha !== detail.fecha)] }
      })
      setTareas(prev => prev.map(task => task.id === detail.tareaId
        ? { ...task, tiempo_real: totalMinutes, tiempo_real_segundos: detail.totalSegundos }
        : task))
    }
    window.addEventListener(TASK_TIME_UPDATED_EVENT, onTime)
    return () => window.removeEventListener(TASK_TIME_UPDATED_EVENT, onTime)
  }, [])

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem('gestor_tab', tab)
    refreshExecutionBlockIds()
  }, [tab, mounted])

  useEffect(() => {
    if (tab !== 'Rutinaria') return
    setFTipo(prev => prev.size > 0 ? new Set() : prev)
  }, [tab])

  useEffect(() => {
    if (!mounted) return
    if (tab === 'Plan') fetchTareas()
    // fetchTareas is a function declaration; this effect intentionally follows tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mounted])

  useEffect(() => {
    const running = localStorage.getItem('gestor_crono_running') === 'true'
    const startedAt = parseInt(localStorage.getItem('gestor_crono_started_at') || '0') || 0
    const baseSeconds = parseInt(localStorage.getItem('gestor_crono_base_seconds') || localStorage.getItem('gestor_crono_seconds') || '0') || 0
    const liveSeconds = parseInt(localStorage.getItem('gestor_crono_seconds_live') || '0') || 0
    const savedDate = localStorage.getItem('gestor_crono_date') || today

    const elapsed = running && startedAt > 0
      ? Math.floor((Date.now() - startedAt) / 1000)
      : 0

    const total = running && startedAt > 0
      ? Math.max(0, liveSeconds, baseSeconds + elapsed)
      : Math.max(0, liveSeconds, baseSeconds)

    // Si ha cambiado el día, guardamos el fichaje del día anterior y reseteamos.
    if (savedDate !== today) {
      if (total > 0) {
        supabase.from('jornadas').upsert(
          { fecha: savedDate, minutos_fichados: Math.floor(total / 60) },
          { onConflict: 'fecha' }
        )
      }

      if (cronoRef.current) clearInterval(cronoRef.current)

      localStorage.setItem('gestor_crono_date', today)
      localStorage.setItem('gestor_crono_running', 'false')
      localStorage.setItem('gestor_crono_seconds', '0')
      localStorage.setItem('gestor_crono_base_seconds', '0')
      localStorage.removeItem('gestor_crono_started_at')
      localStorage.removeItem('gestor_crono_seconds_live')
      localStorage.removeItem('gestor_crono_manual_start')

      setCronoRunning(false)
      setCronoSeconds(0)
      cronoStartRef.current = null
      cronoReadyRef.current = true
      return
    }

    localStorage.setItem('gestor_crono_date', today)

    if (running && startedAt > 0) {
      setCronoSeconds(total)
      cronoStartRef.current = Date.now() - total * 1000
      localStorage.setItem('gestor_crono_base_seconds', String(total))
      localStorage.setItem('gestor_crono_seconds', String(total))
      localStorage.setItem('gestor_crono_seconds_live', String(total))
      localStorage.setItem('gestor_crono_started_at', String(Date.now() - total * 1000))

      if (cronoRef.current) clearInterval(cronoRef.current)
      cronoRef.current = setInterval(() => {
        const next = Math.floor((Date.now() - cronoStartRef.current!) / 1000)
        setCronoSeconds(next)
        localStorage.setItem('gestor_crono_seconds_live', String(next))
      }, 1000)

      setCronoRunning(true)
    } else {
      setCronoSeconds(total)
    }
    cronoReadyRef.current = true
  }, [today])

  useEffect(() => {
    async function init() {
      await autoArchivarAyer()
      await fetchTareas()
    }
    init()
  // Initial load only; day-bound archive runs again when the page remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const resizing = colResizing.current
      if (!resizing) return

      const diff = e.clientX - resizing.startX

      setColWidths(prev => {
        const next = [...prev]
        next[resizing.col] = Math.max(48, resizing.startW + diff)
        return next
      })
    }
    const onUp = () => { colResizing.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  useEffect(() => {
    if (!cronoReadyRef.current) return
    if (cronoRunning) return
    localStorage.setItem('gestor_crono_seconds', String(cronoSeconds))
    localStorage.setItem('gestor_crono_base_seconds', String(cronoSeconds))
  }, [cronoRunning, cronoSeconds])

  useEffect(() => {
    const syncLiveCrono = () => {
      if (document.visibilityState === 'hidden') return
      if (!cronoReadyRef.current || !cronoStartRef.current) return
      if (localStorage.getItem('gestor_crono_running') !== 'true') return
      const next = Math.max(0, Math.floor((Date.now() - cronoStartRef.current) / 1000))
      setCronoSeconds(next)
      localStorage.setItem('gestor_crono_seconds_live', String(next))
    }
    document.addEventListener('visibilitychange', syncLiveCrono)
    window.addEventListener('focus', syncLiveCrono)
    return () => {
      document.removeEventListener('visibilitychange', syncLiveCrono)
      window.removeEventListener('focus', syncLiveCrono)
    }
  }, [])

  async function fetchTareas() {
    setLoading(true)
    try {
      let data = await fetchAllTareas<Tarea>('*', query => query.order('orden', { ascending: true }).order('id', { ascending: false }))
      if (data.some(t => t.tipo === 'Evento')) {
        const { error } = await supabase.from('tareas').update({ tipo: EVENT_TYPE }).eq('tipo', 'Evento')
        if (!error) data = data.map(t => t.tipo === 'Evento' ? { ...t, tipo: EVENT_TYPE } : t)
      }
      setTareas(data)
      setLoading(false)
      let logsByTask = await fetchTaskTimeLogs(data.map(t => t.id))
      const removed = await removeLogsAfterCompletion(data, logsByTask)
      if (removed > 0) logsByTask = await fetchTaskTimeLogs(data.map(t => t.id))
      const minutesToday: Record<number, number> = {}
      for (const task of data) {
        const seconds = todayRealSeconds(logsByTask[task.id], today, task)
        if (seconds > 0) minutesToday[task.id] = minutesFromSeconds(seconds)
      }
      setTaskMinutesToday(minutesToday)
      setTaskLogsByTask(logsByTask)
      window.dispatchEvent(new Event('gestor-tareas-updated'))
    } catch (error) {
      console.warn('No se pudieron cargar las tareas:', error)
      setLoading(false)
    }
  }

  const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort()

  const compareByActiveSort = useCallback((a: any, b: any) => {
    if (!sortCol) return 0
    let av = a[sortCol]
    let bv = b[sortCol]

    if (sortCol === 'deadline' || sortCol === 'fecha_solicitud' || sortCol === 'fecha_finalizacion' || sortCol === 'fecha_planificada') {
      av = cleanDateValue(av) || '9999-12-31'
      bv = cleanDateValue(bv) || '9999-12-31'
    } else if (sortCol === 'tiempo_estimado' || sortCol === 'tiempo_real') {
      av = Number(av || 0)
      bv = Number(bv || 0)
    } else {
      av = String(av || '').toLowerCase()
      bv = String(bv || '').toLowerCase()
    }

    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  }, [sortCol, sortDir])

  const planTableSort = useCallback((a: Tarea, b: Tarea) => {
    const ai = routineBlockForTask(a)
    const bi = routineBlockForTask(b)
    const groupOrder = (key?: string) => routineGroupRank(key)
    const ag = groupOrder(ai?.key)
    const bg = groupOrder(bi?.key)
    if (ag !== bg) return ag - bg
    if (sortCol) return compareByActiveSort(a, b) || routinePlanSort(a, b)
    return routinePlanSort(a, b)
  }, [compareByActiveSort, sortCol])

  const parentsById = useMemo(() => {
    const map = new Map<number, Tarea>()
    tareas.forEach(t => {
      if ((t as any).es_padre === true) map.set(t.id, t)
    })
    return map
  }, [tareas])

  function parkedHome(t: Tarea) {
    return withInheritedCasa(t, parentsById).para_casa === true
  }

  function closedInPlanToday(t: Tarea) {
    const isDone = t.done === true || (t.done as any) === 'true'
    const isInactive = isDone || t.estado === 'Omitida' || t.estado === 'Completada'
    if (!isInactive) return false
    return cleanDateValue(t.fecha_finalizacion) === today
  }

  function casaDayLeafTasks(fecha: string): Tarea[] {
    return tareas.filter(t => {
      if (t.es_padre === true) return false
      const isDone = t.done === true || (t.done as any) === 'true'
      if (isDone || t.estado === 'Omitida' || t.estado === 'Completada') return false
      if (!parkedHome(t)) return false
      const parked = withInheritedCasa(t, parentsById)
      const rawDate = cleanDateValue(parked.fecha_casa || '') || today
      const day = rawDate < today ? today : rawDate
      return day === fecha
    })
  }

  function getTabFiltered(): Tarea[] {
    return tareas.filter(t => {
      const isDone = t.done === true || (t.done as any) === 'true'
      const isInactive = isDone || t.estado === 'Omitida' || t.estado === 'Completada'
      const isParent = (t as any).es_padre === true
      if (isParent) return false

      const normalized = { ...t, done: isDone }
      const inPlanToday = isEnPlan(normalized)

      if (tab === 'Todas') return !isInactive && !isAparcada(t)
      if (tab === 'Completadas') return isInactive
      if (tab === 'Aplazadas') return !isInactive && isAparcada(t)
      if (tab === 'Casa') return !isInactive && parkedHome(t) && !isAparcada(t)

      if (tab === 'Plan') {
        if (closedInPlanToday(t)) return true
        if (isInactive) return false
        if (parkedHome(t) || isAparcada(t)) return false
        return inPlanToday
      }

      // Regla de siempre:
      // si una tarea entra en Plan del día, desaparece de Rutinarias/Operativas/Tácticas/Estratégicas.
      if (tab === 'Rutinaria') {
        return !isInactive && isRoutineType(t.tipo) && !inPlanToday && !isAparcada(t)
      }

      return !isInactive && (isEvento(tab) ? isEvento(t.tipo) : t.tipo === tab) && !inPlanToday && !isAparcada(t)
    })
  }
  const tabFiltered = getTabFiltered()
  const fechaSolOpts = uniq(tabFiltered.map(t => t.fecha_solicitud ? fDate(t.fecha_solicitud) : ''))
  const deadlineOpts = uniq(tabFiltered.map(t => t.deadline ? fDate(t.deadline) : ''))
  const fechaFinOpts = uniq(tabFiltered.map(t => t.fecha_finalizacion ? fDate(t.fecha_finalizacion) : ''))
  const tipoOpts = uniq(tabFiltered.map(t => canonicalTipo(t.tipo)))
  const estadoOpts = uniq(tabFiltered.map(t => estadoForDisplay(t)))

  function isEnPlan(t: Tarea): boolean {
    const isDone = t.done === true || (t.done as any) === 'true'
    if (isDone || t.estado === 'Omitida' || t.estado === 'Completada' || (t as any).es_padre === true) return false
    if (parkedHome(t) || isAparcada(t)) return false

    const excluidaHoy = !!t.excluir_plan && cleanDateValue((t as any).excluida_fecha) === today
    if (excluidaHoy) return false

    // Si tiene fecha planificada:
    // futura => no sale todavía
    // hoy o pasada => sí sale en Plan del día
    if (t.fecha_planificada) return dateIsTodayOrPast(t.fecha_planificada)

    // Si NO tiene fecha planificada:
    // entra por deadline vencido o de hoy
    if (t.deadline) return dateIsTodayOrPast(t.deadline)

    return !!t.en_plan
  }

  function isExcludedFromPlanToday(t: Tarea): boolean {
    return !!t.excluir_plan && cleanDateValue((t as any).excluida_fecha) === today
  }

  function isAutoInPlan(t: Tarea): boolean {
    if (t.fecha_planificada) return dateIsTodayOrPast(t.fecha_planificada)
    return !!(t.deadline && dateIsTodayOrPast(t.deadline))
  }

  function withUnparkEdits(t: Tarea): Tarea {
    const edit = unparkDateEdits[t.id]
    if (!edit) return t
    return { ...t, fecha_planificada: edit.fecha_planificada, deadline: edit.deadline }
  }

  function wouldEnterPlanIfUnparked(t: Tarea): { inPlan: boolean; reason: string; planDate: string; deadline: string } {
    const planDate = cleanDateValue(t.fecha_planificada)
    const deadline = cleanDateValue(t.deadline)
    const isDone = t.done === true || (t.done as any) === 'true'
    if (isDone || t.estado === 'Omitida' || t.estado === 'Completada' || t.es_padre === true) {
      return { inPlan: false, reason: 'Cerrada', planDate, deadline }
    }
    if (t.excluir_plan && cleanDateValue(t.excluida_fecha) === today) {
      return { inPlan: false, reason: 'Excluida hoy del plan', planDate, deadline }
    }
    if (planDate) {
      if (planDate <= today) return { inPlan: true, reason: `Plan ${fDate(planDate)}`, planDate, deadline }
      return { inPlan: false, reason: `Fecha planificada ${fDate(planDate)}`, planDate, deadline }
    }
    return { inPlan: true, reason: 'Plan hoy', planDate: today, deadline }
  }

  function openUnparkCasaDay(fecha: string, rows: Tarea[]) {
    const leaves = casaLeafTasks(rows)
    if (!leaves.length) return
    setUnparkCasaDay(fecha)
    setUnparkSelected(new Set(leaves.map(t => t.id)))
    setUnparkDateEdits({})
  }

  function toggleUnparkSelected(id: number) {
    setUnparkSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setUnparkTaskDates(t: Tarea, patch: Partial<{ fecha_planificada: string, deadline: string }>) {
    setUnparkDateEdits(prev => {
      const current = prev[t.id] || {
        fecha_planificada: cleanDateValue(t.fecha_planificada),
        deadline: cleanDateValue(t.deadline),
      }
      return { ...prev, [t.id]: { ...current, ...patch } }
    })
  }

  async function confirmUnparkCasa() {
    if (!unparkCasaDay || unparkCasaSaving) return
    const leaves = casaDayLeafTasks(unparkCasaDay)
    const selected = leaves.filter(t => unparkSelected.has(t.id))
    if (!selected.length) return

    setUnparkCasaSaving(true)
    const updates = selected.map(t => {
      const edited = withUnparkEdits(t)
      const nextPlan = cleanDateValue(edited.fecha_planificada) || today
      const nextDl = cleanDateValue(edited.deadline) || null
      const origDl = cleanDateValue(t.deadline) || null
      const patch: Record<string, string | boolean | null> = {
        para_casa: false,
        fecha_casa: null,
        fecha_planificada: nextPlan,
      }
      if (nextDl && nextDl !== origDl) patch.deadline = nextDl
      return supabase.from('tareas').update(patch).eq('id', t.id)
    })
    const results = await Promise.all(updates)
    const failed = results.find(result => result.error)
    if (failed?.error) {
      setUnparkCasaSaving(false)
      notifySupabaseError(failed.error, 'llevar las tareas a Plan del día')
      return
    }

    setUnparkCasaSaving(false)
    setUnparkCasaDay(null)
    setUnparkSelected(new Set())
    setUnparkDateEdits({})
    setCargaRefreshKey(k => k + 1)
    fetchTareas()
  }

  function estadoForDisplay(t: Tarea) {
    const isDone = t.done === true || (t.done as any) === 'true'
    const isInactive = isDone || t.estado === 'Completada' || t.estado === 'Omitida'
    return executionBlockIds.has(t.id) && !isInactive ? 'En progreso' : t.estado
  }

  function getFiltered(all: Tarea[]): Tarea[] {
    const result = all.filter(t => {
      const isDone = t.done === true || (t.done as any) === 'true'
      const isInactive = isDone || t.estado === 'Omitida' || t.estado === 'Completada'
      const isParent = (t as any).es_padre === true
      if (isParent) return false
      const normalized = { ...t, done: isDone }
      const inPlanToday = isEnPlan(normalized)

      if (tab === 'Todas') {
        if (isInactive || isAparcada(t)) return false
      } else if (tab === 'Completadas') {
        if (!isInactive) return false
      } else if (tab === 'Aplazadas') {
        if (isInactive || !isAparcada(t)) return false
      } else if (tab === 'Casa') {
        if (isInactive || !parkedHome(t) || isAparcada(t)) return false
      } else if (tab === 'Plan') {
        if (!closedInPlanToday(t) && (isInactive || parkedHome(t) || isAparcada(t) || !inPlanToday)) return false
      } else if (tab === 'Rutinaria') {
        if (isInactive || !isRoutineType(t.tipo) || inPlanToday || isAparcada(t)) return false
      } else {
        if (isInactive || (isEvento(tab) ? !isEvento(t.tipo) : t.tipo !== tab) || inPlanToday || isAparcada(t)) return false
      }

      const q = fTarea.toLowerCase()
      if (fTarea && !t.tarea.toLowerCase().includes(q) && !(t.notas||'').toLowerCase().includes(q) && !reminderGroupLabel(t).toLowerCase().includes(q)) return false
      if (fTipo.size > 0 && ![...fTipo].some(tipo => canonicalTipo(tipo) === canonicalTipo(t.tipo))) return false
      if (fEstado.size > 0 && !fEstado.has(estadoForDisplay(t))) return false
      if (fFechaSol.size > 0 && !fFechaSol.has(fDate(t.fecha_solicitud))) return false
      if (fDeadline.size > 0 && !fDeadline.has(fDate(t.deadline))) return false
      if (fFechaFin.size > 0 && !fFechaFin.has(fDate(t.fecha_finalizacion))) return false
      return true
    })

    if (sortCol) {
      result.sort(compareByActiveSort)
    } else if (tab === 'Casa') {
      result.sort((a, b) => {
        const ad = cleanDateValue(a.fecha_casa || '') || today
        const bd = cleanDateValue(b.fecha_casa || '') || today
        if (ad !== bd) return ad.localeCompare(bd)
        const ao = Number(a.orden || 0)
        const bo = Number(b.orden || 0)
        if (ao !== bo) return ao - bo
        return a.id - b.id
      })
    } else {
      result.sort((a, b) => {
        const aOrden = Number(a.orden || 0)
        const bOrden = Number(b.orden || 0)
        if (aOrden !== bOrden) return aOrden - bOrden
        return b.id - a.id
      })
    }

    return result
  }
  const filtered = getFiltered(tareas)
  const isInactiveForPlan = (t: Tarea) =>
    t.done === true ||
    (t.done as any) === 'true' ||
    t.estado === 'Completada' ||
    t.estado === 'Omitida'

  // Solo afecta a la tabla: pendientes arriba, completadas/omitidas hoy abajo.
  // Los KPIs siguen usando `filtered`, así cuentan todo el Plan del día.
  const displayFiltered = useMemo(() => {
    if (tab !== 'Plan') return filtered
    return [
        ...filtered.filter(t => !isInactiveForPlan(t)).sort(planTableSort),
        ...filtered
          .filter(t => isInactiveForPlan(t))
          .sort((a, b) => {
            const aTime = String((a as any).hora_finalizacion || '')
            const bTime = String((b as any).hora_finalizacion || '')
            const aDate = cleanDateValue((a as any).fecha_finalizacion)
            const bDate = cleanDateValue((b as any).fecha_finalizacion)

            // Completadas/omitidas abajo, ordenadas por finalización:
            // primera terminada arriba, última terminada abajo.
            const aKey = `${aDate}T${aTime}`
            const bKey = `${bDate}T${bTime}`

            if (aKey < bKey) return -1
            if (aKey > bKey) return 1
            return ((a as any).id || 0) - ((b as any).id || 0)
          }),
      ]
  }, [filtered, tab, planTableSort])

  const reminderGroupOptions = useMemo(() => {
    const names = new Set<string>()
    tareas.forEach(t => {
      if (!isEvento(t.tipo)) return
      const name = reminderGroupLabel(t)
      if (name) names.add(name)
    })
    return [...names].sort((a, b) => a.localeCompare(b, 'es'))
  }, [tareas])

  const collapsedReminderGroupSet = useMemo(() => new Set(collapsedReminderGroups), [collapsedReminderGroups])

  const tableRows = useMemo(() => {
    if (isEvento(tab)) {
      const groups = new Map<string, Tarea[]>()
      const ungrouped: Tarea[] = []
      displayFiltered.forEach(task => {
        const name = reminderGroupLabel(task)
        if (!name) {
          ungrouped.push(task)
          return
        }
        if (!groups.has(name)) groups.set(name, [])
        groups.get(name)!.push(task)
      })
      const compareReminders = (a: Tarea, b: Tarea) => {
        if (sortCol) return compareByActiveSort(a, b) || a.id - b.id
        const da = reminderAnchorDate(a) || '9999-12-31'
        const db = reminderAnchorDate(b) || '9999-12-31'
        if (da !== db) return da.localeCompare(db)
        return a.id - b.id
      }
      const makeHeader = (name: string, children: Tarea[]) => {
        const range = reminderDateRange(children)
        return {
          ...empty,
          id: 0,
          tipo: EVENT_TYPE,
          tarea: name,
          grupo: name,
          deadline: range.min,
          fecha_planificada: range.max,
          __isReminderGroup: true,
          __groupName: name,
          __groupCount: children.length,
          __groupMin: range.min,
          __groupMax: range.max,
          __groupDays: range.days,
        } as Tarea
      }
      const rows: Tarea[] = []
      const named = [...groups.entries()].sort((a, b) => {
        const ia = reminderGroupOrder.indexOf(a[0])
        const ib = reminderGroupOrder.indexOf(b[0])
        if (ia >= 0 || ib >= 0) {
          if (ia >= 0 && ib < 0) return -1
          if (ia < 0 && ib >= 0) return 1
          if (ia !== ib) return ia - ib
        }
        const ra = reminderDateRange(a[1])
        const rb = reminderDateRange(b[1])
        const da = ra.min || '9999-12-31'
        const db = rb.min || '9999-12-31'
        if (da !== db) return da.localeCompare(db)
        return a[0].localeCompare(b[0], 'es')
      })
      named.forEach(([name, children]) => {
        const sorted = [...children].sort(compareReminders)
        rows.push(makeHeader(name, sorted))
        if (!collapsedReminderGroupSet.has(name)) rows.push(...sorted)
      })
      if (ungrouped.length) {
        const sorted = [...ungrouped].sort(compareReminders)
        if (named.length > 0) rows.push(makeHeader('Sin categoría', sorted))
        if (!collapsedReminderGroupSet.has('Sin categoría')) rows.push(...sorted)
      }
      return rows
    }

    if (tab !== 'Estratégica') return displayFiltered

    const parents = new Map<number, Tarea>()
    tareas.forEach(t => {
      if ((t as any).es_padre === true) parents.set(t.id, t)
    })

    const grouped = new Map<number, Tarea[]>()
    displayFiltered.forEach(task => {
      const parentId = task.parent_id || 0
      if (!parentId || task.es_fragmento !== true) return
      if (!grouped.has(parentId)) grouped.set(parentId, [])
      grouped.get(parentId)!.push(task)
    })

    const rows: Tarea[] = []
    const seenParents = new Set<number>()
    displayFiltered.forEach(task => {
      const parentId = task.parent_id || 0
      const parent = parentId ? parents.get(parentId) : null
      if (parentId && task.es_fragmento === true) {
        if (seenParents.has(parentId)) return
        seenParents.add(parentId)
        const children = (grouped.get(parentId) || [])
          .sort((a, b) => (a.fragmento_num || 999999) - (b.fragmento_num || 999999) || a.id - b.id)
        const displayParent = displayParentFromChildren(parent, children)
        rows.push({
          ...displayParent,
          tiempo_estimado: children.reduce((sum, child) => sum + (child.tiempo_estimado || 0), 0),
          deadline: children[0]?.deadline || displayParent.deadline,
          fecha_planificada: children[0]?.fecha_planificada || displayParent.fecha_planificada,
          __isStrategicParent: true,
          __children: children,
        } as any)
        return
      }
      rows.push(task)
    })

    return rows
  }, [collapsedReminderGroupSet, compareByActiveSort, displayFiltered, reminderGroupOrder, sortCol, tab, tareas])

  const casaMonths = useMemo(() => Array.from({ length: 6 }, (_, index) => addMonths(monthKey(today), index)), [today])

  useEffect(() => {
    if (!casaMonths.includes(casaMonth)) setCasaMonth(casaMonths[0] || monthKey(today))
  }, [casaMonth, casaMonths, today])

  const casaGroups = tab === 'Casa'
    ? (() => {
        const byDate = displayFiltered.reduce((map, task) => {
          const parked = withInheritedCasa(task, parentsById)
          const rawDate = cleanDateValue(parked.fecha_casa || '') || today
          const fecha = rawDate < today ? today : rawDate
          if (!map.has(fecha)) map.set(fecha, [])
          map.get(fecha)!.push(parked)
          return map
        }, new Map<string, Tarea[]>())

        return daysOfMonth(casaMonth)
          .filter(fecha => fecha >= today)
          .map(fecha => [fecha, groupCasaDayTasks(byDate.get(fecha) || [], parentsById)] as [string, Tarea[]])
      })()
    : []

  const unparkCasaLeaves = unparkCasaDay ? casaDayLeafTasks(unparkCasaDay) : []
  const unparkCasaItems = unparkCasaLeaves.map(task => {
    const edited = withUnparkEdits(task)
    const outcome = wouldEnterPlanIfUnparked(edited)
    return { task, edited, outcome, selected: unparkSelected.has(task.id) }
  })
  const unparkWillEnter = unparkCasaItems.filter(item => item.selected && item.outcome.inPlan)
  const unparkWontEnter = unparkCasaItems.filter(item => item.selected && !item.outcome.inPlan)

  const hasFilters = !!(fTarea || fTipo.size || fEstado.size || fFechaSol.size || fDeadline.size || fFechaFin.size)
  function handleSort(col: string) {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortCol(null); setSortDir('asc') }
    } else {
      setSortCol(col); setSortDir('asc')
    }
  }

  // limpiar filtros al cambiar de pestaña
  useEffect(() => {
    setFTarea('')
    setFTipo(new Set())
    setFEstado(new Set())
    setFFechaSol(new Set())
    setFDeadline(new Set())
    setFFechaFin(new Set())
    setSortCol(null)
    setSortDir('asc')
  }, [tab])


  function clearFilters() { setFTarea(''); setFTipo(new Set()); setFEstado(new Set()); setFFechaSol(new Set()); setFDeadline(new Set()); setFFechaFin(new Set()); setSortCol(null) }

  const tareasNoPadre = tareas.filter(t => (t as any).es_padre !== true)
  const casaHoyTasks = tareasNoPadre.filter(t => {
    const isDone = t.done === true || (t.done as any) === 'true'
    if (isDone || t.estado === 'Omitida' || t.estado === 'Completada') return false
    if (!parkedHome(t) || isAparcada(t)) return false
    const parked = withInheritedCasa(t, parentsById)
    const rawDate = cleanDateValue(parked.fecha_casa || '') || today
    return rawDate <= today
  })
  const casaHoyCount = casaHoyTasks.length
  const casaHoyMin = casaHoyTasks.reduce((s, t) => s + (t.tiempo_estimado || 0), 0)

  const stats = {
    activas: tareasNoPadre.filter(t => t.done !== true && (t.done as any) !== 'true' && t.estado !== 'Omitida' && t.estado !== 'Completada' && !isAparcada(t)).length,
    plan: tareasNoPadre.filter(t => isEnPlan(t)).length,
    completadas: tareasNoPadre.filter(t => (t.done === true || (t.done as any) === 'true' || t.estado === 'Omitida' || t.estado === 'Completada')).length,
    minutos: tareasNoPadre.filter(t => !isEvento(t.tipo) && t.done !== true && (t.done as any) !== 'true' && t.estado !== 'Omitida' && t.estado !== 'Completada').reduce((s, t) => s + (t.tiempo_estimado||0), 0),
  }

  const groupedFragmentCount = (list: Tarea[]) => {
    const seenParents = new Set<number>()
    let count = 0
    list.forEach(task => {
      const parentId = task.parent_id || 0
      if (task.es_fragmento === true && parentId) {
        if (!seenParents.has(parentId)) {
          seenParents.add(parentId)
          count += 1
        }
        return
      }
      count += 1
    })
    return count
  }

  const activeStrategicTasks = () => tareasNoPadre.filter(x =>
    x.tipo === 'Estratégica' &&
    !x.done &&
    x.estado !== 'Omitida' &&
    x.estado !== 'Completada' &&
    !isEnPlan(x) &&
    !isAparcada(x)
  )

  const tabCount = (key: string) => {
    if (key==='Todas') return stats.activas
    if (key==='Plan') return stats.plan
    if (key==='Completadas') return stats.completadas
    if (key==='Casa') return tareasNoPadre.filter(x => parkedHome(x) && !isAparcada(x) && !x.done && x.estado !== 'Omitida' && x.estado !== 'Completada').length
    if (key==='Aplazadas') return tareasNoPadre.filter(x => isAparcada(x) && !x.done && x.estado !== 'Omitida' && x.estado !== 'Completada').length
    if (key==='Carga' || key==='Ejecucion' || key==='Rendimiento' || key==='Priorizar' || key==='Replanificar' || key==='Planificacion' || key==='Decisiones') return 0
    if (key==='Rutinaria') return tareasNoPadre.filter(x => isRoutineType(x.tipo) && !x.done && x.estado !== 'Omitida' && x.estado !== 'Completada' && !isEnPlan(x) && !isAparcada(x)).length
    if (key==='Estratégica') return groupedFragmentCount(activeStrategicTasks())
    return tareasNoPadre.filter(x => (isEvento(key) ? isEvento(x.tipo) : x.tipo===key) && !x.done && x.estado !== 'Omitida' && x.estado !== 'Completada' && !isEnPlan(x) && !isAparcada(x)).length
  }

  const tabCountLabel = (key: string, count: number) => {
    if (key !== 'Estratégica') return formatCount(count)
    const raw = activeStrategicTasks().length
    return raw > count ? `${formatCount(count)} (${formatCount(raw)})` : formatCount(count)
  }

  function routineSectionKey(t: Tarea) {
    return routineBlockForTask(t)?.key || 'resto'
  }

  const reminderGroupNamesInView = useMemo(() => (
    tableRows
      .filter(row => (row as any).__isReminderGroup && (row as any).__groupName !== 'Sin categoría')
      .map(row => String((row as any).__groupName))
  ), [tableRows])

  function persistReminderGroupOrder(nextVisible: string[]) {
    const hidden = reminderGroupOrder.filter(name => !nextVisible.includes(name))
    const next = [...nextVisible, ...hidden]
    setReminderGroupOrder(next)
    void saveAppSetting(REMINDER_GROUP_ORDER_KEY, next)
  }

  function toggleReminderGroupCollapsed(name: string) {
    setCollapsedReminderGroups(prev => {
      const next = prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]
      void saveAppSetting(REMINDER_GROUP_COLLAPSED_KEY, next)
      return next
    })
  }

  function onReminderGroupDragStart(name: string) {
    if (name === 'Sin categoría') return
    dragGroupName.current = name
    setDraggingGroup(name)
  }

  function onReminderGroupDrop(target: string) {
    const source = dragGroupName.current
    dragGroupName.current = null
    setDraggingGroup(null)
    setDragOverGroup(null)
    if (!source || !target || source === target || source === 'Sin categoría' || target === 'Sin categoría') return
    const visible = reminderGroupNamesInView
    const from = visible.indexOf(source)
    const to = visible.indexOf(target)
    if (from < 0 || to < 0) return
    const nextVisible = [...visible]
    nextVisible.splice(from, 1)
    nextVisible.splice(to, 0, source)
    persistReminderGroupOrder(nextVisible)
  }

  function onDragStart(tareaId: number) {
    dragTaskId.current = tareaId
    setDragging(tareaId)
  }

  function onDragEnter(tareaId: number) {
    const sourceId = dragTaskId.current
    if (sourceId) {
      const rows = displayFiltered.filter(t => !isInactiveForPlan(t))
      const source = rows.find(t => t.id === sourceId)
      const target = rows.find(t => t.id === tareaId)
      if (source && target && routineSectionKey(source) !== routineSectionKey(target)) return
    }
    dragOverTaskId.current = tareaId
    setDragOverIdx(tareaId)
  }

  async function onDrop(targetId?: number) {
    const sourceId = dragTaskId.current
    const destinationId = targetId ?? dragOverTaskId.current
    if (!sourceId || !destinationId || sourceId === destinationId) {
      dragTaskId.current = null
      dragOverTaskId.current = null
      setDragging(null)
      setDragOverIdx(null)
      return
    }
    const newList = displayFiltered.filter(t => !isInactiveForPlan(t))
    const sourceIndex = newList.findIndex(t => t.id === sourceId)
    const destinationIndex = newList.findIndex(t => t.id === destinationId)
    if (sourceIndex < 0 || destinationIndex < 0) {
      dragTaskId.current = null
      dragOverTaskId.current = null
      setDragging(null)
      setDragOverIdx(null)
      return
    }
    if (routineSectionKey(newList[sourceIndex]) !== routineSectionKey(newList[destinationIndex])) {
      dragTaskId.current = null
      dragOverTaskId.current = null
      setDragging(null)
      setDragOverIdx(null)
      return
    }
    const [moved] = newList.splice(sourceIndex, 1)
    newList.splice(destinationIndex, 0, moved)
    const idToOrden: Record<number, number> = {}
    newList.forEach((t, i) => { idToOrden[t.id] = i + 1 })
    setTareas(prev => prev.map(t => idToOrden[t.id] !== undefined ? { ...t, orden: idToOrden[t.id] } : t))
    dragTaskId.current = null
    dragOverTaskId.current = null
    setDragging(null)
    setDragOverIdx(null)
    setSortCol(null)
    setSortDir('asc')

    await Promise.all(
      newList.map((t, i) =>
        supabase.from('tareas').update({ orden: i + 1 }).eq('id', t.id)
      )
    )

  }

  async function togglePlan(t: Tarea) {
    const autoplan = isAutoInPlan(t)
    const excludedToday = isExcludedFromPlanToday(t)

    if (autoplan || excludedToday) {
      if (!excludedToday) {
        const planned = t.fecha_planificada || t.deadline || ''
        const dias = planned ? diasRetrasoFn(planned, today) : 0
        const msg = dias > 0
          ? `Esta tarea tiene ${dias} día(s) de retraso. ¿Quieres sacarla del Plan del día igualmente? La fecha no cambia y mañana puede volver a salir.`
          : `¿Sacar esta tarea del Plan del día? La fecha no cambia y mañana puede volver a salir.`
        if (!confirm(msg)) return
      }
      const newExcluir = !excludedToday
      const { error } = await supabase.from('tareas').update({
        excluir_plan: newExcluir,
        excluida_fecha: newExcluir ? today : null,
        en_plan: false
      }).eq('id', t.id)
      if (notifySupabaseError(error, excludedToday ? 'devolver la tarea al Plan del día' : 'sacar la tarea del Plan del día')) return
    } else {
      const { error } = await supabase.from('tareas').update({ en_plan: !t.en_plan, excluir_plan: false, excluida_fecha: null }).eq('id', t.id)
      if (notifySupabaseError(error, t.en_plan ? 'quitar la tarea del Plan' : 'añadir la tarea al Plan')) return
    }
    fetchTareas()
  }

  async function setAparcada(t: Tarea, parked: boolean) {
    const { error } = await supabase.from('tareas').update(
      parked
        ? { excluir_plan: true, excluida_fecha: APARCADA_FECHA, en_plan: false }
        : { excluir_plan: false, excluida_fecha: null }
    ).eq('id', t.id)
    if (notifySupabaseError(error, parked ? 'pasar la tarea a Por clasificar' : 'devolver la tarea')) return
    fetchTareas()
  }

  function syncExecutionBlockTime(tareaId: number, minutes: number, closeActive = false) {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem('gestor_foco_bloque_v2')
      if (!raw) return
      const parsed = JSON.parse(raw)
      const ids = Array.isArray(parsed.ids) ? parsed.ids.map(Number) : []
      if (!ids.includes(tareaId)) return
      const accumulated = parsed.accumulated && typeof parsed.accumulated === 'object' ? parsed.accumulated : {}
      const wasActiveTask = parsed.activeId === tareaId
      const next = {
        ...parsed,
        activeId: wasActiveTask && closeActive ? null : parsed.activeId,
        running: wasActiveTask && closeActive ? false : !!parsed.running,
        startedAt: wasActiveTask && closeActive ? null : wasActiveTask && parsed.running ? Date.now() : parsed.startedAt,
        accumulated: { ...accumulated, [String(tareaId)]: Math.max(0, Math.round(minutes || 0)) * 60 },
      }
      localStorage.setItem('gestor_foco_bloque_v2', JSON.stringify(next))
      window.dispatchEvent(new CustomEvent('gestor-foco-bloque-updated', { detail: next }))
    } catch {
      // Si el bloque local estuviera corrupto, no bloqueamos el cierre de la tarea.
    }
  }

  async function maybeShowSpawnNotice(id: number) {
    const result = await spawnNextRepeatingRoutineById(id)
    if (result.status === 'error') {
      alert(`Completé esta, pero no pude crear la siguiente: ${result.message}`)
      return
    }
    if (result.status === 'created' || result.status === 'exists') setSpawnNotice(result)
  }

  async function completeTask(t: Tarea) {
    const current = minutesFromSeconds(todayRealSeconds(taskLogsByTask[t.id], today, t, taskMinutesToday[t.id]))
    setTiempoRealInput(current > 0 ? String(current) : '')
    setTiempoRealModal({ tarea: t, action: 'complete' })
  }

  async function omitTask(t: Tarea) {
    const current = minutesFromSeconds(todayRealSeconds(taskLogsByTask[t.id], today, t, taskMinutesToday[t.id]))
    setTiempoRealInput(current > 0 ? String(current) : '0')
    setTiempoRealModal({ tarea: t, action: 'omit' })
  }

  async function confirmTiempoReal() {
    if (!tiempoRealModal) return
    const mins = Math.max(0, parseInt(tiempoRealInput) || 0)
    const { tarea } = tiempoRealModal
    const now = new Date().toISOString()
    const logsByTask = await fetchTaskTimeLogs([tarea.id])
    const otherDaysSeconds = (logsByTask[tarea.id] || [])
      .filter(log => log.fecha !== today)
      .reduce((sum, log) => sum + logSeconds(log), 0)
    const todaySeconds = Math.max(0, Math.round(mins || 0) * 60)
    const totalSeconds = otherDaysSeconds + todaySeconds
    const totalMinutes = Math.round(totalSeconds / 60)
    const unpark = { excluir_plan: false, excluida_fecha: null }
    if (tiempoRealModal.action === 'complete') {
      const { error } = await supabase.from('tareas').update({ done: true, estado: 'Completada', fecha_finalizacion: today, hora_finalizacion: now, tiempo_real: totalMinutes, tiempo_real_segundos: totalSeconds, ...unpark }).eq('id', tarea.id)
      if (notifySupabaseError(error, 'completar la tarea')) return
    } else {
      const { error } = await supabase.from('tareas').update({ done: false, estado: 'Omitida', fecha_finalizacion: today, hora_finalizacion: now, tiempo_real: totalMinutes, tiempo_real_segundos: totalSeconds, ...unpark }).eq('id', tarea.id)
      if (notifySupabaseError(error, 'omitir la tarea')) return
    }
    await setTaskSecondsForDate(tarea.id, today, todaySeconds, 'manual')
    await maybeShowSpawnNotice(tarea.id)
    setTaskMinutesToday(prev => ({ ...prev, [tarea.id]: mins }))
    setTaskLogsByTask(prev => {
      const logs = prev[tarea.id] || []
      const current = logs.find(log => log.fecha === today)
      const nextLog: TaskTimeLog = { id: current?.id, tarea_id: tarea.id, fecha: today, minutos: mins, segundos: todaySeconds, origen: 'manual' }
      return { ...prev, [tarea.id]: [nextLog, ...logs.filter(log => log.fecha !== today)] }
    })
    syncExecutionBlockTime(tarea.id, mins, true)
    setTiempoRealModal(null)
    setTiempoRealInput('')
    fetchTareas()
  }

  async function autoArchivarAyer() {
    // Archive completed/omitted from previous days
    await supabase.from('tareas')
      .update({ excluir_plan: true })
      .or(`estado.eq.Completada,estado.eq.Omitida`)
      .lt('fecha_finalizacion', today)
      .neq('fecha_finalizacion', null as any)

    // Reset excluir_plan for active tasks excluded on previous days.
    // Así, si siguen retrasadas, vuelven al Plan del día al día siguiente.
    await supabase.from('tareas')
      .update({ excluir_plan: false, excluida_fecha: null })
      .eq('excluir_plan', true)
      .lt('excluida_fecha', today)
      .not('estado', 'in', '("Completada","Omitida")')
  }

  async function undoTask(t: Tarea) {
    const { error } = await supabase.from('tareas').update({ done: false, estado: 'Pendiente', fecha_finalizacion: null, hora_finalizacion: null }).eq('id', t.id)
    if (notifySupabaseError(error, 'deshacer la tarea')) return
    fetchTareas()
  }

  async function deleteTask(id: number) {
    if (!confirm('¿Eliminar esta tarea?')) return
    const { error } = await supabase.from('tareas').delete().eq('id', id)
    if (notifySupabaseError(error, 'eliminar la tarea')) return
    fetchTareas()
  }

  function cleanFragmentTitle(title: string): string {
    return title
      .replace(/^Parte\s+\d+\s+de\s+\d+\s*-\s*/i, '')
      .replace(/\s*[-]\s*parte\s+\d+\s*\/\s*\d+\s*$/i, '')
      .replace(/\s*[·-]\s*parte\s+\d+\s*\/\s*\d+\s*$/i, '')
      .trim()
  }

  function renameFragmentTask(title: string, num: number, total: number): string {
    const base = cleanFragmentTitle(title)
    return `${base} · parte ${num}/${total}`
  }

  async function renumberFragments(parentId: number) {
    const { data, error } = await supabase
      .from('tareas')
      .select('id,tarea,fragmento_num')
      .eq('parent_id', parentId)
      .eq('es_fragmento', true)
      .order('fragmento_num', { ascending: true })
      .order('id', { ascending: true })
    if (error) {
      alert(`No pude renumerar las partes: ${error.message}`)
      return
    }
    const children = data || []
    if (children.length === 0) {
      await supabase.from('tareas').update({ es_padre: false, excluir_plan: false }).eq('id', parentId)
      return
    }
    const updates = children.map((child, index) => {
      const num = index + 1
      return supabase
        .from('tareas')
        .update({
          fragmento_num: num,
          fragmentos_total: children.length,
          tarea: renameFragmentTask(child.tarea, num, children.length),
        })
        .eq('id', child.id)
    })
    const results = await Promise.all(updates)
    const updateError = results.find(result => result.error)?.error
    if (updateError) alert(`No pude renumerar las partes: ${updateError.message}`)
  }

  async function deleteStrategicParent(parent: Tarea) {
    if (!confirm(`Eliminar el padre "${parent.tarea}" y todas sus partes?`)) return
    setDeleting(true)
    const { error: childError } = await supabase.from('tareas').delete().eq('parent_id', parent.id).eq('es_fragmento', true)
    if (childError) {
      setDeleting(false)
      alert(`No pude eliminar las partes: ${childError.message}`)
      return
    }
    const { error: parentError } = await supabase.from('tareas').delete().eq('id', parent.id)
    setDeleting(false)
    if (parentError) alert(`No pude eliminar el padre: ${parentError.message}`)
    fetchTareas()
  }

  async function deleteStrategicPart(child: Tarea) {
    if (!child.parent_id) return deleteTask(child.id)
    if (!confirm(`Eliminar esta parte?\n${child.tarea}`)) return
    setDeleting(true)
    const { error } = await supabase.from('tareas').delete().eq('id', child.id)
    if (error) {
      setDeleting(false)
      alert(`No pude eliminar la parte: ${error.message}`)
      return
    }
    await renumberFragments(child.parent_id)
    setDeleting(false)
    fetchTareas()
  }

  async function duplicateTask(t: Tarea) {
    const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(x => x.orden||0)) : 0
    const { tarea, tipo, notas, solicitado_por, prioridad, tiempo_estimado, fecha_solicitud, deadline, fecha_planificada, en_plan } = t
    const copyName = isReunion(tipo)
      ? reunionTitle(`${reunionNombreFromTitle(tarea)} (copia)`, fecha_planificada || deadline || today)
      : `${tarea} (copia)`
    await supabase.from('tareas').insert({
      tarea: copyName,
      tipo, notas, solicitado_por, prioridad,
      estado: 'Pendiente',
      tiempo_estimado,
      fecha_solicitud: fecha_solicitud || null,
      deadline: deadline || null,
      fecha_planificada: fecha_planificada || null,
      fecha_finalizacion: null,
      hora_finalizacion: null,
      done: false,
      en_plan: en_plan || false,
      excluir_plan: false,
      tiempo_real: 0,
      orden: maxOrden + 1,
      ...(WORK_TYPES_FOR_PRIORITY.has(tipo) ? { prioridad_orden: null } : {})
    })
    fetchTareas()
  }

  function openFragmentar(t: Tarea) {
    if (!t.tiempo_estimado || t.tiempo_estimado <= 0) {
      alert('Esta tarea no tiene tiempo estimado. Añade un tiempo estimado antes de fragmentarla.')
      return
    }
    setFragmentSize(Math.min(90, Math.max(1, t.tiempo_estimado || 90)))
    openFragmentModal(t)
  }

  async function fragmentTask(t: Tarea) {
    const partsConfig = fragmentParts
      .map(part => ({
        minutes: Math.max(0, Math.round(part.minutes || 0)),
        deadline: part.deadline || t.deadline || today
      }))
      .filter(part => part.minutes > 0)

    if (partsConfig.length === 0) {
      alert('Necesitas al menos una parte con minutos.')
      return
    }

    const totalOriginal = t.tiempo_estimado || 0
    const totalParts = partsConfig.reduce((sum, part) => sum + part.minutes, 0)

    if (totalOriginal > 0 && totalParts !== totalOriginal) {
      const ok = confirm(`Las partes suman ${totalParts}m, pero la tarea original tenía ${totalOriginal}m. ¿Quieres continuar igualmente?`)
      if (!ok) return
    }

    const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(x => x.orden || 0)) : 0
    const parts = partsConfig.length
    const maxRank = Math.max(
      0,
      ...tareas
        .filter(x => canonicalTipo(x.tipo) === canonicalTipo(t.tipo) && x.prioridad_orden != null)
        .map(x => x.prioridad_orden || 0)
    )
    const fragmentRank = t.prioridad_orden != null
      ? t.prioridad_orden
      : (WORK_TYPES_FOR_PRIORITY.has(canonicalTipo(t.tipo)) ? maxRank + 1 : null)

    const plannedDates = t.para_casa
      ? []
      : (t.fecha_planificada ? availableDatesEndingAt(t.fecha_planificada, parts) : [])
    const casaDates = t.para_casa
      ? availableCasaDatesEndingAt(t.fecha_casa || today, parts)
      : []

    const inserts = partsConfig.map((part, i) => ({
      tipo: t.tipo,
      tarea: `${t.tarea} · parte ${i + 1}/${parts}`,
      notas: t.notas || null,
      solicitado_por: t.solicitado_por,
      prioridad: t.prioridad,
      estado: 'Pendiente',
      tiempo_estimado: part.minutes,
      tiempo_real: 0,
      fecha_solicitud: t.fecha_solicitud || today,
      deadline: part.deadline,
      fecha_planificada: t.para_casa ? null : (plannedDates[i] || t.fecha_planificada || null),
      fecha_finalizacion: null,
      hora_finalizacion: null,
      done: false,
      en_plan: false,
      excluir_plan: false,
      para_casa: !!t.para_casa,
      fecha_casa: t.para_casa ? (casaDates[i] || t.fecha_casa || today) : null,
      orden: maxOrden + i + 1,
      parent_id: t.id,
      fragmento_num: i + 1,
      fragmentos_total: parts,
      es_fragmento: true,
      es_padre: false,
      ...(fragmentRank != null ? { prioridad_orden: fragmentRank } : {})
    }))

    const { error: insertError } = await supabase.from('tareas').insert(inserts)

    if (insertError) {
      alert(`Error al crear fragmentos: ${insertError.message}`)
      return
    }

    const { error: updateError } = await supabase
      .from('tareas')
      .update({
        es_padre: true,
        estado: 'En espera',
        en_plan: false,
        excluir_plan: true
      })
      .eq('id', t.id)

    if (updateError) {
      alert(`Fragmentos creados, pero no pude actualizar la tarea padre: ${updateError.message}`)
    }

    setFragmentModal(null)
    setFragmentParts([])
    fetchTareas()
  }


  function startCrono() {
    if (cronoRunning) return

    const anchor = Date.now() - cronoSeconds * 1000
    cronoStartRef.current = anchor

    localStorage.setItem('gestor_crono_date', today)
    localStorage.setItem('gestor_crono_running', 'true')
    localStorage.setItem('gestor_crono_base_seconds', String(cronoSeconds))
    localStorage.setItem('gestor_crono_seconds', String(cronoSeconds))
    localStorage.setItem('gestor_crono_started_at', String(anchor))

    cronoRef.current = setInterval(() => {
      const next = Math.floor((Date.now() - cronoStartRef.current!) / 1000)
      setCronoSeconds(next)
      localStorage.setItem('gestor_crono_seconds_live', String(next))
    }, 1000)

    setCronoRunning(true)
  }

  // Ajustar cronómetro según hora de fichaje real
  function adjustCronoFromStart(hhmm: string) {
    if (!hhmm) return
    const [h, m] = hhmm.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return
    const now = new Date()
    const startDate = new Date()
    startDate.setHours(h, m, 0, 0)
    const elapsedSecs = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / 1000))

    // Guardamos la hora manual de inicio para que, si luego marcas una hora de fin,
    // el cronómetro sea exactamente Fin - Inicio y no arrastre acumulados anteriores.
    localStorage.setItem('gestor_crono_date', today)
    localStorage.setItem('gestor_crono_manual_start', hhmm)

    setCronoSeconds(elapsedSecs)
    localStorage.setItem('gestor_crono_seconds', String(elapsedSecs))
    localStorage.setItem('gestor_crono_base_seconds', String(elapsedSecs))
    if (cronoRunning) {
      // Re-anchor running timer
      cronoStartRef.current = Date.now() - elapsedSecs * 1000
      const startedAt = Date.now()
      localStorage.setItem('gestor_crono_running', 'true')
      localStorage.setItem('gestor_crono_base_seconds', String(elapsedSecs))
      localStorage.setItem('gestor_crono_started_at', String(startedAt))
    }
  }

  // Ajustar cronómetro según hora de fin real.
  // Si antes has puesto hora de Inicio, calcula exactamente Fin - Inicio.
  // Así evita arrastrar segundos acumulados antiguos del localStorage.
  function adjustCronoToEnd(hhmm: string) {
    if (!hhmm) return
    const [h, m] = hhmm.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return

    const manualStart = localStorage.getItem('gestor_crono_manual_start')

    let adjusted = 0

    if (manualStart) {
      const [sh, sm] = manualStart.split(':').map(Number)
      if (!isNaN(sh) && !isNaN(sm)) {
        const startDate = new Date()
        startDate.setHours(sh, sm, 0, 0)

        const endDate = new Date()
        endDate.setHours(h, m, 0, 0)

        // Por si alguna vez marcas un fin pasada medianoche.
        if (endDate.getTime() < startDate.getTime()) {
          endDate.setDate(endDate.getDate() + 1)
        }

        adjusted = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 1000))
      }
    }

    if (!manualStart) {
      const now = new Date()
      const endDate = new Date()
      endDate.setHours(h, m, 0, 0)

      const secondsAfterEnd = Math.max(0, Math.floor((now.getTime() - endDate.getTime()) / 1000))
      adjusted = Math.max(0, cronoSeconds - secondsAfterEnd)
    }

    if (cronoRef.current) clearInterval(cronoRef.current)

    setCronoSeconds(adjusted)
    setCronoRunning(false)
    cronoStartRef.current = null

    localStorage.setItem('gestor_crono_running', 'false')
    localStorage.setItem('gestor_crono_seconds', String(adjusted))
    localStorage.setItem('gestor_crono_base_seconds', String(adjusted))
    localStorage.removeItem('gestor_crono_started_at')
    localStorage.removeItem('gestor_crono_seconds_live')
    localStorage.removeItem('gestor_crono_manual_start')

    saveCronoToday(Math.floor(adjusted / 60))
  }

  function pauseCrono() {
    const seconds = cronoStartRef.current
      ? Math.max(0, Math.floor((Date.now() - cronoStartRef.current) / 1000))
      : cronoSeconds
    if (cronoRef.current) clearInterval(cronoRef.current)

    localStorage.setItem('gestor_crono_date', today)
    localStorage.setItem('gestor_crono_running', 'false')
    localStorage.setItem('gestor_crono_seconds', String(seconds))
    localStorage.setItem('gestor_crono_base_seconds', String(seconds))
    localStorage.removeItem('gestor_crono_started_at')
    localStorage.removeItem('gestor_crono_seconds_live')

    setCronoSeconds(seconds)
    setCronoRunning(false)
    saveCronoToday(Math.floor(seconds / 60))
  }

  function resetCrono() {
    if (cronoRef.current) clearInterval(cronoRef.current)

    localStorage.setItem('gestor_crono_date', today)
    localStorage.setItem('gestor_crono_running', 'false')
    localStorage.setItem('gestor_crono_seconds', '0')
    localStorage.setItem('gestor_crono_base_seconds', '0')
    localStorage.removeItem('gestor_crono_started_at')
    localStorage.removeItem('gestor_crono_seconds_live')

    setCronoRunning(false)
    setCronoSeconds(0)
    cronoStartRef.current = null
  }

  async function saveCronoToday(minutos: number) {
    localStorage.setItem('gestor_crono_date', today)
    await supabase.from('jornadas').upsert(
      { fecha: today, minutos_fichados: minutos },
      { onConflict: 'fecha' }
    )
  }

  function formatCrono(secs: number): string {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  }

  function validate() {
    const e: Record<string,string> = {}
    if (!form.tarea.trim()) e.tarea = 'Obligatorio'
    if (!form.tipo) e.tipo = 'Obligatorio'
    if (!form.estado) e.estado = 'Obligatorio'
    if (!form.prioridad) e.prioridad = 'Obligatorio'
    if (!form.fecha_solicitud) e.fecha_solicitud = 'Obligatorio'
    if (isReunion(form.tipo)) {
      if (!(form.fecha_planificada || form.deadline)) e.fecha_planificada = 'Obligatorio'
      if (!meetingMinutes(meetingStart, meetingEnd)) e.tiempo_estimado = 'La hora de fin tiene que ser posterior al inicio'
      if (!editId && meetingRepeat !== 'no') {
        const start = form.fecha_planificada || form.deadline
        if (!meetingUntil) e.meetingUntil = 'Hasta cuándo'
        else if (start && meetingUntil < start) e.meetingUntil = 'Tiene que ser posterior a la primera fecha'
      }
    } else if (!isEvento(form.tipo) && !form.tiempo_estimado) {
      e.tiempo_estimado = 'Obligatorio'
    }
    const creatingRepeat = !editId && isRoutineType(form.tipo) && routineRepeat !== 'no'
    if (!creatingRepeat && !form.deadline) e.deadline = 'Obligatorio'
    if (isRoutineType(form.tipo) && routineRepeat === 'weekdays' && routineRepeatWeekdays.length === 0) e.routineRepeat = 'Elige al menos un día'
    if (!form.solicitado_por.trim()) e.solicitado_por = 'Obligatorio'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function saveTask() {
    if (!validate()) return
    setSaving(true)
    const previous = editId ? tareas.find(t => t.id === editId) : null
    const meetingDate = form.fecha_planificada || form.deadline || form.fecha_solicitud
    const meetingPayload = isReunion(form.tipo) && meetingDate
      ? {
          tarea: reunionTitle(form.tarea, meetingDate),
          notas: formatMeetingNotes(meetingStart, meetingEnd, form.solicitado_por, form.notas),
          tiempo_estimado: meetingMinutes(meetingStart, meetingEnd),
          fecha_planificada: meetingDate,
          deadline: meetingDate,
          fecha_solicitud: form.fecha_solicitud || meetingDate,
        }
      : {}
    const clean = {
      ...form,
      fecha_solicitud: form.fecha_solicitud||null,
      deadline: form.deadline||null,
      fecha_planificada: form.fecha_planificada || null,
      fecha_finalizacion: form.fecha_finalizacion||null,
      tipo: canonicalTipo(form.tipo),
      tiempo_estimado: isEvento(form.tipo) ? 0 : form.tiempo_estimado,
      solicitado_por: form.solicitado_por,
      para_casa: form.para_casa,
      tiempo_real_segundos: Math.max(0, Math.floor(form.tiempo_real_segundos ?? Math.round(form.tiempo_real || 0) * 60)),
      ...meetingPayload,
    }
    delete (clean as any).fecha_casa
    delete (clean as any).aparcada
    delete (clean as any).grupo
    const eventPayload = isEvento(form.tipo) ? { tiempo_estimado: 0 } : {}
    const reminderGroupPayload = isEvento(form.tipo)
      ? { grupo: reminderGroupLabel(form) || null }
      : isRoutineType(clean.tipo)
        ? { grupo: routineRepeat !== 'no' ? routineRepeatGroup(routineRepeat, routineRepeatWeekdays) : null }
        : {}
    const closingNow = clean.done === true || clean.estado === 'Completada' || clean.estado === 'Omitida'
    const parkPayload = closingNow
      ? { excluir_plan: false, excluida_fecha: null }
      : form.aparcada
        ? { excluir_plan: true, excluida_fecha: APARCADA_FECHA, en_plan: false }
        : (previous && isAparcada(previous) ? { excluir_plan: false, excluida_fecha: null } : {})
    const casaPayload = (form.para_casa || previous?.para_casa || form.fecha_casa)
      ? { fecha_casa: form.para_casa ? (form.fecha_casa || today) : null }
      : {}
    if (editId) {
      const { error: updateError } = await supabase.from('tareas').update({ ...clean, ...casaPayload, ...parkPayload, ...eventPayload, ...reminderGroupPayload }).eq('id', editId)
      if (updateError) {
        setSaving(false)
        alert(`No pude guardar la tarea: ${updateError.message}${grupoColumnHint(updateError.message)}`)
        return
      }
      if (!form.para_casa) {
        const { error: casaChildrenError } = await supabase
          .from('tareas')
          .update({
            para_casa: false,
            fecha_casa: null,
          })
          .eq('parent_id', editId)
          .eq('es_fragmento', true)
        if (casaChildrenError) {
          setSaving(false)
          alert(`Guardé el padre, pero no pude devolver las partes al circuito de trabajo: ${casaChildrenError.message}`)
          return
        }
      } else {
        const { data: casaChildren, error: casaReadError } = await supabase
          .from('tareas')
          .select('id, fragmento_num, fecha_casa, para_casa')
          .eq('parent_id', editId)
          .eq('es_fragmento', true)
        if (casaReadError) {
          setSaving(false)
          alert(`Guardé el padre, pero no pude leer sus partes: ${casaReadError.message}`)
          return
        }
        const children = (casaChildren || []).sort((a, b) => {
          const an = a.fragmento_num ?? 999999
          const bn = b.fragmento_num ?? 999999
          if (an !== bn) return an - bn
          return a.id - b.id
        })
        const endDate = form.fecha_casa || today
        const childDates = availableCasaDatesEndingAt(endDate, children.length)
        if (children.length > 0) {
          const updates = children.map((child, index) => {
            const childDate = childDates[index] || endDate
            if (child.fecha_casa === childDate && child.para_casa === true) return null
            return supabase.from('tareas').update({ para_casa: true, fecha_casa: childDate }).eq('id', child.id)
          }).filter((update): update is NonNullable<typeof update> => update !== null)
          if (updates.length > 0) {
            const results = await Promise.all(updates)
            const childError = results.find(result => result.error)?.error
            if (childError) {
              setSaving(false)
              alert(`Guardé el padre, pero no pude repartir las partes en Casa: ${childError.message}`)
              return
            }
          }
        }
      }
      if (!form.para_casa && (clean.deadline || clean.fecha_planificada)) {
        const { data: fragmentChildren, error: fragmentError } = await supabase
          .from('tareas')
          .select('id, fragmento_num, deadline, fecha_planificada')
          .eq('parent_id', editId)
          .eq('es_fragmento', true)
        if (fragmentError) {
          setSaving(false)
          alert(`Guarde el padre, pero no pude leer sus partes: ${fragmentError.message}`)
          return
        }
        const children = (fragmentChildren || [])
          .sort((a, b) => {
            const an = a.fragmento_num ?? 999999
            const bn = b.fragmento_num ?? 999999
            if (an !== bn) return an - bn
            return a.id - b.id
          })
        if (children.length > 0) {
          const parentBaseDate = clean.fecha_planificada || clean.deadline
          if (parentBaseDate) {
            const childDates = availableDatesEndingAt(parentBaseDate, children.length)
            const updates = children.map((child, index) => {
              const patch: Partial<Tarea> = {}
              const childDate = childDates[index] || parentBaseDate
              if (clean.fecha_planificada) {
                if (child.fecha_planificada !== childDate) patch.fecha_planificada = childDate
              } else {
                if (child.deadline !== childDate) patch.deadline = childDate
                if (child.fecha_planificada) patch.fecha_planificada = null
              }
              if (Object.keys(patch).length === 0) return null
              return supabase.from('tareas').update(patch).eq('id', child.id)
            }).filter((update): update is NonNullable<typeof update> => update !== null)
            if (updates.length > 0) {
              const results = await Promise.all(updates)
              const childError = results.find(result => result.error)?.error
              if (childError) {
                setSaving(false)
                alert(`Guarde el padre, pero no pude ajustar las partes: ${childError.message}`)
                return
              }
            }
          }
        }
      }
      if ((previous as any)?.__legacyParentSync === true && (previous as any)?.es_padre === true && clean.deadline && clean.deadline !== previous?.deadline) {
        const children = tareas
          .filter(t => t.parent_id === editId && t.es_fragmento === true)
          .sort((a, b) => {
            const an = a.fragmento_num ?? 999999
            const bn = b.fragmento_num ?? 999999
            if (an !== bn) return an - bn
            return a.id - b.id
          })
        if (children.length > 0) {
          const updates = children.map((child, index) => {
            const childDeadline = shiftDateKey(clean.deadline as string, index - (children.length - 1))
            return supabase.from('tareas').update({ deadline: childDeadline }).eq('id', child.id)
          })
          const results = await Promise.all(updates)
          const childError = results.find(result => result.error)?.error
          if (childError) {
            setSaving(false)
            alert(`Guardé el padre, pero no pude ajustar las partes: ${childError.message}`)
            return
          }
        }
      }
      const finalDate = cleanDateValue(clean.fecha_finalizacion)
      const previousFinalDate = cleanDateValue(previous?.fecha_finalizacion)
      const isClosed = clean.done === true || clean.estado === 'Completada' || clean.estado === 'Omitida'
      const totalSeconds = Math.max(0, Math.floor(clean.tiempo_real_segundos ?? Math.round(clean.tiempo_real || 0) * 60))
      const targetDate = isClosed && finalDate ? finalDate : today
      const logsByTask = await fetchTaskTimeLogs([editId])
      const existingLogs = logsByTask[editId] || []
      const previousDaysSeconds = existingLogs
        .filter(log => log.fecha !== targetDate)
        .reduce((sum, log) => sum + logSeconds(log), 0)
      const targetDaySeconds = Math.max(0, totalSeconds - previousDaysSeconds)
      const existingCurrentLog = existingLogs.find(log => log.fecha === targetDate)
      const timeWasEdited = totalSeconds !== Number(previous?.tiempo_real_segundos ?? Number(previous?.tiempo_real || 0) * 60)
      const origin = timeWasEdited ? 'manual' : (existingCurrentLog?.origen || 'manual')

      if (isClosed && previousFinalDate && previousFinalDate !== targetDate) {
        await setTaskMinutesForDate(editId, previousFinalDate, 0)
      }
      await setTaskSecondsForDate(editId, targetDate, targetDaySeconds, origin)

      if (targetDate === today) {
        setTaskMinutesToday(prev => ({ ...prev, [editId]: Math.round(targetDaySeconds / 60) }))
      } else if (previousFinalDate === today) {
        setTaskMinutesToday(prev => ({ ...prev, [editId]: 0 }))
      }
      syncExecutionBlockTime(editId, Math.round(targetDaySeconds / 60), isClosed)
      const wasClosed = previous?.done === true || previous?.estado === 'Completada' || previous?.estado === 'Omitida'
      if (isClosed && !wasClosed) await maybeShowSpawnNotice(editId)
    } else {
      const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(t => t.orden||0)) : 0
      const assignRank = WORK_TYPES_FOR_PRIORITY.has(canonicalTipo(clean.tipo)) && (isEvento(clean.tipo) || rankOnCreate)
      const nextRank = assignRank
        ? Math.max(0, ...tareas.filter(t => canonicalTipo(t.tipo) === canonicalTipo(clean.tipo) && t.prioridad_orden != null).map(t => Number(t.prioridad_orden) || 0)) + 1
        : null
      const meetingDates = isReunion(clean.tipo)
        ? meetingRepeatDates(String(clean.fecha_planificada || meetingDate || ''), meetingRepeat === 'no' ? String(clean.fecha_planificada || meetingDate || '') : meetingUntil, meetingRepeat)
        : []
      const routineDates = !editId && isRoutineType(clean.tipo) && routineRepeat !== 'no'
        ? routineRepeatDates({
            from: form.fecha_solicitud || today,
            months: Number(routineRepeatMonths) <= 0 ? 0 : Math.min(LAST_WORKDAY_ROUTINE_MONTHS, Number(routineRepeatMonths) || 1),
            repeat: routineRepeat,
            weekdays: routineRepeatWeekdays,
          })
        : []
      if (isReunion(clean.tipo) && meetingDates.length > 25) {
        if (!confirm(`Se van a crear ${meetingDates.length} reuniones. ¿Seguimos?`)) {
          setSaving(false)
          return
        }
      }
      if (routineDates.length > 25) {
        if (!confirm(`Se van a crear ${routineDates.length} rutinarias. ¿Seguimos?`)) {
          setSaving(false)
          return
        }
      }
      if (!editId && isRoutineType(clean.tipo) && routineRepeat !== 'no' && routineDates.length === 0) {
        setSaving(false)
        alert(routineRepeat === 'weekdays' ? 'Elige al menos un día.' : 'No pude calcular las fechas de repetición.')
        return
      }
      const existingNames = new Set(tareas.map(t => t.tarea))
      const repeatDates = routineDates.length > 0 ? routineDates : (isReunion(clean.tipo) && meetingDates.length > 0 ? meetingDates : [null])
      const inserts = repeatDates.map((date, index) => {
        const tarea = date
          ? (routineDates.length > 0 ? datedRoutineTitle(form.tarea, date) : reunionTitle(form.tarea, date))
          : clean.tarea
        return {
          ...clean,
          ...parkPayload,
          ...eventPayload,
          ...reminderGroupPayload,
          ...(routineDates.length > 0 ? { grupo: routineRepeatGroup(routineRepeat, routineRepeatWeekdays) } : {}),
          tarea,
          fecha_planificada: date || clean.fecha_planificada,
          deadline: date || clean.deadline,
          fecha_solicitud: date || clean.fecha_solicitud || today,
          orden: maxOrden + index + 1,
          ...(WORK_TYPES_FOR_PRIORITY.has(clean.tipo) ? { prioridad_orden: nextRank } : {}),
        }
      }).filter(row => {
        if (isReunion(clean.tipo) && existingNames.has(row.tarea)) return false
        if (routineDates.length > 0 && existingNames.has(row.tarea)) return false
        return true
      })
      if (inserts.length === 0) {
        setSaving(false)
        alert(isReunion(clean.tipo) || routineDates.length > 0 ? 'Esas tareas ya existen.' : 'No pude crear la tarea.')
        return
      }
      const { error: insertError } = await supabase.from('tareas').insert(inserts)
      if (insertError) {
        setSaving(false)
        alert(`No pude crear la tarea: ${insertError.message}${grupoColumnHint(insertError.message)}`)
        return
      }
    }
    setSaving(false); setModal(false); setForm(empty); setErrors({}); setEditId(null)
    setRankOnCreate(false)
    setMeetingRepeat('no')
    setMeetingUntil('')
    setRoutineRepeat('no')
    setRoutineRepeatMonths(0)
    setRoutineRepeatWeekdays([])
    setCargaRefreshKey(k => k + 1)
    fetchTareas()
  }

  async function openEdit(t: Tarea, opts?: { skipRetrasoConfirm?: boolean }) {
    if (!opts?.skipRetrasoConfirm && t.deadline && t.deadline < today && !t.done && t.estado !== 'Omitida') {
      if (!confirm(`Esta tarea tiene ${diasRetrasoFn(t.deadline, today)} día(s) de retraso. ¿Quieres editarla de todas formas?`)) return
    }
    const schedule = isReunion(t.tipo) ? parseMeetingSchedule(t.notas) : null
    if (schedule) {
      setMeetingStart(schedule.start || '10:00')
      setMeetingEnd(schedule.end || '11:00')
    } else {
      setMeetingStart('10:00')
      setMeetingEnd('11:00')
    }
    setForm({
      tipo: canonicalTipo(t.tipo),
      tarea: isReunion(t.tipo) ? reunionNombreFromTitle(t.tarea) : t.tarea,
      notas: schedule ? schedule.body : (t.notas||''),
      prioridad:t.prioridad,
      estado:t.estado,
      tiempo_estimado:t.tiempo_estimado,
      tiempo_real:t.tiempo_real||0,
      tiempo_real_segundos:t.tiempo_real_segundos ?? (t.tiempo_real || 0) * 60,
      fecha_solicitud:t.fecha_solicitud||'',
      deadline:t.deadline||'',
      fecha_planificada:t.fecha_planificada||'',
      fecha_finalizacion:t.fecha_finalizacion||'',
      done:t.done,
      solicitado_por: (schedule?.lugar || (t as any).solicitado_por || ''),
      orden:t.orden||0,
      en_plan:t.en_plan||false,
      excluir_plan:t.excluir_plan||false,
      aparcada: isAparcada(t),
      para_casa:t.para_casa||false,
      fecha_casa:t.fecha_casa||today,
      grupo: reminderGroupLabel(t),
    })
    const inferredRepeat = inferRoutineRepeat(t)
    setTaskTimeLogs([])
    setErrors({}); setEditId(t.id); setModal(true)
    setRoutineRepeat(inferredRepeat?.repeat ?? 'no')
    setRoutineRepeatMonths(0)
    setRoutineRepeatWeekdays(inferredRepeat?.weekdays ?? [])
    const logsByTask = await fetchTaskTimeLogs([t.id])
    setTaskTimeLogs(logsByTask[t.id] || [])
  }

  async function openEditById(id: number) {
    const local = tareas.find(x => x.id === id)
    if (local) {
      await openEdit(local)
      return
    }

    const { data, error } = await supabase.from('tareas').select('*').eq('id', id).single()
    if (error || !data) {
      alert('No he podido abrir esta tarea. Recarga la app e inténtalo de nuevo.')
      return
    }
    await openEdit(data as Tarea)
  }

  function openNew() {
    const nextTipo = tab === 'Rutinaria' ? 'Mensual' : TIPOS_FORM.includes(tab) ? tab : isEvento(tab) ? EVENT_TYPE : 'Operativa'
    setMeetingStart('10:00')
    setMeetingEnd('11:00')
    setMeetingRepeat('no')
    setMeetingUntil('')
    setRoutineRepeat('no')
    setRoutineRepeatMonths(0)
    setRoutineRepeatWeekdays([])
    setForm(isReunion(nextTipo)
      ? { ...empty, tipo: nextTipo, solicitado_por: 'Teams', fecha_solicitud: today, deadline: today, fecha_planificada: today }
      : { ...empty, tipo: nextTipo, fecha_solicitud: today })
    setTaskTimeLogs([])
    setRankOnCreate(false)
    setErrors({}); setEditId(null); setModal(true)
  }

  function openNewWithTipo(tipo: string) {
    setMeetingStart('10:00')
    setMeetingEnd('11:00')
    setMeetingRepeat('no')
    setMeetingUntil('')
    setRoutineRepeat('no')
    setRoutineRepeatMonths(0)
    setRoutineRepeatWeekdays([])
    setForm(isReunion(tipo)
      ? { ...empty, tipo, solicitado_por: 'Teams', fecha_solicitud: today, deadline: today, fecha_planificada: today }
      : { ...empty, tipo, fecha_solicitud: today })
    setTaskTimeLogs([])
    setRankOnCreate(true)
    setErrors({}); setEditId(null); setModal(true)
  }

  function todayLoggedMinutes(id: number, task?: Tarea) {
    return minutesFromSeconds(todayRealSeconds(taskLogsByTask[id], today, task, taskMinutesToday[id]))
  }

  function displayTaskTimeLogs(): TaskTimeLog[] {
    const finalDate = cleanDateValue(form.fecha_finalizacion)
    const isClosed = form.done === true || form.estado === 'Completada' || form.estado === 'Omitida'
    if (!editId) return taskTimeLogs

    const targetDate = isClosed && finalDate ? finalDate : today
    const realSeconds = Math.max(0, Math.floor(form.tiempo_real_segundos ?? Math.round(form.tiempo_real || 0) * 60))
    const previousDaysSeconds = taskTimeLogs
      .filter(log => log.fecha !== targetDate)
      .reduce((sum, log) => sum + logSeconds(log), 0)
    const targetDaySeconds = Math.max(0, realSeconds - previousDaysSeconds)
    const currentDayLog = taskTimeLogs.find(log => log.fecha === targetDate)
    const otherLogs = taskTimeLogs.filter(log => log.fecha !== targetDate)

    return [{ id: currentDayLog?.id, tarea_id: editId, fecha: targetDate, minutos: minutesFromSeconds(targetDaySeconds), segundos: targetDaySeconds, origen: currentDayLog?.origen || 'manual' }, ...otherLogs]
  }

  function downloadHojaTrabajo() {
    const rows = Array.from({ length: 12 }, (_, i) => `
      <tr>
        <td class="idx">${i + 1}</td>
        <td class="task"></td>
        <td class="time"></td>
        <td class="time"></td>
      </tr>
    `).join('')

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Hoja de tareas</title>
<style>
  @page {
    size: A4;
    margin: 10mm;
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font-family: Arial, Helvetica, sans-serif;
  }

  body {
    width: 210mm;
    min-height: 297mm;
  }

  .page {
    width: 100%;
    padding: 6mm 8mm 4mm 8mm;
  }

  .top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20mm;
    border-bottom: 2.5px solid #111;
    padding-bottom: 7mm;
    margin-bottom: 8mm;
  }

  h1 {
    margin: 0;
    font-size: 28px;
    line-height: 1;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .date {
    font-size: 13px;
    white-space: nowrap;
    padding-bottom: 1mm;
  }

  .date span {
    display: inline-block;
    width: 48mm;
    border-bottom: 1.4px solid #111;
    height: 7mm;
    vertical-align: bottom;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  th {
    border: 1.3px solid #111;
    height: 9mm;
    padding: 2mm 3mm;
    text-align: left;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  td {
    border: 1px solid #555;
    height: 17.7mm;
    padding: 2mm 3mm;
    vertical-align: top;
    font-size: 12px;
  }

  .idx {
    width: 9mm;
    text-align: center;
    vertical-align: middle;
    font-size: 13px;
    color: #111;
    padding: 0;
  }

  .task {
    width: auto;
  }

  .time {
    width: 23mm;
  }

  @media print {
    html, body {
      width: 210mm;
      height: 297mm;
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      page-break-after: avoid;
    }
  }
</style>
</head>
<body>
  <main class="page">
    <section class="top">
      <h1>Hoja de tareas</h1>
      <div class="date">Fecha: <span></span></div>
    </section>

    <table>
      <thead>
        <tr>
          <th style="width:9mm;text-align:center;">#</th>
          <th>Tarea / notas</th>
          <th style="width:23mm;">Est.</th>
          <th style="width:23mm;">Real</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </main>

  <script>
    window.onload = () => {
      window.focus()
      window.print()
    }
  </script>
</body>
</html>`

    const printWindow = window.open('', '_blank', 'width=900,height=1200')
    if (!printWindow) {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'hoja_de_tareas.html'
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  function downloadPlanDiaSheet() {
    const planTasks = displayFiltered.filter(t => !isInactiveForPlan(t))
    const plannedMinutes = planTasks.reduce((sum, t) => sum + (t.tiempo_estimado || 0), 0)
    const rows = [
      ...planTasks.map((t, i) => {
        const deadlineDate = cleanDateValue(t.deadline)
        const plannedDate = cleanDateValue(t.fecha_planificada || '')
        const deadlineDiff = deadlineDate
          ? Math.floor((new Date(today).getTime() - new Date(deadlineDate).getTime()) / 86400000)
          : 0
        const deadlineInfo = deadlineDate
          ? deadlineDiff > 0
            ? `Retraso +${deadlineDiff}d`
            : deadlineDiff === 0
              ? 'DL hoy'
              : `Faltan ${Math.abs(deadlineDiff)}d`
          : ''
        const meta = [
          deadlineDate ? `DL ${fDate(deadlineDate)}` : '',
          plannedDate ? `Plan ${fDate(plannedDate)}` : '',
          deadlineInfo,
        ].filter(Boolean).join(' - ')
        return `
          <tr>
            <td class="idx">${i + 1}</td>
            <td class="task">
              <div class="title">${xmlEscape(t.tarea)}</div>
              <div class="meta">${xmlEscape(meta)}</div>
              ${t.notas ? `<div class="notes">${xmlEscape(t.notas)}</div>` : ''}
            </td>
            <td class="time">${xmlEscape(minToHM(t.tiempo_estimado || 0))}</td>
            <td class="fill"></td>
            <td class="fill"></td>
          </tr>
        `
      }),
      ...Array.from({ length: Math.max(0, 12 - planTasks.length) }, (_, i) => `
        <tr>
          <td class="idx">${planTasks.length + i + 1}</td>
          <td class="task"></td>
          <td class="time"></td>
          <td class="fill"></td>
          <td class="fill"></td>
        </tr>
      `),
    ].join('')

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Plan del día</title>
<style>
  @page {
    size: A4;
    margin: 10mm;
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111827;
    font-family: Arial, Helvetica, sans-serif;
  }

  body {
    width: 210mm;
    min-height: 297mm;
  }

  .page {
    width: 100%;
    padding: 5mm 5mm 4mm;
  }

  .top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8mm;
    border-bottom: 2.5px solid #111827;
    padding-bottom: 5mm;
    margin-bottom: 6mm;
  }

  h1 {
    margin: 0;
    font-size: 23px;
    line-height: 1;
    font-weight: 900;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .summary {
    display: flex;
    gap: 5mm;
    align-items: flex-end;
    font-size: 12px;
    white-space: nowrap;
  }

  .summary strong {
    display: block;
    font-size: 14px;
    line-height: 1.1;
  }

  .summary span {
    color: #6b7280;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  th {
    border: 1.3px solid #111827;
    height: 8mm;
    padding: 1.8mm 2.5mm;
    text-align: left;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  td {
    border: 1px solid #d1d5db;
    height: 13.5mm;
    padding: 1.8mm 2.5mm;
    vertical-align: top;
    font-size: 11px;
  }

  .idx {
    width: 8mm;
    text-align: center;
    vertical-align: middle;
    font-size: 12px;
    color: #111827;
    padding: 0;
  }

  .task {
    width: auto;
  }

  .title {
    font-weight: 800;
    line-height: 1.25;
  }

  .meta {
    margin-top: 1mm;
    color: #6b7280;
    font-size: 9.5px;
  }

  .notes {
    margin-top: 1mm;
    color: #9ca3af;
    font-size: 9.5px;
  }

  .time {
    width: 17mm;
    text-align: center;
    font-weight: 800;
  }

  .fill {
    width: 25mm;
    color: #6b7280;
  }

  @media print {
    html, body {
      width: 210mm;
      min-height: 297mm;
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
  <main class="page">
    <section class="top">
      <h1>Plan del día</h1>
      <div class="summary">
        <div><strong>${xmlEscape(fDate(today))}</strong><span>Fecha</span></div>
        <div><strong>${planTasks.length}</strong><span>Tareas</span></div>
        <div><strong>${xmlEscape(minToHM(plannedMinutes))}</strong><span>Estimado</span></div>
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th style="width:8mm;text-align:center;">#</th>
          <th>Tarea / notas</th>
          <th style="width:17mm;text-align:center;">Est.</th>
          <th style="width:25mm;">Real</th>
          <th style="width:25mm;">Estado / nota</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </main>

  <script>
    window.onload = () => {
      window.focus()
      window.print()
    }
  </script>
</body>
</html>`

    const printWindow = window.open('', '_blank', 'width=900,height=1200')
    if (!printWindow) {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `plan_del_dia_${today}.html`
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  function downloadMaster() {
    const blob = buildMasterWorkbook(today)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'maestro_tareas.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportCSV() {
    const header = EXPORT_COLS.map(c => c.label)
    const rows = tareas.map(t => EXPORT_COLS.map(c => exportCell(t, c.key)))
    const taskSheet = XLSX.utils.aoa_to_sheet([header, ...rows])
    taskSheet['!cols'] = EXPORT_COLS.map(col => ({
      wch: col.key === 'tarea' ? 42 : col.key === 'notas' ? 48 : col.key === 'lista' ? 12 : 16,
    }))
    asExcelTable(taskSheet, EXPORT_COLS.length, rows.length + 1)

    const byId = new Map(tareas.map(t => [t.id, t]))
    const logs = await fetchAllTaskTimeLogs()
    const timeHeader = ['lista', 'tarea_id', 'tarea', 'tipo', 'fecha', 'minutos', 'segundos', 'origen', 'estado']
    const timeRows = logs.map(log => {
      const t = byId.get(log.tarea_id)
      return [
        t ? exportCell(t, 'lista') : '',
        log.tarea_id,
        t?.tarea || '',
        t?.tipo || '',
        exportDate(log.fecha),
        minutesFromSeconds(logSeconds(log)),
        logSeconds(log),
        log.origen,
        t?.estado || '',
      ]
    })
    const timeSheet = XLSX.utils.aoa_to_sheet([timeHeader, ...timeRows])
    timeSheet['!cols'] = [12, 10, 42, 14, 12, 10, 10, 12, 14].map(wch => ({ wch }))
    asExcelTable(timeSheet, timeHeader.length, timeRows.length + 1)

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, taskSheet, 'Tareas')
    XLSX.utils.book_append_sheet(workbook, timeSheet, 'Tiempos')
    downloadWorkbook(workbook, `tabla_tareas_${today}.xlsx`)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true); setImportResult(null)
    const rows = await readImportRows(file)
    if (rows.length < 2) { setImportResult({added:0,skipped:0,duplicates:[],errors:['Archivo vacío']}); setImporting(false); return }

    const keyMap: Record<string,number> = {}
    rows[0].forEach((h,i) => { keyMap[h.replace(/\*/g,'').toLowerCase().trim().replace(/\s/g,'_')] = i })
    const get = (row: string[], key: string) => { const idx=keyMap[key]; return idx!==undefined?(row[idx]||'').trim():'' }

    const second = rows[1]
    const isHint = second[0] && (second[0].includes('/')||second[0].toLowerCase().includes('texto')||second[0].toLowerCase().includes('número'))
    const dataStart = isHint ? 2 : 1

    const inserts: any[] = []
    const duplicates: any[] = []
    const errs: string[] = []
    const seenCsv = new Set<string>()
    const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(t => t.orden||0)) : 0

    for (let i=dataStart; i<rows.length; i++) {
      const row = rows[i]; if (row.every(c=>!c)) continue
      const rn=i+1
      const tarea=get(row,'tarea'), tipo=canonicalTipo(get(row,'tipo')), sp=get(row,'solicitado_por')
      const tr=get(row,'tiempo_estimado'), fr=get(row,'fecha_solicitud'), dr=get(row,'deadline'), fpr=get(row,'fecha_planificada')
      if (!tarea && !sp && !tr && !get(row,'notas')) continue
      if (!tarea){errs.push(`Fila ${rn}: falta "tarea"`);continue}
      if (seenCsv.has(tarea)){errs.push(`Fila ${rn}: tarea repetida dentro del archivo: "${tarea}"`);continue}
      seenCsv.add(tarea)
      if (!tipo){errs.push(`Fila ${rn}: falta "tipo"`);continue}
      if (!sp){errs.push(`Fila ${rn}: falta "solicitado_por"`);continue}
      if (!isEvento(tipo) && !tr){errs.push(`Fila ${rn}: falta "tiempo_estimado"`);continue}
      if (!fr){errs.push(`Fila ${rn}: falta "fecha_solicitud"`);continue}
      if (!dr){errs.push(`Fila ${rn}: falta "deadline"`);continue}
      const fs=parseDate(fr); if(!fs){errs.push(`Fila ${rn}: fecha_solicitud inválida`);continue}
      const dl=parseDate(dr); if(!dl){errs.push(`Fila ${rn}: deadline inválido`);continue}
      const fp = fpr ? parseDate(fpr) : null
      if (fpr && !fp) { errs.push(`Fila ${rn}: fecha_planificada inválida`); continue }

      const meetingDate = fp || dl
      const payload = {
        tipo,tarea: isReunion(tipo) && meetingDate ? reunionTitle(tarea, meetingDate) : tarea,notas:get(row,'notas')||null,solicitado_por:sp,prioridad:get(row,'prioridad')||'Media',
        estado:get(row,'estado')||'Pendiente',tiempo_estimado:isEvento(tipo)?0:(parseInt(tr)||0),tiempo_real:parseInt(get(row,'tiempo_real'))||0,
        fecha_solicitud:fs,deadline:dl,fecha_planificada: isReunion(tipo) ? (fp || dl) : fp,fecha_finalizacion:null,hora_finalizacion:null,done:false,en_plan:false,excluir_plan:false,
        ...(isEvento(tipo) && get(row,'grupo') ? { grupo: get(row,'grupo') } : {}),
      }

      const exists = tareas.find(t => t.tarea === tarea)
      if (exists) {
        duplicates.push({ id: exists.id, actual: exists, update: payload })
      } else {
        inserts.push({
          ...payload,
          orden: maxOrden + inserts.length + 1,
          ...(WORK_TYPES_FOR_PRIORITY.has(tipo) ? { prioridad_orden: null } : {}),
        })
      }
    }

    let added = 0
    if (inserts.length > 0) {
      const { error } = await supabase.from('tareas').insert(inserts)
      if (error) errs.push(`Error al guardar: ${error.message}`)
      else { added = inserts.length; fetchTareas() }
    }

    setImportResult({ added, skipped: duplicates.length, duplicates, errors: errs })
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleConfirmOverwrite(selected: any[]) {
    if (!selected.length) return

    setDeleting(true)

    for (const item of selected) {
      await supabase
        .from('tareas')
        .update(item.update)
        .eq('id', item.id)
    }

    setDeleting(false)
    setImportResult(null)
    fetchTareas()
  }

  async function handleImportDuplicatesAnyway(selected: any[]) {
    if (!selected.length) return

    setDeleting(true)

    const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(t => t.orden || 0)) : 0

    const inserts = selected.map((item, i) => ({
      ...item.update,
      orden: maxOrden + i + 1,
      ...(WORK_TYPES_FOR_PRIORITY.has(item.update.tipo) ? { prioridad_orden: null } : {}),
    }))

    const { error } = await supabase.from('tareas').insert(inserts)

    if (error) {
      alert(`Error al importar duplicadas: ${error.message}`)
    }

    setDeleting(false)
    setImportResult(null)
    fetchTareas()
  }

  const inputCls = (err?:string) => `w-full border rounded-lg px-3 py-2 text-sm outline-none transition bg-white text-gray-800 placeholder:text-gray-300 ${err?'border-red-300 focus:border-red-400':'border-gray-200 focus:border-gray-400'}`
  const selectCls = (err?:string) => `w-full border rounded-lg px-3 py-2 text-sm outline-none transition bg-white text-gray-800 cursor-pointer appearance-none pr-8 ${err?'border-red-300':'border-gray-200 focus:border-gray-400'}`

  const showNewBtn = !['Completadas','Casa','Aplazadas'].includes(tab)

  const ResizeHandle = ({ col }: { col: number }) => (
    <span
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        colResizing.current = { col, startX: e.clientX, startW: colWidths[col] }
      }}
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none group/resize"
      title="Arrastra para cambiar el ancho"
    >
      <span className="absolute right-0 top-2 bottom-2 w-px bg-gray-200 group-hover/resize:bg-gray-500 transition-colors"></span>
    </span>
  )

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <style jsx global>{`
        .gestor-table th,
        .gestor-table td {
          text-align: center;
          vertical-align: middle;
        }

        .gestor-table th {
          position: relative;
        }

        .gestor-table td > .flex,
        .gestor-table td > div.flex {
          justify-content: center;
        }

        .gestor-table .text-left {
          text-align: center;
        }

        .gestor-table .items-start {
          align-items: center;
        }

        .divide-task-btn {
          color: #d1d5db;
        }

        .divide-task-btn:hover {
          color: #7c3aed;
          background-color: #f5f3ff;
        }

        .divide-task-btn svg {
          stroke: currentColor;
          transition: color 150ms ease, stroke 150ms ease;
        }
      `}</style>

      <div className="border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-12 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-gray-900 flex items-center justify-center flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            </div>
            <span className="font-semibold text-gray-900 text-sm tracking-tight">Gestor de casa</span>
            <span className="text-gray-200">·</span>
            <span className="text-gray-400 text-xs capitalize" suppressHydrationWarning>{new Date(`${today}T00:00:00`).toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>
          </div>
          <div className="flex items-center gap-2">
            {mounted && <>
              <button onClick={downloadHojaTrabajo} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">Hoja de trabajo</button>
              {tab === 'Plan' && (
                <button onClick={downloadPlanDiaSheet} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">Imprimir plan</button>
              )}
              <button onClick={downloadMaster} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">↓ Maestro</button>
              <button onClick={()=>{setImportResult(null);setImportModal(true)}} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">↑ Importar</button>
              <button onClick={exportCSV} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">↓ Exportar</button>
              {showNewBtn&&<button onClick={openNew} className="text-xs text-white bg-gray-900 hover:bg-gray-700 px-4 py-1.5 rounded-lg transition font-semibold">+ Nueva tarea</button>}
            </>}
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-12 pt-10 pb-16">

        <div className="mb-8 space-y-1.5">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-300">{group.label}</span>
                <div className="flex items-center gap-0.5 flex-wrap">
                  {group.keys.map(key => {
                    const def = TABS.find(t => t.key === key)
                    if (!def) return null
                    const count = tabCount(key)
                    const isActive = tab === key || (isEvento(tab) && isEvento(key))
                    const dot = TYPE_NAV_DOT[key]
                    return (
                      <button key={key} onClick={() => setTab(key)} title={def.sub || undefined}
                        className={`px-2.5 py-1.5 text-sm transition font-medium flex items-center gap-2 border-b-2 ${isActive ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'}`}>
                        {dot
                          ? <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                          : <span>{def.emoji}</span>}
                        <span className="flex items-baseline gap-1.5">
                          {def.label}
                          {def.sub && <span className={`text-[10px] font-normal ${isActive ? 'text-gray-400' : 'text-gray-300'}`}>{def.sub}</span>}
                        </span>
                        {count > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold whitespace-nowrap ${isActive ? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-400'}`}>{tabCountLabel(key, count)}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
              {groupIndex === 0 && hasFilters && tab !== 'Plan' && tab !== 'Casa' && tab !== 'Aplazadas' && tab !== 'Carga' && tab !== 'Ejecucion' && tab !== 'Priorizar' && tab !== 'Replanificar' && tab !== 'Planificacion' && tab !== 'Decisiones' && tab !== 'Rendimiento' && (
                <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">Limpiar filtros</button>
              )}
            </div>
          ))}
        </div>

        <div className={tab === 'Ejecucion' ? '' : 'hidden'} aria-hidden={tab !== 'Ejecucion'}>
          <Ejecucion onEditTarea={openEditById} refreshKey={cargaRefreshKey} jornadaMin={previsionMin} cronoSeconds={cronoSeconds} />
        </div>

        {tab === 'Decisiones' ? <Decisiones onEditTarea={openEditById} refreshKey={cargaRefreshKey} /> : tab === 'Carga' ? <CargaTrabajo onEditTarea={openEditById} refreshKey={cargaRefreshKey} /> : tab === 'Priorizar' ? <Priorizador onEditTarea={openEditById} onCreateTarea={openNewWithTipo} refreshKey={cargaRefreshKey} onChanged={() => { setCargaRefreshKey(k => k + 1); fetchTareas() }} /> : tab === 'Planificacion' ? <Planificacion onEditTarea={openEditById} refreshKey={cargaRefreshKey} onChanged={() => { setCargaRefreshKey(k => k + 1); fetchTareas() }} /> : tab === 'Replanificar' ? <Replanificador onEditTarea={openEditById} refreshKey={cargaRefreshKey} /> : tab === 'Rendimiento' ? <Rendimiento refreshKey={cargaRefreshKey} cronoSeconds={cronoSeconds} /> : tab === 'Ejecucion' ? null : <>

        {tab === 'Plan' ? (
          <PlanKpis filtered={filtered} taskMinutesToday={taskMinutesToday} taskLogsByTask={taskLogsByTask} today={today} cronoSeconds={cronoSeconds} cronoRunning={cronoRunning} onStart={startCrono} onPause={pauseCrono} onReset={resetCrono} formatCrono={formatCrono} previsionMin={previsionMin} dayCapacityMin={capacityForDate(today)} setPrevisionMin={setPrevisionMin} onAdjustStart={adjustCronoFromStart} onAdjustEnd={adjustCronoToEnd} casaHoyCount={casaHoyCount} casaHoyMin={casaHoyMin} onOpenCasa={() => { setCasaMonth(monthKey(today)); setExpandedCasaDay(today); setTab('Casa') }}/>
        ) : (
          <GeneralKpis tareas={tareas} filtered={tab === 'Estratégica' ? tableRows : filtered} tab={tab} today={today}/>
        )}

        {isEvento(tab) && !sortCol && (
          <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
            <span>Agrupados por categoría. Clica la cabecera para plegar. Arrástrala para cambiar el orden de los grupos.</span>
          </div>
        )}
        {tab === 'Plan' && !sortCol && (
          <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
            <span>{isEvento(tab) ? 'Las flechas de cada categoría la suben o la bajan. También puedes arrastrar la cabecera.' : 'Arrastra las filas para reordenarlas. Para ordenar por columna usa las flechas ↕ de la cabecera.'}</span>
          </div>
        )}

        {tab === 'Casa' ? (
          <div className="space-y-4">
            <div className="border border-gray-100 rounded-xl bg-white overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-gray-900">Carga fuera de jornada</div>
                  <div className="text-xs text-gray-400">Tareas fuera del circuito laboral. Ajusta capacidad por día y abre cada fecha para revisar.</div>
                </div>
                <div className="text-right text-xs text-gray-400">
                  <div className="font-semibold text-gray-600">L-X 2h · J-S 0 · D 2h</div>
                  <div>8h / semana</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {casaMonths.map(month => (
                <button
                  key={month}
                  onClick={() => setCasaMonth(month)}
                  className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition capitalize ${casaMonth === month ? 'bg-gray-900 text-white' : 'border border-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}
                >
                  {monthLabel(month)}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="border border-gray-100 rounded-xl py-16 text-center text-gray-300 text-sm">Cargando casa...</div>
            ) : casaGroups.length === 0 ? (
              <div className="border border-gray-100 rounded-xl py-16 text-center text-gray-300 text-sm">Sin días para mostrar.</div>
            ) : casaGroups.map(([fecha, tasks]) => {
              const leafCount = casaLeafTasks(tasks).length
              const totalMin = tasks.reduce((sum, task) => sum + (task.tiempo_estimado || 0), 0)
              const dayCapacity = casaCapacityForDate(fecha)
              const pct = dayCapacity > 0 ? Math.round((totalMin / dayCapacity) * 100) : totalMin > 0 ? 999 : 0
              const free = dayCapacity - totalMin
              const isExpanded = expandedCasaDay === fecha
              const tone = dayCapacity <= 0
                ? 'bg-gray-300'
                : pct <= 95
                  ? 'bg-emerald-400'
                  : pct <= 105
                    ? 'bg-amber-400'
                    : 'bg-red-400'
              const sectionTone = dayCapacity <= 0
                ? 'border-gray-100'
                : pct <= 95
                  ? 'border-emerald-100'
                  : pct <= 105
                    ? 'border-amber-100'
                    : 'border-red-100'
              const labelTone = free < 0 ? 'text-red-500' : free === 0 ? 'text-amber-600' : 'text-emerald-600'
              return (
                <section key={fecha} className={`border ${sectionTone} rounded-xl overflow-hidden bg-white`}>
                  <div
                    className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50/60 transition"
                    onClick={() => setExpandedCasaDay(isExpanded ? null : fecha)}
                  >
                    <div className="min-w-36 flex-shrink-0 flex items-center gap-3">
                      <div>
                        <div className={`text-sm font-bold ${fecha === today ? 'text-blue-600' : 'text-gray-900'}`}>
                          {fecha === today ? 'Hoy' : fDate(fecha)}
                        </div>
                        <div className="text-xs text-gray-400">{leafCount} tareas</div>
                      </div>
                      {leafCount > 0 && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            openUnparkCasaDay(fecha, tasks)
                          }}
                          className="text-[11px] font-semibold text-gray-600 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-white hover:text-gray-900 transition whitespace-nowrap"
                        >
                          A Plan del día
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                        <span className={labelTone}>{minToHM(totalMin)} ocupado</span>
                        <span className={labelTone}>{free < 0 ? `${minToHM(Math.abs(free))} exceso` : `${minToHM(free)} libre`}</span>
                      </div>
                      <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${tone}`} style={{width:`${Math.min(100, pct)}%`}}></div>
                      </div>
                    </div>
                    <div className="w-64 flex-shrink-0 flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                      <label className="flex items-center gap-1.5 text-xs text-gray-400">
                        cap.
                        <input
                          type="number"
                          min={0}
                          value={dayCapacity}
                          onChange={e => updateCasaCapacityForDate(fecha, Number(e.target.value))}
                          className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-800 outline-none focus:border-gray-400"
                        />
                        min
                      </label>
                      <span className={`min-w-12 text-right text-xs font-bold ${labelTone}`}>{pct}%</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`text-gray-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </div>
                  </div>
                  {isExpanded && <div className="divide-y divide-gray-50 border-t border-gray-100">
                    {tasks.length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-gray-300">Sin tareas fuera de jornada este día.</div>
                    ) : tasks.map(task => {
                      const tipoC = TIPO_COLORS[canonicalTipo(task.tipo)]
                      const rutinaMark = RUTINA_MARKS[task.tipo]
                      return (
                        <button key={task.id} onClick={() => openEdit(task)} className="w-full grid grid-cols-[1fr_88px_96px] gap-3 items-center px-5 py-3 text-left hover:bg-blue-50/40 transition">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-800 truncate">{task.tarea}</div>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                              {tipoC && (
                                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${tipoC.bg} ${tipoC.text}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${tipoC.dot}`}></span>
                                  {canonicalTipo(task.tipo)}
                                  {rutinaMark && <span title={rutinaMark.title} className={`ml-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-sm border bg-white/70 px-0.5 text-[8px] font-bold leading-none ${rutinaMark.border}`}>{rutinaMark.code}</span>}
                                </span>
                              )}
                              <span>{task.prioridad}</span>
                              {(task as any).__children?.length > 0 && <span>{(task as any).__children.length} partes</span>}
                            </div>
                          </div>
                          <div className="text-right text-xs font-semibold text-gray-600">{minToHM(task.tiempo_estimado || 0)}</div>
                          <div className="text-right">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${ESTADO_COLORS[estadoForDisplay(task)]?.bg || 'bg-gray-100'} ${ESTADO_COLORS[estadoForDisplay(task)]?.text || 'text-gray-400'}`}>{estadoForDisplay(task)}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>}
                </section>
              )
            })}
          </div>
        ) : (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="gestor-table w-full text-sm border-collapse table-fixed text-center" style={{textAlign:"center"}}>
            <colgroup>
{colWidths.map((w,i) => <col key={i} style={{width:`${w}px`}}/>)}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200 bg-white" style={{height:44,whiteSpace:'nowrap'}}>
                <th className="relative px-3 select-none text-center">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Acciones</span>
                  <ResizeHandle col={0}/>
                </th>
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="Tipo" options={tipoOpts} value={fTipo} onChange={setFTipo} onSort={()=>handleSort('tipo')} sortDir={sortDir} isSorted={sortCol==='tipo'}/>
                  <ResizeHandle col={1}/>
                </th>
                <th className="relative px-4 select-none text-center">
                  <TextFilter value={fTarea} onChange={setFTarea} onSort={()=>handleSort('tarea')} sortDir={sortDir} isSorted={sortCol==='tarea'}/>
                  <ResizeHandle col={2}/>
                </th>
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="F. Solic." options={fechaSolOpts} value={fFechaSol} onChange={setFFechaSol} onSort={()=>handleSort('fecha_solicitud')} sortDir={sortDir} isSorted={sortCol==='fecha_solicitud'}/>
                  <ResizeHandle col={3}/>
                </th>
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="Deadline" options={deadlineOpts} value={fDeadline} onChange={setFDeadline} onSort={()=>handleSort('deadline')} sortDir={sortDir} isSorted={sortCol==='deadline'}/>
                  <ResizeHandle col={4}/>
                </th>
                {tab === 'Completadas' ? (
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="Fin" options={fechaFinOpts} value={fFechaFin} onChange={setFFechaFin} onSort={()=>handleSort('fecha_finalizacion')} sortDir={sortDir} isSorted={sortCol==='fecha_finalizacion'}/>
                  <ResizeHandle col={5}/>
                </th>
                ) : (
                <th className="relative px-3 text-center select-none">
                  <button onClick={()=>handleSort('tiempo_estimado')} className="flex items-center gap-1 mx-auto text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600">
                    Est.{sortCol==='tiempo_estimado'&&<span>{sortDir==='asc'?'↑':'↓'}</span>}
                  </button>
                  <ResizeHandle col={5}/>
                </th>
                )}
                <th className="relative px-3 text-center select-none">
                  <button onClick={()=>handleSort('tiempo_real')} className="flex items-center gap-1 mx-auto text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600">
                    Real{sortCol==='tiempo_real'&&<span>{sortDir==='asc'?'↑':'↓'}</span>}
                  </button>
                  <ResizeHandle col={6}/>
                </th>
                {tab !== 'Completadas' && (
                <th className="relative px-3 text-center select-none">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dif.</span>
                  <ResizeHandle col={7}/>
                </th>
                )}
                <th className="relative px-4 select-none text-center">
                  <ColFilter label="Estado" options={estadoOpts} value={fEstado} onChange={setFEstado} onSort={()=>handleSort('estado')} sortDir={sortDir} isSorted={sortCol==='estado'}/>
                  <ResizeHandle col={8}/>
                </th>
                <th className="relative px-3 select-none text-center">
                  <ResizeHandle col={9}/>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading?(
                <tr><td colSpan={10} className="text-center py-20 text-gray-300 text-sm">
                  <div className="flex flex-col items-center gap-3"><div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin"></div>Cargando...</div>
                </td></tr>
              ):tableRows.length===0?(
                <tr><td colSpan={10} className="text-center py-20 text-sm">
                  <div className="flex flex-col items-center gap-2 text-gray-300">
                    <span className="text-4xl">{tab==='Plan'?'☀️':tab==='Completadas'?'✓':'○'}</span>
                    <span>{hasFilters?'Sin resultados para estos filtros':tab==='Plan'?'Sin tareas para hoy':tab==='Aplazadas'?'Nada por clasificar':tab==='Completadas'?'Aún no hay completadas':'Sin tareas aquí'}</span>
                  </div>
                </td></tr>
              ):tableRows.map((t,idx)=>{
                if ((t as any).__isReminderGroup) {
                  const groupName = String((t as any).__groupName || '')
                  const isLooseGroup = groupName === 'Sin categoría'
                  const groupCollapsed = collapsedReminderGroupSet.has(groupName)
                  const rangeText = formatReminderRange({
                    min: (t as any).__groupMin,
                    max: (t as any).__groupMax,
                    days: (t as any).__groupDays,
                  })
                  return (
                    <tr
                      key={`reminder-group-${groupName}`}
                      draggable={!isLooseGroup}
                      onDragStart={(e) => {
                        if (isLooseGroup) return
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', groupName)
                        onReminderGroupDragStart(groupName)
                      }}
                      onDragEnter={() => { if (!isLooseGroup) setDragOverGroup(groupName) }}
                      onDragOver={(e) => { if (!isLooseGroup) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverGroup(groupName) } }}
                      onDrop={(e) => { e.preventDefault(); onReminderGroupDrop(groupName) }}
                      onDragEnd={() => { dragGroupName.current = null; setDraggingGroup(null); setDragOverGroup(null) }}
                      className={`${!isLooseGroup ? 'cursor-grab active:cursor-grabbing' : ''} ${draggingGroup === groupName ? 'opacity-40' : ''} ${dragOverGroup === groupName && draggingGroup && draggingGroup !== groupName ? 'border-t-2 border-t-rose-300' : ''}`}
                    >
                      <td colSpan={10} className="px-4 pt-5 pb-1.5">
                        <button
                          type="button"
                          onMouseDown={e => { if (!isLooseGroup) e.stopPropagation() }}
                          onClick={() => toggleReminderGroupCollapsed(groupName)}
                          className="flex w-full items-center gap-2 text-left"
                          title={groupCollapsed ? 'Mostrar avisos' : 'Ocultar avisos'}
                        >
                          <span className="text-[10px] font-bold text-rose-500 w-3 shrink-0">{groupCollapsed ? '▸' : '▾'}</span>
                          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-800 truncate">{groupName}</span>
                          <span className="text-[10px] text-rose-400 shrink-0">{(t as any).__groupCount}</span>
                          <div className="h-px flex-1 bg-rose-100" />
                          {rangeText
                            ? <span className="text-[11px] tabular-nums text-rose-700 whitespace-nowrap">{rangeText}</span>
                            : <span className="text-[11px] text-gray-300 whitespace-nowrap">Sin deadline</span>}
                        </button>
                      </td>
                    </tr>
                  )
                }
                const tIsInactive = t.done===true||(t.done as any)==='true'||t.estado==='Completada'||t.estado==='Omitida'
                const firstInactiveIdx = displayFiltered.findIndex(x => isInactiveForPlan(x))
                const showDivider = tab==='Plan' && tIsInactive && idx===firstInactiveIdx
                const previousPlanTask = idx > 0 ? displayFiltered[idx - 1] : null
                const routineInfo = tab === 'Plan' && !tIsInactive ? routineBlockForTask(t) : null
                const previousRoutineInfo = tab === 'Plan' && previousPlanTask && !isInactiveForPlan(previousPlanTask)
                  ? routineBlockForTask(previousPlanTask)
                  : null
                const showRoutineDivider = tab === 'Plan' && !tIsInactive && routineInfo?.key !== previousRoutineInfo?.key && (!!routineInfo || !!previousRoutineInfo)
                const routineDividerLabel = routineInfo?.label || 'Resto del plan'

                const tipoC=TIPO_COLORS[canonicalTipo(t.tipo)]
                const rutinaMark=RUTINA_MARKS[t.tipo]
                const estadoVisual = estadoForDisplay(t)
                const estC=ESTADO_COLORS[estadoVisual]
                const retraso=diasRetraso(t.deadline,today)
                const tEst=t.tiempo_estimado||0
                const tReal=tab==='Plan'
                  ? todayLoggedMinutes(t.id, t)
                  : minutesFromSeconds(taskRealSeconds(t, taskLogsByTask[t.id]))
                const dif=tReal>0?tReal-tEst:null
                const autoplan=isAutoInPlan(t)
                const excludedToday=isExcludedFromPlanToday(t)
                const enplan=isEnPlan(t)
                const isDone=t.done===true||(t.done as any)==='true'
                const isDragging=dragging===t.id
                const isOver=dragOverIdx===t.id&&!isDragging
                const strategicChildren = (t as any).__children as Tarea[] | undefined
                const isStrategicParentRow = (t as any).__isStrategicParent === true && strategicChildren && strategicChildren.length > 0
                if (isStrategicParentRow) {
                  const expanded = expandedStrategicParents.has(t.id)
                  const toggleParent = () => {
                    setExpandedStrategicParents(prev => {
                      const next = new Set(prev)
                      if (next.has(t.id)) next.delete(t.id)
                      else next.add(t.id)
                      return next
                    })
                  }
                  return (
                    <Fragment key={`strategic-parent-${t.id}`}>
                      <tr className="border-b border-orange-50 bg-orange-50/20 hover:bg-orange-50/30 transition-colors" style={{height:56}}>
                        <td className="px-3 text-center">
                          <button onClick={toggleParent} className="w-8 h-8 rounded-lg border border-orange-100 bg-white text-orange-600 font-bold hover:bg-orange-50 transition">
                            {expanded ? '▾' : '▸'}
                          </button>
                        </td>
                        <td className="px-4 text-center">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md ${tipoC?.bg || 'bg-orange-50'} ${tipoC?.text || 'text-orange-800'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tipoC?.dot || TIPO_DOT.Estratégica}`}></span>
                            Estratégica
                          </span>
                        </td>
                        <td className="px-4 min-w-0 text-center">
                          <button onClick={toggleParent} className="w-full min-w-0 text-center">
                            <div className="truncate text-[12px] font-bold text-gray-800" title={t.tarea}>{t.tarea}</div>
                            <div className="mt-0.5 text-[10px] text-gray-400">{strategicChildren.length} partes · {minToHM(t.tiempo_estimado || 0)}</div>
                          </button>
                        </td>
                        <td className="px-4 text-[11px] text-gray-400 whitespace-nowrap text-center">{fDate(t.fecha_solicitud)}</td>
                        <td className="px-4 whitespace-nowrap text-center">
                          <span className="text-[11px] font-medium text-gray-400">{fDate(t.deadline)}</span>
                        </td>
                        <td className="px-3 text-center text-[11px] tabular-nums font-semibold text-gray-600">{t.tiempo_estimado ? `${t.tiempo_estimado}m` : '—'}</td>
                        <td className="px-3 text-center text-[11px] tabular-nums text-gray-300">—</td>
                        <td className="px-3 text-center text-xs text-gray-300">—</td>
                        <td className="px-4 text-center">
                          <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-800">Padre</span>
                        </td>
                        <td className="px-3 text-center">
                          <button onClick={() => deleteStrategicParent(t)} disabled={deleting} title="Eliminar padre y partes" className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-200 hover:text-red-500 hover:bg-red-50 transition">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                          </button>
                          <button onClick={() => openEdit(t)} title="Editar padre" className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-orange-500 hover:text-orange-800 hover:bg-orange-50 transition">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        </td>
                      </tr>
                      {expanded && strategicChildren.map((child, childIndex) => {
                        const childEstado = estadoForDisplay(child)
                        const childEstadoColor = ESTADO_COLORS[childEstado]
                        const displayPartNum = childIndex + 1
                        const displayPartTotal = strategicChildren.length
                        const displayPartTitle = renameFragmentTask(child.tarea, displayPartNum, displayPartTotal)
                        return (
                          <tr key={`strategic-child-${child.id}`} className="border-b border-gray-50 bg-white hover:bg-blue-50/40 transition-colors" style={{height:48}}>
                            <td className="px-3 text-center text-[10px] font-bold text-orange-600">P{displayPartNum}</td>
                            <td className="px-4 text-center">
                              <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-800">Parte</span>
                            </td>
                            <td className="px-4 min-w-0 text-center">
                              <button onClick={() => openEdit(child)} className="w-full min-w-0 text-center">
                                <div className="truncate text-[11px] font-semibold text-gray-600" title={displayPartTitle}>{displayPartTitle}</div>
                                <div className="text-[10px] text-gray-300">Parte {displayPartNum} de {displayPartTotal}</div>
                              </button>
                            </td>
                            <td className="px-4 text-[11px] text-gray-400 whitespace-nowrap text-center">{fDate(child.fecha_solicitud)}</td>
                            <td className="px-4 whitespace-nowrap text-center"><span className="text-[11px] font-medium text-gray-400">{fDate(child.deadline)}</span></td>
                            <td className="px-3 text-center text-[11px] tabular-nums text-gray-500">{child.tiempo_estimado ? `${child.tiempo_estimado}m` : '—'}</td>
                            <td className="px-3 text-center text-[11px] tabular-nums text-gray-500">{minutesFromSeconds(taskRealSeconds(child, taskLogsByTask[child.id])) ? `${minutesFromSeconds(taskRealSeconds(child, taskLogsByTask[child.id]))}m` : '—'}</td>
                            <td className="px-3 text-center text-xs text-gray-200">—</td>
                            <td className="px-4 text-center">
                              {childEstadoColor ? (
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${childEstadoColor.bg} ${childEstadoColor.text}`}>{childEstado}</span>
                              ) : <span className="text-xs text-gray-400">{childEstado}</span>}
                            </td>
                            <td className="px-3 text-center">
                              <button onClick={() => deleteStrategicPart(child)} disabled={deleting} title="Eliminar parte" className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-200 hover:text-red-500 hover:bg-red-50 transition">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                              </button>
                              <button onClick={() => openEdit(child)} title="Editar" className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                }

                return <Fragment key={`task-row-${t.id}`}>
                  {showRoutineDivider && (
                    <tr key={`routine-divider-${t.id}`}>
                      <td colSpan={10} className="px-6 py-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-gray-100"></div>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${routineInfo ? 'text-gray-500' : 'text-gray-300'}`}>{routineDividerLabel}</span>
                          <div className="flex-1 h-px bg-gray-100"></div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {showDivider && (
                    <tr key={`divider-${t.id}`}>
                      <td colSpan={10} className="px-6 py-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-gray-100"></div>
                          <span className="text-[10px] text-gray-300 font-medium uppercase tracking-wider">Completadas y omitidas hoy</span>
                          <div className="flex-1 h-px bg-gray-100"></div>
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr key={t.id}
                    draggable={!tIsInactive}
                    onDragStart={(e)=>{ if (!tIsInactive) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(t.id)); onDragStart(t.id) } }}
                    onDragEnter={()=>{ if (!tIsInactive) onDragEnter(t.id) }}
                    onDrop={(e)=>{ e.preventDefault(); if (!tIsInactive) onDrop(t.id) }}
                    onDragEnd={()=>{ void onDrop() }}
                    onDragOver={e=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!tIsInactive) onDragEnter(t.id) }}
                    className={`border-b border-gray-50 group transition-colors ${isDragging?'opacity-40':''} ${isOver?'border-t-2 border-t-gray-400':''} ${idx%2===1?'bg-blue-50/20 hover:bg-blue-50/60':'bg-white hover:bg-blue-50/60'}`}
                    style={{height:52,cursor:tIsInactive?'default':'grab'}}>

                    <td className="px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {t.done||t.estado==='Omitida' ? (
                          <button onClick={()=>undoTask(t)} title="Deshacer"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-amber-400 hover:text-amber-600 hover:bg-amber-50 transition">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                          </button>
                        ) : (<>
                          <button onClick={()=>completeTask(t)} title="Marcar como hecha"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                          </button>
                          <button onClick={()=>omitTask(t)} title="Omitir"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition text-base">⏭</button>
                          {tab !== 'Aplazadas' && (
                          <button onClick={()=>togglePlan(t)}
                            title={excludedToday ? 'Volver al Plan del día' : autoplan ? 'Sacar del Plan del día' : enplan ? 'Quitar del Plan' : 'Añadir al Plan'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition ${excludedToday ? 'text-gray-200 hover:text-gray-400 hover:bg-gray-50' : autoplan ? 'text-amber-400 hover:text-amber-600 hover:bg-amber-50' : enplan ? 'text-blue-500 bg-blue-50 hover:bg-blue-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                          </button>
                          )}
                          {(tab === 'Plan' || tab === 'Aplazadas') && (
                            <button onClick={()=>setAparcada(t, tab !== 'Aplazadas')}
                              title={tab === 'Aplazadas' ? 'Devolver (conserva las fechas)' : 'Pasar a Por clasificar'}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition">
                              {tab === 'Aplazadas' ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              )}
                            </button>
                          )}
                        </>)}
                      </div>
                    </td>

                    <td className="px-4 text-center">
                      <div className="flex justify-center">
                      {tipoC?(
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md ${tipoC.bg} ${tipoC.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tipoC.dot}`}></span>
                          {canonicalTipo(t.tipo)}
                          {rutinaMark && <span title={rutinaMark.title} className={`ml-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-sm border bg-white/70 px-0.5 text-[8px] font-bold leading-none ${rutinaMark.border}`}>{rutinaMark.code}</span>}
                        </span>
                      ):<span className="text-xs text-gray-400">{canonicalTipo(t.tipo)}</span>}
                      </div>
                    </td>

                    <td className="px-4 min-w-0 text-center">
                      <div className={`text-[11px] leading-tight truncate ${isDone||t.estado==='Omitida'||t.estado==='Completada'?'line-through text-gray-300':'text-gray-500'}`} title={t.tarea}>
                        {isReunion(t.tipo) ? t.tarea : shortTaskName(t.tarea)}
                      </div>
                      {(() => {
                        if (isReunion(t.tipo)) {
                          const schedule = parseMeetingSchedule(t.notas)
                          const when = schedule.start && schedule.end
                            ? `${schedule.start}–${schedule.end}${schedule.lugar ? ` · ${schedule.lugar}` : ''}`
                            : ''
                          const sub = [when, schedule.body].filter(Boolean).join(' · ')
                          return sub ? <div className={`text-[10px] leading-tight truncate mt-0.5 ${TIPO_TEXT.Reunión}`} title={sub}>{sub}</div> : null
                        }
                        return t.notas ? <div className="text-[10px] leading-tight text-gray-300 truncate mt-0.5" title={t.notas}>{t.notas}</div> : null
                      })()}
                      {isEvento(t.tipo) && reminderGroupLabel(t) && !isEvento(tab) && (
                        <div className="text-[10px] leading-tight text-rose-600 truncate mt-0.5" title={reminderGroupLabel(t)}>{reminderGroupLabel(t)}</div>
                      )}
                    </td>

                    <td className="px-4 text-[11px] text-gray-400 whitespace-nowrap text-center">{fDate(t.fecha_solicitud)}</td>

                    <td className="px-4 whitespace-nowrap text-center">
                      {(() => {
                        const isRetrasada = retraso > 0 && !isDone && t.estado !== 'Omitida' && t.estado !== 'Completada'
                        const isHoy = t.deadline === today && !isDone && t.estado !== 'Omitida' && t.estado !== 'Completada'
                        const diasRestantes = t.deadline && t.deadline > today && !isDone && t.estado !== 'Omitida' && t.estado !== 'Completada'
                          ? Math.ceil((new Date(t.deadline).getTime() - new Date(today).getTime()) / 86400000) : 0
                        return (
                          <div className="flex flex-col gap-0.5 items-center">
                            <span className={`text-[11px] font-medium ${isRetrasada ? 'text-red-400' : 'text-gray-400'}`}>{fDate(t.deadline)}</span>
                            {isRetrasada && (
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] font-bold bg-red-100 text-red-500 px-2 py-0.5 rounded-full">+{retraso}d</span>
                                
                              </div>
                            )}
                            {isHoy && <span className="text-[9px] font-bold bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">hoy</span>}
                            {diasRestantes > 0 && <span className="text-[9px] font-bold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">{diasRestantes}d</span>}
                          </div>
                        )
                      })()}
                    </td>

                    {tab === 'Completadas' ? (
                    <td className="px-4 text-[11px] text-gray-500 whitespace-nowrap text-center">{fDate(t.fecha_finalizacion)}</td>
                    ) : (
                    <td className="px-3 text-center text-[11px] tabular-nums text-gray-500">{tEst?`${tEst}m`:'—'}</td>
                    )}
                    <td className="px-3 text-center text-[11px] tabular-nums text-gray-500">{tReal?`${tReal}m`:'—'}</td>

                    {tab !== 'Completadas' && (
                    <td className="px-3 text-center">
                      {dif!==null?(
                        <span className={`text-xs font-semibold tabular-nums ${dif>0?'text-red-400':dif<0?'text-emerald-500':'text-gray-400'}`}>
                          {dif>0?`+${dif}m`:dif<0?`${dif}m`:'='}
                        </span>
                      ):<span className="text-xs text-gray-200">—</span>}
                    </td>
                    )}

                    <td className="px-4 text-center">
                      {estC?(
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${estC.bg} ${estC.text}`}>{estadoVisual}</span>
                      ):<span className="text-xs text-gray-400">{estadoVisual}</span>}
                    </td>

                    <td className="px-3 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={()=>duplicateTask(t)} title="Duplicar" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        </button>
                        <button onClick={()=>openFragmentar(t)} title="Dividir tarea" className="divide-task-btn w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-50 transition">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="5" width="18" height="14" rx="2"/>
                            <path d="M12 5v14"/>
                            <path d="M8 9l-2 3 2 3"/>
                            <path d="M16 9l2 3-2 3"/>
                          </svg>
                        </button>

                        <button onClick={()=>openEdit(t)} title="Editar" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={()=>deleteTask(t.id)} title="Eliminar" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-200 hover:text-red-400 hover:bg-red-50 transition">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              })}
            </tbody>
          </table>
        </div>
        )}
      </> }
      </div>

      {unparkCasaDay && (
        <div
          className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget && !unparkCasaSaving) { setUnparkCasaDay(null); setUnparkSelected(new Set()); setUnparkDateEdits({}) } }}
        >
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] overflow-hidden shadow-2xl border border-gray-100 flex flex-col">
            <div className="flex items-start justify-between px-7 py-5 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Llevar a Plan del día</h2>
                <p className="text-xs text-gray-400 mt-1">
                  {unparkCasaDay === today ? 'Hoy' : fDate(unparkCasaDay)} · Salen de Casa y entran en Plan. Si el budget está fijado, Semana las sigue como estaban.
                </p>
              </div>
              <button
                onClick={() => { if (!unparkCasaSaving) { setUnparkCasaDay(null); setUnparkSelected(new Set()); setUnparkDateEdits({}) } }}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition text-gray-400"
              >✕</button>
            </div>
            <div className="px-7 py-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700">
                {unparkWillEnter.length} a Plan del día
              </span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${unparkWontEnter.length ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-400'}`}>
                {unparkWontEnter.length} no entran
              </span>
              <span className="text-xs text-gray-400">
                {unparkSelected.size} de {unparkCasaLeaves.length} seleccionadas
              </span>
            </div>
            <div className="px-7 py-4 overflow-y-auto space-y-5 flex-1">
              {unparkCasaLeaves.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-300">No quedan tareas en este día.</div>
              ) : (
                <>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Van a Plan del día</div>
                    {unparkWillEnter.length === 0 ? (
                      <div className="text-sm text-gray-300">Ninguna de las seleccionadas entra hoy.</div>
                    ) : (
                      <div className="space-y-1">
                        {unparkWillEnter.map(({ task, outcome }) => (
                          <label key={task.id} className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 py-2.5 cursor-pointer">
                            <input type="checkbox" checked={unparkSelected.has(task.id)} onChange={() => toggleUnparkSelected(task.id)} className="mt-1"/>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-gray-800 truncate">{task.tarea}</div>
                              <div className="text-[11px] text-emerald-700 mt-0.5">{outcome.reason} · {minToHM(task.tiempo_estimado || 0)}</div>
                            </div>
                            <button
                              type="button"
                              onClick={e => { e.preventDefault(); e.stopPropagation(); openEdit(task, { skipRetrasoConfirm: true }) }}
                              className="text-[11px] font-semibold text-gray-500 hover:text-gray-800"
                            >Abrir</button>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">No van a Plan del día</div>
                    {unparkWontEnter.length === 0 ? (
                      <div className="text-sm text-gray-300">Todas las seleccionadas entran en el plan.</div>
                    ) : (
                      <div className="space-y-2">
                        {unparkWontEnter.map(({ task, edited, outcome }) => (
                          <div key={task.id} className="rounded-xl border border-amber-100 bg-amber-50/30 px-3 py-3">
                            <label className="flex items-start gap-3 cursor-pointer">
                              <input type="checkbox" checked={unparkSelected.has(task.id)} onChange={() => toggleUnparkSelected(task.id)} className="mt-1"/>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-gray-800 truncate">{task.tarea}</div>
                                <div className="text-[11px] text-amber-700 mt-0.5">{outcome.reason}</div>
                              </div>
                              <button
                                type="button"
                                onClick={e => { e.preventDefault(); e.stopPropagation(); openEdit(task, { skipRetrasoConfirm: true }) }}
                                className="text-[11px] font-semibold text-gray-500 hover:text-gray-800"
                              >Abrir</button>
                            </label>
                            <div className="mt-3 ml-7 grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Deadline</span>
                                <input
                                  type="date"
                                  value={cleanDateValue(edited.deadline)}
                                  onChange={e => setUnparkTaskDates(task, { deadline: e.target.value })}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-gray-400"
                                />
                              </label>
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Fecha planificada</span>
                                <input
                                  type="date"
                                  value={cleanDateValue(edited.fecha_planificada)}
                                  onChange={e => setUnparkTaskDates(task, { fecha_planificada: e.target.value })}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-gray-400"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => setUnparkTaskDates(task, { fecha_planificada: today })}
                                className="text-[11px] font-semibold border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-white hover:text-gray-900"
                              >Hoy</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {unparkCasaItems.some(item => !item.selected) && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Sin seleccionar · se quedan solo en Casa</div>
                      <div className="space-y-1">
                        {unparkCasaItems.filter(item => !item.selected).map(({ task }) => (
                          <label key={task.id} className="flex items-start gap-3 rounded-xl border border-gray-100 px-3 py-2.5 cursor-pointer">
                            <input type="checkbox" checked={false} onChange={() => toggleUnparkSelected(task.id)} className="mt-1"/>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-500 truncate">{task.tarea}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-7 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <button
                onClick={() => { if (!unparkCasaSaving) { setUnparkCasaDay(null); setUnparkSelected(new Set()); setUnparkDateEdits({}) } }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition text-gray-600"
              >Cancelar</button>
              <button
                disabled={unparkCasaSaving || unparkSelected.size === 0}
                onClick={confirmUnparkCasa}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-700 rounded-lg text-sm font-semibold text-white transition disabled:opacity-40"
              >
                {unparkCasaSaving
                  ? 'Guardando...'
                  : `Guardar ${unparkSelected.size} · ${unparkWillEnter.length} a plan · ${unparkWontEnter.length} no`}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal&&(
        <div className="fixed inset-0 bg-black/25 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">{editId?'Editar tarea':'Nueva tarea'}</h2>
              <button onClick={()=>{setModal(false);setEditId(null);setRankOnCreate(false);setRoutineRepeat('no');setRoutineRepeatMonths(0);setRoutineRepeatWeekdays([])}} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition text-gray-400">✕</button>
            </div>
            <div className="px-7 py-6 grid grid-cols-2 gap-5">
              <Field label={isReunion(form.tipo) ? 'Nombre *' : 'Tarea *'} error={errors.tarea} full>
                <input value={form.tarea} onChange={e=>setForm({...form,tarea:e.target.value})} placeholder={isReunion(form.tipo) ? 'Budget Puma' : 'Ej: Fichar entrada'} className={inputCls(errors.tarea)}/>
                {isReunion(form.tipo) && (form.fecha_planificada || form.deadline) && form.tarea.trim() && (
                  <p className="text-[11px] text-gray-400 mt-1">Se guarda como {reunionTitle(form.tarea, form.fecha_planificada || form.deadline)}</p>
                )}
                {!editId && routineRepeat !== 'no' && isRoutineType(form.tipo) && form.tarea.trim() && (() => {
                  const first = routineRepeatDates({
                    from: form.fecha_solicitud || today,
                    months: Number(routineRepeatMonths) <= 0 ? 0 : Math.min(LAST_WORKDAY_ROUTINE_MONTHS, Number(routineRepeatMonths) || 1),
                    repeat: routineRepeat,
                    weekdays: routineRepeatWeekdays,
                  })[0]
                  if (!first) return null
                  return <p className="text-[11px] text-gray-400 mt-1">Se guarda como {datedRoutineTitle(form.tarea, first)}</p>
                })()}
              </Field>
              <Field label="Notas" full>
                <textarea value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} rows={3} placeholder="Observaciones opcionales..." className={`${inputCls()} min-h-[4.75rem] resize-y`}/>
              </Field>
              <Field label="Tipo *" error={errors.tipo}>
                <select
                  value={form.tipo}
                  onChange={e => {
                    const tipo = e.target.value
                    const meetingDate = form.fecha_planificada || form.deadline || form.fecha_solicitud || today
                    setRoutineRepeat(isRoutineType(tipo) ? routineRepeat : 'no')
                    setForm({
                      ...form,
                      tipo,
                      grupo: isEvento(tipo) ? form.grupo : '',
                      tiempo_estimado: isEvento(tipo) ? 0 : form.tiempo_estimado,
                      solicitado_por: isReunion(tipo) ? (form.solicitado_por || 'Teams') : form.solicitado_por,
                      fecha_solicitud: isReunion(tipo) ? (form.fecha_solicitud || meetingDate) : form.fecha_solicitud,
                      deadline: isReunion(tipo) ? (form.deadline || meetingDate) : form.deadline,
                      fecha_planificada: isReunion(tipo) ? (form.fecha_planificada || meetingDate) : form.fecha_planificada,
                    })
                  }}
                  className={selectCls(errors.tipo)}>
                  {(editId?TIPOS_ALL:TIPOS_FORM).map(t=><option key={t}>{t}</option>)}
                </select>
                {isEvento(form.tipo) && (
                  <p className="text-[11px] text-gray-400 mt-1">Recordatorio: 0 min, no ocupa carga. Pon plan o deadline; ese día sale en Plan. Si entonces es trabajo de verdad, cámbiala a OP/TA/ES y ponle minutos.</p>
                )}
                {isReunion(form.tipo) && (
                  <p className="text-[11px] text-gray-400 mt-1">Bloque de agenda: ocupa los minutos de la hora. Recalcular no la mueve. El nombre lleva la fecha para no mezclarse en Plan.</p>
                )}
              </Field>
              {isRoutineType(form.tipo) && (
                <Field label="Repetir" error={errors.routineRepeat} full>
                  <select
                    value={routineRepeat}
                    onChange={e => {
                      const next = e.target.value as RoutineRepeat
                      setRoutineRepeat(next)
                      if (next !== 'no' && !form.fecha_solicitud) setForm({ ...form, fecha_solicitud: today })
                    }}
                    className={selectCls(errors.routineRepeat)}>
                    {ROUTINE_REPEAT_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {routineRepeat === 'weekly' && (form.fecha_solicitud || form.fecha_planificada || today) && (
                    <p className="text-[11px] text-gray-400 mt-1">El mismo {weekdayNameEs(form.fecha_solicitud || form.fecha_planificada || today)} que la fecha. Ejemplo: todos los martes.</p>
                  )}
                  {routineRepeat === 'biweekly' && (form.fecha_solicitud || form.fecha_planificada || today) && (
                    <p className="text-[11px] text-gray-400 mt-1">El mismo {weekdayNameEs(form.fecha_solicitud || form.fecha_planificada || today)}, cada 2 semanas. Ejemplo: martes sí, martes no.</p>
                  )}
                  {routineRepeat === 'monthly' && (form.fecha_solicitud || form.fecha_planificada || today) && (
                    <p className="text-[11px] text-gray-400 mt-1">El mismo número de día cada mes, a partir de {fDate(form.fecha_solicitud || form.fecha_planificada || today)}.</p>
                  )}
                  {routineRepeat === 'weekdays' && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {WEEKDAY_CHIPS.map(chip => {
                        const active = routineRepeatWeekdays.includes(chip.day)
                        return (
                          <button
                            key={chip.day}
                            type="button"
                            onClick={() => setRoutineRepeatWeekdays(prev => active ? prev.filter(day => day !== chip.day) : [...prev, chip.day])}
                            className={`h-8 w-8 rounded-lg border text-xs font-bold ${active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:text-gray-800'}`}
                          >{chip.label}</button>
                        )
                      })}
                    </div>
                  )}
                  {editId && routineRepeat === 'no' && (
                    <p className="text-[11px] text-gray-400 mt-2">Esta no crea otra al completar u omitir. Elige una frecuencia solo si quieres que siga.</p>
                  )}
                  {editId && routineRepeat !== 'no' && (() => {
                    const from = form.fecha_planificada || form.deadline || form.fecha_solicitud || today
                    const next = routineRepeat === 'weekdays' && routineRepeatWeekdays.length === 0
                      ? null
                      : nextRoutineRepeatDate(from, routineRepeat, routineRepeatWeekdays)
                    return (
                      <p className="text-[11px] text-gray-400 mt-2">
                        {next
                          ? `Al completar u omitir se crea sola la siguiente, el ${fDate(next)}.`
                          : routineRepeat === 'weekdays' ? 'Elige al menos un día.' : 'Al completar u omitir se crea sola la siguiente.'}
                      </p>
                    )
                  })()}
                  {!editId && routineRepeat !== 'no' && (() => {
                    const months = Number(routineRepeatMonths) <= 0 ? 0 : Math.min(LAST_WORKDAY_ROUTINE_MONTHS, Number(routineRepeatMonths) || 1)
                    const dates = routineRepeatDates({
                      from: form.fecha_solicitud || today,
                      months,
                      repeat: routineRepeat,
                      weekdays: routineRepeatWeekdays,
                    })
                    return (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {[{ n: 0, label: 'Al completar' }, { n: 1, label: '1 mes' }, { n: 3, label: '3 meses' }, { n: 12, label: '12 meses' }, { n: 60, label: '5 años' }].map(chip => (
                            <button
                              key={chip.n}
                              type="button"
                              onClick={() => setRoutineRepeatMonths(chip.n)}
                              className={`text-[11px] px-2 py-1 rounded-lg border ${months === chip.n ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:text-gray-800'}`}
                            >{chip.label}</button>
                          ))}
                          {months > 0 && (
                            <>
                              <input
                                type="number"
                                min={1}
                                max={LAST_WORKDAY_ROUTINE_MONTHS}
                                value={months}
                                onChange={e => setRoutineRepeatMonths(Math.min(LAST_WORKDAY_ROUTINE_MONTHS, Math.max(1, parseInt(e.target.value) || 1)))}
                                className={`${inputCls()} w-20`}
                              />
                              <span className="text-xs text-gray-500">{months === 1 ? 'mes' : 'meses'}</span>
                            </>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {dates.length === 0
                            ? (routineRepeat === 'weekdays' ? 'Elige al menos un día.' : 'No pude calcular las fechas.')
                            : months === 0
                              ? `1 tarea el ${fDate(dates[0])}. Al completar u omitir se crea la siguiente, sin fecha de fin.`
                              : dates.length === 1
                                ? `1 tarea el ${fDate(dates[0])}. Al completar u omitir se crea la siguiente.`
                                : `${dates.length} tareas, de ${fDate(dates[0])} a ${fDate(dates[dates.length - 1])}. Al completar u omitir la última se crea la siguiente.`}
                          {' '}El nombre lleva la fecha; la importación no las pisa.
                        </p>
                      </div>
                    )
                  })()}
                </Field>
              )}
              {isEvento(form.tipo) && (
                <Field label="Categoría">
                  <input
                    list="grupos-recordatorio"
                    value={form.grupo || ''}
                    onChange={e => setForm({ ...form, grupo: e.target.value })}
                    placeholder="Ej: Convención Teamsports"
                    className={inputCls()}
                  />
                  <datalist id="grupos-recordatorio">
                    {reminderGroupOptions.map(name => <option key={name} value={name} />)}
                  </datalist>
                  <p className="text-[11px] text-gray-400 mt-1">Opcional. Agrupa avisos en Recordatorios y Priorizador. En Plan del día sale cada uno en su fecha.</p>
                </Field>
              )}
              <Field label="Estado *" error={errors.estado}>
                <select value={form.estado} onChange={e=>setForm({...form,estado:e.target.value})} className={selectCls(errors.estado)}>
                  {ESTADOS.map(e=><option key={e}>{e}</option>)}
                </select>
              </Field>
              <Field label="Prioridad *" error={errors.prioridad}>
                <select value={form.prioridad} onChange={e=>setForm({...form,prioridad:e.target.value})} className={selectCls(errors.prioridad)}>
                  {PRIORIDADES.map(p=><option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label={isReunion(form.tipo) ? 'Dónde *' : 'Solicitado por *'} error={errors.solicitado_por}>
                <input value={form.solicitado_por} onChange={e=>setForm({...form,solicitado_por:e.target.value})} placeholder={isReunion(form.tipo) ? 'Teams o Sala 3' : 'Nombre o equipo'} className={inputCls(errors.solicitado_por)}/>
              </Field>
              {!isEvento(form.tipo) && !isReunion(form.tipo) && (
              <Field label="Tiempo estimado (min.) *" error={errors.tiempo_estimado}>
                <input type="number" value={form.tiempo_estimado||''} onChange={e=>setForm({...form,tiempo_estimado:parseInt(e.target.value)||0})} placeholder="30" className={inputCls(errors.tiempo_estimado)}/>
              </Field>
              )}
              {isReunion(form.tipo) && (
                <>
                  <Field label="Hora inicio *">
                    <input type="time" value={meetingStart} onChange={e=>setMeetingStart(e.target.value)} className={inputCls()}/>
                  </Field>
                  <Field label="Hora fin *" error={errors.tiempo_estimado}>
                    <input type="time" value={meetingEnd} onChange={e=>setMeetingEnd(e.target.value)} className={inputCls(errors.tiempo_estimado)}/>
                    <p className="text-[11px] text-gray-400 mt-1">Duración: {minToHM(meetingMinutes(meetingStart, meetingEnd))}</p>
                  </Field>
                </>
              )}
              <Field label="Tiempo real (min.)">
                <input type="number" value={form.tiempo_real||''} onChange={e=>{const minutes=parseInt(e.target.value)||0;setForm({...form,tiempo_real:minutes,tiempo_real_segundos:minutes*60})}} placeholder="0" className={inputCls()}/>
              </Field>
              {editId&&(
                <Field label="Tiempo trabajado por día" full>
                  {displayTaskTimeLogs().length > 0 ? (
                    <div className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50/50">
                      <div className="px-3 py-2 flex items-center justify-between text-xs border-b border-gray-100 bg-white">
                        <span className="font-semibold text-gray-500">Total registrado</span>
                        <span className="font-bold text-gray-900">{secondsToDuration(displayTaskTimeLogs().reduce((s, log) => s + logSeconds(log), 0))}</span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {displayTaskTimeLogs().map(log => (
                          <div key={`${log.fecha}-${log.id || log.tarea_id}`} className="px-3 py-2 flex items-center justify-between text-xs">
                            <span className="text-gray-500">{fDate(log.fecha)}</span>
                            <span className="flex items-center gap-2"><span className={`text-[10px] font-semibold ${log.origen === 'ejecucion' ? 'text-blue-500' : log.origen === 'manual' ? 'text-gray-500' : 'text-gray-300'}`}>{log.origen === 'ejecucion' ? 'Ejecución' : log.origen === 'manual' ? 'Manual' : 'Histórico'}</span><span className="font-semibold text-gray-800">{secondsToDuration(logSeconds(log))}</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl px-3 py-3">
                      Todavía no hay tiempo registrado por día para esta tarea.
                    </div>
                  )}
                </Field>
              )}
              {!isReunion(form.tipo) && (
              <Field label="Fecha solicitud *" error={errors.fecha_solicitud}>
                <input type="date" value={form.fecha_solicitud} onChange={e=>setForm({...form,fecha_solicitud:e.target.value})} className={inputCls(errors.fecha_solicitud)}/>
              </Field>
              )}
              {!isReunion(form.tipo) && !(routineRepeat !== 'no' && isRoutineType(form.tipo) && !editId) && (
              <Field label="Deadline *" error={errors.deadline}>
                <input type="date" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})} className={inputCls(errors.deadline)}/>
              </Field>
              )}
              {!(routineRepeat !== 'no' && isRoutineType(form.tipo) && !editId) && (
              <Field label={isReunion(form.tipo) ? 'Fecha *' : 'Fecha planificada'} error={isReunion(form.tipo) ? errors.fecha_planificada || errors.deadline : undefined}>
                <input
                  type="date"
                  value={form.fecha_planificada || ''}
                  onChange={e=>setForm({
                    ...form,
                    fecha_planificada: e.target.value,
                    ...(isReunion(form.tipo) ? { deadline: e.target.value, fecha_solicitud: e.target.value || form.fecha_solicitud } : {}),
                  })}
                  className={inputCls(isReunion(form.tipo) ? errors.fecha_planificada || errors.deadline : undefined)}
                />
              </Field>
              )}
              {!(routineRepeat !== 'no' && isRoutineType(form.tipo) && !editId) && (
              <Field label="Carga del día">
                {(() => {
                  const summary = planDateCapacitySummary()
                  if (!summary) return <div className="rounded-lg border border-dashed border-gray-200 px-2.5 py-2 text-xs text-gray-300">Elige fecha planificada</div>
                  return (
                    <div className={`rounded-lg border px-2.5 py-2 text-xs ${summary.tone}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">Con esta tarea: {minToHM(summary.withCurrent)} / {minToHM(summary.capacity)}</span>
                        <span className="font-bold">{summary.pct === null ? 'Sin capacidad' : `${summary.pct}%`}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] opacity-80">
                        Ya había {minToHM(summary.alreadyPlanned)} · {summary.free < 0 ? `${minToHM(Math.abs(summary.free))} de exceso` : `${minToHM(summary.free)} libres`}
                      </div>
                    </div>
                  )
                })()}
              </Field>
              )}
              {isReunion(form.tipo) && !editId && (
                <>
                  <Field label="Repetir">
                    <select
                      value={meetingRepeat}
                      onChange={e => setMeetingRepeat(e.target.value as MeetingRepeat)}
                      className={selectCls()}>
                      <option value="no">No, solo esta</option>
                      <option value="daily">Cada día</option>
                      <option value="weekly">Cada semana</option>
                      <option value="monthly">Cada mes</option>
                    </select>
                    {meetingRepeat === 'weekly' && (form.fecha_planificada || form.deadline) && (
                      <p className="text-[11px] text-gray-400 mt-1">El mismo {weekdayNameEs(form.fecha_planificada || form.deadline)} que la fecha. Ejemplo: todos los viernes.</p>
                    )}
                  </Field>
                  {meetingRepeat !== 'no' && (
                    <Field label="Hasta *" error={errors.meetingUntil}>
                      <input type="date" value={meetingUntil} onChange={e=>setMeetingUntil(e.target.value)} className={inputCls(errors.meetingUntil)}/>
                      {(() => {
                        const start = form.fecha_planificada || form.deadline
                        if (!start || !meetingUntil) return null
                        const dates = meetingRepeatDates(start, meetingUntil, meetingRepeat)
                        const cadence = meetingRepeat === 'daily' ? 'cada día' : meetingRepeat === 'weekly' ? `cada ${weekdayNameEs(start)}` : 'cada mes'
                        return <p className="text-[11px] text-gray-400 mt-1">{dates.length} {dates.length === 1 ? 'reunión' : 'reuniones'} · {cadence}</p>
                      })()}
                    </Field>
                  )}
                </>
              )}
              {editId && (
                <Field label="Fuera de jornada">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer" onClick={()=>setForm({...form,para_casa:!form.para_casa,fecha_casa:!form.para_casa?(form.fecha_casa||today):form.fecha_casa})}>
                      <div className={`w-9 h-5 rounded-full transition-colors relative ${form.para_casa?'bg-gray-900':'bg-gray-200'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.para_casa?'left-4':'left-0.5'}`}></div>
                      </div>
                      <span className="text-sm text-gray-600">{form.para_casa?'Marcada fuera de jornada':'Dentro del circuito normal'}</span>
                    </label>
                    {form.para_casa && (
                      <input
                        type="date"
                        value={form.fecha_casa || today}
                        onChange={e=>setForm({...form,fecha_casa:e.target.value})}
                        className={inputCls()}
                      />
                    )}
                  </div>
                </Field>
              )}
              {editId && (
                <Field label="Por clasificar">
                  <label className="flex items-center gap-2 cursor-pointer" onClick={()=>setForm({...form,aparcada:!form.aparcada})}>
                    <div className={`w-9 h-5 rounded-full transition-colors relative ${form.aparcada?'bg-gray-900':'bg-gray-200'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.aparcada?'left-4':'left-0.5'}`}></div>
                    </div>
                    <span className="text-sm text-gray-600">{form.aparcada?'Aparcada, fuera del Plan y de Casa':'En el circuito normal'}</span>
                  </label>
                </Field>
              )}
            </div>
            <div className="flex justify-end gap-2 px-7 py-5 border-t border-gray-100">
              <button onClick={()=>{setModal(false);setEditId(null);setRankOnCreate(false);setRoutineRepeat('no');setRoutineRepeatMonths(0);setRoutineRepeatWeekdays([])}} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition text-gray-600">Cancelar</button>
              <button onClick={saveTask} disabled={saving} className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 transition">
                {saving ? 'Guardando...' : editId ? 'Guardar cambios' : (() => {
                  if (!(routineRepeat !== 'no' && isRoutineType(form.tipo))) return 'Crear tarea'
                  const n = routineRepeatDates({
                    from: form.fecha_solicitud || today,
                    months: Number(routineRepeatMonths) <= 0 ? 0 : Math.min(LAST_WORKDAY_ROUTINE_MONTHS, Number(routineRepeatMonths) || 1),
                    repeat: routineRepeat,
                    weekdays: routineRepeatWeekdays,
                  }).length
                  if (Number(routineRepeatMonths) <= 0) return 'Crear y repetir'
                  return n <= 1 ? 'Crear tarea' : `Crear ${n} tareas`
                })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {importModal&&(
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={e=>{if(e.target===e.currentTarget)setImportModal(false)}}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Importar tareas</h2>
              <button onClick={()=>setImportModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition text-gray-400">✕</button>
            </div>
            <div className="px-7 py-6 space-y-5">
              {!importResult?(
                <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition ${importing?'border-gray-200 bg-gray-50':'border-gray-200 hover:border-gray-400 hover:bg-gray-50'}`}>
                  {importing?(
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                      <span className="text-sm">Analizando archivo...</span>
                    </div>
                  ):(
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <span className="text-sm font-medium text-gray-600">Selecciona tu Excel o CSV</span>
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt" className="hidden" onChange={handleImport} disabled={importing}/>
                </label>
              ):(
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                      <div className="text-xl font-bold text-emerald-600">{importResult.added}</div>
                      <div className="text-xs text-emerald-600 mt-0.5">Añadidas</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                      <div className="text-xl font-bold text-gray-500">{importResult.skipped}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Sin cambios</div>
                    </div>
                    <div className={`border rounded-xl p-3 text-center ${importResult.duplicates.length>0?'bg-blue-50 border-blue-100':'bg-gray-50 border-gray-100'}`}>
                      <div className={`text-xl font-bold ${importResult.duplicates.length>0?'text-blue-600':'text-gray-400'}`}>{importResult.duplicates.length}</div>
                      <div className={`text-xs mt-0.5 ${importResult.duplicates.length>0?'text-blue-600':'text-gray-400'}`}>Duplicadas</div>
                    </div>
                  </div>
                  {importResult.errors.length>0&&(
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
                      <p className="text-xs font-semibold text-red-600 mb-1">{importResult.errors.length} error(es):</p>
                      {importResult.errors.map((e,i)=><p key={i} className="text-xs text-red-500">{e}</p>)}
                    </div>
                  )}
                  {importResult.duplicates.length>0&&(
                    <DuplicateConfirm tasks={importResult.duplicates} onConfirm={handleConfirmOverwrite} onAddAnyway={handleImportDuplicatesAnyway} deleting={deleting}/>
                  )}
                  <button onClick={()=>setImportResult(null)} className="w-full text-xs text-gray-500 hover:text-gray-700 border border-gray-200 py-2 rounded-lg hover:bg-gray-50 transition">
                    Importar otro archivo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {fragmentModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-xl border border-gray-100 shadow-2xl overflow-hidden">
            <div className="px-7 py-5 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Dividir tarea</h2>
                <p className="text-xs text-gray-400 mt-1 line-clamp-1">{fragmentModal.tarea}</p>
              </div>
              <button onClick={() => { setFragmentModal(null); setFragmentParts([]) }} className="text-gray-300 hover:text-gray-500 transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="p-7 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <Field label="Tiempo total">
                  <input
                    value={`${fragmentModal.tiempo_estimado || 0}m`}
                    disabled
                    className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500"
                  />
                </Field>

                <Field label="Máximo por parte">
                  <input
                    type="number"
                    value={fragmentSize}
                    onChange={e => updateFragmentSize(parseInt(e.target.value) || 90)}
                    className={inputCls()}
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-zinc-800">
                    Se crearán {fragmentParts.length} parte{fragmentParts.length === 1 ? '' : 's'}
                  </div>
                  <div className={`text-xs mt-0.5 ${fragmentPartsTotal === (fragmentModal.tiempo_estimado || 0) ? 'text-zinc-500' : 'text-red-400'}`}>
                    Suma partes: {minToHM(fragmentPartsTotal)} / {minToHM(fragmentModal.tiempo_estimado || 0)}
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/70 text-violet-500 flex items-center justify-center">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h6"/>
                    <path d="M14 7h6"/>
                    <path d="M4 17h6"/>
                    <path d="M14 17h6"/>
                    <path d="M10 7l4 10"/>
                    <path d="M14 7l-4 10"/>
                  </svg>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Partes y deadlines</div>
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {fragmentParts.map((part, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-700">Parte {i + 1}/{fragmentParts.length}</div>
                          <div className="text-xs text-gray-400 truncate">
                            {fragmentModal.tarea} · parte {i + 1}/{fragmentParts.length}
                          </div>
                        </div>
                        <button
                          onClick={() => setFragmentParts(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-300 hover:text-red-400 transition"
                          title="Quitar parte"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Minutos">
                          <input
                            type="number"
                            value={part.minutes}
                            onChange={e => updateFragmentPart(i, { minutes: parseInt(e.target.value) || 0 })}
                            className={inputCls()}
                          />
                        </Field>

                        <Field label="Deadline">
                          <input
                            type="date"
                            value={part.deadline}
                            onChange={e => updateFragmentPart(i, { deadline: e.target.value })}
                            className={inputCls()}
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setFragmentParts(prev => [...prev, { minutes: Math.max(1, fragmentSize || 90), deadline: fragmentModal.deadline || today }])}
                  className="mt-3 w-full border border-dashed border-gray-200 rounded-xl py-2 text-xs font-semibold text-gray-400 hover:text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition"
                >
                  + Añadir parte
                </button>
              </div>
            </div>

            <div className="px-7 py-5 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-2">
              <button
                onClick={() => { setFragmentModal(null); setFragmentParts([]) }}
                className="px-4 py-2 border border-gray-200 bg-white rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300 transition"
              >
                Cancelar
              </button>

              <button
                onClick={() => fragmentTask(fragmentModal)}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 transition disabled:opacity-40"
                disabled={fragmentParts.length === 0}
              >
                Dividir tarea
              </button>
            </div>
          </div>
        </div>
      )}

      {tiempoRealModal&&(
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={e=>{if(e.target===e.currentTarget)setTiempoRealModal(null)}}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100 p-7" onClick={e=>e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              {tiempoRealModal.action==='complete'?'¿Cuánto has tardado?':'¿Cuánto tiempo has dedicado?'}
            </h3>
            <p className="text-xs text-gray-400 mb-5 truncate">{tiempoRealModal.tarea.tarea}</p>
            <div className="flex items-center gap-3 mb-6">
              <input type="number" min="0" value={tiempoRealInput} onChange={e=>setTiempoRealInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')confirmTiempoReal()}} placeholder="minutos" autoFocus
                className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-gray-400 text-gray-800 placeholder:text-gray-300"/>
              <span className="text-sm text-gray-400">min</span>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setTiempoRealModal(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={confirmTiempoReal}
                disabled={tiempoRealModal.action==='complete'&&tiempoRealInput.trim()===''}
                className={`px-5 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-40 ${tiempoRealModal.action==='complete'?'bg-emerald-500 hover:bg-emerald-600':'bg-gray-700 hover:bg-gray-600'}`}>
                {tiempoRealModal.action==='complete'?'✓ Completar':'⏭ Omitir'}
              </button>
            </div>
          </div>
        </div>
      )}

      <RoutineSpawnNotice notice={spawnNotice} onAccept={() => setSpawnNotice(null)} />
    </main>
  )
}

function DuplicateConfirm({ tasks, onConfirm, onAddAnyway, deleting }: { tasks: any[], onConfirm: (items: any[]) => void, onAddAnyway: (items: any[]) => void, deleting: boolean }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    setSelected(new Set(tasks.map(t => t.id)))
  }, [tasks])

  const toggle = (id: number) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const selectedItems = tasks.filter(t => selected.has(t.id))
  const effectiveItems = selectedItems.length > 0 ? selectedItems : tasks

  return (
    <div className="border border-blue-100 bg-blue-50 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-blue-700">
        Estas tareas ya existen en la app. Elige si quieres sustituirlas o importarlas igualmente.
      </p>

      <div className="space-y-1 max-h-40 overflow-y-auto">
        {tasks.map(item => (
          <label key={item.id} className="flex items-center gap-2 cursor-pointer py-1 hover:bg-blue-100/50 px-1 rounded-lg">
            <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="rounded"/>
            <span className="text-xs text-gray-700 truncate">{shortTaskName(item.update?.tarea || item.tarea || '')}</span>
            <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{item.update?.tipo || item.tipo || ''}</span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => onAddAnyway(effectiveItems)}
          disabled={deleting}
          className="px-4 py-1.5 bg-white border border-blue-300 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 hover:border-blue-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="No sobrescribir: importar igualmente y mantener ambas"
        >
          {deleting ? 'Procesando...' : 'No, añadir igual'}
        </button>

        <button
          type="button"
          onClick={() => onConfirm(effectiveItems)}
          disabled={deleting}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#2563eb', color: '#ffffff', border: '1px solid #2563eb' }}
          title="Sí: sustituir la tarea existente por la del CSV"
        >
          {deleting ? 'Procesando...' : 'Sí, sobrescribir'}
        </button>
      </div>
    </div>
  )
}
