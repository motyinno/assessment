"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MarketChip } from "@/components/market-signals-ui";

/**
 * Hot / Cooling tag and client demand on a matrix topic — from the topic's
 * accepted trend tag and the division's published market report.
 */

export interface TopicDemand {
  label: string;
  share: number | null;
  deltaPp: number | null;
}

export interface DemandMap {
  source: { id: string; title: string } | null;
  topics: Record<string, TopicDemand>;
}

/** `refreshKey` re-fetches (e.g. after a matrix version is published). */
export function useTopicDemand(divisionId: string | null | undefined, refreshKey?: unknown): DemandMap {
  const [demand, setDemand] = useState<DemandMap>({ source: null, topics: {} });
  useEffect(() => {
    const controller = new AbortController();
    const qs = divisionId ? `?departmentId=${encodeURIComponent(divisionId)}` : "";
    fetch(`/api/tech-matrix/demand${qs}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DemandMap | null) => d && setDemand(d))
      .catch(() => {});
    return () => controller.abort();
  }, [divisionId, refreshKey]);
  return demand;
}

export function TopicDemandBadges({ trendTag, demand }: { trendTag?: string | null; demand?: TopicDemand }) {
  if (!trendTag && !demand) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {demand && <MarketChip share={demand.share} deltaPp={demand.deltaPp} />}
      {trendTag === "hot" && <Badge variant="warning">Hot</Badge>}
      {trendTag === "cooling" && <Badge variant="secondary">Cooling</Badge>}
    </span>
  );
}
