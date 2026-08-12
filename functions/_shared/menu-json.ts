export interface CategoryRow {
  id: string
  label_en: string
  label_ar: string
}

export interface MenuRow {
  id: string
  category: string
  title_en: string
  title_ar: string
  description_en: string
  description_ar: string
  price: number | string
  image: string | null
  tag_en: string | null
  tag_ar: string | null
  modifiers: unknown
  not_served_windows: unknown
  is_available: boolean
  unavailable_dates: string[] | null
}

export interface MenuPayload {
  categories: Array<{
    id: string
    label: { en: string; ar: string }
  }>
  menu: Array<{
    id: string
    category: string
    title: { en: string; ar: string }
    description: { en: string; ar: string }
    price: number
    image?: string
    tag?: { en: string; ar: string }
    modifiers?: unknown
    notServedWindows?: Array<{ from: string; to: string }>
    isAvailable?: boolean
    unavailableDates?: string[]
  }>
}

function normalizeImage(value: string | null | undefined, r2PublicUrl: string): string | undefined {
  if (!value) return undefined
  const clean = value.trim().split("?")[0].split("#")[0]
  const publicUrl = r2PublicUrl.replace(/\/+$/, "")

  if (!publicUrl) return clean || undefined
  if (clean.startsWith(publicUrl)) return clean
  if (!/^https?:\/\//i.test(clean)) return `${publicUrl}/${clean.replace(/^\/+/, "")}`

  const marker = "/storage/v1/object/public/menu-images/"
  const idx = clean.indexOf(marker)
  if (idx !== -1) {
    return `${publicUrl}/${clean.slice(idx + marker.length).replace(/^\/+/, "")}`
  }

  return clean
}

function normalizeWindows(value: unknown): Array<{ from: string; to: string }> {
  if (!Array.isArray(value)) return []
  return value
    .map((window) => {
      if (!window || typeof window !== "object") return null
      const from = "from" in window ? String(window.from).slice(0, 5) : ""
      const to = "to" in window ? String(window.to).slice(0, 5) : ""
      return from && to ? { from, to } : null
    })
    .filter((window): window is { from: string; to: string } => Boolean(window))
}

export function formatMenuPayload(
  categories: CategoryRow[],
  menuRows: MenuRow[],
  r2PublicUrl: string,
): MenuPayload {
  return {
    categories: categories.map((row) => ({
      id: row.id,
      label: { en: row.label_en, ar: row.label_ar },
    })),
    menu: menuRows.map((row) => {
      const image = normalizeImage(row.image, r2PublicUrl)
      const tag = row.tag_en ? { en: row.tag_en, ar: row.tag_ar ?? "" } : undefined

      return {
        id: row.id,
        category: row.category,
        title: { en: row.title_en, ar: row.title_ar },
        description: { en: row.description_en, ar: row.description_ar },
        price: Number(row.price),
        ...(image ? { image } : {}),
        ...(tag ? { tag } : {}),
        modifiers: Array.isArray(row.modifiers) ? row.modifiers : [],
        notServedWindows: normalizeWindows(row.not_served_windows),
        isAvailable: row.is_available,
        unavailableDates: row.unavailable_dates ?? [],
      }
    }),
  }
}

