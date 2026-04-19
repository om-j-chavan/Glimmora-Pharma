import { createBrowserRouter } from "react-router";
import { authLoader, siteLoader } from "./loaders";
import { makeRoleLoader } from "./roleLoader";

export const router = createBrowserRouter([
  {
    path: "/login",
    lazy: async () => ({
      Component: (await import("@/components/auth/LoginPage")).LoginPage,
    }),
  },
  {
    path: "/admin",
    loader: authLoader,
    lazy: async () => ({
      Component: (await import("@/modules/admin/AdminShell")).AdminShell,
    }),
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("@/modules/admin/CustomerAccountsPage")).CustomerAccountsPage,
        }),
      },
      {
        path: "customer/:id",
        lazy: async () => ({
          Component: (await import("@/modules/admin/CustomerDetailPage")).CustomerDetailPage,
        }),
      },
    ],
  },
  {
    path: "/site-picker",
    loader: authLoader,
    lazy: async () => ({
      Component: (await import("@/components/auth/SitePicker")).SitePicker,
    }),
  },
  {
    path: "/",
    loader: siteLoader,
    lazy: async () => ({
      Component: (await import("@/components/layout/AppShell")).AppShell,
    }),
    children: [
      {
        index: true,
        loader: makeRoleLoader("/"),
        lazy: async () => ({
          Component: (await import("@/modules/dashboard/DashboardPage")).DashboardPage,
        }),
      },
      {
        path: "settings",
        loader: makeRoleLoader("settings"),
        lazy: async () => ({
          Component: (await import("@/modules/settings/SettingsPage")).SettingsPage,
        }),
      },
      {
        path: "gap-assessment",
        loader: makeRoleLoader("gap-assessment"),
        lazy: async () => ({
          Component: (await import("@/modules/gap-assessment/GapPage")).GapPage,
        }),
      },
      {
        path: "deviation",
        lazy: async () => ({
          Component: (await import("@/modules/deviation/DeviationPage")).DeviationPage,
        }),
      },
      {
        path: "capa",
        loader: makeRoleLoader("capa"),
        lazy: async () => ({
          Component: (await import("@/modules/capa/CAPAPage")).CAPAPage,
        }),
      },
      {
        path: "capa/:id",
        loader: makeRoleLoader("capa"),
        lazy: async () => ({
          Component: (await import("@/modules/capa/CAPADetailPage")).CAPADetailPage,
        }),
      },
      {
        path: "csv-csa",
        loader: makeRoleLoader("csv-csa"),
        lazy: async () => ({
          Component: (await import("@/modules/csv-csa/CSVPage")).CSVPage,
        }),
      },
      {
        path: "inspection",
        loader: makeRoleLoader("inspection"),
        lazy: async () => ({
          Component: (await import("@/modules/inspection/InspectionPage")).InspectionPage,
        }),
      },
      {
        path: "fda-483",
        loader: makeRoleLoader("fda-483"),
        lazy: async () => ({
          Component: (await import("@/modules/fda-483/FDA483Page")).FDA483Page,
        }),
      },
      {
        path: "agi-console",
        loader: makeRoleLoader("agi-console"),
        lazy: async () => ({
          Component: (await import("@/modules/agi-console/AGIPage")).AGIPage,
        }),
      },
      {
        path: "evidence",
        loader: makeRoleLoader("evidence"),
        lazy: async () => ({
          Component: (await import("@/modules/evidence/EvidencePage")).EvidencePage,
        }),
      },
      {
        path: "governance",
        loader: makeRoleLoader("governance"),
        lazy: async () => ({
          Component: (await import("@/modules/governance/GovernancePage")).GovernancePage,
        }),
      },
      {
        path: "readiness",
        lazy: async () => ({
          Component: (await import("@/modules/readiness/ReadinessPage")).ReadinessPage,
        }),
      },
      {
        path: "ai-policy",
        lazy: async () => ({
          Component: (await import("@/modules/settings/AIPolicyPage")).AIPolicyPage,
        }),
      },
      {
        path: "audit-trail",
        lazy: async () => ({
          Component: (await import("@/modules/audit-trail/AuditTrailPage")).AuditTrailPage,
        }),
      },
    ],
  },
]);
