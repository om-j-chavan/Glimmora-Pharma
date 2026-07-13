"use client";

import type { CSSProperties } from "react";
import dayjs from "@/lib/dayjs";

interface RelativeTimeProps {
  /** ISO string or Date of the event. */
  value: string | Date;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders a relative time ("2 days ago") in a semantic <time> element, with
 * the exact UTC timestamp revealed on hover/focus via the title attribute and
 * exposed to assistive tech / machines via dateTime.
 *
 * Regulated trails need the precise value — relative time alone is
 * insufficient for reconstructing a timeline. suppressHydrationWarning covers
 * the harmless server-vs-client "now" difference in the relative label.
 */
export function RelativeTime({ value, className, style }: RelativeTimeProps) {
  const d = dayjs(value);
  return (
    <time
      dateTime={d.toISOString()}
      title={d.utc().format("DD MMM YYYY HH:mm:ss [UTC]")}
      className={className}
      style={style}
      suppressHydrationWarning
    >
      {d.fromNow()}
    </time>
  );
}
