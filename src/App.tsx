import { useEffect, useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import type { Category, Lang, MenuItem } from "./types"
import { LangContext } from "./lang-context"
import { strings } from "./i18n"
import { fetchMenu, supabase } from "./lib/supabase"
import Header from "./components/Header"
import CategoryNav from "./components/CategoryNav"
import MenuItemCard from "./components/MenuItemCard"
import MenuItemSheet from "./components/MenuItemSheet"
import CartButton from "./components/CartButton"
import CartSheet from "./components/CartSheet"

function getTableToken(): string {
  return new URLSearchParams(window.location.search).get("table") ?? ""
}

export default function App() {

  const [tableNumber, setTableNumber] = useState<string | null>(null)
  const [tableInvalid, setTableInvalid] = useState(false)
  const [lang, setLang] = useState<Lang>("ar")
  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr"
  const toggleLang = () => setLang((l) => (l === "ar" ? "en" : "ar"))
  const [categories, setCategories] = useState<Category[]>([])
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [activeCat, setActiveCat] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  // Resolve the secret table token from the URL against the server.
  // Tokens live in a Supabase table behind RLS; the RPC only resolves a token
  // you already have, so the full list is never exposed.
  useEffect(() => {
    const token = getTableToken()

    const resolve = async (): Promise<string | null> => {
      if (supabase) {
        const { data, error } = await supabase.rpc("resolve_table_token", { p_token: token })
        if (error) throw error
        return data as string | null
      }
      // Demo fallback (Supabase not configured): bundled public/tables.json
      const res = await fetch("/tables.json")
      if (!res.ok) throw new Error("Failed to load table data")
      const data: { tables: { table: number; token: string }[] } = await res.json()
      const found = data.tables.find((t) => t.token === token)
      return found ? String(found.table).padStart(2, "0") : null
    }

    resolve()
      .then((tableNumber) => {
        if (tableNumber) {
          setTableNumber(tableNumber)
        } else {
          setTableInvalid(true)
        }
      })
      .catch(() => setTableInvalid(true))
  }, [])

  useEffect(() => {
    fetchMenu()
      .then((data) => {
        setCategories(data.categories)
        setMenu(data.menu)
        if (data.categories.length > 0) {
          setActiveCat(data.categories[0].id)
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        console.error(err)
        setError((err instanceof Error ? err.message : String(err)) || strings.loadError.ar)
        setLoading(false)
      })
  }, [])
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)

  // Apply language direction to the document.
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const trimmedQuery = query.trim().toLowerCase()
  const isSearching = trimmedQuery.length > 0

  const visibleItems = useMemo(() => {
    let list: MenuItem[]
    if (isSearching) {
      const q = query.trim()
      list = menu.filter(
        (i) =>
          i.title[lang].includes(q) ||
          i.title.en.toLowerCase().includes(trimmedQuery) ||
          i.title.ar.includes(q) ||
          i.description[lang].toLowerCase().includes(trimmedQuery) ||
          i.description.en.toLowerCase().includes(trimmedQuery) ||
          i.description.ar.includes(q),
      )
    } else {
      list = menu.filter((i) => i.category === activeCat)
    }
    return list
  }, [isSearching, trimmedQuery, query, lang, activeCat, menu])

  const activeLabel = categories.find((c) => c.id === activeCat)?.label[lang]

  if (tableInvalid) {
    return (
      <LangContext.Provider value={{ lang, dir, toggle: toggleLang }}>
        <div dir={dir} className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center font-sans text-foreground">
          <img
            src="/images/logo.png"
            alt="Stories"
            className="h-20 w-20 rounded-full border border-gold/40 object-cover"
          />
          <h1 className="mt-4 font-serif text-lg font-bold uppercase tracking-[0.18em] text-gold">
            Stories
          </h1>
          <p className="mt-6 text-sm font-semibold text-foreground">{strings.invalidLink[lang]}</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
            {strings.invalidLinkHint[lang]}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-full bg-gold px-6 py-3 text-sm font-bold text-bg transition-colors active:bg-gold/90"
          >
            {strings.retry[lang]}
          </button>
        </div>
      </LangContext.Provider>
    )
  }

  if (tableNumber === null) {
    return (
      <LangContext.Provider value={{ lang, dir, toggle: toggleLang }}>
        <div dir={dir} className="flex min-h-screen flex-col items-center justify-center bg-bg font-sans text-foreground">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold border-t-transparent"></div>
        </div>
      </LangContext.Provider>
    )
  }

  if (loading) {
    return (
      <LangContext.Provider value={{ lang, dir, toggle: toggleLang }}>
        <div dir={dir} className="flex min-h-screen flex-col items-center justify-center bg-bg font-sans text-foreground">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold border-t-transparent"></div>
          <p className="mt-4 text-sm text-muted">{strings.loadingMenu[lang]}</p>
        </div>
      </LangContext.Provider>
    )
  }

  if (error) {
    return (
      <LangContext.Provider value={{ lang, dir, toggle: toggleLang }}>
        <div dir={dir} className="flex min-h-screen flex-col items-center justify-center bg-bg font-sans text-foreground px-4 text-center">
          <p className="text-red-400 font-semibold mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-gold px-6 py-2.5 text-sm font-bold text-bg hover:bg-gold/90 transition-colors"
          >
            {strings.retry[lang]}
          </button>
        </div>
      </LangContext.Provider>
    )
  }

  return (
    <LangContext.Provider value={{ lang, dir, toggle: toggleLang }}>
      <div dir={dir} className="min-h-screen bg-bg font-sans text-foreground">
        <div className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
          <Header tableNumber={tableNumber} />
          {!isSearching && (
            <CategoryNav active={activeCat} onSelect={setActiveCat} categories={categories} />
          )}
        </div>
        <div className="mx-auto max-w-2xl px-4 pt-4">
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5">
            <Search className="h-4.5 w-4.5 shrink-0 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={strings.search[lang]}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <X className="h-4 w-4 text-muted" />
              </button>
            )}
          </div>
        </div>

        {/* Menu list */}
        <main className="mx-auto max-w-2xl px-4 pb-32 pt-6">
          <div className="mb-1 h-px w-12 bg-gold/70" />
          <h2 className="mt-3 text-xl font-bold uppercase tracking-[0.3em] text-gold md:text-2xl">
            {isSearching ? strings.search[lang] : activeLabel}
          </h2>

          {visibleItems.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              {strings.noItems[lang]}
            </p>
          ) : (
            <div className="mt-2 divide-y divide-border">
              {visibleItems.map((item) => (
                <MenuItemCard key={item.id} item={item} onSelect={setSelectedItem} />
              ))}
            </div>
          )}
        </main>

        <CartButton onOpen={() => setCartOpen(true)} />

        {selectedItem && (
          <MenuItemSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
        )}
        {cartOpen && <CartSheet tableNumber={tableNumber} onClose={() => setCartOpen(false)} />}
      </div>
    </LangContext.Provider>
  )
}
