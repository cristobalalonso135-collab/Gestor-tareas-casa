'use client'

import { fDate } from '@/lib/taskRules'
import type { SpawnRepeatNotice } from '@/lib/spawnRepeatingRoutine'

export default function RoutineSpawnNotice({
  notice,
  onAccept,
}: {
  notice: SpawnRepeatNotice | null
  onAccept: () => void
}) {
  if (!notice) return null
  const created = notice.status === 'created'
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-7 shadow-2xl">
        <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-lg font-semibold ${created ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-500'}`}>
          ↻
        </div>
        <h3 className="text-base font-semibold text-gray-900">
          {created ? 'Siguiente rutinaria creada' : 'La siguiente ya estaba creada'}
        </h3>
        <p className="mt-2 text-sm leading-5 text-gray-500">
          {created
            ? (notice.count || 1) > 1
              ? `Al completar u omitir esta, se han creado ${notice.count} fechas: las que faltaban y la de ahora.`
              : 'Al completar u omitir esta, se ha creado sola la siguiente.'
            : 'Esta ya tenía la siguiente en lista. No he duplicado.'}
        </p>
        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <div className="text-sm font-semibold text-gray-900">{notice.title}</div>
          <div className="mt-1 text-xs text-gray-400">{notice.cadence} · {fDate(notice.date)}</div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            autoFocus
            onClick={onAccept}
            className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition">
            Aceptar
          </button>
        </div>
      </div>
    </div>
  )
}
