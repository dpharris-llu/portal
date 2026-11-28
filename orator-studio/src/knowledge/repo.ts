/**
 * The knowledge model's operations, in the model's own terms: keep a source
 * and its facts, create a topic, observe, assert, link a fact, build a
 * presentation from topics and assertions. Screens call these; the backend
 * decides where the rows live.
 */
import type { Backend } from "./backend";
import type { Assertion, AssertionFact, Fact, Id, LinkRole, Observation, Presentation, PresentationAssertion, PresentationTopic, ReviewFlag, Source, Topic, TopicSource } from "./types";

export type NewFact = Pick<Fact, "text"> & Partial<Pick<Fact, "kind" | "quote" | "page" | "checked">>;
export type NewSource = Pick<Source, "kind" | "title"> & Partial<Omit<Source, "id" | "owner_id" | "created_at" | "updated_at" | "status" | "discard_reason">>;

export type TopicView = {
  topic: Topic;
  links: TopicSource[];
  sources: Source[];
  facts: Fact[];
  observations: Observation[];
  assertions: Assertion[];
  assertionFacts: AssertionFact[];
  flags: ReviewFlag[];
};

export type PresentationView = {
  presentation: Presentation;
  topics: Topic[];
  /** Chosen assertions per topic, in order. */
  chosen: Record<Id, Assertion[]>;
  /** Every assertion of the chosen topics, to choose from. */
  available: Record<Id, Assertion[]>;
  assertionFacts: AssertionFact[];
  facts: Fact[];
  sources: Source[];
  flags: ReviewFlag[];
};

const byMap = <T extends { id: Id }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

export function repo(db: Backend) {
  const one = async <T>(p: Promise<T[]>): Promise<T> => {
    const [row] = await p;
    if (!row) throw new Error("Not found, or not yours to change.");
    return row;
  };

  const api = {
    db,
    userId: () => db.userId(),

    // ---------- Body of Knowledge (Discover) ----------
    listSources: (status: Source["status"] | "all" = "active") => db.select("sources", status === "all" ? {} : { status }).then((r) => r.sort((a, b) => b.updated_at.localeCompare(a.updated_at))),
    factsOf: (sourceIds: Id[]) => db.select("facts", { source_id: sourceIds }),

    /** Keep a source and the facts taken from it, in one step. */
    async keepSource(source: NewSource, facts: NewFact[] = []): Promise<{ source: Source; facts: Fact[] }> {
      const s = await one(db.insert("sources", [{ short: source.title, citation: source.title, ...source }]));
      const f = await db.insert("facts", facts.map((x) => ({ ...x, source_id: s.id })));
      return { source: s, facts: f };
    },
    addFacts: (sourceId: Id, facts: NewFact[]) => db.insert("facts", facts.map((x) => ({ ...x, source_id: sourceId }))),
    updateSource: (id: Id, patch: Partial<Source>) => one(db.update("sources", { id }, patch)),
    discardSource: (id: Id, reason: string) => one(db.update("sources", { id }, { status: "discarded", discard_reason: reason })),
    restoreSource: (id: Id) => one(db.update("sources", { id }, { status: "active", discard_reason: null })),
    updateFact: (id: Id, patch: Partial<Fact>) => one(db.update("facts", { id }, patch)),
    discardFact: (id: Id, reason: string) => one(db.update("facts", { id }, { status: "discarded", discard_reason: reason })),
    restoreFact: (id: Id) => one(db.update("facts", { id }, { status: "active", discard_reason: null })),

    /** Take someone's public source into your own Body of Knowledge: a disconnected copy of it and its facts (F-139). */
    async copySource(id: Id): Promise<{ source: Source; facts: Fact[] }> {
      const src = await one(db.select("sources", { id }));
      const facts = (await db.select("facts", { source_id: id, status: "active" })).map(({ text, kind, quote, page, checked }) => ({ text, kind, quote, page, checked }));
      const { id: _id, owner_id: _o, created_at: _c, updated_at: _u, is_public: _p, status: _s, discard_reason: _d, ...rest } = src;
      return api.keepSource({ ...rest, origin: "copied", copied_from: src.id }, facts);
    },

    // ---------- Topic Library (Curate) ----------
    listTopics: () => db.select("topics").then((r) => r.sort((a, b) => b.updated_at.localeCompare(a.updated_at))),
    createTopic: (t: Pick<Topic, "name"> & Partial<Pick<Topic, "description" | "keywords">>) => one(db.insert("topics", [t])),
    updateTopic: (id: Id, patch: Partial<Pick<Topic, "name" | "description" | "keywords">>) => one(db.update("topics", { id }, patch)),
    deleteTopic: (id: Id) => db.remove("topics", { id }),
    relateTopics: (a: Id, b: Id) => db.insert("topic_relations", [{ topic_id: a, related_id: b }]),

    async topicView(id: Id): Promise<TopicView> {
      const topic = await one(db.select("topics", { id }));
      const [links, observations, assertions] = await Promise.all([db.select("topic_sources", { topic_id: id }), db.select("observations", { topic_id: id }), db.select("assertions", { topic_id: id })]);
      const assertionFacts = await db.select("assertion_facts", { assertion_id: assertions.map((a) => a.id) });
      const sourceIds = [...new Set(links.map((l) => l.source_id))];
      const [sources, facts, flags] = await Promise.all([db.select("sources", { id: sourceIds }), db.select("facts", { source_id: sourceIds }), db.select("review_flags", { object_type: "assertion", object_id: assertions.map((a) => a.id), resolved_at: null })]);
      return {
        topic,
        links,
        sources,
        facts,
        observations: observations.sort((a, b) => b.created_at.localeCompare(a.created_at)),
        assertions: assertions.sort((a, b) => a.created_at.localeCompare(b.created_at)),
        assertionFacts,
        flags,
      };
    },

    async linkSource(topicId: Id, sourceId: Id, note = "", by: TopicSource["linked_by"] = "author") {
      const existing = await db.select("topic_sources", { topic_id: topicId, source_id: sourceId });
      return existing[0] ?? one(db.insert("topic_sources", [{ topic_id: topicId, source_id: sourceId, note, linked_by: by }]));
    },
    setSourceNote: (topicId: Id, sourceId: Id, note: string) => one(db.update("topic_sources", { topic_id: topicId, source_id: sourceId }, { note })),
    unlinkSource: (topicId: Id, sourceId: Id) => db.remove("topic_sources", { topic_id: topicId, source_id: sourceId }),

    addObservation: (o: Pick<Observation, "topic_id" | "made_by" | "text"> & Partial<Pick<Observation, "general_knowledge" | "fact_ids" | "question">>) => one(db.insert("observations", [o])),
    deleteObservation: (id: Id) => db.remove("observations", { id }),

    /** A person's assertion, in their own words, with the facts it rests on (F-133). */
    async assert(a: Pick<Assertion, "topic_id" | "text"> & Partial<Pick<Assertion, "origin" | "observation_id" | "own_fact_id" | "builds_on">>, links: { fact_id: Id; role: LinkRole }[] = []) {
      const text = a.text.trim();
      if (!text) throw new Error("Write the assertion in your own words.");
      const row = await one(db.insert("assertions", [{ ...a, text }]));
      if (links.length) await db.insert("assertion_facts", links.map((l) => ({ ...l, assertion_id: row.id })));
      return row;
    },
    reviseAssertion: (id: Id, patch: Partial<Pick<Assertion, "text" | "still_held">>) => one(db.update("assertions", { id }, patch)),
    deleteAssertion: (id: Id) => db.remove("assertions", { id }),
    linkFact: (assertionId: Id, factId: Id, role: LinkRole = "supports") => db.insert("assertion_facts", [{ assertion_id: assertionId, fact_id: factId, role }]),
    setLinkRole: (assertionId: Id, factId: Id, role: LinkRole) => one(db.update("assertion_facts", { assertion_id: assertionId, fact_id: factId }, { role })),
    unlinkFact: (assertionId: Id, factId: Id) => db.remove("assertion_facts", { assertion_id: assertionId, fact_id: factId }),

    // ---------- Presentations (Build) ----------
    listPresentations: () => db.select("presentations").then((r) => r.sort((a, b) => b.updated_at.localeCompare(a.updated_at))),
    createPresentation: (p: Partial<Pick<Presentation, "title" | "purpose" | "audience" | "minutes">>) => one(db.insert("presentations", [p])),
    updatePresentation: (id: Id, patch: Partial<Pick<Presentation, "title" | "purpose" | "audience" | "minutes">>) => one(db.update("presentations", { id }, patch)),
    deletePresentation: (id: Id) => db.remove("presentations", { id }),

    /** The presentation's series of topics, in this order. Assertions of a topic that leaves go with it. */
    async setTopics(presentationId: Id, topicIds: Id[]) {
      const current = await db.select("presentation_topics", { presentation_id: presentationId });
      const gone = current.filter((c) => !topicIds.includes(c.topic_id)).map((c) => c.topic_id);
      if (gone.length) {
        await db.remove("presentation_topics", { presentation_id: presentationId, topic_id: gone });
        await db.remove("presentation_assertions", { presentation_id: presentationId, topic_id: gone });
      }
      for (const [i, topic_id] of topicIds.entries()) {
        if (current.some((c) => c.topic_id === topic_id)) await db.update("presentation_topics", { presentation_id: presentationId, topic_id }, { position: i });
        else await db.insert("presentation_topics", [{ presentation_id: presentationId, topic_id, position: i }]);
      }
    },

    /** The assertions chosen from one topic, in this order. */
    async setAssertions(presentationId: Id, topicId: Id, assertionIds: Id[]) {
      await db.remove("presentation_assertions", { presentation_id: presentationId, topic_id: topicId });
      await db.insert("presentation_assertions", assertionIds.map((assertion_id, position) => ({ presentation_id: presentationId, topic_id: topicId, assertion_id, position })));
    },

    async presentationView(id: Id): Promise<PresentationView> {
      const presentation = await one(db.select("presentations", { id }));
      const [pt, pa, flags] = await Promise.all([db.select("presentation_topics", { presentation_id: id }), db.select("presentation_assertions", { presentation_id: id }), db.select("review_flags", { object_type: "presentation", object_id: id, resolved_at: null })]);
      const order = (rows: (PresentationTopic | PresentationAssertion)[]) => [...rows].sort((a, b) => a.position - b.position);
      const topicIds = order(pt).map((x) => (x as PresentationTopic).topic_id);
      const [topicsRaw, allAssertions] = await Promise.all([db.select("topics", { id: topicIds }), db.select("assertions", { topic_id: topicIds })]);
      const topics = topicIds.map((t) => topicsRaw.find((x) => x.id === t)).filter((t): t is Topic => Boolean(t));
      const aById = byMap(allAssertions);
      const chosen: Record<Id, Assertion[]> = {};
      const available: Record<Id, Assertion[]> = {};
      for (const t of topics) {
        chosen[t.id] = order(pa.filter((x) => x.topic_id === t.id)).map((x) => aById.get((x as PresentationAssertion).assertion_id)).filter((a): a is Assertion => Boolean(a));
        available[t.id] = allAssertions.filter((a) => a.topic_id === t.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
      }
      const assertionFacts = await db.select("assertion_facts", { assertion_id: allAssertions.map((a) => a.id) });
      const facts = await db.select("facts", { id: [...new Set(assertionFacts.map((l) => l.fact_id))] });
      const sources = await db.select("sources", { id: [...new Set(facts.map((f) => f.source_id))] });
      return { presentation, topics, chosen, available, assertionFacts, facts, sources, flags };
    },

    // ---------- Review flags ----------
    openFlags: (objectType: ReviewFlag["object_type"], ids: Id[]) => db.select("review_flags", { object_type: objectType, object_id: ids, resolved_at: null }),
    resolveFlag: (id: Id) => one(db.update("review_flags", { id }, { resolved_at: new Date().toISOString() })),

    // ---------- Search record ----------
    recordSearch: (record: unknown, topicId: Id | null = null) => one(db.insert("search_runs", [{ record, topic_id: topicId }])),
  };
  return api;
}

export type Repo = ReturnType<typeof repo>;
