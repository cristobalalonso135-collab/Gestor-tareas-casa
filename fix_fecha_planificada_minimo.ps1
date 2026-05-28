
$path = ".\app\page.tsx"
$content = Get-Content $path -Raw

# 1
$content = $content -replace "done: boolean", "done: boolean`r`n  fecha_planificada?: string | null"

# 2
$content = $content -replace "en_plan: false", "en_plan: false,`r`n  fecha_planificada: ''"

# 3
$content = $content -replace "deadline: form\.deadline\|\|null,","deadline: form.deadline||null,`r`n      fecha_planificada: (form as any).fecha_planificada || null,"

# 4
$content = $content -replace "deadline:t\.deadline\|\|''","deadline:t.deadline||'', fecha_planificada:(t as any).fecha_planificada||''"

# 5
$insert = @'

              <Field label="Fecha planificada">
                <input
                  type="date"
                  value={(form as any).fecha_planificada || ''}
                  onChange={e=>setForm({ ...form, fecha_planificada: e.target.value } as any)}
                  className={inputCls()}
                />
              </Field>
'@

$content = $content -replace '</Field>\r?\n\s*</div>', "</Field>`r`n$insert`r`n            </div>", 1

Set-Content $path $content -Encoding utf8

Write-Host "OK - fecha_planificada añadida"
