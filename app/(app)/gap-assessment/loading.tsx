export default function Loading() {
  return (
    <div className="w-full space-y-5">
      {/* Header skeleton */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-6 w-64 rounded-md animate-pulse" style={{ background: "var(--bg-elevated)" }} />
          <div className="h-4 w-40 rounded-md animate-pulse" style={{ background: "var(--bg-elevated)" }} />
        </div>
        <div className="h-9 w-28 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-3 border-b" style={{ borderColor: "var(--bg-border)" }}>
        {[80, 120, 100].map((w, i) => (
          <div key={i} className="h-9 rounded-md animate-pulse mb-[-1px]" style={{ width: w, background: "var(--bg-elevated)" }} />
        ))}
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl p-5 animate-pulse" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
            <div className="h-3 w-24 rounded mb-3" style={{ background: "var(--bg-border)" }} />
            <div className="h-8 w-12 rounded" style={{ background: "var(--bg-border)" }} />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="card overflow-hidden">
        <div className="h-10" style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--bg-border)" }} />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 animate-pulse" style={{ borderBottom: "1px solid var(--bg-border)", background: i % 2 === 0 ? "var(--bg-surface)" : "transparent" }} />
        ))}
      </div>
    </div>
  );
}
