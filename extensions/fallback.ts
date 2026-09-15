export type FallbackFailure = "model_unavailable" | "usage_limit" | "rate_limit" | "other" | "aborted";

export interface FailedAttempt {
  exitCode: number;
  stopReason?: string;
  errorMessage?: string;
  stderr?: string;
}

/**
 * Classifies the terminal error emitted by Pi JSON mode. This is intentionally
 * conservative: unknown failures never consume a fallback model.
 */
export function classifyFailure(attempt: FailedAttempt): FallbackFailure {
  if (attempt.stopReason === "aborted") return "aborted";

  const text = `${attempt.errorMessage ?? ""}\n${attempt.stderr ?? ""}`.toLowerCase();
  if (/model .*(not found|not available|unavailable)|unknown model|no model .*available|model .*not .*catalog|no api key.*model|authentication.*model/.test(text)) {
    return "model_unavailable";
  }
  if (/usage limit|quota.*exceed|insufficient quota|credit balance|monthly.*limit|weekly.*limit|spend.*limit/.test(text)) {
    return "usage_limit";
  }
  if (/rate limit|too many requests|http 429|status.*429|throttl/.test(text)) {
    return "rate_limit";
  }
  return "other";
}

export function modelCandidates(primary: string | undefined, fallbacks: readonly string[] | undefined): string[] {
  return [primary, ...(fallbacks ?? [])].filter((model): model is string => Boolean(model)).filter((model, index, all) => all.indexOf(model) === index);
}

export function shouldFallback(
  failure: FallbackFailure,
  configured: readonly FallbackFailure[] | undefined,
): boolean {
  const enabled = configured ?? ["model_unavailable", "usage_limit"];
  return enabled.includes(failure);
}
