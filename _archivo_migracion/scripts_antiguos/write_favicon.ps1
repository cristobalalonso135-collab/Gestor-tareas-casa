# Crear favicon.svg con escudo morado
$faviconSvg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#7c3aed"/>
  <path d="M50 12 L82 26 L82 58 Q82 80 50 92 Q18 80 18 58 L18 26 Z" fill="rgba(255,255,255,0.15)" stroke="white" stroke-width="2"/>
  <polyline points="34 52 46 66 68 40" fill="none" stroke="white" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'@

Set-Content -Path "app\favicon.svg" -Value $faviconSvg -Encoding UTF8
Write-Host "favicon.svg creado"

# Leer layout.tsx actual
$layoutPath = "app\layout.tsx"
$layout = Get-Content $layoutPath -Raw -Encoding UTF8

# Reemplazar el bloque metadata si existe, o añadirlo
if ($layout -match "export const metadata") {
  $layout = $layout -replace "export const metadata[^}]+}", "export const metadata: Metadata = {`n  title: 'Gestor de Tareas',`n  description: 'Gestor de tareas personal',`n  icons: { icon: '/favicon.svg' },`n}"
} else {
  $layout = "import type { Metadata } from 'next'`n" + $layout
  $layout = $layout -replace "(export default)", "export const metadata: Metadata = {`n  title: 'Gestor de Tareas',`n  description: 'Gestor de tareas personal',`n  icons: { icon: '/favicon.svg' },`n}`n`n`$1"
}

Set-Content -Path $layoutPath -Value $layout -Encoding UTF8
Write-Host "layout.tsx actualizado"

# Eliminar favicon.ico antiguo si existe
if (Test-Path "app\favicon.ico") {
  Remove-Item "app\favicon.ico"
  Write-Host "favicon.ico eliminado"
}

Write-Host "Listo. Ejecuta: git add . && git commit -m 'favicon escudo + titulo' && git push"
