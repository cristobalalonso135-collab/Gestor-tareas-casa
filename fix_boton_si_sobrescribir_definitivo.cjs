const fs = require('fs');

const path = 'app/page.tsx';

if (!fs.existsSync(path)) {
  console.error('ERROR: No encuentro app/page.tsx. Ejecuta esto desde la raíz del proyecto.');
  process.exit(1);
}

let code = fs.readFileSync(path, 'utf8');
fs.writeFileSync('app/page.backup-boton-si-sobrescribir.txt', code, 'utf8');

const text = 'Sí, sobrescribir';
const textIndex = code.indexOf(text);

if (textIndex === -1) {
  console.error('ERROR: No encuentro el texto "Sí, sobrescribir".');
  process.exit(1);
}

const start = code.lastIndexOf('<button', textIndex);
const end = code.indexOf('</button>', textIndex);

if (start === -1 || end === -1) {
  console.error('ERROR: No puedo localizar el bloque del botón.');
  process.exit(1);
}

const replacement = `<button
          type="button"
          onClick={() => onConfirm(effectiveItems)}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm"
          style={{ backgroundColor: '#2563eb', color: '#ffffff', border: '1px solid #2563eb' }}
          title="Sí: sustituir la tarea existente por la del CSV"
        >
          Sí, sobrescribir
        </button>`;

code = code.slice(0, start) + replacement + code.slice(end + '</button>'.length);

fs.writeFileSync(path, code, 'utf8');

console.log('');
console.log('OK: botón "Sí, sobrescribir" forzado a azul, activo y sin disabled.');
console.log('Backup: app/page.backup-boton-si-sobrescribir.txt');
console.log('');
console.log('Ahora ejecuta: npm run dev');
