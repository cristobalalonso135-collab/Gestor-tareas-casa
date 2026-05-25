$path = "app\page.tsx"
$content = Get-Content $path -Raw -Encoding UTF8

# Fix onDrop to update local state immediately before fetching
$old = '  async function onDrop() {
    if (dragIdx.current === null || dragOver.current === null || dragIdx.current === dragOver.current) {
      setDragging(null); setDragOverIdx(null); return
    }
    const newList = [...filtered]
    const [moved] = newList.splice(dragIdx.current, 1)
    newList.splice(dragOver.current, 0, moved)
    await Promise.all(newList.map((t, i) => supabase.from(''tareas'').update({ orden: i+1 }).eq(''id'', t.id)))
    dragIdx.current = null; dragOver.current = null
    setDragging(null); setDragOverIdx(null)
    fetchTareas()
  }'

$new = '  async function onDrop() {
    if (dragIdx.current === null || dragOver.current === null || dragIdx.current === dragOver.current) {
      setDragging(null); setDragOverIdx(null); return
    }
    const newList = [...filtered]
    const [moved] = newList.splice(dragIdx.current, 1)
    newList.splice(dragOver.current, 0, moved)
    // Update local state immediately so UI reflects the new order
    const idToOrden: Record<number, number> = {}
    newList.forEach((t, i) => { idToOrden[t.id] = i + 1 })
    setTareas(prev => prev.map(t => idToOrden[t.id] !== undefined ? { ...t, orden: idToOrden[t.id] } : t))
    dragIdx.current = null; dragOver.current = null
    setDragging(null); setDragOverIdx(null)
    // Persist to DB in background
    await Promise.all(newList.map((t, i) => supabase.from(''tareas'').update({ orden: i+1 }).eq(''id'', t.id)))
  }'

$content = $content.Replace($old, $new)

# Fix sort: no special Plan sort when no sortCol - just orden + inactive at bottom
$old2 = '    return result.sort((a, b) => {
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

$new2 = '    return result.sort((a, b) => {
      if (tab === ''Plan'') {
        const r = inactiveBottom(a, b)
        if (r !== 0) return r
      }
      return (a.orden ?? 0) - (b.orden ?? 0)
    })'

$content = $content.Replace($old2, $new2)

# Remove planSortMode state if present
$content = $content -replace "  const \[planSortMode.*\n", ""

# Remove plan sort toggle UI if present
$content = $content -replace "        \{/\* Plan sort toggle \*/\}[\s\S]*?\{/\* TABLE \*/\}", "        {/* TABLE */}"

[System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Parcheado"
