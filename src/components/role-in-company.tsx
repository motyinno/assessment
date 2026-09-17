import Link from "next/link";
import { Briefcase, Network, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buildOrgStructure, type OrgUnitRef } from "@/lib/org-structure";
import type { ManagerLinkRef } from "@/lib/types";

/**
 * "Role in the company" — the three cards HRM itself shows on a profile, in
 * the same order and with the same rows:
 *
 *   Position in the company | Org. structure | Managerial structure
 *
 * This replaced a single flat "Departments" list on the profile. The list was
 * unreadable because HRM's `orgUnits[]` mixes every level of the org tree
 * ("Global Development", "NodeJS", "NodeJS BY & Asia" side by side with no
 * indication that the first contains the second) — the split is done by
 * `buildOrgStructure` off each unit's own `typeName`.
 *
 * Every row is rendered even when empty ("-"), matching HRM: a missing Team is
 * information, and a card that changes height per person is harder to scan.
 */

const M_LEVEL_STYLES: Record<number, string> = {
  1: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  2: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  3: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  4: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  5: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
};

const M_LEVELS = [1, 2, 3, 4, 5] as const;

export interface PositionInfo {
  jobTitle: string | null;
  managerialLevel: string | null;
  professionalLevel: string | null;
  isMentor: boolean;
  isDeliveryCoordinator: boolean;
}

interface Props {
  position: PositionInfo;
  /** The person's memberships, already filtered to `isFilterable` units by the caller. */
  units: OrgUnitRef[];
  managerLinks: ManagerLinkRef[];
  className?: string;
}

function MLevelChip({ level, className }: { level: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold",
        M_LEVEL_STYLES[level] ?? "bg-muted text-muted-foreground",
        className
      )}
    >
      M{level}
    </span>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <div className="w-28 shrink-0 text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 text-foreground">{children}</div>
    </div>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <span className="block truncate">{children ?? "—"}</span>;
}

function SubCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3 ring-1 ring-inset ring-foreground/5">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" />
        <span>{title}</span>
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function RoleInCompany({ position, units, managerLinks, className }: Props) {
  const structure = buildOrgStructure(units);
  const managerByLevel = new Map(managerLinks.map((l) => [l.level, l.manager]));

  return (
    <Card className={className}>
      <CardContent className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">Role in the company</h2>

        <div className="grid gap-3 lg:grid-cols-3">
          <SubCard title="Position in the company" icon={Briefcase}>
            <Row label="Job Title">
              <Value>{position.jobTitle}</Value>
            </Row>
            <Row label="M-level">
              {position.managerialLevel ? (
                <MLevelChip level={Number(position.managerialLevel.replace(/\D/g, "")) || 0} />
              ) : (
                <Value>{null}</Value>
              )}
            </Row>
            <Row label="Prof.Level">
              <Value>{position.professionalLevel}</Value>
            </Row>
            <Row label="Mentor">
              <Value>{position.isMentor ? "Yes" : "No"}</Value>
            </Row>
            <Row label="DC">
              <Value>{position.isDeliveryCoordinator ? "Yes" : "No"}</Value>
            </Row>
          </SubCard>

          <SubCard title="Org. structure" icon={Network}>
            {structure.map((slot) => (
              <Row key={slot.type} label={slot.type}>
                {slot.units.length === 0 ? (
                  <Value>{null}</Value>
                ) : (
                  <span className="block truncate">
                    {slot.units.map((unit, i) => (
                      <span key={unit.id}>
                        {i > 0 && ", "}
                        <Link
                          href={`/departments/${unit.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {unit.name}
                        </Link>
                      </span>
                    ))}
                  </span>
                )}
              </Row>
            ))}
          </SubCard>

          <SubCard title="Managerial structure" icon={Users}>
            {M_LEVELS.map((level) => {
              const manager = managerByLevel.get(level) ?? null;
              return (
                <Row key={level} label={<MLevelChip level={level} />}>
                  {manager ? (
                    <Link
                      href={`/users/${manager.id}`}
                      className="block truncate text-primary hover:underline"
                    >
                      {manager.name}
                    </Link>
                  ) : (
                    <Value>{null}</Value>
                  )}
                </Row>
              );
            })}
          </SubCard>
        </div>
      </CardContent>
    </Card>
  );
}
