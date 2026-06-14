$path = "app\CargaTrabajo.tsx"
$content = Get-Content $path -Raw -Encoding UTF8

# Remember viewMonth
$content = $content.Replace(
  "const [viewMonth, setViewMonth] = useState(now.getMonth())",
  "const [viewMonth, setViewMonth] = useState(() => { try { const v = localStorage.getItem('gt_carga_month'); return v !== null ? parseInt(v) : now.getMonth() } catch { return now.getMonth() } })"
)

# Remember viewYear
$content = $content.Replace(
  "const [viewYear, setViewYear] = useState(now.getFullYear())",
  "const [viewYear, setViewYear] = useState(() => { try { const v = localStorage.getItem('gt_carga_year'); return v !== null ? parseInt(v) : now.getFullYear() } catch { return now.getFullYear() } })"
)

# Remember viewMode
$content = $content.Replace(
  "const [viewMode, setViewMode] = useState<ViewMode>('pendientes')",
  "const [viewMode, setViewMode] = useState<ViewMode>(() => { try { return (localStorage.getItem('gt_carga_mode') as ViewMode) || 'pendientes' } catch { return 'pendientes' } })"
)

# Remember soloLaborables
$content = $content.Replace(
  "const [soloLaborables, setSoloLaborables] = useState(false)",
  "const [soloLaborables, setSoloLaborables] = useState(() => { try { return localStorage.getItem('gt_carga_laborables') === 'true' } catch { return false } })"
)

# Save viewMode on change
$content = $content.Replace(
  "onClick={()=>setViewMode(m)}",
  "onClick={()=>{ setViewMode(m); try { localStorage.setItem('gt_carga_mode', m) } catch {} }}"
)

# Save soloLaborables on change
$content = $content.Replace(
  "onClick={()=>setSoloLaborables(v=>!v)}",
  "onClick={()=>setSoloLaborables(v=>{ const next = !v; try { localStorage.setItem('gt_carga_laborables', String(next)) } catch {}; return next })}"
)

# Save month/year on prevMonth
$content = $content.Replace(
  "const prevMonth = () => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1)}else setViewMonth(m=>m-1) }",
  "const prevMonth = () => { if (viewMonth===0){ setViewMonth(11); setViewYear(y=>{ const ny=y-1; try{localStorage.setItem('gt_carga_year',String(ny))}catch{}; return ny }); try{localStorage.setItem('gt_carga_month','11')}catch{} } else { const nm=viewMonth-1; setViewMonth(nm); try{localStorage.setItem('gt_carga_month',String(nm))}catch{} } }"
)

# Save month/year on nextMonth
$content = $content.Replace(
  "const nextMonth = () => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1)}else setViewMonth(m=>m+1) }",
  "const nextMonth = () => { if (viewMonth===11){ setViewMonth(0); setViewYear(y=>{ const ny=y+1; try{localStorage.setItem('gt_carga_year',String(ny))}catch{}; return ny }); try{localStorage.setItem('gt_carga_month','0')}catch{} } else { const nm=viewMonth+1; setViewMonth(nm); try{localStorage.setItem('gt_carga_month',String(nm))}catch{} } }"
)

[System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "CargaTrabajo.tsx parcheado"
