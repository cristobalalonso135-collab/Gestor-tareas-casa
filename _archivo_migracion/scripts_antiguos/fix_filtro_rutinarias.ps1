$ErrorActionPreference = "Stop"

$path = "app/page.tsx"

if (!(Test-Path $path)) {
  Write-Host "ERROR: No encuentro app/page.tsx. Ejecuta este script desde la carpeta raiz del proyecto." -ForegroundColor Red
  exit 1
}

$code = Get-Content $path -Raw
$backup = "app/page.backup-rutinarias-filter.tsx"
Copy-Item $path $backup -Force

$old = @'
      if (tab === 'Rutinaria') { if (isInactive || !RUTINARIAS.includes(t.tipo) || isEnPlan({...t, done: isDone})) return false }
      return !isInactive && t.tipo === tab && !isEnPlan({...t, done: isDone})
'@

$new = @'
      if (tab === 'Rutinaria') {
        return !isInactive && RUTINARIAS.includes(t.tipo) && !isEnPlan({...t, done: isDone})
      }
      return !isInactive && t.tipo === tab && !isEnPlan({...t, done: isDone})
'@

if ($code.Contains($old)) {
  $code = $code.Replace($old, $new)
} else {
  Write-Host "No he encontrado el bloque exacto. Intentando reemplazo alternativo..." -ForegroundColor Yellow

  $oldAlt = @'
      if (tab === 'Rutinaria') { if (isInactive || !RUTINARIAS.includes(t.tipo) || isEnPlan({ ...t, done: isDone })) return false }
      return !isInactive && t.tipo === tab && !isEnPlan({ ...t, done: isDone })
'@

  $newAlt = @'
      if (tab === 'Rutinaria') {
        return !isInactive && RUTINARIAS.includes(t.tipo) && !isEnPlan({ ...t, done: isDone })
      }
      return !isInactive && t.tipo === tab && !isEnPlan({ ...t, done: isDone })
'@

  if ($code.Contains($oldAlt)) {
    $code = $code.Replace($oldAlt, $newAlt)
  } else {
    Write-Host "ERROR: No pude localizar el bloque getTabFiltered de Rutinaria." -ForegroundColor Red
    Write-Host "Busca manualmente dentro de getTabFiltered el if tab === 'Rutinaria'." -ForegroundColor Yellow
    exit 1
  }
}

Set-Content -Path $path -Value $code -Encoding UTF8

Write-Host ""
Write-Host "OK: filtro de Rutinarias corregido en app/page.tsx." -ForegroundColor Green
Write-Host "Backup creado en: $backup" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Ahora ejecuta:" -ForegroundColor Cyan
Write-Host "npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Si funciona:" -ForegroundColor Cyan
Write-Host 'git add .; git commit -m "arreglar filtros en rutinarias"; git push' -ForegroundColor White
