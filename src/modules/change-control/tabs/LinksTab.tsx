"use client";

import { Plus } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import type { CCDetail } from "../_shared";

/**
 * Change Control detail — Linked CAPAs tab. Lists every CAPA linked to
 * this CC (initiated from either side). Read-only when the CC is
 * finalised (Implemented / Closed / Rejected / soft-deleted) — the
 * server-side action enforces the same lock.
 */
export function LinksTab({
  cc,
  isApproverRole,
  onAddLink,
  onUnlink,
}: {
  cc: CCDetail;
  isApproverRole: boolean;
  onAddLink: () => void;
  onUnlink: (linkId: string) => void;
}) {
  const isFinalised =
    cc.status === "Implemented" ||
    cc.status === "Closed" ||
    cc.status === "Rejected" ||
    cc.deletedAt !== null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p
          className="text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {cc.capaLinks.length === 0
            ? "No CAPAs linked yet."
            : `${cc.capaLinks.length} CAPA${cc.capaLinks.length === 1 ? "" : "s"} linked.`}
        </p>
        {!isFinalised && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={onAddLink}
          >
            Link a CAPA
          </Button>
        )}
      </div>

      {cc.capaLinks.length > 0 && (
        <ul role="list" className="space-y-2">
          {cc.capaLinks.map((link) => (
            <li
              key={link.id}
              className="rounded-md p-2.5"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className="font-mono text-[12px] font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {link.capa.reference ?? link.capa.id.slice(0, 8)}
                    </span>
                    <Badge variant={getSeverityVariant(link.capa.risk, "generic")}>
                      {normalizeSeverityForDisplay(link.capa.risk, "generic") ?? link.capa.risk}
                    </Badge>
                    <Badge variant="gray">{link.capa.status}</Badge>
                    <Badge variant="blue">
                      Linked from {link.initiatedFrom === "CAPA" ? "CAPA" : "CC"}
                    </Badge>
                  </div>
                  <p
                    className="text-[12px] line-clamp-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {link.capa.description}
                  </p>
                  {link.linkRationale && (
                    <p
                      className="text-[11px] italic mt-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {link.linkRationale}
                    </p>
                  )}
                  <p
                    className="text-[10px] mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Linked by {link.linkedByName} ·{" "}
                    {dayjs(link.createdAt).fromNow()}
                  </p>
                </div>
                {isApproverRole && !isFinalised && (
                  <button
                    type="button"
                    onClick={() => onUnlink(link.id)}
                    aria-label="Unlink this CAPA"
                    className="text-[10px] underline border-none bg-transparent cursor-pointer px-1"
                    style={{ color: "var(--danger)" }}
                  >
                    Unlink
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
