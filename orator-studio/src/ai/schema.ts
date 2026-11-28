/**
 * The JSON schema sent to Anthropic for structured output. Anthropic accepts
 * a subset of JSON Schema: no numeric limits (minimum, maximum, multipleOf),
 * no string length limits, no maxItems, and every object closed with
 * additionalProperties: false. Those limits are removed here and still
 * enforced by the zod schema when the answer comes back, so nothing loosens.
 */
import { z } from "zod";

const DROP = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "maxItems",
  "pattern",
  "format",
  "default",
]);

export function forAnthropic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(forAnthropic);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (DROP.has(k)) continue;
    // minItems is allowed only as 0 or 1.
    if (k === "minItems" && typeof v === "number" && v > 1) continue;
    // Keys inside "properties" are field names, not keywords: keep them all.
    out[k] = k === "properties" && v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([n, s]) => [n, forAnthropic(s)])) : forAnthropic(v);
  }
  if (out.type === "object" && out.properties) out.additionalProperties = false;
  return out;
}

export const outputSchema = (schema: z.ZodType) => forAnthropic(z.toJSONSchema(schema)) as Record<string, unknown>;
