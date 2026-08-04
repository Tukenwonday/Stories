import { ChevronLeft } from "lucide-react"
import type { MenuItem } from "../types"
import { useLang } from "../lang-context"
import { strings } from "../i18n"

export default function MenuItemCard({
  item,
  onSelect,
}: {
  item: MenuItem
  onSelect: (item: MenuItem) => void
}) {
  const { lang } = useLang()

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="flex w-full items-center justify-between gap-4 py-4 text-start transition-colors active:bg-surface"
    >
      {item.image && (
        <img
          src={item.image}
          alt={item.title.en}
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-lg border border-gold/25 object-cover"
        />
      )}

      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold uppercase tracking-widest text-foreground">
          {item.title[lang]}
        </h3>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <span className="text-base font-bold text-gold">
          {item.price}{" "}
          <span className="text-xs font-medium text-muted">{strings.currency[lang]}</span>
        </span>
        <ChevronLeft className="h-4 w-4 text-muted" />
      </div>
    </button>
  )
}
