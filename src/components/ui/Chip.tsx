import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/design-tokens";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "gold" | "success" | "warning" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  removable?: boolean;
  onRemove?: () => void;
  icon?: React.ReactNode;
}

export const Chip = forwardRef<HTMLSpanElement, ChipProps>(
  (
    {
      children,
      variant = "default",
      size = "md",
      removable = false,
      onRemove,
      icon,
      className,
      ...props
    },
    ref
  ) => {
    const variants = {
      default: "bg-surface-2 text-foreground border border-border",
      gold: "bg-gold/10 text-gold border border-gold/30",
      success: "bg-green-500/10 text-green-400 border border-green-500/30",
      warning: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
      danger: "bg-red-500/10 text-red-400 border border-red-500/30",
      outline: "bg-transparent text-muted border border-border",
    };

    const sizes = {
      sm: "px-2 py-0.5 text-[10px] gap-1",
      md: "px-3 py-1 text-xs gap-1.5",
      lg: "px-4 py-1.5 text-sm gap-2",
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center font-medium rounded-full transition-colors",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        {children}
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove"
            className="flex h-full items-center justify-center rounded-r-full px-1 hover:bg-black/20 transition-colors"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </span>
    );
  }
);

Chip.displayName = "Chip";