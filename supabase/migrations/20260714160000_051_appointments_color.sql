-- Migration 051 — appointments.color: color MANUAL y OPCIONAL que elige la
-- recepcionista al dar (o editar) un turno — pedido real del cliente ISADI
-- (2026-07-14): reproducir en la agenda EXACTAMENTE los colores de su turnero
-- Excel actual. El significado de cada color lo decide la recepcionista; el
-- sistema no le impone ninguna semántica (paleta MUDA — ver
-- src/lib/agenda/turnero-palette.ts para los 16 hex exactos y el validador).
--
-- DECISIÓN DE PRODUCTO (2026-07-14, reemplaza la decisión previa "color de la
-- agenda = ESTADO" documentada históricamente en status-colors.ts, ya removido
-- del repo): el color de fondo del turno en el calendario pasa a ser SIEMPRE
-- el color manual, si existe: sin color manual el turno se pinta neutro (como
-- una celda sin pintar del Excel), NUNCA cae al color de estado. El estado del
-- turno se sigue guardando y mostrando en el detalle del turno
-- (TurnoDetailModal) — no desaparece del modelo ni de la API, solo de la
-- representación visual del calendario.
--
-- CHECK de formato: hex de 6 dígitos con '#' (mismo criterio que
-- HEX_COLOR_REGEX en turnero-palette.ts). NO se restringe a los 16 valores de
-- la paleta a nivel DB — la paleta es solo lo que ofrece el selector de la UI;
-- el backend acepta cualquier hex válido (más flexible a futuro).
--
-- Aditiva e idempotente. Nullable: las filas existentes quedan con color =
-- NULL (se comportan igual que un turno sin color manual). 100% segura.
--
-- ESTADO: YA APLICADA en prod (2026-07-14, autorizado por el usuario) —
-- verificado: columna creada, 43 turnos existentes intactos con color NULL.
-- Este archivo es el registro idempotente de ese DDL ya corrido — NO
-- reaplicar vía MCP/CLI contra esa base; sirve para entornos nuevos (dev
-- local / otro tenant) y como fuente de verdad versionada del esquema.

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_color_hex_chk;

ALTER TABLE public.appointments ADD CONSTRAINT appointments_color_hex_chk
  CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

COMMENT ON COLUMN public.appointments.color IS
  'Color de fondo del turno en la agenda (hex #RRGGBB). Lo elige la recepcionista; su significado lo define la clínica, no el sistema. NULL = sin color.';
