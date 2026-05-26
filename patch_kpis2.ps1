$path = "app\page.tsx"
$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $path).Path)
$content = [System.Text.Encoding]::UTF8.GetString($bytes)

$changed = $false

# 1. Add tRealHecho variable after tEstHecho line
$oldVars = "  const tEstHecho = filtered.filter((t: any) => t.done || t.estado === 'Completada').reduce((s: number, t: any) => s + (t.tiempo_estimado || 0), 0)"
$newVars = "  const tEstHecho = filtered.filter((t: any) => t.done || t.estado === 'Completada').reduce((s: number, t: any) => s + (t.tiempo_estimado || 0), 0)
  const tRealHecho = filtered.filter((t: any) => t.done || t.estado === 'Completada').reduce((s: number, t: any) => s + (t.tiempo_real || 0), 0)"

if ($content.Contains($oldVars) -and -not $content.Contains("tRealHecho")) {
  $content = $content.Replace($oldVars, $newVars)
  $changed = $true
  Write-Host "Variable tRealHecho añadida"
}

# 2. Replace KPI 3 (Ritmo) with Rendimiento
$oldKpi3 = @"
        {(() => {
          const ritmo = tEstHecho > 0 && cronoMin > 0 ? Math.round((tEstHecho / cronoMin) * 100) : null
          const ritmoLabel = ritmo === null ? '—' : ``${ritmo}%``
          const ritmoGood = ritmo !== null && ritmo >= 100
          return (
            <div className={``border rounded-xl p-5 transition ${ritmo === null ? 'border-gray-100' : ritmoGood ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-amber-50'}``}>
              <div className={``text-2xl font-bold mb-1 ${ritmo === null ? 'text-gray-900' : ritmoGood ? 'text-emerald-600' : 'text-amber-600'}``}>{ritmoLabel}</div>
              <div className="text-sm font-semibold text-gray-700 mb-0.5">Ritmo</div>
              <div className="text-xs text-gray-400">
                {ritmo === null ? 'Inicia el cronómetro' : ritmoGood ? 'Vas más rápido que lo estimado' : 'Vas más lento que lo estimado'}
              </div>
            </div>
          )
        })()}
"@

$newKpi3 = @"
        {(() => {
          const variacion = tEstHecho > 0 ? tRealHecho - tEstHecho : null
          const sinDatos = tEstHecho === 0
          const rendBien = variacion !== null && variacion <= 0
          return (
            <div className={``border rounded-xl p-5 transition ${sinDatos ? 'border-gray-100' : rendBien ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-amber-50'}``}>
              <div className={``text-2xl font-bold mb-1 ${sinDatos ? 'text-gray-300' : rendBien ? 'text-emerald-600' : 'text-amber-600'}``}>
                {sinDatos ? '—' : (variacion >= 0 ? '+' : '-') + minToHM(Math.abs(variacion))}
              </div>
              <div className="text-sm font-semibold text-gray-700 mb-0.5">Rendimiento</div>
              <div className="text-xs text-gray-400 leading-snug">
                {sinDatos ? 'Completa tareas para ver datos' : ``Est ${minToHM(tEstHecho)} · Real ${minToHM(tRealHecho)}``}
              </div>
            </div>
          )
        })()}
"@

if ($content.Contains($oldKpi3)) {
  $content = $content.Replace($oldKpi3, $newKpi3)
  $changed = $true
  Write-Host "KPI 3 (Ritmo -> Rendimiento) reemplazado"
} else {
  Write-Host "AVISO: KPI 3 no encontrado"
}

# 3. Replace KPI 4 (Llegas) with better version
$oldKpi4 = @"
        <div className={``border rounded-xl p-5 transition ${gap >= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}``}>
          <div className={``text-2xl font-bold mb-1 ${gap >= 0 ? 'text-emerald-600' : 'text-red-500'}``}>
            {gap >= 0 ? ``+${minToHM(gap)}`` : ``-${minToHM(Math.abs(gap))}``}
          </div>
          <div className="text-sm font-semibold text-gray-700 mb-0.5">
            {gap >= 0 ? '✓ Llegas' : '⚠ No llegas'}
          </div>
          <div className="text-xs text-gray-400">
            {gap >= 0 ? ``Te sobran ${minToHM(gap)} sobre lo pendiente`` : ``Te faltan ${minToHM(Math.abs(gap))} para completar el plan``}
          </div>
        </div>
"@

$newKpi4 = @"
        {(() => {
          const restJornada = Math.max(0, previsionMin - cronoMin)
          const gap2 = restJornada - tEstPendiente
          const desviacion = cronoMin > 0 && tRealHecho > 0 ? cronoMin - tRealHecho : null
          return (
            <div className={``border rounded-xl p-5 transition ${gap2 >= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}``}>
              <div className={``text-2xl font-bold mb-1 ${gap2 >= 0 ? 'text-emerald-600' : 'text-red-500'}``}>
                {gap2 >= 0 ? ``+${minToHM(gap2)}`` : ``-${minToHM(Math.abs(gap2))}``}
              </div>
              <div className="text-sm font-semibold text-gray-700 mb-0.5">
                {gap2 >= 0 ? '✓ Llegas' : '⚠ No llegas'}
              </div>
              <div className="text-xs text-gray-400 leading-snug">
                {``Quedan ${minToHM(restJornada)} · Pendiente ${minToHM(tEstPendiente)}``}
                {desviacion !== null && (
                  <span className="block text-[10px] text-gray-300 mt-0.5">
                    {``Fichado vs real: ${desviacion >= 0 ? '+' : '-'}${minToHM(Math.abs(desviacion))}``}
                  </span>
                )}
              </div>
            </div>
          )
        })()}
"@

if ($content.Contains($oldKpi4)) {
  $content = $content.Replace($oldKpi4, $newKpi4)
  $changed = $true
  Write-Host "KPI 4 (Llegas mejorado) reemplazado"
} else {
  Write-Host "AVISO: KPI 4 no encontrado"
}

if ($changed) {
  [System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
  Write-Host "Guardado correctamente"
} else {
  Write-Host "No se aplico ningun cambio"
}
