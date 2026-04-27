# Estado del Producto — ekonlabs-ai-core

**Última actualización:** 2026-04-27  
**Tenant activo:** ISADI — Instituto San Diego S.A. (Mendoza, Argentina)  
**Entorno de producción:** EasyPanel VPS → `https://ekonlabs-ai-agente-ia.az23sf.easypanel.host`  
**Código en:** `master` branch → commit `5341a9d`

---

## Resumen ejecutivo

El agente está **feature-complete para MVP ISADI** a nivel de código y base de datos. La única acción pendiente antes de validación E2E es el deploy del código nuevo a EasyPanel.

---

## ✅ Funcionalidades implementadas y en producción (o listas para deploy)

### Core del agente
| Componente | Estado | Notas |
|---|---|---|
| Flujo LangGraph `consent → triage → anti_diagnostic → booking → scheduling → rag_retrieval → generation` | ✅ | Entry point: consent node |
| Consent (Ley 25.326 Art. 13-20) | ✅ | `consent_service.py`, tabla `patient_consents`, hash PII |
| Triage de intención con LLM | ✅ | Clasificación por contexto conversacional |
| Anti-diagnóstico (guardrail) | ✅ | Deriva a profesional si detecta consulta médica |
| Guardrails de evasión / sanitización PII | ✅ | `app/agent/guardrails/input_sanitizer.py` |
| RAG — búsqueda en knowledge base | ✅ | pgvector, threshold 0.60, `text-embedding-3-small` |
| Handoff / escalación humana | ✅ | `is_paused=True` → worker pausa hilo |

### Flujo de booking (5 fases)
| Fase | Descripción | Estado |
|---|---|---|
| Phase A | Captura de nombre | ✅ |
| Phase B | Captura de DNI | ✅ |
| Phase D | Captura extendida: obra social, motivo, tel alternativo, dirección | ✅ |
| Phase C | Finalización: crea patient → Calendar → appointment → borra draft | ✅ |
| Paciente conocido | Salta A/B/D, va directo a Phase C | ✅ |

### Tipos de servicio (booking modes)
| Modo | Ejemplo en ISADI | Estado |
|---|---|---|
| `appointment` — turno individual | Villavicencio, Odontología | ✅ |
| `walk_in` — sin turno, por orden de llegada | Rehab traumatológica (Dr. Rodríguez) | ✅ |
| `gated` — requiere pedido médico previo | Kinesiología, Fisioterapia, Rehab física, Hidroterapia | ✅ |
| `cycle` — inscripción mensual/semanal | Pilates, Aquagym | ✅ |

### Infraestructura
| Componente | Estado | Notas |
|---|---|---|
| Multi-tenant con `system_prompt_override` por tenant | ✅ | |
| Redis + RQ workers (tareas async) | ✅ | |
| WhatsApp: Evolution API (instancia ISADI) | ✅ | Instancia: "ISADI - WhatsApp" |
| WhatsApp: Meta Cloud API (seleccionable via `WHATSAPP_PROVIDER`) | ✅ | |
| LangSmith tracing | ✅ | Proyecto: `ekonlabs-ai-core` |

### Base de datos — migraciones aplicadas
| # | Descripción | En Supabase |
|---|---|---|
| 001–005 | Schema base: tenants, conversations, knowledge_chunks, services, patients/appointments | ✅ |
| 006 | Extensiones de servicios: booking_mode, capacity_per_slot, reminder | ✅ |
| 007 | Audit columns en appointments (cancelled_by, cancellation_reason) | ✅ |
| 008 | Calendar credentials vault (calendar_credentials_ref en tenants) | ✅ |
| 009 | Tabla patient_consents (F0.3 — Ley 25.326) | ✅ |
| 010 | Unique partial index en appointments (anti-doble-booking) | ✅ |
| 011 | booking_mode CHECK constraint extendido a 'cycle' | ✅ |
| 012 | UPDATE servicios ISADI con booking_mode/capacity/professional correctos | ✅ |
| 013 | ADD COLUMNS reason_for_visit, alternative_phone, address en patients | ✅ |

### Knowledge Base ISADI — RAG
| Archivo | Chunks | Contenido |
|---|---|---|
| obras_sociales.md | 5 | Coberturas y obras sociales aceptadas |
| profesionales_horarios.md | 5 | Profesionales, días y horarios de cada servicio |
| pilates_aquagym_ciclos.md | 5 | Modalidad ciclo: inscripción, horarios, profesores |
| servicios_instrucciones.md | 4 | Instrucciones pre-turno por servicio |
| politica_cancelacion.md | 3 | Política de cancelación y reprogramación |
| traumatologia_walkin.md | 3 | Walk-in: Dr. Rodríguez y Dr. Villavicencio |

**Total: 25 chunks ingestados en Supabase (pgvector)**

### System prompt ISADI
- **Capas:** `DEFAULT_SYSTEM_PROMPT` (generación.py) + `system_prompt_override` (Supabase)
- **Override ISADI (4503 chars):** identidad, contexto clínico, restricciones, escalación, tipos de servicio
- Secciones: `<identidad_isadi>`, `<contexto_clinico>`, `<restricciones_isadi>`, `<escalacion_isadi>`, `<tipos_de_servicio_isadi>`

---

## ⏳ Pendiente para MVP completo

### 1. Deploy a EasyPanel ← **BLOQUEANTE**
El código en `master` (commit `5341a9d`) contiene todas las features. Producción sigue en `712eaea`. Hacer redeploy del servicio app desde EasyPanel.

### 2. Validación E2E — 6 escenarios WhatsApp
Después del deploy, validar manualmente desde WhatsApp:

| # | Escenario | Qué verificar |
|---|---|---|
| 1 | Primer contacto (número nuevo) | Pide consent, espera "acepto", luego responde |
| 2 | Agendar Kinesiología (gated) | Informa que requiere pedido médico, ofrece agendar igual |
| 3 | Preguntar por Pilates (cycle) | Explica que es inscripción al ciclo, deriva a recepción |
| 4 | Agendar Odontología (appointment) | Muestra slots disponibles, pide nombre → DNI → datos → confirma |
| 5 | Preguntar por Traumatología sin turno | Explica horarios Dr. Rodríguez, confirma que no necesita turno |
| 6 | Consulta cubierta por RAG (obras sociales, horarios) | Responde correctamente desde knowledge base |

### 3. Google Calendar reales para Villavicencio y Odontología
Los servicios de Dr. Villavicencio y Odontología tienen `calendar_id = PLACEHOLDER_*`. No van a mostrar disponibilidad real hasta que ISADI comparta los calendarios del Google Workspace con el service account:

**Service account:** `ekonlabs-calendar-agent@secretaria-457315.iam.gserviceaccount.com`

Instrucción para ISADI: Google Calendar → Settings del calendario → Share → agregar el email anterior con rol "Make changes and manage sharing".

Luego actualizar en Supabase:
```sql
UPDATE public.services
SET calendar_id = 'CALENDAR_ID_REAL@group.calendar.google.com'
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4'
  AND name IN ('Traumatología (Dr. Villavicencio)', 'Odontología');
```

---

## 🔧 Deuda técnica conocida / Backlog

| Item | Prioridad | Notas |
|---|---|---|
| Recordatorios automáticos pre-turno | Media | Worker RQ ya tiene estructura; falta implementar job de reminder |
| Reagendamiento automatizado | Media | Hoy solo se puede cancelar + agendar nuevo manualmente |
| Turno para familiar | Baja | Paciente pide turno para otra persona |
| Plasma/PRP | Baja | Confirmar con ISADI si se agrega como servicio |
| Timezone handling en Calendar | Baja | `calendar_service.py` — ver `project_calendar_gaps.md` |
| Deduplicación de eventos Calendar | Baja | Ver `project_calendar_gaps.md` |
| Script `ingest_markdown.py` (original) | Info | Falla por IPv6 desde esta red. Usar `ingest_markdown_rest.py` en su lugar |

---

## Servicios ISADI — Estado completo en DB

| Servicio | booking_mode | capacity | Profesional | calendar_id |
|---|---|---|---|---|
| Kinesiología | gated | 6 | Patricia Pérez Bernal / Aldo Luque | Real ✅ |
| Fisioterapia | gated | 6 | Patricia Pérez Bernal / Aldo Luque | Real ✅ |
| Rehabilitación física | gated | 6 | Patricia Pérez Bernal / Aldo Luque | Real ✅ |
| Hidroterapia | gated | 9 | Profesora Martina | Real ✅ |
| Pilates | cycle | 4 | Prof. Rocío López | Real ✅ |
| Aquagym | cycle | 9 | Profesora Martina | Real ✅ |
| Rehabilitación traumatológica | walk_in | — | Dr. Juan Diego Rodríguez | Real ✅ |
| Traumatología (Dr. Villavicencio) | appointment | — | Dr. Villavicencio | ⚠️ PLACEHOLDER |
| Odontología | appointment | — | Dr. Juan Pablo Rodríguez | ⚠️ PLACEHOLDER |
| Gimnasia Prenatal | appointment | — | Prof. Carolina López | `active=FALSE` |

---

## Referencias rápidas

| Recurso | Valor |
|---|---|
| Tenant ID ISADI | `5298fcc5-15bf-494c-9655-b49d759cfef4` |
| Supabase project | `zgknmifmeoacravtskbx` |
| Supabase URL | `https://zgknmifmeoacravtskbx.supabase.co` |
| App producción | `https://ekonlabs-ai-agente-ia.az23sf.easypanel.host` |
| Evolution API | `https://ekonlabs-ai-evolution-api.az23sf.easypanel.host` |
| Evolution instance ISADI | `ISADI - WhatsApp` |
| WhatsApp number ISADI | `376633499` |
| Google Calendar service account | `ekonlabs-calendar-agent@secretaria-457315.iam.gserviceaccount.com` |
| Tests | 659 pasando, 0 failures |
