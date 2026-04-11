import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  persistent?: boolean;
}

export function Modal({ open, onClose, title, children, className, persistent }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={persistent ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "relative w-full max-w-[680px] rounded-xl overflow-hidden border shadow-2xl",
          "bg-(--bg-surface) border-(--bg-border)",
          "animate-[popupIn_0.15s_ease-out]",
          "focus:outline-none",
          className,
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--bg-border)">
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
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
