/**
 * Loading skeleton rows for DataTable. Renders `rows` × `cols` pulsing bars so
 * a loading table keeps its column structure instead of collapsing to a single
 * "Loading…" line. Rendered inside an existing `<tbody>`, so it returns `<tr>`s.
 *
 * Respects reduced-motion via the global rule in index.css (animations there are
 * neutralised), and uses theme tokens so it reads in light and dark.
 */
export function TableSkeleton({ rows = 5, cols = 1 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-4 py-3">
              <span
                className="block h-3 rounded animate-pulse"
                style={{
                  // First column slightly wider so it reads like a label/value layout.
                  width: c === 0 ? "70%" : "55%",
                  background: "var(--bg-elevated)",
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
