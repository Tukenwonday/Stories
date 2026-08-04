import { useMemo, useState } from "react"
import { Minus, Plus, X } from "lucide-react"
import type { MenuItem, ModifierGroup, SelectedModifier } from "../types"
import { useLang } from "../lang-context"
import { strings } from "../i18n"
import { useCart } from "../store/cart"

/** Pre-select the first option for required single-choice groups. */
function initialSelection(item: MenuItem): Record<string, string[]> {
  const state: Record<string, string[]> = {}
  for (const g of item.modifiers ?? []) {
    state[g.id] = g.type === "single" && g.required ? [g.options[0].id] : []
  }
  return state
}

export default function MenuItemSheet({
  item,
  onClose,
}: {
  item: MenuItem
  onClose: () => void
}) {
  const { lang, dir } = useLang()
  const addItem = useCart((s) => s.addItem)
  const [selection, setSelection] = useState<Record<string, string[]>>(() => initialSelection(item))
  const [quantity, setQuantity] = useState(1)

  const groups = item.modifiers ?? []

  function toggle(group: ModifierGroup, optionId: string) {
    setSelection((prev) => {
      const current = prev[group.id] ?? []
      if (group.type === "single") {
        return { ...prev, [group.id]: [optionId] }
      }
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId]
      return { ...prev, [group.id]: next }
    })
  }

  const selectedModifiers: SelectedModifier[] = useMemo(() => {
    const result: SelectedModifier[] = []
    for (const g of groups) {
      for (const optId of selection[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId)
        if (!opt) continue
        result.push({
          groupId: g.id,
          groupLabel: g.label,
          optionId: opt.id,
          optionLabel: opt.label,
          price: opt.price ?? 0,
        })
      }
    }
    return result
  }, [groups, selection])

  const unitPrice = item.price + selectedModifiers.reduce((s, m) => s + m.price, 0)

  const canAdd = groups.every((g) => !g.required || (selection[g.id]?.length ?? 0) > 0)

  function handleAdd() {
    if (!canAdd) return
    addItem(item, selectedModifiers, quantity)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" dir={dir}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-black/70"
      />

      <div className="animate-sheet relative flex max-h-[90vh] flex-col overflow-hidden rounded-t-3xl border-t border-border bg-surface">
        {/* Image header */}
        {item.image && (
          <div className="relative shrink-0">
            <img src={item.image} alt={item.title.en} className="h-52 w-full object-cover" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 end-4 grid h-9 w-9 place-items-center rounded-full bg-bg/70 text-foreground backdrop-blur-sm"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <h2 className="text-xl font-bold uppercase tracking-widest text-foreground">
            {item.title[lang]}
          </h2>

          {item.tag && (
            <span className="mt-3 inline-block rounded-full border border-gold/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-gold">
              {item.tag[lang]}
            </span>
          )}

          <p className="mt-3 text-sm leading-relaxed text-muted">{item.description[lang]}</p>

          {groups.length > 0 && (
            <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
              {groups.map((g) => (
                <fieldset key={g.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <legend className="text-sm font-semibold text-foreground">{g.label[lang]}</legend>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                      {g.required ? strings.required[lang] : strings.optional[lang]} ·{" "}
                      {g.type === "single" ? strings.chooseOne[lang] : strings.chooseAny[lang]}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {g.options.map((opt) => {
                      const checked = (selection[g.id] ?? []).includes(opt.id)
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggle(g, opt.id)}
                          aria-pressed={checked}
                          className={
                            "flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors " +
                            (checked
                              ? "border-gold bg-gold/10 text-gold"
                              : "border-gold/30 text-muted active:border-gold/60")
                          }
                        >
                          {opt.label[lang]}
                          {opt.price ? (
                            <span className="text-[11px] font-semibold text-gold-soft">
                              +{opt.price}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </div>

        {/* Footer: quantity + add */}
        <div className="pb-safe flex items-center gap-3 border-t border-border p-5">
          <div className="flex items-center gap-3 rounded-full border border-border bg-surface-2 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
              className="grid h-8 w-8 place-items-center rounded-full text-foreground active:bg-surface"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-5 text-center text-sm font-bold text-foreground">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Increase quantity"
              className="grid h-8 w-8 place-items-center rounded-full text-foreground active:bg-surface"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gold px-5 py-3.5 text-sm font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            {strings.addToOrder[lang]} · {unitPrice * quantity} {strings.currency[lang]}
          </button>
        </div>
      </div>
    </div>
  )
}
