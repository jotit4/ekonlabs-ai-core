# User Journeys por Rol — Onboarding del Dashboard

> **Propósito:** fuente de verdad para el onboarding del staff (tours guiados con driver.js + videos walkthrough).
> Cada journey está anclado en el sistema real (rutas e IDs verificados en código), no en suposiciones.
> Un mismo journey alimenta los dos formatos: los **pasos numerados** son los steps del tour Y el guion del video.

**Contexto:** primer cliente ISADI (clínica, Mendoza). Tenant `5298fcc5-15bf-494c-9655-b49d759cfef4`.
**Roles del sistema:** `receptionist`, `doctor`, `admin` (definidos en `src/types/index.ts:3`, sidebar dinámico en `src/components/AppSidebar.tsx`).

---

## Principio rector (mensaje #1 de TODO onboarding)

> **El agente IA hace el grueso del trabajo solo.** Atiende WhatsApp, agenda turnos, responde consultas.
> **El humano interviene por excepción.** No tenés que "operar" todo el día: el sistema trabaja para vos y vos entrás cuando aparece una señal concreta.

Este encuadre es lo que baja la ansiedad del staff. Va primero en cada tour y en cada video, antes de cualquier "cómo hacer X".

---

## El semáforo de conversaciones

Decisión de negocio (2026-06-08): **🟡 Amarillo = "atendé, te necesita".** El color accionable es el amarillo.

| Color | Situación del agente | Significado para el staff |
|---|---|---|
| 🟡 Amarillo | pide intervención (`needs_intervention`) **o** confianza baja | **ATENDÉ** — te necesita |
| 🟢 Verde | confianza alta **o** media ("revisando…") | El agente la maneja, no la toques |
| 🔵 Azul | un humano ya tomó el control (`human_takeover`) | Vos tenés el control |
| ⚪ Gris | resuelta (`resolved`) | Cerrada |

**Orden de la bandeja:** dentro de los amarillos, los `needs_intervention` van arriba (más urgentes primero). Un solo color para el staff, pero el orden comunica prioridad.

> ✅ **Resuelto (2026-06-25):** `statusToVariant` en `src/components/conversaciones/ConversationListItem.tsx` ya mapea con la convención "amarillo = accionable" (`needs_intervention` y `ai_active` + confianza baja → amarillo; confianza alta/media → verde). El vocabulario del tour coincide con la pantalla.

---

## 🟢 Journey — Recepcionista

**Encuadre:** *"Antes agendabas todo a mano. Ahora el agente agenda solo; vos supervisás la agenda de toda ISADI y solo entrás a las conversaciones en amarillo."*

**Menú visible:** Conversaciones · Calendario · Pacientes · Profesionales (`AppSidebar.tsx:20-25`)

### Día típico (pasos = steps del tour)

| # | Acción | Pantalla / Ruta | Ancla para el tour |
|---|---|---|---|
| 1 | **Abro mi día y reviso la bandeja** → ¿hay 🟡 amarillos? Esos son míos. | `/conversaciones` | lista `ConversationListSidebar` |
| 2 | **Abro un amarillo** y leo el hilo del paciente. | `/conversaciones/[id]` | `ConversationListItem` (StatusDot) |
| 3 | **Tomo el control** de la conversación. | hilo | botón Takeover → *crear* `data-tour="takeover-btn"` (`TakeoverBar.tsx`) |
| 4 | **Respondo** al paciente. | hilo | input respuesta → *crear* `data-tour="reply-input"` |
| 5 | **Devuelvo el control al agente** cuando terminé. | hilo | botón Release → *crear* `data-tour="release-btn"` |
| 6 | **Gestiono la agenda de ISADI** (reprogramo, cancelo, agendo lo presencial/telefónico). | `/agenda` | botón "Nuevo turno" → *crear* `data-tour="new-appointment-btn"` |
| 7 | **Creo un turno:** busco al paciente, elijo servicio + profesional + hueco libre. | modal `NewTurnoModal` | `#patient-search-input` · `#service-select` · `#professional-select` · `#date-input` · `#time-select` |
| 8 | **Paciente nuevo:** lo creo inline. | modal | `#create-patient-form` · `#cp-full-name` · `#cp-phone` · `#cp-dni` |
| 9 | **Actualizo una ficha** de paciente. | `/pacientes`, `/pacientes/[id]` | `#patient-search-input` |
| 10 | **Corrijo al agente** si respondió mal algo. | modal `CorreccionAgenteModal` | botón "Corregir" → *crear* `data-tour="correct-kb-btn"` |

### Momentos de duda (botón "?" persistente reactiva el tour del flujo actual)
- "¿Cómo tomo el control sin romper lo que venía haciendo el agente?" → pasos 3-5.
- "El paciente no existe, ¿qué hago?" → paso 8.
- "¿Qué turno está libre?" → paso 7 (huecos libres por profesional, Story 10.7).

---

## 🔵 Journey — Doctor / Profesional

**Encuadre:** *"Vos no gestionás la clínica entera. Definís cuándo estás disponible y mirás tus propios turnos. El agente agenda automáticamente dentro de tu disponibilidad."*

**Menú visible:** Mi Agenda · Mi Disponibilidad · Pacientes (`AppSidebar.tsx:26-30`)
Entra **a diario**.

### Día típico

| # | Acción | Pantalla / Ruta | Ancla para el tour |
|---|---|---|---|
| 1 | **Veo mi día** → solo mis turnos, no los de otros profesionales. | `/agenda/mi-agenda` (auto-redirect) | calendario filtrado a su `professional_id` |
| 2 | **Abro la ficha del paciente** del turno que voy a atender. | turno → `/pacientes/[id]` | detalle de turno |
| 3 | **Reviso historial y cargo notas clínicas.** | `/pacientes/[id]` | permiso `edit` (doctor) |
| 4 | **Ajusto mi disponibilidad** cuando cambia algo: bloqueo una ausencia o vacaciones. | `/mi-disponibilidad` | editor de horarios + bloqueos |
| 5 | **Actualizo mi perfil** (ocasional): especialidad, matrícula, contraseña. | `/mi-perfil` | formulario perfil |

### Momentos de duda
- "¿Por qué no veo la agenda de los demás?" → por diseño; vos ves solo la tuya (paso 1).
- "Me voy una semana, ¿cómo evito que el agente me agende?" → bloqueo de disponibilidad (paso 4).

---

## 🟠 Journey — Admin / Dueño

**Encuadre:** *"Todo lo de recepción + el control del agente, los usuarios y los números del negocio."* Uso menos frecuente pero más profundo.

**Menú visible:** Conversaciones · Calendario · Pacientes · Configuración · Métricas · Usuarios · Servicios · Profesionales · Auditoría · Supresiones (`AppSidebar.tsx:31-42`)

### Tareas clave

| # | Acción | Pantalla / Ruta | Ancla para el tour |
|---|---|---|---|
| 1 | **Configuro al agente:** nombre, tono/identidad, qué puede hacer, ventanas de operación. | `/configuracion/agente` | `#agent_name` · `#ia_config.identity` · `#ia_config.tone_base` · `#prompt_rules` · `#operations_config.min_notice_hours` · `#operations_config.future_window_days` |
| 2 | **Cargo conocimiento** (Knowledge Base): subo documentos, edito fuentes. | `/configuracion/agente` | `KnowledgeBaseManager` |
| 3 | **Pruebo sin riesgo** con Shadow Mode antes de impactar pacientes reales. | `/configuracion/agente` | `ShadowModeToggle` (admin only) |
| 4 | **Doy de alta al staff:** creo recepcionista/doctor, activo/desactivo. | `/configuracion/usuarios` | botón crear → *crear* `data-tour="create-user-btn"` |
| 5 | **Configuro servicios y profesionales:** duraciones, horarios, asignaciones. | `/configuracion/servicios`, `/configuracion/profesionales` | formularios de servicio/profesional |
| 6 | **Miro los números:** tiempos de respuesta, resolución, tendencias. | `/metricas` | dashboard KPIs |
| 7 | **Superviso cumplimiento:** quién cambió qué; pedidos de borrado de datos. | `/configuracion/auditoria`, `/configuracion/supresion` | `#audit-filter-action` · `#audit-filter-user` · `#audit-filter-from` · `#audit-filter-to` |

---

## Anexo técnico — Anclas para driver.js

**Estado actual:** la mayoría de los formularios críticos **ya tienen `id` estables** (NewTurnoModal, AgentPromptEditor, AuditFilters, formulario de paciente). El tour es robusto sobre esos.

**Anclas a crear** (`data-tour="..."` en botones sin id estable, antes de construir los tours):

| Elemento | Atributo a agregar | Archivo |
|---|---|---|
| Botón "Nuevo turno" | `data-tour="new-appointment-btn"` | componente de `/agenda` |
| Botón Takeover | `data-tour="takeover-btn"` | `TakeoverBar.tsx` |
| Input/botón Responder | `data-tour="reply-input"` / `reply-btn` | `ConversationThread.tsx` |
| Botón Release | `data-tour="release-btn"` | `TakeoverBar.tsx` |
| Botón "Corregir" KB | `data-tour="correct-kb-btn"` | `CorreccionAgenteModal.tsx` (trigger) |
| Botón crear usuario | `data-tour="create-user-btn"` | `UserManagementView.tsx` |

**Regla:** anclar a `id` / `data-tour` / `aria-label`, **nunca** a clases de Tailwind (son dinámicas y rompen el tour).

**Disparo por rol:** el tour debe leer el rol del usuario logueado (`use-current-tenant.ts` expone `role`) y cargar solo el journey correspondiente. El botón "?" persistente reactiva el tour de la pantalla actual.

---

## Estado de implementación del onboarding (2026-06-25)

Los prerequisitos técnicos están cumplidos y el tutorial cubre **los tres roles + los módulos profundos**. Fuente de verdad del código: `src/lib/onboarding/tours.ts` (`getTourForRoute`).

**Núcleo (ya cableado):** `OnboardingProvider` (auto-dispara el tour en la primera visita a cada pantalla + botón "?" persistente para relanzarlo) · `storage.ts` (flag `ekonlabs:tour-seen:{tourId}` en localStorage) · semáforo remapeado a "amarillo = accionable".

**Cambio clave de esta actualización:** cada rol ahora aterriza en su **landing** (`/recepcion`, `/mi-jornada`, `/inicio`), no en `/conversaciones`. Antes el tour de bienvenida no se disparaba porque solo arrancaba en `/conversaciones`. Ahora el **principio rector** vive en el tour de cada landing, que es la primera pantalla que ve el usuario.

### Tours implementados (rol → ruta → id)

| Rol | Ruta | Tour (id) |
|---|---|---|
| receptionist | `/recepcion` | `receptionist-recepcion` *(principio rector)* |
| doctor | `/mi-jornada` | `doctor-mi-jornada` *(principio rector)* |
| admin | `/inicio` | `admin-inicio` *(principio rector)* |
| receptionist + admin | `/conversaciones` | `conversaciones` *(semáforo, búsqueda, filtro)* |
| receptionist + admin | `/conversaciones/[id]` | `conversacion-detalle` *(contexto del agente, takeover, responder, liberar, corregir, resolver, notas)* |
| receptionist + admin | `/agenda` | `agenda` *(nuevo turno)* |
| los tres | `/pacientes` | `pacientes-lista` *(buscar, alta)* |
| receptionist | `/pacientes/[id]` | `paciente-ficha` *(solapas + editar)* |
| doctor + admin | `/pacientes/[id]` | `paciente-hce` *(notas clínicas, antecedentes, evolución, historial)* |
| doctor | `/mi-disponibilidad` | `doctor-mi-disponibilidad` *(horarios + bloqueos)* |
| doctor | `/agenda/mi-agenda` | `doctor-mi-agenda` |
| admin | `/configuracion/agente` | `admin-configuracion-agente` *(identidad, reglas, ventanas, shadow mode, KB, guardar)* |
| admin | `/metricas` | `admin-metricas` |
| admin | `/configuracion/usuarios` | `admin-usuarios` |
| admin | `/configuracion/auditoria` | `admin-auditoria` |
| admin | `/configuracion/servicios` | `admin-servicios` |
| admin | `/configuracion/profesionales` | `admin-profesionales` |

### Anclas
Las anclas nuevas (`data-tour="..."`) ya están insertadas en las landings, la topbar, las features nuevas de conversaciones (búsqueda, contexto del agente, resolver, notas), la ficha del paciente / HCE / paquetes, mi-disponibilidad, métricas y configuración del agente. Donde ya existía un `id` estable (formularios de configuración, auditoría, servicios, profesionales) el tour referencia ese `id` directamente. Los `id` con punto se referencian como `[id="..."]`.

### Pendiente (no bloqueante)
- **Videos de visión por rol** (60-90 s) derivados de estos journeys — ver sección siguiente.
- Tours interactivos más profundos dentro de modales (Nuevo turno paso a paso, Nuevo paquete) si el soporte lo pide.

---

## Formato de videos (derivado de estos journeys)

- **1 video corto de visión por rol** (máx. 60-90 s): el principio rector + los 3-4 momentos clave. No paso-a-paso de cada clic (se desactualiza y genera más soporte).
- Tono: frases simples, segunda persona, una acción por frase. Mismos pasos numerados de cada journey.
- Los tours interactivos cubren el "cómo hago esto AHORA"; los videos cubren el "qué es y por qué".
