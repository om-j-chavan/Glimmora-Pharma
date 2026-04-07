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
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">

      <div className="w-full max-w-[420px] pt-12 pb-10 px-10">
        {/* Logo */}
        <div className="flex flex-col items-start mb-8">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 bg-[#f0a500]">
            <Shield className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-[28px] font-extrabold text-[#302d29] tracking-tight mb-1">
            Welcome Back !
          </h1>
          <p className="text-[14px] text-[#7a736a]">
            Log into your account
          </p>
        </div>

        {/* Loading tenant */}
        {loadingTenant && (
          <div className="flex flex-col items-center justify-center gap-3 py-8" role="status" aria-live="polite">
            <div className="w-8 h-8 rounded-full border-2 border-[#8b6914] border-t-transparent animate-spin" />
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
            <div className="rounded-lg px-3 py-2 bg-[#fef2f2] border border-[#fecaca] text-[12px] text-[#dc2626]">
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
              <label htmlFor="password" className="text-[11px] font-medium text-[#302d29]">
                Passcode <span className="text-[#dc2626]" aria-hidden="true">*</span>
              </label>
              <span className="text-[11px] text-[#8b6914] cursor-pointer underline">Forgot passcode?</span>
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-[#a39e96] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your passcode"
                required
                aria-required="true"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")}
                className="w-full bg-white border border-[#e8e4dd] rounded-lg pl-9.5 pr-3 py-2.5 text-[13px] text-[#302d29] placeholder:text-[#a39e96] outline-none focus:border-[#8b6914] focus:ring-[3px] focus:ring-[rgba(139,105,20,0.12)] transition-all duration-150"
              />
            </div>
            {errors.password && (
              <p id="password-error" role="alert" className="text-[11px] text-[#dc2626] mt-1">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" icon={LogIn} loading={isSubmitting} fullWidth className="py-2.75">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#e8e4dd]" />
            <span className="text-[11px] text-[#a39e96]">or continue with</span>
            <div className="flex-1 h-px bg-[#e8e4dd]" />
          </div>

          <Button variant="secondary" icon={Building2} fullWidth>
            Single Sign-On (SSO)
          </Button>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-[#e8e4dd]" style={{ display: loadingTenant ? "none" : undefined }}>
          <div className="flex items-center gap-1.5 text-[11px] text-[#a39e96]">
            <Shield className="w-3 h-3" aria-hidden="true" />
            21 CFR Part 11 compliant
          </div>
          <span className="text-[11px] text-[#7a736a]">Privacy · Terms</span>
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
                ? "border-[#3d362c] text-[#9c8e80] hover:text-[#d5bfb2] hover:border-[#4a4238]"
                : "border-[#e8e4dd] text-[#7a736a] hover:text-[#302d29]",
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
                isDark ? "border-[#3d362c] bg-[#242019]" : "border-[#e8e4dd] bg-white",
              )}
            >
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className={isDark ? "border-b border-[#3d362c]" : "border-b border-[#e8e4dd]"}>
                    <th className="px-2.5 py-2 text-left text-[#a39e96] font-semibold">Role</th>
                    <th className="px-2.5 py-2 text-left text-[#a39e96] font-semibold">Email</th>
                    <th className="px-2.5 py-2 text-left text-[#a39e96] font-semibold">Password</th>
                  </tr>
                </thead>
                <tbody>
                  {CRED_ROWS.map((group) => (
                    <Fragment key={group.org}>
                      <tr><td colSpan={3} className={clsx("px-2.5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider", isDark ? "text-[#c9a84c]" : "text-[#8b6914]")}>{group.org}</td></tr>
                      {group.rows.map(([role, email, pass, colour], i) => (
                        <tr key={i} onClick={() => { setValue("email", email); setValue("password", pass); setShowCreds(false); }}
                          className={clsx("cursor-pointer transition-colors", isDark ? "hover:bg-[#2e2820]" : "hover:bg-[#faf9f7]", i < group.rows.length - 1 && (isDark ? "border-b border-[#3d362c]" : "border-b border-[#f5f3ef]"))}>
                          <td className="px-2.5 py-2"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: colour + "1a", color: colour }}>{role}</span></td>
                          <td className={clsx("px-2.5 py-2 font-mono", isDark ? "text-[#9c8e80]" : "text-[#7a736a]")}>{email}</td>
                          <td className={clsx("px-2.5 py-2 font-mono", isDark ? "text-[#9c8e80]" : "text-[#7a736a]")}>{pass}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <div className={clsx(
                "px-2.5 py-1.5 text-[10px] text-[#a39e96]",
                isDark ? "border-t border-[#3d362c]" : "border-t border-[#f5f3ef]",
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
