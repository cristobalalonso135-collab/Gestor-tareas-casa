$path = "app\page.tsx"
$content = Get-Content $path -Raw -Encoding UTF8

# 1. Fix tab state to avoid hydration error - use useEffect instead of lazy init
$content = $content.Replace(
  "const [tab, setTab] = useState(() => { try { return localStorage.getItem('gt_tab') || 'Todas' } catch { return 'Todas' } })",
  "const [tab, setTab] = useState('Plan')"
)

# 2. Add planOrderMode state after saving state
$content = $content.Replace(
  "const [saving, setSaving] = useState(false)",
  "const [saving, setSaving] = useState(false)
  const [planOrderMode, setPlanOrderMode] = useState<'manual'|'auto'>('auto')"
)

# 3. Replace the Plan sort block to respect planOrderMode
$old = "    return result.sort((a, b) => {
      if (tab === 'Plan') {
        const today2 = today
        const aInactive = a.done === true || (a.done as any) === 'true' || a.estado === 'Omitida' || a.estado === 'Completada'
        const bInactive = b.done === true || (b.done as any) === 'true' || b.estado === 'Omitida' || b.estado === 'Completada'
        // Completed/omitted always at bottom
        if (aInactive && !bInactive) return 1
        if (!aInactive && bInactive) return -1
        if (aInactive && bInactive) return (a.hora_finalizacion||'') > (b.hora_finalizacion||'') ? 1 : -1
        const aRetraso = a.deadline && a.deadline < today2 ? Math.floor((new Date(today2).getTime() - new Date(a.deadline).getTime()) / 86400000) : 0
        const bRetraso = b.deadline && b.deadline < today2 ? Math.floor((new Date(today2).getTime() - new Date(b.deadline).getTime()) / 86400000) : 0
        if (aRetraso > 0 && bRetraso === 0) return -1
        if (bRetraso > 0 && aRetraso === 0) return 1
        if (aRetraso > 0 && bRetraso > 0 && bRetraso !== aRetraso) return bRetraso - aRetraso
        if (a.deadline === today2 && b.deadline !== today2 && bRetraso === 0) return -1
        if (b.deadline === today2 && a.deadline !== today2 && aRetraso === 0) return 1
        const tipoOrder = ['Diaria','Semanal','Mensual','Operativa','Táctica','Estratégica','Casa']
        const ai = tipoOrder.indexOf(a.tipo), bi2 = tipoOrder.indexOf(b.tipo)
        if (ai !== bi2) return ai - bi2
      }
      return (a.orden ?? 0) - (b.orden ?? 0)
    })"

$new = "    return result.sort((a, b) => {
      if (tab === 'Plan') {
        // Completed/omitted always at bottom regardless of mode
        const aInactive = a.done === true || (a.done as any) === 'true' || a.estado === 'Omitida' || a.estado === 'Completada'
        const bInactive = b.done === true || (b.done as any) === 'true' || b.estado === 'Omitida' || b.estado === 'Completada'
        if (aInactive && !bInactive) return 1
        if (!aInactive && bInactive) return -1
        if (aInactive && bInactive) return (a.hora_finalizacion||'') > (b.hora_finalizacion||'') ? 1 : -1
        // Manual mode: respect drag & drop orden
        if (planOrderMode === 'manual') return (a.orden ?? 0) - (b.orden ?? 0)
        // Auto mode: sort by deadline/retraso/tipo
        const today2 = today
        const aRetraso = a.deadline && a.deadline < today2 ? Math.floor((new Date(today2).getTime() - new Date(a.deadline).getTime()) / 86400000) : 0
        const bRetraso = b.deadline && b.deadline < today2 ? Math.floor((new Date(today2).getTime() - new Date(b.deadline).getTime()) / 86400000) : 0
        if (aRetraso > 0 && bRetraso === 0) return -1
        if (bRetraso > 0 && aRetraso === 0) return 1
        if (aRetraso > 0 && bRetraso > 0 && bRetraso !== aRetraso) return bRetraso - aRetraso
        if (a.deadline === today2 && b.deadline !== today2 && bRetraso === 0) return -1
        if (b.deadline === today2 && a.deadline !== today2 && aRetraso === 0) return 1
        const tipoOrder = ['Diaria','Semanal','Mensual','Operativa','Tactica','Estrategica','Casa']
        const ai = tipoOrder.indexOf(a.tipo), bi2 = tipoOrder.indexOf(b.tipo)
        if (ai !== bi2) return ai - bi2
        return (a.orden ?? 0) - (b.orden ?? 0)
      }
      return (a.orden ?? 0) - (b.orden ?? 0)
    })"

$content = $content.Replace($old, $new)

# 4. Add toggle before TABLE comment
$old2 = "        {/* TABLE */}
        <div class"

$new2 = "        {/* Plan order toggle */}
        {tab === 'Plan' && (
          <div className=""flex items-center gap-2 mb-3"">
            <span className=""text-xs text-gray-400"">Ordenar:</span>
            <div className=""flex bg-gray-100 rounded-lg p-0.5 gap-0.5"">
              <button onClick={()=>setPlanOrderMode('auto')}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition \${planOrderMode==='auto'?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
                Por deadline
              </button>
              <button onClick={()=>setPlanOrderMode('manual')}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition \${planOrderMode==='manual'?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
                ⠿ Drag & drop
              </button>
            </div>
          </div>
        )}

        {/* TABLE */}
        <div class"

$content = $content.Replace($old2, $new2)

[System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Parcheado"
