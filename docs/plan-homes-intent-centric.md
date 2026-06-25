# Plan — Homes por rol con lente Intent-Centric

> Sesión de análisis 2026-06-25. Evaluación de las tres Home (`/recepcion`, `/mi-jornada`, `/inicio`)
> con el criterio: **una Home es un selector de TAREAS, no un tablero de datos**.
> Para cada rol: ¿qué intenta hacer? ¿la Home lo lleva ahí en un gesto, o solo lo *informa*?
> Todo lo de abajo está verificado contra el código real (anclas `archivo:línea`).

---

## Hallazgos transversales (los que cambian decisiones)

1. **La palanca: el puente turno→ficha no existe.** Las 3 Home comparten `ProximosTurnos` y
   `AgendaDayView`, y **ningún turno enlaza al paciente**. El patrón ya existe
   (`TurnoDetailModal.tsx:328-353` tiene "Ver ficha del paciente"), `patient_id` ya viaja en los datos
   (`useAppointments`/`useMyAgenda` con `select '*'`), y el deeplink `?tab=notas` ya funciona
   (`pacientes/[id]/page.tsx:110-116`). Arreglarlo una vez sirve a los tres roles.

2. **El médico está mal servido por FLUJO, no por módulos.** Su menú está bien acotado: NO sumar nada
   al sidebar del doctor. Lo que falta es el puente a la HCE (Epic 14 ya construida) desde su jornada.
   Además su "Mi agenda completa" (`MiAgendaCalendarView.tsx`) es un calendario **inerte** y el tour
   del doctor **promete** lo que no existe (`tours.ts:521`: "Tocá un turno para ver al paciente").

3. **"Confirmar un turno" NO es una acción real del dashboard hoy.** Verificado:
   - El chip "X confirmados" de recepción es **tautológico**: todo turno nace `status:'confirmed'`
     al crearse (`api/appointments/route.ts:76`). El chip ≈ "turnos de hoy". Dato muerto.
   - `status:'confirmed'` es **rechazado** por el schema de escritura (`absence-decision.schema.ts`,
     test `status/route.test.ts:164-170` espera 400). El "confirmado" que le importa a recepción es
     `attendance_confirmed`/`reminderState` (el **paciente** confirma el recordatorio de WhatsApp),
     y eso lo escribe **el agente** (Epic 12), no el dashboard. No hay endpoint para confirmar a mano.
   - **Bug latente:** el "Deshacer" del toast "Llegó" hace `POST /status {status:'confirmed'}`
     (`ProximosTurnos.tsx:248`) → 400 siempre. Falla en silencio.

4. **El gateo de cancelar NO está bloqueado** (hipótesis descartada): `PATCH /api/appointments/[id]/status`
   no tiene gate de rol, RLS permite a receptionist/doctor/admin (`status/route.ts:116`). Recepción ya
   lo usa para Llegó/No vino. **Cancelar desde la Home está desbloqueado.**

5. **El admin tiene una Home pasiva.** `/inicio` abre con reporting mensual y nunca con "qué requiere
   tu atención ahora". Las fuentes para una franja de excepciones **ya existen sin backend nuevo**:
   escaladas (`/api/conversations`, admite admin) y supresiones pendientes (`useDeletionRequests`).

6. **Gateo fantasma:** `/configuracion/agente` deja entrar a `doctor` por URL (read-only, sin secretos;
   `configuracion/agente/page.tsx:20`). Severidad baja, pero está fuera de su menú → decisión de higiene.

---

## Veredicto de módulos por rol (¿ve lo correcto?)

| Rol | Ve hoy | ¿Le falta un módulo? | ¿Le sobra? |
|---|---|---|---|
| **Recepción** | Inicio, Conversaciones, Calendario, Pacientes, Profesionales | **No.** Los gaps son de *acción* (cancelar, sin-confirmar), no de inventario. | "Profesionales" apunta a una pantalla de *configuración* para un rol no técnico → revisar si debe ser solo-lectura. |
| **Médico** | Inicio, Mi Agenda, Mi Disponibilidad, Pacientes | **No.** El gap es de *flujo* (puente a HCE), no de módulos. NO sumar nada al sidebar. | Acceso fantasma a `/configuracion/agente` por URL → cerrar (decisión). |
| **Admin** | Todo (10 destinos) | **No.** El problema es de *jerarquía*: abre con reporte en vez de excepciones. | Nada mal ubicado. No agregar grid de atajos (lo cubre el sidebar). |

**Conclusión de fondo:** ningún rol necesita módulos nuevos. Las tres Home fallan en lo mismo —
*informan* en vez de *dejar actuar*. El trabajo es convertir datos muertos en tareas de un gesto.

---

## Plan accionable — Epic "Homes Intent-Centric: del dato a la tarea"

Ordenado por palanca. Sin Server Actions, sin `zodResolver`, tenant del JWT, RLS filtra, tests Vitest.

### Story A — Puente turno→ficha (transversal) · **M** · sin backend
**Intención:** desde cualquier turno (en cualquier Home o "mi agenda"), abrir la ficha del paciente en un toque;
el médico aterriza en la pestaña clínica para cargar evolución, recepción/admin en la ficha general.
**Cambios:**
- Crear `src/lib/agenda/patient-ficha-href.ts` (+ test): `doctor → /pacientes/[id]?tab=notas`,
  resto → `/pacientes/[id]`. (El tab `notas` está gateado doctor/admin: deeplinkearlo a receptionist
  daría pantalla en blanco — por eso el destino clínico es **solo** para doctor.)
- `ProximosTurnos.tsx`: envolver el nombre del paciente (`:308-318`) en `<Link>` con `useUserRole`.
- `TurnoCard.tsx` (`:32-34`): ídem → cubre `AgendaDayView` sin tocarlo.
- `MiAgendaCalendarView.tsx` (`:120`): cablear `onSelectEvent` → navegar a la ficha (hoy es inerte).
  Cierra la promesa rota del tour del doctor.
**Reutiliza:** patrón Link de `TurnoDetailModal`, `patient_id` ya disponible, deeplink `?tab=` ya soportado.
**Crear nuevo:** solo el helper. **Riesgo:** guard de `patient_id == null`; `useUserRole` async (resolver en click).
**Beneficiarios:** los 3 roles. Es prerequisito de Story B.

### Story B — Home Médico: jornada clínica · **M** (núcleo S, depende de A)
**Intención:** que `/mi-jornada` represente "atender" (ver ficha + dejar evolución), no solo "quién viene".
**Cambios (`mi-jornada/page.tsx`):**
- Tira **"Resumen de hoy"** (Atendidos / Pendientes / Ausencias) derivada de `misTurnos` ya en memoria
  (cero API), reutilizando la clasificación de `ProximosTurnos.tsx:35-39`.
- El CTA por turno (de Story A) en modo clínico → `?tab=notas` (cargar evolución en 1-2 clics).
- Reencuadrar "Accesos rápidos" en clave clínica; evaluar acceso "Mis pacientes".
**Reutiliza:** HCE Epic 14 completa (cero cambios), `ProximosTurnos`, `useMyAgenda`. **Crear:** tira de resumen (presentacional).
**Veredicto:** NO agregar módulo "Métricas" al médico; la intención "cómo viene mi día" se cubre con la tira.

### Story C — Home Admin: puesto de mando · **M** (KPIs S + franja M)
**Intención:** abrir con "qué requiere tu atención" y poder profundizar en cada número.
**Cambios (`inicio/page.tsx`):**
- **C1 (S):** `PulsoCard` clickeables (`href` opcional). Turnos→`/agenda?vista=dia`; ocupación/no-shows/
  nuevos→`/metricas`; asistente→`/conversaciones`. (`/metricas` solo soporta `desde/hasta`, no anchors
  por-KPI; deep-link granular = mejora opcional.)
- **C2 (M):** franja **"Pendientes que te necesitan"** arriba del pulso. Componente nuevo
  `src/components/inicio/PendientesDelDueno.tsx`: escaladas (`/api/conversations`, mismo queryKey que
  recepción para compartir caché) + supresiones pendientes (`useDeletionRequests`). Estado "Estás al día"
  si todo en cero (patrón `recepcion/page.tsx:230-252`). Fail-soft por fuente.
**Reutiliza:** APIs y hooks existentes, estilo de franja de recepción. **Crear:** el componente + props `href`.
**NO hacer:** grid de atajos a equipo/servicios (sobrecarga; lo cubre el sidebar).
**Diferido:** "profesionales sin disponibilidad" (requiere endpoint/`has_schedules` — story aparte).

### Story D — Recepción: cancelar desde la Home · **S–M** · sin backend, desbloqueado
**Intención:** cancelar un turno sin tener que entrar a la agenda completa.
**Cambios:**
- Extraer `CancelConfirmInline` de `TurnoDetailModal.tsx:25-98` a componente compartido.
- `ProximosTurnos.tsx`: levantar `useAppointmentActions(hoyISO)`; agregar "Cancelar turno" al `KebabMenu`
  (`:384-446`). El hook ya deriva a `AbsenceDecisionDialog` si el turno es de un paquete.
**Reutiliza:** `/status`, `useAppointmentActions`, `AbsenceDecisionDialog`, confirmación de cancelar. **Crear:** solo el archivo extraído + wiring.
**Nota:** al migrar Cancelar al hook, migrar también "No vino" al mismo camino (hoy no usa el flujo de serie).

### Story E — Recepción: "sin confirmar" accionable · **S** · ⚠️ verificar E0 antes de construir
**Intención:** reemplazar el chip muerto "X confirmados" por "X **sin confirmar**" accionable.
**Scope (Decisión 2 = solo reflejar al agente):** recepción **solo VE** quién confirmó vía WhatsApp; NO se
agrega acción de "confirmar a mano" (Tier B descartado, sin endpoint nuevo).
**Cambios (`recepcion/page.tsx:82-84`, `:139-155`):** calcular con `reminderState(t) === 'unconfirmed'`
(no `status`); chip warn que, al click, filtra `ProximosTurnos` a solo los sin confirmar. Ocultar si no hay
ningún recordatorio enviado (evita "0" ruidoso).
- **E0 — Prerequisito de verificación (Decisión 1 = "no estoy seguro"):** confirmar que ISADI tiene
  recordatorios poblados antes de construir E. Chequeo concreto: contar `appointments` con
  `reminder_sent_at IS NOT NULL` (o `attendance_confirmed = true`) en prod del tenant ISADI. Si el conteo
  es 0, **E queda en pausa** hasta activar los recordatorios del agente (Epic 12). Mientras tanto, NO
  romper el chip actual: dejar "X confirmados" o quitarlo, pero no introducir "sin confirmar" vacío.

### Story F — Higiene · **S** · independiente
- Fix bug "Deshacer" de "Llegó" (`ProximosTurnos.tsx:240-261`, `status:'confirmed'`→400). La DB no tiene
  estado no-terminal de retorno → opciones: que `/status` acepte revertir, o quitar el "Deshacer".
- **Cerrar gateo `/configuracion/agente` para `doctor`** (`:20`) — Decisión 3 confirmada: el médico se
  redirige a `/mi-jornada`; el acceso por URL deja de existir.

---

## Decisiones de producto — RESUELTAS (sesión 2026-06-25)

1. **Recordatorios ISADI → "no estoy seguro".** Story E queda condicionada al chequeo **E0** (contar
   `reminder_sent_at IS NOT NULL` en prod del tenant ISADI). Si 0 → E se difiere.
2. **Confirmación telefónica (Tier B) → NO.** Recepción solo refleja el estado del agente; sin endpoint
   nuevo. Tier B eliminado del scope.
3. **Gateo médico `/configuracion/agente` → CERRAR.** Se excluye `doctor` (Story F). No se le da entrada a
   la KB.
4. **Admin "mi agenda de hoy" → ficha GENERAL** (asumido). El deeplink clínico `?tab=notas` es exclusivo del
   rol doctor (Story A).
5. **Diferidos (segunda oleada, no se descartan):** profesionales sin disponibilidad en la franja del dueño
   (requiere `has_schedules`/endpoint) y deep-link granular `/metricas#no-shows`. Quedan documentados para
   una oleada posterior; no entran en esta.

---

## Resumen de tamaños y secuencia

| Story | Qué | Tamaño | Backend | Dep. |
|---|---|---|---|---|
| A | Puente turno→ficha (transversal) | M | No | — |
| B | Home Médico: jornada clínica | M | No | A |
| C | Home Admin: puesto de mando (KPIs + franja) | M | No | — |
| D | Recepción: cancelar desde la Home | S–M | No | — |
| E | Recepción: "sin confirmar" accionable | S | (Tier B: sí) | Decisión 1 |
| F | Higiene (bug Deshacer + gateo doctor) | S | No | Decisión 3 |

**Secuencia sugerida:** A (palanca) → B + C + D en paralelo (no comparten archivos críticos) →
E/F según decisiones. F.bug-Deshacer puede ir primero como quick win.
