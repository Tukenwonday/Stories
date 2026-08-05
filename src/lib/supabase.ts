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

/**
 * Loads the menu. When Supabase is configured it reads the `categories` and
 * `menu` tables; otherwise it falls back to the bundled public/menu.json so
 * the app still works without credentials (demo mode).
 */
export async function fetchMenu(): Promise<MenuData> {
  if (!supabase) {
    const res = await fetch("/menu.json")
    if (!res.ok) throw new Error("Failed to load menu data")
    return (await res.json()) as MenuData
  }

  const [cats, items] = await Promise.all([
    supabase
      .from("categories")
      .select("id,label_en,label_ar")
      .order("sort_order", { ascending: true }),
    supabase
      .from("menu")
      .select(
        "id,category,title_en,title_ar,description_en,description_ar,price,image,tag_en,tag_ar,modifiers,not_served_windows,is_available,unavailable_dates",
      ),
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
    image: r.image ?? undefined,
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

export interface OrderPayload {
  table_number: string
  customer_name: string
  notes: string
  payment_method: "waiter"
  items: Array<{
    itemId: string
    title: string
    quantity: number
    unitPrice: number
    modifiers: Array<{ group: string; option: string; price: number }>
  }>
  total: number
}

export function buildOrderPayload(args: {
  tableNumber: string
  customerName: string
  notes: string
  lines: CartLine[]
  total: number
}): OrderPayload {
  return {
    table_number: args.tableNumber,
    customer_name: args.customerName.trim(),
    notes: args.notes.trim(),
    payment_method: "waiter",
    total: args.total,
    items: args.lines.map((l) => ({
      itemId: l.itemId,
      title: l.title.en,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      modifiers: l.modifiers.map((m) => ({
        group: m.groupLabel.en,
        option: m.optionLabel.en,
        price: m.price,
      })),
    })),
  }
}

/**
 * Sends the order to Supabase when configured, otherwise resolves in demo mode.
 */
export async function submitOrder(payload: OrderPayload): Promise<{ ok: boolean; demo: boolean; error?: string }> {
  if (!supabase) {
    console.log("[v0] Demo order (Supabase not configured):", payload)
    // Simulate network latency for a realistic UX in demo mode.
    await new Promise((r) => setTimeout(r, 700))
    return { ok: true, demo: true }
  }

  const { error } = await supabase.from("orders").insert(payload)
  if (error) {
    console.log("[v0] Supabase insert error:", error.message)
    return { ok: false, demo: false, error: error.message }
  }
  return { ok: true, demo: false }
}

/**
 * Validates the kitchen PIN securely using the server-side RPC function.
 * In demo mode, checks against "2026".
 */
export async function verifyKitchenPin(pin: string): Promise<boolean> {
  if (!supabase) {
    return pin === "2026"
  }
  const { data, error } = await supabase.rpc("verify_kitchen_pin", { p_pin: pin })
  if (error) {
    console.error("[supabase] PIN verify error:", error.message)
    return false
  }
  return Boolean(data)
}
