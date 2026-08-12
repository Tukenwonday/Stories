import type { CSSProperties } from "react"
import { ImageIcon } from "lucide-react"
import type { MenuItem } from "../types"
import { useLang } from "../lang-context"
import { strings } from "../i18n"
import { getUnavailableReason, type UnavailableReason } from "../lib/availability"
import type { Lang } from "../types"
import { buildPublicImageUrl } from "../lib/supabase"

export function unavailableLabel(reason: UnavailableReason | null, lang: Lang): string | null {
  if (reason === "stock") return strings.unavailable[lang]
  if (reason === "date") return strings.notServedToday[lang]
  if (reason === "time") return strings.notServedTime[lang]
  return null
}

export default function MenuItemCard({
  item,
  animationIndex = 0,
  onSelect,
}: {
  item: MenuItem
  animationIndex?: number
  onSelect: (item: MenuItem) => void
}) {
  const { lang } = useLang()
  const reason = getUnavailableReason(item)
  const label = unavailableLabel(reason, lang)
  const animationDelay = `${Math.min(animationIndex * 45, 420)}ms`

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      style={{ "--menu-card-delay": animationDelay } as CSSProperties}
      className="animate-menu-card-enter group flex w-full flex-col overflow-hidden rounded-2xl border border-gold/15 bg-surface/60 text-start transition-all active:scale-[0.98]"
    >
      {item.image ? (
        <img
          src={buildPublicImageUrl(item.image)}
          alt={item.title.en}
          loading="lazy"
          decoding="async"
          className={
            "aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.04] " +
            (reason ? "opacity-50" : "")
          }
        />
      ) : (
        <div className="grid aspect-square w-full place-items-center bg-gradient-to-br from-surface-2 to-bg">
          <ImageIcon className="h-8 w-8 text-gold/40" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col px-3.5 pb-3.5 pt-3">
        <h3
          className={
            "line-clamp-2 " +
            (lang === "ar"
              ? "font-arabic text-sm font-semibold leading-relaxed"
              : "font-serif text-[15px] font-semibold uppercase tracking-wide leading-snug") +
            (reason ? " text-muted line-through decoration-gold/50" : " text-foreground")
          }
        >
          {item.title[lang]}
        </h3>
        {label && (
          <p className={"mt-1 text-[10px] font-bold text-red-400 " + (lang === "ar" ? "" : "uppercase tracking-wider")}>
            {label}
          </p>
        )}
        <div className="mt-auto flex items-baseline gap-1 pt-2">
          <span className={"font-serif text-lg font-bold " + (reason ? "text-muted" : "text-gold")}>
            {item.price}
          </span>
          <span className="text-xs font-medium text-muted">{strings.currency[lang]}</span>
        </div>
      </div>
    </button>
  )
}
