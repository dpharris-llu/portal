import { NextResponse } from "next/server";
import { store } from "@/audience/store";
import { Device, ParticipantAction } from "@/audience/api";
import { ask, join, normalizeCode, respond, vote } from "@/audience/model";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

/** Participant actions: respond to a poll, ask a question, vote. No account needed (A-01). */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const s = store.byJoinCode(normalizeCode(code));
  if (!s) return NextResponse.json({ error: "No session with that code." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const device = Device.safeParse(body?.device);
  const action = ParticipantAction.safeParse(body?.action);
  if (!device.success || !action.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const d = device.data;
  const a = action.data;
  const now = Date.now();

  const result = store.mutate(s, (sess) => {
    const joined = join(sess, d, now);
    if (!joined.ok) return joined;
    switch (a.type) {
      case "respond":
        return respond(sess, d, a.blockId, a.answer, now);
      case "ask":
        return ask(sess, d, a.text, randomUUID().slice(0, 12), now);
      case "vote":
        return vote(sess, d, a.questionId);
    }
  });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 409 });
}
