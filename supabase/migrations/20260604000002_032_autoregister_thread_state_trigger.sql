-- Migration: trigger de auto-registro de thread_states ante INSERT en conversations
-- Story 4.8 (Bandeja Espejo) — Capa B, defensa en profundidad a nivel base de datos.
--
-- Garantiza el invariante "toda conversación con mensajes tiene una fila en
-- thread_states", independientemente de que el backend (ekonlabs-agent) acierte el
-- upsert. El backend lo registra fire-and-forget + fail-soft; si ese upsert falla
-- transitoriamente (timeout, rate-limit), la conversación quedaba invisible en la
-- bandeja. Este trigger cierra esa ventana a nivel DB.
--
-- Semántica:
--   - ON CONFLICT (tenant_id, phone_number) DO NOTHING → NUNCA pisa un estado
--     existente (respeta un 'paused' de human_takeover y un 'active' previo).
--     Solo crea la fila 'active' cuando NO existe ninguna.
--   - best-effort: el upsert va dentro de un bloque EXCEPTION para que un fallo del
--     auto-registro (ej. violación de CHECK/FK por datos atípicos) JAMÁS aborte el
--     INSERT a `conversations`. Persistir el mensaje es la prioridad; el registro del
--     hilo es secundario (igual que el ensure_thread_registered del backend).

CREATE OR REPLACE FUNCTION public.autoregister_thread_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.thread_states (tenant_id, phone_number, status)
    VALUES (NEW.tenant_id, NEW.phone_number, 'active')
    ON CONFLICT (tenant_id, phone_number) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- best-effort: nunca abortar el INSERT a conversations por un fallo del auto-registro
    NULL;
  END;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.autoregister_thread_state() IS
'Capa B Story 4.8: crea thread_states ''active'' ante INSERT en conversations si no existe '
'(ON CONFLICT DO NOTHING respeta paused/active previos). best-effort: no aborta el INSERT origen.';

DROP TRIGGER IF EXISTS trg_autoregister_thread_state ON public.conversations;
CREATE TRIGGER trg_autoregister_thread_state
AFTER INSERT ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.autoregister_thread_state();
