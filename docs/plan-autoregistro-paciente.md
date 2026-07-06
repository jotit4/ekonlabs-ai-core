# Plan: Autoregistro del paciente

> Documento de PLANIFICACIÓN (no implementa código). Feature nuevo para el dashboard ekonlabs (tenant piloto: ISADI).
> Autor: investigación sobre el código en `ekonlabs-dashboard/`. Fecha: 2026-07-06.

---

## 1. Resumen y objetivo

**Problema (feedback de staff de ISADI).** Hoy la secretaria tipea a mano todos los datos de cada paciente nuevo (nombre, DNI, teléfono, obra social, etc.). Tarda **~7 min por paciente** y llegan **8–10 pacientes nuevos por sesión**, o sea ~1 hora de tipeo administrativo por sesión, tiempo que se resta de atender el mostrador y el teléfono.

**Objetivo.** Que el **propio paciente** cargue sus datos desde su celular a través de un **link público** (sin necesidad de cuenta), y que la secretaria pase de **tipear** a **revisar**: ve lo que el paciente cargó, y con un click lo **aprueba**, lo **edita** si algo no cierra, o lo **rechaza / llama** si hay un problema. El resultado es un paciente activo en el sistema con la carga hecha por el paciente.

**Métrica de éxito.** Reducir el tiempo de la secretaria por paciente nuevo de ~7 min (tipeo) a <1 min (revisión), y bajar errores de tipeo (DNI, teléfono, obra social).

**No-objetivos (de esta primera etapa).** Que el paciente saque turno solo, que el paciente tenga login/cuenta persistente, o autogestión de historia clínica. Eso queda para incrementos posteriores (ver §7).

---

## 2. Estado actual del código (hallazgos de la investigación)

Resumen de lo que ya existe y condiciona el diseño. Rutas relevantes al final de cada punto.

1. **Tabla `patients`** — `supabase/migrations/20260407231711_005_patients_appointments.sql` (+ extensiones 013, 042, 007):
   - Campos: `patient_id` (PK uuid), `tenant_id` (FK → `tenants`, ON DELETE CASCADE), `phone_number` (NOT NULL, `char_length ≥ 7`), `full_name` (NOT NULL, `≥ 2`), `dni` (CHECK `^\d{7,8}$`, **nullable**), `date_of_birth`, `email`, `obra_social`, `obra_social_number`, `notes`, `reason_for_visit`, `alternative_phone`, `address`, campos clínicos `antecedentes`/`alergias`/`medicacion` (HCE, solo doctor/admin), `deletion_requested_at`/`deletion_effective_at`, `created_at`/`updated_at`.
   - **`UNIQUE(tenant_id, phone_number)`** ← restricción dura a nivel DB. Un INSERT con teléfono repetido dentro del tenant tira `23505`.
   - **DNI NO tiene UNIQUE** en la DB. Hay un índice **no único** `idx_patients_dni (tenant_id, dni)`. La unicidad de DNI se valida **a nivel aplicación** en la API Route (SELECT antes del INSERT → 409). Ver `src/app/api/patients/route.ts` líneas 45–60.

2. **RLS de `patients`** — `supabase/migrations/20260511000000_patients_rls.sql`:
   - `patients_select_own`, `patients_insert_own`, `patients_update_own`: todas **para el rol `authenticated`** con `USING/WITH CHECK tenant_id::text = auth.jwt() ->> 'tenant_id'`.
   - `patients_delete_restricted`: `USING (false)` (nadie borra por RLS; el borrado es lógico vía `deletion_requested_at`).
   - **El rol `anon` NO tiene ninguna policy** sobre `patients` → RLS lo deniega por defecto. **Un visitante anónimo del portal público NO puede insertar en `patients` con el cliente anon.** (Consecuencia de diseño, ver §5.)

3. **Alta actual (dashboard, autenticada):**
   - Formulario: `src/components/pacientes/PatientForm.tsx` (modo `create`/`edit`, react-hook-form + `standardSchemaResolver`).
   - Schema Zod: `src/lib/schemas/patient.schema.ts` (`PatientFormSchema` = `PatientApiSchema`). `tenant_id` **nunca** viaja en el body.
   - Endpoint: `src/app/api/patients/route.ts` (`POST`): valida sesión (`getUser`+`getSession`), saca `tenant_id` y `role` del JWT (`parseJwtPayload`), exige rol `receptionist`|`admin`, valida body, chequea DNI duplicado, limpia strings vacíos a `null`, inserta con `tenant_id` del JWT, mapea `23505` → 409 (teléfono), y registra `logAudit`.

4. **Auth / resolución de tenant:**
   - JWT: el claim `tenant_id` (y `role`) lo inyecta `custom_access_token_hook` leyendo `dashboard_users` — `supabase/migrations/20260506224817_custom_token_hook.sql`. **Solo los usuarios del staff (`dashboard_users`) tienen tenant en el JWT.**
   - **Los pacientes NO tienen cuenta.** No hay tabla de auth de pacientes. Confirmado: el portal público **no puede** apoyarse en un JWT de dashboard.
   - Clientes Supabase: `src/lib/supabase/server.ts` (SSR anon, cookies), `src/lib/supabase/client.ts` (browser anon), `src/lib/supabase/admin.ts` (`createServiceRoleClient`, `server-only`, **bypassa RLS**). El service-role ya se usa en `src/app/api/usuarios/route.ts` y `src/app/api/profesionales/route.ts` para escrituras con tenant explícito.
   - Middleware: `src/proxy.ts` — protege `/agenda`, `/pacientes`, `/conversaciones`, `/configuracion`, `/metricas`; **borra cualquier `x-tenant-id` que venga del cliente**; el matcher excluye `/api`.

5. **No existe slug ni identificador público de tenant.** `grep slug` en `src/` y migraciones = nada aplicable. `tenants` (`supabase/migrations/20260326141345_bootstrap_core.sql`) tiene `tenant_id`, `name`, `whatsapp_number` (UNIQUE), `timezone`, `status`, `rules jsonb`, etc. — **ningún campo pensado como identificador público**. Para el link público hay que **crear uno** (token opaco recomendado, ver §5).

6. **Listado de pacientes:** `src/app/(dashboard)/pacientes/page.tsx` — usa Refine `useList<Patient>` sobre el recurso `patients` (RLS filtra por tenant), con joins a `appointments` y estado derivado de `conversations`. La **cola de revisión** puede seguir este mismo patrón (§4).

7. **Sin infraestructura anti-spam.** `grep` de `rate.?limit|captcha|turnstile|recaptcha` en `src/` = **nada**. Habrá que introducirla para el endpoint público (§5).

8. **Otros:** `appointments.booked_via` ya admite `'web'` (útil para el incremento "solicitar turno"). `patient_consents` (`...009_patient_consents.sql`) guarda opt-in por `phone_hash` (Ley 25.326) — reutilizable para el consentimiento del formulario público. El proxy a FastAPI (`src/app/api/fastapi/[...path]/route.ts`) es un stub 404; el envío por WhatsApp se hace vía el agente `ekonlabs-agent` (repo separado).

**Restricciones del proyecto a respetar (de `CLAUDE.md`/`AGENTS.md`):** solo **API Routes** (no Server Actions); `tenant_id` **del JWT** en requests autenticadas; RLS filtra por tenant; **no** `zodResolver` (usar `standardSchemaResolver`); **no** `admin.ts` desde componentes/hooks; Next.js **16.2.4** (leer `node_modules/next/dist/docs/` antes de tocar APIs de Next); leer schema desde `supabase/migrations/` (no MCP).

---

## 3. Flujo end-to-end

```
┌────────────┐   link público    ┌─────────────────────┐   POST público     ┌──────────────────────┐
│  Paciente  │ ────────────────▶ │  Formulario web     │ ─────────────────▶ │  patient_registrations│
│ (celular)  │  /registro/{token}│  público (sin login)│  /api/registro/... │  status = 'pending'   │
└────────────┘                   └─────────────────────┘  (service role)    └──────────┬───────────┘
                                                                                        │
    ┌───────────────────────────────────────────────────────────────────────────────  ▼
    │  Dashboard (secretaria, autenticada, RLS por tenant)
    │  Cola de revisión: /pacientes/registros
    │    • ve la lista de pendientes de SU tenant
    │    • el sistema marca posibles duplicados (mismo teléfono/DNI ya en `patients`)
    │    • acciones:
    │        ✅ Aprobar  → UPSERT en `patients` (reusa dedup + validación) → status='approved' + patient_id
    │        ✏️ Editar   → corrige campos y luego aprueba
    │        ❌ Rechazar → status='rejected' (motivo opcional) → la secretaria puede llamar
    │        🔀 Fusionar → vincula a un `patients` existente (paciente que volvió) → status='merged'
    └───────────────────────────────────────────────────────────────────────────────────────────────
                                                                                        │
                                                                                        ▼
                                                                               Paciente ACTIVO en `patients`
```

**Paso a paso:**

1. **El paciente abre el link.** `/registro/{token}` (público, fuera de `PROTECTED_PATHS`). La página lee el token, resuelve el tenant **en el servidor** (SSR/route handler con service role) solo para mostrar el nombre de la clínica y el texto de consentimiento. Si el token es inválido/revocado/expirado → página neutra "link no válido, contactá a la clínica" (sin filtrar nada).
2. **Completa el formulario.** Reusa los campos y validaciones del alta actual (nombre, teléfono, DNI, fecha nac., email, obra social en cascada, domicilio, motivo). Incluye **checkbox de consentimiento** (Ley 25.326) obligatorio.
3. **Envía.** `POST /api/registro/{token}` (público). El endpoint: valida token → tenant, valida payload (Zod), corre anti-spam (rate-limit + captcha + honeypot), inserta una fila en **`patient_registrations`** con `status='pending'`, `source='public_link'`, `submitted_at`. Registra el consentimiento en `patient_consents`. **Responde siempre un genérico "recibido"** (no confirma ni niega si el teléfono/DNI ya existe — anti-enumeración, §5).
4. **Estado "pendiente de revisión".** La fila queda en staging, **sin tocar `patients`**. No aparece en búsquedas de pacientes ni en las consultas del agente.
5. **La secretaria lo ve en la cola.** Nueva vista `/pacientes/registros` (o pestaña/badge en `/pacientes`) que lista los pendientes del tenant (RLS). Badge con contador de pendientes en la navegación.
6. **Detección de duplicados en la revisión.** Al abrir un registro, el sistema busca en `patients` del tenant por teléfono y por DNI y muestra "⚠️ ya existe un paciente con este teléfono/DNI" con link a la ficha. (Esto ocurre **del lado autenticado**, nunca en el endpoint público.)
7. **Acción de la secretaria:**
   - **Aprobar** → el backend hace UPSERT en `patients` reutilizando la lógica del alta (dedup DNI, mapeo 409 de teléfono). Marca el registro `approved` y guarda el `patient_id` resultante. `logAudit`.
   - **Editar** → corrige campos del registro (o directamente del alta) y aprueba.
   - **Rechazar** → `status='rejected'` con motivo; queda para auditoría; la secretaria puede llamar al teléfono cargado.
   - **Fusionar** (paciente que volvió, teléfono ya existente) → vincula al `patients` existente y opcionalmente actualiza campos; `status='merged'`.
8. **Paciente activo.** Desde ese momento vive en `patients` como cualquier otro; el turno/agenda/HCE funcionan igual.

---

## 4. Modelo de datos

### Decisión: tabla de staging `patient_registrations` (RECOMENDADA), no reusar `patients` con un flag de estado.

Se evaluaron dos opciones.

#### Opción A — Reusar `patients` + columna `registration_status`
Agregar `registration_status text NOT NULL DEFAULT 'active' CHECK (in ('pending','active','rejected'))` a `patients`; el formulario público inserta filas `pending`.

- **A favor:** una sola tabla; reusa RLS/joins/listado; al aprobar no se copia nada; los FK de `appointments`/HCE ya apuntan bien.
- **En contra (bloqueantes):**
  1. **Choca con `UNIQUE(tenant_id, phone_number)`.** Si el paciente que se autoregistra ya existe (paciente que volvió, o *stub* creado por el agente vía WhatsApp), el INSERT falla con `23505`. Habría que degradar la constraint a un índice único parcial `WHERE registration_status <> 'pending'`, lo que **debilita una garantía de integridad** que hoy protege a los pacientes reales.
  2. **Contamina la tabla canónica** con datos crudos sin revisar (y potencial spam). Todo lo que hoy consulta `patients` — búsquedas, contadores, KPIs y **el agente `ekonlabs-agent` (repo separado)** — pasaría a ver pacientes `pending` salvo que **cada query** agregue `registration_status='active'`. Es un cambio transversal, frágil y fácil de olvidar (riesgo de fuga de datos no revisados al flujo del agente).
  3. La policy `patients_insert_own` es **solo `authenticated`**; el insert público **igual** tendría que ir por service role, así que no se ahorra el endpoint especial.

#### Opción B — Tabla de staging `patient_registrations` ✅ (recomendada)

Tabla nueva, aislada de `patients`. Bosquejo:

```sql
CREATE TABLE public.patient_registrations (
  registration_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  -- datos cargados por el paciente (mismos campos que el alta, todos revisables)
  full_name           text,
  phone_number        text,
  dni                 text,
  date_of_birth       date,
  email               text,
  obra_social         text,
  obra_social_number  text,
  reason_for_visit    text,
  alternative_phone   text,
  address             text,
  -- workflow
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','merged')),
  source              text NOT NULL DEFAULT 'public_link'
                        CHECK (source IN ('public_link','whatsapp')),
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_by         uuid,                 -- dashboard_users.user_id
  reviewed_at         timestamptz,
  reject_reason       text,
  resulting_patient_id uuid REFERENCES public.patients(patient_id) ON DELETE SET NULL,
  submitted_ip        inet,                 -- para rate-limit/forense (no exponer en UI)
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_patient_reg_tenant_status ON public.patient_registrations (tenant_id, status, submitted_at DESC);
```

- **Nota clave sobre unicidad:** la staging **NO** replica `UNIQUE(tenant_id, phone_number)`. Un paciente que ya existe puede igual autoregistrarse; el conflicto se resuelve **en la revisión** (merge vs. crear), no lo decide la DB ni se expone al visitante. Se puede agregar una unicidad **suave** por `(tenant_id, phone_number)` solo entre `pending` para evitar que el mismo teléfono genere 50 pendientes (índice único parcial `WHERE status='pending'`) — decisión menor, ver preguntas abiertas.
- **RLS:**
  - `SELECT`/`UPDATE` para `authenticated` con `tenant_id = auth.jwt() ->> 'tenant_id'` (la cola de revisión, idéntico patrón a `patients`).
  - **Ninguna policy para `anon`** (el insert público va por **service role**, que bypassa RLS — igual que `usuarios`/`profesionales`). El endpoint es el único punto de entrada de escritura pública.

**A favor de B:** mantiene `patients`, el agente y los KPIs **intactos** (cero riesgo de fuga de datos crudos); la revisión es una **compuerta explícita**; el spam nunca toca datos de pacientes; aprobar = reusar la lógica de alta ya probada; auditoría natural (quién revisó qué y cuándo). **En contra:** cierta duplicación de columnas y una copia de campos al aprobar; algo más de código (tabla + endpoints + UI de cola). El costo extra es chico frente al riesgo que elimina.

**Recomendación final: Opción B.** El factor decisivo es la combinación de (1) el `UNIQUE(tenant_id, phone_number)` que hace inseguro insertar público directo en `patients`, y (2) no querer que datos no revisados entren al flujo del agente/KPIs.

---

## 5. Tenant y seguridad en un formulario PÚBLICO (sin JWT)

Este es el punto más delicado: el visitante no tiene JWT de dashboard, y `anon` no puede leer/escribir `patients`.

### 5.1 Cómo se resuelve el tenant

**Recomendado: token opaco de alta entropía por clínica**, resuelto **en el servidor** con service role.

- Agregar a `tenants` (o a una tabla `registration_links` para tokens por-link, ver abajo) un `public_registration_token text UNIQUE` (p.ej. 32 bytes base62, **no adivinable, no enumerable**), más `public_registration_enabled boolean` y `public_registration_token_rotated_at`.
- El link es `/registro/{token}`. La página (RSC/route handler) y el `POST /api/registro/{token}` **resuelven `tenant_id` server-side** con `createServiceRoleClient()` (`SELECT tenant_id FROM tenants WHERE public_registration_token = {token} AND public_registration_enabled AND status='active'`).
- **El token es una capacidad de solo-escritura acotada:** habilita únicamente "crear un registro `pending` para este tenant". **Nunca** habilita leer pacientes ni ningún otro dato.
- **Por qué token opaco y no slug:** un slug legible (`/registro/isadi`) es enumerable/adivinable. Como el endpoint **solo escribe** y nunca lee, un slug no filtra datos, pero facilita spam dirigido y "descubrir" clínicas. El token opaco reduce esa superficie. (Si se quiere URL bonita, se puede tener `slug` para el path *y* exigir el token como parámetro, pero agrega complejidad; para el MVP, token opaco solo.)

**Descartado: cliente `anon` con RLS específica.** Se podría crear una policy `INSERT` para `anon` en `patient_registrations`. Problema: `anon` no tiene forma segura de fijar el `tenant_id` correcto (el `WITH CHECK` no puede leer un tenant "del token" sin exponer el token dentro de la policy), y abre una policy pública sobre la DB que es más difícil de razonar/auditar que un único endpoint server-side. **El endpoint con service role acotado es más simple y más auditable.**

### 5.2 Seguridad del endpoint público

Invariantes **obligatorios**:

1. **Nunca exponer ni permitir enumerar pacientes.** El endpoint público **solo INSERTA** en `patient_registrations`. No hace `SELECT` sobre `patients` que devuelva datos al cliente. La **detección de duplicados ocurre del lado autenticado** (en la cola de revisión), jamás en la respuesta pública.
2. **Respuesta idéntica siempre.** Ante teléfono/DNI ya existente, token válido pero sin cambios, etc., **siempre** responder el mismo `200 {ok:true}` genérico. Nada de "ese DNI ya está registrado" (eso sería un oráculo de enumeración). Si el token es inválido, respuesta neutra de "link no válido".
3. **Service role es `server-only`.** `admin.ts` nunca llega al browser (regla AR15). El token del tenant tampoco se usa para nada en el cliente salvo formar la URL.
4. **Anti-spam (hay que introducirlo, no existe hoy):**
   - **Rate-limit** por IP y por token (p.ej. N envíos/hora). Como no hay infra, opciones: contador en DB (tabla o `submitted_ip`+ventana), un limiter en memoria (no sirve en multi-instancia), o **Upstash Redis / Vercel KV** (recomendado si el deploy lo permite; confirmar en EasyPanel).
   - **CAPTCHA** invisible (Cloudflare Turnstile o hCaptcha) en el formulario, verificado server-side. No hay ninguno hoy → decisión de producto + una env var de secret.
   - **Honeypot** (campo oculto que un bot llena) + **tiempo mínimo** de completado.
   - **Límite de payload** y validación estricta con `PatientFormSchema` (reusado). Cap de pendientes por tenant/día para frenar floods.
5. **Token rotable/revocable.** `public_registration_enabled=false` apaga el link al instante; rotar el token invalida links viejos (útil si se filtró un QR).
6. **Rutas fuera de auth.** `/registro/**` **no** se agrega a `PROTECTED_PATHS` en `src/proxy.ts`; el matcher del proxy ya excluye `/api`, así que `/api/registro/**` no pasa por el chequeo de sesión. Verificar que el endpoint no dependa de cookies de sesión.
7. **Ley 25.326.** Consentimiento explícito en el form; registrar en `patient_consents` (`phone_hash`) al enviar. Texto legal + finalidad del tratamiento de datos.
8. **Auditoría.** Registrar el envío (source, ip hasheada/tenant) y cada acción de revisión (`logAudit`: aprobar/rechazar/fusionar).

### 5.3 Tokens por-link (opcional, refuerza WhatsApp)

Para el envío por WhatsApp conviene un token **por-link** (no el token fijo de la clínica): tabla `registration_links(link_id, tenant_id, token UNIQUE, phone_prefill, expires_at, used_at, created_by)`. Permite expiración, un solo uso, y prellenar el teléfono de la conversación. El MVP puede empezar con el token fijo por clínica y agregar `registration_links` en el incremento de WhatsApp.

---

## 6. Puntos de entrada del link

1. **Link fijo por clínica (MVP).** Un único `/registro/{token}` por tenant. Se genera/rota desde `/configuracion`. Usos: **QR** impreso en la sala de espera y el mostrador, link en la web de la clínica, link en el pie de los recordatorios de turno.
2. **Desde la ficha / la cola.** Botón "Enviar link de autoregistro" en `/pacientes` o en la ficha, para copiar/compartir el link (o generar uno por-link).
3. **Por WhatsApp vía el agente (incremento).** El agente `ekonlabs-agent` (repo separado) envía el link (token por-link con teléfono prellenado) cuando detecta un paciente nuevo en la conversación. Al volver el registro, se puede vincular a la conversación por `phone_number`.

---

## 7. Fases y alcance

| Fase | Contenido | Alcance |
|------|-----------|---------|
| **MVP** | Migración `patient_registrations` + `public_registration_token`/`enabled` en `tenants` (+RLS). Página pública `/registro/[token]` (reusa `PatientForm` en variante pública). `POST /api/registro/[token]` (service role, token→tenant, Zod, honeypot + rate-limit básico + CAPTCHA, consentimiento). Cola de revisión `/pacientes/registros` (lista pendientes, detección de duplicados, badge contador). Acciones aprobar/editar/rechazar/fusionar (aprobar reusa lógica de `POST /api/patients`). Generar/rotar token en `/configuracion`. Audit. | **Mediano** |
| **Inc. 1 — Link por WhatsApp** | Tabla `registration_links` (token por-link, expiración, prellenado de teléfono). Integración con `ekonlabs-agent` para enviar el link en la conversación. Vinculación del registro a la conversación por teléfono. Notificar a la secretaria (badge/realtime). | **Mediano** |
| **Inc. 2 — El paciente solicita turno** | Tras cargar sus datos, el paciente elige servicio/profesional/horario usando la API de disponibilidad (`/api/availability`) y crea un turno `pending` con `booked_via='web'` (ya soportado en `appointments`). Requiere UI de selección de slot, reglas de disponibilidad y confirmación de la secretaria. | **Grande** |
| **Inc. 3 — Autogestión / pulido** | El paciente edita sus propios datos con un token de retorno; notificaciones al paciente (confirmación de recepción); métricas del funnel (enviados/completados/aprobados); import masivo. | **Chico–Mediano** |

**Recomendación de secuencia:** MVP primero (resuelve el 80% del dolor: la secretaria revisa en vez de tipear). Inc. 1 multiplica adopción (el link llega solo por WhatsApp). Inc. 2 es el más grande y toca agenda — evaluarlo después de validar el MVP con ISADI.

---

## 8. Riesgos y preguntas abiertas para el dueño

**Riesgos**
- **Spam / carga basura en el endpoint público.** Mitigado con CAPTCHA + rate-limit + honeypot + revisión humana obligatoria, pero **hay que introducir infra anti-spam que hoy no existe** (posible dependencia nueva: Turnstile/hCaptcha + Redis/KV). Confirmar viabilidad en el deploy de EasyPanel.
- **Duplicados / pacientes que vuelven.** El `UNIQUE(tenant_id, phone_number)` de `patients` obliga a decidir merge vs. crear en la revisión. La staging lo desacopla, pero la UX de la cola debe dejar clarísimo el duplicado.
- **Calidad de datos cargados por el paciente** (obra social mal escrita, DNI con puntos). Mitigado reusando validaciones y el selector de obra social en cascada; la revisión corrige el resto.
- **Privacidad / Ley 25.326.** El formulario público recolecta datos sensibles; requiere consentimiento y texto legal revisado. Registrar en `patient_consents`.
- **Rotación de QR filtrado.** Un QR impreso puede circular; mitigado con token rotable y `enabled=false`.

**Preguntas abiertas**
1. ¿El link es **fijo por clínica** (un solo QR/link) o preferís **por-link con expiración** desde el arranque? (Recomiendo fijo en MVP, por-link para WhatsApp.)
2. ¿Qué campos son **obligatorios** para el paciente vs. opcionales? (Hoy en `patients`: obligatorios `full_name` y `phone_number`; DNI y obra social opcionales a nivel DB.)
3. ¿Aceptamos una **dependencia de CAPTCHA** (Turnstile/hCaptcha) y de **Redis/KV** para rate-limit, o preferís un rate-limit casero en DB para el MVP?
4. Cuando el teléfono **ya existe**, ¿la política por defecto es **fusionar** (actualizar el paciente existente) o **crear duplicado para revisar**? (Recomiendo fusionar con confirmación.)
5. ¿La cola de revisión es una **página nueva** `/pacientes/registros` o una **pestaña/badge** dentro de `/pacientes`? ¿Qué roles la ven (solo `receptionist`/`admin`)?
6. ¿Notificamos al paciente que su registro fue recibido/aprobado (email/WhatsApp), o el MVP es silencioso?
7. ¿Texto de consentimiento y política de datos: los provee la clínica (ISADI) o se usa una plantilla base?

---

## 9. Checklist técnico de implementación (para cuando se apruebe)

- [ ] Migración: `patient_registrations` (+RLS `authenticated` por tenant, sin policy `anon`) y columnas en `tenants` (`public_registration_token`, `public_registration_enabled`). Aplicar en EasyPanel (el usuario aplica migraciones manualmente).
- [ ] `POST /api/registro/[token]` — público, service role, token→tenant, Zod (`PatientFormSchema`), anti-spam, consentimiento, respuesta genérica. **No** en `PROTECTED_PATHS`.
- [ ] Página `/registro/[token]` — reusa `PatientForm` en variante pública (sin `useQueryClient` de dashboard; postea al endpoint público).
- [ ] Cola `/pacientes/registros` — `useList` sobre `patient_registrations` (RLS), detección de duplicados contra `patients` server-side, badge contador.
- [ ] `POST /api/registro/[id]/approve|reject|merge` (autenticado, rol `receptionist`/`admin`) — aprobar reusa la lógica de `POST /api/patients` (dedup DNI, 409 teléfono), setea `status`/`reviewed_by`/`reviewed_at`/`resulting_patient_id`, `logAudit`.
- [ ] Config en `/configuracion`: generar/rotar/activar el token de autoregistro + mostrar QR/link.
- [ ] Tests (Vitest): endpoint público (token válido/ inválido/ revocado, anti-enumeración, rate-limit), aprobar/rechazar/fusionar, aislamiento por tenant (RLS), reuso de dedup.
- [ ] Respetar: solo API Routes, `tenant_id` del JWT en autenticadas, `standardSchemaResolver`, Next 16.2.4 (leer `node_modules/next/dist/docs/`), no MCP.
```

---

### Archivos de referencia citados

- Schema `patients`: `supabase/migrations/20260407231711_005_patients_appointments.sql` (+ `..._013_patients_extended_fields.sql`, `..._042_patients_clinical_fields.sql`, `..._007_patient_deletion_fields.sql`)
- RLS `patients`: `supabase/migrations/20260511000000_patients_rls.sql`
- `tenants` / RLS: `supabase/migrations/20260326141345_bootstrap_core.sql`
- JWT hook: `supabase/migrations/20260506224817_custom_token_hook.sql`
- Consentimientos: `supabase/migrations/20260424163446_009_patient_consents.sql`
- Alta actual: `src/components/pacientes/PatientForm.tsx`, `src/lib/schemas/patient.schema.ts`, `src/app/api/patients/route.ts`
- Auth/tenant: `src/lib/supabase/{server,client,admin}.ts`, `src/lib/utils/jwt.ts`, `src/proxy.ts`
- Patrón service-role: `src/app/api/usuarios/route.ts`
- Listado: `src/app/(dashboard)/pacientes/page.tsx`, `src/types/patients.ts`
