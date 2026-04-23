import { useState, useMemo, useCallback } from "react";

type FilterFn<T> = (item: T, value: string) => boolean;

/**
 * Generic filter hook for list pages.
 * Reduces repeated filter logic across all modules.
 *
 * @example
 * const { filtered, filters, setFilter, clearFilters, anyActive } = useFilters(capas, {
 *   status: (c, v) => c.status === v,
 *   risk: (c, v) => c.risk === v,
 *   site: (c, v) => c.siteId === v,
 *   search: (c, v) => c.description.toLowerCase().includes(v.toLowerCase()),
 * });
 */
export function useFilters<T>(
  items: T[],
  filterFns: Record<string, FilterFn<T>>,
) {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    return items.filter((item) =>
      Object.entries(filters).every(([key, value]) => {
        if (!value || value === "" || value === "all") return true;
        return filterFns[key]?.(item, value) ?? true;
      }),
    );
  }, [items, filters, filterFns]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  const anyActive = Object.values(filters).some((v) => v && v !== "" && v !== "all");

  return { filtered, filters, setFilter, clearFilters, anyActive };
}
