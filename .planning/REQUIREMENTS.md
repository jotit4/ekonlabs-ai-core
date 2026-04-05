# Requirements: ekonlabs-ai-core v1.2

**Defined:** 2026-04-05
**Core Value:** A patient writes on WhatsApp at 11pm. The agent responds immediately, answers questions about services, and books an appointment directly into the clinic's Google Calendar.

## v1.2 Requirements

### PROMPT — System Prompt & Model

- [ ] **PROMPT-01**: El DEFAULT_SYSTEM_PROMPT es un character brief completo (≥400 tokens) con: persona de recepcionista médica argentina, registro voseo, objetivo conversacional (siempre avanzar hacia resolución), regla de identidad honesta como IA, protocolo de booking, y ejemplos few-shot de tono correcto
- [ ] **PROMPT-02**: El system prompt instruye explícitamente al LLM a usar `search_knowledge_tool` para cualquier dato específico de la clínica (precios, horarios, servicios, políticas)
- [ ] **PROMPT-03**: Modelo LLM actualizado de `gpt-4o-mini` a `gpt-4.1-mini`
- [ ] **PROMPT-04**: Temperatura del LLM cambiada de 0.3 a 0.5

### RESP — Respuestas Generadas por LLM

- [ ] **RESP-01**: La presentación de slots usa prosa natural en español argentino (sin lista de emojis numerados); el LLM genera el texto a partir de los datos de slots inyectados como contexto
- [ ] **RESP-02**: La confirmación de turno es generada por el LLM; los datos del evento (fecha, hora, nombre del paciente) se inyectan como contexto XML estructurado — el LLM nunca inventa estos datos
- [ ] **RESP-03**: La confirmación de cancelación de turno es generada por el LLM a partir del resultado inyectado
- [ ] **RESP-04**: La respuesta "no hay turnos disponibles" es generada por el LLM con un siguiente paso accionable para el paciente
- [ ] **RESP-05**: La respuesta de slot ambiguo (`booking_ambiguous_slot`) es generada por el LLM
- [ ] **RESP-06**: Shadow mode redirect permanece hardcodeado (el kill switch debe ser determinista)
- [ ] **RESP-07**: La respuesta anti-diagnóstico permanece hardcodeada (guardrail legal no negociable)

### NAME — Recolección de Nombre del Paciente

- [ ] **NAME-01**: `ConversationState` incluye tres nuevos campos: `patient_name: NotRequired[str | None]`, `name_collection_active: NotRequired[bool]`, `slot_presented_at: NotRequired[str | None]`
- [ ] **NAME-02**: `booking_node` difiere la creación del evento en Calendar cuando `patient_name` está ausente; setea `booking_pending_name=True` en el estado
- [ ] **NAME-03**: `generation_node` pide el nombre completo del paciente cuando `booking_pending_name=True` y aún no hay `patient_name` en el estado
- [ ] **NAME-04**: Mientras `name_collection_active=True`, las keywords de confirmación y cancelación de turno no disparan en `booking_node`
- [ ] **NAME-05**: El evento de Google Calendar se crea con título "Turno — [Nombre Completo]"
- [ ] **NAME-06**: Si el paciente no provee su nombre después de 2 intentos, `is_paused=True` deriva la conversación a handoff humano
- [ ] **NAME-07**: `slot_presented_at` almacena el timestamp ISO del momento en que se presentaron los slots; `booking_node` re-consulta Calendar si han pasado más de 30 minutos

### RAG — RAG Dirigido por LLM

- [ ] **RAG-01**: El LLM en `generation_node` tiene `search_knowledge_tool` vinculada via `bind_tools` de LangChain (inline, sin cambios en graph.py)
- [ ] **RAG-02**: `rag_retrieval_node` retorna `{}` (no-op) — topología del graph preservada, inyección pre-graph eliminada
- [ ] **RAG-03**: La invocación de la tool usa `tool_choice` forzado (no `"auto"`) cuando el LLM necesita consultar la base de conocimiento de la clínica
- [ ] **RAG-04**: Los resultados de tool calls aparecen como `ToolMessage` en el historial de mensajes del estado

## Deferred (v1.3+)

### Conversational Intelligence

- **CONV-01**: Detección de intención de agendamiento por LLM (reemplaza clasificador de keywords en `scheduling_node`)
- **CONV-02**: Memoria de preferencias del paciente entre conversaciones (ej: especialidad habitual, horarios preferidos)
- **CONV-03**: Sugerencia proactiva de turno de seguimiento ("¿querés agendar el próximo control?")

### Multi-Service Booking

- **MULTI-01**: El agente pregunta por especialidad/servicio cuando la clínica tiene múltiples calendarios
- **MULTI-02**: Booking para múltiples pacientes en una misma conversación

## Out of Scope

| Feature | Razón |
|---------|-------|
| Reescritura de graph.py (topología) | Riesgo innecesario — todos los cambios viven en nodos y estado |
| `create_react_agent` de LangGraph | Destruiría el graph existente y sus guardrails deterministas |
| LLM controla Google Calendar directamente | Riesgo de eventos fantasma — Calendar sigue siendo código determinista |
| Nombre del agente (ej: "Sofía") | Decisión de producto diferida |
| Detección de intención por LLM en scheduling_node | Fuera del scope de v1.2 — deferido a v1.3 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROMPT-01 | — | Pending |
| PROMPT-02 | — | Pending |
| PROMPT-03 | — | Pending |
| PROMPT-04 | — | Pending |
| RESP-01 | — | Pending |
| RESP-02 | — | Pending |
| RESP-03 | — | Pending |
| RESP-04 | — | Pending |
| RESP-05 | — | Pending |
| RESP-06 | — | Pending |
| RESP-07 | — | Pending |
| NAME-01 | — | Pending |
| NAME-02 | — | Pending |
| NAME-03 | — | Pending |
| NAME-04 | — | Pending |
| NAME-05 | — | Pending |
| NAME-06 | — | Pending |
| NAME-07 | — | Pending |
| RAG-01 | — | Pending |
| RAG-02 | — | Pending |
| RAG-03 | — | Pending |
| RAG-04 | — | Pending |

**Coverage:**
- v1.2 requirements: 22 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 22 ⚠️

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-05 after initial definition*
