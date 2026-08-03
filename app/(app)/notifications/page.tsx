import { redirect } from "next/navigation";

// Notifications now live as a TAB inside Settings (navigation change). This route
// redirects so the header bell's "View all notifications" — and any existing
// bookmark/deep-link to /notifications — lands on the Settings Notifications tab
// instead of 404-ing. The full notifications experience renders there; see
// app/(app)/settings/page.tsx (server data) + SettingsPage (the tab).
export default function Page() {
  redirect("/settings?tab=notifications");
}
