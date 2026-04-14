import { useParams, useNavigate, Link } from "react-router";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Users,
  CreditCard,
  Mail,
  Calendar,
  Globe,
  Clock,
  Shield,
  CheckCircle2,
  XCircle,
  Pencil,
} from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import dayjs from "@/lib/dayjs";

const planVariant: Record<string, "green" | "blue" | "amber" | "gray"> = {
  enterprise: "green",
  professional: "blue",
  trial: "amber",
};

const riskVariant: Record<string, "red" | "amber" | "green" | "gray"> = {
  HIGH: "red",
  MEDIUM: "amber",
  LOW: "green",
};

const roleVariant: Record<string, "red" | "blue" | "green" | "amber" | "purple" | "gray"> = {
  super_admin: "red",
  customer_admin: "blue",
  qa_head: "purple",
  qc_lab_director: "green",
  regulatory_affairs: "amber",
  csv_val_lead: "blue",
  it_cdo: "purple",
  operations_head: "amber",
  viewer: "gray",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  customer_admin: "Customer Admin",
  qa_head: "QA Head",
  qc_lab_director: "QC/Lab Director",
  regulatory_affairs: "Regulatory Affairs",
  csv_val_lead: "CSV/Val Lead",
  it_cdo: "IT/CDO",
  operations_head: "Operations Head",
  viewer: "Viewer",
};

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tenant = useAppSelector((s) => s.auth.tenants.find((t) => t.id === id));

  if (!tenant) {
    return (
      <div className="w-full max-w-[1200px] mx-auto">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[13px] mb-4" style={{ color: "var(--brand)" }}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Customer Accounts
        </Link>
        <div className="card">
          <div className="card-body text-center py-16">
            <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Customer not found
            </p>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
              The customer account you are looking for does not exist.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const adminUser = tenant.config.users.find(
    (u) => u.role === "customer_admin" || u.role === "super_admin",
  );
  const activePlan = tenant.subscriptionPlans?.find((p) => p.status === "Active");

  return (
    <div className="w-full max-w-[1200px] mx-auto">
      {/* Back link */}
      <Link
        to="/admin"
        className="inline-flex items-center gap-2 text-[13px] mb-4"
        style={{ color: "var(--brand)" }}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Customer Accounts
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{ background: "var(--brand-muted)", border: "1px solid var(--brand-border)" }}
          >
            <Building2 className="w-7 h-7" style={{ color: "var(--brand)" }} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-[24px] font-bold" style={{ color: "var(--text-primary)" }}>
              {tenant.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={planVariant[tenant.plan] ?? "gray"}>
                {tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1)}
              </Badge>
              <Badge variant={tenant.active ? "green" : "gray"}>
                {tenant.active ? "Active" : "Inactive"}
              </Badge>
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Created {dayjs(tenant.createdAt).format("MMM D, YYYY")}
              </span>
            </div>
          </div>
        </div>
        <Button variant="primary" icon={Pencil} onClick={() => navigate(`/admin?edit=${tenant.id}`)}>
          Edit Account
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Sites", value: tenant.config.sites.length, icon: MapPin, color: "var(--brand)" },
          { label: "Users", value: tenant.config.users.length, icon: Users, color: "var(--success)" },
          { label: "Subscription Plans", value: tenant.subscriptionPlans?.length ?? 0, icon: CreditCard, color: "var(--warning)" },
          { label: "Active Plan", value: activePlan ? "Yes" : "None", icon: CheckCircle2, color: activePlan ? "var(--success)" : "var(--text-muted)" },
        ].map((stat) => (
          <div key={stat.label} className="stat-card flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: stat.color + "15" }}
            >
              <stat.icon className="w-5 h-5" style={{ color: stat.color }} aria-hidden="true" />
            </div>
            <div>
              <p className="stat-label">{stat.label}</p>
              <p className="text-[20px] font-bold" style={{ color: "var(--card-text)" }}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Organization Info */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">Organization Information</span>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Company Name</p>
              <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>{tenant.config.org.companyName}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Admin Email</p>
              <p className="text-[14px] font-medium font-mono flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Mail className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                {tenant.adminEmail}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Timezone</p>
              <p className="text-[14px] font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Clock className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                {tenant.config.org.timezone}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Date Format</p>
              <p className="text-[14px] font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Calendar className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                {tenant.config.org.dateFormat}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Regulatory Region</p>
              <p className="text-[14px] font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Globe className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                {tenant.config.org.regulatoryRegion || "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Admin */}
      {adminUser && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">Primary Administrator</span>
            <Badge variant={roleVariant[adminUser.role] ?? "gray"}>
              {ROLE_LABELS[adminUser.role] ?? adminUser.role}
            </Badge>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Name</p>
                <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>{adminUser.name}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Email</p>
                <p className="text-[14px] font-mono" style={{ color: "var(--text-primary)" }}>{adminUser.email}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>GxP Signatory</p>
                <p className="text-[14px] font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                  {adminUser.gxpSignatory ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" style={{ color: "var(--success)" }} aria-hidden="true" />
                      Enabled
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                      Not enabled
                    </>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Status</p>
                <Badge variant={adminUser.status === "Active" ? "green" : "gray"}>{adminUser.status}</Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sites */}
      <div className="card mb-6">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">Sites</span>
          </div>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {tenant.config.sites.length} total
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table" aria-label="Customer sites">
            <thead>
              <tr>
                <th scope="col">Site Name</th>
                <th scope="col">Location</th>
                <th scope="col">GMP Scope</th>
                <th scope="col">Risk</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {tenant.config.sites.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No sites configured yet.</p>
                  </td>
                </tr>
              ) : (
                tenant.config.sites.map((site) => (
                  <tr key={site.id}>
                    <td>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>{site.name}</span>
                    </td>
                    <td>{site.location}</td>
                    <td>{site.gmpScope}</td>
                    <td><Badge variant={riskVariant[site.risk] ?? "gray"}>{site.risk}</Badge></td>
                    <td><Badge variant={site.status === "Active" ? "green" : "gray"}>{site.status}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users */}
      <div className="card mb-6">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">Users</span>
          </div>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {tenant.config.users.length} total
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table" aria-label="Customer users">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">GxP Signatory</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {tenant.config.users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No users yet.</p>
                  </td>
                </tr>
              ) : (
                tenant.config.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>{user.name}</span>
                    </td>
                    <td>
                      <span className="text-[12px] font-mono" style={{ color: "var(--text-secondary)" }}>{user.email}</span>
                    </td>
                    <td>
                      <Badge variant={roleVariant[user.role] ?? "gray"}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </td>
                    <td>
                      {user.gxpSignatory ? (
                        <Shield className="w-4 h-4" style={{ color: "var(--success)" }} aria-hidden="true" />
                      ) : (
                        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td><Badge variant={user.status === "Active" ? "green" : "gray"}>{user.status}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subscription Plans */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">Subscription Plans</span>
          </div>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {tenant.subscriptionPlans?.length ?? 0} total
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table" aria-label="Subscription plans">
            <thead>
              <tr>
                <th scope="col">Start Date</th>
                <th scope="col">Expiry Date</th>
                <th scope="col">Max Accounts</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {!tenant.subscriptionPlans || tenant.subscriptionPlans.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8">
                    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No subscription plans yet.</p>
                  </td>
                </tr>
              ) : (
                tenant.subscriptionPlans.map((plan: any) => (
                  <tr key={plan.id}>
                    <td>{plan.startDate || plan.start_date || "—"}</td>
                    <td>{plan.endDate || plan.expiryDate || "—"}</td>
                    <td>{plan.maxAccounts ?? "—"}</td>
                    <td><Badge variant={plan.status === "Active" ? "green" : "gray"}>{plan.status}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
