-- Migration: Fix JWT claim name from 'role' to 'app_role'
-- Bug C-02: custom_access_token_hook was injecting claim as 'role',
-- but all TypeScript code reads 'app_role'. This migration corrects both
-- the hook and the user_role() helper function.

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'app_role', '');
$$;

GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  claims         jsonb;
  user_tenant_id uuid;
  user_role      text;
  user_active    boolean;
BEGIN
  SELECT tenant_id, role, is_active
    INTO user_tenant_id, user_role, user_active
    FROM public.dashboard_users
   WHERE user_id = (event->>'user_id')::uuid;

  IF user_tenant_id IS NULL OR user_active = false THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_status', 403,
        'message',     'access_denied'
      )
    );
  END IF;

  claims := event->'claims';
  claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant_id));
  claims := jsonb_set(claims, '{app_role}', to_jsonb(user_role));
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
