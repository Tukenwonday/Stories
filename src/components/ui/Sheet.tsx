import { type HTMLAttributes, forwardRef, useEffect, useRef } from "react";
import { cn } from "../../lib/design-tokens";
import { X } from "lucide-react";

export interface SheetProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  maxHeight?: string;
  showHandle?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}

export const Sheet = forwardRef<HTMLDivElement, SheetProps>(
  (
    {
      open,
      onClose,
      title,
      description,
      maxHeight = "92vh",
      showHandle = true,
      closeOnOverlayClick = true,
      closeOnEscape = true,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && closeOnEscape) {
          onClose();
        }
      };

      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";

      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "";
      };
    }, [open, closeOnEscape, onClose]);

    if (!open) return null;

    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end" {...props}>
        <button
          type="button"
          onClick={closeOnOverlayClick ? onClose : undefined}
          className="animate-fade absolute inset-0 bg-black/70 backdrop-blur-sm"
          aria-hidden="true"
        />

        <div
          ref={contentRef}
          className={cn(
            "animate-sheet relative flex max-h-[92vh] flex-col overflow-hidden rounded-t-3xl border-t border-border bg-surface",
            className
          )}
          style={{ maxHeight }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? "sheet-title" : undefined}
          aria-describedby={description ? "sheet-description" : undefined}
        >
          {(title || description) && (
            <div className="flex items-start justify-between border-b border-border p-5">
              <div>
                {title && (
                  <h2 id="sheet-title" className="text-lg font-bold text-foreground">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id="sheet-description" className="mt-1 text-xs text-muted">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted hover:bg-surface-3 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}

          {showHandle && (
            <div className="flex justify-center pt-2">
              <div className="h-1.5 w-10 rounded-full bg-border" />
            </div>
          )}

          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    );
  }
);

Sheet.displayName = "Sheet";

export interface SheetFooterProps extends HTMLAttributes<HTMLDivElement> {}

export const SheetFooter = forwardRef<HTMLDivElement, SheetFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("pb-safe flex items-center gap-3 border-t border-border p-5", className)}
      {...props}
    />
  )
);

SheetFooter.displayName = "SheetFooter";