import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { ArrowLeft, Check, ChevronDown } from "lucide-react"
import { useLang } from "../lang-context"
import { kitchenStrings } from "../kitchen-i18n"
import { fetchMenu, updateMenuItem } from "../lib/supabase"
import type { Category, Lang, MenuItem, NotServedWindow } from "../types"
import { getUnavailableReason, type UnavailableReason } from "../lib/availability"

const HOURS = Array.from({ length: 24 }, (_, i) => i)

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

function pad(h: number): string {
  return String(h).padStart(2, "0")
}

function toHour(t: string): number | null {
  const p = parseInt(t.split(":")[0], 10)
  return Number.isNaN(p) ? null : p
}

/** Convert a set of blocked hours into not-served windows (merged runs, midnight wrap). */
function hoursToWindows(hours: number[]): NotServedWindow[] {
  const set = new Set(hours)
  if (set.size === 0) return []
  const sorted = [...set].sort((a, b) => a - b)
  const ranges: Array<[number, number]> = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i]
    } else {
      ranges.push([start, prev])
      start = sorted[i]
      prev = sorted[i]
    }
  }
  ranges.push([start, prev])

  if (ranges.length > 1 && ranges[0][0] === 0 && ranges[ranges.length - 1][1] === 23) {
    const last = ranges.pop()!
    ranges[0] = [last[0], ranges[0][1]]
  }

  return ranges.map(([fromH, toH]) => ({
    from: `${pad(fromH)}:00`,
    to: `${pad(toH + 1)}:00`,
  }))
}

/** Inverse of hoursToWindows: the blocked hours implied by stored windows. */
function windowsToHours(windows: NotServedWindow[]): number[] {
  const hours = new Set<number>()
  for (const w of windows) {
    const f = toHour(w.from)
    const t = toHour(w.to)
    if (f == null || t == null || f === t) continue
    if (f < t) {
      for (let h = f; h < t; h++) hours.add(h % 24)
    } else {
      for (let h = f; h < 24; h++) hours.add(h)
      for (let h = 0; h < t; h++) hours.add(h)
    }
  }
  return [...hours]
}

interface ItemForm {
  titleEn: string
  titleAr: string
  descEn: string
  descAr: string
  price: string
  image: string
  hours: number[]
  isAvailable: boolean
}

function ItemRow({ item }: { item: MenuItem }) {
  const { lang } = useLang()
  const t = (k: keyof typeof kitchenStrings) => kitchenStrings[k][lang]
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ItemForm>(() => ({
    titleEn: item.title.en,
    titleAr: item.title.ar,
    descEn: item.description.en,
    descAr: item.description.ar,
    price: String(item.price),
    image: item.image ?? "",
    hours: windowsToHours(item.notServedWindows ?? []),
    isAvailable: item.isAvailable !== false,
  }))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const windows = useMemo(() => hoursToWindows(form.hours), [form.hours])

  const reason = getUnavailableReason({
    isAvailable: form.isAvailable,
    notServedWindows: windows,
  })
  const status = reasonLabel(reason, "itemAvailable", lang)

  const patch = (p: Partial<ItemForm>) => setForm((f) => ({ ...f, ...p }))

  function toggleHour(h: number) {
    setForm((f) => ({
      ...f,
      hours: f.hours.includes(h) ? f.hours.filter((x) => x !== h) : [...f.hours, h],
    }))
  }

  async function handleSave() {
    setSaveError(null)
    const price = Number(form.price)
    if (Number.isNaN(price) || price < 0) {
      setSaveError(t("invalidPrice"))
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
      not_served_windows: windows,
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
            <span className={"text-[11px] font-bold " + (reason ? "text-red-400" : "text-gold")}>
              {status}
            </span>
            <span className="text-[11px] text-muted">{form.price}</span>
            {item.modifiers && item.modifiers.length > 0 && (
              <span className="text-[11px] text-muted">· {item.modifiers.length} mod</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={
            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-colors " +
            (saved ? "bg-gold/20 text-gold" : "bg-gold text-bg active:bg-gold/90 disabled:opacity-50")
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

          <Field label={t("timeWindowsLabel")} full>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] leading-relaxed text-muted">{t("notAvailableHint")}</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => patch({ hours: [] })}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-muted transition-colors active:bg-surface-2"
                >
                  {t("hoursReset")}
                </button>
                <button
                  type="button"
                  onClick={() => patch({ hours: [...HOURS] })}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-muted transition-colors active:bg-surface-2"
                >
                  {t("hoursAllDay")}
                </button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-8">
              {HOURS.map((h) => {
                const off = form.hours.includes(h)
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => toggleHour(h)}
                    aria-pressed={off}
                    className={
                      "rounded-lg border py-2 text-xs font-bold transition-colors " +
                      (off
                        ? "border-red-500/60 bg-red-500/20 text-red-300"
                        : "border-border bg-surface-2 text-muted active:bg-surface")
                    }
                  >
                    {pad(h)}
                  </button>
                )
              })}
            </div>

            {windows.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {windows.map((w, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300"
                  >
                    {w.from.slice(0, 5)} – {w.to.slice(0, 5)}
                  </span>
                ))}
              </div>
            )}
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
