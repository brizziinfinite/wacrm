import { useCallback, useEffect, useState } from 'react';
import type { AiQualifierConfig } from '@/types';

/**
 * Default shape for a not-yet-configured account. Mirrors the column
 * defaults in migration 042_ai_qualifier.sql — used only for the local
 * form state before the first save; the API route lazily creates the
 * real row on first PUT (see route.ts's comment on GET returning null).
 */
export const DEFAULT_QUALIFY_PROMPT =
  'Você é um qualificador de leads. Com base nas respostas coletadas, classifique o lead como "hot", "warm" ou "cold". Responda apenas com um JSON: {"score": "hot"|"warm"|"cold", "reason": "..."}.';

export const DEFAULT_AI_QUALIFIER_CONFIG: Pick<
  AiQualifierConfig,
  | 'enabled'
  | 'questions'
  | 'qualify_prompt'
  | 'hot_pipeline_id'
  | 'hot_stage_id'
  | 'hot_tag_id'
  | 'warm_tag_id'
  | 'cold_tag_id'
  | 'model'
  | 'temperature'
> = {
  enabled: true,
  questions: [],
  qualify_prompt: DEFAULT_QUALIFY_PROMPT,
  hot_pipeline_id: null,
  hot_stage_id: null,
  hot_tag_id: null,
  warm_tag_id: null,
  cold_tag_id: null,
  model: 'gemini-2.5-flash',
  temperature: 0.3,
};

export type AiQualifierConfigPatch = Partial<
  Omit<AiQualifierConfig, 'id' | 'account_id' | 'created_at' | 'updated_at'>
>;

/**
 * Loads and saves the caller's account AI qualifier config via the
 * `/api/ai-qualifier/config` route (Task 6). That route resolves
 * `account_id` server-side from the session and ignores any
 * client-supplied `id`/`account_id`/`created_at`/`updated_at`, so this
 * hook never sends those fields.
 */
export function useAiQualifier() {
  const [config, setConfig] = useState<AiQualifierConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-qualifier/config', { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (payload && typeof payload === 'object' && 'error' in payload
            ? String((payload as { error?: string }).error)
            : null) || 'Failed to load AI qualifier config'
        );
      }
      setConfig((payload ?? null) as AiQualifierConfig | null);
      return (payload ?? null) as AiQualifierConfig | null;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load AI qualifier config';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (patch: AiQualifierConfigPatch): Promise<AiQualifierConfig> => {
      setError(null);
      try {
        const res = await fetch('/api/ai-qualifier/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (payload && typeof payload === 'object' && 'error' in payload
              ? String((payload as { error?: string }).error)
              : null) || 'Failed to save AI qualifier config'
          );
        }
        const saved = payload as AiQualifierConfig;
        setConfig(saved);
        return saved;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to save AI qualifier config';
        setError(message);
        throw err;
      }
    },
    []
  );

  return { config, loading, error, load, save };
}
