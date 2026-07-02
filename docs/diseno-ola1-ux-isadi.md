# Diseño — Ola 1 UX (fixes de interacción) · ISADI

- **Fecha:** 2026-06-30 · **Autora:** Sally (UX/UI · BMad)
- **Depende de:** `diagnostico-ux-isadi-2026-06-30.md`
- **Regla de validación:** todo cambio de UI va al **dev server local :3000 SIN commit**; jot4 valida o ajusta primero; recién con OK se commitea.
- **Qué NO entra acá** (es rollout/datos, no diseño): cargar horarios reales por profesional, cargar obras sociales de ISADI + filtro por tenant, redeploy de front/agente. Eso es la Ola 0.

> Recalibración con datos de prod: la causa raíz #1 (horarios genéricos) **no se arregla con diseño**. Estas specs atacan la **fricción de interacción que queda igual aunque los datos estén perfectos**, más un par de fixes que **hacen visible** cuándo el problema es de datos.

---

## P0 — Mayor ROI (el flujo que más usan, la fricción más pura)

### P0.1 — "Dar un turno" sin obligar a elegir profesional + búsqueda con typeahead
**Problema:** cadena de 4 selects bloqueados en cascada (servicio → profesional → fecha → horario). La recepcionista no puede pedir *"el primer horario libre con cualquiera"*, aunque a la paciente le dé igual. Y la búsqueda de paciente exige escribir + clickear "Buscar".

**Comportamiento propuesto:**
- En el select de profesional, agregar opción por defecto **"Cualquier profesional disponible"** (value especial). Si está elegida, la consulta de disponibilidad agrega los huecos de **todos** los profesionales que atienden el servicio; cada hueco muestra con qué profesional es (`09:00 · Aldo Luque`).
- Al elegir un hueco de "cualquiera", se fija el `professional_id` de ese hueco al guardar.
- Búsqueda de paciente: **typeahead** con debounce (~300 ms, mín. 2 caracteres) — sin botón "Buscar". Mantener el alta inline si 0 resultados.

**Microcopy:** placeholder profesional → "Cualquier profesional disponible". Buscador → "Buscá por nombre, DNI o teléfono…".

**Archivos:** `src/components/agenda/NewTurnoModal.tsx` (selects `:708-813`, búsqueda `:452-506`), `src/hooks/use-availability.ts`, `src/app/api/availability/route.ts` (soportar "sin professional_id" = todos).

**Esfuerzo:** M. **Validar en :3000.**

### P0.2 — Servicios no agendables: no ofrecer un callejón silencioso
**Problema (confirmado en prod):** 4 de 9 servicios activos (`Aquagym`, `Pilates`, `Hidroterapia`, `Rehab traumatológica`) tienen `booking_mode ≠ appointment` → nunca generan huecos. Elegirlos = "Sin horarios libres" sin explicación.

**Comportamiento propuesto (elegir 1):**
- **A (preferida):** en el modal de "dar un turno", listar solo servicios `booking_mode='appointment'`. Los demás se gestionan por su propio flujo (ciclo/walk-in).
- **B:** mostrarlos deshabilitados con nota "Este servicio no se agenda por turno (es por ciclo / sin turno)".

**Archivos:** `NewTurnoModal.tsx:110-118` (filtro del `useList` de services), `src/lib/schemas/appointment.schema.ts`.

**Esfuerzo:** S. **Validar en :3000.**

### P0.3 — (BUG) Reprogramar usa horarios reales
**Problema:** `RescheduleTurnoModal` usa `generateTimeSlots` (hardcode 08–20), ignorando la disponibilidad real — al revés que "Nuevo turno". Se puede reprogramar a una hora fuera del horario del profesional. **Es un bug, no una decisión.**

**Comportamiento:** reusar `useAvailability` igual que `NewTurnoModal`.

**Archivos:** `src/components/agenda/RescheduleTurnoModal.tsx:10,71`, `src/lib/utils/time-slots.ts` (dejar de usarlo acá).

**Esfuerzo:** S. **Validar en :3000.**

---

## P1 — Alto impacto, esfuerzo medio

### P1.1 — Estado vacío inteligente (distinguir "sin horario cargado" de "agenda llena")
**Problema:** cuando no hay huecos, todo se ve igual ("Sin turnos" / sin "+ Libre" / "lleno"). El usuario no puede distinguir *config incompleta* de *no hay disponibilidad*. (Aplica sobre todo a profesionales sin horario y servicios sin `service_professionals`.)

**Comportamiento propuesto:** cuando la API de disponibilidad devuelve 0 huecos, devolver también un **motivo** y que la UI muestre el mensaje correcto:
- Sin `professional_schedules` para el profesional → "Este profesional no tiene horarios cargados → **Configurar horarios**" (link a `/configuracion/profesionales`, solo admin).
- Sin `service_professionals` → "Este servicio no tiene profesionales asignados → **Asignar**".
- Hay horario pero todo ocupado → "Sin horarios libres para esta fecha (agenda completa)".

**Archivos:** `src/app/api/availability/route.ts` (enriquecer respuesta con `reason`), `NewTurnoModal.tsx:799-816`, `CalendarView.tsx:336-349`, `AvailabilitySlotPicker.tsx:101-105`.

**Esfuerzo:** M. **Validar en :3000.**

### P1.2 — Unificar el código de color de la agenda + leyenda
**Problema:** Día/Semana colorean por **servicio**; Mes/modal por **estado**. Mismo color, dos significados, sin leyenda.
**Comportamiento:** color por **ESTADO** en TODAS las vistas (respeta la decisión cerrada: nunca por profesional). Agregar **leyenda** visible (confirmado/completado/pendiente/no_show/cancelado). Diferenciar servicio por texto/ícono, no por color de fondo.
**Archivos:** `src/lib/agenda/service-visuals.ts`, `CalendarViewRangeReadOnly.tsx:48-63`, `CalendarView.tsx`, nuevo componente `AgendaLegend`.
**Esfuerzo:** M. **Validar en :3000.**

### P1.3 — Libre vs ocupado más legible
**Problema:** un hueco libre se distingue solo por borde punteado + opacidad — muy sutil.
**Comportamiento:** los huecos libres con tratamiento visual claro (fondo tenue + ícono "+", label "Libre"), contraste suficiente; los ocupados sólidos. Revisar densidad de la vista Semana (fuentes 9–11px).
**Archivos:** `CalendarView.tsx:382-419`, `CalendarViewRangeReadOnly.tsx:261-289`.
**Esfuerzo:** S. **Validar en :3000.**

### P1.4 — Paquetes legibles: una terminología, un saldo, visible al agendar
**Problema:** "paquete" vs "tratamiento" para lo mismo; dos contadores de saldo divergentes; el saldo no se ve al dar un turno normal.
**Comportamiento:**
- **Una sola palabra de cara al usuario** (recomiendo "paquete" en recepción; "tratamiento" solo en HCE médica). Unificar labels.
- **Un solo contador honesto** ("X de N realizadas · Y agendadas · faltan Z") en todos lados; `sessions_remaining` deja de mostrarse como segundo saldo.
- En `NewTurnoModal`, si el paciente+servicio tienen un paquete activo, mostrar un aviso "Esta persona tiene un paquete activo (faltan Z sesiones) → ¿agendar como sesión del paquete?".
**Archivos:** `PaquetesTracking.tsx`, `src/types/treatments.ts:97-110`, `NewTurnoModal.tsx`, microcopy de tabs en `pacientes/[id]/page.tsx`.
**Esfuerzo:** M–L. **Validar en :3000.**

---

## P2 — Pulido (bajo esfuerzo, baja urgencia)

- **P2.1** Unificar microcopy "Dar un turno" (card vs modal "Nuevo turno"). `recepcion/page.tsx:285`, `NewTurnoModal.tsx:445`. **S.**
- **P2.2** Sacar jerga técnica de errores ("tenant_id no disponible en el JWT" → "No pudimos validar tu sesión, volvé a entrar"). `NewTurnoModal.tsx:179,816`, `appointments/route.ts:19`. **S.**
- **P2.3** Botón "+ Nuevo turno" disponible también en vista Mes (hoy obliga a cambiar de vista). `AgendaView.tsx:330`. **S.**
- **P2.4** Mostrar duración del turno en el modal (hoy el fallback a 60 min es invisible). `NewTurnoModal.tsx:127`. **S.**

---

## Orden sugerido de implementación
1. **P0.3** (bug reprogramar) — rápido y elimina un riesgo clínico real.
2. **P0.1** (cualquier profesional + typeahead) — el corazón de "dar un turno es difícil".
3. **P0.2** (servicios no agendables) — barato, mata un callejón.
4. **P1.1** (estado vacío inteligente) — hace visible el problema de datos.
5. **P1.2 + P1.3** (color + legibilidad agenda).
6. **P1.4** (paquetes legibles).
7. **P2.x** en una pasada de pulido.

Cada ítem se implementa, se ve en **:3000**, jot4 valida, y recién ahí se commitea.
