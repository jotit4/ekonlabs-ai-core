-- Migration 049: eliminar la columna muerta patients.preferred_professional_id
--
-- Creada en la 018 (Epic 9, calendario nativo) pero NUNCA cableada en la aplicación:
-- 0 datos en prod, 0 referencias en el dashboard (solo su propia migración + test) y
-- 0 referencias en el agente. Coexistía con primary_professional_id (migración 047,
-- "KLGO a cargo"), dejando DOS FKs patients→professionals y por ende ambigüedad de
-- embed en PostgREST (HTTP 300 "Multiple Choices" al pedir professionals(name) desde
-- patients). Se consolida el concepto en primary_professional_id.
--
-- DROP COLUMN cascadea su índice parcial (idx_patients_preferred_professional) y su
-- constraint FK (patients_preferred_professional_id_fkey) automáticamente.
--
-- DB-only. Esta migración NO se aplica automáticamente: el usuario la aplica en EasyPanel.

ALTER TABLE public.patients DROP COLUMN IF EXISTS preferred_professional_id;
