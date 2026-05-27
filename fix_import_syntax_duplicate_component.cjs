const fs = require('fs');

const path = 'app/page.tsx';

if (!fs.existsSync(path)) {
  console.error('ERROR: No encuentro app/page.tsx. Ejecuta este archivo desde la raíz del proyecto.');
  process.exit(1);
}

let code = fs.readFileSync(path, 'utf8');
fs.writeFileSync('app/page.backup-fix-import-syntax.txt', code, 'utf8');

const goodDuplicateConfirm = `

function DuplicateConfirm({ tasks, onConfirm, deleting }: { tasks: any[], onConfirm: (items: any[]) => void, deleting: boolean }) {
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
}
`;

// Si el script anterior dejó una función rota al final tipo:
// }: { tasks: Tarea[], onConfirm...
// cortamos desde ahí y ponemos el componente correcto.
let badIdx = code.search(/\n\s*\}\s*:\s*\{\s*tasks\s*:/);
if (badIdx !== -1) {
  code = code.slice(0, badIdx).trimEnd() + goodDuplicateConfirm;
} else {
  // Si existe una función DuplicateConfirm o DeleteConfirm, la reemplazamos completa.
  function replaceFunction(source, functionName, replacement) {
    const start = source.indexOf(`function ${functionName}`);
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
    return source.slice(0, start) + replacement.trimStart() + source.slice(end);
  }

  if (code.includes('function DuplicateConfirm')) {
    code = replaceFunction(code, 'DuplicateConfirm', goodDuplicateConfirm);
  } else if (code.includes('function DeleteConfirm')) {
    code = replaceFunction(code, 'DeleteConfirm', goodDuplicateConfirm);
  } else {
    code = code.trimEnd() + goodDuplicateConfirm;
  }
}

// Asegurar que el modal llama al componente correcto.
code = code.replaceAll('<DeleteConfirm ', '<DuplicateConfirm ');
code = code.replaceAll('importResult.toDelete', 'importResult.duplicates');
code = code.replaceAll('toDelete:', 'duplicates:');
code = code.replaceAll('toDelete.length', 'duplicates.length');
code = code.replaceAll('Ya no están', 'Duplicadas');
code = code.replaceAll('Estas tareas ya no están en el CSV. ¿Eliminarlas?', 'Estas tareas ya existen en la app. ¿Sobrescribirlas?');
code = code.replaceAll('handleConfirmDelete', 'handleConfirmOverwrite');

// Borrar backups .tsx que rompen Vercel. Deja backups .txt.
if (fs.existsSync('app')) {
  for (const file of fs.readdirSync('app')) {
    if (file.includes('.backup-') && file.endsWith('.tsx')) {
      fs.unlinkSync(`app/${file}`);
    }
  }
}

fs.writeFileSync(path, code, 'utf8');

console.log('');
console.log('OK: corregido el error de sintaxis del componente de duplicados.');
console.log('Backup creado: app/page.backup-fix-import-syntax.txt');
console.log('');
console.log('Ahora ejecuta:');
console.log('npm run build');
