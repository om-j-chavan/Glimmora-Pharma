import { useState } from "react";
import { useNavigate } from "react-router";
import {
  MapPin,
  Search,
  X,
  Building2,
  ArrowRight,
  Info,
  Check,
} from "lucide-react";
import clsx from "clsx";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { setActiveSite } from "@/store/auth.slice";
import { useTenantConfig } from "@/hooks/useTenantConfig";

const riskStyles = {
  HIGH: {
    iconBg: "bg-[rgba(239,68,68,0.12)]",
    iconColor: "text-[#ef4444]",
    badgeBg: "bg-[rgba(239,68,68,0.12)]",
    badgeColor: "text-[#ef4444]",
  },
  MEDIUM: {
    iconBg: "bg-[rgba(245,158,11,0.12)]",
    iconColor: "text-[#f59e0b]",
    badgeBg: "bg-[rgba(245,158,11,0.12)]",
    badgeColor: "text-[#f59e0b]",
  },
  LOW: {
    iconBg: "bg-[rgba(16,185,129,0.12)]",
    iconColor: "text-[#10b981]",
    badgeBg: "bg-[rgba(16,185,129,0.12)]",
    badgeColor: "text-[#10b981]",
  },
};

export function SitePicker() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { sites } = useTenantConfig();
  const activeSites = sites.filter((s) => s.status === "Active");
  const [selectedSite, setSelectedSite] = useState<(typeof sites)[number] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = sites.filter(
    (s) =>
      s.status === "Active" &&
      s.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleEnter = () => {
    if (!selectedSite) return;
    dispatch(setActiveSite(selectedSite.id));
    navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[rgba(4,14,30,0.85)]">
      <div
        className="w-full max-w-[520px] flex flex-col overflow-hidden bg-[#071526] border border-[#1e3a5a] rounded-2xl max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-picker-title"
      >
        {/* header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[#0f2039]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0 bg-[rgba(14,165,233,0.12)] border border-[rgba(14,165,233,0.2)]">
              <MapPin className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="site-picker-title"
                className="text-[15px] font-bold text-[#e2e8f0]"
              >
                Select your site
              </h2>
              <p className="text-[12px] text-[#64748b] mt-0.5">
                Choose the facility you are working from today
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/login")}
            aria-label="Close"
            className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent hover:bg-[#0a1f38] border-none cursor-pointer transition-colors duration-150"
          >
            <X className="w-[14px] h-[14px] text-[#475569]" aria-hidden="true" />
          </button>
        </div>

        {activeSites.length === 0 ? (
          /* ── No sites fallback ── */
          <div className="px-6 py-8">
            <div className={clsx(
              "rounded-xl p-5 text-center border",
              isDark
                ? "bg-[#0a1f38] border-[#1e3a5a]"
                : "bg-[#f8fafc] border-[#e2e8f0]"
            )}>
              <MapPin className="w-10 h-10 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
              <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>No sites configured</p>
              <p className="text-[12px] mb-4" style={{ color: "var(--text-secondary)" }}>
                Your workspace has no sites yet. You can add sites after logging in from Settings &rarr; Sites.
              </p>
              <Button variant="primary" fullWidth onClick={() => navigate("/")}>
                Continue to Dashboard
              </Button>
            </div>
          </div>
        ) : (
          /* ── Normal site picker ── */
          <>
            {/* search */}
            <div className="px-4 py-3 border-b border-[#0f2039]">
              <Input
                id="site-search"
                type="search"
                icon={Search}
                placeholder="Search sites..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                {activeSites.length} site{activeSites.length !== 1 ? "s" : ""} available
              </p>
            </div>

            {/* sites list */}
            <div
              className="px-4 py-3 overflow-y-auto flex-1 max-h-[340px]"
              role="list"
            >
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Info className="w-8 h-8 text-[#334155]" aria-hidden="true" />
                  <p className="text-[13px] text-[#64748b] text-center">
                    No sites match your search.
                  </p>
                </div>
              ) : (
                filtered.map((site) => {
                  const risk = riskStyles[site.risk];
                  const isSelected = selectedSite?.id === site.id;
                  return (
                    <div key={site.id} role="listitem" className="mb-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedSite(site)}
                        aria-pressed={isSelected}
                        aria-label={`${site.name} — ${site.risk} risk`}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all duration-150 outline-none text-left focus-visible:ring-2 focus-visible:ring-[#0ea5e9] ${
                          isSelected
                            ? "bg-[#0c2f5a] border-[#0ea5e9]"
                            : "bg-transparent border-transparent hover:bg-[#0a1f38] hover:border-[#1e3a5a]"
                        }`}
                      >
                        {/* site icon */}
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${risk.iconBg}`}
                        >
                          <Building2
                            className={`w-4 h-4 ${risk.iconColor}`}
                            aria-hidden="true"
                          />
                        </div>

                        {/* site info */}
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-[13px] font-semibold text-[#e2e8f0] truncate">
                            {site.name}
                          </p>
                          <p className="text-[11px] text-[#64748b] mt-0.5 truncate">
                            {site.location} · {site.gmpScope}
                          </p>
                        </div>

                        {/* right side */}
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${risk.badgeBg} ${risk.badgeColor}`}
                          >
                            {site.risk}
                          </span>
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? "border-[#0ea5e9]"
                                : "border-[#1e3a5a]"
                            }`}
                          >
                            {isSelected && (
                              <Check
                                className="w-2.5 h-2.5 text-[#0ea5e9]"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* footer */}
            <div className="flex items-center justify-between px-4 py-3.5 border-t border-[#0f2039]">
              <span className="text-[11px] text-[#475569]">
                {selectedSite ? `${selectedSite.name} selected` : "No site selected"}
              </span>
              <button
                type="button"
                onClick={handleEnter}
                disabled={!selectedSite}
                aria-label={
                  selectedSite
                    ? `Enter platform at ${selectedSite.name}`
                    : "Select a site to continue"
                }
                className="flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-[12px] font-semibold transition-colors duration-150 enabled:bg-[#0ea5e9] enabled:text-white enabled:hover:bg-[#0284c7] disabled:bg-[#1e3a5a] disabled:text-[#475569] disabled:cursor-not-allowed"
              >
                Enter platform
                <ArrowRight className="w-[13px] h-[13px]" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
