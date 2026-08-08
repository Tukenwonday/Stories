import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/design-tokens";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular" | "card";
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ variant = "text", width, height, lines = 1, className, ...props }, ref) => {
    const baseStyles = "animate-shimmer rounded bg-surface-2";

    if (variant === "circular") {
      return (
        <div
          ref={ref}
          className={cn(baseStyles, "rounded-full", className)}
          style={{ width: width || "40px", height: height || "40px" }}
          {...props}
        />
      );
    }

    if (variant === "rectangular") {
      return (
        <div
          ref={ref}
          className={cn(baseStyles, "rounded-xl", className)}
          style={{ width: width || "100%", height: height || "16px" }}
          {...props}
        />
      );
    }

    if (variant === "card") {
      return (
        <div ref={ref} className={cn("space-y-3", className)} {...props}>
          <div className={cn(baseStyles, "rounded-xl", "h-40 w-full")} />
          <div className={cn(baseStyles, "rounded-lg", "h-6 w-3/4")} />
          <div className={cn(baseStyles, "rounded-lg", "h-4 w-1/2")} />
          <div className={cn(baseStyles, "rounded-full", "h-8 w-20")} />
        </div>
      );
    }

    // Text variant - multiple lines
    return (
      <div ref={ref} className={cn("space-y-2", className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(baseStyles, "rounded", "h-4")}
            style={{
              width: i === lines - 1 ? width || "60%" : width || "100%",
            }}
          />
        ))}
      </div>
    );
  }
);

Skeleton.displayName = "Skeleton";

export const MenuItemSkeleton = () => (
  <div className="flex items-center gap-4 py-4">
    <Skeleton variant="rectangular" width="80" height="80" className="rounded-lg shrink-0" />
    <div className="flex-1 min-w-0 space-y-2">
      <Skeleton variant="text" width="70%" />
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="rectangular" width="80px" height="24px" className="rounded-full" />
    </div>
  </div>
);

export const CategorySkeleton = () => (
  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
    {Array.from({ length: 6 }).map((_, i) => (
      <Skeleton key={i} variant="rectangular" width="100px" height="36px" className="rounded-full shrink-0" />
    ))}
  </div>
);

export const CartItemSkeleton = () => (
  <div className="py-4 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="80%" />
      </div>
      <Skeleton variant="circular" width="28" height="28" />
    </div>
    <div className="flex items-center justify-between">
      <Skeleton variant="rectangular" width="100px" height="36px" className="rounded-full" />
      <Skeleton variant="rectangular" width="70px" height="20px" />
    </div>
  </div>
);