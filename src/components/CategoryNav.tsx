import { useEffect, useRef } from "react"
import { useLang } from "../lang-context"
import type { Category } from "../types"

export default function CategoryNav({
  active,
  onSelect,
  categories,
}: {
  active: string
  onSelect: (id: string) => void
  categories: Category[]
}) {
  const { lang } = useLang()
  const railRef = useRef<HTMLDivElement>(null)

  // Keep the active pill scrolled into view.
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const el = rail.querySelector<HTMLButtonElement>(`[data-cat="${active}"]`)
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
  }, [active])

  return (
    <nav>
      <div
        ref={railRef}
        className="no-scrollbar mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-2.5"
      >
        {categories.map((c) => {
          const isActive = c.id === active
          return (
            <button
              key={c.id}
              data-cat={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={
                "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors " +
                (isActive
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border bg-surface text-muted active:text-foreground")
              }
            >
              {c.label[lang]}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
