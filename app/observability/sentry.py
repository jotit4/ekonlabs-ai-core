"""Sentry integration with recursive PII scrubbing.

Wires up Sentry SDK (when SENTRY_DSN is configured) with a before_send hook
that recursively replaces known PII field values in every event, including
breadcrumbs, extra context, request data, and exception values.

Call configure_sentry() once at app startup (main.py).
"""
from __future__ import annotations

import os
from typing import Any

from app.logging.processors import _PII_FIELDS, hash_pii

_SENTRY_AVAILABLE = False
try:
    import sentry_sdk  # type: ignore
    _SENTRY_AVAILABLE = True
except ImportError:
    pass


def _scrub_dict(obj: Any, depth: int = 0) -> Any:
    """Recursively replace PII field values in dicts and lists."""
    if depth > 10:
        return obj  # guard against pathological nesting

    if isinstance(obj, dict):
        return {
            k: hash_pii(str(v)) if (k in _PII_FIELDS and isinstance(v, (str, int)) and v) else _scrub_dict(v, depth + 1)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_scrub_dict(item, depth + 1) for item in obj]
    return obj


def _before_send(event: dict, hint: dict) -> dict:
    """Sentry before_send hook — scrubs PII from the full event tree."""
    return _scrub_dict(event)


def configure_sentry() -> None:
    """Initialize Sentry if SENTRY_DSN is set. No-op if DSN is absent or SDK not installed."""
    dsn = os.environ.get("SENTRY_DSN", "")
    if not dsn:
        return
    if not _SENTRY_AVAILABLE:
        return

    environment = os.environ.get("APP_ENV", "production")
    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        traces_sample_rate=0.1,
        before_send=_before_send,
        before_send_transaction=_before_send,
    )
