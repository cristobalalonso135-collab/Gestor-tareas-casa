import { supabase } from './supabase'
import { CAPACITY_KEY, CASA_CAPACITY_OVERRIDES_KEY, LOCKED_TASKS_KEY } from './taskRules'

const TABLE = 'app_ajustes'

export const CAPACITY_UPDATED_EVENT = 'gestor-capacity-updated'
export const CASA_CAPACITY_UPDATED_EVENT = 'gestor-casa-capacity-updated'
export const LOCKS_UPDATED_EVENT = 'gestor-locks-updated'

function readLocal<T>(clave: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(clave)
    if (raw == null || raw === '') return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeLocal<T>(clave: string, valor: T) {
  if (typeof window === 'undefined') return
  localStorage.setItem(clave, JSON.stringify(valor))
}

function notifySetting(clave: string) {
  if (typeof window === 'undefined') return
  if (clave === CAPACITY_KEY) window.dispatchEvent(new CustomEvent(CAPACITY_UPDATED_EVENT))
  if (clave === CASA_CAPACITY_OVERRIDES_KEY) window.dispatchEvent(new CustomEvent(CASA_CAPACITY_UPDATED_EVENT))
  if (clave === LOCKED_TASKS_KEY) window.dispatchEvent(new CustomEvent(LOCKS_UPDATED_EVENT))
}

export function readLocalSetting<T>(clave: string, fallback: T): T {
  return readLocal(clave, fallback)
}

export async function loadAppSetting<T>(clave: string, fallback: T): Promise<T> {
  const local = readLocal(clave, fallback)
  const { data, error } = await supabase.from(TABLE).select('valor').eq('clave', clave).maybeSingle()
  if (error) {
    console.warn('No se pudo leer ajuste', clave, error.message)
    return local
  }
  if (data?.valor == null) {
    if (JSON.stringify(local) !== JSON.stringify(fallback)) {
      await saveAppSetting(clave, local, { skipLocal: true, skipNotify: true })
    }
    return local
  }
  writeLocal(clave, data.valor)
  notifySetting(clave)
  return data.valor as T
}

export async function saveAppSetting<T>(
  clave: string,
  valor: T,
  options: { skipLocal?: boolean, skipNotify?: boolean } = {}
): Promise<void> {
  if (!options.skipLocal) writeLocal(clave, valor)
  if (!options.skipNotify) notifySetting(clave)
  const { error } = await supabase.from(TABLE).upsert(
    { clave, valor, updated_at: new Date().toISOString() },
    { onConflict: 'clave' }
  )
  if (error) console.warn('No se pudo guardar ajuste', clave, error.message)
}
