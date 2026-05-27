const fs = require('fs');

const path = 'app/page.tsx';

if (!fs.existsSync(path)) {
  console.error('ERROR: No encuentro app/page.tsx. Ejecuta esto desde la raíz del proyecto.');
  process.exit(1);
}

let code = fs.readFileSync(path, 'utf8');
fs.writeFileSync('app/page.backup-persist-vista-crono.txt', code, 'utf8');

// 1) Mantener vista/pestaña
code = code.replace(
  "const [tab, setTab] = useState('Plan')",
  "const [tab, setTab] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('gestor_tab') || 'Plan') : 'Plan')"
);

// 2) Mantener cronómetro
code = code.replace(
  "const [cronoRunning, setCronoRunning] = useState(false)",
  "const [cronoRunning, setCronoRunning] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('gestor_crono_running') === 'true' : false)"
);

code = code.replace(
  "const [cronoSeconds, setCronoSeconds] = useState(0)",
  "const [cronoSeconds, setCronoSeconds] = useState(() => typeof window !== 'undefined' ? parseInt(localStorage.getItem('gestor_crono_seconds') || '0') || 0 : 0)"
);

// 3) Guardar pestaña cuando cambie
if (!code.includes("localStorage.setItem('gestor_tab'")) {
  const marker = "useEffect(() => {\n    async function init() {";
  const insert = `useEffect(() => {
    localStorage.setItem('gestor_tab', tab)
  }, [tab])

  `;
  code = code.replace(marker, insert + marker);
}

// 4) Rehidratar cronómetro si estaba corriendo al recargar
if (!code.includes("gestor_crono_started_at")) {
  const marker = "useEffect(() => {\n    async function init() {";
  const insert = `useEffect(() => {
    const running = localStorage.getItem('gestor_crono_running') === 'true'
    const startedAt = parseInt(localStorage.getItem('gestor_crono_started_at') || '0') || 0
    const storedSeconds = parseInt(localStorage.getItem('gestor_crono_seconds') || '0') || 0

    if (running && startedAt > 0) {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      const total = Math.max(0, storedSeconds + elapsed)

      setCronoSeconds(total)
      cronoStartRef.current = Date.now() - total * 1000

      if (cronoRef.current) clearInterval(cronoRef.current)
      cronoRef.current = setInterval(() => {
        const next = Math.floor((Date.now() - cronoStartRef.current!) / 1000)
        setCronoSeconds(next)
        localStorage.setItem('gestor_crono_seconds_live', String(next))
      }, 1000)

      setCronoRunning(true)
    }
  }, [])

  `;
  code = code.replace(marker, insert + marker);
}

// 5) Guardar segundos cada vez que cambian
if (!code.includes("localStorage.setItem('gestor_crono_seconds', String(cronoSeconds))")) {
  const marker = "useEffect(() => {\n    if (!fragmentModal) return";
  const insert = `useEffect(() => {
    localStorage.setItem('gestor_crono_seconds', String(cronoSeconds))
  }, [cronoSeconds])

  `;
  code = code.replace(marker, insert + marker);
}

// 6) Reemplazar startCrono
const startStart = code.indexOf("function startCrono()");
if (startStart !== -1) {
  const brace = code.indexOf("{", startStart);
  let depth = 0, end = -1;
  for (let i = brace; i < code.length; i++) {
    if (code[i] === "{") depth++;
    if (code[i] === "}") depth--;
    if (depth === 0) { end = i + 1; break; }
  }

  const newStartCrono = `function startCrono() {
    if (cronoRunning) return

    cronoStartRef.current = Date.now() - cronoSeconds * 1000

    localStorage.setItem('gestor_crono_running', 'true')
    localStorage.setItem('gestor_crono_seconds', String(cronoSeconds))
    localStorage.setItem('gestor_crono_started_at', String(Date.now()))

    cronoRef.current = setInterval(() => {
      const next = Math.floor((Date.now() - cronoStartRef.current!) / 1000)
      setCronoSeconds(next)
      localStorage.setItem('gestor_crono_seconds', String(next))
    }, 1000)

    setCronoRunning(true)
  }`;

  code = code.slice(0, startStart) + newStartCrono + code.slice(end);
}

// 7) Reemplazar pauseCrono
const pauseStart = code.indexOf("function pauseCrono()");
if (pauseStart !== -1) {
  const brace = code.indexOf("{", pauseStart);
  let depth = 0, end = -1;
  for (let i = brace; i < code.length; i++) {
    if (code[i] === "{") depth++;
    if (code[i] === "}") depth--;
    if (depth === 0) { end = i + 1; break; }
  }

  const newPauseCrono = `function pauseCrono() {
    if (cronoRef.current) clearInterval(cronoRef.current)

    localStorage.setItem('gestor_crono_running', 'false')
    localStorage.setItem('gestor_crono_seconds', String(cronoSeconds))
    localStorage.removeItem('gestor_crono_started_at')

    setCronoRunning(false)
    saveCronoToday(Math.floor(cronoSeconds / 60))
  }`;

  code = code.slice(0, pauseStart) + newPauseCrono + code.slice(end);
}

// 8) Reemplazar resetCrono/detener
const resetStart = code.indexOf("function resetCrono()");
if (resetStart !== -1) {
  const brace = code.indexOf("{", resetStart);
  let depth = 0, end = -1;
  for (let i = brace; i < code.length; i++) {
    if (code[i] === "{") depth++;
    if (code[i] === "}") depth--;
    if (depth === 0) { end = i + 1; break; }
  }

  const newResetCrono = `function resetCrono() {
    if (cronoRef.current) clearInterval(cronoRef.current)

    localStorage.setItem('gestor_crono_running', 'false')
    localStorage.setItem('gestor_crono_seconds', '0')
    localStorage.removeItem('gestor_crono_started_at')

    setCronoRunning(false)
    setCronoSeconds(0)
    cronoStartRef.current = null
  }`;

  code = code.slice(0, resetStart) + newResetCrono + code.slice(end);
}

// 9) Ajustar adjustCronoFromStart para persistir el nuevo valor si estaba corriendo
code = code.replace(
  "setCronoSeconds(elapsedSecs)\n    if (cronoRunning) {",
  "setCronoSeconds(elapsedSecs)\n    localStorage.setItem('gestor_crono_seconds', String(elapsedSecs))\n    if (cronoRunning) {"
);

code = code.replace(
  "// Re-anchor running timer\n      cronoStartRef.current = Date.now() - elapsedSecs * 1000",
  "// Re-anchor running timer\n      cronoStartRef.current = Date.now() - elapsedSecs * 1000\n      localStorage.setItem('gestor_crono_running', 'true')\n      localStorage.setItem('gestor_crono_started_at', String(Date.now() - elapsedSecs * 1000))"
);

// 10) Evitar backups .tsx que rompen Vercel
if (fs.existsSync('app')) {
  for (const file of fs.readdirSync('app')) {
    if (file.includes('.backup-') && file.endsWith('.tsx')) {
      fs.unlinkSync(`app/${file}`);
    }
  }
}

fs.writeFileSync(path, code, 'utf8');

console.log('');
console.log('OK: vista y cronómetro persistentes.');
console.log('');
console.log('Ahora:');
console.log('npm run build');
