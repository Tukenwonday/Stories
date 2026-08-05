export type Lang = "en" | "ar"

export interface Localized {
  en: string
  ar: string
}

export interface ModifierOption {
  id: string
  label: Localized
  price?: number
}

export interface ModifierGroup {
  id: string
  label: Localized
  /** single = radio (choose one), multi = checkbox (choose any) */
  type: "single" | "multi"
  required?: boolean
  options: ModifierOption[]
}

export interface MenuItem {
  id: string
  category: string
  title: Localized
  description: Localized
  price: number
  image?: string
  tag?: Localized
  modifiers?: ModifierGroup[]
  /** Local-time window start the item is NOT served (HH:MM:SS). Both set = restricted. */
  notServedFrom?: string
  /** Local-time window end the item is NOT served (HH:MM:SS). */
  notServedTo?: string
  /** Manual availability switch (false = off menu / out of stock). */
  isAvailable?: boolean
  /** Dates (YYYY-MM-DD) the item is not served on. */
  unavailableDates?: string[]
}

export interface Category {
  id: string
  label: Localized
}

/** A resolved modifier selection stored on a cart line. */
export interface SelectedModifier {
  groupId: string
  groupLabel: Localized
  optionId: string
  optionLabel: Localized
  price: number
}

export interface CartLine {
  lineId: string
  itemId: string
  title: Localized
  basePrice: number
  quantity: number
  modifiers: SelectedModifier[]
  /** basePrice + sum(modifier prices) */
  unitPrice: number
}
