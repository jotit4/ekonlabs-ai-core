# Phase 10: Evolution API Integration — Research

**Researched:** 2026-04-04
**Domain:** WhatsApp provider abstraction — Evolution API (Baileys-based) alongside Meta Cloud API
**Confidence:** MEDIUM-HIGH (send endpoint and webhook payload structure verified from multiple sources; webhook auth confirmed as apikey-only via official docs)

---

## Summary

Phase 10 adds Evolution API as a second WhatsApp provider, selectable at deployment time via `WHATSAPP_PROVIDER` env var. The project already has a complete Meta Cloud API integration: a webhook endpoint at `POST /webhooks/whatsapp` that verifies HMAC-SHA256 signatures, parses a Pydantic model, resolves the tenant, and enqueues an RQ job. The worker (`tasks.py`) calls `send_message` from `whatsapp_service.py` using Meta's Graph API.

Evolution API is an open-source TypeScript middleware that wraps WhatsApp Web (via the Baileys library) into a REST API. Its webhook payloads are structurally different from Meta's: instead of a deeply nested `entry[0].changes[0].value.messages[0]` structure, they use a flat `data.key.remoteJid` / `data.message.conversation` shape with a top-level `event` and `instance` field. Authentication on delivery is **not HMAC** — Evolution API has no outgoing webhook signature by default; the self-hosted version does not yet support custom headers in webhook deliveries. Security relies on keeping the webhook endpoint URL secret or using a shared `apikey` value that can be manually validated.

The correct abstraction is **two separate router endpoints** (`/webhooks/whatsapp` for Meta and `/webhooks/evolution` for Evolution), sharing the same downstream processing pipeline (`_enqueue_task` → `process_whatsapp_message`). The worker needs a provider-aware send path: when `WHATSAPP_PROVIDER=evolution`, call a new `evolution_service.send_message()`; when `meta`, call the existing `whatsapp_service.send_message()`.

**Primary recommendation:** Add `POST /webhooks/evolution` endpoint, a new `app/services/evolution_service.py`, update `config.py` with 4 new fields, and add a provider-dispatch branch in `tasks.py`. Meta path must remain byte-for-byte unchanged.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EVOL-01 | Setting `WHATSAPP_PROVIDER=evolution` routes all incoming webhooks through the Evolution handler | New endpoint `/webhooks/evolution`; `WHATSAPP_PROVIDER` config field routes; Meta endpoint untouched |
| EVOL-02 | Setting `WHATSAPP_PROVIDER=meta` keeps existing Meta behavior unchanged | No changes to existing `receive_whatsapp_webhook`; default value = `"meta"` |
| EVOL-03 | A message sent via Evolution webhook reaches the LangGraph agent and produces a reply sent back via Evolution API | Payload normalizer extracts phone+text from Evolution shape; `_enqueue_task` called with normalized dict; worker calls `evolution_service.send_message` |
| EVOL-04 | Meta webhook endpoint continues to pass all existing tests unchanged | Two separate router functions; no shared mutation of Meta code path |
| EVOL-05 | Evolution API base URL, API key, and instance name are configurable via env vars | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` added to `config.py` and `.env.example` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| httpx | already in project | HTTP client for Evolution API send calls | Already used in `whatsapp_service.py` — no new dependency |
| pydantic | already in project | Model for Evolution webhook payload | Already used project-wide |
| pydantic-settings | already in project | New env vars via `Settings` | Same pattern as all prior phases |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| FastAPI APIRouter | already in project | Register new `/webhooks/evolution` endpoint | Same router as Meta webhook |

**No new pip dependencies are required.**

---

## Architecture Patterns

### Recommended File Structure (new/changed files only)

```
app/
├── api/v1/
│   └── webhooks.py               # ADD: receive_evolution_webhook() function + router
├── services/
│   ├── whatsapp_service.py       # NO CHANGE
│   └── evolution_service.py      # NEW: send_message() for Evolution API
├── models/
│   ├── webhook.py                # NO CHANGE (Meta model stays)
│   └── evolution_webhook.py      # NEW: Pydantic model for Evolution payload
├── core/
│   └── config.py                 # ADD: 4 new fields (WHATSAPP_PROVIDER, EVOLUTION_*)
└── workers/
    └── tasks.py                  # ADD: provider dispatch in send step (step 6)
.env.example                      # ADD: 4 new vars documented
```

### Pattern 1: Two Separate Endpoints, Shared Enqueue

**What:** Each provider has its own FastAPI route with its own auth/parse logic. Both call the shared `_enqueue_task()` function with a normalized payload dict.

**When to use:** When providers have different auth mechanisms (HMAC vs apikey header) and different payload shapes. Shared endpoint with detection logic creates fragile "sniff the payload" code.

**Example:**
```python
# webhooks.py — new endpoint alongside existing one
@router.post("/webhooks/evolution")
@limiter.limit(f"{settings.RATE_LIMIT_REQUESTS_PER_MINUTE}/minute")
async def receive_evolution_webhook(request: Request) -> JSONResponse:
    # 1. Validate apikey header (no HMAC — Evolution API doesn't sign deliveries)
    apikey = request.headers.get("apikey", "")
    if apikey != settings.EVOLUTION_API_KEY:
        raise AppException(
            code="WEBHOOK_APIKEY_INVALID",
            message="API key inválida",
            status_code=403,
        )

    # 2. Parse body
    body_bytes = await request.body()
    try:
        import json
        body = json.loads(body_bytes)
    except Exception as exc:
        logger.warning("evolution.webhook.parse_error", error=str(exc))
        return JSONResponse(content=_success_response())

    # 3. Validate this is a messages.upsert event for an incoming message
    if body.get("event") != "messages.upsert":
        return JSONResponse(content=_success_response())
    if body.get("data", {}).get("key", {}).get("fromMe"):
        return JSONResponse(content=_success_response())

    # 4. Extract display_phone from instance name → resolve tenant
    instance = body.get("instance", "")
    # Instance name must map to a clinic phone number.
    # Simplest approach: instance IS the clinic's WhatsApp number (configured by operator)
    # OR use EVOLUTION_INSTANCE env var as the known phone for this deployment
    display_phone = settings.EVOLUTION_DISPLAY_PHONE  # see env vars discussion

    # 5. Dedup via message ID
    try:
        message_id = body["data"]["key"]["id"]
        dedup_key = f"webhook:dedup:{message_id}"
        acquired = await asyncio.to_thread(
            _get_redis_pool().set, dedup_key, 1, nx=True, ex=86400
        )
        if not acquired:
            return JSONResponse(content=_success_response())
    except (KeyError, TypeError):
        pass

    # 6. Resolve tenant
    tenant = await asyncio.to_thread(get_tenant_by_phone, display_phone)
    if tenant is None:
        logger.warning("evolution.webhook.tenant_not_found", phone=display_phone)
        return JSONResponse(content=_success_response())

    # 7. Normalize to internal dict and enqueue
    normalized = _normalize_evolution_payload(body)
    await asyncio.to_thread(_enqueue_task, normalized, str(tenant.tenant_id))
    return JSONResponse(content=_success_response())
```

### Pattern 2: Evolution Payload Normalizer

**What:** A pure function `_normalize_evolution_payload(body: dict) -> dict` that converts the Evolution API webhook shape into the same internal dict format that `_extract_message_info()` in `tasks.py` expects.

**Why:** The worker's `_extract_message_info()` navigates `payload["entry"][0]["changes"][0]["value"]["messages"][0]`. Rather than adding an Evolution-aware branch to every extract function in the worker, one normalization step at the webhook layer converts the payload into the Meta-compatible internal format. This is the minimal-change path.

**Evolution shape (verified, MEDIUM confidence):**
```json
{
  "event": "messages.upsert",
  "instance": "my-instance-name",
  "data": {
    "key": {
      "remoteJid": "5491112345678@s.whatsapp.net",
      "fromMe": false,
      "id": "ABCD1234"
    },
    "pushName": "Paciente Nombre",
    "message": {
      "conversation": "Hola, quiero turno"
    },
    "messageType": "conversation",
    "messageTimestamp": 1717689097,
    "instanceId": "abc123",
    "source": "ios"
  }
}
```

**Text extraction (verified from real usage, MEDIUM confidence):**
- Simple text: `body["data"]["message"]["conversation"]`
- Linked/quoted text: `body["data"]["message"]["extendedTextMessage"]["text"]`
- Must check both; otherwise message is not text type → skip

**Phone number extraction:**
- `body["data"]["key"]["remoteJid"]` → `"5491112345678@s.whatsapp.net"`
- Strip `@s.whatsapp.net` suffix to get bare phone number
- Example: `remoteJid.split("@")[0]` → `"5491112345678"`

**Normalized output dict (Meta-compatible internal format):**
```python
def _normalize_evolution_payload(body: dict) -> dict:
    """Convert Evolution API webhook body to internal Meta-compatible format.

    The internal format is consumed by tasks._extract_message_info() which
    navigates entry[0].changes[0].value.messages[0].
    Injects provider="evolution" so tasks.py dispatch knows which send_message to call.
    """
    data = body.get("data", {})
    key = data.get("key", {})
    remote_jid = key.get("remoteJid", "")
    phone = remote_jid.split("@")[0]  # strip "@s.whatsapp.net"

    msg_content = data.get("message", {})
    text = (
        msg_content.get("conversation")
        or msg_content.get("extendedTextMessage", {}).get("text")
        or ""
    )
    message_id = key.get("id", "")
    timestamp = str(data.get("messageTimestamp", ""))

    return {
        "provider": "evolution",
        "entry": [{
            "id": body.get("instance", ""),
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {
                        "display_phone_number": "",   # resolved separately
                        "phone_number_id": "",        # not used for Evolution send
                    },
                    "contacts": [],
                    "messages": [{
                        "from": phone,
                        "id": message_id,
                        "timestamp": timestamp,
                        "type": "text",
                        "text": {"body": text},
                    }],
                },
                "field": "messages",
            }],
        }],
    }
```

### Pattern 3: Provider Dispatch in tasks.py

**What:** In `process_whatsapp_message`, step 6 (send response) currently hard-codes Meta. Add a `provider` key check on the payload dict to dispatch to the correct send function.

**Example:**
```python
# tasks.py — step 6, replacing the current Meta-only block
if ai_text:
    provider = payload.get("provider", "meta")
    if provider == "evolution":
        if settings.EVOLUTION_API_KEY and settings.EVOLUTION_API_URL and settings.EVOLUTION_INSTANCE:
            try:
                from app.services.evolution_service import send_message as send_evolution_message
                send_evolution_message(
                    to_phone=phone_number,
                    message_text=ai_text,
                )
            except Exception as exc:
                logger.warning(
                    "Error enviando respuesta Evolution — continuando",
                    tenant_id=tenant_id,
                    phone_number=phone_number,
                    error=str(exc),
                )
        else:
            logger.warning("Evolution settings incompletos — respuesta no enviada", tenant_id=tenant_id)
    else:
        # Original Meta path — unchanged
        phone_number_id = _extract_phone_number_id(payload)
        if phone_number_id and settings.META_ACCESS_TOKEN:
            try:
                send_whatsapp_message(phone_number_id, phone_number, ai_text, settings.META_ACCESS_TOKEN)
            except Exception as exc:
                logger.warning("Error enviando respuesta WhatsApp — continuando", ...)
        elif not settings.META_ACCESS_TOKEN:
            logger.warning("META_ACCESS_TOKEN no configurado — respuesta no enviada", ...)
```

### Pattern 4: Evolution send_message Service

**What:** A thin httpx wrapper mirroring `whatsapp_service.py` but targeting Evolution API.

**Verified endpoint (HIGH confidence — from official docs):**
```
POST {EVOLUTION_API_URL}/message/sendText/{EVOLUTION_INSTANCE}
Headers: apikey: {EVOLUTION_API_KEY}
         Content-Type: application/json
Body: {"number": "5491112345678", "text": "Mensaje aquí"}
```

**Example:**
```python
# app/services/evolution_service.py
import httpx
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def send_message(to_phone: str, message_text: str) -> None:
    """Envía un mensaje de texto via Evolution API REST.

    Args:
        to_phone: Número destinatario sin "+" ni sufijos (ej: "5491112345678").
        message_text: Texto plano del mensaje.

    Raises:
        AppException: EVOLUTION_SEND_FAILED si el envío falla.
    """
    url = f"{settings.EVOLUTION_API_URL}/message/sendText/{settings.EVOLUTION_INSTANCE}"
    payload = {"number": to_phone, "text": message_text}
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                url,
                json=payload,
                headers={
                    "apikey": settings.EVOLUTION_API_KEY,
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
        logger.info("evolution.send_message.done", to=to_phone)
    except httpx.HTTPStatusError as exc:
        logger.warning("evolution.send_message.http_error", status_code=exc.response.status_code, to=to_phone, error=str(exc))
        from app.core.exceptions import AppException
        raise AppException("EVOLUTION_SEND_FAILED", f"Evolution API error {exc.response.status_code}", 502) from exc
    except Exception as exc:
        logger.warning("evolution.send_message.error", to=to_phone, error=str(exc))
        from app.core.exceptions import AppException
        raise AppException("EVOLUTION_SEND_FAILED", f"Error enviando mensaje: {exc}", 500) from exc
```

### Anti-Patterns to Avoid

- **Single endpoint with payload sniffing:** Don't detect provider from payload shape inside `receive_whatsapp_webhook`. It makes the Meta path fragile and fails silently if Evolution changes its format.
- **Modifying `_extract_message_info` for both formats:** Don't add Evolution branches to the existing Meta extraction functions. Use the normalizer at the webhook layer instead.
- **Making EVOLUTION_API_KEY, EVOLUTION_API_URL, EVOLUTION_INSTANCE required fields:** These should default to `""` or `None` (optional) because when `WHATSAPP_PROVIDER=meta`, they are not needed. Unlike Meta secrets, Evolution vars are optional.
- **Removing `provider` check from send step:** If `payload.get("provider")` is missing (e.g., old job in queue), it must default to `"meta"` to preserve backward compat.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client for Evolution API | Custom requests wrapper | httpx (already in project) | Already used in whatsapp_service.py; consistent timeout/error handling |
| Webhook URL routing | Complex middleware dispatch | Two separate FastAPI route functions | FastAPI routes are free; zero runtime overhead; clear separation |
| Phone number normalization | Complex regex for JID → phone | `remoteJid.split("@")[0]` | Evolution JIDs use consistent `phone@s.whatsapp.net` pattern |

---

## Common Pitfalls

### Pitfall 1: fromMe=True messages triggering the bot

**What goes wrong:** Evolution API sends webhook events for BOTH incoming AND outgoing messages. When `data.key.fromMe=true`, the message was sent BY the bot/clinic. If not filtered, the bot will respond to its own messages in an infinite loop.

**Why it happens:** Unlike Meta (which only webhooks incoming messages on the standard plan), Evolution webhooks everything including `SEND_MESSAGE` events.

**How to avoid:** Filter early in `receive_evolution_webhook`:
```python
if body.get("data", {}).get("key", {}).get("fromMe"):
    return JSONResponse(content=_success_response())
```
**Warning signs:** Duplicate messages, cost/rate explosions, infinite reply loops.

### Pitfall 2: remoteJid format variations

**What goes wrong:** `remoteJid` for group messages uses the format `120363...@g.us` not `phone@s.whatsapp.net`. If the agent accidentally processes group messages, it may respond in group chats.

**Why it happens:** Evolution API delivers group, individual, and broadcast messages all as `messages.upsert`.

**How to avoid:** Add a guard after extracting `remoteJid`:
```python
if not remote_jid.endswith("@s.whatsapp.net"):
    return JSONResponse(content=_success_response())  # skip groups, broadcasts
```

### Pitfall 3: Webhook auth is apikey header, not HMAC

**What goes wrong:** Applying the Meta HMAC verification pattern to Evolution webhooks will reject every delivery because Evolution does not sign its webhook payloads.

**Why it happens:** Meta uses HMAC-SHA256 via `X-Hub-Signature-256`. Evolution API (self-hosted v2.x) sends no signature. The `apikey` in the header is set by the operator when configuring the webhook endpoint — the receiver validates that the sender knows the expected key.

**How to avoid:** Use `request.headers.get("apikey") == settings.EVOLUTION_API_KEY` as the auth check. No HMAC computation needed.

**Warning signs:** All Evolution webhooks returning 403 immediately.

### Pitfall 4: Missing `event` check lets non-message events through

**What goes wrong:** Evolution sends many event types (QRCODE_UPDATED, CONNECTION_UPDATE, CONTACTS_UPSERT, etc.). If `event != "messages.upsert"` is not filtered, `_normalize_evolution_payload` will fail on KeyError.

**Why it happens:** Evolution webhooks are used for monitoring instance health, not just messages.

**How to avoid:** Return 200 immediately for any event that is not `messages.upsert`.

### Pitfall 5: Optional Evolution settings cause startup failure

**What goes wrong:** If `EVOLUTION_API_KEY`, `EVOLUTION_API_URL`, or `EVOLUTION_INSTANCE` are added as required fields (no default) to `Settings`, then all existing deployments and test suites will fail at boot when running `WHATSAPP_PROVIDER=meta` without Evolution configured.

**Why it happens:** Phase 8 made Meta secrets required. Evolution secrets must NOT follow the same pattern — they are optional per deployment.

**How to avoid:** Add Evolution fields with `= ""` or `= None` defaults (the opposite of META_APP_SECRET).

### Pitfall 6: tasks.py payload contract broken

**What goes wrong:** The existing `_extract_message_info()`, `_extract_phone_number_id()`, `_extract_display_phone()`, `_extract_patient_from_contacts()` all navigate the Meta-shaped dict. If Evolution payloads are enqueued in native format, all of these functions silently return `None`.

**Why it happens:** The normalize-at-webhook step is critical. If it is skipped or incomplete, the worker silently drops messages.

**How to avoid:** The normalizer MUST produce a dict that navigates correctly with `_extract_message_info`. Unit test the normalizer with Evolution fixture data.

---

## Code Examples

### Evolution API webhook payload — verified structure (MEDIUM confidence)

```python
# Source: https://medium.com/@araujo_89059/... + multiple GitHub issues + community reports

EVOLUTION_MESSAGES_UPSERT_PAYLOAD = {
    "event": "messages.upsert",
    "instance": "clinic-instance-name",
    "data": {
        "key": {
            "remoteJid": "5491112345678@s.whatsapp.net",
            "fromMe": False,
            "id": "ABCD1234EFGH5678"
        },
        "pushName": "Nombre Paciente",
        "message": {
            "conversation": "Hola quiero un turno"
            # OR: "extendedTextMessage": {"text": "Hola con preview"}
        },
        "messageType": "conversation",
        "messageTimestamp": 1717689097,
        "instanceId": "abc-uuid-123",
        "source": "ios"
    }
}
```

### Evolution API send text message (HIGH confidence — official docs)

```bash
# Source: https://doc.evolution-api.com/v2/api-reference/message-controller/send-text
POST {EVOLUTION_API_URL}/message/sendText/{INSTANCE_NAME}
Headers:
  apikey: {EVOLUTION_API_KEY}
  Content-Type: application/json

Body:
{
  "number": "5491112345678",
  "text": "Hola, su turno está confirmado"
}

Response 201:
{
  "key": {
    "remoteJid": "5491112345678@s.whatsapp.net",
    "fromMe": true,
    "id": "BAE594145F4C59B4"
  },
  "message": {"extendedTextMessage": {"text": "Hola, su turno está confirmado"}},
  "messageTimestamp": "1717689097",
  "status": "PENDING"
}
```

### env vars additions to config.py

```python
# app/core/config.py — new fields to add to Settings class
WHATSAPP_PROVIDER: str = "meta"         # "meta" | "evolution"
EVOLUTION_API_URL: str = ""             # e.g. "https://evolution.miserv.io"
EVOLUTION_API_KEY: str = ""             # global apikey from AUTHENTICATION_API_KEY
EVOLUTION_INSTANCE: str = ""            # instance name (e.g. "clinic-isadi")
EVOLUTION_DISPLAY_PHONE: str = ""       # clinic's WA number for tenant resolution
```

### .env.example additions

```bash
# WhatsApp Provider Selection
WHATSAPP_PROVIDER=meta   # "meta" | "evolution"

# Evolution API (required only when WHATSAPP_PROVIDER=evolution)
EVOLUTION_API_URL=https://your-evolution-server.example.com
EVOLUTION_API_KEY=429683C4C977415CAAFCCE10F7D57E11
EVOLUTION_INSTANCE=clinic-instance-name
EVOLUTION_DISPLAY_PHONE=5491112345678
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Evolution API v1 (webhook_by_events=false) | v2 per-event webhooks | v2 release 2023 | Event field is now reliable; use `event == "messages.upsert"` |
| Custom headers in webhook delivery (Cloud only) | No headers on self-hosted | As of v2.3.2 (2024) | Cannot HMAC-verify Evolution webhooks; apikey check is the only option |
| `send.message` event for sent messages | `messages.upsert` with `fromMe=true` | v2.2.3+ | Must filter by `fromMe` not by event name for sent/received distinction |

**Deprecated/outdated:**
- Evolution API v1 endpoint patterns (`/message/send-text`): v2 uses `/message/sendText/{instance}` — the path changed.
- Checking `event == "send.message"` to detect outbound messages: replaced by `data.key.fromMe=true` on `messages.upsert`.

---

## Open Questions

1. **Tenant resolution from Evolution instance name**
   - What we know: Evolution puts the `instance` name in the webhook body. The instance name is set by the operator when they connect to Evolution API.
   - What's unclear: The project resolves tenants via `display_phone_number` (clinic's WhatsApp number). Evolution doesn't send `display_phone_number` in the webhook.
   - Recommendation: Add `EVOLUTION_DISPLAY_PHONE` env var for this deployment phase. This is an MVP tradeoff — one Evolution deployment = one clinic. Future multi-tenant Evolution would require a lookup table from instance name → phone number.

2. **Human takeover detection with Evolution webhooks**
   - What we know: The current Meta handler uses `messages[0]["from"] == display_phone_number` to detect outbound messages from the clinic (human operator). With Evolution, `fromMe=true` is the equivalent.
   - What's unclear: Evolution's `contacts` array structure for outbound messages (needed for `/resume` slash command extraction of patient_phone).
   - Recommendation: For Phase 10 MVP, treat `fromMe=true` as a signal to return early (same as current Meta outbound detection). The `/resume` slash command path can remain Meta-only for now, or be explicitly documented as not yet supported in Evolution mode.

3. **Number format: Evolution remoteJid vs Meta `from` field**
   - What we know: Meta sends `"from": "15551234567"` (no country code prefix oddities, no suffix). Evolution sends `"remoteJid": "5491112345678@s.whatsapp.net"` — strip suffix for the number.
   - What's unclear: Whether the stripped number matches what is stored in Supabase `conversations.phone_number`. The Supabase records were created by Meta deliveries with Meta's format.
   - Recommendation: Use `remoteJid.split("@")[0]` and document that Evolution phone numbers include country code directly (no "+"). Test with a real Evolution webhook to verify format consistency.

---

## Sources

### Primary (HIGH confidence)
- https://doc.evolution-api.com/v2/api-reference/message-controller/send-text — Send text endpoint, URL pattern, apikey header, request body, response schema
- https://doc.evolution-api.com/v2/en/env.md — Environment variables including `AUTHENTICATION_API_KEY`, global webhook config
- https://doc.evolution-api.com/v2/api-reference/webhook/set.md — Webhook configuration schema (no secret/HMAC field confirmed)

### Secondary (MEDIUM confidence)
- https://medium.com/@araujo_89059/implementando-um-chat-realtime... — Real Python webhook handler showing `data.key.remoteJid`, `data.key.fromMe`, `data.message.conversation`, `data.message.extendedTextMessage.text`
- https://github.com/EvolutionAPI/evolution-api/issues/1340 — Confirms `event == "messages.upsert"` for both sent and received; `fromMe` field for disambiguation
- https://github.com/EvolutionAPI/evolution-api/issues/1933 — Confirms self-hosted v2.3.2 does NOT support custom headers in webhook delivery (no HMAC possible)

### Tertiary (LOW confidence — cross-verified with above)
- Multiple community reports (n8n, GitHub issues) confirming payload shape consistency: `event`, `instance`, `data.key`, `data.message` top-level fields
- WebSearch aggregation of real-world Evolution API integration examples (2024-2025)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; httpx and FastAPI already in project
- Send endpoint: HIGH — verified from official docs with exact URL, header, and body format
- Webhook payload shape: MEDIUM — verified from multiple real-world integrations; official docs lack payload examples but community usage is consistent
- Webhook auth (no HMAC): HIGH — official webhook set schema has no secret field; GitHub issue confirms self-hosted lacks custom headers
- Architecture pattern: HIGH — two-endpoint design is the only clean option given different auth mechanisms

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (Evolution API is actively developed; check CHANGELOG before implementation if delayed)
