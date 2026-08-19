import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { CartLine, Category, Lang, MenuItem, ModifierGroup, NotServedWindow } from "../types"
import { logError } from "./logger"

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Supabase must be configured (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY).
 * There is intentionally NO demo mode / offline fallback: if the env vars are
 * missing every data operation throws, so a misconfigured deployment fails
 * loudly with a generic message instead of showing stale or fake data.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

/** Customer-facing message used whenever the backend is unavailable. */
export const GENERIC_ERROR = "Something went wrong. Please try again."

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null

const R2_PUBLIC_URL = (import.meta.env.VITE_R2_PUBLIC_URL || "").replace(/\/+$/, "")

// Rendered when an image path is rejected (cannot be routed through the CDN
// /storage/* endpoint). A transparent 1x1 GIF: invisible in the UI, never a
// broken-image icon, and never a direct hit on an external origin.
const FALLBACK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

interface CategoryRow {
  id: string
  label_en: string
  label_ar: string
}

interface MenuRow {
  id: string
  category: string
  title_en: string
  title_ar: string
  description_en: string
  description_ar: string
  price: number
  image: string | null
  tag_en: string | null
  tag_ar: string | null
  modifiers: ModifierGroup[]
  not_served_windows: NotServedWindow[] | null
  is_available: boolean
  unavailable_dates: string[] | null
}

interface LocalizedCategoryRow {
  id: string
  label: string
}

interface LocalizedMenuRow {
  id: string
  category: string
  title: string
  description: string
  price: number
  image: string | null
  tag: string | null
  modifiers: ModifierGroup[]
  not_served_windows: NotServedWindow[] | null
  is_available: boolean
  unavailable_dates: string[] | null
}

export interface MenuData {
  categories: Category[]
  menu: MenuItem[]
}

export interface MutationResult {
  ok: boolean
  error?: string
  warning?: string
}

type FetchMenuOptions = boolean | {
  includeUnavailable?: boolean
  lang?: Lang
}

function normalizeFetchMenuOptions(options: FetchMenuOptions = false): {
  includeUnavailable: boolean
  lang?: Lang
} {
  if (typeof options === "boolean") {
    return { includeUnavailable: options }
  }
  return {
    includeUnavailable: options.includeUnavailable ?? false,
    lang: options.lang,
  }
}

function oneLanguage(value: string): { en: string; ar: string } {
  return { en: value, ar: value }
}

export const queryKeys = {
  menu: ["menu"] as const,
  tablesSummary: ["tables-summary"] as const,
  tableOrders: (tableNumber: string) => ["table-orders", tableNumber] as const,
}

/**
 * Builds a public image URL for the menu-images bucket using the R2 public
 * origin. Accepts a bare storage path ("dishes/abc.webp"), a legacy
 * Pages-origin URL, a legacy Supabase storage URL from any project subdomain,
 * or an already-normalized R2 public URL. Uses a strict allowlist: every
 * returned URL is either served from the R2 public origin or is a transparent
 * fallback. External URLs are never passed through, so the browser can never
 * hit an origin outside the CDN directly. Query params/fragments are stripped
 * so URLs stay cacheable.
 */
export function buildPublicImageUrl(storagePath: string): string {
  if (!R2_PUBLIC_URL) {
    return FALLBACK_IMAGE
  }
  const clean = storagePath.trim().split("?")[0].split("#")[0]

  if (clean.startsWith(R2_PUBLIC_URL)) return clean

  if (!/^https?:\/\//i.test(clean)) {
    const path = clean.replace(/^\/+/, "")
    return `${R2_PUBLIC_URL}/${path}`
  }

  const pagesMarker = "/storage/v1/object/public/menu-images/"
  const idx = clean.indexOf(pagesMarker)
  if (idx !== -1) {
    const path = clean.slice(idx + pagesMarker.length).replace(/^\/+/, "")
    return `${R2_PUBLIC_URL}/${path}`
  }

  const supabaseMarker = "/storage/v1/object/public/menu-images/"
  const sIdx = clean.indexOf(supabaseMarker)
  if (sIdx !== -1) {
    const path = clean.slice(sIdx + supabaseMarker.length).replace(/^\/+/, "")
    return `${R2_PUBLIC_URL}/${path}`
  }

  return FALLBACK_IMAGE
}

/**
 * Normalizes an image value from the database to a full public URL.
 * Delegates to buildPublicImageUrl: bare paths get the Pages prefix, legacy
 * Supabase URLs are re-hosted under the Pages origin, and anything that cannot
 * be routed through the CDN is replaced with a transparent fallback.
 */
function publicImageUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  return buildPublicImageUrl(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object")
}

function normalizePublishedMenu(data: unknown): MenuData {
  if (!isRecord(data) || !Array.isArray(data.categories) || !Array.isArray(data.menu)) {
    throw new Error(GENERIC_ERROR)
  }

  const categories: Category[] = data.categories
    .filter(isRecord)
    .map((row) => {
      const label = isRecord(row.label) ? row.label : {}
      return {
        id: String(row.id ?? ""),
        label: {
          en: String(label.en ?? ""),
          ar: String(label.ar ?? ""),
        },
      }
    })
    .filter((row) => row.id)

  const menu: MenuItem[] = data.menu
    .filter(isRecord)
    .map((row) => {
      const title = isRecord(row.title) ? row.title : {}
      const description = isRecord(row.description) ? row.description : {}
      const tag = isRecord(row.tag) ? row.tag : null
      const notServedWindows = Array.isArray(row.notServedWindows)
        ? row.notServedWindows.filter(isRecord).map((w) => ({
            from: String(w.from ?? "").slice(0, 5),
            to: String(w.to ?? "").slice(0, 5),
          })).filter((w) => w.from && w.to)
        : []
      const unavailableDates = Array.isArray(row.unavailableDates)
        ? row.unavailableDates.map(String)
        : []

      return {
        id: String(row.id ?? ""),
        category: String(row.category ?? ""),
        title: {
          en: String(title.en ?? ""),
          ar: String(title.ar ?? ""),
        },
        description: {
          en: String(description.en ?? ""),
          ar: String(description.ar ?? ""),
        },
        price: Number(row.price ?? 0),
        image: typeof row.image === "string" ? publicImageUrl(row.image) : undefined,
        tag: tag ? { en: String(tag.en ?? ""), ar: String(tag.ar ?? "") } : undefined,
        modifiers: Array.isArray(row.modifiers) ? row.modifiers as ModifierGroup[] : [],
        notServedWindows,
        isAvailable: row.isAvailable !== false,
        unavailableDates,
      }
    })
    .filter((row) => row.id && row.category)

  return { categories, menu }
}

async function fetchPublishedMenu(): Promise<MenuData> {
  if (!R2_PUBLIC_URL) {
    throw new Error(GENERIC_ERROR)
  }

  const response = await fetch(`${R2_PUBLIC_URL}/menu.json`, {
    cache: "force-cache",
    headers: { Accept: "application/json" },
  })
  if (!response.ok) {
    throw new Error(GENERIC_ERROR)
  }

  return normalizePublishedMenu(await response.json())
}

function dispatchMenuPublishWarning(message: string | null) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("menu-export-warning", { detail: message }))
}

export async function publishMenuJson(pin: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/r2/export-menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.ok) {
      const error = data?.error ?? `Menu publish failed: ${response.status}`
      dispatchMenuPublishWarning(error)
      return { ok: false, error }
    }
    dispatchMenuPublishWarning(null)
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    dispatchMenuPublishWarning(error)
    return { ok: false, error }
  }
}

async function mutationSuccess(pin: string): Promise<MutationResult> {
  const publish = await publishMenuJson(pin)
  if (publish.ok) return { ok: true }
  return {
    ok: true,
    warning: `Saved in Supabase, but menu.json was not republished: ${publish.error ?? GENERIC_ERROR}`,
  }
}

/**
 * Resolves a secret table token (from a QR code or NFC tag) to its table
 * number. Validated server-side via the resolve_table_token RPC so the full
 * token list is never exposed; unknown tokens return null.
 */
export async function resolveTableToken(token: string): Promise<string | null> {
  if (!token) return null
  if (!supabase) {
    throw new Error(GENERIC_ERROR)
  }
  const { data, error } = await supabase.rpc("resolve_table_token", { p_token: token })
  if (error) throw error
  return (data as string | null) ?? null
}

/**
 * Loads the menu from the `categories` and `menu` tables. There is no offline
 * fallback: if Supabase is not configured this throws so the storefront shows
 * an error instead of stale data.
 *
 * `includeUnavailable` defaults to false so the storefront only sees live
 * dishes. Pass true from staff screens (MenuEditor) so disabled dishes can
 * still be viewed and edited.
 */
export async function fetchMenu(options: FetchMenuOptions = false): Promise<MenuData> {
  const { includeUnavailable, lang } = normalizeFetchMenuOptions(options)

  if (!includeUnavailable) {
    return fetchPublishedMenu()
  }

  if (!supabase) {
    throw new Error(GENERIC_ERROR)
  }

  const menuColumns = lang
    ? `id,category,title:title_${lang},description:description_${lang},price,image,tag:tag_${lang},modifiers,not_served_windows,is_available,unavailable_dates`
    : "id,category,title_en,title_ar,description_en,description_ar,price,image,tag_en,tag_ar,modifiers,not_served_windows,is_available,unavailable_dates"
  const categoryColumns = lang ? `id,label:label_${lang}` : "id,label_en,label_ar"

  const menuQuery = supabase
    .from("menu")
    .select(menuColumns)
    .limit(200)
  if (!includeUnavailable) {
    menuQuery.eq("is_available", true)
  }

  const [cats, items] = await Promise.all([
    supabase
      .from("categories")
      .select(categoryColumns)
      .order("sort_order", { ascending: true }),
    menuQuery,
  ])

  if (cats.error || items.error) {
    throw new Error("Something went wrong. Please try again.")
  }

  const categories: Category[] = lang
    ? (((cats.data ?? []) as unknown) as LocalizedCategoryRow[]).map((r) => ({
        id: r.id,
        label: oneLanguage(r.label),
      }))
    : (((cats.data ?? []) as unknown) as CategoryRow[]).map((r) => ({
        id: r.id,
        label: { en: r.label_en, ar: r.label_ar },
      }))

  const menu: MenuItem[] = lang
    ? (((items.data ?? []) as unknown) as LocalizedMenuRow[]).map((r) => ({
        id: r.id,
        category: r.category,
        title: oneLanguage(r.title),
        description: oneLanguage(r.description),
        price: Number(r.price),
        image: publicImageUrl(r.image),
        tag: r.tag ? oneLanguage(r.tag) : undefined,
        modifiers: r.modifiers,
        notServedWindows: (r.not_served_windows ?? []).map((w) => ({
          from: w.from.slice(0, 5),
          to: w.to.slice(0, 5),
        })),
        isAvailable: r.is_available,
        unavailableDates: r.unavailable_dates ?? [],
      }))
    : (((items.data ?? []) as unknown) as MenuRow[]).map((r) => ({
        id: r.id,
        category: r.category,
        title: { en: r.title_en, ar: r.title_ar },
        description: { en: r.description_en, ar: r.description_ar },
        price: Number(r.price),
        image: publicImageUrl(r.image),
        tag: r.tag_en ? { en: r.tag_en, ar: r.tag_ar ?? "" } : undefined,
        modifiers: r.modifiers,
        notServedWindows: (r.not_served_windows ?? []).map((w) => ({
          from: w.from.slice(0, 5),
          to: w.to.slice(0, 5),
        })),
        isAvailable: r.is_available,
        unavailableDates: r.unavailable_dates ?? [],
      }))

  return { categories, menu }
}

export interface MenuUpdate {
  title_en?: string
  title_ar?: string
  description_en?: string
  description_ar?: string
  price?: number
  image?: string | null
  tag_en?: string | null
  tag_ar?: string | null
  modifiers?: ModifierGroup[]
  not_served_windows?: NotServedWindow[]
  unavailable_dates?: string[]
  is_available?: boolean
}

/**
 * Persists an edited menu row from the kitchen dashboard.
 */
export async function updateMenuItem(
  pin: string,
  id: string,
  updates: MenuUpdate,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: GENERIC_ERROR }
  const { error } = await supabase.rpc("update_menu_item_secure", {
    p_pin: pin,
    p_id: id,
    p_title_en: updates.title_en,
    p_title_ar: updates.title_ar,
    p_description_en: updates.description_en,
    p_description_ar: updates.description_ar,
    p_price: updates.price,
    p_image: updates.image,
    p_not_served_windows: updates.not_served_windows,
    p_is_available: updates.is_available,
    p_modifiers: updates.modifiers,
  })
  if (error) return { ok: false, error: error.message }
  return mutationSuccess(pin)
}

/**
 * Permanently removes a menu item from the database.
 */
export async function deleteMenuItem(
  pin: string,
  id: string,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: GENERIC_ERROR }
  const { error } = await supabase.rpc("delete_menu_item_secure", {
    p_pin: pin,
    p_id: id,
  })
  if (error) return { ok: false, error: error.message }
  return mutationSuccess(pin)
}

export interface MenuInsert {
  id: string
  category: string
  title_en: string
  title_ar: string
  description_en: string
  description_ar: string
  price: number
  image?: string | null
  not_served_windows?: NotServedWindow[]
  is_available?: boolean
  modifiers?: ModifierGroup[]
}

/**
 * Creates a new menu item from the kitchen dashboard.
 */
export async function insertMenuItem(
  pin: string,
  item: MenuInsert,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: GENERIC_ERROR }
  const { error } = await supabase.rpc("insert_menu_item_secure", {
    p_pin: pin,
    p_id: item.id,
    p_category: item.category,
    p_title_en: item.title_en,
    p_title_ar: item.title_ar,
    p_description_en: item.description_en,
    p_description_ar: item.description_ar,
    p_price: item.price,
    p_image: item.image ?? null,
    p_not_served_windows: item.not_served_windows ?? [],
    p_is_available: item.is_available ?? true,
    p_modifiers: item.modifiers ?? [],
  })
  if (error) return { ok: false, error: error.message }
  return mutationSuccess(pin)
}

export interface CategoryInsert {
  id: string
  label_en: string
  label_ar: string
}

/**
 * Creates a new category from the kitchen dashboard.
 */
export async function insertCategory(
  pin: string,
  category: CategoryInsert,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: GENERIC_ERROR }
  const { error } = await supabase.rpc("insert_category_secure", {
    p_pin: pin,
    p_id: category.id,
    p_label_en: category.label_en,
    p_label_ar: category.label_ar,
  })
  if (error) return { ok: false, error: error.message }
  return mutationSuccess(pin)
}

/**
 * Permanently removes a category and all menu items assigned to it.
 */
export async function deleteCategory(
  pin: string,
  id: string,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: GENERIC_ERROR }
  const { error } = await supabase.rpc("delete_category_secure", {
    p_pin: pin,
    p_id: id,
  })
  if (error) return { ok: false, error: error.message }
  return mutationSuccess(pin)
}

export interface OrderPayload {
  table_number: string
  customer_name: string
  notes: string
  payment_method: "waiter"
  local_date: string
  local_time: string
  items: Array<{
    itemId: string
    quantity: number
    modifiers: Array<{ groupId: string; optionId: string }>
  }>
}

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function localTimeKey(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function buildOrderPayload(args: {
  tableNumber: string
  customerName: string
  notes: string
  lines: CartLine[]
}): OrderPayload {
  const MAX_ITEMS = 50
  const MAX_QTY = 99

  if (args.lines.length > MAX_ITEMS) {
    throw new Error(`Maximum ${MAX_ITEMS} items per order`)
  }
  for (const line of args.lines) {
    if (line.quantity > MAX_QTY) {
      throw new Error(`Maximum quantity per item is ${MAX_QTY}`)
    }
  }

  const now = new Date()
  return {
    table_number: args.tableNumber,
    customer_name: args.customerName.trim(),
    notes: args.notes.trim(),
    payment_method: "waiter",
    local_date: localDateKey(now),
    local_time: localTimeKey(now),
    items: args.lines.map((l) => ({
      itemId: l.itemId,
      quantity: l.quantity,
      modifiers: l.modifiers.map((m) => ({
        groupId: m.groupId,
        optionId: m.optionId,
      })),
    })),
  }
}

/**
 * Places an order through the submit_order_secure RPC, which requires a valid
 * table token and derives the table_number server-side, so the public anon key
 * alone can never insert orders. There is no demo/offline fallback.
 */
export async function submitOrder(
  payload: OrderPayload,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) {
    return { ok: false, error: GENERIC_ERROR }
  }

  const { error } = await supabase.rpc("submit_order_secure", {
    p_token: token,
    p_customer_name: payload.customer_name,
    p_notes: payload.notes,
    p_items: payload.items,
    p_local_date: payload.local_date,
    p_local_time: payload.local_time,
  })
  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/**
 * Validates the kitchen PIN using the server-side RPC function.
 * There is intentionally NO client-side fallback secret: if Supabase is not
 * configured the app throws an initialization error instead of accepting a
 * hardcoded PIN.
 */
export async function verifyKitchenPin(pin: string): Promise<boolean> {
  if (!supabase) {
    throw new Error(GENERIC_ERROR)
  }
  const { data, error } = await supabase.rpc("verify_kitchen_pin", { p_pin: pin.trim() })
  if (error) {
    logError(error, "supabase pin-verify")
    return false
  }
  return Boolean(data)
}

/**
 * Updates the kitchen PIN via the server-side RPC.
 * Verifies old PIN, stores new PIN as plain text.
 */
export async function updateKitchenPin(oldPin: string, newPin: string): Promise<boolean> {
  if (!supabase) {
    throw new Error(GENERIC_ERROR)
  }
  const { data, error } = await supabase.rpc("update_kitchen_pin", { p_old_pin: oldPin.trim(), p_new_pin: newPin.trim() })
  if (error) {
    logError(error, "supabase pin-update")
    return false
  }
  return Boolean(data)
}

export interface TableSummary {
  tableNumber: string
  orderCount: number
  total: number
  lastOrderAt: string
}

export async function fetchTablesSummary(): Promise<TableSummary[]> {
  if (!supabase) {
    throw new Error(GENERIC_ERROR)
  }
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from("orders")
    .select("table_number, total, created_at")
    .gte("created_at", oneDayAgo)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)

  const summary = new Map<string, TableSummary>()
  for (const row of (data ?? []) as { table_number: string; total: number; created_at: string }[]) {
    const tn = String(row.table_number).padStart(2, "0")
    const existing = summary.get(tn)
    if (existing) {
      existing.orderCount += 1
      existing.total += Number(row.total)
    } else {
      summary.set(tn, {
        tableNumber: tn,
        orderCount: 1,
        total: Number(row.total),
        lastOrderAt: row.created_at,
      })
    }
  }

  // Fetch the authoritative list of table numbers (server-side RPC) so the
  // dashboard grid stays in sync as tables are added/removed. Falls back to
  // tables seen in recent orders if the RPC isn't available yet.
  let tableNumbers: string[] = []
  if (supabase) {
    const { data: nums, error: numsError } = await supabase.rpc("list_table_numbers")
    if (numsError) {
      logError(numsError, "supabase list-table-numbers")
    } else {
      tableNumbers = (nums ?? []) as string[]
    }
  }
  if (tableNumbers.length === 0) {
    tableNumbers = [...summary.keys()]
  }

  const result: TableSummary[] = tableNumbers.map((tn) => {
    const padded = tn.padStart(2, "0")
    return summary.get(padded) ?? { tableNumber: padded, orderCount: 0, total: 0, lastOrderAt: "" }
  })
  result.sort((a, b) => Number(a.tableNumber) - Number(b.tableNumber))
  return result
}

export async function fetchTableOrders(tableNumber: string): Promise<any[]> {
  if (!supabase) {
    throw new Error(GENERIC_ERROR)
  }
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, table_number, customer_name, notes, payment_method, items, total, paid")
    .eq("table_number", tableNumber)
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function markOrderPaid(
  pin: string,
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: GENERIC_ERROR }
  const { error } = await supabase.rpc("mark_order_paid_secure", {
    p_pin: pin,
    p_order_id: orderId,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
