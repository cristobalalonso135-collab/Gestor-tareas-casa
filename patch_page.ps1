$path = "app\page.tsx"
$content = Get-Content $path -Raw -Encoding UTF8

# Save tab to localStorage on change, and restore on load
$content = $content.Replace(
  "const [tab, setTab] = useState('Todas')",
  "const [tab, setTab] = useState(() => { try { return localStorage.getItem('gt_tab') || 'Todas' } catch { return 'Todas' } })"
)

# Wrap setTab to also save to localStorage
$content = $content.Replace(
  "onClick={()=>setTab(key)}",
  "onClick={()=>{ setTab(key); try { localStorage.setItem('gt_tab', key) } catch {} }}"
)

[System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "page.tsx parcheado"
