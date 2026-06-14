
$path = ".\app\page.tsx"

if (!(Test-Path $path)) {
  Write-Host "ERROR: No encuentro .\app\page.tsx" -ForegroundColor Red
  exit 1
}

$content = Get-Content $path -Raw

# 1) Importar Ejecucion
if ($content -notmatch "import Ejecucion from './Ejecucion'") {
  $content = $content -replace "import CargaTrabajo from './CargaTrabajo'\r?\n", "import CargaTrabajo from './CargaTrabajo'`r`nimport Ejecucion from './Ejecucion'`r`n"
}

# 2) Añadir tab Ejecución antes de Carga
if ($content -notmatch "key: 'Ejecucion'") {
  $content = $content -replace "\s*\{ key: 'Carga',\s+label: 'Carga de trabajo', emoji: '📊', sub: '' \},", "  { key: 'Ejecucion',   label: 'Ejecución', emoji: '📈', sub: '' },`r`n  { key: 'Carga',       label: 'Carga de trabajo', emoji: '📊', sub: '' },"
}

# 3) Evitar contador raro en Carga/Ejecución
if ($content -notmatch "key==='Carga' \|\| key==='Ejecucion'") {
  $content = $content -replace "if \(key==='Completadas'\) return stats\.completadas\r?\n", "if (key==='Completadas') return stats.completadas`r`n    if (key==='Carga' || key==='Ejecucion') return 0`r`n"
}

# 4) Ocultar limpiar filtros en Carga/Ejecución
$content = $content -replace "\{hasFilters&&tab!=='Carga'&&\(", "{hasFilters&&tab!=='Carga'&&tab!=='Ejecucion'&&("

# 5) Render de Ejecución
$old = "{tab === 'Carga' ? <CargaTrabajo onEditTarea={(id) => { const t = tareas.find(x => x.id === id); if (t) openEdit(t) }} refreshKey={cargaRefreshKey} /> : <>"
$new = "{tab === 'Carga' ? <CargaTrabajo onEditTarea={(id) => { const t = tareas.find(x => x.id === id); if (t) openEdit(t) }} refreshKey={cargaRefreshKey} /> : tab === 'Ejecucion' ? <Ejecucion onEditTarea={(id) => { const t = tareas.find(x => x.id === id); if (t) openEdit(t) }} refreshKey={cargaRefreshKey} /> : <>"

if ($content.Contains($old)) {
  $content = $content.Replace($old, $new)
} elseif ($content -notmatch "tab === 'Ejecucion'") {
  Write-Host "ERROR: No he encontrado el bloque exacto de Carga. Pásame el bloque donde aparece tab === 'Carga'." -ForegroundColor Red
  Set-Content $path $content -Encoding utf8
  exit 1
}

Set-Content $path $content -Encoding utf8
Write-Host "OK: Ejecución integrada en page.tsx" -ForegroundColor Green
