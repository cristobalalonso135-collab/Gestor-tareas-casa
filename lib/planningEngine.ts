import { addDays, canonicalTipo, dateKey, defaultWorkCapacity, effectiveDate, isAparcada, isImportedRoutine, isRoutineType, planningDate, tipoIn } from './taskRules'

export type PlanningTask = {
  id: number
  tipo: string
  tarea: string
  tiempo_estimado: number
  deadline: string | null
  fecha_planificada?: string | null
  prioridad_orden?: number | null
  para_casa?: boolean | null
  fecha_casa?: string | null
  excluir_plan?: boolean | null
  excluida_fecha?: string | null
  parent_id?: number | null
  fragmento_num?: number | null
  es_fragmento?: boolean | null
}

export type PlanningProposalRow = {
  id: number
  tipo: string
  tarea: string
  rank: number
  minutes: number
  route: 'Trabajo' | 'Casa'
  from: string | null
  to: string | null
  delta: number | null
  saturation: number | null
}

type ScheduleGroup = {
  task: PlanningTask
  tasks: PlanningTask[]
  locked: boolean
  date: string | null
}

type BuildPlanningProposalOptions = {
  tasks: PlanningTask[]
  lockedIds: Set<number>
  today?: Date
  workTypes?: string[]
  capacityForDate?: (date: string) => number
  futureRoutineReserveMinutes?: number
  horizonDays?: number
  dateOf?: (task: PlanningTask) => string | null
  excludeCasa?: boolean
}

function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  return Math.floor((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000)
}

function orderedCandidatesByType(type: string, source: PlanningTask[]): PlanningTask[] {
  return source
    .filter(t => canonicalTipo(t.tipo) === canonicalTipo(type) && t.prioridad_orden != null)
    .sort((a, b) => {
      const ao = a.prioridad_orden ?? 999999
      const bo = b.prioridad_orden ?? 999999
      if (ao !== bo) return ao - bo
      const dateCompare = effectiveDate(a).localeCompare(effectiveDate(b))
      return dateCompare !== 0 ? dateCompare : a.id - b.id
    })
}

function isFragmentTask(task: PlanningTask) {
  return task.es_fragmento === true && !!task.parent_id
}

function isFutureMonth(date: string, today: Date) {
  const d = new Date(`${date}T00:00:00`)
  return d.getFullYear() > today.getFullYear() || (d.getFullYear() === today.getFullYear() && d.getMonth() > today.getMonth())
}

export function buildPlanningProposal({
  tasks,
  lockedIds,
  today = new Date(),
  workTypes = ['Operativa', 'T\u00e1ctica', 'Estrat\u00e9gica'],
  capacityForDate = date => defaultWorkCapacity(new Date(`${date}T00:00:00`)),
  futureRoutineReserveMinutes = 120,
  horizonDays = 370,
  dateOf = planningDate,
  excludeCasa = true,
}: BuildPlanningProposalOptions): PlanningProposalRow[] {
  const start = addDays(today, 1)
  const startKey = dateKey(start)
  const schedulableTasks = tasks.filter(t => (excludeCasa ? t.para_casa !== true : true) && !isAparcada(t))
  const proposalRankById: Record<number, number> = {}

  workTypes.forEach(type => {
    orderedCandidatesByType(type, schedulableTasks).forEach((task, index) => {
      proposalRankById[task.id] = index + 1
    })
  })

  const fixedByDate: Record<string, number> = {}
  const routineByDate: Record<string, number> = {}

  // Types not in workTypes keep their date and occupy the day. Recalc Táctica does not pile onto Operativa.
  schedulableTasks
    .filter(t => isRoutineType(t.tipo) || lockedIds.has(t.id) || !tipoIn(t.tipo, workTypes))
    .forEach(t => {
      const date = dateOf(t)
      if (!date) return
      const minutes = t.tiempo_estimado || 0
      fixedByDate[date] = (fixedByDate[date] || 0) + minutes
      if (isImportedRoutine(t)) routineByDate[date] = (routineByDate[date] || 0) + minutes
    })

  for (let i = 0; i < horizonDays; i += 1) {
    const date = dateKey(addDays(start, i))
    const capacity = capacityForDate(date)
    if (capacity <= 0 || !isFutureMonth(date, today) || (routineByDate[date] || 0) > 0) continue
    fixedByDate[date] = (fixedByDate[date] || 0) + Math.min(capacity, Math.max(0, futureRoutineReserveMinutes))
  }

  const plannedRows: PlanningProposalRow[] = []
  const plannedByDate: Record<string, number> = {}
  const scheduledIds = new Set<number>()

  function constraintDate(task: PlanningTask): string | null {
    return dateOf(task)
  }

  function nextCapacityDate(from: string) {
    let cursor = from
    for (let i = 0; i < horizonDays; i += 1) {
      if (capacityForDate(cursor) > 0) return cursor
      cursor = dateKey(addDays(new Date(`${cursor}T00:00:00`), 1))
    }
    return from
  }

  function unitTasksFor(task: PlanningTask, ordered: PlanningTask[], includeLocked = false) {
    if (!isFragmentTask(task)) return [task]
    const parentId = task.parent_id
    return ordered
      .filter(candidate => candidate.parent_id === parentId && (includeLocked || !lockedIds.has(candidate.id)))
      .sort((a, b) => {
        const an = a.fragmento_num ?? 999999
        const bn = b.fragmento_num ?? 999999
        if (an !== bn) return an - bn
        const ar = a.prioridad_orden ?? 999999
        const br = b.prioridad_orden ?? 999999
        return ar !== br ? ar - br : a.id - b.id
      })
  }

  function remainingOn(date: string) {
    return capacityForDate(date) - ((fixedByDate[date] || 0) + (plannedByDate[date] || 0))
  }

  function nextFitDate(from: string, maxDate: string | null, minutes = 1) {
    let cursor = nextCapacityDate(from < startKey ? startKey : from)
    // Si ya nos pasamos del ancla, no abrir el horizonte: quédate en el tope.
    if (maxDate && cursor > maxDate) return maxDate
    const hardEnd = maxDate || dateKey(addDays(start, horizonDays))
    let overflowDate = cursor
    for (let i = 0; i < horizonDays * 2 && cursor <= hardEnd; i += 1) {
      if (capacityForDate(cursor) > 0) {
        overflowDate = cursor
        // 0 min (Recordatorio): cabe en cualquier día laborable, aunque el día esté lleno de trabajo.
        if (minutes <= 0 || remainingOn(cursor) > 0) return cursor
      }
      cursor = dateKey(addDays(new Date(`${cursor}T00:00:00`), 1))
    }
    return overflowDate
  }

  function placeTask(task: PlanningTask, date: string, capacity: number, baseUsed: number) {
    const minutes = task.tiempo_estimado || 0
    plannedByDate[date] = (plannedByDate[date] || 0) + minutes
    plannedRows.push({
      id: task.id,
      tipo: task.tipo,
      tarea: task.tarea,
      rank: proposalRankById[task.id] || 0,
      minutes,
      route: excludeCasa ? 'Trabajo' : 'Casa',
      from: dateOf(task),
      to: date,
      delta: daysBetween(dateOf(task), date),
      saturation: capacity > 0 ? Math.round(((baseUsed + (plannedByDate[date] || 0)) / capacity) * 100) : null,
    })
  }

  function scheduleType(type: string) {
    const ordered = orderedCandidatesByType(type, schedulableTasks)
    const seenParents = new Set<number>()

    const groups: ScheduleGroup[] = []
    ordered.forEach(task => {
      if (scheduledIds.has(task.id)) return
      if (isFragmentTask(task) && task.parent_id) {
        if (seenParents.has(task.parent_id)) return
        seenParents.add(task.parent_id)
      }
      const allTasksForGroup = unitTasksFor(task, ordered, true)
      const locked = allTasksForGroup.some(part => lockedIds.has(part.id))
      const tasksForGroup = locked ? allTasksForGroup : allTasksForGroup.filter(part => !lockedIds.has(part.id))
      if (tasksForGroup.length === 0) return
      groups.push({
        task,
        tasks: tasksForGroup,
        locked,
        date: constraintDate(task),
      })
    })

    let segmentStart = startKey
    let segment: ScheduleGroup[] = []

    function scheduleSegment(items: ScheduleGroup[], minDate: string, maxDate: string | null) {
      if (items.length === 0) return
      let cursor = minDate < startKey ? startKey : minDate
      items.forEach(item => {
        item.tasks.forEach(part => {
          const minutes = part.tiempo_estimado || 0
          const date = nextFitDate(cursor, maxDate, minutes)
          scheduledIds.add(part.id)
          placeTask(part, date, capacityForDate(date), fixedByDate[date] || 0)
          // Sin minutos no rellenan el día: un aviso por jornada, luego el siguiente.
          const stayOnDay = minutes > 0 && remainingOn(date) > 0
          let next = stayOnDay ? date : dateKey(addDays(new Date(`${date}T00:00:00`), 1))
          if (maxDate && next > maxDate) next = maxDate
          cursor = next
        })
      })
    }

    groups.forEach(group => {
      if (!group.locked) {
        segment.push(group)
        return
      }

      const lockDate = group.date
      const segmentEnd = lockDate && lockDate < startKey ? segmentStart : lockDate
      scheduleSegment(segment, segmentStart, segmentEnd)
      segment = []
      group.tasks.forEach(part => scheduledIds.add(part.id))
      if (lockDate && lockDate > segmentStart) segmentStart = lockDate
    })

    scheduleSegment(segment, segmentStart, null)
  }

  workTypes.forEach(type => scheduleType(type))

  const unscheduled = workTypes
    .flatMap(type => orderedCandidatesByType(type, schedulableTasks).filter(task => !scheduledIds.has(task.id) && !lockedIds.has(task.id)))
    .map(t => ({
      id: t.id,
      tipo: t.tipo,
      tarea: t.tarea,
      rank: proposalRankById[t.id] || 0,
      minutes: t.tiempo_estimado || 0,
      route: excludeCasa ? 'Trabajo' as const : 'Casa' as const,
      from: dateOf(t),
      to: null,
      delta: null,
      saturation: null,
    }))

  return [...plannedRows, ...unscheduled]
}
