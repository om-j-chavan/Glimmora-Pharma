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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "rgba(48,45,41,0.5)", backdropFilter: "blur(4px)" }}>
      <div
        className="w-full max-w-[520px] flex flex-col overflow-hidden rounded-2xl max-h-[90vh]"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", boxShadow: "var(--shadow-modal)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-picker-title"
      >
        {/* header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4" style={{ borderBottom: "1px solid var(--bg-border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ background: "var(--brand-muted)", border: "1px solid var(--brand-border)" }}>
              <MapPin className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            </div>
            <div>
              <h2
                id="site-picker-title"
                className="text-[15px] font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Select your site
              </h2>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Choose the facility you are working from today
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/login")}
            aria-label="Close"
            className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent border-none cursor-pointer transition-colors duration-150"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-[14px] h-[14px]" aria-hidden="true" />
          </button>
        </div>

        {activeSites.length === 0 ? (
          /* ── No sites fallback ── */
          <div className="px-6 py-8">
            <div className={clsx(
              "rounded-xl p-5 text-center border",
              isDark
                ? "bg-[#242019] border-[#3d362c]"
                : "bg-[#faf9f7] border-[#e8e4dd]"
            )}>
              <MapPin className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
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
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--bg-border)" }}>
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
                  <Info className="w-8 h-8" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                  <p className="text-[13px] text-center" style={{ color: "var(--text-secondary)" }}>
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
                        className="w-full flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 outline-none text-left"
                        style={{
                          background: isSelected ? "var(--brand-muted)" : "transparent",
                          border: isSelected ? "1px solid var(--brand-border)" : "1px solid transparent",
                        }}
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
                          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {site.name}
                          </p>
                          <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
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
                            className="w-4 h-4 rounded-full flex items-center justify-center transition-all"
                            style={{ border: isSelected ? "2px solid var(--brand)" : "2px solid var(--bg-border)" }}
                          >
                            {isSelected && (
                              <Check
                                className="w-2.5 h-2.5"
                                style={{ color: "var(--brand)" }}
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
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderTop: "1px solid var(--bg-border)" }}>
              <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
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
                className="flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-[12px] font-semibold transition-colors duration-150 disabled:cursor-not-allowed"
                style={{
                  background: selectedSite ? "var(--brand)" : "var(--bg-border)",
                  color: selectedSite ? "#ffffff" : "var(--text-muted)",
                  border: "none",
                }}
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
