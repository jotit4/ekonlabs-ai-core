-- migrations/002_calendar_columns.sql
-- Story 3.1 — Migración DB: columnas calendar_id y calendar_credentials en tabla tenants
-- Scope: Inserción Transaccional Segura (Agendamiento & Handoff Suave)

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS calendar_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS calendar_credentials JSONB;

-- NOTA: Ambas son nullable. Tenants sin calendario siguen operando con RAG normal.
-- Para el tenant de prueba de desarrollo, poblar con:
-- UPDATE tenants
--   SET calendar_id = 'XXXX@group.calendar.google.com',
--       calendar_credentials = '{ ... service account JSON ... }'
-- WHERE id = '<tenant_id_desarrollo>';
