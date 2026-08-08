import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/design-tokens";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  size?: "sm" | "md" | "lg" | "xl";
  fullWidth?: boolean;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      fullWidth = false,
      loading = false,
      iconLeft,
      iconRight,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] touch-target";

    const variants = {
      primary: "bg-gold text-bg hover:bg-gold-warm hover:shadow-gold shadow-lg shadow-black/40",
      secondary: "bg-surface-2 text-foreground border border-border hover:bg-surface-3 hover:-translate-y-px",
      ghost: "bg-transparent text-foreground hover:bg-surface-2",
      danger: "bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30",
      gold: "bg-gold/10 text-gold border border-gold/30 hover:bg-gold/20 hover:shadow-gold",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-xs rounded-full",
      md: "px-4 py-2.5 text-sm rounded-full",
      lg: "px-6 py-3 text-base rounded-full",
      xl: "px-8 py-4 text-lg rounded-full",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], fullWidth && "w-full", className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <>
            {!loading && iconLeft}
            {children}
            {!loading && iconRight}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
