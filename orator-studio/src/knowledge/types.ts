/**
 * The knowledge model (spec section 5). Row shapes match the database tables
 * in supabase/migrations/0006_knowledge.sql, so nothing is translated between
 * the app and the store.
 *
 *   Body of Knowledge (Discover): Source ─has─▶ Fact
 *   Topic Library (Curate):       Topic ─has─▶ Observation, Assertion
 *   Assertion ◀─AssertionFact─▶ Fact  (supports / qualifies / contradicts)
 *   Presentation (Build): purpose, audience ─▶ topics ─▶ chosen assertions
 */

export type Id = string;

export type SourceKind = "paper" | "report" | "trial" | "statistic" | "scripture" | "document" | "data" | "web" | "own_writing" | "own_knowledge";
export type SourceOrigin = "yours" | "discovered" | "ingested" | "copied";
export type Access = "full text" | "abstract" | "registry record" | "typed" | "record";
export type Status = "active" | "discarded";

export interface Source {
  id: Id;
  owner_id: Id;
  kind: SourceKind;
  title: string;
  citation: string;
  short: string;
  url: string | null;
  year: string | null;
  origin: SourceOrigin;
  access: Access | null;
  /** doi, pmid, pmcid, openalex, nct; for Scripture: version and reference. */
  ids: Record<string, string>;
  /** Names for "pages" that are really sections (full texts from PubMed Central). */
  page_labels: Record<string, string>;
  annotation: string;
  annotation_by: "author" | "claude" | null;
  is_public: boolean;
  copied_from: Id | null;
  fetched_at: string | null;
  status: Status;
  discard_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type FactKind = "finding" | "limitation" | "figure" | "note" | "scripture" | "statement";

export interface Fact {
  id: Id;
  source_id: Id;
  owner_id: Id;
  kind: FactKind;
  text: string;
  quote: string | null;
  page: number | null;
  /** True when the app checked the quote (and its numbers) against the source. */
  checked: boolean;
  status: Status;
  discard_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: Id;
  owner_id: Id;
  name: string;
  description: string;
  keywords: string[];
  created_at: string;
  updated_at: string;
}

export interface TopicSource {
  topic_id: Id;
  source_id: Id;
  /** Why this source matters to this topic. */
  note: string;
  linked_by: "author" | "auto" | "claude";
  created_at: string;
}

export interface Observation {
  id: Id;
  topic_id: Id;
  made_by: "author" | "claude";
  author_id: Id;
  text: string;
  /** Claude's view from general knowledge, kept apart from what the facts show. */
  general_knowledge: string | null;
  fact_ids: Id[];
  question: string | null;
  created_at: string;
}

export type AssertionOrigin = "typed" | "from_observation" | "own_writing";

export interface Assertion {
  id: Id;
  topic_id: Id;
  author_id: Id;
  text: string;
  origin: AssertionOrigin;
  observation_id: Id | null;
  /** The author's own words, for an assertion taken from their writing. */
  own_fact_id: Id | null;
  /** An enhanced assertion builds on someone else's. */
  builds_on: Id | null;
  still_held: boolean;
  created_at: string;
  updated_at: string;
}

export type LinkRole = "supports" | "qualifies" | "contradicts";

export interface AssertionFact {
  assertion_id: Id;
  fact_id: Id;
  role: LinkRole;
  note: string;
  created_at: string;
}

export interface Presentation {
  id: Id;
  owner_id: Id;
  title: string;
  purpose: string;
  audience: string;
  minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface PresentationTopic {
  presentation_id: Id;
  topic_id: Id;
  position: number;
}

export interface PresentationAssertion {
  presentation_id: Id;
  assertion_id: Id;
  topic_id: Id;
  position: number;
}

export type Role = "owner" | "collaborator" | "viewer";

export interface Member {
  object_type: "topic" | "presentation";
  object_id: Id;
  user_id: Id;
  role: "collaborator" | "viewer";
  added_by: Id | null;
  created_at: string;
}

export interface Comment {
  id: Id;
  object_type: "assertion" | "topic" | "presentation";
  object_id: Id;
  author_id: Id;
  text: string;
  resolved: boolean;
  created_at: string;
}

export interface ReviewFlag {
  id: Id;
  object_type: "assertion" | "presentation";
  object_id: Id;
  reason: string;
  cause_type: "fact" | "source" | "assertion" | null;
  cause_id: Id | null;
  created_at: string;
  resolved_at: string | null;
}

export interface SearchRun {
  id: Id;
  owner_id: Id;
  topic_id: Id | null;
  record: unknown;
  created_at: string;
}

/** Every table, by name: the data layer works over these. */
export interface Tables {
  sources: Source;
  facts: Fact;
  topics: Topic;
  topic_relations: { topic_id: Id; related_id: Id };
  topic_sources: TopicSource;
  observations: Observation;
  assertions: Assertion;
  assertion_facts: AssertionFact;
  presentations: Presentation;
  presentation_topics: PresentationTopic;
  presentation_assertions: PresentationAssertion;
  members: Member;
  comments: Comment;
  review_flags: ReviewFlag;
  search_runs: SearchRun;
}
export type TableName = keyof Tables;

/** Columns that identify a row, per table (single id, or a composite key). */
export const KEYS: { [T in TableName]: (keyof Tables[T])[] } = {
  sources: ["id"],
  facts: ["id"],
  topics: ["id"],
  topic_relations: ["topic_id", "related_id"],
  topic_sources: ["topic_id", "source_id"],
  observations: ["id"],
  assertions: ["id"],
  assertion_facts: ["assertion_id", "fact_id"],
  presentations: ["id"],
  presentation_topics: ["presentation_id", "topic_id"],
  presentation_assertions: ["presentation_id", "assertion_id"],
  members: ["object_type", "object_id", "user_id"],
  comments: ["id"],
  review_flags: ["id"],
  search_runs: ["id"],
};
