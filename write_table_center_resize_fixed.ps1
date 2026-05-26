$ErrorActionPreference = "Stop"

$path = "app/page.tsx"

if (!(Test-Path $path)) {
  Write-Host "ERROR: No encuentro app/page.tsx. Ejecuta este script desde la carpeta raiz del proyecto." -ForegroundColor Red
  exit 1
}

$code = Get-Content $path -Raw

# Backup
$backup = "app/page.backup-table-center-resize.tsx"
Copy-Item $path $backup -Force

# 1) Arreglar warning de React: Fragment con key en el map
$code = $code.Replace("import { useEffect, useState, useRef } from 'react'", "import { Fragment, useEffect, useState, useRef } from 'react'")

$code = $code.Replace("                return <>
                  {showDivider && (", "                return <Fragment key={`row-${t.id}`}>
                  {showDivider && (")

$code = $code.Replace("                </>
              })}", "                </Fragment>
              })}")

# 2) Centrar botones de filtros en cabeceras
$code = $code.Replace(
"className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition flex-1 ${value.size > 0 ? 'text-gray-800' : 'text-gray-400'} hover:text-gray-700`}",
"className={`flex items-center justify-center gap-1 text-center text-xs font-semibold uppercase tracking-wider transition flex-1 ${value.size > 0 ? 'text-gray-800' : 'text-gray-400'} hover:text-gray-700`}"
)

$code = $code.Replace(
"className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition flex-1 ${value ? 'text-gray-800' : 'text-gray-400'} hover:text-gray-700`}",
"className={`flex items-center justify-center gap-1 text-center text-xs font-semibold uppercase tracking-wider transition flex-1 ${value ? 'text-gray-800' : 'text-gray-400'} hover:text-gray-700`}"
)

# 3) Mejorar el mínimo de ancho de columnas
$code = $code.Replace(
"next[colResizing.current!.col] = Math.max(50, colResizing.current!.startW + diff)",
"next[colResizing.current!.col] = Math.max(45, colResizing.current!.startW + diff)"
)

# 4) Añadir componente ResizeHandle dentro de Home, si no existe
$marker = "  const showNewBtn = !['Completadas','Rutinaria','Casa'].includes(tab)"
$insert = @'
  const showNewBtn = !['Completadas','Rutinaria','Casa'].includes(tab)

  const ResizeHandle = ({ col }: { col: number }) => (
    <span
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        colResizing.current = { col, startX: e.clientX, startW: colWidths[col] }
      }}
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none group/resize"
      title="Arrastra para cambiar el ancho"
    >
      <span className="absolute right-0 top-2 bottom-2 w-px bg-gray-200 group-hover/resize:bg-gray-500 transition-colors"></span>
    </span>
  )
'@

if ($code -notmatch "const ResizeHandle =") {
  $code = $code.Replace($marker, $insert)
}

# 5) Clase específica en la tabla para centrar cabecera y cuerpo
$code = $code.Replace(
'<table className="w-full text-sm border-collapse table-fixed" style={{textAlign:"center"}}>',
'<table className="gestor-table w-full text-sm border-collapse table-fixed" style={{textAlign:"center"}}>'
)

# 6) Insertar estilos globales para centrar celdas y contenido
$styleMarker = '<main className="min-h-screen bg-white text-gray-900">'
$styleBlock = @'
<main className="min-h-screen bg-white text-gray-900">
      <style jsx global>{`
        .gestor-table th,
        .gestor-table td {
          text-align: center;
          vertical-align: middle;
        }

        .gestor-table th {
          position: relative;
        }

        .gestor-table td > .flex,
        .gestor-table td > div.flex {
          justify-content: center;
        }

        .gestor-table .text-left {
          text-align: center;
        }

        .gestor-table .items-start {
          align-items: center;
        }
      `}</style>
'@

if ($code -notmatch "gestor-table th") {
  $code = $code.Replace($styleMarker, $styleBlock)
}

# 7) Centrar celda de acciones si estaba a la izquierda
$code = $code.Replace('<td className="px-3 text-left">', '<td className="px-3 text-center">')
$code = $code.Replace('<div className="flex items-center gap-1">', '<div className="flex items-center justify-center gap-1">')

# 8) Añadir tiradores de resize en cabeceras, solo si aún no están
if ($code -notmatch "<ResizeHandle col=\{0\}") {
  $code = $code.Replace(
'                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Acciones</span>
                </th>',
'                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Acciones</span>
                  <ResizeHandle col={0}/>
                </th>'
  )

  $code = $code.Replace(
'                  <ColFilter label="Tipo" options={tipoOpts} value={fTipo} onChange={setFTipo} onSort={()=>handleSort(''tipo'')} sortDir={sortDir} isSorted={sortCol===''tipo''}/>
                </th>',
'                  <ColFilter label="Tipo" options={tipoOpts} value={fTipo} onChange={setFTipo} onSort={()=>handleSort(''tipo'')} sortDir={sortDir} isSorted={sortCol===''tipo''}/>
                  <ResizeHandle col={1}/>
                </th>'
  )

  $code = $code.Replace(
'                  <TextFilter value={fTarea} onChange={setFTarea} onSort={()=>handleSort(''tarea'')} sortDir={sortDir} isSorted={sortCol===''tarea''}/>
                </th>',
'                  <TextFilter value={fTarea} onChange={setFTarea} onSort={()=>handleSort(''tarea'')} sortDir={sortDir} isSorted={sortCol===''tarea''}/>
                  <ResizeHandle col={2}/>
                </th>'
  )

  $code = $code.Replace(
'                  <ColFilter label="F. Solic." options={fechaSolOpts} value={fFechaSol} onChange={setFFechaSol} onSort={()=>handleSort(''fecha_solicitud'')} sortDir={sortDir} isSorted={sortCol===''fecha_solicitud''}/>
                </th>',
'                  <ColFilter label="F. Solic." options={fechaSolOpts} value={fFechaSol} onChange={setFFechaSol} onSort={()=>handleSort(''fecha_solicitud'')} sortDir={sortDir} isSorted={sortCol===''fecha_solicitud''}/>
                  <ResizeHandle col={3}/>
                </th>'
  )

  $code = $code.Replace(
'                  <ColFilter label="Deadline" options={deadlineOpts} value={fDeadline} onChange={setFDeadline} onSort={()=>handleSort(''deadline'')} sortDir={sortDir} isSorted={sortCol===''deadline''}/>
                </th>',
'                  <ColFilter label="Deadline" options={deadlineOpts} value={fDeadline} onChange={setFDeadline} onSort={()=>handleSort(''deadline'')} sortDir={sortDir} isSorted={sortCol===''deadline''}/>
                  <ResizeHandle col={4}/>
                </th>'
  )

  $code = $code.Replace(
'                    Est.{sortCol===''tiempo_estimado''&&<span>{sortDir===''asc''?''↑'':''↓''}</span>}
                  </button>
                </th>',
'                    Est.{sortCol===''tiempo_estimado''&&<span>{sortDir===''asc''?''↑'':''↓''}</span>}
                  </button>
                  <ResizeHandle col={5}/>
                </th>'
  )

  $code = $code.Replace(
'                    Real{sortCol===''tiempo_real''&&<span>{sortDir===''asc''?''↑'':''↓''}</span>}
                  </button>
                </th>',
'                    Real{sortCol===''tiempo_real''&&<span>{sortDir===''asc''?''↑'':''↓''}</span>}
                  </button>
                  <ResizeHandle col={6}/>
                </th>'
  )

  $code = $code.Replace(
'                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dif.</span>
                </th>',
'                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dif.</span>
                  <ResizeHandle col={7}/>
                </th>'
  )

  $code = $code.Replace(
'                  <ColFilter label="Estado" options={estadoOpts} value={fEstado} onChange={setFEstado} onSort={()=>handleSort(''estado'')} sortDir={sortDir} isSorted={sortCol===''estado''}/>
                </th>',
'                  <ColFilter label="Estado" options={estadoOpts} value={fEstado} onChange={setFEstado} onSort={()=>handleSort(''estado'')} sortDir={sortDir} isSorted={sortCol===''estado''}/>
                  <ResizeHandle col={8}/>
                </th>'
  )

  $code = $code.Replace(
'                <th className="px-3 select-none text-center"></th>',
'                <th className="relative px-3 select-none text-center">
                  <ResizeHandle col={9}/>
                </th>'
  )
}

Set-Content -Path $path -Value $code -Encoding UTF8

Write-Host ""
Write-Host "OK: app/page.tsx actualizado." -ForegroundColor Green
Write-Host "Backup creado en: $backup" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Ahora ejecuta:" -ForegroundColor Cyan
Write-Host "npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Si compila bien, sube cambios con:" -ForegroundColor Cyan
Write-Host "git add .; git commit -m ""centrar tabla y permitir resize de columnas""; git push" -ForegroundColor White
