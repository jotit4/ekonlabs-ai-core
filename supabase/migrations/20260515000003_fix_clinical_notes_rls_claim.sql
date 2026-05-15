-- Migration: Fix clinical_notes RLS policies to use 'app_role' instead of 'role'
-- Bug C-02 (part 2): clinical_notes policies were checking auth.jwt() ->> 'role'
-- but the JWT now emits 'app_role' after the custom_access_token_hook fix.
-- Drop and recreate the three policies with the corrected claim name.

DROP POLICY IF EXISTS "clinical_notes_select_own" ON public.clinical_notes;
DROP POLICY IF EXISTS "clinical_notes_insert_own" ON public.clinical_notes;
DROP POLICY IF EXISTS "clinical_notes_update_own" ON public.clinical_notes;

-- Solo doctor y admin del mismo tenant pueden leer
CREATE POLICY "clinical_notes_select_own"
  ON public.clinical_notes FOR SELECT TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    auth.jwt() ->> 'app_role' IN ('doctor', 'admin')
  );

-- Solo doctor y admin pueden insertar (author_id = uid del usuario)
CREATE POLICY "clinical_notes_insert_own"
  ON public.clinical_notes FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    author_id = auth.uid() AND
    auth.jwt() ->> 'app_role' IN ('doctor', 'admin')
  );

-- El autor o cualquier admin del tenant puede actualizar
CREATE POLICY "clinical_notes_update_own"
  ON public.clinical_notes FOR UPDATE TO authenticated
  USING (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    (author_id = auth.uid() OR auth.jwt() ->> 'app_role' = 'admin')
  )
  WITH CHECK (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '') AND
    (author_id = auth.uid() OR auth.jwt() ->> 'app_role' = 'admin')
  );
