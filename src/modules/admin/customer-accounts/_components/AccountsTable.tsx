"use client";

import { useRouter } from "next/navigation";
import { Building2, Plus, Eye, Pencil, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn, type DataFilter } from "@/components/table/DataTable";
import { planLabel, PLAN_TIERS } from "@/lib/plans";
import { planState, lifecycleLabel } from "@/lib/tenantStatus";
import dayjs from "@/lib/dayjs";
import { formatDate } from "@/lib/dates";
import { type Tenant } from "@/store/auth.slice";
import { planUtilisation, planUsersUsed } from "../helpers";

/**
 * The organizations table — migrated to the canonical DataTable widget
 * (@/components/table/DataTable), matching the Support Center's look. The whole
 * row navigates to the tenant detail (customerCode-first, cuid fallback);
 * utilisation vs plan cap is shown inline; MFA is a read-only pill (super-admin
 * only). Search + the five column filters live in the widget's own toolbar; row
 * actions live in the auto-generated ⋮ overflow column (View / Edit / Manage
 * status), which stays pinned right on horizontal scroll thanks to `minWidth`.
 */
interface AccountsTableProps {
  /** Card-pre-filtered tenants (active + suspended). Search + the five column
   *  filters are applied INSIDE the widget on top of this set. */
  data: Tenant[];
  isSuperAdmin: boolean;
  /** True when a stat-card quick-filter is narrowing the page-level data, so the
   *  empty state reads "no matches" rather than the first-run "Add Customer" CTA. */
  cardFilterActive: boolean;
  /** Bump to remount the widget and wipe its internal search / filter / sort /
   *  show-more state (the page's "Clear filters" resets both this and the card). */
  resetKey: number;
  onEdit: (tenant: Tenant) => void;
  onSuspend: (tenant: Tenant) => void;
  onCreate: () => void;
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

// Plan filter options — sourced from PLAN_TIERS (not hardcoded) + Tailored + the
// no-plan case. The widget prepends its own "All plans" sentinel, so no "all" row
// here.
const PLAN_FILTER_OPTIONS = [
  ...Object.keys(PLAN_TIERS).map((k) => ({ value: k, label: titleCase(k) })),
  { value: "TAILORED", label: "Tailored" },
  { value: "noplan", label: "No plan" },
];

export function AccountsTable({ data, isSuperAdmin, cardFilterActive, resetKey, onEdit, onSuspend, onCreate }: AccountsTableProps) {
  const router = useRouter();
  // customerCode-first URL with cuid fallback (link behavior preserved).
  const goToDetail = (tenant: Tenant) => router.push(`/admin/customer/${tenant.customerCode ?? tenant.id}`);

  // The five column filters (Account / Plan / Subscription / MFA / Created). Each
  // reads from its REAL source and is a single-select `match`. MFA is super-admin
  // only — mirrors the MFA column gating. Options exclude the "all" row (the
  // widget prepends its own "All …" sentinel).
  const filters: DataFilter<Tenant>[] = [
    {
      key: "accountStatus",
      label: "Accounts",
      options: [
        { value: "active", label: "Active" },
        { value: "suspended", label: "Suspended" },
      ],
      match: (t, v) => (v === "active" ? t.active !== false : t.active === false),
    },
    {
      key: "plan",
      label: "Plans",
      options: PLAN_FILTER_OPTIONS,
      match: (t, v) => (v === "noplan" ? !t.plan : t.plan?.tier === v),
    },
    {
      key: "subStatus",
      label: "Subscriptions",
      options: [
        { value: "active", label: "Active" },
        { value: "expired", label: "Expired" },
        { value: "none", label: "No plan" },
      ],
      match: (t, v) => planState(t) === (v === "active" ? "ok" : v),
    },
    ...(isSuperAdmin
      ? [
          {
            key: "mfa",
            label: "MFA",
            options: [
              { value: "enabled", label: "Enabled" },
              { value: "disabled", label: "Disabled" },
            ],
            match: (t: Tenant, v: string) => (v === "enabled") === !!t.mfaEnabled,
          },
        ]
      : []),
    {
      key: "created",
      label: "Created",
      options: [
        { value: "7", label: "Last 7 days" },
        { value: "30", label: "Last 30 days" },
        { value: "90", label: "Last 90 days" },
      ],
      // Threshold computed at match time so "last N days" is always relative to now.
      match: (t, v) => (t.createdAt ? !dayjs(t.createdAt).isBefore(dayjs().subtract(Number(v), "day")) : false),
    },
  ];

  // Columns — MFA appended only for super_admin (the widget has no per-column
  // `hidden`, so a conditional array is the mechanism). The auto-generated ⋮
  // column (from `rowMenu`) replaces the old explicit "actions" column.
  const columns: DataColumn<Tenant>[] = [
    {
      key: "organization",
      label: "Organization",
      render: (tenant) => {
        const initial = tenant.name.charAt(0).toUpperCase();
        return (
          <div className="flex items-center gap-3">
            {/* Uploaded logo (data URL) when present so a detail-page logo change
                reflects here immediately; fall back to the name initial. */}
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden text-[14px] font-bold" style={{ background: "var(--brand-muted)", color: "var(--brand)" }}>
              {tenant.logoUrl ? (
                <img src={tenant.logoUrl} alt="" className="w-full h-full object-cover" aria-hidden="true" />
              ) : (
                initial
              )}
            </div>
            <div className="min-w-0">
              <span className="text-[13px] font-semibold block truncate" style={{ color: "var(--text-primary)" }}>{tenant.name}</span>
              <p className="text-[11px] font-mono truncate" style={{ color: "var(--text-muted)" }}>{tenant.adminEmail}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "plan",
      label: "Plan",
      render: (tenant) => {
        const tenantPlan = tenant.plan;
        const expiry = tenantPlan?.expiryDate;
        return (
          <div className="text-[12px]">
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>{tenantPlan ? planLabel(tenantPlan.tier, tenantPlan.displayName) : "—"}</p>
            {tenantPlan && expiry && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Expires {dayjs.utc(expiry).format("MMM D, YYYY")}</p>}
          </div>
        );
      },
    },
    {
      key: "utilisation",
      label: "Usage",
      render: (tenant) => {
        const tenantPlan = tenant.plan;
        const util = tenantPlan ? planUtilisation(tenant) : null;
        const maxPct = util ? Math.min(1, Math.max(util.userPct, util.sitePct)) : 0;
        const nearCap = util ? (util.userPct >= 0.8 || util.sitePct >= 0.8) : false;
        const atCap = maxPct >= 1;
        const barColor = atCap ? "var(--danger)" : nearCap ? "var(--warning)" : "var(--brand)";
        return util ? (
          <div className="min-w-[110px]">
            <span className="text-[12px]" style={{ color: nearCap ? barColor : "var(--text-secondary)" }}>
              {planUsersUsed(tenant)}/{tenantPlan!.maxUsers}u · {tenant.config.sites.length}/{tenantPlan!.maxSites}s
            </span>
            <div className="h-1.5 rounded-full mt-1" style={{ background: "var(--bg-border)" }} role="progressbar" aria-valuenow={Math.round(maxPct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${tenant.name} utilisation`}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(maxPct * 100)}%`, background: barColor }} />
            </div>
          </div>
        ) : (
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>—</span>
        );
      },
    },
    {
      key: "account",
      label: "Account",
      render: (tenant) => (
        <Badge variant={tenant.active === false ? "gray" : "green"}>{lifecycleLabel(tenant.active)}</Badge>
      ),
    },
    {
      key: "subscription",
      label: "Subscription",
      render: (tenant) => {
        const plState = planState(tenant);
        return plState === "ok" ? (
          <Badge variant="green">Active</Badge>
        ) : plState === "expired" ? (
          <Badge variant="red">Expired</Badge>
        ) : (
          <Badge variant="gray">No plan</Badge>
        );
      },
    },
    ...(isSuperAdmin
      ? [
          {
            key: "mfa",
            label: "MFA",
            render: (tenant: Tenant) => (
              <Badge variant={tenant.mfaEnabled ? "green" : "gray"}>{tenant.mfaEnabled ? "Enabled" : "Disabled"}</Badge>
            ),
          } satisfies DataColumn<Tenant>,
        ]
      : []),
    {
      key: "created",
      label: "Created",
      render: (tenant) => (
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {formatDate(tenant.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <DataTable<Tenant>
      key={resetKey}
      ariaLabel="Customer accounts"
      data={data}
      rowKey={(tenant) => tenant.id}
      minWidth={960}
      pageSize={50}
      search={{ placeholder: "Search organizations…", keys: ["name", "adminEmail"] }}
      filters={filters}
      columns={columns}
      onRowClick={(tenant) => goToDetail(tenant)}
      rowMenu={(tenant) => [
        { label: "View", icon: Eye, onClick: () => goToDetail(tenant) },
        { label: "Edit", icon: Pencil, onClick: () => onEdit(tenant) },
        { label: "Manage status", icon: SlidersHorizontal, onClick: () => onSuspend(tenant) },
      ]}
      emptyState={(ctx) =>
        ctx.isFiltered || ctx.hasSearch || cardFilterActive ? (
          <NoMatchesEmpty />
        ) : (
          <NoTenantsEmpty onAdd={onCreate} />
        )
      }
    />
  );
}

/** First-run empty state — no tenants at all. Carries the "Add Customer" CTA. */
function NoTenantsEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-10">
      <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
      <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No customer accounts yet</p>
      <p className="text-[12px] mb-3" style={{ color: "var(--text-muted)" }}>Add your first customer to get started.</p>
      <Button variant="primary" size="sm" icon={Plus} onClick={onAdd}>Add Customer</Button>
    </div>
  );
}

/** Narrowed-to-empty state — search / filters / card quick-filter matched nothing. */
function NoMatchesEmpty() {
  return (
    <div className="text-center py-10">
      <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
      <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No organizations match the current filter</p>
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Try a different search term or clear the active filter.</p>
    </div>
  );
}
