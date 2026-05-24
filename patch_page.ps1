$path = "app\page.tsx"
$content = Get-Content $path -Raw -Encoding UTF8

# 1. Add refreshKey state after saving state
$content = $content.Replace(
  "const [saving, setSaving] = useState(false)",
  "const [saving, setSaving] = useState(false)`n  const [cargaRefreshKey, setCargaRefreshKey] = useState(0)"
)

# 2. Increment refreshKey after saveTask
$content = $content.Replace(
  "setSaving(false); setModal(false); setForm(empty); setErrors({}); setEditId(null)`n    fetchTareas()",
  "setSaving(false); setModal(false); setForm(empty); setErrors({}); setEditId(null)`n    setCargaRefreshKey(k => k + 1)`n    fetchTareas()"
)

# 3. Pass props to CargaTrabajo
$content = $content.Replace(
  "{tab === 'Carga' ? <CargaTrabajo onEditTarea={(id) => { const t = tareas.find(x => x.id === id); if (t) openEdit(t) }} /> : <>",
  "{tab === 'Carga' ? <CargaTrabajo onEditTarea={(id) => { const t = tareas.find(x => x.id === id); if (t) openEdit(t) }} refreshKey={cargaRefreshKey} /> : <>"
)

[System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "page.tsx parcheado correctamente"
