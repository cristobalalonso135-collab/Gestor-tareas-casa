
$ErrorActionPreference = "Stop"

$page = ".\app\page.tsx"

if (!(Test-Path $page)) {
  Write-Host "ERROR: No existe .\app\page.tsx" -ForegroundColor Red
  exit 1
}

if (!(Test-Path ".\app\Ejecucion.tsx")) {
  Write-Host "ERROR: No existe .\app\Ejecucion.tsx. Descarga primero Ejecucion.tsx y ponlo en .\app\Ejecucion.tsx" -ForegroundColor Red
  exit 1
}

$content = Get-Content $page -Raw

# 1) Import
if ($content -notmatch "import Ejecucion from './Ejecucion'") {
  $content = $content.Replace(
    "import CargaTrabajo from './CargaTrabajo'",
    "import CargaTrabajo from './CargaTrabajo'`r`nimport Ejecucion from './Ejecucion'"
  )
}

# 2) Tab Ejecucion antes de Carga
if ($content -notmatch "key: 'Ejecucion'") {
  $chart = [char]::ConvertFromUtf32(0x1F4C8)
  $o = [char]0x00F3
  $ejLine = "  { key: 'Ejecucion',   label: 'Ejecuci$o" + "n',    emoji: '$chart', sub: '' },`r`n"

  $patternCarga = "(?m)^(\s*\{\s*key:\s*'Carga'\s*,.*)$"
  $content = [regex]::Replace($content, $patternCarga, $ejLine + '$1', 1)
}

# 3) Sin contador en Carga/Ejecucion
if ($content -notmatch "key==='Carga' \|\| key==='Ejecucion'") {
  $content = $content.Replace(
    "if (key==='Completadas') return stats.completadas",
    "if (key==='Completadas') return stats.completadas`r`n    if (key==='Carga' || key==='Ejecucion') return 0"
  )
}

# 4) No mostrar limpiar filtros en Carga/Ejecucion
$content = $content.Replace(
  "{hasFilters&&tab!=='Carga'&&(",
  "{hasFilters&&tab!=='Carga'&&tab!=='Ejecucion'&&("
)

# 5) Render de la vista
$old = "{tab === 'Carga' ? <CargaTrabajo onEditTarea={(id) => { const t = tareas.find(x => x.id === id); if (t) openEdit(t) }} refreshKey={cargaRefreshKey} /> : <>"
$new = "{tab === 'Carga' ? <CargaTrabajo onEditTarea={(id) => { const t = tareas.find(x => x.id === id); if (t) openEdit(t) }} refreshKey={cargaRefreshKey} /> : tab === 'Ejecucion' ? <Ejecucion onEditTarea={(id) => { const t = tareas.find(x => x.id === id); if (t) openEdit(t) }} refreshKey={cargaRefreshKey} /> : <>"

if ($content.Contains($old)) {
  $content = $content.Replace($old, $new)
} elseif ($content -notmatch "tab === 'Ejecucion'") {
  Write-Host "ERROR: No encontre el render exacto de Carga. No he tocado el archivo." -ForegroundColor Red
  exit 1
}

Set-Content $page $content -Encoding utf8

Write-Host "OK: vista Ejecucion integrada en page.tsx" -ForegroundColor Green
Write-Host "Ahora ejecuta: npm run dev" -ForegroundColor Green
