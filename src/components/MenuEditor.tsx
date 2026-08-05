import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { ArrowLeft, Check, ChevronDown } from "lucide-react"
import { useLang } from "../lang-context"
import { kitchenStrings } from "../kitchen-i18n"
import { fetchMenu, updateMenuItem } from "../lib/supabase"
import type { Category, MenuItem, Lang } from "../types"
import { getUnavailableReason, type UnavailableReason } from "../lib/availability"

const inputClass =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-gold"

function Field({
  label,
  full,
  children,
}: {
  label: string
  full?: boolean
  children: ReactNode
}) {
  return (
    <label className={"block " + (full ? "md:col-span-2" : "")}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  )
}

function reasonLabel(
  reason: UnavailableReason | null,
  fallbackKey: "itemAvailable",
  lang: Lang,
) {
  if (reason === "stock") return kitchenStrings.itemUnavailable[lang]
  if (reason === "date") return kitchenStrings.notServedToday[lang]
  if (reason === "time") return kitchenStrings.notServedTime[lang]
  return kitchenStrings[fallbackKey][lang]
}

interface ParsedNotAvailable {
  from: string | null
  to: string | null
  dates: string[]
  error?: string
}

function parseNotAvailable(text: string): ParsedNotAvailable {
  const result: ParsedNotAvailable = { from: null, to: null, dates: [] }
  const tokens = text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const token of tokens) {
    const range = token.match(/^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/)
    if (range) {
      result.from = `${range[1].padStart(2, "0")}:${range[2]}`
      result.to = `${range[3].padStart(2, "0")}:${range[4]}`
      continue
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
      if (!result.dates.includes(token)) result.dates.push(token)
      continue
    }
    result.error = `"${token}"`
    return result
  }
  return result
}

interface ItemForm {
  titleEn: string
  titleAr: string
  descEn: string
  descAr: string
  price: string
  image: string
  notAvailable: string
  isAvailable: boolean
}

function ItemRow({ item }: { item: MenuItem }) {
  const { lang } = useLang()
  const t = (k: keyof typeof kitchenStrings) => kitchenStrings[k][lang]
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ItemForm>(() => {
    const windowStr =
      item.notServedFrom && item.notServedTo
        ? `${item.notServedFrom.slice(0, 5)}-${item.notServedTo.slice(0, 5)}`
        : ""
    const dates = item.unavailableDates ?? []
    return {
      titleEn: item.title.en,
      titleAr: item.title.ar,
      descEn: item.description.en,
      descAr: item.description.ar,
      price: String(item.price),
      image: item.image ?? "",
      notAvailable: [windowStr, ...dates].filter(Boolean).join(", "),
      isAvailable: item.isAvailable !== false,
    }
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const preview = parseNotAvailable(form.notAvailable)
  const reason = getUnavailableReason({
    isAvailable: form.isAvailable,
    unavailableDates: preview.dates,
    notServedFrom: preview.from,
    notServedTo: preview.to,
  })
  const status = reasonLabel(reason, "itemAvailable", lang)

  const patch = (p: Partial<ItemForm>) => setForm((f) => ({ ...f, ...p }))

  async function handleSave() {
    setSaveError(null)
    const price = Number(form.price)
    if (Number.isNaN(price) || price < 0) {
      setSaveError(t("invalidPrice"))
      return
    }
    const parsed = parseNotAvailable(form.notAvailable)
    if (parsed.error) {
      setSaveError(t("invalidNotAvailable") + parsed.error)
      return
    }
    setSaving(true)
    const res = await updateMenuItem(item.id, {
      title_en: form.titleEn,
      title_ar: form.titleAr,
      description_en: form.descEn,
      description_ar: form.descAr,
      price,
      image: form.image.trim() || null,
      not_served_from: parsed.from,
      not_served_to: parsed.to,
      unavailable_dates: parsed.dates,
      is_available: form.isAvailable,
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } else {
      setSaveError(res.error ?? "Failed")
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        {item.image && (
          <img
            src={item.image}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg border border-gold/25 object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">
            {item.title.en}
            <span className="ms-2 font-medium text-muted">{item.title.ar}</span>
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <span
              className={
                "text-[11px] font-bold " + (reason ? "text-red-400" : "text-gold")
              }
            >
              {status}
            </span>
            <span className="text-[11px] text-muted">{form.price}</span>
            {item.modifiers && item.modifiers.length > 0 && (
              <span className="text-[11px] text-muted">
                · {item.modifiers.length} mod
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={
            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-colors " +
            (saved
              ? "bg-gold/20 text-gold"
              : "bg-gold text-bg active:bg-gold/90 disabled:opacity-50")
          }
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : null}
          {saving ? t("saving") : saved ? t("saved") : t("save")}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle editor"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted"
        >
          <ChevronDown className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")} />
        </button>
      </div>

      {saveError && <p className="mt-2 text-xs text-red-400">{saveError}</p>}

      {open && (
        <div className="mt-3 grid gap-3 border-t border-border pt-3 md:grid-cols-2">
          <Field label={`${t("titleLabel")} (EN)`}>
            <input
              value={form.titleEn}
              onChange={(e) => patch({ titleEn: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={`${t("titleLabel")} (AR)`}>
            <input
              value={form.titleAr}
              onChange={(e) => patch({ titleAr: e.target.value })}
              dir="rtl"
              className={inputClass}
            />
          </Field>
          <Field label={`${t("descriptionLabel")} (EN)`} full>
            <textarea
              rows={2}
              value={form.descEn}
              onChange={(e) => patch({ descEn: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={`${t("descriptionLabel")} (AR)`} full>
            <textarea
              rows={2}
              value={form.descAr}
              onChange={(e) => patch({ descAr: e.target.value })}
              dir="rtl"
              className={inputClass}
            />
          </Field>
          <Field label={t("priceLabel")}>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.price}
              onChange={(e) => patch({ price: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={t("imageLabel")}>
            <input
              value={form.image}
              onChange={(e) => patch({ image: e.target.value })}
              placeholder="images/…"
              className={inputClass}
            />
          </Field>
          <Field label={t("notAvailableLabel")} full>
            <input
              value={form.notAvailable}
              onChange={(e) => patch({ notAvailable: e.target.value })}
              placeholder={t("notAvailablePlaceholder")}
              className={inputClass}
            />
            <span className="mt-1 block text-[11px] leading-relaxed text-muted">
              {t("notAvailableHint")}
            </span>
          </Field>

          <label className="flex items-center gap-2 text-sm font-semibold text-foreground md:col-span-2">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(e) => patch({ isAvailable: e.target.checked })}
              className="h-4 w-4 rounded border-border accent-[#c5a059]"
            />
            {t("availableToggle")}
          </label>
        </div>
      )}
    </div>
  )
}

export default function MenuEditor({ onBack }: { onBack: () => void }) {
  const { lang } = useLang()
  const t = (k: keyof typeof kitchenStrings) => kitchenStrings[k][lang]

  const [data, setData] = useState<{ categories: Category[]; menu: MenuItem[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMenu()
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch((e: unknown) => {
        console.error(e)
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
  }, [])

  const grouped = useMemo(() => {
    if (!data) return []
    return data.categories.map((c) => ({
      ...c,
      items: data.menu.filter((m) => m.category === c.id),
    }))
  }, [data])

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-20 text-center text-sm text-muted">
        {t("loading")}
      </main>
    )
  }
  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-20 text-center text-sm text-red-400">{error}</main>
    )
  }
  if (!data) return null

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold uppercase tracking-[0.2em] text-gold">{t("menuEditor")}</h2>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors active:bg-surface-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToOrders")}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-6">
        {grouped.map((cat) => (
          <section key={cat.id}>
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground">
              <span className="text-gold">{cat.label[lang]}</span>
              <span className="text-xs font-medium text-muted">({cat.items.length})</span>
            </h3>
            <div className="mt-2 divide-y divide-border rounded-2xl border border-border bg-surface/40">
              {cat.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
