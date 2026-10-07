import { isRoutineType } from '@/lib/taskRules'

type RoutineTask = {
  id: number
  tipo: string
  tarea: string
  orden?: number | null
}

export type RoutineBlockKey = 'rutina-primaria' | 'rutina-secundaria' | 'rutina-terciaria' | 'rutina-ultimas'

export type RoutineBlockInfo = {
  key: RoutineBlockKey
  label: string
  order: number
}

const ROUTINE_BLOCKS = [
  {
    key: 'rutina-primaria',
    label: 'Primarias',
    names: [
      'fichar entrada',
      'revisar calendario',
      'gestionar el correo inicio jornada',
      'gestionar el teams inicio jornada',
      'revisar plan del dia trabajo casa',
      'revisar el live',
      'control genweb',
      'revisar entrada de albaranes',
      'actualizar units nike contract',
      'plan del dia de carlos',
    ],
  },
  {
    key: 'rutina-secundaria',
    label: 'Secundarias',
    names: [
      'gestionar el correo media manana',
      'gestionar el teams media manana',
    ],
  },
  {
    key: 'rutina-terciaria',
    label: 'Terciarias',
    names: [
      'revisar semana calendario',
      'actualizar deuda enviar excel',
      'actualizar pipedrive pipedrive francia guardar datos',
      'actualizar informe comparativo crm',
      'preparar reunion board',
      'actualizar abonos',
      'actualizar control reposiciones guardar datos',
      'revisar el impacto de producto en el margen',
      'actualizar crm vs erp enviar excel',
      'actualizar perso externa',
      'actualizar ordenes de fabricacion personalizacion avanzado',
      'actualizar colectivos bloqueados',
      'actualizar puma',
      'actualizar referencias criticas',
      'actualizar eficacia reservas',
      'actualizar ob',
      'borrar albaranes web y eqi en proceso',
      'modificar pricelist eficacia reservas',
      'actualizar unificado',
      'actualizar seguimiento de kpis',
      'datos adidas',
      'datos puma',
      'actualizar nike',
      'aneyron tpt actualizar',
      'limite genweb',
      'actualizar retraso cliente',
      'actualizar customer',
      'mandar domeque excel',
      'definir negativos a imputar',
      'budget ts revisar mensualmente',
      'subir budget de facturacion y cogs a pbi',
      'comprobar budget se y ekin',
      'ordenar escritorio pc',
      'albaranes internet b2c',
      'revisar budget de spoma',
      'meter los documentos en el pen',
      'revisar vacaciones operaciones y producto',
      'revisar gastos t e',
      'pedir a e navarro el pbix',
      'seguimiento promocion',
      'hacer la hoja de tareas rutinarias',
    ],
  },
  {
    key: 'rutina-ultimas',
    label: 'Últimas',
    names: [
      'gestionar el correo cierre jornada',
      'gestionar el teams cierre jornada',
      'mensaje teams',
      'fichar salida',
    ],
  },
] as const

function normalizeRoutineText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ROUTINE_MATCHERS = ROUTINE_BLOCKS.flatMap((block, blockIndex) =>
  block.names.map((name, order) => ({
    key: block.key,
    label: block.label,
    blockIndex,
    order,
    normalized: normalizeRoutineText(name),
  }))
).sort((a, b) => b.normalized.length - a.normalized.length)

export function routineGroupRank(key?: string | null) {
  const index = ROUTINE_BLOCKS.findIndex(block => block.key === key)
  return index < 0 ? ROUTINE_BLOCKS.length : index
}

export function routineBlockForTask(task: RoutineTask): RoutineBlockInfo | null {
  if (!isRoutineType(task.tipo)) return null
  const normalized = normalizeRoutineText(task.tarea)
  const match = ROUTINE_MATCHERS.find(item => normalized.startsWith(item.normalized))
  if (!match) return null
  return { key: match.key, label: match.label, order: match.blockIndex * 100 + match.order }
}

export function routinePlanSort<T extends RoutineTask>(a: T, b: T): number {
  const ai = routineBlockForTask(a)
  const bi = routineBlockForTask(b)
  if (ai && bi) {
    if (ai.order !== bi.order) return ai.order - bi.order
    return (a.orden || 0) - (b.orden || 0) || a.id - b.id
  }
  if (ai) return -1
  if (bi) return 1
  return (a.orden || 0) - (b.orden || 0) || a.id - b.id
}

export function groupTasksByRoutine<T extends RoutineTask>(tasks: T[]) {
  const sections: Array<{ key: string; label: string; tasks: T[] }> = []
  for (const task of tasks) {
    const info = routineBlockForTask(task)
    const key = info?.key || 'resto'
    const label = info?.label || 'Resto de tareas'
    let section = sections.find(item => item.key === key)
    if (!section) {
      section = { key, label, tasks: [] }
      sections.push(section)
    }
    section.tasks.push(task)
  }
  return sections
    .filter(section => section.tasks.length > 0)
    .sort((a, b) => routineGroupRank(a.key) - routineGroupRank(b.key))
}
