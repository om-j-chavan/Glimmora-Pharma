"use client";

/**
 * Area × site readiness heatmap.
 *
 * Extracted verbatim in behaviour from the old inline block, with three changes:
 *   • Cells are memoised via a single `computeAreaScore` pass instead of being
 *     recomputed per cell on every render.
 *   • A role with a `focusArea` gets its own area HIGHLIGHTED (and sorted first)
 *     rather than a different table — the layout stays consistent across roles,
 *     which is the design rule for this redesign.
 *   • Cells link to Gap Assessment ONLY when the viewer can open it; otherwise the
 *     cell renders as a non-interactive tile with the same information.
 */

import { memo, useMemo } from "react";
import Link from "next/link";
import { Grid3x3, MapPin } from "lucide-react";
import { computeAreaScore, KPI_AREAS, READINESS_COLORS } from "@/lib/kpi";
import { CardSection } from "@/components/shared";
import { WidgetEmpty } from "./primitives";
import type { DashboardWidgetProps } from "./types";

const LEGEND: [string, string][] = [
  [READINESS_COLORS.ready, "≥ 80% ready"],
  [READINESS_COLORS.watch, "60–79%"],
  [READINESS_COLORS.risk, "< 60%"],
  [READINESS_COLORS.none, "not assessed"],
];

export const AreaHeatmapWidget = memo(function AreaHeatmapWidget({
  data, dashboard, canOpen,
}: DashboardWidgetProps) {
  const { sites, kpiFindings, kpiCapas, systems } = data;
  const gapOpen = canOpen("gap");

  // The role's own area first, so an Operations Head reads "Manufacturing" on the
  // top row without the table changing shape for anyone else.
  const areas = useMemo(() => {
    const all = [...KPI_AREAS];
    if (!dashboard.focusArea) return all;
    return [
      ...all.filter((a) => a === dashboard.focusArea),
      ...all.filter((a) => a !== dashboard.focusArea),
    ];
  }, [dashboard.focusArea]);

  // ONE pass over the record arrays for the whole grid (was one call per cell,
  // each re-filtering all three arrays).
  const grid = useMemo(
    () => areas.map((area) => ({
      area,
      cells: sites.map((site) => ({
        site,
        score: computeAreaScore(area, site.id, {
          findings: kpiFindings, capas: kpiCapas, systems,
        }),
      })),
    })),
    [areas, sites, kpiFindings, kpiCapas, systems],
  );

  return (
    <CardSection icon={Grid3x3} title="Area readiness heatmap">
      {sites.length === 0 ? (
        <WidgetEmpty
          icon={MapPin}
          message="No sites configured yet"
          hint="Go to Settings → Sites to add your sites."
          action={canOpen("settings") ? { label: "Add sites in Settings", href: "/settings" } : undefined}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <caption className="sr-only">
                Weighted readiness score per GxP area and site. Lower scores carry more open findings, overdue CAPAs or validation risk.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="text-left py-2 pr-3 w-28 font-semibold" style={{ color: "var(--text-muted)" }}>Area</th>
                  {sites.map((s) => (
                    <th key={s.id} scope="col" className="text-center py-2 px-1 font-semibold whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map(({ area, cells }) => {
                  const isFocus = area === dashboard.focusArea;
                  return (
                    <tr key={area}>
                      <th
                        scope="row"
                        className="py-1 pr-3 font-medium whitespace-nowrap text-left"
                        style={{ color: isFocus ? "var(--brand)" : "var(--text-secondary)" }}
                      >
                        {area}
                        {isFocus && <span className="sr-only"> (your area)</span>}
                      </th>
                      {cells.map(({ site, score }) => {
                        const { open, critical, hasData, color, percentage } = score;
                        const label = hasData
                          ? `${area} — ${site.name}\nScore: ${percentage}\nOpen: ${open}\nCritical: ${critical}`
                          : `${area} — ${site.name}\nNot assessed yet — no findings, CAPAs or systems logged for this area.`;
                        const text = hasData ? (open === 0 ? "✓" : percentage) : "—";
                        const tile = "w-full block py-2 px-1 rounded-lg text-[10px] font-bold text-center transition-opacity";
                        const style = hasData
                          ? { background: `${color}22`, color, border: `1px solid ${color}44` }
                          : { background: `${READINESS_COLORS.none}1a`, color: READINESS_COLORS.none, border: `1px dashed ${READINESS_COLORS.none}55` };
                        const aria = hasData
                          ? `${area} ${site.name}: ${percentage}`
                          : `${area} ${site.name}: not assessed yet`;

                        return (
                          <td key={site.id} className="py-1 px-1 text-center">
                            {gapOpen ? (
                              <Link
                                href="/gap-assessment"
                                title={label}
                                aria-label={aria}
                                className={`${tile} no-underline hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--brand)`}
                                style={style}
                              >
                                {text}
                              </Link>
                            ) : (
                              <span className={tile} title={label} aria-label={aria} style={style}>{text}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-4 mt-3 text-[10px] flex-wrap" style={{ color: "var(--text-muted)" }}>
            {LEGEND.map(([c, l]) => (
              <div key={l} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: c }} aria-hidden="true" />{l}
              </div>
            ))}
          </div>
        </>
      )}
    </CardSection>
  );
});
