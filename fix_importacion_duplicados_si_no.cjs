const fs = require('fs');

const path = 'app/page.tsx';

if (!fs.existsSync(path)) {
  console.error('ERROR: No encuentro app/page.tsx. Ejecuta esto desde la raíz del proyecto.');
  process.exit(1);
}

let code = fs.readFileSync(path, 'utf8');
fs.writeFileSync('app/page.backup-import-si-no.txt', code, 'utf8');

function replaceFunction(source, functionName, replacement) {
  const startAsync = source.indexOf(`async function ${functionName}`);
  const startNormal = source.indexOf(`function ${functionName}`);
  const start = startAsync !== -1 ? startAsync : startNormal;
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

function replaceComponent(source, componentName, replacement) {
  return replaceFunction(source, componentName, replacement)
}

const overwriteFn = `async function handleConfirmOverwrite(selected: any[]) {
    if (!selected.length) return

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

const addAnywayFn = `async function handleImportDuplicatesAnyway(selected: any[]) {
    if (!selected.length) return

    setDeleting(true)

    const maxOrden = tareas.length > 0 ? Math.max(...tareas.map(t => t.orden || 0)) : 0

    const inserts = selected.map((item, i) => ({
      ...item.update,
      orden: maxOrden + i + 1
    }))

    const { error } = await supabase.from('tareas').insert(inserts)

    if (error) {
      alert(\`Error al importar duplicadas: \${error.message}\`)
    }

    setDeleting(false)
    setImportResult(null)
    fetchTareas()
  }`;

code = replaceFunction(code, 'handleConfirmOverwrite', overwriteFn)

if (!code.includes('async function handleImportDuplicatesAnyway')) {
  const insertAfter = code.indexOf(overwriteFn) + overwriteFn.length
  code = code.slice(0, insertAfter) + '\n\n  ' + addAnywayFn + code.slice(insertAfter)
} else {
  code = replaceFunction(code, 'handleImportDuplicatesAnyway', addAnywayFn)
}

const duplicateComponent = `function DuplicateConfirm({ tasks, onConfirm, onAddAnyway, deleting }: { tasks: any[], onConfirm: (items: any[]) => void, onAddAnyway: (items: any[]) => void, deleting: boolean }) {
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
        Estas tareas ya existen en la app. ¿Qué quieres hacer?
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

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={() => onAddAnyway(selectedItems)}
          disabled={selected.size === 0 || deleting}
          className="px-4 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 disabled:opacity-40 transition"
          title="No sobrescribir: importar igualmente y mantener ambas"
        >
          No, añadir igual
        </button>

        <button
          onClick={() => onConfirm(selectedItems)}
          disabled={selected.size === 0 || deleting}
          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 transition"
          title="Sí: sustituir la tarea existente por la del CSV"
        >
          Sí, sobrescribir
        </button>
      </div>
    </div>
  )
}`;

code = replaceComponent(code, 'DuplicateConfirm', duplicateComponent)
code = replaceComponent(code, 'DeleteConfirm', duplicateComponent)

// Asegurar que la llamada al componente pasa la nueva prop
code = code.replace(
  /<DuplicateConfirm\s+tasks=\{importResult\.duplicates\}\s+onConfirm=\{handleConfirmOverwrite\}\s+deleting=\{deleting\}\s*\/>/g,
  '<DuplicateConfirm tasks={importResult.duplicates} onConfirm={handleConfirmOverwrite} onAddAnyway={handleImportDuplicatesAnyway} deleting={deleting}/>'
)

// Si el JSX está multilinea, reemplazo más flexible
code = code.replace(
  /<DuplicateConfirm([\s\S]*?)tasks=\{importResult\.duplicates\}([\s\S]*?)onConfirm=\{handleConfirmOverwrite\}([\s\S]*?)deleting=\{deleting\}([\s\S]*?)\/>/g,
  '<DuplicateConfirm tasks={importResult.duplicates} onConfirm={handleConfirmOverwrite} onAddAnyway={handleImportDuplicatesAnyway} deleting={deleting}/>'
)

// El texto superior del panel
code = code.replaceAll('Estas tareas ya existen en la app. ¿Sobrescribirlas?', 'Estas tareas ya existen en la app. ¿Qué quieres hacer?')

// borrar backups .tsx que rompen Vercel
if (fs.existsSync('app')) {
  for (const file of fs.readdirSync('app')) {
    if (file.includes('.backup-') && file.endsWith('.tsx')) {
      fs.unlinkSync(`app/${file}`)
    }
  }
}

fs.writeFileSync(path, code, 'utf8');

console.log('');
console.log('OK: duplicados con opción Sí/No.');
console.log('');
console.log('Ahora ejecuta: npm run build');
