$path = "app/page.tsx"
if (!(Test-Path $path)) { Write-Error "No encuentro app/page.tsx. Ejecuta esto desde la carpeta del proyecto."; exit 1 }

$text = Get-Content $path -Raw

# 1) Tipo Tarea
$text = $text -replace "deadline: string\r?\n  fecha_finalizacion: string", "deadline: string`r`n  fecha_planificada?: string | null`r`n  fecha_finalizacion: string"

# 2) Empty form
$text = $text -replace "tiempo_estimado: 0, tiempo_real: 0, fecha_solicitud: '', deadline: '',", "tiempo_estimado: 0, tiempo_real: 0, fecha_solicitud: '', deadline: '', fecha_planificada: '',"

# 3) Guardado: normalizar fecha_planificada a null si viene vacía
$text = $text -replace "const clean = \{ \.\.\.form, fecha_solicitud: form\.fecha_solicitud\|\|null, deadline: form\.deadline\|\|null, fecha_finalizacion: form\.fecha_finalizacion\|\|null \}", "const clean = { ...form, fecha_solicitud: form.fecha_solicitud||null, deadline: form.deadline||null, fecha_planificada: (form as any).fecha_planificada||null, fecha_finalizacion: form.fecha_finalizacion||null }"

# 4) Editar: cargar fecha_planificada en el formulario
$text = $text -replace "deadline:t\.deadline\|\|'', fecha_finalizacion:t\.fecha_finalizacion\|\|'',", "deadline:t.deadline||'', fecha_planificada:(t as any).fecha_planificada||'', fecha_finalizacion:t.fecha_finalizacion||'',"

# 5) Modal: añadir campo Fecha planificada debajo de Deadline si no existe
if ($text -notmatch "Fecha planificada") {
  $old = @'
              <Field label="Deadline *" error={errors.deadline}>
                <input type="date" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})} className={inputCls(errors.deadline)}/>
              </Field>
'@
  $new = @'
              <Field label="Deadline *" error={errors.deadline}>
                <input type="date" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})} className={inputCls(errors.deadline)}/>
              </Field>
              <Field label="Fecha planificada">
                <input type="date" value={(form as any).fecha_planificada || ''} onChange={e=>setForm({...form,fecha_planificada:e.target.value} as any)} className={inputCls()}/>
              </Field>
'@
  $text = $text.Replace($old, $new)
}

Set-Content $path $text -Encoding UTF8
Write-Host "OK: page.tsx actualizado con fecha_planificada opcional."
