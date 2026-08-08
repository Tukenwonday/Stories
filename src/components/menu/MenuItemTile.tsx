import { forwardRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { MenuItem } from "../../types";
import { useLang } from "../../lang-context";
import { strings } from "../../i18n";
import { getUnavailableReason, type UnavailableReason } from "../../lib/availability";
import { buildPublicImageUrl } from "../../lib/supabase";
import { cn } from "../../lib/design-tokens";
import { MenuItemSkeleton } from "../ui";

export function unavailableLabel(reason: UnavailableReason | null, lang: "en" | "ar"): string | null {
  if (reason === "stock") return strings.unavailable[lang];
  if (reason === "date") return strings.notServedToday[lang];
  if (reason === "time") return strings.notServedTime[lang];
  return null;
}

interface MenuItemTileProps {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
  index?: number;
  variant?: "list" | "compact";
}

export const MenuItemTile = forwardRef<HTMLButtonElement, MenuItemTileProps>(
  ({ item, onSelect, index = 0, variant = "list" }, ref) => {
    const { lang } = useLang();
    const reason = getUnavailableReason(item);
    const label = unavailableLabel(reason, lang);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    const imageUrl = item.image ? buildPublicImageUrl(item.image) : undefined;

    if (!item) {
      return <MenuItemSkeleton />;
    }

    const isUnavailable = reason !== null;

    return (
      <button
        ref={ref}
        type="button"
        onClick={() => !isUnavailable && onSelect(item)}
        disabled={isUnavailable}
        className={cn(
          "group relative flex w-full items-center gap-4 rounded-2xl border border-border/50 bg-surface/80 py-3.5 px-3 transition-all duration-300 ease-out",
          "animate-fade-up",
          "backdrop-blur-sm",
          isUnavailable
            ? "opacity-60 cursor-not-allowed"
            : "active:scale-[0.98] active:bg-surface-3 hover:bg-surface-2 hover:shadow-lg hover:border-gold/30 hover:shadow-[0_8px_30px_-4px_rgba(197,160,89,0.12)]",
          variant === "compact" && "py-3 gap-3"
        )}
        style={{ animationDelay: `${index * 36}ms` }}
        aria-disabled={isUnavailable}
        aria-label={
          isUnavailable
            ? `${item.title[lang]}, ${label}`
            : `${item.title[lang]}, ${item.price} ${strings.currency[lang]}`
        }
      >
        {item.image && (
          <div
            className={cn(
              "relative shrink-0 overflow-hidden rounded-xl border transition-all duration-300 ease-out",
              imageLoaded ? "border-gold/25" : "border-transparent image-loading"
            )}
            style={{ width: "88px", height: "88px" }}
            aria-hidden="true"
          >
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              className={cn(
                "h-full w-full object-cover transition-all duration-500 ease-out",
                imageLoaded ? "opacity-100 scale-100" : "opacity-0 scale-105",
                isUnavailable && "grayscale"
              )}
            />
            {!imageLoaded && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
                <div className="h-5 w-5 animate-spin-slow rounded-full border-2 border-gold border-t-transparent" />
              </div>
            )}
            {imageError && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-2 text-muted">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
            {isUnavailable && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <span className="rounded-full bg-bg/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gold backdrop-blur">
                  {label}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          </div>
        )}

        {!item.image && (
          <div className="shrink-0 flex h-22 w-22 items-center justify-center rounded-xl border border-gold/15 bg-gradient-to-br from-surface-2 to-surface-3 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-gold/5 via-transparent to-transparent" />
            <svg className="relative h-9 w-9 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3
              className={cn(
                "font-arabic text-base font-bold uppercase tracking-wider truncate transition-colors",
                isUnavailable ? "text-muted line-through decoration-gold/50" : "text-foreground group-hover:text-gold"
              )}
            >
              {item.title[lang]}
            </h3>
            {item.tag && (
              <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-gold">
                {item.tag[lang]}
              </span>
            )}
          </div>

          {item.description && (
            <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-muted group-hover:text-muted/80 transition-colors">
              {item.description[lang]}
            </p>
          )}

          {label && (
            <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-gold">{label}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5 pe-1">
          <span className={cn("font-arabic text-lg font-bold", isUnavailable ? "text-muted" : "text-gold")}>
            {item.price}
            <span className="text-xs font-medium text-gold-warm"> {strings.currency[lang]}</span>
          </span>
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted transition-all duration-300",
              "group-hover:translate-x-1 group-hover:text-gold"
            )}
          />
        </div>
      </button>
    );
  }
);

MenuItemTile.displayName = "MenuItemTile";