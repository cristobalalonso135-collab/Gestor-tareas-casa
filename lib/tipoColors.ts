/** Paleta de la app, en este orden:
 *
 * Semáforo (nunca en tipos de tarea):
 *  verde   = bien: cabe, hecha, poca carga, día holgado
 *  ámbar   = aviso: justo de capacidad
 *  rojo    = mal: exceso, retraso, vencida
 *
 * Neutros:
 *  blanco/negro = interfaz
 *  zinc         = rutinarias (no son trabajo elegido)
 *
 * Tipos (un hue cada uno, chips claros + texto oscuro):
 *  cyan    = Operativa  — ejecución del día, corta y concreta
 *  violeta = Táctica    — juicio, capa media
 *  naranja = Estratégica — las grandes; no puede parecer "bien"
 *  rosa    = Recordatorio — aviso / cita, 0 minutos
 *  fucsia  = Reunión      — bloque de agenda; no se pega a Operativa ni a Recordatorio
 *
 * Candado / No mover:
 *  marrón (yellow-900 / stone) = ancla. Título y reborde suaves.
 *  No es tipo, semáforo ni Casa (slate).
 * Padre / partes: chevron de desplegable, sin color de reborde.
 */
export const TIPO_DOT: Record<string, string> = {
  Diaria: 'bg-zinc-300',
  Bisemanal: 'bg-zinc-400',
  Semanal: 'bg-zinc-500',
  Bimensual: 'bg-zinc-600',
  Mensual: 'bg-zinc-700',
  Operativa: 'bg-cyan-500',
  Táctica: 'bg-violet-500',
  Estratégica: 'bg-orange-500',
  Recordatorio: 'bg-rose-500',
  Evento: 'bg-rose-500',
  Reunión: 'bg-fuchsia-500',
}

export const TIPO_CHIP: Record<string, { bg: string, text: string, dot: string }> = {
  Diaria: { bg: 'bg-zinc-100', text: 'text-zinc-500', dot: 'bg-zinc-300' },
  Bisemanal: { bg: 'bg-zinc-100', text: 'text-zinc-600', dot: 'bg-zinc-400' },
  Semanal: { bg: 'bg-zinc-100', text: 'text-zinc-600', dot: 'bg-zinc-500' },
  Bimensual: { bg: 'bg-zinc-100', text: 'text-zinc-700', dot: 'bg-zinc-600' },
  Mensual: { bg: 'bg-zinc-100', text: 'text-zinc-800', dot: 'bg-zinc-700' },
  Operativa: { bg: 'bg-cyan-50', text: 'text-cyan-800', dot: 'bg-cyan-500' },
  Táctica: { bg: 'bg-violet-50', text: 'text-violet-800', dot: 'bg-violet-500' },
  Estratégica: { bg: 'bg-orange-50', text: 'text-orange-800', dot: 'bg-orange-500' },
  Recordatorio: { bg: 'bg-rose-50', text: 'text-rose-800', dot: 'bg-rose-500' },
  Evento: { bg: 'bg-rose-50', text: 'text-rose-800', dot: 'bg-rose-500' },
  Reunión: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-800', dot: 'bg-fuchsia-500' },
}

export const TIPO_TEXT: Record<string, string> = {
  Diaria: 'text-zinc-500',
  Bisemanal: 'text-zinc-500',
  Semanal: 'text-zinc-600',
  Bimensual: 'text-zinc-700',
  Mensual: 'text-zinc-800',
  Operativa: 'text-cyan-700',
  Táctica: 'text-violet-700',
  Estratégica: 'text-orange-700',
  Recordatorio: 'text-rose-700',
  Evento: 'text-rose-700',
  Reunión: 'text-fuchsia-700',
}

export const TIPO_BAR: Record<string, { bar: string, text: string }> = {
  Operativa: { bar: 'bg-cyan-500', text: 'text-cyan-600' },
  Táctica: { bar: 'bg-violet-500', text: 'text-violet-600' },
  Estratégica: { bar: 'bg-orange-500', text: 'text-orange-600' },
  Recordatorio: { bar: 'bg-rose-500', text: 'text-rose-600' },
  Evento: { bar: 'bg-rose-500', text: 'text-rose-600' },
  Reunión: { bar: 'bg-fuchsia-500', text: 'text-fuchsia-600' },
}

export const LOCK_CHIP = 'border-yellow-800/40 bg-stone-100 text-yellow-900'
export const LOCK_ROW = 'border-yellow-800/25 bg-stone-50/80'
export const LOCK_TITLE = 'text-yellow-900'
