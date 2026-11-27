import "server-only";
import { NextResponse } from "next/server";
import type { StoreResult } from "./types";

/** Run a store call and map its result (or a crash) to an HTTP response. */
export async function respondWith<T>(fn: () => Promise<StoreResult<T>>, shape: (v: T) => unknown = (v) => v): Promise<NextResponse> {
  try {
    const r = await fn();
    return r.ok ? NextResponse.json(shape(r.value) ?? { ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    console.error("Live audience error", e);
    return NextResponse.json({ error: "The live service is unavailable. Slides still work." }, { status: 503 });
  }
}
