import type { SourceKind } from "@/knowledge/types";

export const KIND_LABEL: Record<SourceKind, string> = {
  paper: "Paper",
  report: "Report",
  trial: "Trial record",
  statistic: "Statistic",
  scripture: "Scripture",
  document: "Document",
  data: "Data",
  web: "Web page",
  own_writing: "Your writing",
  own_knowledge: "Your knowledge",
};
