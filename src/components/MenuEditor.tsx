import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, ReactNode } from "react"
import { ArrowLeft, Check, Edit3, Loader2, Plus, Power, Trash2, UploadCloud, X } from "lucide-react"
import { useLang } from "../lang-context"
import { kitchenStrings } from "../kitchen-i18n"
import { deleteCategory, deleteMenuItem, fetchMenu, insertCategory, insertMenuItem, updateMenuItem, buildPublicImageUrl, queryKeys } from "../lib/supabase"
import { useQueryClient } from "@tanstack/react-query"
import { deleteStorageObject, uploadMenuItemImage } from "../lib/upload"
import { compressImage } from "../lib/images"
import { logError } from "../lib/logger"
import type {
  Category,
  Lang,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  NotServedWindow,
} from "../types"
import { getUnavailableReason, type UnavailableReason } from "../lib/availability"

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/* ── Popup Modal for creating a new category ── */
function CategoryAddModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const { lang } = useLang()
  const t = (k: keyof typeof kitchenStrings) => kitchenStrings[k][lang]

  const [nameEn, setNameEn] = useState("")
  const [nameAr, setNameAr] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    if (!nameEn.trim() || !nameAr.trim()) {
      setError(t("categoryNamesRequired"))
      return
    }
    const id = slugify(nameEn) || "cat-" + uid()
    setSaving(true)
    try {
      const pin = sessionStorage.getItem("kitchenPin")
      if (!pin) {
        setError("Session expired. Please log in again.")
        return
      }
      const res = await insertCategory(pin, {
        id,
        label_en: nameEn.trim(),
        label_ar: nameAr.trim(),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => {
          setSaved(false)
          onCreated()
          onClose()
        }, 600)
      } else {
        setError(res.error ?? "Failed")
      }
    } catch {
      setError("Network error")
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-md rounded-3xl border border-border bg-bg p-6 shadow-2xl shadow-black/50 animate-modal">
        <h2 className="text-lg font-bold text-foreground">{t("addCategory")}</h2>

        <div className="mt-5 flex flex-col gap-4">
          <Field label={t("categoryNameEn")}>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className={inputClass}
              autoFocus
            />
          </Field>
          <Field label={t("categoryNameAr")}>
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              dir="rtl"
              className={inputClass}
            />
          </Field>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border bg-surface px-6 py-3.5 text-sm font-bold text-muted transition-colors active:bg-surface-2"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={
              "flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-bold transition-all " +
              (saved
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-gold text-bg active:bg-gold/90 disabled:opacity-50")
            }
          >
            {saved ? <Check className="h-4 w-4" /> : null}
            {saving ? t("saving") : saved ? t("saved") : t("addCategory")}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Larger input class for elderly-friendly UI ── */
const inputClass =
  "w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-base text-foreground outline-none placeholder:text-muted/60 focus:border-gold focus:ring-1 focus:ring-gold/30 transition-colors"

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
    <label className={"block " + (full ? "col-span-full" : "")}>
      <span className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-muted">
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

/* ── ItemForm interface ── */
interface ItemForm {
  category: string
  titleEn: string
  titleAr: string
  descEn: string
  descAr: string
  price: string
  image: string
  hours: number[]
  isAvailable: boolean
  modifiers: ModifierGroup[]
}

/**
 * Extracts relative storage path from a full Supabase public URL.
 * e.g., "https://.../menu-images/dishes/abc.webp" → "dishes/abc.webp"
 */
function extractStoragePath(url: string): string {
  const r2Marker = `${import.meta.env.VITE_R2_PUBLIC_URL?.replace(/\/+$/, "") || ""}/`
  const pagesMarker = "https://stories-7rn.pages.dev/storage/v1/object/public/menu-images/"
  const supabaseMarker = "/storage/v1/object/public/menu-images/"

  if (!/^https?:\/\//i.test(url)) return url

  const r2Idx = r2Marker ? url.indexOf(r2Marker) : -1
  if (r2Idx !== -1) return url.slice(r2Idx + r2Marker.length)

  const pagesIdx = url.indexOf(pagesMarker)
  if (pagesIdx !== -1) return url.slice(pagesIdx + pagesMarker.length)

  const sbIdx = url.indexOf(supabaseMarker)
  if (sbIdx !== -1) return url.slice(sbIdx + supabaseMarker.length)

  return url
}

/* ── Section Header ── */
function SectionHeader({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border pb-3 mb-4">
      {icon && <span className="text-gold">{icon}</span>}
      <h3 className="text-base font-bold uppercase tracking-widest text-gold">{title}</h3>
    </div>
  )
}

/* ── Modifiers Editor (larger touch targets) ── */
function ModifiersEditor({
  groups,
  onChange,
  t,
}: {
  groups: ModifierGroup[]
  onChange: (groups: ModifierGroup[]) => void
  t: (k: keyof typeof kitchenStrings) => string
}) {
  function updateGroup(gi: number, patch: Partial<ModifierGroup>) {
    onChange(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  }
  function removeGroup(gi: number) {
    onChange(groups.filter((_, i) => i !== gi))
  }
  function addGroup() {
    onChange([
      ...groups,
      { id: uid(), label: { en: "", ar: "" }, type: "single", required: false, options: [] },
    ])
  }
  function updateOption(gi: number, oi: number, patch: Partial<ModifierOption>) {
    onChange(
      groups.map((g, i) =>
        i === gi
          ? { ...g, options: g.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) }
          : g,
      ),
    )
  }
  function removeOption(gi: number, oi: number) {
    onChange(
      groups.map((g, i) =>
        i === gi ? { ...g, options: g.options.filter((_, j) => j !== oi) } : g,
      ),
    )
  }
  function addOption(gi: number) {
    onChange(
      groups.map((g, i) =>
        i === gi
          ? { ...g, options: [...g.options, { id: uid(), label: { en: "", ar: "" } }] }
          : g,
      ),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold uppercase tracking-wide text-muted">
          {t("modifiersLabel")}
        </span>
        <button
          type="button"
          onClick={addGroup}
          className="flex items-center gap-2 rounded-full bg-gold px-4 py-2.5 text-sm font-bold text-bg transition-colors active:bg-gold/90"
        >
          <Plus className="h-4 w-4" />
          {t("addQuestion")}
        </button>
      </div>
      {groups.map((g, gi) => (
        <div key={g.id} className="rounded-2xl border border-border bg-surface-2/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold uppercase tracking-wide text-muted">
              {t("addQuestion").split(" ")[0]} {gi + 1}
            </span>
            <button
              type="button"
              onClick={() => removeGroup(gi)}
              className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300 transition-colors active:bg-red-500/20"
            >
              <Trash2 className="h-4 w-4" />
              {t("removeQuestion")}
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={`${t("titleLabel")} (EN)`}>
              <input
                value={g.label.en}
                onChange={(e) => updateGroup(gi, { label: { ...g.label, en: e.target.value } })}
                className={inputClass}
              />
            </Field>
            <Field label={`${t("titleLabel")} (AR)`}>
              <input
                value={g.label.ar}
                onChange={(e) => updateGroup(gi, { label: { ...g.label, ar: e.target.value } })}
                dir="rtl"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex rounded-full border border-border bg-surface p-1">
              {(["single", "multi"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateGroup(gi, { type })}
                  className={
                    "rounded-full px-4 py-2 text-sm font-bold transition-colors " +
                    (g.type === type ? "bg-gold text-bg" : "text-muted active:bg-surface-2")
                  }
                >
                  {t(type)}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={g.required === true}
                onChange={(e) => updateGroup(gi, { required: e.target.checked })}
                className="h-5 w-5 rounded border-border accent-[#c5a059]"
              />
              {t("requiredToggle")}
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            {g.options.map((o, oi) => (
              <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5">
                <input
                  value={o.label.en}
                  onChange={(e) => updateOption(gi, oi, { label: { ...o.label, en: e.target.value } })}
                  placeholder={t("optionLabelEn")}
                  aria-label={t("optionLabelEn")}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-gold"
                />
                <input
                  value={o.label.ar}
                  onChange={(e) => updateOption(gi, oi, { label: { ...o.label, ar: e.target.value } })}
                  placeholder={t("optionLabelAr")}
                  dir="rtl"
                  aria-label={t("optionLabelAr")}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-gold"
                />
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={o.price ?? ""}
                  onChange={(e) =>
                    updateOption(gi, oi, {
                      price: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  placeholder={t("optionPriceLabel")}
                  aria-label={t("optionPriceLabel")}
                  className="w-24 shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-gold"
                />
                <button
                  type="button"
                  onClick={() => removeOption(gi, oi)}
                  aria-label={t("removeOption")}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-red-500/30 bg-red-500/10 text-red-300 active:bg-red-500/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {g.options.length === 0 && <p className="text-sm text-muted py-2">{t("noOptions")}</p>}
            <button
              type="button"
              onClick={() => addOption(gi)}
              className="flex items-center gap-1.5 self-start rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-muted transition-colors active:bg-surface-2"
            >
              <Plus className="h-4 w-4" />
              {t("addOption")}
            </button>
          </div>
        </div>
      ))}

    </div>
  )
}

/* ── Popup Modal for editing or creating a single item ── */
function ItemEditModal({
  item,
  onClose,
  onDeleted,
  mode = "edit",
  onCreated,
  categories,
}: {
  item: MenuItem
  onClose: () => void
  onDeleted: () => void
  mode?: "edit" | "create"
  onCreated?: () => void
  categories: Category[]
}) {
  const { lang } = useLang()
  const t = (k: keyof typeof kitchenStrings) => kitchenStrings[k][lang]

  const [form, setForm] = useState<ItemForm>(() => ({
    category: item.category,
    titleEn: item.title.en,
    titleAr: item.title.ar,
    descEn: item.description.en,
    descAr: item.description.ar,
    price: String(item.price),
    image: item.image ?? "",
    hours: windowsToHours(item.notServedWindows ?? []),
    isAvailable: item.isAvailable !== false,
    modifiers: (item.modifiers ?? []).map((g) => ({
      ...g,
      label: { ...g.label },
      options: g.options.map((o) => ({ ...o, label: { ...o.label } })),
    })),
  }))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [stagedImage, setStagedImage] = useState<{ url: string; path: string; blob: Blob } | null>(null)

  const windows = useMemo(() => hoursToWindows(form.hours), [form.hours])

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
    // Path of the blob uploaded in this save. Removed again if the RPC fails
    // so a failed save never leaks an orphaned storage object.
    let uploadedPath: string | undefined
    try {
      const pin = sessionStorage.getItem("kitchenPin")
      if (!pin) {
        setSaveError("Session expired. Please log in again.")
        return
      }

      let imageToSave = form.image.trim() || null
      let oldImagePath: string | undefined

      if (stagedImage) {
        const result = await uploadMenuItemImage(stagedImage.blob, item.id, item.image)
        if (!result.ok) {
          setSaveError(result.error ?? "Upload failed")
          return
        }
        uploadedPath = result.path
        imageToSave = result.path!
        oldImagePath = result.oldPath
      }

      const fields = {
        title_en: form.titleEn,
        title_ar: form.titleAr,
        description_en: form.descEn,
        description_ar: form.descAr,
        price,
        image: imageToSave,
        not_served_windows: windows,
        is_available: form.isAvailable,
        modifiers: form.modifiers,
      }
      const res =
        mode === "create"
          ? await insertMenuItem(pin, { id: item.id, category: form.category, ...fields })
          : await updateMenuItem(pin, item.id, fields)
      if (res.ok) {
        // Clean up old storage object if image changed
        if (oldImagePath && oldImagePath !== imageToSave) {
          const del = await deleteStorageObject(oldImagePath)
          if (!del.ok) logError(del.error, "menu-editor delete-old-image")
        }
        // Revoke preview URL
        if (stagedImage) {
          URL.revokeObjectURL(stagedImage.url)
          setStagedImage(null)
        }
        setSaved(true)
        setTimeout(() => {
          setSaved(false)
          if (mode === "create") onCreated?.()
          onClose()
        }, 800)
      } else {
        setSaveError(res.error ?? "Failed")
        // The freshly-uploaded blob is unreferenced — remove it.
        if (uploadedPath) await deleteStorageObject(uploadedPath)
      }
    } catch {
      setSaveError("Network error")
      // The freshly-uploaded blob is unreferenced — remove it.
      if (uploadedPath) await deleteStorageObject(uploadedPath)
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadImage(file: File) {
    setUploadError(null)
    setUploading(true)
    try {
      const { blob, ext } = await compressImage(file)
      const safeItem = item.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "misc"
      const path = `dishes/${safeItem}-${Date.now()}.${ext}`
      const previewUrl = URL.createObjectURL(blob)
      setStagedImage({ url: previewUrl, path, blob })
      patch({ image: previewUrl })
    } catch {
      setUploadError("Failed to process image")
    } finally {
      setUploading(false)
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) void handleUploadImage(f)
    e.target.value = ""
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const pin = sessionStorage.getItem("kitchenPin")
      if (!pin) {
        setSaveError("Session expired. Please log in again.")
        return
      }
      const res = await deleteMenuItem(pin, item.id)
      if (res.ok) {
        // Delete storage asset AFTER successful DB deletion
        if (item.image) {
          const del = await deleteStorageObject(extractStoragePath(item.image))
          if (!del.ok) logError(del.error, "menu-editor delete-image")
        }
        setSaveError(null)
        onDeleted()
        onClose()
      } else {
        setSaveError(res.error ?? "Failed")
        setConfirmingDelete(false)
      }
    } catch {
      setSaveError("Network error")
    } finally {
      setDeleting(false)
    }
  }

  /* Close on Escape */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  /* Prevent body scroll while modal is open */
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
      if (stagedImage) {
        URL.revokeObjectURL(stagedImage.url)
      }
    }
  }, [stagedImage])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center animate-backdrop">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative mx-4 mt-6 mb-6 flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col rounded-3xl border border-border bg-bg shadow-2xl shadow-black/50 animate-modal">
        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-foreground">
              {t(mode === "create" ? "addItem" : "editItem")}
            </h2>
            {mode === "edit" && (
              <p className="mt-0.5 truncate text-sm text-muted">
                {item.title.en} — {item.title.ar}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-2 active:bg-surface-2"
            aria-label={t("close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

         {/* ── Scrollable Content ── */}
         <div className="no-scrollbar flex-1 overflow-y-auto px-6 py-5 space-y-8">
          {/* Section 1: Basic Info */}
          <section>
            <SectionHeader title={t("basicInfo")} />
            <div className="grid gap-4 sm:grid-cols-2">
              {mode === "create" && (
                <Field label={t("category")} full>
                  <select
                    value={form.category}
                    onChange={(e) => patch({ category: e.target.value })}
                    className={inputClass}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label.en} — {c.label.ar}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
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
                  className={inputClass + " resize-none"}
                />
              </Field>
              <Field label={`${t("descriptionLabel")} (AR)`} full>
                <textarea
                  rows={2}
                  value={form.descAr}
                  onChange={(e) => patch({ descAr: e.target.value })}
                  dir="rtl"
                  className={inputClass + " resize-none"}
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
              <Field label={t("imageLabel")} full>
                <div className="flex flex-wrap items-center gap-3">
                  {form.image ? (
                    <img
                      src={stagedImage ? stagedImage.url : buildPublicImageUrl(form.image)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-20 w-20 shrink-0 rounded-xl border border-gold/25 object-cover"
                    />
                  ) : (
                    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border border-dashed border-border bg-surface-2 text-center text-[10px] text-muted">
                      {t("noImage")}
                    </div>
                  )}

                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <label
                      className={
                        "inline-flex w-fit cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors " +
                        (uploading
                          ? "bg-gold/30 text-gold"
                          : "bg-gold text-bg active:bg-gold/90")
                      }
                    >
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploading}
                        onChange={onFileChange}
                      />
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UploadCloud className="h-4 w-4" />
                      )}
                      {uploading ? t("uploading") : t("uploadPhoto")}
                    </label>
                    {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
                  </div>
                </div>
              </Field>
            </div>
          </section>

          {/* Section 2: Availability */}
          <section>
            <SectionHeader title={t("availability")} />

            {mode === "create" && (
              <button
                type="button"
                onClick={() => patch({ isAvailable: !form.isAvailable })}
                className={
                  "mb-5 flex w-full items-center justify-between rounded-2xl border-2 px-5 py-4 text-left transition-colors " +
                  (form.isAvailable
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border-red-500/50 bg-red-500/10")
                }
              >
                <div className="flex items-center gap-3">
                  <Power className={"h-6 w-6 " + (form.isAvailable ? "text-emerald-400" : "text-red-400")} />
                  <span className={"text-base font-bold " + (form.isAvailable ? "text-emerald-300" : "text-red-300")}>
                    {form.isAvailable ? t("itemAvailable") : t("itemUnavailable")}
                  </span>
                </div>
                <div
                  className={
                    "relative h-8 w-14 rounded-full transition-colors " +
                    (form.isAvailable ? "bg-emerald-500" : "bg-red-500/60")
                  }
                >
                  <div
                    className={
                      "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all " +
                      (form.isAvailable ? "left-7" : "left-1")
                    }
                  />
                </div>
              </button>
            )}

            {/* Time windows */}
            <Field label={t("timeWindowsLabel")} full>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-sm leading-relaxed text-muted">{t("notAvailableHint")}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => patch({ hours: [] })}
                    className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-muted transition-colors active:bg-surface-2"
                  >
                    {t("hoursReset")}
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ hours: [...HOURS] })}
                    className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-muted transition-colors active:bg-surface-2"
                  >
                    {t("hoursAllDay")}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                {HOURS.map((h) => {
                  const off = form.hours.includes(h)
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => toggleHour(h)}
                      aria-pressed={off}
                      className={
                        "rounded-xl border py-3 text-sm font-bold transition-colors " +
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
                <div className="mt-3 flex flex-wrap gap-2">
                  {windows.map((w, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-300"
                    >
                      {w.from.slice(0, 5)} – {w.to.slice(0, 5)}
                    </span>
                  ))}
                </div>
              )}
            </Field>
          </section>

          {/* Section 3: Modifiers */}
          <section>
            <SectionHeader title={t("questionsAndOptions")} />
            <div className="rounded-2xl border border-border bg-surface-2/40 p-4">
              <ModifiersEditor
                groups={form.modifiers}
                onChange={(modifiers) => patch({ modifiers })}
                t={t}
              />
            </div>
          </section>

          {/* Section 4: Danger Zone */}
          {mode === "edit" && (
            <section>
              <SectionHeader title={t("dangerZone")} />
              <div className="rounded-2xl border-2 border-red-500/30 bg-red-500/5 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-bold text-red-300">{t("deleteItem")}</p>
                    <p className="mt-1 text-sm text-red-300/70">{t("deleteItemHint")}</p>
                  </div>
                  {confirmingDelete ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        className="rounded-full border border-border bg-surface px-5 py-3 text-sm font-bold text-muted transition-colors active:bg-surface-2"
                      >
                        {t("cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex items-center gap-2 rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white transition-colors active:bg-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deleting ? t("deleting") : t("confirmDelete")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      className="flex shrink-0 items-center gap-2 rounded-full border-2 border-red-500/40 bg-red-500/10 px-5 py-3 text-sm font-bold text-red-300 transition-colors active:bg-red-500/20"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("deleteItem")}
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* ── Sticky Footer ── */}
        <div className="shrink-0 border-t border-border bg-bg px-6 py-4">
          {saveError && (
            <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400">
              {saveError}
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border bg-surface px-6 py-3.5 text-sm font-bold text-muted transition-colors hover:bg-surface-2 active:bg-surface-2"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={
                "flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-bold transition-all " +
                (saved
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-gold text-bg active:bg-gold/90 disabled:opacity-50")
              }
            >
              {saved ? <Check className="h-4 w-4" /> : null}
              {saving ? t("saving") : saved ? t("saved") : t("save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Item Card (replaces old ItemRow) ── */
function ItemCard({
  item,
  onDeleted,
  onAvailabilityUpdated,
  categories,
}: {
  item: MenuItem
  onDeleted: () => void
  onAvailabilityUpdated: (id: string, isAvailable: boolean) => void
  categories: Category[]
}) {
  const { lang } = useLang()
  const t = (k: keyof typeof kitchenStrings) => kitchenStrings[k][lang]
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const availabilityRequestRef = useRef(false)

  const reason = getUnavailableReason({
    isAvailable: item.isAvailable,
    notServedWindows: item.notServedWindows,
    unavailableDates: item.unavailableDates,
  })
  const status = reasonLabel(reason, "itemAvailable", lang)
  const isOff = reason !== null
  const isManuallyAvailable = item.isAvailable !== false

  async function handleQuickAvailabilityToggle() {
    if (availabilityRequestRef.current) return
    const nextAvailable = !isManuallyAvailable
    availabilityRequestRef.current = true
    setAvailabilitySaving(true)
    setAvailabilityError(null)
    try {
      const pin = sessionStorage.getItem("kitchenPin")
      if (!pin) {
        setAvailabilityError("Session expired. Please log in again.")
        return
      }
      const res = await updateMenuItem(pin, item.id, {
        title_en: item.title.en,
        title_ar: item.title.ar,
        description_en: item.description.en,
        description_ar: item.description.ar,
        price: item.price,
        image: item.image ?? null,
        not_served_windows: item.notServedWindows ?? [],
        is_available: nextAvailable,
        modifiers: item.modifiers ?? [],
      })
      if (!res.ok) {
        setAvailabilityError(res.error ?? t("availabilityUpdateFailed"))
        return
      }
      onAvailabilityUpdated(item.id, nextAvailable)
      queryClient.invalidateQueries({ queryKey: queryKeys.menu })
    } catch {
      setAvailabilityError(t("availabilityUpdateFailed"))
    } finally {
      availabilityRequestRef.current = false
      setAvailabilitySaving(false)
    }
  }

  return (
    <>
      <div className="px-5 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {/* Thumbnail */}
            {item.image && (
              <img
                src={buildPublicImageUrl(item.image)}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-16 w-16 shrink-0 rounded-2xl border border-gold/25 object-cover"
              />
            )}

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-foreground">
                {item.title[lang]}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted">
                {lang === "ar" ? item.title.en : item.title.ar}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {/* Status badge */}
                <span
                  className={
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold " +
                    (isOff
                      ? "border border-red-500/40 bg-red-500/15 text-red-300"
                      : "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300")
                  }
                >
                  <span className={"inline-block h-2 w-2 rounded-full " + (isOff ? "bg-red-400" : "bg-emerald-400")} />
                  {status}
                </span>
                {/* Price */}
                <span className="text-sm font-bold text-gold">{item.price}</span>
                {/* Modifier count */}
                {item.modifiers && item.modifiers.length > 0 && (
                  <span className="text-xs font-medium text-muted">
                    · {item.modifiers.length} mod
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={handleQuickAvailabilityToggle}
              disabled={availabilitySaving}
              aria-pressed={isManuallyAvailable}
              aria-label={t("toggleAvailability")}
              title={t("toggleAvailability")}
              className={
                "flex h-12 min-w-[7.5rem] flex-1 items-center justify-between rounded-full border px-2 transition-all disabled:cursor-not-allowed disabled:opacity-70 sm:w-32 sm:flex-none " +
                (isManuallyAvailable
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                  : "border-red-500/50 bg-red-500/15 text-red-300")
              }
            >
              <span
                className={
                  "grid h-8 w-8 place-items-center rounded-full transition-colors " +
                  (isManuallyAvailable ? "bg-emerald-500 text-bg" : "bg-red-500 text-white")
                }
              >
                {availabilitySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1 text-center text-xs font-bold">
                {isManuallyAvailable ? t("itemAvailable") : t("itemUnavailable")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-gold px-5 text-sm font-bold text-bg transition-all active:scale-[0.97] active:bg-gold/90 sm:flex-none"
            >
              <Edit3 className="h-4 w-4" />
              {t("editItem")}
            </button>
          </div>
        </div>
        {availabilityError && (
          <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400">
            {availabilityError}
          </p>
        )}
      </div>

      {/* Edit Modal */}
      {modalOpen && (
        <ItemEditModal
          item={item}
          onClose={() => setModalOpen(false)}
          onDeleted={onDeleted}
          categories={categories}
        />
      )}
    </>
  )
}

/* ── Main MenuEditor ── */
export default function MenuEditor({ onBack }: { onBack: () => void }) {
  const { lang } = useLang()
  const t = (k: keyof typeof kitchenStrings) => kitchenStrings[k][lang]
  const queryClient = useQueryClient()

  const [data, setData] = useState<{ categories: Category[]; menu: MenuItem[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState<MenuItem | null>(null)
  const [addingCategory, setAddingCategory] = useState(false)
  const [confirmingDeleteCat, setConfirmingDeleteCat] = useState<string | null>(null)
  const [catError, setCatError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchMenu(true)
      .then((d) => {
        setData(d)
        setError(null)
        setLoading(false)
        queryClient.invalidateQueries({ queryKey: queryKeys.menu })
      })
      .catch((e: unknown) => {
        logError(e, "menu-editor load")
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
  }, [queryClient])

  useEffect(() => {
    load()
  }, [load])

  async function handleDeleteCategory(id: string) {
    setCatError(null)
    try {
      const pin = sessionStorage.getItem("kitchenPin")
      if (!pin) {
        setCatError("Session expired. Please log in again.")
        return
      }
      // Collect image URLs for items in this category before deletion
      const itemsInCategory = data?.menu.filter((m) => m.category === id) ?? []
      const imagePaths = itemsInCategory
        .filter((item) => item.image)
        .map((item) => extractStoragePath(item.image!))
      const res = await deleteCategory(pin, id)
      if (res.ok) {
        // Delete storage assets AFTER successful category deletion
        for (const path of imagePaths) {
          const del = await deleteStorageObject(path)
          if (!del.ok) logError(del.error, "menu-editor delete-category-image")
        }
        setConfirmingDeleteCat(null)
        load()
      } else {
        setCatError(res.error ?? "Failed")
        setConfirmingDeleteCat(null)
      }
    } catch {
      setCatError("Network error")
      setConfirmingDeleteCat(null)
    }
  }

  const handleAvailabilityUpdated = useCallback((id: string, isAvailable: boolean) => {
    setData((current) => {
      if (!current) return current
      return {
        ...current,
        menu: current.menu.map((item) =>
          item.id === id ? { ...item, isAvailable } : item,
        ),
      }
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
      <main className="mx-auto max-w-5xl px-4 py-20 text-center text-base text-muted">
        {t("loading")}
      </main>
    )
  }
  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-20 text-center text-base text-red-400">{error}</main>
    )
  }
  if (!data) return null

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold uppercase tracking-[0.2em] text-gold">{t("menuEditor")}</h2>
<div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddingCategory(true)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-muted transition-colors active:bg-surface-2"
          >
            <Plus className="h-4 w-4" />
            {t("addCategory")}
          </button>
          <button
            type="button"
            onClick={() =>
              setCreating({
                id: "new-" + uid(),
                category: data.categories[0]?.id ?? "",
                title: { en: "", ar: "" },
                description: { en: "", ar: "" },
                price: 0,
                modifiers: [],
                isAvailable: true,
              })
            }
            className="flex items-center gap-1.5 rounded-full border border-gold/40 px-4 py-2 text-sm font-bold text-gold transition-colors active:bg-gold/10"
          >
            <Plus className="h-4 w-4" />
            {t("addItem")}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-muted transition-colors active:bg-surface-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToOrders")}
          </button>
        </div>
      </div>

      {catError && (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-red-400">{catError}</p>
          <button
            type="button"
            onClick={() => setCatError(null)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-muted active:bg-surface-2"
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-6">
        {grouped.map((cat) => (
          <section key={cat.id}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-base font-bold uppercase tracking-widest text-foreground">
                <span className="text-gold">{cat.label[lang]}</span>
                <span className="text-sm font-medium text-muted">({cat.items.length})</span>
              </h3>
              {confirmingDeleteCat === cat.id ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs font-semibold text-red-300 sm:inline">
                    {t("deleteCategoryConfirm")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteCat(null)}
                    className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-muted transition-colors active:bg-surface-2"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteCategory(cat.id)}
                    className="flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white transition-colors active:bg-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("confirmDelete")}
                  </button>
                </div>
               ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteCat(cat.id)}
                    aria-label={t("deleteCategory")}
                    title={t("deleteCategory")}
                    className="grid h-9 w-9 place-items-center rounded-full border border-red-500/40 bg-red-500/10 text-red-300 transition-colors active:bg-red-500/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="mt-3 divide-y divide-border rounded-3xl border border-border bg-surface/40">
              {cat.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onDeleted={load}
                  onAvailabilityUpdated={handleAvailabilityUpdated}
                  categories={data.categories}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {creating && (
        <ItemEditModal
          item={creating}
          mode="create"
          onClose={() => setCreating(null)}
          onDeleted={() => setCreating(null)}
          onCreated={load}
          categories={data.categories}
        />
      )}

      {addingCategory && (
        <CategoryAddModal onClose={() => setAddingCategory(false)} onCreated={load} />
      )}
    </main>
  )
}
