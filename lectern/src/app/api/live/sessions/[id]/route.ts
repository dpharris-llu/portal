import { NextResponse } from "next/server";
import { getStore } from "@/audience/store";
import { respondWith } from "@/audience/http";
import { HostAction } from "@/audience/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** The presenter's view: results, queues, participant count, and the room view to relay. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  return respondWith(() => getStore().hostView(id, key));
}

/** Presenter actions. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = HostAction.safeParse(body?.action);
  if (typeof body?.key !== "string" || !action.success) return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  return respondWith(() => getStore().host(id, body.key, action.data), () => ({ ok: true }));
}
