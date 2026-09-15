import assert from "node:assert/strict";
import test from "node:test";
import { classifyFailure, modelCandidates, shouldFallback } from "../extensions/fallback.ts";

test("deduplicates primary and fallback models in priority order", () => {
  assert.deepEqual(
    modelCandidates("provider/primary", ["provider/fallback", "provider/primary", "provider/last"]),
    ["provider/primary", "provider/fallback", "provider/last"],
  );
});

test("falls back by default only for unavailable models and exhausted usage", () => {
  assert.equal(classifyFailure({ exitCode: 1, stderr: "Unknown model provider/missing" }), "model_unavailable");
  assert.equal(classifyFailure({ exitCode: 1, errorMessage: "You have reached your weekly usage limit" }), "usage_limit");
  assert.equal(classifyFailure({ exitCode: 1, errorMessage: "You've hit your org's monthly spend limit" }), "usage_limit");
  assert.equal(shouldFallback("model_unavailable", undefined), true);
  assert.equal(shouldFallback("usage_limit", undefined), true);
  assert.equal(shouldFallback("rate_limit", undefined), false);
});

test("requires an explicit opt-in to fall back after rate limiting", () => {
  assert.equal(classifyFailure({ exitCode: 1, errorMessage: "HTTP 429: too many requests" }), "rate_limit");
  assert.equal(shouldFallback("rate_limit", ["rate_limit"]), true);
});

test("never treats cancellation or unknown errors as fallback candidates", () => {
  assert.equal(classifyFailure({ exitCode: 1, stopReason: "aborted" }), "aborted");
  assert.equal(classifyFailure({ exitCode: 1, errorMessage: "Tool execution failed" }), "other");
  assert.equal(shouldFallback("other", ["model_unavailable", "usage_limit"]), false);
});
