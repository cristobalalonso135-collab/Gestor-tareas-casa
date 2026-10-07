import { supabase } from './supabase'

const PAGE_SIZE = 1000

export async function fetchAllTareas<T = any>(
  select = '*',
  configure?: (query: any) => any
): Promise<T[]> {
  const rows: T[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    let query = supabase.from('tareas').select(select)
    if (configure) query = configure(query)

    const { data, error } = await query.range(from, to)
    if (error) throw error

    const page = (data || []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}
