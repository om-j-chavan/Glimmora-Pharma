import dayjs from "@/lib/dayjs";

/**
 * Locale-independent date formatters for surfaces that don't have a
 * tenant timezone / dateFormat available (e.g. the AI Backend pages,
 * which authenticate via AI token rather than the tenant session).
 *
 * Tenant-aware surfaces should keep using
 * `dayjs.utc(v).tz(org.timezone).format(org.dateFormat)` directly.
 */

type DateInput = Date | string | number | null | undefined;

const DATE_FORMAT = "DD MMM YYYY";
const DATETIME_FORMAT = "DD MMM YYYY HH:mm";

function toDayjs(value: DateInput): dayjs.Dayjs | null {
  if (value === null || value === undefined || value === "") return null;
  const d = dayjs(value);
  return d.isValid() ? d : null;
}

export function formatDate(value: DateInput): string {
  const d = toDayjs(value);
  if (!d) return typeof value === "string" && value ? value : "—";
  return d.format(DATE_FORMAT);
}

export function formatDateTime(value: DateInput): string {
  const d = toDayjs(value);
  if (!d) return typeof value === "string" && value ? value : "—";
  return d.format(DATETIME_FORMAT);
}
