import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { CartLine, Category, MenuItem, ModifierGroup, NotServedWindow } from "../types"

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Supabase is optional until you fill in the .env values.
 * When the env vars are missing we fall back to "demo mode" and
 * simply log the payload instead of inserting a row.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null

// The Pages deployment acts as our CDN/proxy for Supabase storage.
const PAGES_ORIGIN = "https://stories-7rn.pages.dev"

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

export interface MenuData {
  categories: Category[]
  menu: MenuItem[]
}

export const queryKeys = {
  menu: ["menu"] as const,
  tablesSummary: ["tables-summary"] as const,
  tableOrders: (tableNumber: string) => ["table-orders", tableNumber] as const,
}

/**
 * Builds a public image URL for the menu-images bucket using the Pages origin.
 * Accepts a bare storage path ("dishes/abc.webp"), a legacy Supabase storage URL
 * from any project subdomain, or an already-normalized Pages URL. Always returns
 * a clean, cacheable Pages-origin URL (query params/fragments stripped) so the
 * browser never loads from supabase.co directly.
 */
export function buildPublicImageUrl(storagePath: string): string {
  const clean = storagePath.trim().split("?")[0].split("#")[0]

  // Already a Pages-origin URL — pass through.
  if (clean.startsWith(PAGES_ORIGIN)) return clean

  // Bare storage path (new staged uploads) — prefix with Pages origin.
  if (!/^https?:\/\//i.test(clean)) {
    const path = clean.replace(/^\/+/, "")
    const renderedUrl = `${PAGES_ORIGIN}/storage/v1/object/public/menu-images/${path}`
    console.log("[CDN DEBUG]", renderedUrl)
    return renderedUrl
  }

  // Any Supabase storage URL (any subdomain) — extract the object path and
  // re-host it under the Pages origin.
  const marker = "/storage/v1/object/public/menu-images/"
  const idx = clean.indexOf(marker)
  if (idx !== -1) {
    const path = clean.slice(idx + marker.length).replace(/^\/+/, "")
    const renderedUrl = `${PAGES_ORIGIN}${marker}${path}`
    console.log("[CDN DEBUG]", renderedUrl)
    return renderedUrl
  }

  // Other absolute URL — pass through as-is.
  return clean
}

/**
 * Normalizes an image value from the database to a full public URL.
 * Delegates to buildPublicImageUrl: bare paths get the Pages prefix, legacy
 * Supabase URLs are re-hosted under the Pages origin, everything else passes
 * through.
 */
function publicImageUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  return buildPublicImageUrl(value)
}

/**
 * Resolves a secret table token (from a QR code or NFC tag) to its table
 * number. Validated server-side via the resolve_table_token RPC so the full
 * token list is never exposed; unknown tokens return null. In demo mode (no
 * Supabase) it checks the bundled public/tables.json.
 */
export async function resolveTableToken(token: string): Promise<string | null> {
  if (!token) return null
  if (supabase) {
    const { data, error } = await supabase.rpc("resolve_table_token", { p_token: token })
    if (error) throw error
    return (data as string | null) ?? null
  }
  const res = await fetch("/tables.json")
  if (!res.ok) throw new Error("Failed to load table data")
  const data: { tables: { table: number; token: string }[] } = await res.json()
  const found = data.tables.find((t) => t.token === token)
  return found ? String(found.table).padStart(2, "0") : null
}

/**
 * Loads the menu. When Supabase is configured it reads the `categories` and
 * `menu` tables; otherwise it falls back to the bundled public/menu.json so
 * the app still works without credentials (demo mode).
 *
 * `includeUnavailable` defaults to false so the storefront only sees live
 * dishes. Pass true from staff screens (MenuEditor) so disabled dishes can
 * still be viewed and edited.
 */
export async function fetchMenu(includeUnavailable = false): Promise<MenuData> {
  if (!supabase) {
    const res = await fetch("/menu.json")
    if (!res.ok) throw new Error("Failed to load menu data")
    const data = (await res.json()) as MenuData
    return {
      categories: data.categories,
      menu: data.menu.map((i) => (i.image ? { ...i, image: buildPublicImageUrl(i.image) } : i)),
    }
  }

  const menuQuery = supabase
    .from("menu")
    .select(
      "id,category,title_en,title_ar,description_en,description_ar,price,image,tag_en,tag_ar,modifiers,not_served_windows,is_available,unavailable_dates",
    )
    .limit(200)
  if (!includeUnavailable) {
    menuQuery.eq("is_available", true)
  }

  const [cats, items] = await Promise.all([
    supabase
      .from("categories")
      .select("id,label_en,label_ar")
      .order("sort_order", { ascending: true }),
    menuQuery,
  ])

  if (cats.error) throw new Error(cats.error.message)
  if (items.error) throw new Error(items.error.message)

  const categories: Category[] = ((cats.data ?? []) as CategoryRow[]).map((r) => ({
    id: r.id,
    label: { en: r.label_en, ar: r.label_ar },
  }))

  const menu: MenuItem[] = ((items.data ?? []) as MenuRow[]).map((r) => ({
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
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" }
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
  return { ok: true }
}

/**
 * Permanently removes a menu item from the database.
 */
export async function deleteMenuItem(
  pin: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" }
  const { error } = await supabase.rpc("delete_menu_item_secure", {
    p_pin: pin,
    p_id: id,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
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
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" }
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
  return { ok: true }
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
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" }
  const { error } = await supabase.rpc("insert_category_secure", {
    p_pin: pin,
    p_id: category.id,
    p_label_en: category.label_en,
    p_label_ar: category.label_ar,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Permanently removes a category and all menu items assigned to it.
 */
export async function deleteCategory(
  pin: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" }
  const { error } = await supabase.rpc("delete_category_secure", {
    p_pin: pin,
    p_id: id,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
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
 * Sends the order to Supabase when configured, otherwise resolves in demo mode.
 * The order is placed through the submit_order_secure RPC, which requires a
 * valid table token and derives the table_number server-side, so the public
 * anon key alone can never insert orders.
 */
export async function submitOrder(
  payload: OrderPayload,
  token: string,
): Promise<{ ok: boolean; demo: boolean; error?: string }> {
  if (!supabase) {
    console.log("[v0] Demo order (Supabase not configured):", payload)
    // Simulate network latency for a realistic UX in demo mode.
    await new Promise((r) => setTimeout(r, 700))
    return { ok: true, demo: true }
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
    console.log("[v0] Supabase insert error:", error.message)
    return { ok: false, demo: false, error: error.message }
  }
  return { ok: true, demo: false }
}

/**
 * Validates the kitchen PIN using the server-side RPC function.
 * In demo mode, checks against "2026".
 */
export async function verifyKitchenPin(pin: string): Promise<boolean> {
  if (!supabase) {
    return pin === "2026"
  }
  const { data, error } = await supabase.rpc("verify_kitchen_pin", { p_pin: pin.trim() })
  if (error) {
    console.error("[supabase] PIN verify error:", error.message)
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
    // Demo mode: no-op success
    return true
  }
  const { data, error } = await supabase.rpc("update_kitchen_pin", { p_old_pin: oldPin.trim(), p_new_pin: newPin.trim() })
  if (error) {
    console.error("[supabase] PIN update error:", error.message)
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
  if (!supabase) return []
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

  const result: TableSummary[] = []
  for (let i = 1; i <= 15; i++) {
    const tn = String(i).padStart(2, "0")
    const existing = summary.get(tn)
    result.push(existing ?? { tableNumber: tn, orderCount: 0, total: 0, lastOrderAt: "" })
  }
  return result
}

export async function fetchTableOrders(tableNumber: string): Promise<any[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("table_number", tableNumber)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function clearTableOrders(
  pin: string,
  tableNumber: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" }
  const { error } = await supabase.rpc("clear_table_orders_secure", {
    p_pin: pin,
    p_table_number: tableNumber,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function markOrderPaid(
  pin: string,
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" }
  const { error } = await supabase.rpc("mark_order_paid_secure", {
    p_pin: pin,
    p_order_id: orderId,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
