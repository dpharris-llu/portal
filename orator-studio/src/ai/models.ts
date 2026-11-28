/**
 * Which Claude model does which job. One table, so cost and quality are
 * decided in one place and the usage page shows the result by task.
 *
 * Sonnet is the standard: careful work where a mistake reaches the author's
 * argument (reading papers, quotes and page numbers, comparing studies,
 * answering questions about the evidence, proposing the message and points).
 * Haiku does low-stakes work whose result the author sees at once and can
 * simply redo (a search query).
 */

export const SONNET = "claude-sonnet-5-5";
export const HAIKU = "claude-haiku-5-5";

export type Effort = "low" | "medium" | "high";
export type TaskModel = { model: string; effort: Effort };

export const TASK_MODELS: Record<string, TaskModel> = {
  search_plan: { model: HAIKU, effort: "medium" },
  read_paper: { model: SONNET, effort: "high" },
  synthesize: { model: SONNET, effort: "high" },
  analyze_figures: { model: SONNET, effort: "high" },
  probe: { model: SONNET, effort: "high" },
  propose: { model: SONNET, effort: "high" },
  messages: { model: SONNET, effort: "high" },
  outline: { model: SONNET, effort: "medium" },
};

export function modelFor(task: string): TaskModel {
  return TASK_MODELS[task] ?? { model: SONNET, effort: "high" };
}

/**
 * Server-side fallback: when a model declines a request on policy grounds,
 * the API retries on another model in the same call. Sonnet has it; Haiku
 * doesn't (a declined Haiku request returns as a refusal).
 */
export function fallbackParams(model: string): { betas: ["server-side-fallback-2026-07-01"]; fallbacks: "default" } | Record<string, never> {
  return model === HAIKU ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
}
