import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { CartLine } from "../types"

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
