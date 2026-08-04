import { create } from "zustand"
import type { CartLine, MenuItem, SelectedModifier } from "../types"

/** Deterministic line id from item + selected option ids so identical
 *  configurations stack into one line and different ones stay separate. */
function makeLineId(itemId: string, modifiers: SelectedModifier[]): string {
  const key = modifiers
    .map((m) => `${m.groupId}:${m.optionId}`)
    .sort()
    .join("|")
  return key ? `${itemId}__${key}` : itemId
}

function unitPrice(basePrice: number, modifiers: SelectedModifier[]): number {
  return basePrice + modifiers.reduce((sum, m) => sum + (m.price || 0), 0)
}

interface CartState {
  lines: CartLine[]
  addItem: (item: MenuItem, modifiers: SelectedModifier[], quantity?: number) => void
  increment: (lineId: string) => void
  decrement: (lineId: string) => void
  removeLine: (lineId: string) => void
  clear: () => void
  count: () => number
  total: () => number
}

export const useCart = create<CartState>((set, get) => ({
  lines: [],

  addItem: (item, modifiers, quantity = 1) => {
    const lineId = makeLineId(item.id, modifiers)
    const price = unitPrice(item.price, modifiers)

    set((state) => {
      const existing = state.lines.find((l) => l.lineId === lineId)
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.lineId === lineId ? { ...l, quantity: l.quantity + quantity } : l,
          ),
        }
      }
      const line: CartLine = {
        lineId,
        itemId: item.id,
        title: item.title,
        basePrice: item.price,
        quantity,
        modifiers,
        unitPrice: price,
      }
      return { lines: [...state.lines, line] }
    })
  },

  increment: (lineId) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity + 1 } : l)),
    })),

  decrement: (lineId) =>
    set((state) => ({
      lines: state.lines
        .map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0),
    })),

  removeLine: (lineId) => set((state) => ({ lines: state.lines.filter((l) => l.lineId !== lineId) })),

  clear: () => set({ lines: [] }),

  count: () => get().lines.reduce((sum, l) => sum + l.quantity, 0),

  total: () => get().lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
}))
