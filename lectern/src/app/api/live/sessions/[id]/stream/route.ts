import { NextResponse } from "next/server";
import { getStore } from "@/audience/store";
import { memory, sseResponse } from "@/audience/store-memory";
import { hostView } from "@/audience/model";

export const dynamic = "force-dynamic";

/** Live host view over Server-Sent Events. Local mode only; Supabase mode uses Realtime. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (getStore().kind !== "memory") return NextResponse.json({ error: "Use Realtime." }, { status: 410 });
  const { id } = await params;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const s = memory.sessions.get(id);
  if (!s) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if (!memory.isHost(s, key)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  return sseResponse(request, id, () => {
    const cur = memory.sessions.get(id);
    return cur ? hostView(cur) : null;
  });
}
