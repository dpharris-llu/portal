/**
 * The JSON schema sent to Anthropic for structured output. Anthropic accepts
 * a subset of JSON Schema: no numeric limits (minimum, maximum, multipleOf),
 * no string length limits, no maxItems, and every object closed with
 * additionalProperties: false. Those limits are removed here.
 *
 * Claude can't see them, so an answer may run past one (a longer query, one
 * more item). Rejecting it would throw away a request already paid for, so
 * `fitToLimits` trims over-long text and lists to the limits first; the zod
 * schema then checks everything else as before.
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

type Json = Record<string, unknown>;

/** Trim strings and arrays in `value` to the maxLength / maxItems of `schema`. */
export function fitToLimits(schema: z.ZodType, value: unknown): unknown {
  const root = z.toJSONSchema(schema) as Json;
  const defs = ((root.$defs ?? root.definitions) as Record<string, Json> | undefined) ?? {};
  const resolve = (s: Json): Json => {
    const ref = typeof s.$ref === "string" ? s.$ref.split("/").pop() : undefined;
    return ref && defs[ref] ? resolve(defs[ref]) : s;
  };
  const fit = (raw: Json | undefined, v: unknown): unknown => {
    if (!raw) return v;
    const s = resolve(raw);
    const branches = (s.anyOf ?? s.oneOf) as Json[] | undefined;
    if (branches) {
      // A union: use the branch whose fixed values (such as kind) match.
      const match = branches.map(resolve).find((b) => {
        const props = (b.properties ?? {}) as Record<string, Json>;
        return v && typeof v === "object" && Object.entries(props).every(([k, p]) => p.const === undefined || (v as Json)[k] === p.const);
      });
      return match ? fit(match, v) : v;
    }
    if (typeof v === "string" && typeof s.maxLength === "number" && v.length > s.maxLength) return v.slice(0, Math.max(0, s.maxLength - 1)) + "…";
    if (Array.isArray(v)) {
      const items = s.items as Json | undefined;
      const list = typeof s.maxItems === "number" ? v.slice(0, s.maxItems) : v;
      return list.map((x) => fit(items, x));
    }
    if (v && typeof v === "object" && s.properties) {
      const props = s.properties as Record<string, Json>;
      return Object.fromEntries(Object.entries(v as Json).map(([k, x]) => [k, fit(props[k], x)]));
    }
    return v;
  };
  return fit(root, value);
}
