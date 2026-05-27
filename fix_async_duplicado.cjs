const fs = require('fs');

const path = 'app/page.tsx';

if (!fs.existsSync(path)) {
  console.error('ERROR: No encuentro app/page.tsx. Ejecuta esto desde la raíz del proyecto.');
  process.exit(1);
}

let code = fs.readFileSync(path, 'utf8');
fs.writeFileSync('app/page.backup-fix-async-duplicado.tsx', code, 'utf8');

// Corrige el error generado por el script anterior: "async async function"
code = code.replaceAll('async async function', 'async function');

// Por seguridad, también corrige si quedó duplicado con espacios/saltos raros
code = code.replace(/async\s+async\s+function/g, 'async function');

fs.writeFileSync(path, code, 'utf8');

console.log('');
console.log('OK: corregido "async async function" en app/page.tsx');
console.log('Backup creado: app/page.backup-fix-async-duplicado.tsx');
console.log('');
console.log('Ahora ejecuta: npm run dev');
