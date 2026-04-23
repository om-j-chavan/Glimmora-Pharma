export default function Loading() {
  return (
    <div className="w-full space-y-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-6 w-64 rounded-md animate-pulse" style={{ background: "var(--bg-elevated)" }} />
          <div className="h-4 w-40 rounded-md animate-pulse" style={{ background: "var(--bg-elevated)" }} />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl p-5 h-24 animate-pulse" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }} />
        ))}
      </div>
      <div className="card overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 animate-pulse" style={{ borderBottom: "1px solid var(--bg-border)" }} />
        ))}
      </div>
    </div>
  );
}
