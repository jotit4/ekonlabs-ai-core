"""Structlog processors for PII redaction.

Applies a deterministic, keyed hash to known PII fields so that:
- Logs contain no raw phone numbers, names, or DNI values.
- The same value always hashes to the same token (cross-log correlation still works).
- Without the pepper, the hash cannot be reversed (rainbow tables require the pepper).

Usage — added to the structlog processor chain in configure_logging():
    from app.logging.processors import redact_pii_processor
    processors = [..., redact_pii_processor, ...]

Environment:
    LOG_PII_PEPPER: secret string mixed into the hash. Rotating it invalidates
        old cross-references. Set via env/secret manager; never log this value.
"""
from __future__ import annotations

import hashlib
import os
from typing import Any

_PEPPER = os.environ.get("LOG_PII_PEPPER", "")

# Field names whose VALUES should be hashed wherever they appear in a log event.
# Add more as new PII-carrying field names are introduced.
_PII_FIELDS: frozenset[str] = frozenset({
    "phone",
    "phone_number",
    "to",
    "from",
    "patient_phone",
    "display_phone",
    "full_name",
    "name",
    "dni",
    "email",
})

# Prefix that makes redacted values recognisable in log output without exposing PII.
_REDACTED_PREFIX = "pii:"


def hash_pii(value: str) -> str:
    """Return a short, deterministic token for a PII value."""
    digest = hashlib.sha256((_PEPPER + str(value)).encode("utf-8")).hexdigest()
    return f"{_REDACTED_PREFIX}{digest[:12]}"


def redact_pii_processor(logger: Any, method: str, event_dict: dict) -> dict:
    """Structlog processor — replaces PII field values with hashed tokens.

    Operates only on top-level keys of event_dict (structlog events are flat dicts).
    Non-string values in PII fields are coerced to str before hashing.
    """
    for key in _PII_FIELDS:
        if key in event_dict and event_dict[key] is not None and event_dict[key] != "":
            event_dict[key] = hash_pii(str(event_dict[key]))
    return event_dict
