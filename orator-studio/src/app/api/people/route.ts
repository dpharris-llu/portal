import { NextResponse } from "next/server";
import { z } from "zod";
import { invite, listPeople, PeopleError, requireAdmin, setAdmin, setBlocked, whoAmI } from "@/lib/people";

export const dynamic = "force-dynamic";

const fail = (e: unknown) => {
  const err = e instanceof PeopleError ? e : new PeopleError("Something went wrong.", 500);
  if (!(e instanceof PeopleError)) console.error("people:", e);
  return NextResponse.json({ error: err.message }, { status: err.status });
};

/** GET: whether you're an administrator; for administrators, everyone with access (F-126). */
export async function GET() {
  try {
    const me = await whoAmI();
    if (!me?.admin) return NextResponse.json({ admin: false });
    return NextResponse.json({ admin: true, me: me.user.id, people: await listPeople() });
  } catch (e) {
    if (e instanceof PeopleError && e.status === 501) return NextResponse.json({ admin: false });
    return fail(e);
  }
}

const Invite = z.object({ email: z.string().min(3).max(320), note: z.string().max(300).optional() });

/** POST an email: invite that person. */
export async function POST(request: Request) {
  try {
    const by = await requireAdmin();
    const parsed = Invite.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Give an email address." }, { status: 400 });
    return NextResponse.json(await invite(parsed.data.email, by, parsed.data.note));
  } catch (e) {
    return fail(e);
  }
}

const Change = z.object({ userId: z.string().uuid(), blocked: z.boolean().optional(), admin: z.boolean().optional() });

/** PATCH: block or restore someone, or make them an administrator. */
export async function PATCH(request: Request) {
  try {
    const by = await requireAdmin();
    const parsed = Change.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid change." }, { status: 400 });
    if (parsed.data.blocked !== undefined) await setBlocked(parsed.data.userId, parsed.data.blocked, by);
    if (parsed.data.admin !== undefined) await setAdmin(parsed.data.userId, parsed.data.admin, by);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
