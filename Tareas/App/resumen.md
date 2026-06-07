# Gestor de Tareas — Documento completo de contexto

## 🔑 Accesos

### Supabase (Base de datos)
- **URL proyecto:** https://uiffbxuvoicpvivevove.supabase.co
- **Email:** cristobal.alonso@sportsemotion.com
- **Contraseña BD:** 5INMO590ZF0qIyxz
- **SQL Editor:** https://supabase.com/dashboard/project/uiffbxuvoicpvivevove/sql

### GitHub
- **Repo:** https://github.com/cristobalalonso135-collab/Gestor-tareas
- **Login:** cristobalalonso135-collab (Gmail personal)
- **Rama:** main

### Vercel (Hosting)
- **App producción:** https://gestor-tareas-murex.vercel.app
- **Dashboard:** https://vercel.com/cristobal-alonso-s-projects/gestor-tareas
- **Login:** con GitHub

### Local
- **Carpeta:** `C:\Users\cristobal.alonso\Desktop\gestor-tareas`
- **Arrancar:** `npm run dev` → http://localhost:3000

---

## 🚀 Cómo aplicar cambios de código

Claude genera un script `.ps1`. Tú lo descargas al Escritorio y ejecutas en el terminal de VS Code:

```powershell
Move-Item "$env:USERPROFILE\Desktop\write_page.ps1" ".\write_page.ps1" -Force; powershell -ExecutionPolicy Bypass -File .\write_page.ps1
```

Para `CargaTrabajo.tsx`:
```powershell
Move-Item "$env:USERPROFILE\Desktop\write_carga.ps1" ".\write_carga.ps1" -Force; powershell -ExecutionPolicy Bypass -File .\write_carga.ps1
```

Para ambos archivos a la vez:
```powershell
Move-Item "$env:USERPROFILE\Desktop\write_files.ps1" ".\write_files.ps1" -Force; powershell -ExecutionPolicy Bypass -File .\write_files.ps1
```

**Tras cualquier cambio de código, subir a producción:**
```powershell
git add .
git commit -m "descripción del cambio"
git push
```
Vercel despliega automáticamente en 1-2 minutos.

**Los datos (tareas, jornadas) NO necesitan git push** — se guardan directamente en Supabase.

---

## 🗄️ Base de datos — Tablas

### Tabla `tareas`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | bigint | Auto-generado |
| tipo | text | Diaria / Semanal / Mensual / Operativa / Táctica / Estratégica / Casa |
| tarea | text | Nombre único. Formato: "Nombre tarea DD/MM/AAAA" |
| notas | text | Observaciones opcionales |
| solicitado_por | text | Nombre o equipo |
| prioridad | text | Alta / Media / Baja |
| estado | text | Pendiente / En espera / En progreso / Completada / Omitida |
| tiempo_estimado | integer | Minutos estimados |
| tiempo_real | integer | Minutos reales (obligatorio al completar/omitir) |
| fecha_solicitud | date | Fecha de creación |
| deadline | date | Fecha límite |
| fecha_finalizacion | date | Fecha cuando se completó/omitió |
| hora_finalizacion | timestamptz | Timestamp exacto de finalización |
| done | boolean | true = completada |
| en_plan | boolean | true = añadida manualmente al Plan del día |
| excluir_plan | boolean | true = excluida manualmente del Plan del día |
| orden | integer | Orden de arrastre drag&drop |

### Tabla `jornadas`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | bigint | Auto-generado |
| fecha | date UNIQUE | Fecha de la jornada |
| minutos_fichados | integer | Minutos trabajados ese día (del cronómetro) |

---

## 📁 Archivos principales

- `app/page.tsx` — Toda la app (tabla, filtros, KPIs, cronómetro, modales, importación)
- `app/CargaTrabajo.tsx` — Pestaña Carga de trabajo
- `lib/supabase.ts` — Conexión a Supabase

---

## 🎨 Estilo y diseño

- **Inspiración:** Notion — minimalista, limpio, blanco
- **Fuentes:** DM Sans + Syne
- **Botones principales:** gris oscuro (#111 / bg-gray-900)
- **Hover filas:** azul suave (bg-blue-50/60)
- **Sin scroll horizontal** en la tabla
- **Texto tabla:** 10-11px

### Colores por tipo de tarea
| Tipo | Color |
|------|-------|
| Operativa | Sky (azul claro) |
| Táctica | Violet (morado) |
| Estratégica | Amber (ámbar) |
| Casa | Emerald (verde) |
| Diaria/Semanal/Mensual | Gray |

### Badges de deadline
- **+Xd rojo** → retrasada
- **hoy gris** → vence hoy
- **Xd verde** → días restantes (futuro)

---

## 🗂️ Pestañas y lógica

| Pestaña | Contenido |
|---------|-----------|
| Todas | Todas las activas (ni completadas ni omitidas) |
| Plan del día | Deadline hoy o pasado + añadidas con toggle manual. Excluye las marcadas con excluir_plan |
| Rutinarias | Diaria + Semanal + Mensual activas NO en Plan del día |
| Operativas | ≤30 min, activas NO en Plan del día |
| Tácticas | ≤120 min, activas NO en Plan del día |
| Estratégicas | >120 min, activas NO en Plan del día |
| Casa | Tipo Casa, activas NO en Plan del día |
| Historial | Completadas + Omitidas (done=true o estado=Completada/Omitida) |
| Carga de trabajo | Componente separado CargaTrabajo.tsx |

**Regla clave:** Si una tarea está en Plan del día, NO aparece en su pestaña de tipo.

---

## ☀️ Plan del día — Lógica completa

1. **Va automáticamente** si deadline <= hoy (y no está excluida con excluir_plan)
2. **Se añade manualmente** con el toggle de calendario (icono 📅) en las acciones de la fila — para cualquier tipo de tarea
3. **Se saca manualmente** con el mismo toggle — si está retrasada pide confirmación con los días de retraso. Queda marcada con badge "⊘ sin plan"
4. **Al completar/omitir** → se queda visible en Plan del día (tachada, al final, separada por línea "Completadas y omitidas hoy")
5. **Archivar día** → botón en topbar que aparece cuando hay completadas/omitidas hoy → las manda al Historial
6. **Auto-archivo** → al abrir la app, las completadas/omitidas de días anteriores se archivan automáticamente

### Orden en Plan del día
1. Retrasadas (más antigua primero)
2. Deadline hoy
3. Añadidas manualmente
4. (separador) Completadas y omitidas hoy (por hora de finalización)

---

## ⚡ Acciones en cada fila

**Fijas (siempre visibles):**
- ✓ Completar (verde) — pide tiempo real si está vacío
- ⏭ Omitir (gris) — pide tiempo real (acepta 0)
- 📅 Toggle Plan del día — calendario ámbar=auto, azul=manual activo, gris=sin plan

**Hover (aparecen al pasar el ratón, al final de la fila):**
- Duplicar (azul) — crea copia con "(copia)", estado Pendiente
- Editar (lápiz)
- Borrar (papelera roja)

**En Historial (hover):**
- ↩ Deshacer — vuelve a Pendiente, y si está retrasada reaparece en Plan del día
- Editar
- Borrar

---

## 📊 KPIs dinámicos

### Plan del día
- **KPI 1:** Tareas hechas/total + barra de progreso + %
- **KPI 2:** Tiempo estimado completado/total + barra + %
- **KPI 3:** Ritmo — % eficiencia (tiempo estimado hecho / tiempo cronómetro)
- **KPI 4:** ¿Llegas? — gap en verde (+Xm sobrante) o rojo (-Xm que faltan)
- **Barra cronómetro:** Iniciar/Pausar/Resetear + tiempo transcurrido + barra progreso + previsión editable

### Resto de pestañas
- Tareas en vista / Tiempo estimado / Completadas hoy / Tareas activas total

---

## ⏱️ Cronómetro

- Vive en el estado de `Home()` → persiste al cambiar de pestaña
- `previsionMin` (previsión de horas) también persiste — editable haciendo clic en el botón de previsión
- Al **Pausar** → guarda minutos en tabla `jornadas` (fecha de hoy)
- Carga de trabajo lee de `jornadas` para mostrar el tiempo fichado

---

## 📥 Importación de tareas (CSV)

### Formato del maestro
Columnas separadas por `;`:
```
tipo;tarea;notas;solicitado_por;prioridad;estado;tiempo_estimado;tiempo_real;fecha_solicitud;deadline
```
- Fechas en formato `DD/MM/AAAA`
- La segunda fila es de referencia (hints), los datos empiezan en la fila 3
- El nombre de la tarea debe ser único: formato recomendado `Nombre tarea DD/MM/AAAA`

### Lógica de importación inteligente
- **Nuevo en CSV** (nombre no existe en app) → se añade
- **Existe en CSV y en app** (mismo nombre exacto) → se deja igual, no toca nada
- **Existe en app pero NO en CSV, y NO completada** → pregunta si eliminar (con checkboxes individuales)
- **Existe en app, NO en CSV, pero SÍ completada** → se ignora, no pregunta

### Nombre corto en tabla
El nombre `Fichar entrada 06/05/2026` se muestra como `Fichar entrada · 6 may`

---

## 📈 Carga de trabajo (CargaTrabajo.tsx)

- **Navegación:** por mes con flechas ← →
- **Modos:** Pendientes / Historial / Todo
- **Toggle:** Todos los días / Solo laborables
- **Barras por día:** gris=libre, ámbar=cargado (>80% jornada), rojo=sobrecargado (>100%)
- **Fichado:** valor del cronómetro, editable manualmente haciendo clic
- **% ocupación:** si hay fichado, muestra tiempo estimado / tiempo fichado
- **Promedios por día de semana:** Lun-Dom con tiempo total, media/día, nº veces en el mes, tareas/día

---

## 🔍 Filtros (estilo Excel)

Todos los filtros son **multi-select con checkbox**:
- Buscador dentro del dropdown
- Seleccionar todo / Deseleccionar todo
- Contador de filtros activos (número en círculo)
- "Limpiar filtro" dentro del dropdown
- **Opciones dinámicas** — solo muestra valores que existen en la pestaña actual

Columnas filtrables: Tipo, Tarea (texto), F. Solicitud, Deadline, Estado
En Historial además: F. Fin (fecha de finalización)

---

## 🔢 Ordenación por columna

- Click en ↕ junto a la cabecera → ordena asc
- Segundo click → desc
- Tercer click → quita el orden
- Columnas ordenables: Tipo, Tarea, F. Solicitud, Deadline, Est., Real, Estado
- La ordenación tiene prioridad sobre el orden automático de Plan del día

---

## 📏 Columnas de la tabla

| Col | Contenido |
|-----|-----------|
| Acciones | ✓ ⏭ 📅 (fijas) |
| Tipo | Badge con color |
| Tarea | Nombre corto + notas debajo en gris |
| F. Solic. | Fecha solicitud |
| Deadline | Fecha + badge días |
| Est. | Tiempo estimado |
| Real | Tiempo real |
| Dif. | Diferencia est-real (+rojo / -verde) |
| Estado | Badge |
| (hover) | Duplicar + Editar + Borrar |

Resize de columnas: arrastrando el borde derecho de cada cabecera.
Drag & drop de filas: arrastrando la fila completa.

---

## 🔄 Flujo de trabajo diario típico

1. Abrir la app → auto-archivo de ayer ejecutado
2. Ir a Plan del día → ver tareas de hoy
3. Iniciar cronómetro
4. Ir completando tareas (pide tiempo real)
5. Las completadas/omitidas bajan a la sección "Completadas y omitidas hoy"
6. Al terminar el día → "Archivar día" → van al Historial
7. En Carga de trabajo se registra el tiempo fichado automáticamente

---

## 💬 Cómo continuar en nueva conversación

Sube este archivo como adjunto y escribe:
**"Continúa con este proyecto, lee el documento adjunto"**

Claude entenderá toda la arquitectura, lógica, estilo y cómo aplicar cambios.

