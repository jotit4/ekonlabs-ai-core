# CLAUDE.md — ekonlabs-ai-core

Convenciones y checklist obligatorio para el agente de desarrollo (claude-sonnet-4-6).
Actualizado: 2026-03-25 (Epic 2 retrospective)

---

## Checklist Pre-Code-Review (obligatorio antes de marcar story como `review`)

Antes de terminar cualquier story, verificar cada punto:

### Async / I/O
- [ ] Operaciones bloqueantes (DB, Redis, HTTP) llamadas desde contexto async usan `asyncio.to_thread()`
- [ ] Nunca usar `asyncio.get_event_loop()` — usar `asyncio.run()` si se necesita loop (Python 3.14+)
- [ ] Tests de endpoints async usan `TestClient` (síncrono) — no crear loops manualmente

### TypedDict / Estado LangGraph
- [ ] Todo campo nuevo en `ConversationState` usa `NotRequired[T]` — nunca tipo directo (rompe invocaciones parciales)
- [ ] Import de `NotRequired` desde `typing_extensions` (compatibilidad) o `typing` (Python 3.11+)
- [ ] Campos opcionales tienen valor default en `state.get("campo", default)` en los nodos que los leen

### Variables de entorno
- [ ] Toda variable nueva de config se agrega a `.env.example` en la misma story
- [ ] `app/core/config.py` refleja el nuevo campo con tipo correcto y `default=None` si es opcional

### Tests — calidad de assertions
- [ ] Assertions verifican valores **específicos** (`== "valor_exacto"`, `== 200`) — nunca `>= 0` para valores conocidos
- [ ] Mocks de servicios usan `assert_called_once_with(arg1, arg2, ...)` para verificar payload real
- [ ] Nunca mockear y solo verificar que "fue llamado" sin verificar con qué argumentos
- [ ] Al menos un test verifica el **camino negativo** (error, None, excepción)

### Keyword classifiers (frozenset pattern)
- [ ] Keywords evaluadas contra casos de **agendamiento/scheduling** para verificar 0 falsos positivos
- [ ] Ejemplos de queries de scheduling: "agendar turno", "sacar cita", "qué hago para reservar", "disponibilidad"
- [ ] Preferir frases específicas sobre palabras sueltas amplias ("que hago si tengo" > "qué hago")

### Code review policy
- [ ] **TODA story debe pasar por `/bmad-bmm-code-review` adversarial antes de marcarse `done`**
- [ ] No hay excepciones — ni para stories "simples" ni para refactors menores

---

## Patrones establecidos en el proyecto

### Nodo LangGraph — estructura estándar
```python
from app.agent.state import ConversationState
from app.core.logging import get_logger

logger = get_logger(__name__)

def nombre_node(state: ConversationState) -> dict:
    tenant_id = state["tenant_id"]
    # lógica con fail-safe
    try:
        ...
    except Exception as exc:
        logger.warning("nombre_node.error", tenant_id=tenant_id, error=str(exc))
        # retornar default seguro
    logger.info("nombre_node.done", tenant_id=tenant_id, ...)
    return {"campo": valor}
```

### Keyword classifier — estructura estándar
```python
KEYWORDS: frozenset[str] = frozenset({
    "keyword uno",
    "keyword dos",
    # Evitar keywords de una palabra si son ambiguas
})

# En el nodo, iterar desde el último mensaje humano:
for msg in reversed(state.get("messages") or []):
    if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
        query = msg.content
        break
is_match = any(kw in query.lower() for kw in KEYWORDS)
```

### Mock de LLM singleton en tests
```python
from unittest.mock import patch, MagicMock

def test_algo():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = AIMessage(content="respuesta")
    with patch("app.agent.nodes.generation._llm", mock_llm):
        result = generation_node(state)
    mock_llm.invoke.assert_called_once_with(expected_messages)
```

### Routing condicional en graph
```python
def _route_after_nodo(state: ConversationState) -> str:
    if state.get("campo_flag", False):
        return "nodo_destino_a"
    return "nodo_destino_b"

builder.add_conditional_edges(
    "nombre_nodo",
    _route_after_nodo,
    {"nodo_destino_a": "nodo_destino_a", "nodo_destino_b": "nodo_destino_b"},
)
```

---

## Stack técnico — gotchas documentados

| Área | Gotcha | Solución |
|---|---|---|
| Pydantic + alias | `Field(alias="from")` serializa con nombre Python sin `by_alias=True` | Siempre usar `model_dump(by_alias=True)` al serializar para terceros |
| Meta API webhooks | HTTP 400 en payload inválido → Meta reintenta indefinidamente | Retornar 200 siempre después de validar HMAC, aunque el payload falle |
| TypedDict + LangGraph | Campo con tipo directo (no `NotRequired`) rompe `graph.invoke()` con estado parcial | `NotRequired[T]` para todo campo opcional |
| slowapi + Redis test | Rate limiting no testeable con Redis en ambiente de test | Aceptado — limitación conocida, documentar como F3-tipo en code review |
| asyncio Python 3.14+ | `get_event_loop()` no crea loop automáticamente | Usar `asyncio.run()` o `asyncio.to_thread()` |
| Google Calendar API | Service account necesita ser compartido como editor en el calendar del tenant | Instruir al tenant: Settings > Share > agregar service account email con rol "Make changes" |
