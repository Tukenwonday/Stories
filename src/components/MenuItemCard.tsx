import { ChevronLeft } from "lucide-react"
import type { MenuItem } from "../types"
import { useLang } from "../lang-context"
import { strings } from "../i18n"
import { getUnavailableReason, type UnavailableReason } from "../lib/availability"
import type { Lang } from "../types"

export function unavailableLabel(reason: UnavailableReason | null, lang: Lang): string | null {
  if (reason === "stock") return strings.unavailable[lang]
  if (reason === "date") return strings.notServedToday[lang]
  if (reason === "time") return strings.notServedTime[lang]
  return null
}

export default function MenuItemCard({
  item,
  onSelect,
}: {
  item: MenuItem
  onSelect: (item: MenuItem) => void
}) {
  const { lang } = useLang()
  const reason = getUnavailableReason(item)
  const label = unavailableLabel(reason, lang)

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="flex w-full items-center justify-between gap-4 py-4 text-start transition-colors active:bg-surface"
    >
      {item.image && (
        <div className="relative shrink-0">
          <img
            src={item.image}
            alt={item.title.en}
            loading="lazy"
            className={
              "h-20 w-20 rounded-lg border border-gold/25 object-cover " +
              (reason ? "opacity-50" : "")
            }
          />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <h3
          className={
            "text-base font-bold uppercase tracking-widest " +
            (reason ? "text-muted line-through decoration-gold/50" : "text-foreground")
          }
        >
          {item.title[lang]}
        </h3>
        {label && (
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">{label}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <span className={"text-base font-bold " + (reason ? "text-muted" : "text-gold")}>
          {item.price}{" "}
          <span className="text-xs font-medium text-muted">{strings.currency[lang]}</span>
        </span>
        <ChevronLeft className="h-4 w-4 text-muted" />
      </div>
    </button>
  )
}
