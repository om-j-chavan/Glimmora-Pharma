"use client";

import { useState, useEffect, useMemo } from "react";
import { RotateCcw, Trash2, Building2, Search, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { type Tenant } from "@/store/auth.slice";

/**
 * Restore list — every soft-deleted tenant (deletedAt set). Per row the Super
 * Admin can Restore (back to Active; tenant + users can log in again) or
 * Permanently Delete (opens the password-gated PermanentDeleteModal via
 * onRequestPurge). Suspended-but-not-deleted tenants are reactivated elsewhere
 * (the table/detail suspend flow); this modal is specifically the deleted list.
 */
export function RestoreTenantsModal({
  open,
  onClose,
  deletedTenants,
  onRestore,
  onRequestPurge,
  restoringId,
}: {
  open: boolean;
  onClose: () => void;
  deletedTenants: Tenant[];
  onRestore: (tenant: Tenant) => void;
  onRequestPurge: (tenant: Tenant) => void;
  restoringId: string | null;
}) {
  const [search, setSearch] = useState("");
  // Reset the search each time the modal reopens so it never carries stale text.
  useEffect(() => { if (open) setSearch(""); }, [open]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deletedTenants;
    return deletedTenants.filter(
      (t) => t.name.toLowerCase().includes(q) || t.adminEmail.toLowerCase().includes(q),
    );
  }, [deletedTenants, search]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Restore deleted companies">
      <p className="text-[12px] mb-4" style={{ color: "var(--text-secondary)" }}>
        Companies you soft-deleted. Restore one to re-enable login for the tenant and all its users, or permanently
        delete it (irreversible).
      </p>

      {/* Search — filters the deleted list by company name or admin email. */}
      {deletedTenants.length > 0 && (
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input
            type="text"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deleted companies…"
            aria-label="Search deleted companies"
            className="w-full rounded-lg py-2 pl-9 pr-8 text-[13px] outline-none"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 border-none bg-transparent cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {deletedTenants.length === 0 ? (
        <div className="text-center py-10">
          <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No deleted companies</p>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
            Deleting a company from the table or its detail page will list it here for restore.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-center text-[12px] py-8" style={{ color: "var(--text-muted)" }}>
          No deleted companies match “{search.trim()}”.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--bg-border)" }}
            >
              <div className="min-w-0">
                <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{t.name}</p>
                <p className="text-[11px] font-mono truncate" style={{ color: "var(--text-muted)" }}>{t.adminEmail}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="primary"
                  size="xs"
                  icon={RotateCcw}
                  loading={restoringId === t.id}
                  disabled={restoringId === t.id}
                  onClick={() => onRestore(t)}
                >
                  Restore
                </Button>
                <Button variant="danger" size="xs" icon={Trash2} onClick={() => onRequestPurge(t)}>
                  Delete…
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
