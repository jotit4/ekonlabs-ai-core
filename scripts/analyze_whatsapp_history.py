#!/usr/bin/env python3
"""
ISADI WhatsApp History Analyzer

Exports conversations from Evolution API, transcribes audio messages via
Groq Whisper, analyzes each conversation with Claude, and produces an
actionable insights report to improve the LangGraph agent.

Setup:
  pip install groq httpx

Env vars required:
  EVOLUTION_BASE       e.g. https://your-evolution-api.host
  EVOLUTION_API_KEY    Evolution API key
  EVOLUTION_INSTANCE   Instance name (e.g. "ISADI - WhatsApp")
  GROQ_API_KEY         Groq API key (used for both Whisper transcription and LLM analysis)

Usage:
  python scripts/analyze_whatsapp_history.py --phase export
  python scripts/analyze_whatsapp_history.py --phase transcribe
  python scripts/analyze_whatsapp_history.py --phase analyze
  python scripts/analyze_whatsapp_history.py --phase report
  python scripts/analyze_whatsapp_history.py --phase all
"""

import argparse
import base64
import json
import logging
import os
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

EVOLUTION_BASE = os.environ.get(
    "EVOLUTION_BASE", "https://ruzzi-evolution-api.az23sf.easypanel.host"
)
EVOLUTION_API_KEY = os.environ.get(
    "EVOLUTION_API_KEY", "429683C4C977415CAAFCCE10F7D57E11"
)
EVOLUTION_INSTANCE = os.environ.get("EVOLUTION_INSTANCE", "ISADI - WhatsApp")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
ANALYSIS_LLM_MODEL = "llama-3.3-70b-versatile"  # Groq LLM for analysis

SCRIPTS_DIR = Path(__file__).parent
DATA_DIR = SCRIPTS_DIR / "isadi_analysis"
RAW_DIR = DATA_DIR / "raw"
ANALYSES_DIR = DATA_DIR / "analyses"
REPORT_DIR = DATA_DIR / "report"

EVOLUTION_HEADERS = {"apikey": EVOLUTION_API_KEY, "Content-Type": "application/json"}
INSTANCE_SLUG = EVOLUTION_INSTANCE.replace(" ", "%20")

MIN_MESSAGES = 2          # ignore very short exchanges
ANALYSIS_MAX_TOKENS = 1024
REQUEST_DELAY = 0.15      # seconds between Evolution API calls


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ensure_dirs() -> None:
    for d in [RAW_DIR, ANALYSES_DIR, REPORT_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def save_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def ts_to_iso(ts: int) -> str:
    return datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d %H:%M")


# ---------------------------------------------------------------------------
# PHASE 1 — Export
# ---------------------------------------------------------------------------

def fetch_all_chats(client: httpx.Client) -> list[dict]:
    r = client.post(
        f"{EVOLUTION_BASE}/chat/findChats/{INSTANCE_SLUG}",
        json={},
        headers=EVOLUTION_HEADERS,
    )
    r.raise_for_status()
    chats = r.json()
    # Keep only individual conversations (groups end with @g.us)
    return [c for c in chats if not c.get("remoteJid", "").endswith("@g.us")]


def fetch_messages(client: httpx.Client, remote_jid: str) -> list[dict]:
    """Fetch all messages for a chat, paginated."""
    all_msgs: list[dict] = []
    page = 1
    limit = 100
    while True:
        r = client.post(
            f"{EVOLUTION_BASE}/chat/findMessages/{INSTANCE_SLUG}",
            json={
                "where": {"key": {"remoteJid": remote_jid}},
                "limit": limit,
                "offset": (page - 1) * limit,
            },
            headers=EVOLUTION_HEADERS,
        )
        r.raise_for_status()
        data = r.json()
        msgs_data = data.get("messages", {})
        records = msgs_data.get("records", [])
        all_msgs.extend(records)
        if page >= msgs_data.get("pages", 1):
            break
        page += 1
        time.sleep(REQUEST_DELAY)
    return all_msgs


def phase_export(limit: int = 0) -> None:
    log.info("=== PHASE 1: EXPORT ===")
    ensure_dirs()

    checkpoint_path = RAW_DIR / "_checkpoint.json"
    done: set[str] = set(load_json(checkpoint_path, []))

    with httpx.Client(timeout=30) as client:
        chats = fetch_all_chats(client)
        if limit:
            chats = chats[:limit]
        log.info(f"Individual chats to process: {len(chats)}")

        for i, chat in enumerate(chats, 1):
            jid = chat.get("remoteJid", "")
            name = chat.get("pushName") or jid
            safe_id = jid.replace("@", "_").replace(".", "_").replace(":", "_")

            if jid in done:
                log.info(f"[{i}/{len(chats)}] SKIP {name}")
                continue

            try:
                msgs = fetch_messages(client, jid)
            except Exception as e:
                log.warning(f"[{i}/{len(chats)}] ERROR fetching {name}: {e}")
                continue

            if len(msgs) < MIN_MESSAGES:
                done.add(jid)
                save_json(checkpoint_path, list(done))
                continue

            conversation = {
                "jid": jid,
                "name": name,
                "message_count": len(msgs),
                "messages": sorted(msgs, key=lambda m: m.get("messageTimestamp", 0)),
            }
            save_json(RAW_DIR / f"{safe_id}.json", conversation)
            done.add(jid)
            save_json(checkpoint_path, list(done))

            audio_count = sum(1 for m in msgs if m.get("messageType") == "audioMessage")
            log.info(f"[{i}/{len(chats)}] {name}: {len(msgs)} msgs ({audio_count} audios)")
            time.sleep(REQUEST_DELAY)

    log.info(f"Export complete. Files in {RAW_DIR}")


# ---------------------------------------------------------------------------
# PHASE 2 — Transcribe audios
# ---------------------------------------------------------------------------

def download_audio_b64(client: httpx.Client, msg: dict) -> str | None:
    """Call Evolution API to get decrypted base64 audio. Returns None on failure."""
    try:
        payload = {
            "message": {
                "key": msg["key"],
                "message": msg["message"],
                "messageType": msg["messageType"],
            },
            "convertToMp4": False,
        }
        r = client.post(
            f"{EVOLUTION_BASE}/chat/getBase64FromMediaMessage/{INSTANCE_SLUG}",
            json=payload,
            headers=EVOLUTION_HEADERS,
            timeout=30,
        )
        r.raise_for_status()
        return r.json().get("base64")
    except Exception as e:
        log.warning(f"  Audio download failed: {e}")
        return None


def transcribe_with_groq(audio_bytes: bytes, msg_id: str) -> str:
    """Transcribe audio bytes using Groq Whisper. Returns transcript string."""
    try:
        from groq import Groq  # type: ignore
        groq_client = Groq(api_key=GROQ_API_KEY)
        result = groq_client.audio.transcriptions.create(
            file=(f"{msg_id}.ogg", audio_bytes, "audio/ogg"),
            model="whisper-large-v3",
            language="es",
            response_format="text",
        )
        return str(result).strip()
    except Exception as e:
        log.warning(f"  Transcription failed for {msg_id}: {e}")
        return "[AUDIO: transcripción fallida]"


def phase_transcribe() -> None:
    if not GROQ_API_KEY:
        log.error("GROQ_API_KEY not set. Cannot transcribe.")
        return

    log.info("=== PHASE 2: TRANSCRIBE AUDIOS ===")
    ensure_dirs()

    raw_files = [f for f in RAW_DIR.glob("*.json") if not f.name.startswith("_")]
    log.info(f"Conversations to process: {len(raw_files)}")

    with httpx.Client(timeout=60) as client:
        for i, path in enumerate(raw_files, 1):
            conv = load_json(path, {})
            messages = conv.get("messages", [])
            name = conv.get("name", path.stem)
            modified = False

            audio_msgs = [m for m in messages if m.get("messageType") == "audioMessage"]
            if not audio_msgs:
                continue

            log.info(f"[{i}/{len(raw_files)}] {name}: {len(audio_msgs)} audios")

            for msg in audio_msgs:
                # Skip if already transcribed
                if msg.get("_transcript"):
                    continue

                b64 = download_audio_b64(client, msg)
                if not b64:
                    msg["_transcript"] = "[AUDIO: no disponible]"
                    modified = True
                    continue

                audio_bytes = base64.b64decode(b64)
                transcript = transcribe_with_groq(audio_bytes, msg["key"]["id"])
                msg["_transcript"] = transcript
                modified = True
                log.info(f"  → {transcript[:80]}")
                time.sleep(0.2)  # Groq rate limit buffer

            if modified:
                save_json(path, conv)

    log.info("Transcription complete.")


# ---------------------------------------------------------------------------
# PHASE 3 — Analyze conversations with Claude
# ---------------------------------------------------------------------------

ANALYSIS_PROMPT = """\
Sos un analista que estudia conversaciones de WhatsApp entre pacientes y la recepcionista \
de ISADI, un centro de kinesiología y rehabilitación en Mendoza, Argentina.

Tu tarea es analizar la conversación y devolver SOLO un JSON válido (sin texto extra).

Servicios que ofrece ISADI: Kinesiología, Fisioterapia, Pilates, Gimnasia Prenatal, \
Aquagym, Hidroterapia, Rehabilitación traumatológica, Rehabilitación física.

JSON a devolver:
{
  "intent_principal": "scheduling_request | cancellation | rescheduling | info_request | complaint | greeting_only | other",
  "servicios_mencionados": ["lista de servicios"],
  "obra_social_mencionada": "nombre de la OS o null",
  "requiere_orden_medica": true | false | null,
  "turno_confirmado": true | false,
  "resolucion": "booked | cancelled | rescheduled | info_given | phone_redirect | unresolved | other",
  "derivacion_telefonica": true | false,
  "friction_points": ["momentos de confusión o frustración del paciente"],
  "preguntas_sin_respuesta": ["preguntas que el paciente hizo y no fueron respondidas"],
  "gap_del_agente": "qué debería haber podido hacer un agente automático en esta conversación (null si nada)",
  "nuevos_intents_detectados": ["intenciones no cubiertas por scheduling/booking/info genérica"],
  "keywords_utiles": ["frases o palabras clave del paciente para detectar intenciones"],
  "notas": "observación relevante para el diseño del agente (null si nada)"
}"""


def build_conversation_text(conv: dict) -> str:
    """Convert messages list to readable conversation text."""
    lines = []
    for msg in conv.get("messages", []):
        from_me = msg.get("key", {}).get("fromMe", False)
        speaker = "RECEPCIONISTA" if from_me else "PACIENTE"
        ts = ts_to_iso(msg.get("messageTimestamp", 0))
        msg_type = msg.get("messageType", "unknown")
        msg_content = msg.get("message") or {}

        if msg_type == "conversation":
            text = msg_content.get("conversation", "")
        elif msg_type == "extendedTextMessage":
            text = (msg_content.get("extendedTextMessage") or {}).get("text", "")
        elif msg_type == "audioMessage":
            transcript = msg.get("_transcript", "[AUDIO: sin transcripción]")
            text = f"🎤 {transcript}"
        elif msg_type == "imageMessage":
            caption = (msg_content.get("imageMessage") or {}).get("caption", "")
            text = f"[IMAGEN{': ' + caption if caption else ''}]"
        elif msg_type == "documentMessage":
            text = "[DOCUMENTO]"
        elif msg_type == "stickerMessage":
            text = "[STICKER]"
        elif msg_type in ("reactionMessage", "protocolMessage", "ephemeralMessage"):
            continue  # skip system/meta messages
        else:
            text = f"[{msg_type}]"

        if text.strip():
            lines.append(f"[{ts}] {speaker}: {text}")

    return "\n".join(lines)


def analyze_conversation(groq_client, conv: dict) -> dict | None:
    """Run LLM analysis on one conversation using Groq. Returns parsed JSON dict."""
    conv_text = build_conversation_text(conv)
    if not conv_text.strip():
        return None

    if len(conv_text) > 8000:
        conv_text = conv_text[:8000] + "\n[... conversación truncada ...]"

    try:
        response = groq_client.chat.completions.create(
            model=ANALYSIS_LLM_MODEL,
            max_tokens=ANALYSIS_MAX_TOKENS,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": ANALYSIS_PROMPT},
                {"role": "user", "content": f"Analiza esta conversación:\n\n{conv_text}"},
            ],
        )
        raw = response.choices[0].message.content.strip()
        return json.loads(raw)
    except Exception as e:
        log.warning(f"  Analysis failed: {e}")
        return None


def phase_analyze() -> None:
    if not GROQ_API_KEY:
        log.error("GROQ_API_KEY not set.")
        return

    from groq import Groq  # type: ignore

    log.info("=== PHASE 3: ANALYZE CONVERSATIONS ===")
    ensure_dirs()

    groq_client = Groq(api_key=GROQ_API_KEY)
    raw_files = [f for f in RAW_DIR.glob("*.json") if not f.name.startswith("_")]
    log.info(f"Conversations to analyze: {len(raw_files)}")

    for i, path in enumerate(raw_files, 1):
        out_path = ANALYSES_DIR / path.name
        if out_path.exists():
            log.info(f"[{i}/{len(raw_files)}] SKIP (already analyzed): {path.stem}")
            continue

        conv = load_json(path, {})
        name = conv.get("name", path.stem)
        log.info(f"[{i}/{len(raw_files)}] Analyzing: {name}")

        analysis = analyze_conversation(groq_client, conv)
        if analysis is None:
            log.warning(f"  No analysis produced.")
            continue

        result = {
            "jid": conv.get("jid"),
            "name": name,
            "message_count": conv.get("message_count", 0),
            "analysis": analysis,
        }
        save_json(out_path, result)
        log.info(f"  intent={analysis.get('intent_principal')} | resolucion={analysis.get('resolucion')}")
        time.sleep(0.3)  # Groq rate limit buffer

    log.info("Analysis complete.")


# ---------------------------------------------------------------------------
# PHASE 4 — Synthesize report
# ---------------------------------------------------------------------------

def phase_report() -> None:
    log.info("=== PHASE 4: SYNTHESIZE REPORT ===")
    ensure_dirs()

    analyses = []
    for path in ANALYSES_DIR.glob("*.json"):
        data = load_json(path, {})
        if data.get("analysis"):
            analyses.append(data)

    if not analyses:
        log.error("No analyses found. Run --phase analyze first.")
        return

    log.info(f"Aggregating {len(analyses)} conversations...")

    # --- Aggregate stats ---
    intents = Counter(a["analysis"].get("intent_principal") for a in analyses)
    resoluciones = Counter(a["analysis"].get("resolucion") for a in analyses)
    obras_sociales = Counter(
        a["analysis"].get("obra_social_mencionada")
        for a in analyses
        if a["analysis"].get("obra_social_mencionada")
    )
    servicios = Counter()
    for a in analyses:
        for s in a["analysis"].get("servicios_mencionados", []):
            servicios[s] += 1

    all_gaps = [
        a["analysis"].get("gap_del_agente")
        for a in analyses
        if a["analysis"].get("gap_del_agente")
    ]
    all_new_intents = []
    for a in analyses:
        all_new_intents.extend(a["analysis"].get("nuevos_intents_detectados", []))

    all_keywords = []
    for a in analyses:
        all_keywords.extend(a["analysis"].get("keywords_utiles", []))

    all_unanswered = []
    for a in analyses:
        all_unanswered.extend(a["analysis"].get("preguntas_sin_respuesta", []))

    all_friction = []
    for a in analyses:
        all_friction.extend(a["analysis"].get("friction_points", []))

    derivaciones = sum(1 for a in analyses if a["analysis"].get("derivacion_telefonica"))
    turnos_confirmados = sum(1 for a in analyses if a["analysis"].get("turno_confirmado"))
    con_os = sum(1 for a in analyses if a["analysis"].get("obra_social_mencionada"))

    # --- Build report ---
    report = {
        "generated_at": datetime.utcnow().isoformat(),
        "total_conversations_analyzed": len(analyses),
        "summary": {
            "turnos_confirmados": turnos_confirmados,
            "derivaciones_telefonicas": derivaciones,
            "conversaciones_con_obra_social": con_os,
        },
        "intents": dict(intents.most_common()),
        "resoluciones": dict(resoluciones.most_common()),
        "obras_sociales_mencionadas": dict(obras_sociales.most_common()),
        "servicios_mencionados": dict(servicios.most_common()),
        "gaps_del_agente": all_gaps,
        "nuevos_intents_detectados": list(set(all_new_intents)),
        "keywords_utiles": list(set(all_keywords)),
        "preguntas_sin_respuesta": all_unanswered[:50],  # top 50
        "friction_points": all_friction[:50],
    }

    save_json(REPORT_DIR / "report.json", report)

    # --- Human-readable summary ---
    lines = [
        "# ISADI WhatsApp History Analysis",
        f"Generated: {report['generated_at']}",
        f"Conversations analyzed: {len(analyses)}",
        "",
        "## Summary",
        f"- Turnos confirmados: {turnos_confirmados}",
        f"- Derivaciones a teléfono: {derivaciones} ({derivaciones*100//len(analyses)}%)",
        f"- Conversaciones con obra social: {con_os}",
        "",
        "## Intents",
    ]
    for intent, count in intents.most_common():
        lines.append(f"- {intent}: {count}")

    lines += ["", "## Resoluciones"]
    for res, count in resoluciones.most_common():
        lines.append(f"- {res}: {count}")

    lines += ["", "## Obras Sociales Mencionadas"]
    for os_name, count in obras_sociales.most_common():
        lines.append(f"- {os_name}: {count} conversaciones")

    lines += ["", "## Servicios Más Solicitados"]
    for svc, count in servicios.most_common():
        lines.append(f"- {svc}: {count}")

    lines += ["", "## Gaps del Agente (muestra)"]
    for gap in all_gaps[:20]:
        lines.append(f"- {gap}")

    lines += ["", "## Nuevos Intents Detectados"]
    for intent in sorted(set(all_new_intents)):
        lines.append(f"- {intent}")

    lines += ["", "## Keywords Útiles para Detección"]
    for kw in sorted(set(all_keywords))[:40]:
        lines.append(f"- {kw}")

    lines += ["", "## Preguntas Sin Responder (muestra)"]
    for q in all_unanswered[:20]:
        lines.append(f"- {q}")

    report_md = "\n".join(lines)
    (REPORT_DIR / "report.md").write_text(report_md, encoding="utf-8")

    log.info(f"Report saved to {REPORT_DIR}/report.md")
    print("\n" + report_md)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

PHASES = {
    "export": phase_export,
    "transcribe": phase_transcribe,
    "analyze": phase_analyze,
    "report": phase_report,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="ISADI WhatsApp history analyzer")
    parser.add_argument(
        "--phase",
        choices=[*PHASES.keys(), "all"],
        required=True,
        help="Which phase to run",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max conversations to export (0 = all). Useful for pilot runs (e.g. --limit 70).",
    )
    args = parser.parse_args()

    if args.phase == "all":
        phase_export(limit=args.limit)
        phase_transcribe()
        phase_analyze()
        phase_report()
    elif args.phase == "export":
        phase_export(limit=args.limit)
    else:
        PHASES[args.phase]()


if __name__ == "__main__":
    main()
