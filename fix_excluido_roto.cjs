const fs = require('fs');

const path = 'app/page.tsx';

if (!fs.existsSync(path)) {
  console.error('ERROR: No encuentro app/page.tsx. Ejecuta esto desde la raíz del proyecto.');
  process.exit(1);
}

let code = fs.readFileSync(path, 'utf8');
fs.writeFileSync('app/page.backup-fix-excluido-roto.tsx', code, 'utf8');

// El script anterior quitó el badge "sin plan", pero dejó una expresión JSX rota tipo:
// {excluido &&}
// o {excluido &&    }
// Esto rompe el build. La eliminamos.
code = code.replace(/\{\s*excluido\s*&&\s*\}/g, '');
code = code.replace(/\{\s*excluirPlan\s*&&\s*\}/g, '');
code = code.replace(/\{\s*t\.excluir_plan\s*&&\s*\}/g, '');
code = code.replace(/\{\s*\([^)]*excluido[^)]*\)\s*&&\s*\}/g, '');

// Por si quedó el bloque partido en varias líneas
code = code.replace(/\{\s*excluido\s*&&\s*\n\s*\}/g, '');
code = code.replace(/\{\s*t\.excluir_plan\s*&&\s*\n\s*\}/g, '');

// También quitamos cualquier línea suelta que solo tenga "{excluido &&}"
code = code
  .split(/\r?\n/)
  .filter(line => !line.match(/^\s*\{\s*excluido\s*&&\s*\}\s*$/))
  .filter(line => !line.match(/^\s*\{\s*t\.excluir_plan\s*&&\s*\}\s*$/))
  .join('\n');

fs.writeFileSync(path, code, 'utf8');

console.log('');
console.log('OK: eliminada expresión JSX rota de excluido/sin plan.');
console.log('Backup creado: app/page.backup-fix-excluido-roto.tsx');
console.log('');
console.log('Ahora ejecuta: npm run dev');
