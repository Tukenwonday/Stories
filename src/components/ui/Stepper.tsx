import { type HTMLAttributes, forwardRef, useCallback } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "../../lib/design-tokens";

export interface StepperProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: number;
  onValueChange?: (value: number) => void;
  /** Alias kept for backwards compatibility with existing call sites. */
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: "sm" | "md" | "lg";
  showInput?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

const noop = () => {};

export const Stepper = forwardRef<HTMLDivElement, StepperProps>(
  (
    {
      value,
      onValueChange,
      onChange,
      min = 1,
      max = 99,
      step = 1,
      size = "md",
      showInput = true,
      disabled = false,
      className,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    const fire = useCallback(
      (next: number) => {
        onValueChange?.(next);
        onChange?.(next);
      },
      [onValueChange, onChange]
    );

    const sizes = {
      sm: { btn: "h-7 w-7", input: "w-8 text-xs", icon: "h-3 w-3", gap: "gap-1.5" },
      md: { btn: "h-9 w-9", input: "w-10 text-sm", icon: "h-4 w-4", gap: "gap-2" },
      lg: { btn: "h-11 w-11", input: "w-12 text-base", icon: "h-5 w-5", gap: "gap-2.5" },
    };

    const s = sizes[size];
    const atMin = value <= min;
    const atMax = value >= max;

    const decrement = useCallback(() => {
      if (disabled || atMin) return noop();
      fire(Math.max(min, value - step));
    }, [disabled, atMin, value, step, fire]);

    const increment = useCallback(() => {
      if (disabled || atMax) return noop();
      fire(Math.min(max, value + step));
    }, [disabled, atMax, value, step, fire]);

    return (
      <div
        ref={ref}
        className={cn("flex items-center", s.gap, className)}
        {...props}
      >
        <button
          type="button"
          onClick={decrement}
          disabled={disabled || atMin}
          aria-label={ariaLabel ? `${ariaLabel}, decrease` : "Decrease quantity"}
          className={cn(
            "grid place-items-center rounded-full bg-surface-2 text-foreground transition-colors",
            "active:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed",
            s.btn
          )}
        >
          <Minus className={s.icon} />
        </button>

        {showInput && (
          <input
            type="number"
            value={value}
            onChange={(e) => {
              const num = parseInt(e.target.value, 10);
              if (!isNaN(num) && num >= min && num <= max) {
                fire(num);
              }
            }}
            min={min}
            max={max}
            step={step}
            readOnly={!showInput}
            inputMode="numeric"
            className={cn(
              "text-center font-bold text-foreground bg-transparent outline-none",
              s.input
            )}
            aria-label={ariaLabel ? `${ariaLabel}, quantity` : "Quantity"}
          />
        )}

        <button
          type="button"
          onClick={increment}
          disabled={disabled || atMax}
          aria-label={ariaLabel ? `${ariaLabel}, increase` : "Increase quantity"}
          className={cn(
            "grid place-items-center rounded-full bg-surface-2 text-foreground transition-colors",
            "active:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed",
            s.btn
          )}
        >
          <Plus className={s.icon} />
        </button>
      </div>
    );
  }
);

Stepper.displayName = "Stepper";
