import { NextResponse } from "next/server";
import { sseResponse, store } from "@/audience/store";
import { Device } from "@/audience/api";
import { join, normalizeCode, participantView } from "@/audience/model";

export const dynamic = "force-dynamic";

/** Live participant view for one device. Joining happens here. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const device = Device.safeParse(new URL(request.url).searchParams.get("device"));
  if (!device.success) return NextResponse.json({ error: "Invalid device." }, { status: 400 });
  const s = store.byJoinCode(normalizeCode(code));
  if (!s) return NextResponse.json({ error: "No session with that code." }, { status: 404 });
  const joined = store.mutate(s, (sess) => join(sess, device.data, Date.now()));
  if (!joined.ok) return NextResponse.json({ error: joined.error }, { status: 403 });
  return sseResponse(request, s.id, () => {
    const cur = store.get(s.id);
    return cur ? participantView(cur, device.data) : null;
  });
}
