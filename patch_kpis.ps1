$path = "app\page.tsx"
$content = [System.IO.File]::ReadAllText((Resolve-Path $path).Path, [System.Text.UTF8Encoding]::new($false))

# Reemplazar el bloque de KPI 3 (Ritmo) + KPI 4 (Llegas?)
$old = @'
        {(() => {
          const ritmo = tEstHecho > 0 && cronoMin > 0 ? Math.round((tEstHecho / cronoMin) * 100) : null
          const ritmoLabel = ritmo === null ? '—' : `${ritmo}%`
          const ritmoGood = ritmo !== null && ritmo >= 100
          return (
            <div className={`border rounded-xl p-5 transition ${ritmo === null ? 'border-gray-100' : ritmoGood ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-amber-50'}`}>
              <div className={`text-2xl font-bold mb-1 ${ritmo === null ? 'text-gray-900' : ritmoGood ? 'text-emerald-600' : 'text-amber-600'}`}>{ritmoLabel}</div>
              <div className="text-sm font-semibold text-gray-700 mb-0.5">Ritmo</div>
              <div className="text-xs text-gray-400">
                {ritmo === null ? 'Inicia el cronómetro' : ritmoGood ? 'Vas más rápido que lo estimado' : 'Vas más lento que lo estimado'}
              </div>
            </div>
          )
        })()}

        <div className={`border rounded-xl p-5 transition ${gap >= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
          <div className={`text-2xl font-bold mb-1 ${gap >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {gap >= 0 ? `+${minToHM(gap)}` : `-${minToHM(Math.abs(gap))}`}
          </div>
          <div className="text-sm font-semibold text-gray-700 mb-0.5">
            {gap >= 0 ? '✓ Llegas' : '⚠ No llegas'}
          </div>
          <div className="text-xs text-gray-400">
            {gap >= 0 ? `Te sobran ${minToHM(gap)} sobre lo pendiente` : `Te faltan ${minToHM(Math.abs(gap))} para completar el plan`}
          </div>
        </div>
'@

$new = @'
        {/* KPI 3 - Rendimiento (estimado vs real de completadas) */}
        {(() => {
          const tRealHecho = filtered.filter((t: any) => t.done || t.estado === 'Completada').reduce((s: number, t: any) => s + (t.tiempo_real || 0), 0)
          const variacion = tEstHecho > 0 ? tRealHecho - tEstHecho : null
          const noData = tEstHecho === 0
          const good = variacion !== null && variacion <= 0
          return (
            <div className={`border rounded-xl p-5 transition ${noData ? 'border-gray-100' : good ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-amber-50'}`}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`text-2xl font-bold ${noData ? 'text-gray-300' : good ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {noData ? '—' : (variacion! >= 0 ? '+' : '') + minToHM(Math.abs(variacion!)) + (variacion! < 0 ? '' : '')}
                </span>
              </div>
              <div className="text-sm font-semibold text-gray-700 mb-0.5">Rendimiento</div>
              <div className="text-xs text-gray-400">
                {noData ? 'Completa tareas para ver datos'
                  : `Est: ${minToHM(tEstHecho)} · Real: ${minToHM(tRealHecho)}`}
              </div>
            </div>
          )
        })()}

        {/* KPI 4 - ¿Llegas? */}
        {(() => {
          const restanteJornada = Math.max(0, previsionMin - cronoMin)
          const gap2 = restanteJornada - tEstPendiente
          const llegas = gap2 >= 0
          // Desviacion fichado vs real trabajado
          const tRealHecho = filtered.filter((t: any) => t.done || t.estado === 'Completada').reduce((s: number, t: any) => s + (t.tiempo_real || 0), 0)
          const desviacion = cronoMin - tRealHecho
          return (
            <div className={`border rounded-xl p-5 transition ${llegas ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
              <div className={`text-2xl font-bold mb-1 ${llegas ? 'text-emerald-600' : 'text-red-500'}`}>
                {llegas ? `+${minToHM(gap2)}` : `-${minToHM(Math.abs(gap2))}`}
              </div>
              <div className="text-sm font-semibold text-gray-700 mb-0.5">
                {llegas ? '✓ Llegas' : '⚠ No llegas'}
              </div>
              <div className="text-xs text-gray-400 leading-snug">
                Quedan {minToHM(restanteJornada)} · Pendiente {minToHM(tEstPendiente)}
                {cronoMin > 0 && tRealHecho > 0 && (
                  <span className="block text-[10px] text-gray-300 mt-0.5">
                    Fichado vs real tareas: {desviacion >= 0 ? '+' : ''}{minToHM(Math.abs(desviacion))}
                  </span>
                )}
              </div>
            </div>
          )
        })()}
'@

if ($content.Contains($old)) {
  $content = $content.Replace($old, $new)
  Write-Host "KPIs 3 y 4 reemplazados correctamente"
} else {
  Write-Host "AVISO: bloque no encontrado tal cual. Revisa manualmente."
}

[System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Listo."
