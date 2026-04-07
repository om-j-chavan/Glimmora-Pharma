import { useState, Fragment } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router";
import {
  Shield,
  Mail,
  Lock,
  LogIn,
  Building2,
  ChevronDown,
} from "lucide-react";
import clsx from "clsx";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { setCredentials, type AuthUser } from "@/store/auth.slice";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type FormValues = z.infer<typeof schema>;

const MOCK_ACCOUNTS: Record<string, { password: string; user: AuthUser }> = {
  // Pharma Glimmora International
  "admin@pharmaglimmora.com": { password: "Admin@123", user: { id: "u-001", name: "System Administrator", email: "admin@pharmaglimmora.com", role: "super_admin", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "qa@pharmaglimmora.com": { password: "QaHead@123", user: { id: "u-002", name: "Dr. Priya Sharma", email: "qa@pharmaglimmora.com", role: "qa_head", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "ra@pharmaglimmora.com": { password: "RegAff@123", user: { id: "u-003", name: "Rahul Mehta", email: "ra@pharmaglimmora.com", role: "regulatory_affairs", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "csv@pharmaglimmora.com": { password: "CsvVal@123", user: { id: "u-004", name: "Anita Patel", email: "csv@pharmaglimmora.com", role: "csv_val_lead", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "qc@pharmaglimmora.com": { password: "QcLab@123", user: { id: "u-005", name: "Dr. Nisha Rao", email: "qc@pharmaglimmora.com", role: "qc_lab_director", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "it@pharmaglimmora.com": { password: "ItCdo@123", user: { id: "u-006", name: "Vikram Singh", email: "it@pharmaglimmora.com", role: "it_cdo", gxpSignatory: false, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "ops@pharmaglimmora.com": { password: "OpsHead@123", user: { id: "u-007", name: "Suresh Kumar", email: "ops@pharmaglimmora.com", role: "operations_head", gxpSignatory: false, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "viewer@pharmaglimmora.com": { password: "Viewer@123", user: { id: "u-008", name: "View Only User", email: "viewer@pharmaglimmora.com", role: "viewer", gxpSignatory: false, orgId: "org-1", tenantId: "tenant-glimmora" } },
  // ABC Pharma Ltd
  "admin@abcpharma.com": { password: "Admin@123", user: { id: "u-abc-001", name: "ABC Admin", email: "admin@abcpharma.com", role: "super_admin", gxpSignatory: true, orgId: "org-2", tenantId: "tenant-abc" } },
  "qa@abcpharma.com": { password: "QaHead@123", user: { id: "u-abc-002", name: "Dr. Sunita Rao", email: "qa@abcpharma.com", role: "qa_head", gxpSignatory: true, orgId: "org-2", tenantId: "tenant-abc" } },
  // XYZ Biotech
  "admin@xyzbiotech.com": { password: "Admin@123", user: { id: "u-xyz-001", name: "XYZ Admin", email: "admin@xyzbiotech.com", role: "super_admin", gxpSignatory: true, orgId: "org-3", tenantId: "tenant-xyz" } },
  "qa@xyzbiotech.com": { password: "QaHead@123", user: { id: "u-xyz-002", name: "Dr. Arjun Das", email: "qa@xyzbiotech.com", role: "qa_head", gxpSignatory: true, orgId: "org-3", tenantId: "tenant-xyz" } },
};

const CRED_ROWS: { org: string; rows: [string, string, string, string][] }[] = [
  {
    org: "Pharma Glimmora International",
    rows: [
      ["Super Admin", "admin@pharmaglimmora.com", "Admin@123", "#ef4444"],
      ["QA Head", "qa@pharmaglimmora.com", "QaHead@123", "#a78bfa"],
      ["CSV/Val Lead", "csv@pharmaglimmora.com", "CsvVal@123", "#38bdf8"],
      ["QC/Lab Director", "qc@pharmaglimmora.com", "QcLab@123", "#10b981"],
      ["Viewer", "viewer@pharmaglimmora.com", "Viewer@123", "#94a3b8"],
    ],
  },
  {
    org: "ABC Pharma Ltd",
    rows: [
      ["Super Admin", "admin@abcpharma.com", "Admin@123", "#ef4444"],
      ["QA Head", "qa@abcpharma.com", "QaHead@123", "#a78bfa"],
    ],
  },
  {
    org: "XYZ Biotech",
    rows: [
      ["Super Admin", "admin@xyzbiotech.com", "Admin@123", "#ef4444"],
      ["QA Head", "qa@xyzbiotech.com", "QaHead@123", "#a78bfa"],
    ],
  },
];

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const tenants = useAppSelector((s) => s.auth.tenants);
  const [showCreds, setShowCreds] = useState(false);
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [loadingName, setLoadingName] = useState("");

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    const account = MOCK_ACCOUNTS[data.email.toLowerCase().trim()];

    if (!account || account.password !== data.password) {
      setError("root", { message: "Invalid email or password" });
      return;
    }

    dispatch(setCredentials({ token: "mock-token-" + Date.now(), user: account.user }));

    const userTenant = tenants.find((t) => t.id === account.user.tenantId);

    setLoadingName(userTenant?.name ?? "workspace");
    setLoadingTenant(true);
    await new Promise((r) => setTimeout(r, 600));
    navigate("/");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#040e1e] px-4">
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-[#0ea5e9]" />

      <div className="w-full max-w-[400px] pt-12 pb-10 px-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 bg-[rgba(14,165,233,0.15)] border border-[rgba(14,165,233,0.3)]">
            <Shield className="w-[22px] h-[22px] text-[#0ea5e9]" aria-hidden="true" />
          </div>
          <h1 className="text-[22px] font-bold text-[#e2e8f0] tracking-tight mb-1 text-center">
            Pharma Glimmora
          </h1>
          <p className="text-[13px] text-[#64748b] text-center">
            GxP Compliance Command Center
          </p>
        </div>

        {/* Loading tenant */}
        {loadingTenant && (
          <div className="flex flex-col items-center justify-center gap-3 py-8" role="status" aria-live="polite">
            <div className="w-8 h-8 rounded-full border-2 border-[#0ea5e9] border-t-transparent animate-spin" />
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Loading {loadingName}...
            </p>
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          aria-label="Sign in to Pharma Glimmora"
          noValidate
          className="w-full space-y-4 mt-8"
          style={{ display: loadingTenant ? "none" : undefined }}
        >
          {/* Root error */}
          {errors.root && (
            <div className="rounded-lg px-3 py-2 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-[12px] text-[#ef4444]">
              {errors.root.message}
            </div>
          )}

          <Input
            id="email"
            label="Work email"
            type="email"
            required
            icon={Mail}
            autoComplete="email"
            placeholder="admin@pharmaglimmora.com"
            error={errors.email?.message}
            {...register("email")}
          />

          {/* Password */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="password" className="text-[11px] font-medium text-[#94a3b8]">
                Password <span className="text-[#ef4444]" aria-hidden="true">*</span>
              </label>
              <span className="text-[11px] text-[#0ea5e9] cursor-pointer">Forgot password?</span>
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                required
                aria-required="true"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")}
                className="w-full bg-[#071526] border border-[#1e3a5a] rounded-lg pl-9.5 pr-3 py-2.5 text-[13px] text-[#e2e8f0] placeholder:text-[#334155] outline-none focus:border-[#0ea5e9] focus:ring-[3px] focus:ring-[rgba(14,165,233,0.12)] transition-all duration-150"
              />
            </div>
            {errors.password && (
              <p id="password-error" role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" icon={LogIn} loading={isSubmitting} fullWidth className="py-2.75">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#1e3a5a]" />
            <span className="text-[11px] text-[#475569]">or continue with</span>
            <div className="flex-1 h-px bg-[#1e3a5a]" />
          </div>

          <Button variant="secondary" icon={Building2} fullWidth>
            Single Sign-On (SSO)
          </Button>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-[#0f2039]" style={{ display: loadingTenant ? "none" : undefined }}>
          <div className="flex items-center gap-1.5 text-[11px] text-[#334155]">
            <Shield className="w-3 h-3" aria-hidden="true" />
            21 CFR Part 11 compliant
          </div>
          <span className="text-[11px] text-[#475569]">Privacy · Terms</span>
        </div>

        {/* Dev credentials toggle */}
        <div className="mt-4" style={{ display: loadingTenant ? "none" : undefined }}>
          <button
            type="button"
            onClick={() => setShowCreds((v) => !v)}
            className={clsx(
              "w-full flex items-center justify-center gap-2",
              "py-2 rounded-lg text-[11px] font-medium",
              "border transition-all duration-150 bg-transparent",
              isDark
                ? "border-[#1e3a5a] text-[#475569] hover:text-[#94a3b8] hover:border-[#2a4a6a]"
                : "border-[#e2e8f0] text-[#94a3b8] hover:text-[#475569]",
            )}
          >
            <ChevronDown
              className={clsx("w-3.5 h-3.5 transition-transform", showCreds && "rotate-180")}
              strokeWidth={2}
            />
            {showCreds ? "Hide" : "Show"} dev credentials
          </button>

          {showCreds && (
            <div
              className={clsx(
                "mt-2 rounded-xl overflow-hidden border",
                isDark ? "border-[#1e3a5a] bg-[#071526]" : "border-[#e2e8f0] bg-white",
              )}
            >
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className={isDark ? "border-b border-[#1e3a5a]" : "border-b border-[#f1f5f9]"}>
                    <th className="px-2.5 py-2 text-left text-[#475569] font-semibold">Role</th>
                    <th className="px-2.5 py-2 text-left text-[#475569] font-semibold">Email</th>
                    <th className="px-2.5 py-2 text-left text-[#475569] font-semibold">Password</th>
                  </tr>
                </thead>
                <tbody>
                  {CRED_ROWS.map((group) => (
                    <Fragment key={group.org}>
                      <tr><td colSpan={3} className={clsx("px-2.5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider", isDark ? "text-[#0ea5e9]" : "text-[#0284c7]")}>{group.org}</td></tr>
                      {group.rows.map(([role, email, pass, colour], i) => (
                        <tr key={i} onClick={() => { setValue("email", email); setValue("password", pass); setShowCreds(false); }}
                          className={clsx("cursor-pointer transition-colors", isDark ? "hover:bg-[#0a1f38]" : "hover:bg-[#f8fafc]", i < group.rows.length - 1 && (isDark ? "border-b border-[#0f2039]" : "border-b border-[#f8fafc]"))}>
                          <td className="px-2.5 py-2"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: colour + "1a", color: colour }}>{role}</span></td>
                          <td className={clsx("px-2.5 py-2 font-mono", isDark ? "text-[#64748b]" : "text-[#94a3b8]")}>{email}</td>
                          <td className={clsx("px-2.5 py-2 font-mono", isDark ? "text-[#64748b]" : "text-[#94a3b8]")}>{pass}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <div className={clsx(
                "px-2.5 py-1.5 text-[10px] text-[#475569]",
                isDark ? "border-t border-[#0f2039]" : "border-t border-[#f1f5f9]",
              )}>
                Click any row to auto-fill
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
