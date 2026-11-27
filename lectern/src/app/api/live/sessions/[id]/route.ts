import { NextResponse } from "next/server";
import { store } from "@/audience/store";
import { HostAction } from "@/audience/api";
import { approveUnflagged, closePoll, moderateQuestion, moderateText, openPoll } from "@/audience/model";

export const dynamic = "force-dynamic";

/** Presenter actions on a session. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = store.get(id);
  if (!s) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (typeof body?.key !== "string" || !store.checkHost(s, body.key)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const parsed = HostAction.safeParse(body.action);
  if (!parsed.success) return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  const a = parsed.data;

  const result = store.mutate(s, (sess) => {
    switch (a.type) {
      case "openPoll":
        openPoll(sess, a.spec);
        return { ok: true as const };
      case "closePoll":
        closePoll(sess);
        return { ok: true as const };
      case "moderateQuestion":
        return moderateQuestion(sess, a.questionId, a.status);
      case "moderateText":
        return moderateText(sess, a.blockId, a.device, a.status);
      case "approveUnflagged":
        approveUnflagged(sess, a.blockId);
        return { ok: true as const };
      case "setLocked":
        sess.locked = a.locked;
        return { ok: true as const };
      case "setQa":
        sess.qaOpen = a.open;
        return { ok: true as const };
      case "end":
        closePoll(sess);
        sess.ended = true;
        return { ok: true as const };
    }
  });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 409 });
}
