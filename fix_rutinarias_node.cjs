const fs = require('fs');
const path = 'app/page.tsx';

if (!fs.existsSync(path)) {
  console.error('ERROR: No encuentro app/page.tsx. Ejecuta esto desde la raíz del proyecto.');
  process.exit(1);
}

let code = fs.readFileSync(path, 'utf8');
fs.writeFileSync('app/page.backup-filtro-rutinarias.tsx', code, 'utf8');

function replaceFunction(source, functionName, replacement) {
  const start = source.indexOf(`function ${functionName}`);
  if (start === -1) {
    throw new Error(`No encuentro function ${functionName}`);
  }

  const firstBrace = source.indexOf('{', start);
  if (firstBrace === -1) {
    throw new Error(`No encuentro apertura de ${functionName}`);
  }

  let depth = 0;
  let end = -1;

  for (let i = firstBrace; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  if (end === -1) {
    throw new Error(`No encuentro cierre de ${functionName}`);
  }

  return source.slice(0, start) + replacement + source.slice(end);
}

const newGetTabFiltered = `function getTabFiltered(): Tarea[] {
    return tareas.filter(t => {
      const isDone = t.done === true || (t.done as any) === 'true'
      const isInactive = isDone || t.estado === 'Omitida' || t.estado === 'Completada'
      const normalized = { ...t, done: isDone }

      if (tab === 'Todas') return !isInactive
      if (tab === 'Completadas') return isInactive

      if (tab === 'Plan') {
        if (!isInactive && isEnPlan(normalized)) return true
        if (isInactive && t.fecha_finalizacion === today && !t.excluir_plan) return true
        return false
      }

      if (tab === 'Rutinaria') {
        return !isInactive && RUTINARIAS.includes(t.tipo) && !isEnPlan(normalized)
      }

      return !isInactive && t.tipo === tab && !isEnPlan(normalized)
    })
  }`;

code = replaceFunction(code, 'getTabFiltered', newGetTabFiltered);

const newGetFiltered = `function getFiltered(all: Tarea[]): Tarea[] {
    const result = all.filter(t => {
      const isDone = t.done === true || (t.done as any) === 'true'
      const isInactive = isDone || t.estado === 'Omitida' || t.estado === 'Completada'
      const normalized = { ...t, done: isDone }

      if (tab === 'Todas') {
        if (isInactive) return false
      } else if (tab === 'Completadas') {
        if (!isInactive) return false
      } else if (tab === 'Plan') {
        const inPlan = (!isInactive && isEnPlan(normalized)) ||
          (isInactive && t.fecha_finalizacion === today && !t.excluir_plan)
        if (!inPlan) return false
      } else if (tab === 'Rutinaria') {
        if (isInactive || !RUTINARIAS.includes(t.tipo) || isEnPlan(normalized)) return false
      } else {
        if (isInactive || t.tipo !== tab || isEnPlan(normalized)) return false
      }

      if (fTarea && !t.tarea.toLowerCase().includes(fTarea.toLowerCase()) && !(t.notas||'').toLowerCase().includes(fTarea.toLowerCase())) return false
      if (fTipo.size > 0 && !fTipo.has(t.tipo)) return false
      if (fEstado.size > 0 && !fEstado.has(t.estado)) return false
      if (fFechaSol.size > 0 && !fFechaSol.has(fDate(t.fecha_solicitud))) return false
      if (fDeadline.size > 0 && !fDeadline.has(fDate(t.deadline))) return false
      if (fFechaFin.size > 0 && !fFechaFin.has(fDate(t.fecha_finalizacion))) return false
      return true
    })

    const isInact = (t: any) => t.done === true || (t.done as any) === 'true' || t.estado === 'Omitida' || t.estado === 'Completada'

    if (sortCol) {
      result.sort((a, b) => {
        if (tab === 'Plan') {
          const aI = isInact(a), bI = isInact(b)
          if (aI && !bI) return 1
          if (!aI && bI) return -1
          if (aI && bI) return (a.hora_finalizacion||'') > (b.hora_finalizacion||'') ? 1 : -1
        }
        let av: any, bv: any
        if (sortCol === 'tarea') { av = a.tarea?.toLowerCase()||''; bv = b.tarea?.toLowerCase()||'' }
        else if (sortCol === 'tipo') { av = a.tipo; bv = b.tipo }
        else if (sortCol === 'estado') { av = a.estado; bv = b.estado }
        else if (sortCol === 'deadline') { av = a.deadline||'9999'; bv = b.deadline||'9999' }
        else if (sortCol === 'fecha_solicitud') { av = a.fecha_solicitud||''; bv = b.fecha_solicitud||'' }
        else if (sortCol === 'tiempo_estimado') { av = a.tiempo_estimado||0; bv = b.tiempo_estimado||0 }
        else if (sortCol === 'tiempo_real') { av = a.tiempo_real||0; bv = b.tiempo_real||0 }
        else { av = 0; bv = 0 }
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
      return result
    }

    return result.sort((a, b) => {
      if (tab === 'Plan') {
        const aI = isInact(a), bI = isInact(b)
        if (aI && !bI) return 1
        if (!aI && bI) return -1
        if (aI && bI) return (a.hora_finalizacion||'') > (b.hora_finalizacion||'') ? 1 : -1
      }
      return (a.orden ?? 0) - (b.orden ?? 0)
    })
  }`;

code = replaceFunction(code, 'getFiltered', newGetFiltered);

// Evita que un filtro seleccionado en otra pestaña deje Rutinarias vacía.
// Al cambiar de pestaña se limpian filtros y orden.
if (!code.includes('// limpiar filtros al cambiar de pestaña')) {
  const marker = `function handleSort(col: string) {`;
  const idx = code.indexOf(marker);
  if (idx !== -1) {
    const endHandleSort = (() => {
      const firstBrace = code.indexOf('{', idx);
      let depth = 0;
      for (let i = firstBrace; i < code.length; i++) {
        if (code[i] === '{') depth++;
        if (code[i] === '}') depth--;
        if (depth === 0) return i + 1;
      }
      return -1;
    })();

    if (endHandleSort !== -1) {
      const insert = `

  // limpiar filtros al cambiar de pestaña
  useEffect(() => {
    setFTarea('')
    setFTipo(new Set())
    setFEstado(new Set())
    setFFechaSol(new Set())
    setFDeadline(new Set())
    setFFechaFin(new Set())
    setSortCol(null)
    setSortDir('asc')
  }, [tab])
`;
      code = code.slice(0, endHandleSort) + insert + code.slice(endHandleSort);
    }
  }
}

fs.writeFileSync(path, code, 'utf8');

console.log('');
console.log('OK: arreglado filtro de Rutinarias.');
console.log('Backup creado: app/page.backup-filtro-rutinarias.tsx');
console.log('');
console.log('Ahora ejecuta:');
console.log('npm run dev');
