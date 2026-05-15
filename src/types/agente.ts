export interface SystemPromptHistoryEntry {
  id: string
  tenant_id: string
  user_id: string
  previous_content: string | null
  new_content: string | null
  changed_at: string
}

export interface TenantAgentConfig {
  tenant_id: string
  system_prompt_override: string | null
  rules: Record<string, unknown>
  shadow_mode_enabled: boolean
}

export interface AgentConfigResponse {
  data: TenantAgentConfig
}

export interface UpdatePromptPayload {
  system_prompt_override: string
}

export interface UpdateShadowModePayload {
  shadow_mode_enabled: boolean
}
