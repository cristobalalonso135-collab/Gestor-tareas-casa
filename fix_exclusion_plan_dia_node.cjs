const fs = require('fs');

const path = 'app/page.tsx';

if (!fs.existsSync(path)) {
  console.error('ERROR: No encuentro app/page.tsx. Ejecuta este archivo desde la raíz del proyecto.');
  process.exit(1);
}

let code = fs.readFileSync(path, 'utf8');
fs.writeFileSync('app/page.backup-exclusion-plan-dia.tsx', code, 'utf8');

function replaceFunction(source, functionName, replacement) {
  const start = source.indexOf(`function ${functionName}`);
  if (start === -1) throw new Error(`No encuentro function ${functionName}`);

  const firstBrace = source.indexOf('{', start);
  if (firstBrace === -1) throw new Error(`No encuentro apertura de ${functionName}`);

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

const newIsEnPlan = `function isEnPlan(t: Tarea): boolean {
    const isDone = t.done === true || (t.done as any) === 'true'
    if (isDone || t.estado === 'Omitida' || t.estado === 'Completada') return false

    const excluidaHoy = !!t.excluir_plan && (t as any).excluida_fecha === today
    if (excluidaHoy) return false

    if (t.deadline && t.deadline <= today) return true
    return !!t.en_plan
  }`;

code = replaceFunction(code, 'isEnPlan', newIsEnPlan);

const oldEffect = `useEffect(() => { fetchTareas(); autoArchivarAyer() }, [])`;
const newEffect = `useEffect(() => {
    async function init() {
      await autoArchivarAyer()
      await fetchTareas()
    }
    init()
  }, [])`;

if (code.includes(oldEffect)) {
  code = code.replace(oldEffect, newEffect);
}

const newAutoArchivarAyer = `async function autoArchivarAyer() {
    // Archive completed/omitted from previous days
    await supabase.from('tareas')
      .update({ excluir_plan: true })
      .or(\`estado.eq.Completada,estado.eq.Omitida\`)
      .lt('fecha_finalizacion', today)
      .neq('fecha_finalizacion', null as any)

    // Reset excluir_plan for active tasks excluded on previous days.
    // Así, si siguen retrasadas, vuelven al Plan del día al día siguiente.
    await supabase.from('tareas')
      .update({ excluir_plan: false, excluida_fecha: null })
      .eq('excluir_plan', true)
      .lt('excluida_fecha', today)
      .not('estado', 'in', '("Completada","Omitida")')
  }`;

code = replaceFunction(code, 'autoArchivarAyer', newAutoArchivarAyer);

// Quitar badges simples de "sin plan".
code = code.replace(/\s*<span[^>]*>\s*⊘\s*sin plan\s*<\/span>/gi, '');
code = code.replace(/\s*<span[^>]*>\s*sin plan\s*<\/span>/gi, '');
code = code.replace(/\s*<div[^>]*>\s*⊘\s*sin plan\s*<\/div>/gi, '');
code = code.replace(/\s*<div[^>]*>\s*sin plan\s*<\/div>/gi, '');

fs.writeFileSync(path, code, 'utf8');

console.log('');
console.log('OK: comportamiento de Plan del día corregido.');
console.log('Backup creado: app/page.backup-exclusion-plan-dia.tsx');
console.log('');
console.log('Cambios aplicados:');
console.log('- Las tareas retrasadas excluidas hoy vuelven al Plan mañana.');
console.log('- La app limpia exclusiones antiguas antes de cargar tareas.');
console.log('- Se intenta quitar el badge visual "sin plan".');
console.log('');
console.log('Ahora ejecuta: npm run dev');
