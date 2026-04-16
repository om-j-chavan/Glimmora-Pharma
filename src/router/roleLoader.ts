import { redirect } from "react-router";
import { store } from "@/store";
import type { RoleKey, ModuleKey } from "@/store/permissions.slice";

/** Maps route path segments to module keys */
const PATH_TO_MODULE: Record<string, ModuleKey> = {
  "gap-assessment": "gap",
  capa: "capa",
  "csv-csa": "csv",
  "fda-483": "fda483",
  evidence: "evidence",
  "agi-console": "agi",
  governance: "governance",
  settings: "settings",
  inspection: "dashboard", // fallback
};

export function makeRoleLoader(path: string) {
  return function roleLoader() {
    const { token, user, activeSiteId } = store.getState().auth;
    if (!token || !user) return redirect("/login");
    // Super admin and customer admin have all-sites access — never require a specific site
    if (!activeSiteId && user.role !== "super_admin" && user.role !== "customer_admin") {
      return redirect("/login");
    }

    const matrix = store.getState().permissions?.matrix;
    if (matrix) {
      const role = user.role as RoleKey;
      const moduleKey = PATH_TO_MODULE[path];
      if (moduleKey && matrix[role]?.[moduleKey] === "none") {
        return redirect("/");
      }
    }

    return null;
  };
}
