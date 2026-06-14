$path = "app\page.tsx"
$content = [System.IO.File]::ReadAllText((Resolve-Path $path).Path, [System.Text.UTF8Encoding]::new($false))

# 1. Añadir nuevo prop en PlanKpis signature
$oldSig = "function PlanKpis({ tareas, filtered, cronoSeconds, cronoRunning, onStart, onPause, onReset, formatCrono, today, previsionMin, setPrevisionMin }:"
$newSig = "function PlanKpis({ tareas, filtered, cronoSeconds, cronoRunning, onStart, onPause, onReset, formatCrono, today, previsionMin, setPrevisionMin, onAdjustStart }:"

if ($content.Contains($oldSig)) {
  $content = $content.Replace($oldSig, $newSig)
  Write-Host "Signature actualizada"
}

# 2. Añadir tipo del nuevo prop
$oldType = "  { tareas: any[], filtered: any[], cronoSeconds: number, cronoRunning: boolean, onStart: ()=>void, onPause: ()=>void, onReset: ()=>void, formatCrono: (s:number)=>string, today: string, previsionMin: number, setPrevisionMin: (v:number)=>void }) {"
$newType = "  { tareas: any[], filtered: any[], cronoSeconds: number, cronoRunning: boolean, onStart: ()=>void, onPause: ()=>void, onReset: ()=>void, formatCrono: (s:number)=>string, today: string, previsionMin: number, setPrevisionMin: (v:number)=>void, onAdjustStart: (hhmm:string)=>void }) {"

if ($content.Contains($oldType)) {
  $content = $content.Replace($oldType, $newType)
  Write-Host "Tipo actualizado"
}

# 3. Añadir estado para el editor de hora inicio dentro de PlanKpis
$oldState = "  const [editingPrev, setEditingPrev] = useState(false)
  const [prevInput, setPrevInput] = useState(String(previsionMin))"
$newState = "  const [editingPrev, setEditingPrev] = useState(false)
  const [prevInput, setPrevInput] = useState(String(previsionMin))
  const [editingStart, setEditingStart] = useState(false)
  const [startInput, setStartInput] = useState('09:00')"

if ($content.Contains($oldState)) {
  $content = $content.Replace($oldState, $newState)
  Write-Host "Estado añadido"
}

# 4. Insertar el botón "Hora inicio" justo despues del display del timer
$oldTimer = '        <div className="text-2xl font-mono font-bold text-gray-900 min-w-[90px]">{formatCrono(cronoSeconds)}</div>'

$newTimer = @'
        <div className="text-2xl font-mono font-bold text-gray-900 min-w-[90px]">{formatCrono(cronoSeconds)}</div>

        {/* Hora inicio editable */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-gray-400">Inicio:</span>
          {editingStart ? (
            <div className="flex items-center gap-1">
              <input type="time" value={startInput} onChange={e=>setStartInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'){onAdjustStart(startInput);setEditingStart(false)}if(e.key==='Escape')setEditingStart(false)}}
                className="w-24 border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-gray-500" autoFocus/>
              <button onClick={()=>{onAdjustStart(startInput);setEditingStart(false)}} className="text-xs text-emerald-500 font-bold">OK</button>
            </div>
          ) : (
            <button onClick={()=>setEditingStart(true)}
              className="text-xs font-semibold text-gray-600 border border-dashed border-gray-300 px-2 py-1 rounded hover:bg-white hover:border-gray-400 transition"
              title="Ajustar segun hora de fichaje">
              ⏰ Ajustar
            </button>
          )}
        </div>
'@

if ($content.Contains($oldTimer)) {
  $content = $content.Replace($oldTimer, $newTimer)
  Write-Host "Boton de hora inicio insertado"
}

# 5. Añadir función adjustCronoFromStart en Home y conectarla
$oldStartCrono = "  function startCrono() {
    if (cronoRunning) return
    cronoStartRef.current = Date.now() - cronoSeconds * 1000
    cronoRef.current = setInterval(() => {
      setCronoSeconds(Math.floor((Date.now() - cronoStartRef.current!) / 1000))
    }, 1000)
    setCronoRunning(true)
  }"

$newStartCrono = @"
  function startCrono() {
    if (cronoRunning) return
    cronoStartRef.current = Date.now() - cronoSeconds * 1000
    cronoRef.current = setInterval(() => {
      setCronoSeconds(Math.floor((Date.now() - cronoStartRef.current!) / 1000))
    }, 1000)
    setCronoRunning(true)
  }

  // Ajustar cronómetro según hora de fichaje real
  function adjustCronoFromStart(hhmm: string) {
    if (!hhmm) return
    const [h, m] = hhmm.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return
    const now = new Date()
    const startDate = new Date()
    startDate.setHours(h, m, 0, 0)
    const elapsedSecs = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / 1000))
    setCronoSeconds(elapsedSecs)
    if (cronoRunning) {
      // Re-anchor running timer
      cronoStartRef.current = Date.now() - elapsedSecs * 1000
    }
  }
"@

if ($content.Contains($oldStartCrono)) {
  $content = $content.Replace($oldStartCrono, $newStartCrono)
  Write-Host "Funcion adjustCronoFromStart añadida"
}

# 6. Pasar el prop al PlanKpis
$oldUsage = "<PlanKpis tareas={tareas} filtered={filtered} cronoSeconds={cronoSeconds} cronoRunning={cronoRunning} onStart={startCrono} onPause={pauseCrono} onReset={resetCrono} formatCrono={formatCrono} today={today} previsionMin={previsionMin} setPrevisionMin={setPrevisionMin}/>"
$newUsage = "<PlanKpis tareas={tareas} filtered={filtered} cronoSeconds={cronoSeconds} cronoRunning={cronoRunning} onStart={startCrono} onPause={pauseCrono} onReset={resetCrono} formatCrono={formatCrono} today={today} previsionMin={previsionMin} setPrevisionMin={setPrevisionMin} onAdjustStart={adjustCronoFromStart}/>"

if ($content.Contains($oldUsage)) {
  $content = $content.Replace($oldUsage, $newUsage)
  Write-Host "Prop pasado a PlanKpis"
}

[System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host ""
Write-Host "Listo. Aparece un boton 'Ajustar' junto al cronometro - pones la hora de fichaje (ej 09:00) y se calcula el tiempo desde entonces hasta ahora."
