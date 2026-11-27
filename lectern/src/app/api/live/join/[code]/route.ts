import { NextResponse } from "next/server";
import { getStore } from "@/audience/store";
import { respondWith } from "@/audience/http";
import { Device, ParticipantAction } from "@/audience/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** This device's view. Joins the session if needed. No account needed (A-01). */
export async function GET(request: Request, { params }: Ctx) {
  const { code } = await params;
  const device = Device.safeParse(new URL(request.url).searchParams.get("device"));
  if (!device.success) return NextResponse.json({ error: "Invalid device." }, { status: 400 });
  return respondWith(async () => {
    const r = await getStore().participantView(code, device.data);
    return r.ok ? { ok: true as const, value: { view: r.value, transport: getStore().kind === "supabase" ? "realtime" : "sse" } } : r;
  });
}

/** Respond to a poll, ask a question, or vote. */
export async function POST(request: Request, { params }: Ctx) {
  const { code } = await params;
  const body = await request.json().catch(() => null);
  const device = Device.safeParse(body?.device);
  const action = ParticipantAction.safeParse(body?.action);
  if (!device.success || !action.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  return respondWith(() => getStore().participant(code, device.data, action.data), (v) => ({ ok: true, ...v }));
}
