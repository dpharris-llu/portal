/** ClinicalTrials.gov API (version 2): search studies; each record becomes text that can be read and checked. */
import type { Candidate } from "./types";

export const CTGOV_BASE = "https://clinicaltrials.gov/api/v2";

export const ctGovSearchUrl = (base: string, query: string, o: { ongoingOnly?: boolean; pageSize?: number } = {}) =>
  `${base}/studies?query.term=${encodeURIComponent(query.trim())}${o.ongoingOnly ? "&filter.overallStatus=RECRUITING|NOT_YET_RECRUITING|ACTIVE_NOT_RECRUITING|ENROLLING_BY_INVITATION" : ""}&pageSize=${o.pageSize ?? 15}&format=json`;

interface Study {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string; organization?: { fullName?: string } };
    statusModule?: { overallStatus?: string; startDateStruct?: { date?: string }; completionDateStruct?: { date?: string } };
    descriptionModule?: { briefSummary?: string };
    designModule?: { studyType?: string; phases?: string[]; enrollmentInfo?: { count?: number; type?: string }; designInfo?: { allocation?: string; primaryPurpose?: string } };
    conditionsModule?: { conditions?: string[] };
    armsInterventionsModule?: { interventions?: { type?: string; name?: string }[] };
    outcomesModule?: { primaryOutcomes?: { measure?: string; timeFrame?: string }[] };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
  };
  hasResults?: boolean;
}

const words = (s?: string) => (s ?? "").replace(/_/g, " ").toLowerCase();

export function parseCtGov(json: unknown): Candidate[] {
  const studies = (json as { studies?: Study[] })?.studies ?? [];
  return studies.flatMap((s) => {
    const p = s.protocolSection;
    const id = p?.identificationModule?.nctId;
    const title = p?.identificationModule?.briefTitle ?? p?.identificationModule?.officialTitle;
    if (!id || !title) return [];
    const d = p?.designModule;
    const status = words(p?.statusModule?.overallStatus);
    const enrollment = d?.enrollmentInfo?.count;
    const sponsor = p?.sponsorCollaboratorsModule?.leadSponsor?.name ?? p?.identificationModule?.organization?.fullName;
    const start = p?.statusModule?.startDateStruct?.date;
    const lines = [
      `Registered study ${id}: ${title}.`,
      sponsor ? `Lead sponsor: ${sponsor}.` : "",
      `Status: ${status || "not stated"}.${s.hasResults ? " Results have been posted to the registry." : " No results posted to the registry."}`,
      `Study type: ${words(d?.studyType) || "not stated"}${d?.phases?.length ? `; phase: ${d.phases.map(words).join(", ")}` : ""}${d?.designInfo?.allocation ? `; allocation: ${words(d.designInfo.allocation)}` : ""}${d?.designInfo?.primaryPurpose ? `; purpose: ${words(d.designInfo.primaryPurpose)}` : ""}.`,
      enrollment !== undefined ? `Enrollment: ${enrollment} participants (${words(d?.enrollmentInfo?.type) || "count"}).` : "",
      start ? `Start date: ${start}.` : "",
      p?.conditionsModule?.conditions?.length ? `Conditions: ${p.conditionsModule.conditions.join(", ")}.` : "",
      p?.armsInterventionsModule?.interventions?.length ? `Interventions: ${p.armsInterventionsModule.interventions.map((i) => `${i.name}${i.type ? ` (${words(i.type)})` : ""}`).join("; ")}.` : "",
      p?.outcomesModule?.primaryOutcomes?.length ? `Primary outcomes: ${p.outcomesModule.primaryOutcomes.map((o) => `${o.measure}${o.timeFrame ? ` (time frame: ${o.timeFrame})` : ""}`).join("; ")}.` : "",
      p?.descriptionModule?.briefSummary ? `Summary: ${p.descriptionModule.briefSummary}` : "",
    ].filter(Boolean);
    return [
      {
        provider: "clinicaltrials" as const,
        id,
        kind: "trial" as const,
        title,
        authors: sponsor ? [sponsor] : [],
        venue: "ClinicalTrials.gov",
        year: start?.slice(0, 4),
        abstract: p?.descriptionModule?.briefSummary ?? "",
        access: "registry record" as const,
        url: `https://clinicaltrials.gov/study/${id}`,
        badges: [status && status[0].toUpperCase() + status.slice(1), enrollment !== undefined ? `${enrollment} participants` : "", s.hasResults ? "Results posted" : ""].filter(Boolean),
        recordText: lines.join("\n"),
      },
    ];
  });
}
