export interface SystemPromptHistoryEntry {
  id: string
  tenant_id: string
  user_id: string
  previous_content: string | null
  new_content: string | null
  changed_at: string
}

/**
 * @deprecated La config del agente ya NO vive en `tenants`. La tabla canónica es
 * `v2_clinic_configs` (ver `ClinicAgentConfig`). Este tipo se conserva sólo para
 * el historial (Story 6.2) y para no romper imports legacy.
 */
export interface TenantAgentConfig {
  tenant_id: string
  system_prompt_override: string | null
  rules: Record<string, unknown>
  shadow_mode_enabled: boolean
}

/**
 * @deprecated Ver `ClinicAgentConfig`.
 */
export interface AgentConfigResponse {
  data: TenantAgentConfig
}

/**
 * @deprecated El editor ya no escribe `system_prompt_override`. Ver `UpdateClinicConfigPayload`.
 */
export interface UpdatePromptPayload {
  system_prompt_override: string
}

// ── Config canónica del agente: tabla v2_clinic_configs (Story 6.6) ───────────

/**
 * Features del agente. Nombres consumidos por el `prompt_builder` del backend
 * (ekonlabs-agent): `enable_cancel` (no `enable_cancel_appointment` del seed).
 */
export interface IaConfigFeatures {
  enable_new_appointment?: boolean
  enable_cancel?: boolean
  require_dni?: boolean
  require_obra_social?: boolean
}

/**
 * `ia_config` jsonb de `v2_clinic_configs`. Los nombres (`tone_base`, `tone_length`)
 * son los que LEE el agente — no los del seed (`tone`), que difieren.
 */
export interface IaConfig {
  tone_base?: string
  tone_length?: number
  identity?: string
  constraints?: string
  features?: IaConfigFeatures
}

/**
 * `operations_config` jsonb de `v2_clinic_configs`.
 */
export interface OperationsConfig {
  min_notice_hours?: number
  future_window_days?: number
}

/**
 * Forma canónica de la config del agente, leída/escrita por `/api/agente/config`.
 * Fuente de verdad: tabla `v2_clinic_configs` (`org_id = tenant_id`).
 */
export interface ClinicAgentConfig {
  org_id: string
  clinic_name: string | null
  agent_name: string | null
  prompt_rules: string | null
  ia_config: IaConfig
  operations_config: OperationsConfig
}

/**
 * Payload parcial para `PATCH /api/agente/config`. Sólo los campos editados.
 */
export interface UpdateClinicConfigPayload {
  agent_name?: string
  prompt_rules?: string
  ia_config?: IaConfig
  operations_config?: OperationsConfig
}

export interface UpdateShadowModePayload {
  shadow_mode_enabled: boolean
}

// ── Base de conocimiento del agente (knowledge_chunks vía backend) — Story 6.7 ──

/**
 * Entrada de la base de conocimiento que LEE el dashboard. El backend agente
 * (`ekonlabs-agent`) es la única parte que escribe `knowledge_chunks` (service
 * role) y genera el `embedding`. El dashboard nunca expone `embedding` ni
 * `tenant_id` (no vienen en el contrato del backend).
 */
export interface KnowledgeEntry {
  id: string
  content: string
  source_filename: string
  chunk_index: number
  created_at: string
}

/**
 * Respuesta de `GET /api/agente/knowledge` y del backend
 * `GET /api/v1/tenants/{tenant_id}/knowledge`.
 */
export interface KnowledgeListResponse {
  entries: KnowledgeEntry[]
}

/**
 * Body de `POST /api/agente/knowledge`. `source_filename` ("tema" en la UI)
 * es opcional; el backend usa `"general"` por defecto.
 */
export interface CreateKnowledgePayload {
  content: string
  source_filename?: string
}

/**
 * Body de `PATCH /api/agente/knowledge/[id]`. Al menos un campo presente.
 */
export interface UpdateKnowledgePayload {
  content?: string
  source_filename?: string
}
