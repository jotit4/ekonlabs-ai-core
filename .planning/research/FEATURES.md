# Features Research — v1.2 Human-Feeling Agent

**Domain:** WhatsApp medical clinic booking agent — Argentine market
**Researched:** 2026-04-04
**Overall confidence:** MEDIUM-HIGH (supported by production patterns, WhatsApp UX literature, and LLM agent architecture research; Argentine-specific voseo copy is derived from linguistic analysis and regional norms, not from a directly observed deployed example)

---

## System Prompt / Persona

### Table stakes

Every production conversational booking agent that passes a "feels human" bar has these in its system prompt:

- **Named identity** — the agent has a name (not "the bot" or "the assistant"). Patients address it by name. This is the single biggest switch from "system" to "person" feel. Example: "Soy Valentina, la recepcionista virtual del Instituto San Diego."
- **Role declaration** — explicit statement of what the agent can and cannot do, stated from the agent's perspective rather than as a rule list. "Mi trabajo es ayudarte a sacar un turno, responder preguntas sobre nuestros servicios y derivarte al equipo humano cuando algo lo requiere."
- **Tone directive** — one or two concrete sentences describing _how_ to speak, not just personality adjectives. Adjectives ("warm, professional") do not constrain output. Directives do: "Hablá siempre de vos a vos. Frases cortas. No uses signos de exclamación en exceso. Nunca uses bullets ni listas numeradas en la respuesta al paciente."
- **Hard guardrails** — what never to do, stated as non-negotiable. At minimum: no diagnósticos, no consejos médicos, no inventar horarios, no prometer disponibilidad sin consultarla.
- **Escalation protocol** — when to involve a human, stated explicitly. Without this, agents either over-escalate (hand off on anything slightly complex) or under-escalate (never hand off and hallucinate).
- **Out-of-scope graceful redirect** — a specified behavior for when the patient asks something outside the agent's domain.

### Differentiators

These separate a good persona from a generic one:

- **Character backstory (brief)** — one or two sentences that give the agent plausible workplace context. Not fiction, but grounding: "Trabajo en la recepción del ISADI en Mendoza. Conozco los servicios, los profesionales y la agenda." This anchors responses. Agents without backstory drift toward generic assistant mode.
- **Explicit response length rules** — "Respondé en 1 a 3 oraciones cuando sea posible. Si necesitás dar más información, usá saltos de línea, no bullets." WhatsApp is a message channel, not a document channel. Long structured responses feel like copy-pasted emails.
- **Emotional calibration** — beyond a binary urgency flag, a well-designed persona brief describes the _range_ of registers available: neutral, warm, calming-urgent. "Si el paciente expresa dolor o angustia, priorizá validar antes de informar."
- **Name usage protocol** — once you collect the patient's name, instruct the agent to use it naturally but sparingly. "Usá el nombre del paciente una vez para personalizar, no en cada mensaje — suena forzado."
- **Silence/absence of persona-breaks** — instructions for what to do when the agent genuinely doesn't know something. Without this instruction, LLMs default to hedged acknowledgment that reads as robot-speak. Better: "Si no tenés la información, decilo honestamente y ofrecé derivar al equipo."

### Copy patterns (Argentine medical context)

Observed patterns from Spanish-language healthcare chatbot deployments and Argentine WhatsApp norms. Confidence: MEDIUM (no single deployed Argentine medical agent was directly audited; patterns derived from Spanish-language UX research and regional linguistic norms).

**Opening / greeting:**
- Works: "Hola, soy Valentina de ISADI. ¿En qué te puedo ayudar?"
- Avoid: "¡Hola! Soy el asistente virtual del Instituto San Diego. ¿En qué puedo ayudarte hoy?"
- Why: The first is a sentence a receptionist actually says. The second announces its own artificiality with "asistente virtual" and the formal "puedo ayudarte" — which is tuteo mixed with corporate language.

**Voseo markers that matter:**
- "¿Cómo te llamas?" → "¿Me podés decir tu nombre?" (voseo + natural phrasing)
- "¿Deseas confirmar?" → "¿Lo confirmamos?" or "¿Te viene bien ese horario?" (first person plural or direct address)
- "Puede elegir el horario" → "Podés elegir el que más te convenga"
- "Escriba su nombre" → "Decime tu nombre" (imperative voseo)

**Tone markers that read as human in Mendoza:**
- Use "bueno" as a transition marker: "Bueno, déjame ver qué tenemos disponible."
- Use "mirá" as a soft redirect: "Mirá, en ese caso te conviene hablar directamente con la clínica."
- Use "dale" for confirmation: "Dale, te reservo ese turno."
- Avoid "por supuesto", "desde luego", "con gusto" — these are call-center script markers that patients in Argentina associate with scripted bots.

**Complexity:** Low. System prompt redesign is text work. The main risk is prompt length vs. instruction density tradeoff — a 2000-token prompt is not automatically better than a 400-token one. Lean, directive, and ordered beats comprehensive and exhaustive.

---

## LLM-Generated Responses

### Table stakes

Every response that reaches the patient should go through the LLM when the current code bypasses it with a hardcoded string:

- **No hardcoded patient-facing strings** — strings like `BOOKING_CONFIRMED_TEMPLATE`, the emoji slot list, and `SCHEDULING_NO_SLOTS_RESPONSE` in `generation.py` bypass the persona entirely. The patient is reading two different voices in the same conversation. The LLM must own all output.
- **Data injection as context, not as response** — the booking result, available slots, and cancellation outcome are structured data that the LLM uses to compose a response. The LLM is not responsible for the data; it is responsible for turning it into natural language.
- **Consistent temperature** — responses that feel human require some variability. `temperature=0.3` (current) is slightly on the low side for persona expression. Production agents for customer-facing contexts typically use 0.5–0.7. Below 0.4 tends toward repetitive phrasing across turns.

### Differentiators

- **Contextual variation across turns** — a human receptionist does not say "¡Perfecto! Tu turno fue reservado" every single time. The LLM, given freedom to compose, will naturally vary this. The differentiator is explicitly instructing for variation: "No uses las mismas frases de apertura en mensajes consecutivos."
- **Response-type awareness in the prompt** — when injecting structured data (slots, booking confirmation), the system prompt or context block should tell the LLM what kind of response this is. "Estás confirmando una reserva. El turno quedó guardado. Comunicalo de forma natural y breve, sin repetir todos los detalles si ya los mencionaste antes."
- **Graceful handling of LLM uncertainty** — when the LLM doesn't have enough information to respond confidently, it should say so in-character, not produce a generic "no puedo ayudarte." The persona brief must specify this behavior.

**Complexity:** Medium. The main work is replacing each hardcoded bypass in `generation.py` with a context injection + LLM call pattern. The risk is regression: each bypass existed because it was reliable. LLM-generated confirmations can hallucinate slot details if the context injection is imprecise. Structured data must be injected unambiguously (XML tags or labeled fields, not raw dict repr).

---

## Patient Name Collection

### Table stakes

Production booking agents that collect patient names in a multi-turn dialog follow these patterns:

- **Ask once, not upfront** — asking for name at the start of the conversation (before the patient has asked anything) increases friction and abandonment. The right trigger is at the point of booking commitment: the patient has selected a slot and confirmed intent.
- **Single clear ask** — one question, not a form. "Para completar la reserva, ¿me decís tu nombre y apellido?" is the standard pattern. Splitting into "¿Tu nombre?" and then "¿Tu apellido?" doubles the turns for no benefit.
- **Name-then-confirm pattern** — collect name, then show confirmation summary including the name. This lets the patient catch a typo or wrong name before it goes to calendar. "Perfecto, Lucía Fernández. ¿Confirmamos el turno para el jueves a las 10?"
- **Store for session** — once the name is collected, it stays in state for the full session. Never ask again in the same conversation.
- **Graceful handling of no-response** — if the patient ignores the name question and says something else (e.g., "espera, ¿tenés algo antes?"), the agent handles the new query and re-asks name only when returning to booking.

### Flow patterns (multi-turn collection in WhatsApp)

The minimal viable pattern for name collection before booking confirmation:

```
Patient: "Me quedo con el turno del jueves a las 10."
Agent:   "Perfecto. ¿Me decís tu nombre y apellido para completar la reserva?"
Patient: "Lucía Fernández"
Agent:   "Dale, Lucía. Confirmo el turno para el jueves 10 de abril a las 10:00 hs.
          Si necesitás cancelar o cambiar el horario, avisame por acá."
```

Edge cases that must be handled:
- Patient gives only first name → agent accepts and continues. Do not demand last name if the patient only gives one. Clinics can work with first names.
- Patient gives a name with typo or ambiguous casing → store as-provided, do not correct.
- Patient ignores the name question → agent re-asks once on the next turn if still in booking flow, then proceeds with "paciente sin nombre" fallback if ignored twice.
- Patient says name mid-sentence ("soy Lucía, ¿tenés para mañana?") → LLM must recognize this as name provision and extract it. This is a key argument for LLM-driven name collection vs. regex-based: the LLM handles natural embedding while a classifier needs explicit keyword patterns.

**State requirement:** `patient_name: str | None` must be added to `ConversationState`. Once set, it persists across all subsequent turns in the session.

**Complexity:** Medium-high. The multi-turn state machine for "waiting for name" is the main implementation challenge. The LangGraph graph needs a `collect_name` state and routing logic: if `scheduling_intent` is True AND `patient_name` is None, go to name collection before confirmation. If `patient_name` is set, go directly to booking confirmation.

---

## Conversational Guidance (proactive steering)

### Table stakes

Every production conversational booking agent that achieves above-average booking conversion rates uses proactive steering. This is not a differentiator — it is expected behavior in healthcare:

- **Offer booking after answering an informational question** — when a patient asks "¿cuánto sale la kinesiología?" the agent answers and immediately offers to book. This is the minimum. It converts FAQ traffic into appointments.
- **One offer, not repeated pressure** — the agent offers once. If the patient ignores it or redirects, the agent does not ask again in the same conversation unless the patient signals renewed interest. Repeating the offer after a rebuff reads as spam behavior.
- **Offer is naturally embedded, not appended** — poor pattern: answer the question, then add "¿Te gustaría sacar un turno?" as a separate line. Good pattern: integrate the offer into the closing sentence of the answer. "La primera sesión de kinesiología vale $X. Si querés, podemos ver qué horarios están libres esta semana."
- **Context-aware offers** — the offer should match the patient's evident need. If they asked about a specific doctor, offer to book with that doctor. Generic "¿querés sacar un turno?" ignores everything the patient just communicated.

### Differentiators

- **Urgency-sensitive steering** — when the agent detects pain or distress, the offer is not about "checking availability" but about "getting them seen as soon as possible." This is already partially implemented via the `empathy_mode: urgent` flag; the differentiator is making the steering language match the urgency level.
- **Post-FAQ cooling period** — after the patient gets their answer, a brief natural bridge before the offer ("Igual, si en algún momento querés sacar un turno...") is less pressure than an immediate offer. Works better for patients who are browsing, not deciding.
- **Recognizing soft interest** — phrases like "voy a pensarlo", "capaz la semana que viene", "pregunto por las dudas" are signals that the patient is interested but not ready. The agent can acknowledge the uncertainty and make re-entry easy: "Cuando quieras, escribime y te busco un horario."

**Implementation note for this codebase:** The current architecture runs RAG retrieval as a pre-injection node. Under the new agentic RAG model (LLM calls `search_knowledge_tool`), the LLM will have full context at response time and can compose the FAQ answer + offer in a single natural response. This is a structural improvement over the current split where RAG context is injected and the LLM generates independently.

**Complexity:** Low-medium. The behavior is entirely prompt-driven once the LLM owns all output. No new nodes needed. The system prompt must contain an explicit instruction: "Cuando respondas una pregunta informativa sobre los servicios, al final ofrecé naturalmente la posibilidad de sacar un turno — si ya no la pediste en esta conversación."

---

## Natural Slot Presentation

### Table stakes

- **No emoji lists** — the current implementation uses `1️⃣ 2️⃣ 3️⃣` with newline-separated slots. This reads as a bot-generated menu in every WhatsApp market studied. Human receptionists do not send numbered emoji lists; they name the options in prose.
- **At most three options** — already implemented. Three is the production consensus maximum for synchronous text choice. More than three forces the patient to scroll and evaluate, which increases cognitive load and abandonment.
- **Day and time, not ISO format** — `2026-04-10T10:00:00` is never surfaced. Human-readable: "el jueves a las 10 de la mañana" or "este viernes a las 15:30". The `display` field in `booked_slot` presumably handles this, but the LLM must be instructed to use it, not the raw datetime.
- **Relative time when possible** — "mañana a las 11" is cleaner than "el viernes 5 de abril a las 11:00" when mañana is accurate. Instruct the LLM on today's date so it can compute this.

### Copy patterns (slot presentation, Argentine Spanish)

Current (hardcoded, robotic):
```
Encontré estos turnos disponibles para vos:

1️⃣ Jueves 10 de abril, 10:00 hs
2️⃣ Viernes 11 de abril, 15:30 hs
3️⃣ Lunes 14 de abril, 09:00 hs

¿Cuál te viene mejor? Podés elegir el número o decirme si preferís otro horario.
```

Target (LLM-generated, human):
```
Tengo disponible el jueves a las 10, el viernes a las 15:30 y el lunes a las 9 de la 
mañana. ¿Alguno te viene?
```

Or with more warmth when urgency mode is active:
```
Mirá, lo más próximo que tenemos es mañana jueves a las 10. También hay el viernes 
a las 15:30 si eso te queda mejor. ¿Cuál te va bien?
```

The specific phrasing the LLM chooses will vary turn to turn (desirable). What the system prompt must constrain is the format: conversational sentence, not list, no emoji bullets, and ask for preference at the end.

**Booking confirmation — current vs target:**

Current:
```
¡Perfecto! Tu turno fue reservado exitosamente:

📅 Jueves 10 de abril, 10:00 hs

Te esperamos. Si necesitás cancelar o reprogramar, avisame por acá. 😊
```

Target:
```
Dale, quedó reservado para el jueves a las 10. Si necesitás cambiar o cancelar, 
avisame por acá.
```

Why: "exitosamente" is a system log word, not a human word. The 📅 emoji is fine in one-off use but becomes a robot signature when it appears in every confirmation. "Te esperamos" is a polite formula that reads as canned copy. The shorter version contains the same information and reads as a person wrapping up a task.

**Complexity:** Low. Pure prompt work. The `available_slots` structured data is already passed in state. The LLM just needs instructions on how to verbalize it. Risk: LLM may still default to list format if not explicitly forbidden in the prompt. The instruction must say "no uses listas, bullets ni emojis numerados para presentar opciones de turnos."

---

## LLM-Driven RAG via Tool Calling

### Table stakes (included here for completeness as it affects response generation)

- **Tool defined with clear description** — the LLM must know when to call `search_knowledge_tool`. The tool description should specify what the knowledge base contains: "Contiene información sobre los servicios de la clínica, precios, horarios de atención, profesionales y preguntas frecuentes. Llamá esta herramienta cuando el paciente haga una pregunta sobre la clínica que no puedas responder con certeza."
- **Fallback behavior specified** — if the tool returns empty or low-relevance results, the LLM must not hallucinate. Prompt must say: "Si la búsqueda no devuelve información relevante, decile al paciente honestamente que no tenés esa información y sugerí que llame a la clínica."
- **Single retrieval per turn** — for this use case (medical booking, short conversations) one tool call per LLM turn is sufficient. Multi-hop retrieval adds latency and complexity without benefit.

**Architecture note:** Agentic RAG (LLM decides when to retrieve) is appropriate here because the conversation has two clearly different modes: booking/scheduling (no retrieval needed — data comes from calendar) and informational (retrieval needed). Always-injecting RAG context wastes tokens on booking turns and can confuse the LLM with irrelevant clinic info when it is processing a slot selection. The LLM-driven model retrieves only when relevant.

**Latency tradeoff:** One LLM call (decide) + one tool call (retrieve) + one LLM call (respond) for RAG turns adds approximately 1–2 seconds vs. single-pass pre-injection. For a medical WhatsApp agent where patients expect near-instant responses, this is acceptable if gpt-4o-mini is kept as the model (fast inference). It would be a concern with GPT-4o full.

**Complexity:** Medium-high. Requires adding tool-calling capability to the LangGraph node, defining the tool schema, wiring the tool execution back into the graph, and removing the pre-injection RAG node for informational queries. The existing pgvector retrieval logic does not change — only when it is called.

---

## Anti-Features (what NOT to do)

These patterns make agents feel robotic even when individually they seem helpful. Confidence: HIGH — drawn from WhatsApp-first anti-pattern literature, production UX research, and direct code review of the current `generation.py`.

### 1. Hardcoded strings in any patient-facing flow

Having two different "voices" in one conversation (LLM for FAQs, template string for confirmations) breaks immersion immediately. Patients who interacted with a warm conversational agent in the FAQ phase get jarred by a templated confirmation. The fix is complete, not partial — every patient-facing string goes through the LLM.

### 2. Emoji-numbered option lists

`1️⃣ 2️⃣ 3️⃣` is the single most recognized chatbot signature on WhatsApp. It signals "you are talking to a bot" more clearly than any other formatting choice. It is universally used in rule-based chatbots and almost never used by a human receptionist. Do not use it.

### 3. Asking for the patient's name before they've done anything

Asking "¿Cuál es tu nombre?" as the first message after "hola" is a form-filling pattern, not a conversational one. It makes the patient feel they're filling out a registration form, not talking to a person. Collect name at booking commit time only.

### 4. Using "asistente virtual", "bot", or "sistema" in self-reference

The agent should never introduce itself using these words. "Soy el asistente virtual de ISADI" immediately establishes bot-frame. Use a human name and role instead. If asked directly "¿sos un bot?", the agent can be honest ("Soy una asistente virtual, pero estoy acá para ayudarte igual que lo haría alguien del equipo") — but this should not appear in normal flow.

### 5. Repeating the patient's input back to them verbatim

"Entiendo que estás buscando un turno para el jueves por la tarde" — this is a bot tell. Humans do not narrate what they just heard. Go directly to the action.

### 6. Formal system-log vocabulary in patient-facing messages

Words to eliminate from patient output: "exitosamente", "procesado", "confirmado con éxito", "registrado en el sistema", "operación completada". These read as database transaction logs. Replace with natural closure language.

### 7. Excessive use of "¡" (exclamation marks)

"¡Perfecto! ¡Tu turno fue reservado! ¡Te esperamos!" is a chatbot-positive pattern. Real receptionists use one or zero exclamation marks per message. The system prompt must cap exclamation mark use.

### 8. Asking clarifying questions when you already have enough information

Pattern: patient says "quiero sacar un turno para mañana", agent asks "¿Para qué especialidad?" when the clinic has only one specialty. Always check what the tenant actually offers before generating clarifying questions. A single-specialty rehab clinic should go directly to slot presentation without asking for specialty.

### 9. Sending multi-paragraph messages for simple answers

WhatsApp is a message channel. A simple availability question should get a one or two sentence answer. Sending a 200-word structured response with sections and headers for "¿cuánto sale?" signals bot-generated content immediately.

### 10. Ignoring the patient's prior context when steering

Proactively offering "¿querés sacar un turno?" without acknowledging what the patient just asked makes the offer feel spammy. The offer must reference the patient's actual query: "Para lo de kinesiología, puedo buscarte un turno esta semana si querés."

---

## Feature Dependency Map

```
System prompt redesign
    → required by: LLM-generated responses (tone/format rules live here)
    → required by: Patient name collection (ask behavior lives here)
    → required by: Natural slot presentation (format prohibition lives here)
    → required by: Conversational guidance (steering instruction lives here)

LLM-generated responses
    → required by: All patient-facing output
    → enables: Consistent voice across all turn types

Patient name collection
    → depends on: ConversationState extended with patient_name field
    → depends on: LangGraph routing: scheduling_intent=True AND patient_name=None → collect_name node

LLM-driven RAG via tool calling
    → replaces: pre-injection RAG node
    → depends on: Tool schema defined and wired into LangGraph
    → enables: Cleaner booking turns (no irrelevant clinic context injected)

Conversational guidance
    → depends on: LLM-generated responses (steering happens in LLM output, not in a node)
    → depends on: System prompt redesign (instruction to steer must be in prompt)

Natural slot presentation
    → depends on: LLM-generated responses
    → depends on: System prompt redesign (format rules must be explicit)
```

---

## Implementation Priority (for requirements author)

Based on dependency analysis and risk profile:

1. **System prompt redesign** — must go first. Everything else depends on the persona brief being in place. Zero latency risk. Pure text work.
2. **LLM-generated responses (slot presentation + confirmations)** — second, because it unblocks natural slot presentation and confirmation tone. Medium risk: regression testing needed on booking confirmation accuracy.
3. **Patient name collection** — third. New state field + new graph node. Self-contained; does not affect existing booking paths if routed correctly.
4. **LLM-driven RAG via tool calling** — fourth. Most architecturally invasive change. Should go last to avoid destabilizing the already-working RAG path during other changes.
5. **Conversational guidance + proactive steering** — essentially free once #1 and #2 are done. It lives in the system prompt and in how the LLM composes informational answers. No new nodes.

---

## Sources

- [WhatsApp Healthcare Automation: Transform Patient Engagement](https://www.botmd.io/blog/whatsapp-healthcare-automation-patient-engagement) — general WhatsApp healthcare patterns
- [FullAgenticStack WhatsApp-first Anti-Patterns: A Reference Handbook](https://dev.to/fullagenticstack/fullagenticstack-whatsapp-first-anti-patterns-a-reference-handbook-3jb0) — 64-pattern anti-pattern catalog for WhatsApp-first systems (HIGH confidence source)
- [TOP 10 WhatsApp-first anti-patterns](https://dev.to/fullagenticstack/top-10-whatsapp-first-anti-patterns-5fp) — summary of critical patterns
- [9 Ways to Make Your Chatbot Sound More Human](https://botpress.com/blog/how-to-make-chatbot-sound-more-human) — variability, timing, and tone techniques
- [Agentic RAG: When LLMs Decide What and How to Retrieve](https://www.techaheadcorp.com/blog/agentic-rag-when-llms-decide-what-and-how-to-retrieve/) — conditional vs always-inject RAG tradeoffs
- [Traditional RAG vs. Agentic RAG — NVIDIA Technical Blog](https://developer.nvidia.com/blog/traditional-rag-vs-agentic-rag-why-ai-agents-need-dynamic-knowledge-to-get-smarter/) — latency and flexibility analysis
- [WhatsApp Bot Design: 5 Tips for Perfect UX](https://landbot.io/blog/design-whatsapp-bot-dialogue) — conversational UX principles
- [How to Make AI Sound Less Robotic in Customer Support](https://www.gorgias.com/blog/make-ai-sound-more-human) — anti-robot pattern list
- [LLM Personas: How System Prompts Influence Style, Tone, and Intent](https://brimlabs.ai/blog/llm-personas-how-system-prompts-influence-style-tone-and-intent/) — persona prompt structure
- [Chatbot para clínicas: agenda y cuida a tus pacientes](https://chatproia.com/chatbot-para-clinicas/) — Spanish-language clinic chatbot patterns
- [9 formas de hacer que tu chatbot suene más humano](https://botpress.com/es/blog/how-to-make-chatbot-sound-more-human) — Spanish-language version of human-feel techniques
- [Booking Chatbot: Step-By-Step Build Guide](https://botpress.com/blog/chatbot-for-bookings) — production booking flow patterns
