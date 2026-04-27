"""Input sanitizer — strips prompt-injection patterns from user messages.

Threat model: a patient sends XML-like tags (or ChatML delimiters) that
try to override the system prompt. Since the default system prompt uses
XML tags (<identidad>, <tono>, etc.), adversarial closing tags could
potentially confuse the model about the boundary between system and user content.

Defense:
  1. Strip known dangerous patterns.
  2. Wrap sanitized text in a neutral delimiter so the LLM always knows
     exactly where user content begins and ends.

This is a deterministic, zero-latency guardrail — no LLM call required.
It runs before every generation_node call.
"""
from __future__ import annotations

import re

# ChatML role-switch tokens used by some models / fine-tunes.
_CHATML_TOKENS = re.compile(r"<\|im_(start|end)\|>", re.IGNORECASE)

# XML-like tags that map to the system-prompt structure.
# We strip the closing variants (</tag>) because those are the injection vector —
# a close-tag makes the model think a system instruction block has ended.
_SYSTEM_XML_TAGS = re.compile(
    r"</?(?:identidad|tono|fuentes_de_verdad|puede_hacer|no_puede_hacer|system|protocolo|user_input)\s*/?>",
    re.IGNORECASE,
)

# Our own wrapping delimiters — strip to prevent nesting.
_OUR_DELIMITERS = re.compile(r"</?user_input\s*/?>", re.IGNORECASE)


def sanitize_user_input(text: str) -> str:
    """Remove injection patterns and wrap in safe delimiters.

    The resulting string is suitable for embedding in the messages_for_llm list
    as the content of a HumanMessage.

    Rules:
      - ChatML role tokens → removed.
      - System-prompt XML tags → removed.
      - Our own <user_input> delimiters → removed (prevent nesting).
      - Result is wrapped: <user_input>{cleaned}</user_input>
    """
    if not isinstance(text, str):
        return text

    cleaned = _CHATML_TOKENS.sub("", text)
    cleaned = _SYSTEM_XML_TAGS.sub("", cleaned)
    cleaned = _OUR_DELIMITERS.sub("", cleaned)
    # Normalize runs of whitespace introduced by removals.
    cleaned = re.sub(r"\s{3,}", "  ", cleaned).strip()

    return f"<user_input>{cleaned}</user_input>"
