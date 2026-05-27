const fs = require('fs');

const path = 'app/page.tsx';

if (!fs.existsSync(path)) {
  console.error('ERROR: No encuentro app/page.tsx. Ejecuta este archivo desde la raíz del proyecto.');
  process.exit(1);
}

let code = fs.readFileSync(path, 'utf8');
fs.writeFileSync('app/page.backup-import-final.txt', code, 'utf8');

function replaceFunction(source, functionName, replacement) {
  const startAsync = source.indexOf(`async function ${functionName}`);
  const startNormal = source.indexOf(`function ${functionName}`);
  const start = startAsync !== -1 ? startAsync : startNormal;
  if (start === -1) throw new Error(`No encuentro la función ${functionName}`);

  const firstBrace = source.indexOf('{', start);
  let depth = 0;
  let end = -1;

  for (let i = firstBrace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  if (end === -1) throw new Error(`No encuentro cierre de ${functionName}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function replaceComponent(source, componentName, replacement) {
  const start = source.indexOf(`function ${componentName}`);
  if (start === -1) return source;

  const firstBrace = source.indexOf('{', start);
  let depth = 0;
  let end = -1;

  for (let i = firstBrace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  if (end === -1) return source;
  return source.slice(0, start) + replacement + source.slice(end);
}

// Resultado de importación: añadidas, duplicadas, errores.
code = code.replace(
  /const \[importResult, setImportResult\] = useState<\{ added: number, skipped: number, [^}]+ errors: string\[\] \} \| null>\(null\)/,
  "const [importResult, setImportResult] = useState<{ added: number, skipped: number, duplicates: any[], errors: string[] } | null>(null)"
);

const newHandleImport = `async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true); setImportResult(null)

    const text = await file.text()
    const firstLine = text.split('\\n')[0]
    const sep = firstLine.includes(';') ? ';' : firstLine.includes('\\t') ? '\\t' : ','
    const parseLine = (line: string) => line.split(sep).map(c => c.trim().replace(/^"|"$/g,''))
    const lines = text.split('\\n').map(l=>l.trim()).filter(Boolean)

    if (lines.length < 2) {
      setImportResult({ added: 0, skipped: 0, duplicates: [], errors: ['Archivo vacío'] })
      setImporting(false)
      return
    }

    const keyMap: Record<string,number> = {}
    parseLine(lines[0]).forEach((h,i) => {
      keyMap[h.replace(/\\*/g,'').toLowerCase().trim().replace(/\\s/g,'_')] = i
    })

    const get = (row: string[], key: string) => {
      const idx = keyMap[key]
      return idx !== undefined ? (row[idx] || '').trim() : ''
    }

    const second = parseLine(lines[1])
    const isHint = second[0] && (
      second[0].includes('/') ||
      second[0].toLowerCase().includes('texto') ||
      second[0].toLowerCase().includes('número')
    )
    const dataStart = isHint ? 2 : 1

    const inserts: any[] = []
    const duplicates: any[] = []
    const errs: string[] = []
    const seenCsv = new Set<string>()
    const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(t => t.orden || 0)) : 0

    for (let i = dataStart; i < lines.length; i++) {
      const row = parseLine(lines[i])
      if (row.every(c => !c)) continue

      const rn = i + 1
      const tarea = get(row,'tarea')
      const tipo = get(row,'tipo')
      const sp = get(row,'solicitado_por')
      const tr = get(row,'tiempo_estimado')
      const fr = get(row,'fecha_solicitud')
      const dr = get(row,'deadline')

      if (!tarea){errs.push(\`Fila \${rn}: falta "tarea"\`);continue}

      if (seenCsv.has(tarea)) {
        errs.push(\`Fila \${rn}: tarea repetida dentro del CSV: "\${tarea}"\`)
        continue
      }
      seenCsv.add(tarea)

      if (!tipo){errs.push(\`Fila \${rn}: falta "tipo"\`);continue}
      if (!sp){errs.push(\`Fila \${rn}: falta "solicitado_por"\`);continue}
      if (!tr){errs.push(\`Fila \${rn}: falta "tiempo_estimado"\`);continue}
      if (!fr){errs.push(\`Fila \${rn}: falta "fecha_solicitud"\`);continue}
      if (!dr){errs.push(\`Fila \${rn}: falta "deadline"\`);continue}

      const fs = parseDate(fr)
      if (!fs){errs.push(\`Fila \${rn}: fecha_solicitud inválida\`);continue}

      const dl = parseDate(dr)
      if (!dl){errs.push(\`Fila \${rn}: deadline inválido\`);continue}

      const payload = {
        tipo,
        tarea,
        notas: get(row,'notas') || null,
        solicitado_por: sp,
        prioridad: get(row,'prioridad') || 'Media',
        estado: get(row,'estado') || 'Pendiente',
        tiempo_estimado: parseInt(tr) || 0,
        tiempo_real: parseInt(get(row,'tiempo_real')) || 0,
        fecha_solicitud: fs,
        deadline: dl,
        fecha_finalizacion: null,
        hora_finalizacion: null,
        done: false,
        en_plan: false,
        excluir_plan: false
      }

      const exists = tareas.find(t => t.tarea === tarea)

      if (exists) {
        duplicates.push({
          id: exists.id,
          actual: exists,
          update: payload
        })
      } else {
        inserts.push({
          ...payload,
          orden: maxOrden + inserts.length + 1
        })
      }
    }

    let added = 0

    if (inserts.length > 0) {
      const { error } = await supabase.from('tareas').insert(inserts)
      if (error) errs.push(\`Error al guardar: \${error.message}\`)
      else {
        added = inserts.length
        fetchTareas()
      }
    }

    setImportResult({ added, skipped: duplicates.length, duplicates, errors: errs })
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }`;

code = replaceFunction(code, 'handleImport', newHandleImport);

const overwriteFn = `async function handleConfirmOverwrite(selected: any[]) {
    if (!selected.length) return

    if (!confirm(\`¿Sobrescribir \${selected.length} tarea(s) duplicada(s) con los datos del CSV?\`)) return

    setDeleting(true)

    for (const item of selected) {
      await supabase
        .from('tareas')
        .update(item.update)
        .eq('id', item.id)
    }

    setDeleting(false)
    setImportResult(null)
    fetchTareas()
  }`;

if (code.includes('handleConfirmOverwrite')) {
  code = replaceFunction(code, 'handleConfirmOverwrite', overwriteFn);
} else if (code.includes('handleConfirmDelete')) {
  code = replaceFunction(code, 'handleConfirmDelete', overwriteFn);
} else {
  const marker = 'async function handleImport';
  const idx = code.indexOf(marker);
  code = code.slice(0, idx) + overwriteFn + '\\n\\n  ' + code.slice(idx);
}

code = code.replaceAll('toDelete', 'duplicates');
code = code.replaceAll('Ya no están', 'Duplicadas');
code = code.replaceAll('Estas tareas ya no están en el CSV. ¿Eliminarlas?', 'Estas tareas ya existen en la app. ¿Sobrescribirlas?');
code = code.replaceAll('Estas tareas ya existen o vienen duplicadas en el CSV.', 'Estas tareas ya existen en la app. ¿Sobrescribirlas?');
code = code.replaceAll('No se han importado porque ya existen o están duplicadas en el CSV.', 'Estas tareas ya existen en la app. Puedes sobrescribirlas con el CSV.');
code = code.replaceAll('DeleteConfirm', 'DuplicateConfirm');
code = code.replaceAll('handleConfirmDelete', 'handleConfirmOverwrite');
code = code.replaceAll('Eliminar ', 'Sobrescribir ');
code = code.replaceAll('Cerrar ', 'Sobrescribir ');

const duplicateComponent = `function DuplicateConfirm({ tasks, onConfirm, deleting }: { tasks: any[], onConfirm: (items: any[]) => void, deleting: boolean }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    setSelected(new Set(tasks.map(t => t.id)))
  }, [tasks])

  const toggle = (id: number) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const selectedItems = tasks.filter(t => selected.has(t.id))

  return (
    <div className="border border-blue-100 bg-blue-50 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-blue-700">
        Estas tareas ya existen en la app. Puedes sobrescribirlas con los datos del CSV.
      </p>

      <div className="space-y-1 max-h-40 overflow-y-auto">
        {tasks.map(item => (
          <label key={item.id} className="flex items-center gap-2 cursor-pointer py-1 hover:bg-blue-100/50 px-1 rounded-lg">
            <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="rounded"/>
            <span className="text-xs text-gray-700 truncate">{shortTaskName(item.update?.tarea || item.tarea || '')}</span>
            <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{item.update?.tipo || item.tipo || ''}</span>
          </label>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onConfirm(selectedItems)}
          disabled={selected.size === 0 || deleting}
          className="ml-auto px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 transition"
        >
          {deleting ? 'Sobrescribiendo...' : \`Sobrescribir \${selected.size}\`}
        </button>
      </div>
    </div>
  )
}`;

code = replaceComponent(code, 'DuplicateConfirm', duplicateComponent);
code = replaceComponent(code, 'DeleteConfirm', duplicateComponent);

code = code.replaceAll("importResult.duplicates.length>0?'bg-red-50 border-red-100':'bg-gray-50 border-gray-100'", "importResult.duplicates.length>0?'bg-blue-50 border-blue-100':'bg-gray-50 border-gray-100'");
code = code.replaceAll("importResult.duplicates.length>0?'text-red-500':'text-gray-400'", "importResult.duplicates.length>0?'text-blue-600':'text-gray-400'");

// borrar backups .tsx que rompen Vercel
if (fs.existsSync('app')) {
  for (const file of fs.readdirSync('app')) {
    if (file.includes('.backup-') && file.endsWith('.tsx')) {
      fs.unlinkSync(`app/${file}`);
    }
  }
}

fs.writeFileSync(path, code, 'utf8');

console.log('');
console.log('OK: importacion final aplicada.');
console.log('');
console.log('Logica final:');
console.log('- CSV nuevo que no existe en app: se añade.');
console.log('- CSV que ya existe en app por mismo nombre: aparece como duplicado y puedes sobrescribir.');
console.log('- Tareas de app que no estan en CSV: no aparecen y no se borran.');
console.log('');
console.log('Ahora ejecuta: npm run build');
