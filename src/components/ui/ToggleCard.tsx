import { type HTMLAttributes, forwardRef } from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/design-tokens";

export interface ToggleCardProps extends HTMLAttributes<HTMLButtonElement> {
  selected: boolean;
  label: string;
  price?: number;
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

export const ToggleCard = forwardRef<HTMLButtonElement, ToggleCardProps>(
  (
    {
      selected,
      label,
      price,
      icon,
      description,
      disabled = false,
      size = "md",
      className,
      onClick,
      ...props
    },
    ref
  ) => {
    const sizes = {
      sm: "px-3 py-2 text-xs gap-1.5",
      md: "px-4 py-3 text-sm gap-2",
      lg: "px-5 py-4 text-base gap-2.5",
    };

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        className={cn(
          "flex items-center justify-between gap-2 rounded-xl border-2 transition-all duration-200 ease-out",
          "touch-target active:scale-[0.98]",
          selected
            ? "border-gold bg-gold/10 text-gold shadow-gold/20"
            : "border-gold/30 text-muted hover:border-gold/60 hover:bg-gold/5 hover:text-foreground",
          disabled && "opacity-50 cursor-not-allowed",
          sizes[size],
          className
        )}
        {...props}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="shrink-0 text-lg">{icon}</span>}
          <div className="min-w-0">
            <span className="font-medium truncate block">{label}</span>
            {description && (
              <span className="text-[10px] text-muted/70 truncate block">{description}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {price !== undefined && price > 0 && (
            <span className="text-[11px] font-semibold text-gold-soft">+{price}</span>
          )}
          <div
            className={cn(
              "rounded-full border-2 transition-all duration-200",
              selected
                ? "border-gold bg-gold"
                : "border-gold/30 bg-transparent"
            )}
          >
            {selected && <Check className="h-4 w-4 text-bg" />}
          </div>
        </div>
      </button>
    );
  }
);

ToggleCard.displayName = "ToggleCard";

export interface RadioCardProps extends HTMLAttributes<HTMLButtonElement> {
  selected: boolean;
  label: string;
  price?: number;
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

export const RadioCard = forwardRef<HTMLButtonElement, RadioCardProps>(
  (
    {
      selected,
      label,
      price,
      icon,
      description,
      disabled = false,
      size = "md",
      className,
      onClick,
      ...props
    },
    ref
  ) => {
    const sizes = {
      sm: "px-3 py-2 text-xs gap-1.5",
      md: "px-4 py-3 text-sm gap-2",
      lg: "px-5 py-4 text-base gap-2.5",
    };

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-checked={selected}
        role="radio"
        className={cn(
          "flex items-center justify-between gap-2 rounded-xl border-2 transition-all duration-200 ease-out",
          "touch-target active:scale-[0.98]",
          selected
            ? "border-gold bg-gold/10 text-gold shadow-gold/20"
            : "border-gold/30 text-muted hover:border-gold/60 hover:bg-gold/5 hover:text-foreground",
          disabled && "opacity-50 cursor-not-allowed",
          sizes[size],
          className
        )}
        {...props}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="shrink-0 text-lg">{icon}</span>}
          <div className="min-w-0">
            <span className="font-medium truncate block">{label}</span>
            {description && (
              <span className="text-[10px] text-muted/70 truncate block">{description}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {price !== undefined && price > 0 && (
            <span className="text-[11px] font-semibold text-gold-soft">+{price}</span>
          )}
          <div
            className={cn(
              "rounded-full border-2 transition-all duration-200",
              "h-5 w-5 flex items-center justify-center",
              selected ? "border-gold" : "border-gold/30"
            )}
          >
            {selected && (
              <div className="h-2.5 w-2.5 rounded-full bg-gold" />
            )}
          </div>
        </div>
      </button>
    );
  }
);

RadioCard.displayName = "RadioCard";