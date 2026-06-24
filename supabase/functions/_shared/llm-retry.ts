export interface RetryAttempt {
  attempt: number;
  status: number | null;
  error_message: string | null;
  duration_ms: number;
  timestamp: string;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  attempts: RetryAttempt[];
  final_error?: string;
}

const RETRYABLE_STATUSES = new Set([429, 503, 529]);
const RETRYABLE_MESSAGES = ["fetch failed", "network", "econnreset", "timeout", "aborted"];

function isRetryableByDefault(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // HTTP status embutido na mensagem (ex: "Gemini 503: ...")
    const statusMatch = err.message.match(/\b(\d{3})\b/);
    if (statusMatch) {
      const code = parseInt(statusMatch[1], 10);
      if (RETRYABLE_STATUSES.has(code)) return true;
      // 4xx (exceto 429) e 500/502 → não faz retry
      if (code >= 400) return false;
    }
    return RETRYABLE_MESSAGES.some((kw) => msg.includes(kw));
  }
  // objeto com propriedade status
  if (typeof err === "object" && err !== null && "status" in err) {
    const code = (err as { status: number }).status;
    return RETRYABLE_STATUSES.has(code);
  }
  return false;
}

/**
 * Executa fn com retry + backoff exponencial.
 * Retry apenas em erros transitórios: 503, 429, 529, erros de rede.
 * Delays: initialDelayMs × backoffMultiplier^(tentativa-1) + jitter 0-500ms.
 * Nunca throwa — retorna RetryResult<T>.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    backoffMultiplier?: number;
    isRetryable?: (err: unknown) => boolean;
  },
): Promise<RetryResult<T>> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 2000;
  const backoffMultiplier = options?.backoffMultiplier ?? 4;
  const isRetryable = options?.isRetryable ?? isRetryableByDefault;

  const attempts: RetryAttempt[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();
    try {
      const data = await fn();
      attempts.push({
        attempt,
        status: null,
        error_message: null,
        duration_ms: Date.now() - attemptStart,
        timestamp: new Date().toISOString(),
      });
      return { success: true, data, attempts };
    } catch (err: unknown) {
      const durationMs = Date.now() - attemptStart;
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Extrair status code da mensagem se disponível
      const statusMatch = errorMessage.match(/\b(\d{3})\b/);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : null;

      attempts.push({
        attempt,
        status,
        error_message: errorMessage,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
      });

      const retryable = isRetryable(err);

      if (!retryable || attempt === maxAttempts) {
        return { success: false, attempts, final_error: errorMessage };
      }

      // Backoff exponencial + jitter
      const baseDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
      const jitter = Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
    }
  }

  // Nunca chega aqui, mas satisfaz o compilador
  return { success: false, attempts, final_error: "Max attempts reached" };
}
