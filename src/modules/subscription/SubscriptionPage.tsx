import { useState } from "react";
import clsx from "clsx";
import {
  Zap, CheckCircle2, Calendar, BarChart3, MapPin,
  Users, Search, Layers, FileText, Download, Mail,
  CreditCard, AlertTriangle,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useTenantData } from "@/hooks/useTenantData";
import { useRole } from "@/hooks/useRole";
import { updateTenant } from "@/store/auth.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Popup } from "@/components/ui/Popup";
import { DataTable } from "@/components/shared";

/* ── Plan definitions ── */

interface PlanDef {
  id: string;
  name: string;
  price: number;
  currency: string;
  period: string;
  description: string;
  color: string;
  popular?: boolean;
  features: string[];
  limits: { sites: number; users: number; findings: number };
  stripeLink: string | null;
}

const PLANS: PlanDef[] = [
  {
    id: "trial", name: "Trial", price: 0, currency: "\u20B9", period: "14 days",
    description: "Explore Pharma Glimmora risk-free", color: "#64748b",
    features: ["1 site", "Up to 3 users", "50 findings limit", "Gap Assessment + CAPA", "Email support"],
    limits: { sites: 1, users: 3, findings: 50 },
    stripeLink: null,
  },
  {
    id: "professional", name: "Professional", price: 49999, currency: "\u20B9", period: "per month",
    description: "For growing pharma teams", color: "#0ea5e9", popular: true,
    features: ["Up to 3 sites", "Up to 15 users", "Unlimited findings", "All modules access", "Evidence packs", "CSV export", "Priority email support"],
    limits: { sites: 3, users: 15, findings: -1 },
    stripeLink: "https://buy.stripe.com/YOUR_PROFESSIONAL_LINK",
  },
  {
    id: "enterprise", name: "Enterprise", price: 149999, currency: "\u20B9", period: "per month",
    description: "For large multi-site organisations", color: "#6366f1",
    features: ["Unlimited sites", "Unlimited users", "Unlimited findings", "All modules + AGI Console", "Custom compliance frameworks", "API access", "Dedicated support", "SLA guarantee", "Custom onboarding"],
    limits: { sites: -1, users: -1, findings: -1 },
    stripeLink: "https://buy.stripe.com/YOUR_ENTERPRISE_LINK",
  },
];

/* ── Helpers ── */

function usagePercent(current: number, limit: number) {
  if (limit === -1) return 0;
  return Math.min(Math.round((current / limit) * 100), 100);
}
function isNearLimit(current: number, limit: number) {
  if (limit === -1) return false;
  return current / limit >= 0.8;
}
function isOverLimit(current: number, limit: number) {
  if (limit === -1) return false;
  return current >= limit;
}

/* ══════════════════════════════════════ */

export function SubscriptionPage() {
  const dispatch = useAppDispatch();
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const tenants = useAppSelector((s) => s.auth.tenants);
  const { org, allSites: sites, users, tenantId, tenantName, tenantPlan } = useTenantConfig();
  const { findings, capas, systems } = useTenantData();
  const { role } = useRole();

  const currentTenant = tenants.find((t) => t.id === tenantId);
  const currentPlan = PLANS.find((p) => p.id === tenantPlan) ?? PLANS[0];

  const usage = { sites: sites.length, users: users.length, findings: findings.length };

  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelledPopup, setCancelledPopup] = useState(false);
  const [upgradePopup, setUpgradePopup] = useState(false);

  const MOCK_INVOICES = currentPlan.price > 0
    ? [
        { id: "INV-2026-03", date: "2026-03-01T00:00:00Z", amount: currentPlan.price, status: "Paid", plan: currentPlan.name },
        { id: "INV-2026-02", date: "2026-02-01T00:00:00Z", amount: currentPlan.price, status: "Paid", plan: currentPlan.name },
        { id: "INV-2026-01", date: "2026-01-01T00:00:00Z", amount: currentPlan.price, status: "Paid", plan: currentPlan.name },
      ]
    : [];

  const nearAnyLimit =
    isNearLimit(usage.sites, currentPlan.limits.sites) ||
    isNearLimit(usage.users, currentPlan.limits.users) ||
    isNearLimit(usage.findings, currentPlan.limits.findings);

  /* ── Access guard ── */
  if (role !== "super_admin") {
    return (
      <main id="main-content" aria-label="Subscription management" className="w-full space-y-5">
        <div className={clsx("flex items-start gap-3 p-4 rounded-xl border", isDark ? "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.15)]" : "bg-[#fffbeb] border-[#fde68a]")}>
          <AlertTriangle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-[13px] font-medium text-[#f59e0b]">Access restricted</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Only Super Admin can manage subscriptions.</p>
          </div>
        </div>
      </main>
    );
  }

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="Subscription management" className="w-full space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <CreditCard className="w-5 h-5" style={{ color: "var(--brand)" }} aria-hidden="true" />
            Subscription
          </h1>
          <p className="page-subtitle mt-1">{tenantName} &middot; {currentPlan.name} plan</p>
        </div>
        {currentPlan.id !== "enterprise" && (
          <Button variant="primary" icon={Zap} onClick={() => {
            const next = currentPlan.id === "trial" ? PLANS[1] : PLANS[2];
            if (next.stripeLink) { window.open(next.stripeLink, "_blank"); setUpgradePopup(true); }
          }}>
            Upgrade plan
          </Button>
        )}
      </header>

      {/* ═══ SECTION 1 — Current plan card ═══ */}
      <div className={clsx("rounded-2xl p-6 border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-white border-[#e2e8f0]")}>
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Current plan</span>
              {currentPlan.id === "trial" ? <Badge variant="amber">Trial</Badge> : <Badge variant="green">Active</Badge>}
            </div>
            <h2 className="text-[28px] font-bold" style={{ color: currentPlan.color }}>{currentPlan.name}</h2>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>{currentPlan.description}</p>
          </div>
          <div className="text-right">
            {currentPlan.price === 0 ? (
              <p className="text-[32px] font-bold" style={{ color: "var(--text-primary)" }}>Free</p>
            ) : (
              <>
                <p className="text-[32px] font-bold" style={{ color: "var(--text-primary)" }}>{currentPlan.currency}{currentPlan.price.toLocaleString("en-IN")}</p>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{currentPlan.period}</p>
              </>
            )}
          </div>
        </div>

        {currentPlan.id !== "trial" && (
          <div className={clsx("flex items-center gap-2 px-4 py-2.5 rounded-lg mb-4", isDark ? "bg-[#071526]" : "bg-[#f8fafc]")}>
            <Calendar className="w-4 h-4 text-[#10b981]" aria-hidden="true" />
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Next renewal:</span>
            <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>01 May 2026</span>
            <span className="text-[11px] ml-auto" style={{ color: "var(--text-muted)" }}>Auto-renews monthly</span>
          </div>
        )}

        {currentPlan.id === "trial" && (
          <div className={clsx("flex items-start gap-3 p-3 rounded-lg mb-4 border", isDark ? "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.15)]" : "bg-[#fffbeb] border-[#fde68a]")}>
            <AlertTriangle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-[12px] font-medium text-[#f59e0b]">Trial expires in 8 days</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Upgrade to Professional or Enterprise to continue after trial.</p>
            </div>
            <Button variant="primary" size="sm" icon={Zap} onClick={() => { if (PLANS[1].stripeLink) { window.open(PLANS[1].stripeLink, "_blank"); setUpgradePopup(true); } }}>Upgrade now</Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {currentPlan.features.map((f) => (
            <div key={f} className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981] flex-shrink-0" aria-hidden="true" />
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ SECTION 2 — Usage stats ═══ */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" /><span className="card-title">Plan usage</span></div>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Current usage vs plan limits</span>
        </div>
        <div className="card-body space-y-4">
          {([
            { label: "Sites", current: usage.sites, limit: currentPlan.limits.sites, Icon: MapPin, color: "#0ea5e9" },
            { label: "Users", current: usage.users, limit: currentPlan.limits.users, Icon: Users, color: "#6366f1" },
            { label: "Findings", current: usage.findings, limit: currentPlan.limits.findings, Icon: Search, color: "#f59e0b" },
          ] as const).map((item) => {
            const pct = usagePercent(item.current, item.limit);
            const near = isNearLimit(item.current, item.limit);
            const over = isOverLimit(item.current, item.limit);
            const barColor = over ? "#ef4444" : near ? "#f59e0b" : item.color;
            return (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <item.Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: item.color }} aria-hidden="true" />
                    <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{item.current}{item.limit !== -1 ? ` / ${item.limit}` : " / \u221E"}</span>
                    {over && <Badge variant="red">Over limit</Badge>}
                    {near && !over && <Badge variant="amber">Near limit</Badge>}
                    {item.limit === -1 && <Badge variant="green">Unlimited</Badge>}
                  </div>
                </div>
                <div className={clsx("h-2 rounded-full", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")} role="progressbar" aria-valuenow={item.limit === -1 ? 100 : pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${item.label} usage`}>
                  {item.limit !== -1 ? (
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
                  ) : (
                    <div className="h-full rounded-full w-full" style={{ background: `linear-gradient(90deg, ${item.color}40, ${item.color})` }} />
                  )}
                </div>
              </div>
            );
          })}

          {nearAnyLimit && currentPlan.id !== "enterprise" && (
            <div className={clsx("flex items-start gap-3 p-3 rounded-lg border mt-2", isDark ? "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.15)]" : "bg-[#fffbeb] border-[#fde68a]")}>
              <AlertTriangle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-[12px] font-medium text-[#f59e0b]">Approaching plan limits</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Upgrade to avoid service interruption.</p>
              </div>
              <Button variant="primary" size="sm" icon={Zap} onClick={() => {
                const next = currentPlan.id === "trial" ? PLANS[1] : PLANS[2];
                if (next.stripeLink) { window.open(next.stripeLink, "_blank"); setUpgradePopup(true); }
              }}>Upgrade</Button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ SECTION 3 — Plan comparison ═══ */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">Available plans</span></div>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Upgrade or change your plan</span>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const isCurrent = plan.id === tenantPlan;
              return (
                <div key={plan.id} className={clsx("rounded-xl p-4 border relative transition-all duration-150", isCurrent ? isDark ? "border-[#0ea5e9] bg-[rgba(14,165,233,0.06)]" : "border-[#0ea5e9] bg-[#eff6ff]" : isDark ? "border-[#1e3a5a] bg-[#071526]" : "border-[#e2e8f0] bg-[#f8fafc]", plan.popular && !isCurrent && "ring-1 ring-[#6366f1]")}>
                  {plan.popular && !isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-[#6366f1] text-white whitespace-nowrap">Most popular</span>
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-[#0ea5e9] text-white whitespace-nowrap">Current plan</span>
                    </div>
                  )}

                  <div className="mb-3 mt-1">
                    <p className="text-[14px] font-bold mb-1" style={{ color: plan.color }}>{plan.name}</p>
                    <div className="flex items-end gap-1">
                      {plan.price === 0 ? (
                        <span className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>Free</span>
                      ) : (
                        <>
                          <span className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>{plan.currency}{plan.price.toLocaleString("en-IN")}</span>
                          <span className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>/mo</span>
                        </>
                      )}
                    </div>
                  </div>

                  <ul className="space-y-1.5 mb-4 list-none p-0 m-0">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 flex-shrink-0" style={{ color: plan.color }} aria-hidden="true" />
                        <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className={clsx("w-full py-2 rounded-lg text-center text-[12px] font-medium", isDark ? "bg-[rgba(14,165,233,0.12)] text-[#0ea5e9]" : "bg-[#dbeafe] text-[#0ea5e9]")}>
                      Current plan
                    </div>
                  ) : plan.id === "trial" ? (
                    <div className={clsx("w-full py-2 rounded-lg text-center text-[12px]", isDark ? "bg-[#0a1f38] text-[#64748b]" : "bg-[#f1f5f9] text-[#94a3b8]")}>
                      Downgrade
                    </div>
                  ) : (
                    <Button variant="primary" size="sm" fullWidth icon={plan.stripeLink ? Zap : Mail} onClick={() => {
                      if (plan.stripeLink) {
                        window.open(plan.stripeLink + "?prefilled_email=" + encodeURIComponent(currentTenant?.adminEmail ?? ""), "_blank");
                        setUpgradePopup(true);
                      } else {
                        window.open("mailto:sales@pharmaglimmora.com?subject=Enterprise%20enquiry", "_blank");
                      }
                    }}>
                      {plan.stripeLink ? (tenantPlan === "enterprise" ? "Downgrade" : "Upgrade") : "Contact sales"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ SECTION 4 — Billing history ═══ */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" /><span className="card-title">Billing history</span></div>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Recent invoices</span>
        </div>
        <DataTable
          ariaLabel="Billing history"
          caption="Invoice history"
          keyFn={(inv) => inv.id}
          data={MOCK_INVOICES}
          emptyState={<div className="p-6 text-center"><p className="text-[12px] italic" style={{ color: "var(--text-muted)" }}>No invoices yet &mdash; you are on the free trial.</p></div>}
          columns={[
            { key: "id", header: "Invoice", render: (inv) => <span className="font-mono text-[11px] font-semibold text-[#0ea5e9]">{inv.id}</span> },
            { key: "date", header: "Date", render: (inv) => <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(inv.date).format("DD MMM YYYY")}</span> },
            { key: "plan", header: "Plan", render: (inv) => <Badge variant="blue">{inv.plan}</Badge> },
            { key: "amount", header: "Amount", render: (inv) => <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{"\u20B9"}{inv.amount.toLocaleString("en-IN")}</span> },
            { key: "status", header: "Status", render: (inv) => <Badge variant="green">{inv.status}</Badge> },
            { key: "download", header: "Download", srOnly: true, render: (inv) => <Button variant="ghost" size="xs" icon={Download} aria-label={`Download ${inv.id}`} /> },
          ]}
        />
      </div>

      {/* ═══ SECTION 5 — Cancel subscription ═══ */}
      {currentPlan.id !== "trial" && (
        <div className={clsx("flex items-center justify-between p-4 rounded-xl border flex-wrap gap-3", isDark ? "bg-[rgba(239,68,68,0.04)] border-[rgba(239,68,68,0.15)]" : "bg-[#fef2f2] border-[#fca5a5]")}>
          <div>
            <p className="text-[13px] font-medium text-[#ef4444]">Cancel subscription</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Your plan will remain active until the end of the billing period. All data will be retained for 30 days.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCancelConfirm(true)}>Cancel plan</Button>
        </div>
      )}

      {/* ═══ Popups ═══ */}
      <Popup
        isOpen={cancelConfirm}
        variant="confirmation"
        title="Cancel subscription?"
        description="Your plan stays active until end of billing period. After that your account moves to Trial with limited access."
        onDismiss={() => setCancelConfirm(false)}
        actions={[
          { label: "Keep subscription", style: "primary", onClick: () => setCancelConfirm(false) },
          { label: "Yes, cancel", style: "ghost", onClick: () => {
            dispatch(updateTenant({ id: tenantId, patch: { plan: "trial" } }));
            auditLog({ action: "SUBSCRIPTION_CANCELLED", module: "subscription", recordId: tenantId });
            setCancelConfirm(false);
            setCancelledPopup(true);
          }},
        ]}
      />
      <Popup isOpen={cancelledPopup} variant="success" title="Subscription cancelled" description="Your plan will remain active until the end of the billing period." onDismiss={() => setCancelledPopup(false)} />
      <Popup isOpen={upgradePopup} variant="success" title="Redirected to payment" description="Complete payment on the checkout page. Your plan will activate automatically after payment confirmation." onDismiss={() => setUpgradePopup(false)} />
    </main>
  );
}
