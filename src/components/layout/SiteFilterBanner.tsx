import { MapPin } from "lucide-react";
import clsx from "clsx";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { setSelectedSite } from "@/store/auth.slice";

export function SiteFilterBanner() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { allSites } = useTenantConfig();

  if ((user?.role !== "super_admin" && user?.role !== "customer_admin") || !selectedSiteId) return null;

  const site = allSites.find((s) => s.id === selectedSiteId);
  if (!site) return null;

  return (
    <div
      className={clsx(
        "flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2 text-[11px] border-b",
        isDark
          ? "bg-[rgba(14,165,233,0.06)] border-[rgba(14,165,233,0.15)]"
          : "bg-[#eff6ff] border-[#bfdbfe]",
      )}
      role="status"
      aria-live="polite"
    >
      <MapPin className="w-3.5 h-3.5 text-[#0ea5e9] flex-shrink-0" aria-hidden="true" />
      <span style={{ color: "var(--text-secondary)" }}>Showing data for</span>
      <span className="font-semibold text-[#0ea5e9]">{site.name}</span>
      <span style={{ color: "var(--text-muted)" }}>&middot; {site.location} &middot; {site.risk} risk</span>
      <button
        type="button"
        onClick={() => dispatch(setSelectedSite(null))}
        className="ml-auto text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer"
      >
        Show all sites
      </button>
    </div>
  );
}
