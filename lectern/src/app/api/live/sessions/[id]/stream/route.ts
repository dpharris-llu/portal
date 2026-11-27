import { NextResponse } from "next/server";
import { sseResponse, store } from "@/audience/store";
import { hostView } from "@/audience/model";

export const dynamic = "force-dynamic";

/** Live host view: results, queues, participant count. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const s = store.get(id);
  if (!s) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if (!store.checkHost(s, key)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  return sseResponse(request, id, () => {
    const cur = store.get(id);
    return cur ? hostView(cur) : null;
  });
}
