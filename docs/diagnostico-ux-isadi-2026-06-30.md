# Diagnóstico UX — Agenda, Dar Turno y Paquetes (ISADI)

- **Fecha:** 2026-06-30
- **Autora:** Sally (UX/UI · BMad)
- **Para:** jot4
- **Alcance:** cliente ISADI (en producción). Análisis de los 3 flujos que las recepcionistas reportan como confusos/ineficientes: *dar un turno*, *agenda/Calendario*, *sesiones por paquetes*.
- **Método:** lectura del código real (4 exploradores en paralelo, solo lectura) + síntesis de todo el feedback previo (memorias + `plan-homes-intent-centric.md`). **Sin tocar la DB de pacientes. Sin rediseño todavía.**
- **Pregunta de fondo:** *"¿el sistema es difícil de verdad, o son ellas las que lo rechazan?"*

---

## 1. La respuesta corta a tu pregunta

**No tenés evidencia para concluir "rechazo". Y no podés tenerla todavía, porque las recepcionistas hoy NO están usando el sistema que vos creés.**

Las quejas son reales, pero están contaminadas por dos cosas que no son ni diseño ni actitud:

1. **Versión vieja en producción** — varios de los bugs exactos que reclaman *ya están arreglados en el repo, pero sin deployar* (contador de paquetes falso, modal de turno con horarios inventados, login que mandaba a todos a `/agenda`, tours rotos).
2. **Datos sin cargar** — la agenda se queda **silenciosamente vacía** cuando faltan los horarios reales por profesional. La pantalla dice "Sin turnos para este día" y la recepcionista entiende "este sistema no anda".

Juzgar la adopción de un sistema que muestra **una build vieja con datos genéricos** es como evaluar a un cocinero con la heladera vacía. Primero llenás la heladera y prendés la cocina; recién ahí sabés si cocina mal.

Dicho eso: **sí hay defectos de diseño genuinos** (no es todo deploy + datos). Pero son acotados, conocidos y baratos de arreglar. La conclusión honesta es:

> El dolor de ISADI es, en orden de peso: **(1) deploy pendiente → (2) datos sin cargar → (3) ~4 fricciones de diseño reales → (4) adopción, que recién se puede medir cuando 1-3 estén resueltos.**

---

## 2. Las 4 capas del problema

El error sería tratar todo como "UX mala" y rediseñar. Hay cuatro capas distintas, cada una se arregla diferente:

| Capa | Qué es | Cómo se arregla | Cuánto pesa (estimación) |
|------|--------|-----------------|--------------------------|
| **0. Deploy** | Prod corre una build anterior a fixes ya mergeados | Redeploy en EasyPanel + aplicar migraciones | 🔴 Alto — probablemente el mayor alivio inmediato |
| **1. Datos/config** | Horarios genéricos/faltantes → agenda vacía silenciosa; obras sociales globales; nombres de servicio que no matchean el foco "rehab" | Cargar/validar datos de ISADI + 1 fix de filtro por tenant | 🔴 Alto |
| **2. Diseño** | ~4 fricciones reales de interacción | Cambios de UI acotados (Ola 1) | 🟡 Medio |
| **3. Adopción** | ¿Resistencia/training? | **No medible hoy** — se mide tras 0-2 | ⚪ Desconocido (por ahora) |

> ✅ **VERIFICADO EN PROD (2026-06-30, solo lectura).** Ver sección 2.5. Resumen: la **base está 100% al día** (todas las migraciones, incl. paquetes 036/037/038 y hasta la 046) → la capa 0 (deploy) se reduce a verificar **solo el frontend/agente en EasyPanel**, no la DB. La capa 1 (datos) queda **confirmada y es la dominante**: horarios genéricos, obras sociales ajenas.

---

## 2.5. Verificación en producción (datos reales, 2026-06-30)

Consultas de solo lectura sobre la base de ISADI (`tenant 5298fcc5…`), sin tocar datos de pacientes.

### 🔴 Confirmado — causa raíz #1: horarios genéricos
Los **8 profesionales activos** tienen el **mismo horario seed**: Lun–Vie, una sola franja **08:00–18:00**. Ninguno tiene horario real.
- `Aldo Luque` → 08–18 (debería ser **solo tarde**).
- `Patricia Pérez Bernal` → 08–18 (debería ser **solo mañana**).
- Resto (Dr. Juan Diego Rodríguez, Dr. Juan Pablo Rodríguez, Dr. Villavicencio, Prof. Carolina López, Prof. Rocío López, Profesora Martina) → 08–18 genérico.

> **Matiz clave:** la agenda **no aparece vacía** — aparece con **disponibilidad FALSA**. Ofrece huecos a las 13/14/etc. donde el profesional no atiende. La recepcionista lo sabe → pierde confianza en *todos* los huecos. Ningún rediseño arregla esto; **solo cargar los horarios reales** lo hace.

### 🔴 Confirmado — reclamo #3: obras sociales
`obras_sociales`: **24 globales** (`tenant_id NULL`), **0 de ISADI**. El dropdown muestra entidades ajenas (seed Galeno/IOMA/OSDE…) y ninguna propia. Falta el filtro por tenant + cargar las reales.

### 🟡 Hallazgo nuevo — servicios no agendables por el flujo de turno
De 9 servicios activos, **4 no generan huecos** en "dar un turno" porque su `booking_mode` ≠ `appointment`: `Aquagym` (cycle), `Pilates` (cycle), `Hidroterapia` (gated), `Rehabilitación traumatológica` (walk_in). Elegirlos en el modal = callejón silencioso. Los agendables (appointment): Fisioterapia, Kinesiología, Rehabilitación física (2 profs c/u, 60 min), Odontología y Traumatología (1 prof, 30 min).

### 🟢 Riesgos que tenía abiertos y quedan DESCARTADOS
- **Migraciones de paquetes faltantes** → FALSO. Todas aplicadas (`epic13_036/037/038`, `040`–`046`). `appointments` tiene `package_id` y `session_index`.
- **Landmine `day_of_week` (service_hours)** → no aplica: `service_hours = 0` filas (limpieza del 23/06 sostenida). Todo cae a `professional_schedules` (convención Lun=0, consistente).
- **Foco "rehab" deja agenda vacía** → no: varios servicios matchean la regex.

### 🟢 Uso real — NO hay rechazo frontal
- **6 paquetes** (todos activos), **23 turnos**, **19 vinculados a paquete** (83 %), **8 creados en los últimos 14 días**.
- Lectura: las recepcionistas **sí usan** el sistema (sobre todo el flujo de sesiones de paquete). El volumen bajo sugiere que aún **no es la herramienta principal** — coherente con horarios/obras sociales mal cargados minando la confianza.

### ⏳ Única incógnita restante
Estado del **deploy del frontend y del agente en EasyPanel** (no verificable desde la DB). La DB está al día, pero si la build del front es vieja, sigue mostrando el contador de paquetes falso, el modal de turno viejo y el login roto. **Verificable solo en EasyPanel.**

---

## 3. Síntoma por síntoma

### Síntoma A — "La agenda/Calendario no se entiende y no es eficiente"

| Causa real | Capa | Evidencia |
|-----------|------|-----------|
| Sin `professional_schedules` cargados → **0 huecos libres**, sin aviso | Datos | RPC `check_clinic_availability` (mig. 029:148-159); UI muestra "Sin turnos para este día" (`CalendarView.tsx:336-349`) |
| Foco **"Rehabilitación" activo por default**, recorta por nombre de servicio (regex `fisio\|kinesi\|rehab\|terapia física`). Si los servicios no matchean → **agenda arranca vacía** | Datos disfrazado de diseño | `AgendaView.tsx:55`, `service-visuals.ts:22-32` |
| **Landmine `day_of_week`**: `service_hours` documenta 0=Domingo, pero la RPC consulta con 0=Lunes → horarios corridos un día si alguien carga `service_hours` | Datos (riesgo latente) | `service_hours.sql:11` vs RPC `029:121`. ISADI hoy se salva porque usa `professional_schedules` |
| **Doble código de color**: Día/Semana colorean por **servicio**, Mes/modal por **estado**. Mismo color, dos significados, sin leyenda | Diseño | `service-visuals.ts:40-74` vs `CalendarViewRangeReadOnly.tsx:48-63` |
| Ninguna vista es una **grilla horaria real**: Día y Semana son listas verticales. Quien espera "tipo Google Calendar" no la encuentra | Diseño (expectativa) | `CalendarView.tsx:260-263` (se abandonó el time-grid a propósito) |
| **Libre vs ocupado** se distingue solo por borde punteado + "+ Libre" + opacidad — sutil | Diseño | `CalendarView.tsx:382-419` |
| "lleno" vs "—" vs "● N libres" en el resumen de Mes — "lleno" puede leerse como "completo" cuando significa "sin disponibilidad calculada" (a veces = sin horario cargado) | Diseño + datos | `CalendarViewRangeReadOnly.tsx:639-646` |

**Mito desmentido:** el `future_window=60` **no** afecta esta agenda (solo al agente IA). `AgentPromptEditor.tsx:377-393` vs `availability/route.ts:18` (`MAX_RANGE_DAYS`).

### Síntoma B — "Dar un turno es difícil"

| Causa real | Capa | Evidencia |
|-----------|------|-----------|
| **Cadena de 4 selects dependientes y bloqueados**: servicio → profesional → fecha → horario. No se puede pedir "primer horario libre con cualquier profesional" | Diseño | `NewTurnoModal.tsx:132-133, 708-813` |
| **Búsqueda de paciente sin typeahead** (escribir + clickear "Buscar") en la acción más repetida del día | Diseño | `NewTurnoModal.tsx:483-494` |
| **Paso 2 oculto** hasta seleccionar paciente: flujo estrictamente secuencial, no se adelanta nada | Diseño | `NewTurnoModal.tsx:657` |
| "**Sin horarios libres**" sin explicar que el problema es horario no cargado | Datos disfrazado de diseño | `NewTurnoModal.tsx:799-816` |
| **Terminología inconsistente**: la card dice "Dar un turno", el modal "Nuevo turno" | Diseño | `recepcion/page.tsx:285` vs `NewTurnoModal.tsx:445` |
| **Botón ausente en vista Mes** → obliga a cambiar de vista para agendar | Diseño | `AgendaView.tsx:330` |
| **Mensajes de error técnicos** expuestos ("tenant_id no disponible en el JWT", "Error de red…") | Diseño | `NewTurnoModal.tsx:179, 816`, `appointments/route.ts:19` |
| **Reprogramar usa horarios inventados** (08-20 hardcode), ignora disponibilidad real — al revés que "Nuevo turno" | Diseño (bug pendiente) | `RescheduleTurnoModal.tsx:10,71` |

### Síntoma C — "Las sesiones por paquetes no se entienden"

| Causa real | Capa | Evidencia |
|-----------|------|-----------|
| **Migraciones 036/037/038 aplicadas a mano**. Si no están en prod, **el módulo entero falla en runtime** (la tabla `treatments` no existe) | Deploy/datos | Cabeceras de migración + `sprint-status.yaml:38` |
| Contador falso "8/10" (ya corregido en código a contador honesto) — pero **solo si está deployado** | Deploy | `treatmentProgress` (`types/treatments.ts:114-135`) |
| **Terminología dual**: "paquete" (recepción) vs "tratamiento" (ficha clínica) sobre la misma entidad | Diseño | `036_treatments_table.sql:4-6`, tab "Paquetes" vs HCE |
| **Dos nociones de saldo que divergen**: `sessions_remaining` (campo) vs contador derivado. "realizada" ≠ "consumida" | Diseño | `types/treatments.ts:97-110`, `PaquetesTracking.tsx` |
| **El saldo del paquete NO se ve al dar un turno normal** — `NewTurnoModal` no conoce paquetes; solo descuenta el botón "Agendar sesión" de la ficha | Diseño | `NewTurnoModal.tsx` (sin refs a package/treatment) |

---

## 4. Plan priorizado — "arreglar el sistema" vs "arreglar el rollout"

### 🌊 Ola 0 — Rollout (días, casi sin código nuevo) — **EMPEZAR ACÁ**

> Esto solo, probablemente, elimina la mitad de las quejas. Es lo más barato y lo más urgente.

1. **Verificar el estado real de prod** (lectura): ¿qué build corre ISADI? ¿están aplicadas las migraciones 036/037/038/040? ¿cuántos `professional_schedules` reales hay cargados?
2. **Redeploy** en EasyPanel del dashboard (fixes de paquetes, modal de turno, login, tours) y del agente (proactivo + contexto).
3. **Cargar/validar datos de ISADI**: horarios reales por profesional (Aldo = tarde, Patricia = mañana), `service_professionals`, obras sociales reales. (Horarios bloqueados hasta que ISADI los pase — sigue siendo el cuello de botella conocido.)
4. **Foco "Rehabilitación"**: confirmar que los nombres de servicio de ISADI matchean la regex, o cambiar el default a "Ver todo".

### 🌊 Ola 1 — Diseño (poco código, alto impacto)

> Las fricciones reales que quedan **una vez descontados deploy + datos**. Ordenadas por ROI.

1. ⭐ **Estado vacío inteligente** (el fix de mayor retorno): cuando la agenda/modal no tiene huecos, distinguir *"este profesional no tiene horarios cargados → [Configurar horarios]"* de *"agenda llena"*. Convierte el fallo silencioso de datos en una instrucción accionable. Mata confusión de las 3 pantallas a la vez.
2. **Dar turno sin obligar a elegir profesional**: opción "cualquier profesional disponible" + typeahead en la búsqueda de paciente.
3. **Unificar el código de color de la agenda** (estado, en todas las vistas) + leyenda. *(Respeta la decisión cerrada: color por estado, nunca por profesional.)*
4. **Paquetes legibles**: una sola terminología, un solo contador de saldo, y mostrar el saldo al agendar.
5. **Arreglar Reprogramar** para que use disponibilidad real (bug) + unificar microcopy ("Dar un turno") + sacar jerga técnica de los errores.

### 🌊 Ola 2 — Medir adopción (recién acá)

> Con el sistema limpio, si **todavía** cuesta, ahí sí es training/adopción — y se ataca con onboarding, no con código.

- Sentarse 1 hora al lado de **una** recepcionista y mirarla dar 3 turnos reales (observación, no encuesta).
- Instrumentar tiempo-por-tarea de "dar un turno" antes/después.
- Reactivar los tours (ya existen 17) una vez deployado el fix de anclas.

---

## 5. Decisiones de diseño ya cerradas — NO re-proponer

- **Color de agenda por ESTADO, no por profesional** (el dueño lo rechazó — Epic 15 archivado).
- **Paquete = bono manual y flexible** (se rechazó la generación automática por patrón semanal).
- **Ausentismo de paquete = decisión manual** (Recuperar/Consumir/Justificar; `absence_policy` determinista descartado).

---

## 6. Conclusión

El sistema **no es un fracaso de UX** ni hay evidencia de "rechazo del personal". Es un producto razonable corriendo en condiciones injustas: **build vieja + heladera vacía**. La secuencia correcta no es rediseñar — es **deployar, cargar datos, pulir 4-5 fricciones reales, y recién entonces medir si queda fricción humana.** Si después de la Ola 1 las recepcionistas siguen sufriendo, esa queja sí será señal limpia y la atacamos con onboarding.

> Próximo paso recomendado: **verificar el estado real de prod** (Ola 0, punto 1) para confirmar cuánto del dolor es deploy/datos antes de tocar una sola línea de diseño.
