const fs = require('fs');

const path = 'app/page.tsx';

if (!fs.existsSync(path)) {
  console.error('ERROR: No encuentro app/page.tsx. Ejecuta esto desde la raíz del proyecto.');
  process.exit(1);
}

let code = fs.readFileSync(path, 'utf8');
fs.writeFileSync('app/page.backup-fix-resize-null.txt', code, 'utf8');

const oldBlock = `const onMove = (e: MouseEvent) => {
      if (!colResizing.current) return
      const diff = e.clientX - colResizing.current.startX
      setColWidths(prev => {
        const next = [...prev]
        next[colResizing.current!.col] = Math.max(48, colResizing.current!.startW + diff)
        return next
      })
    }`;

const newBlock = `const onMove = (e: MouseEvent) => {
      const resizing = colResizing.current
      if (!resizing) return

      const diff = e.clientX - resizing.startX

      setColWidths(prev => {
        const next = [...prev]
        next[resizing.col] = Math.max(48, resizing.startW + diff)
        return next
      })
    }`;

if (!code.includes(oldBlock)) {
  console.error('ERROR: No encuentro el bloque exacto de resize. No he tocado nada.');
  process.exit(1);
}

code = code.replace(oldBlock, newBlock);

fs.writeFileSync(path, code, 'utf8');

console.log('');
console.log('OK: arreglado error de colResizing null al redimensionar columnas.');
console.log('Backup: app/page.backup-fix-resize-null.txt');
console.log('');
console.log('Ahora ejecuta: npm run dev');
