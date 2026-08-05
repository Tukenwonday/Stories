import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { CartLine, Category, MenuItem, ModifierGroup } from "../types"

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
  not_served_from: string | null
  not_served_to: string | null
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
        "id,category,title_en,title_ar,description_en,description_ar,price,image,tag_en,tag_ar,modifiers,not_served_from,not_served_to,is_available,unavailable_dates",
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
    notServedFrom: r.not_served_from ?? undefined,
    notServedTo: r.not_served_to ?? undefined,
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
  not_served_from?: string | null
  not_served_to?: string | null
  unavailable_dates?: string[]
  is_available?: boolean
}

/**
 * Persists an edited menu row from the kitchen dashboard.
 */
export async function updateMenuItem(
  id: string,
  updates: MenuUpdate,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" }
  const { error } = await supabase.from("menu").update(updates).eq("id", id)
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
