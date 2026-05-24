# 1. Eliminar favicons antiguos
Remove-Item "app\favicon.ico" -ErrorAction SilentlyContinue
Remove-Item "app\favicon.svg" -ErrorAction SilentlyContinue
Remove-Item "public\favicon.svg" -ErrorAction SilentlyContinue
Remove-Item "public\favicon.ico" -ErrorAction SilentlyContinue

# 2. Copiar nuevo favicon.ico a app/ y public/
Copy-Item "$env:USERPROFILE\Desktop\favicon.ico" "app\favicon.ico"
Copy-Item "$env:USERPROFILE\Desktop\favicon.ico" "public\favicon.ico"
Copy-Item "$env:USERPROFILE\Desktop\favicon.png" "public\favicon.png"

# 3. Actualizar layout.tsx para referenciar explicitamente el favicon
$layoutPath = "app\layout.tsx"
$layout = Get-Content $layoutPath -Raw -Encoding UTF8

$oldMeta = "export const metadata: Metadata = {
  title: 'Gestor de Tareas',
  description: 'Gestor de tareas personal',
  icons: { icon: '/favicon.svg' },
}"

$newMeta = "export const metadata: Metadata = {
  title: 'Gestor de Tareas',
  description: 'Gestor de tareas personal',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', type: 'image/png' },
    ],
  },
}"

$layout = $layout.Replace($oldMeta, $newMeta)
[System.IO.File]::WriteAllText((Resolve-Path $layoutPath).Path, $layout, [System.Text.UTF8Encoding]::new($false))

Write-Host "Favicon instalado correctamente"
