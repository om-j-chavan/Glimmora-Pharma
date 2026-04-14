import dynamic from "next/dynamic";

const ReactRouterShell = dynamic(
  () => import("@/shell/ReactRouterShell").then((m) => m.ReactRouterShell),
  {
    ssr: false,
    loading: () => (
      <div
        aria-busy="true"
        aria-label="Loading application"
        style={{ minHeight: "100vh", background: "var(--bg-base)" }}
      />
    ),
  },
);

export default function CatchAll() {
  return <ReactRouterShell />;
}
