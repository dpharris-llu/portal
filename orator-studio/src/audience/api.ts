/** Request schemas for the live audience API. */
import { z } from "zod";

export const Device = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const PollSpecSchema = z.object({
  blockId: z.string().min(1).max(64),
  kind: z.enum(["choice", "rating", "ranking", "text", "wordcloud"]),
  question: z.string().max(300),
  options: z.array(z.string().max(120)).max(12),
  scale: z.number().int().min(2).max(10).optional(),
});

export const HostAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("openPoll"), spec: PollSpecSchema }),
  z.object({ type: z.literal("closePoll") }),
  z.object({ type: z.literal("moderateQuestion"), questionId: z.string(), status: z.enum(["pending", "approved", "dismissed", "answered"]) }),
  z.object({ type: z.literal("moderateText"), blockId: z.string(), device: Device, status: z.enum(["pending", "approved", "rejected"]) }),
  z.object({ type: z.literal("approveUnflagged"), blockId: z.string() }),
  z.object({ type: z.literal("setLocked"), locked: z.boolean() }),
  z.object({ type: z.literal("setQa"), open: z.boolean() }),
  z.object({ type: z.literal("end") }),
]);
export type HostAction = z.infer<typeof HostAction>;

export const Answer = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), option: z.number().int() }),
  z.object({ kind: z.literal("rating"), value: z.number().int() }),
  z.object({ kind: z.literal("ranking"), order: z.array(z.number().int()).max(12) }),
  z.object({ kind: z.literal("text"), text: z.string().max(1000) }),
]);

export const ParticipantAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("respond"), blockId: z.string().max(64), answer: Answer }),
  z.object({ type: z.literal("ask"), text: z.string().max(1000) }),
  z.object({ type: z.literal("vote"), questionId: z.string().max(64) }),
]);
export type ParticipantAction = z.infer<typeof ParticipantAction>;
