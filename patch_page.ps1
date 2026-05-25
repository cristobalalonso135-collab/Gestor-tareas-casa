$path = "app\page.tsx"
$content = Get-Content $path -Raw -Encoding UTF8

$old = '    // Sort by column if active
    if (sortCol) {
      result.sort((a, b) => {
        let av: any, bv: any
        if (sortCol === ''tarea'') { av = a.tarea?.toLowerCase()||''''; bv = b.tarea?.toLowerCase()||'''' }
        else if (sortCol === ''tipo'') { av = a.tipo; bv = b.tipo }
        else if (sortCol === ''estado'') { av = a.estado; bv = b.estado }
        else if (sortCol === ''deadline'') { av = a.deadline||''9999''; bv = b.deadline||''9999'' }
        else if (sortCol === ''fecha_solicitud'') { av = a.fecha_solicitud||''''; bv = b.fecha_solicitud||'''' }
        else if (sortCol === ''tiempo_estimado'') { av = a.tiempo_estimado||0; bv = b.tiempo_estimado||0 }
        else if (sortCol === ''tiempo_real'') { av = a.tiempo_real||0; bv = b.tiempo_real||0 }
        else { av = 0; bv = 0 }
        if (av < bv) return sortDir === ''asc'' ? -1 : 1
        if (av > bv) return sortDir === ''asc'' ? 1 : -1
        return 0
      })
      return result
    }
    return result.sort((a, b) => {
      if (tab === ''Plan'') {
        const today2 = today
        const aInactive = a.done === true || (a.done as any) === ''true'' || a.estado === ''Omitida'' || a.estado === ''Completada''
        const bInactive = b.done === true || (b.done as any) === ''true'' || b.estado === ''Omitida'' || b.estado === ''Completada''
        // Completed/omitted always at bottom
        if (aInactive && !bInactive) return 1
        if (!aInactive && bInactive) return -1
        if (aInactive && bInactive) return (a.hora_finalizacion||'''') > (b.hora_finalizacion||'''') ? 1 : -1
        const aRetraso = a.deadline && a.deadline < today2 ? Math.floor((new Date(today2).getTime() - new Date(a.deadline).getTime()) / 86400000) : 0
        const bRetraso = b.deadline && b.deadline < today2 ? Math.floor((new Date(today2).getTime() - new Date(b.deadline).getTime()) / 86400000) : 0
        if (aRetraso > 0 && bRetraso === 0) return -1
        if (bRetraso > 0 && aRetraso === 0) return 1
        if (aRetraso > 0 && bRetraso > 0 && bRetraso !== aRetraso) return bRetraso - aRetraso
        if (a.deadline === today2 && b.deadline !== today2 && bRetraso === 0) return -1
        if (b.deadline === today2 && a.deadline !== today2 && aRetraso === 0) return 1
        // Same group — respect manual order
        return (a.orden ?? 0) - (b.orden ?? 0)
      }
      return (a.orden ?? 0) - (b.orden ?? 0)
    })'

$new = '    // Helper: is inactive
    const isInactiveFn = (t: any) => t.done === true || (t.done as any) === ''true'' || t.estado === ''Omitida'' || t.estado === ''Completada''

    // Completadas/omitidas always at bottom in Plan
    const planInactiveSort = (a: any, b: any) => {
      const aI = isInactiveFn(a), bI = isInactiveFn(b)
      if (aI && !bI) return 1
      if (!aI && bI) return -1
      if (aI && bI) return (a.hora_finalizacion||'''') > (b.hora_finalizacion||'''') ? 1 : -1
      return 0
    }

    if (sortCol) {
      result.sort((a, b) => {
        // In Plan, inactive always at bottom regardless of sort
        if (tab === ''Plan'') {
          const aI = isInactiveFn(a), bI = isInactiveFn(b)
          if (aI && !bI) return 1
          if (!aI && bI) return -1
          if (aI && bI) return (a.hora_finalizacion||'''') > (b.hora_finalizacion||'''') ? 1 : -1
        }
        let av: any, bv: any
        if (sortCol === ''tarea'') { av = a.tarea?.toLowerCase()||''''; bv = b.tarea?.toLowerCase()||'''' }
        else if (sortCol === ''tipo'') { av = a.tipo; bv = b.tipo }
        else if (sortCol === ''estado'') { av = a.estado; bv = b.estado }
        else if (sortCol === ''deadline'') { av = a.deadline||''9999''; bv = b.deadline||''9999'' }
        else if (sortCol === ''fecha_solicitud'') { av = a.fecha_solicitud||''''; bv = b.fecha_solicitud||'''' }
        else if (sortCol === ''tiempo_estimado'') { av = a.tiempo_estimado||0; bv = b.tiempo_estimado||0 }
        else if (sortCol === ''tiempo_real'') { av = a.tiempo_real||0; bv = b.tiempo_real||0 }
        else { av = 0; bv = 0 }
        if (av < bv) return sortDir === ''asc'' ? -1 : 1
        if (av > bv) return sortDir === ''asc'' ? 1 : -1
        return 0
      })
      return result
    }

    // No sort col — use manual orden, inactive always at bottom in Plan
    return result.sort((a, b) => {
      if (tab === ''Plan'') {
        const inactive = planInactiveSort(a, b)
        if (inactive !== 0) return inactive
      }
      return (a.orden ?? 0) - (b.orden ?? 0)
    })'

$content = $content.Replace($old, $new)
[System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Parcheado correctamente"
