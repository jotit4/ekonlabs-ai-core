"""Evolution API webhook payload — type reference and fixture."""
# This module documents the expected Evolution API webhook shape.
# The endpoint uses raw dict parsing (not Pydantic model_validate) because
# Evolution sends many event types and we filter by event field before full parse.

EVOLUTION_MESSAGES_UPSERT_FIXTURE = {
    "event": "messages.upsert",
    "instance": "clinic-isadi",
    "data": {
        "key": {
            "remoteJid": "5491112345678@s.whatsapp.net",
            "fromMe": False,
            "id": "ABCD1234EFGH5678",
        },
        "pushName": "Nombre Paciente",
        "message": {
            "conversation": "Hola quiero un turno",
        },
        "messageType": "conversation",
        "messageTimestamp": 1717689097,
        "instanceId": "abc-uuid-123",
        "source": "ios",
    },
}
