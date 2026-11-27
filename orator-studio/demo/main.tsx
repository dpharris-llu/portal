/**
 * OratorStudio demo: the app's own pages, running entirely in the browser.
 * Decks are saved in this browser. Outlines use the built-in template, and
 * audience polls and Q&A are off because phones need a server to connect to.
 */
import { createRoot } from "react-dom/client";
import "../src/app/globals.css";
import { ParamsContext, usePath } from "./router";
import Home from "../src/app/page";
import NewDeck from "../src/app/new/page";
import ImportPage from "../src/app/import/page";
import DocumentsPage from "../src/app/documents/page";
import DataUrlPage from "../src/app/data/page";
import EditorPage from "../src/app/decks/[id]/page";
import PresentPage from "../src/app/decks/[id]/present/page";
import { OutlineRequest, templateOutline } from "../src/ai/outline";
import { localRepo } from "../src/lib/repo";
import { sampleDeckOps } from "../src/model/sample";
import { applyOp, makeOp } from "../src/model/ops";

// Answer the outline API in the browser with the template outline.
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith("/api/outline")) {
    const parsed = OutlineRequest.safeParse(JSON.parse(String(init?.body ?? "{}")));
    if (!parsed.success) return new Response(JSON.stringify({ error: "Fill in the goal and time limit." }), { status: 400 });
    return new Response(JSON.stringify({ outline: templateOutline(parsed.data), source: "template" }), {
      headers: { "content-type": "application/json" },
    });
  }
  // Pages on claude.ai can't make requests to other sites, so URLs are fetched only by the full app's server.
  if (url.endsWith("/api/sources/fetch")) {
    return new Response(
      JSON.stringify({ error: "This demo can't fetch URLs: pages on claude.ai can't reach other sites. Open the URL in your browser, save the response, and upload or paste it below." }),
      { status: 501, headers: { "content-type": "application/json" } },
    );
  }
  // The demo has no server: Claude is reached through the page's claude.ai capability instead.
  if (url.endsWith("/api/analyze")) {
    return init?.method === "POST"
      ? new Response(JSON.stringify({ error: "Open this page in claude.ai to use your Claude account.", code: "not_configured" }), { status: 501 })
      : new Response(JSON.stringify({ available: false }), { headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
};

const routes: { pattern: RegExp; keys: string[]; Page: () => React.ReactNode }[] = [
  { pattern: /^\/$/, keys: [], Page: Home },
  { pattern: /^\/new$/, keys: [], Page: NewDeck },
  { pattern: /^\/import$/, keys: [], Page: ImportPage },
  { pattern: /^\/documents$/, keys: [], Page: DocumentsPage },
  { pattern: /^\/data$/, keys: [], Page: DataUrlPage },
  { pattern: /^\/decks\/([^/]+)$/, keys: ["id"], Page: EditorPage },
  { pattern: /^\/decks\/([^/]+)\/present$/, keys: ["id"], Page: PresentPage },
];

function App({ start }: { start: string }) {
  const path = usePath(start);
  for (const r of routes) {
    const m = path.match(r.pattern);
    if (m) {
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return (
        <ParamsContext.Provider value={params}>
          <r.Page key={path} />
        </ParamsContext.Provider>
      );
    }
  }
  return <Home />;
}

/** First visit: create the demo deck and open it, so there is something to try at once. */
async function startPath(): Promise<string> {
  try {
    const decks = await localRepo.list();
    if (decks.length) return "/";
    const { deck: empty, ops } = sampleDeckOps();
    const log = ops.map((op) => makeOp(op, { kind: "human", id: "local-user" }, "Created demo deck"));
    const deck = log.reduce(applyOp, empty);
    await localRepo.save(deck, log, true);
    return `/decks/${deck.id}`;
  } catch {
    return "/"; // storage blocked: the pages still work, without saving
  }
}

startPath().then((start) => createRoot(document.getElementById("root")!).render(<App start={start} />));
