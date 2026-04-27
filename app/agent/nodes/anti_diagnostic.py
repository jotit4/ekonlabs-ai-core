"""Nodo: clasificador determinista anti-diagnóstico — detecta intención médica."""
from __future__ import annotations

import re
import unicodedata

from app.agent.state import ConversationState
from app.core.logging import get_logger

logger = get_logger(__name__)

# ── Leet / obfuscation normalization ────────────────────────────────────────

_LEET_TABLE = str.maketrans({
    "0": "o", "1": "i", "3": "e", "@": "a", "$": "s", "4": "a",
})

_INTER_CHAR_SEP = re.compile(r'(?<=\S)[.\-_](?=\S)')


def _normalize_query(text: str) -> str:
    """NFKD + leet decode + obfuscation separator removal for evasion resistance."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    # "r.e.c.e.t.a" → "receta", "k-e-t-a-m-i-n-a" → "ketamina"
    text = _INTER_CHAR_SEP.sub("", text)
    text = text.translate(_LEET_TABLE)
    return text


# ── Medical intent keywords (expanded from ISADI conversation corpus) ────────
# Fail-safe direction: TRUE (is medical). Any match → route to handoff / disclaimer.
# High-confidence medical terms — direct diagnosis/prescription requests
_MEDICAL_DIRECT: frozenset[str] = frozenset({
    # Diagnosis requests
    "diagnostico", "que tengo", "que enfermedad", "que padezco",
    "que me pasa", "que tengo yo",
    # Prescription / medication
    "receta", "recetame", "medicamento", "medicamentos",
    "remedio", "remedios", "pastilla", "pastillas",
    "antibiotico", "antibioticos", "analgesico", "antiinflamatorio", "antiinflamatorios",
    "dosis", "posologia",
    "que tomo", "que tomar", "cuanto tomo", "cuando tomo",
    "puedo tomar", "puedo usar",
    # Symptoms as medical queries (patient seeking advice, not just describing)
    "fiebre alta", "presion alta",
    "me duele el pecho", "dificultad para respirar",
    "que me recomienda", "que me recomiendas",
    "como me curo", "que hago si tengo", "que hago si me",
    "es grave", "puede ser grave", "es peligroso",
    # Self-medication
    "tratamiento casero", "remedio casero", "remedio natural",
    "me automedico",
    # Specific medication names / dosage patterns (common AR evasion targets)
    "ibuprofeno", "ibuprofeno mg", "paracetamol mg", "aspirina",
    "diclofenac", "omeprazol", "losartan", "enalapril",
    "mg ", " mg", "ml ", " ml",
    "cada hora", "veces al dia", "veces por dia",
    "tomalo con", "tomala con",
})

# ISADI-specific clinical terms — high value for physio/rehab clinic
_MEDICAL_CLINICAL: frozenset[str] = frozenset({
    "cirugia", "operacion", "post operatorio", "postoperatorio", "pre operatorio",
    "protocolo de cirugia", "protocolo quirurgico",
    "fkt magneto", "magnetoterapia", "electroterapia",
    "hallux", "valgus", "lumbalgia", "cervicalgia", "hernia de disco",
    "fractura", "lesion ligamentaria", "ligamento cruzado",
    "inflamacion", "hinchazon", "edema",
    "sangrado", "hemorragia",
    "mareo", "vahido", "nauseas", "vomito",
    "accidente", "traumatismo", "contusion",
    "me duele", "dolor en",
    "es normal que", "por que me duele",
})


def anti_diagnostic_node(state: ConversationState) -> dict:
    """Detecta intención de consulta médica (diagnóstico, recetas, síntomas).

    Fail-safe direction: TRUE (is_medical_query=True).
    Any error or uncertain state routes to handoff, never releases medical advice.

    Returns:
        dict con {"is_medical_query": True | False}.
    """
    tenant_id = state["tenant_id"]
    # Fail-safe: default TRUE — must prove it's NOT medical to pass through
    is_medical_query = True
    query = ""

    try:
        messages = state.get("messages") or []
        for msg in reversed(messages):
            if getattr(msg, "type", None) == "human" and getattr(msg, "content", ""):
                query = msg.content
                break

        if not query:
            # No user message — safe to pass (no medical content)
            is_medical_query = False
        else:
            normalized = _normalize_query(query)
            if (
                any(kw in normalized for kw in _MEDICAL_DIRECT)
                or any(kw in normalized for kw in _MEDICAL_CLINICAL)
            ):
                is_medical_query = True
            else:
                is_medical_query = False

    except Exception as exc:
        logger.warning(
            "anti_diagnostic_node.error",
            tenant_id=tenant_id,
            error=str(exc),
        )
        # Fail-safe: keep True on any processing error

    logger.info(
        "anti_diagnostic_node.done",
        tenant_id=tenant_id,
        is_medical_query=is_medical_query,
        query_preview=query[:80],
    )
    return {"is_medical_query": is_medical_query}
