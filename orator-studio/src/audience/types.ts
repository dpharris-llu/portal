import type { HostAction, ParticipantAction } from "./api";
import type { HostView, ParticipantView } from "./model";

/** An error the API turns into an HTTP status. */
export type StoreResult<T = void> = { ok: true; value: T } | { ok: false; error: string; status: number };

export interface Created {
  id: string;
  code: string;
  hostKey: string;
}

/**
 * Where live sessions are kept. "memory" holds them in this server process and
 * streams changes over Server-Sent Events (local mode). "supabase" keeps them in
 * Postgres and pushes changes over Supabase Realtime (works on serverless).
 */
export interface LiveStore {
  kind: "memory" | "supabase";
  create(hostUser: string | null): Promise<StoreResult<Created>>;
  hostView(id: string, key: string): Promise<StoreResult<HostView>>;
  host(id: string, key: string, action: HostAction): Promise<StoreResult>;
  /** Joins if needed, then returns this device's view. */
  participantView(code: string, device: string): Promise<StoreResult<ParticipantView>>;
  /** Returns the new question's id for "ask". */
  participant(code: string, device: string, action: ParticipantAction): Promise<StoreResult<{ id?: string }>>;
}
