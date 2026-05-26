$Path = ".\app\page.tsx"

if (!(Test-Path $Path)) {
  Write-Host "No encuentro $Path. Ejecuta esto desde la carpeta raíz del proyecto." -ForegroundColor Red
  exit 1
}

$txt = Get-Content $Path -Raw -Encoding UTF8

# 1) Centrar filtros de cabecera
$txt = $txt.Replace(
'className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition flex-1 ${value.size > 0 ? ''text-gray-800'' : ''text-gray-400''} hover:text-gray-700`}',
'className={`flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-wider transition flex-1 text-center ${value.size > 0 ? ''text-gray-800'' : ''text-gray-400''} hover:text-gray-700`}'
)

$txt = $txt.Replace(
'className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition flex-1 ${value ? ''text-gray-800'' : ''text-gray-400''} hover:text-gray-700`}',
'className={`flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-wider transition flex-1 text-center ${value ? ''text-gray-800'' : ''text-gray-400''} hover:text-gray-700`}'
)

# 2) Hacer que la tabla pueda crecer horizontalmente si amplías columnas
$txt = $txt.Replace(
'<div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm border-collapse table-fixed" style={{textAlign:"center"}}>',
'<div className="border border-gray-100 rounded-xl overflow-x-auto overflow-y-visible">
          <table className="text-sm border-collapse table-fixed" style={{width:`${colWidths.reduce((s,w)=>s+w,0)}px`, minWidth:"100%", textAlign:"center"}}>'
)

# 3) Añadir tiradores de resize en cada cabecera
$txt = $txt.Replace(
'</th>',
'<div onMouseDown={(e)=>{e.preventDefault(); colResizing.current={col:0,startX:e.clientX,startW:colWidths[0]}}} className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-blue-200/70 transition" title="Arrastra para ampliar columna"></div>
                </th>',
1
)

$txt = $txt.Replace(
'<th className="relative px-4 select-none text-center">
                  <ColFilter label="Tipo"',
'<th className="relative px-4 select-none text-center">
                  <ColFilter label="Tipo"'
)
$headers = @(
  @{ find='<ColFilter label="Tipo" options={tipoOpts} value={fTipo} onChange={setFTipo} onSort={()=>handleSort(''tipo'')} sortDir={sortDir} isSorted={sortCol===''tipo''}/>
                </th>'; col=1 },
  @{ find='<TextFilter value={fTarea} onChange={setFTarea} onSort={()=>handleSort(''tarea'')} sortDir={sortDir} isSorted={sortCol===''tarea''}/>
                </th>'; col=2 },
  @{ find='<ColFilter label="F. Solic." options={fechaSolOpts} value={fFechaSol} onChange={setFFechaSol} onSort={()=>handleSort(''fecha_solicitud'')} sortDir={sortDir} isSorted={sortCol===''fecha_solicitud''}/>
                </th>'; col=3 },
  @{ find='<ColFilter label="Deadline" options={deadlineOpts} value={fDeadline} onChange={setFDeadline} onSort={()=>handleSort(''deadline'')} sortDir={sortDir} isSorted={sortCol===''deadline''}/>
                </th>'; col=4 },
  @{ find='</button>
                </th>
                <th className="relative px-3 text-center select-none">
                  <button onClick={()=>handleSort(''tiempo_real'')}'; col=5 },
  @{ find='</button>
                </th>
                <th className="relative px-3 text-center select-none">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dif.</span>'; col=6 },
  @{ find='<span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dif.</span>
                </th>'; col=7 },
  @{ find='<ColFilter label="Estado" options={estadoOpts} value={fEstado} onChange={setFEstado} onSort={()=>handleSort(''estado'')} sortDir={sortDir} isSorted={sortCol===''estado''}/>
                </th>'; col=8 },
  @{ find='<th className="px-3 select-none text-center"></th>'; col=9 }
)

foreach ($h in $headers) {
  $handle = "<div onMouseDown={(e)=>{e.preventDefault(); colResizing.current={col:$($h.col),startX:e.clientX,startW:colWidths[$($h.col)]}}} className=""absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-blue-200/70 transition"" title=""Arrastra para ampliar columna""></div>"
  if ($h.col -eq 5 -or $h.col -eq 6) {
    $txt = $txt.Replace($h.find, "</button>`n                  $handle`n                </th>`n                <th className=""relative px-3 text-center select-none"">`n                  " + ($h.col -eq 5 ? "<button onClick={()=>handleSort('tiempo_real')}" : "<span className=""text-xs font-semibold text-gray-400 uppercase tracking-wider"">Dif.</span>"))
  } elseif ($h.col -eq 9) {
    $txt = $txt.Replace($h.find, "<th className=""relative px-3 select-none text-center"">$handle</th>")
  } else {
    $txt = $txt.Replace($h.find, ($h.find -replace '</th>', "$handle`n                </th>"))
  }
}

# 4) Centrar cuerpo de tabla
$txt = $txt.Replace('<td className="px-3 text-left">', '<td className="px-3 text-center">')
$txt = $txt.Replace('<div className="flex items-center gap-1">', '<div className="flex items-center justify-center gap-1">')
$txt = $txt.Replace('<td className="px-4 min-w-0 text-left">', '<td className="px-4 min-w-0 text-center">')
$txt = $txt.Replace('<td className="px-3">', '<td className="px-3 text-center">')
$txt = $txt.Replace('<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">', '<div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">')

Set-Content $Path $txt -Encoding UTF8

Write-Host "Cambio aplicado: cabeceras y cuerpo centrados + columnas ampliables con tirador derecho." -ForegroundColor Green
Write-Host "Ahora ejecuta: npm run dev" -ForegroundColor Cyan
