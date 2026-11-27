import { NextResponse } from "next/server";
import { getStore } from "@/audience/store";
import { memory, sseResponse } from "@/audience/store-memory";
import { Device } from "@/audience/api";
import { join, participantView } from "@/audience/model";

export const dynamic = "force-dynamic";

/** Live participant view over Server-Sent Events. Local mode only. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (getStore().kind !== "memory") return NextResponse.json({ error: "Use Realtime." }, { status: 410 });
  const { code } = await params;
  const device = Device.safeParse(new URL(request.url).searchParams.get("device"));
  if (!device.success) return NextResponse.json({ error: "Invalid device." }, { status: 400 });
  const s = memory.byJoinCode(code);
  if (!s) return NextResponse.json({ error: "No session with that code." }, { status: 404 });
  const joined = memory.mutate(s, (sess) => join(sess, device.data, Date.now()));
  if (!joined.ok) return NextResponse.json({ error: joined.error }, { status: 403 });
  return sseResponse(request, s.id, () => {
    const cur = memory.sessions.get(s.id);
    return cur ? participantView(cur, device.data) : null;
  });
}
