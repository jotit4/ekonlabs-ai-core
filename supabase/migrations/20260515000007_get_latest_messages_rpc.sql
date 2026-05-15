-- Migration: RPC para obtener el último mensaje por número de teléfono
-- Bug C-13: .limit(phoneNumbers.length) no garantiza 1 fila por número
-- La RPC usa DISTINCT ON para retornar exactamente 1 fila por phone_number

CREATE OR REPLACE FUNCTION public.get_latest_messages_by_phone(phone_numbers text[])
RETURNS TABLE (
  phone_number text,
  content      text,
  role         text,
  created_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (c.phone_number)
    c.phone_number,
    c.content,
    c.role,
    c.created_at
  FROM public.conversations c
  WHERE c.tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
    AND c.phone_number = ANY(phone_numbers)
  ORDER BY c.phone_number, c.created_at DESC;
$$;

-- Solo usuarios autenticados pueden llamar la RPC (RLS por tenant_id en WHERE)
GRANT EXECUTE ON FUNCTION public.get_latest_messages_by_phone(text[]) TO authenticated;
