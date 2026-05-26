$path = "app\page.tsx"
$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $path).Path)
$content = [System.Text.Encoding]::UTF8.GetString($bytes)

$changed = $false

# FIX 1: togglePlan - add excluida_fecha when excluding
$oldToggle = "await supabase.from('tareas').update({ excluir_plan: !t.excluir_plan, en_plan: false }).eq('id', t.id)"
$newToggle = @"
const newExcluir = !t.excluir_plan
      await supabase.from('tareas').update({
        excluir_plan: newExcluir,
        excluida_fecha: newExcluir ? today : null,
        en_plan: false
      }).eq('id', t.id)
"@

if ($content.Contains($oldToggle)) {
  $content = $content.Replace($oldToggle, $newToggle)
  $changed = $true
  Write-Host "FIX 1: togglePlan ahora guarda excluida_fecha"
} else {
  Write-Host "FIX 1: togglePlan ya estaba parcheado o no se encontro"
}

# FIX 2: Fix the broken encoding on the Ajustar button
# Find any garbled version of the clock emoji and replace with SVG icon
$patterns = @(
  "â° Ajustar",
  "â`° Ajustar",
  "Ã¢Â°Â¿ Ajustar",
  "â`°`¿ Ajustar"
)

foreach ($p in $patterns) {
  if ($content.Contains($p)) {
    $content = $content.Replace($p, "Ajustar")
    $changed = $true
    Write-Host "FIX 2: Emoji roto reemplazado"
    break
  }
}

# Also check for the raw garbled bytes pattern
if ($content -match 'â.{0,3}Ajustar') {
  $content = $content -replace 'â.{0,3}Ajustar', 'Ajustar'
  $changed = $true
  Write-Host "FIX 2b: Patron regex limpiado"
}

if ($changed) {
  [System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
  Write-Host "Archivo guardado correctamente"
} else {
  Write-Host "No se encontraron cambios que aplicar"
}
