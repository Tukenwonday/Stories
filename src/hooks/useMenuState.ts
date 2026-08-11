import { useEffect, useMemo, useState } from "react"
import type { Category, Lang, MenuItem } from "../types"
import { strings } from "../i18n"
import { logError } from "../lib/logger"

export function useMenuState(
  menuData: { categories: Category[]; menu: MenuItem[] } | undefined,
  menuError: Error | null,
  _lang: Lang,
) {
  const [categories, setCategories] = useState<Category[]>([])
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [activeCat, setActiveCat] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (menuData) {
      setCategories(menuData.categories)
      setMenu(menuData.menu)
      if (menuData.categories.length > 0) {
        setActiveCat(menuData.categories[0].id)
      }
      setLoading(false)
    }
  }, [menuData])

  useEffect(() => {
    if (menuError) {
      logError(menuError, "menu-query")
      setError((menuError instanceof Error ? menuError.message : String(menuError)) || strings.loadError.ar)
      setLoading(false)
    }
  }, [menuError])

  const searchLower = query.trim().toLowerCase()
  const isSearching = searchLower.length > 0

  const visibleItems = useMemo(() => {
    if (!isSearching) {
      return menu.filter((i) => i.category === activeCat)
    }
    return menu.filter((i) => {
      const titleMatch =
        i.title.en.toLowerCase().includes(searchLower) ||
        i.title.ar.toLowerCase().includes(searchLower)
      const descMatch =
        i.description.en.toLowerCase().includes(searchLower) ||
        i.description.ar.toLowerCase().includes(searchLower)
      return titleMatch || descMatch
    })
  }, [isSearching, searchLower, activeCat, menu])

  const activeLabel = categories.find((c) => c.id === activeCat)?.label.en || categories.find((c) => c.id === activeCat)?.label.ar

  return {
    categories,
    menu,
    activeCat,
    setActiveCat,
    query,
    setQuery,
    visibleItems,
    loading,
    error,
    isSearching,
    activeLabel,
  }
}
