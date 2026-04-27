# ARCO / DSR Runbook — Ley 25.326 (Argentina)

**Responsable del dato**: ISADI (clínica)  
**Encargado del tratamiento**: ekonlabs  
**Plazo legal de respuesta**: 10 días hábiles (Art. 14/15 Ley 25.326)  
**Contacto DSR entrante**: innovateia.io@gmail.com (ekonlabs ops)

---

## Tipos de solicitud y flujo

| Código | Derecho | Artículo | Quién responde |
|---|---|---|---|
| ARCO-A | Acceso | Art. 14 | ekonlabs → extrae datos y entrega a ISADI |
| ARCO-R | Rectificación | Art. 16 | ekonlabs aplica UPDATE, ISADI confirma |
| ARCO-C | Cancelación / Supresión | Art. 17 | ekonlabs ejecuta checklist de 6 superficies |
| ARCO-O | Oposición al tratamiento | Art. 34 | revoke_consent() + stop processing |

---

## Checklist de cancelación (6 superficies)

Ejecutar en orden. Registrar timestamp de cada paso.

### 1. Supabase (base de datos principal)

```sql
-- Identificar paciente
SELECT patient_id FROM public.patients
WHERE phone_number = '<phone>' AND tenant_id = '<tenant_uuid>';

-- Revocar consentimiento
UPDATE public.patient_consents
SET revoked_at = now()
WHERE phone_hash = '<hash_pii(phone)>' AND tenant_id = '<tenant_uuid>' AND revoked_at IS NULL;

-- Anonimizar / borrar paciente
UPDATE public.patients
SET phone_number = 'REDACTED-' || patient_id,
    full_name = 'ELIMINADO',
    dni = NULL
WHERE patient_id = '<patient_uuid>';

-- Borrar appointments si corresponde
DELETE FROM public.appointments
WHERE patient_id = '<patient_uuid>' AND tenant_id = '<tenant_uuid>';

-- Borrar mensajes de conversación
DELETE FROM public.messages
WHERE conversation_id IN (
  SELECT conversation_id FROM public.conversations
  WHERE phone_number = '<phone>' AND tenant_id = '<tenant_uuid>'
);
DELETE FROM public.conversations
WHERE phone_number = '<phone>' AND tenant_id = '<tenant_uuid>';
```

### 2. Redis

```bash
# Borrar buffer de mensajes
redis-cli DEL "buffer_msgs:<tenant_id>:<hash_pii(phone)>"
redis-cli DEL "buffer_pending:<tenant_id>:<hash_pii(phone)>"
redis-cli DEL "consent_pending:<tenant_id>:<hash_pii(phone)>"

# Borrar draft de booking si existe
redis-cli DEL "booking_draft:<tenant_id>:<phone>"   # legacy key
redis-cli DEL "booking_draft:<tenant_id>:<hash_pii(phone)>"
```

### 3. Google Calendar

- Abrir Google Calendar de ISADI con la service account del tenant.
- Buscar eventos por `ref:<lookup_token(phone, calendar_id)>` en la descripción.
- Borrar o editar los eventos para eliminar cualquier dato identificable.
- El `lookup_token` se puede calcular: `sha256(phone + ":" + calendar_id)[:20]`.

### 4. Sentry

- Ir a `sentry.io → Project → Issues`.
- Buscar por el hash: `pii:<sha256(pepper + phone)[:12]>`.
- Borrar eventos que contengan el hash del paciente.
- (Los nuevos eventos ya tienen before_send recursivo que redacta PII.)

### 5. Logs del servidor

```bash
# En el servidor / contenedor — ajustar path según deploy
grep -r "pii:<hash_pii(phone)>" /var/log/ekonlabs/ | head -20

# Si se encuentran, contactar al equipo de infraestructura para:
# - Purgar líneas del log de producción con el hash del paciente
# - Verificar que Sentry no guarda breadcrumbs con el hash
```

### 6. RQ / Worker jobs

- En RQ Dashboard o via `rq info`, verificar que no haya jobs pendientes
  con `phone=<phone>` en los args.
- Si existen, cancelar los jobs desde la UI de RQ o:

```bash
rq empty default  # SOLO si no hay otros pacientes procesándose
```

---

## Código de respuesta al paciente

```
Estimado/a [nombre],

Hemos recibido su solicitud ARCO-[tipo] en fecha [fecha].
En el plazo de 10 días hábiles le informaremos sobre las acciones tomadas
conforme a la Ley 25.326 de Protección de Datos Personales.

Atentamente,
ISADI / ekonlabs
```

---

## Prueba en seco (dry-run mensual)

1. Crear un paciente de prueba con phone `+5491100000000`.
2. Enviar un mensaje de WhatsApp de prueba.
3. Ejecutar el checklist completo de cancelación para ese phone.
4. Verificar que no queden trazas en las 6 superficies.
5. Registrar fecha y resultado en este documento.

| Fecha | Ejecutado por | Resultado |
|---|---|---|
| — | — | — |

---

## Contactos

| Rol | Nombre | Email |
|---|---|---|
| Responsable ISADI | — | — |
| Encargado ekonlabs | — | innovateia.io@gmail.com |
| DPA Google Workspace | Google LLC | workspace-dpa@google.com |
