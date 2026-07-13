"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";
import { MotionDiv } from "@/components/motion/Motion";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Plain-text title used by the default header (an `<h2>` + close button).
   *  Still required for backwards compatibility with every existing caller
   *  AND for screen readers when `header` is provided — it backs the
   *  visually-hidden `<h2 id="modal-title">` that aria-labelledby points
   *  to. Don't omit it. */
  title: string;
  /** Optional rich header replacement. When provided, the default text-only
   *  header row is replaced by this node and only an sr-only `<h2>` carrying
   *  `title` remains for accessibility. Use this for headers that need
   *  pills, multi-line content, secondary actions, or any non-text layout
   *  the plain `title` row can't express. */
  header?: ReactNode;
  children: ReactNode;
  /** Optional sticky footer region (e.g. Cancel / Save). Rendered outside the
   *  scrollable body so it stays visible while the body scrolls. */
  footer?: ReactNode;
  className?: string;
  persistent?: boolean;
}

export function Modal({ open, onClose, title, header, children, footer, className, persistent }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Portal target is only available on the client. Defer the first render so
  // we never call createPortal during SSR (document is undefined there).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      panelRef.current?.focus();
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    } else {
      previousFocusRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !persistent) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // `persistent` is intentionally read inside the handler closure; no need to re-bind on flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  if (!open || !mounted) return null;

  // Render into <body> via a portal so the modal's `position: fixed` always
  // resolves against the viewport. Without this, a transformed ancestor (e.g.
  // the sidebar's translate-x slide-in drawer) becomes the containing block
  // and the modal centers inside that element instead of the screen.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={persistent ? undefined : onClose}>
      <MotionDiv variant="fade" aria-hidden className="absolute inset-0 bg-black/50" />
      <MotionDiv
        variant="scaleFade"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "relative w-full max-w-[680px] max-h-[85vh] flex flex-col rounded-2xl overflow-hidden border shadow-2xl",
          "bg-(--bg-surface) border-(--bg-border)",
          "focus:outline-none",
          className,
        )}
      >
        {header ? (
          <>
            <h2 id="modal-title" className="sr-only">{title}</h2>
            {header}
          </>
        ) : (
          <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-(--bg-border)">
            <h2 id="modal-title" className="text-[14px] font-semibold text-(--text-primary)">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors duration-150"
            >
              <X className="w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer && (
          <div className="shrink-0 px-5 py-3 border-t border-(--bg-border) bg-(--bg-surface)">
            {footer}
          </div>
        )}
      </MotionDiv>
    </div>,
    document.body,
  );
}