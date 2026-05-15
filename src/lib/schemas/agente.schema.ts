import { z } from 'zod'

export const SystemPromptOverrideSchema = z.object({
  system_prompt_override: z
    .string()
    .max(10000, { error: 'El override no puede superar 10.000 caracteres' }),
})

export type SystemPromptOverrideFormValues = z.infer<typeof SystemPromptOverrideSchema>
