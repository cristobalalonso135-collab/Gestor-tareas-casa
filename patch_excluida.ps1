$path = "app\page.tsx"
$content = [System.IO.File]::ReadAllText((Resolve-Path $path).Path, [System.Text.UTF8Encoding]::new($false))

# 1. Reemplazar togglePlan para guardar excluida_fecha
$oldToggle = @"
  async function togglePlan(t: Tarea) {
    const autoplan = !!(t.deadline && t.deadline <= today)
    if (autoplan) {
      const dias = diasRetrasoFn(t.deadline, today)
      const msg = dias > 0
        ? ``Esta tarea tiene `${dias} día(s) de retraso. ¿Quieres sacarla del Plan del día igualmente? Seguirá marcada como retrasada.``
        : ``Esta tarea tiene deadline hoy. ¿Quieres sacarla del Plan del día?``
      if (!confirm(msg)) return
      await supabase.from('tareas').update({ excluir_plan: !t.excluir_plan, en_plan: false }).eq('id', t.id)
    } else {
      await supabase.from('tareas').update({ en_plan: !t.en_plan, excluir_plan: false }).eq('id', t.id)
    }
    fetchTareas()
  }
"@

$newToggle = @"
  async function togglePlan(t: Tarea) {
    const autoplan = !!(t.deadline && t.deadline <= today)
    if (autoplan) {
      const dias = diasRetrasoFn(t.deadline, today)
      const msg = dias > 0
        ? ``Esta tarea tiene `${dias} día(s) de retraso. ¿Quieres sacarla del Plan del día por hoy? Mañana volverá a aparecer.``
        : ``Esta tarea tiene deadline hoy. ¿Quieres sacarla del Plan del día? Mañana volverá a aparecer.``
      if (!confirm(msg)) return
      const newExcluir = !t.excluir_plan
      await supabase.from('tareas').update({
        excluir_plan: newExcluir,
        excluida_fecha: newExcluir ? today : null,
        en_plan: false
      }).eq('id', t.id)
    } else {
      await supabase.from('tareas').update({ en_plan: !t.en_plan, excluir_plan: false, excluida_fecha: null }).eq('id', t.id)
    }
    fetchTareas()
  }
"@

if ($content.Contains($oldToggle)) {
  $content = $content.Replace($oldToggle, $newToggle)
  Write-Host "togglePlan actualizado"
} else {
  Write-Host "AVISO: togglePlan no se encontró exactamente. Revisa manualmente."
}

# 2. Reemplazar autoArchivarAyer
$oldArchive = @"
  async function autoArchivarAyer() {
    await supabase.from('tareas')
      .update({ excluir_plan: true })
      .or(``estado.eq.Completada,estado.eq.Omitida``)
      .lt('fecha_finalizacion', today)
      .neq('fecha_finalizacion', null as any)
  }
"@

$newArchive = @"
  async function autoArchivarAyer() {
    // Archive completed/omitted from previous days
    await supabase.from('tareas')
      .update({ excluir_plan: true })
      .or(``estado.eq.Completada,estado.eq.Omitida``)
      .lt('fecha_finalizacion', today)
      .neq('fecha_finalizacion', null as any)

    // Reset excluir_plan for active tasks that were excluded on a previous day
    await supabase.from('tareas')
      .update({ excluir_plan: false, excluida_fecha: null })
      .eq('excluir_plan', true)
      .lt('excluida_fecha', today)
      .neq('estado', 'Completada')
      .neq('estado', 'Omitida')
      .eq('done', false)
  }
"@

if ($content.Contains($oldArchive)) {
  $content = $content.Replace($oldArchive, $newArchive)
  Write-Host "autoArchivarAyer actualizado"
} else {
  Write-Host "AVISO: autoArchivarAyer no se encontró exactamente."
}

[System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Listo. Las tareas excluidas reaparecerán automáticamente al abrir la app un día distinto."
