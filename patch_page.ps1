$path = "app\page.tsx"
$content = Get-Content $path -Raw -Encoding UTF8

# 1. Add planSortMode state after cargaRefreshKey
$content = $content.Replace(
  'const [cargaRefreshKey, setCargaRefreshKey] = useState(0)',
  'const [cargaRefreshKey, setCargaRefreshKey] = useState(0)
  const [planSortMode, setPlanSortMode] = useState<''manual''|''deadline''>(()=>{ try { return (localStorage.getItem(''gt_plan_sort'') as any) || ''manual'' } catch { return ''manual'' } })'
)

# 2. Replace the entire sort block
$old = '    // Helper: is inactive
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

$new = '    const isInactiveFn = (t: any) => t.done === true || (t.done as any) === ''true'' || t.estado === ''Omitida'' || t.estado === ''Completada''

    const inactiveBottom = (a: any, b: any) => {
      const aI = isInactiveFn(a), bI = isInactiveFn(b)
      if (aI && !bI) return 1
      if (!aI && bI) return -1
      if (aI && bI) return (a.hora_finalizacion||'''') > (b.hora_finalizacion||'''') ? 1 : -1
      return 0
    }

    if (sortCol) {
      result.sort((a, b) => {
        if (tab === ''Plan'') { const r = inactiveBottom(a,b); if (r!==0) return r }
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
        const r = inactiveBottom(a, b)
        if (r !== 0) return r
        // planSortMode: manual = drag&drop orden, deadline = sort by deadline
        if (planSortMode === ''deadline'') {
          const av = a.deadline||''9999'', bv = b.deadline||''9999''
          if (av < bv) return -1
          if (av > bv) return 1
        }
        return (a.orden ?? 0) - (b.orden ?? 0)
      }
      return (a.orden ?? 0) - (b.orden ?? 0)
    })'

$content = $content.Replace($old, $new)

# 3. Add toggle button in Plan tab UI — after PlanKpis and before TABLE
$old2 = '        {/* TABLE */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">'

$new2 = '        {/* Plan sort toggle */}
        {tab === ''Plan'' && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-400">Orden:</span>
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={()=>{ setPlanSortMode(''manual''); try{localStorage.setItem(''gt_plan_sort'',''manual'')}catch{} }}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${planSortMode===''manual''?''bg-white text-gray-900 shadow-sm'':''text-gray-500 hover:text-gray-700''}`}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
                Drag & drop
              </button>
              <button
                onClick={()=>{ setPlanSortMode(''deadline''); try{localStorage.setItem(''gt_plan_sort'',''deadline'')}catch{} }}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${planSortMode===''deadline''?''bg-white text-gray-900 shadow-sm'':''text-gray-500 hover:text-gray-700''}`}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                Por deadline
              </button>
            </div>
          </div>
        )}

        {/* TABLE */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">'

$content = $content.Replace($old2, $new2)

[System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Parcheado correctamente"
