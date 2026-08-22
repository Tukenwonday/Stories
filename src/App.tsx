import { useEffect, useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import type { Category, Lang, MenuItem } from "./types"
import { LangContext, persistLang, storedLang } from "./lang-context"
import { strings } from "./i18n"
import { fetchMenu, queryKeys } from "./lib/supabase"
import { logError } from "./lib/logger"
import { useQuery } from "@tanstack/react-query"
import { useTableSession } from "./hooks/useTableSession"
import Header from "./components/Header"
import CategoryNav from "./components/CategoryNav"
import MenuItemCard from "./components/MenuItemCard"
import MenuItemSheet from "./components/MenuItemSheet"
import CartButton from "./components/CartButton"
import CartSheet from "./components/CartSheet"

export default function App() {
  const [lang, setLang] = useState<Lang>(storedLang)
  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr"
  const toggleLang = () =>
    setLang((l) => {
      const next: Lang = l === "ar" ? "en" : "ar"
      persistLang(next)
      return next
    })

  const [activeCat, setActiveCat] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)

  // NFC / QR table session: ordering unlocks only for customers who tapped
  // their table's NFC card (or QR) and persists for 2h. Everyone else browses
  // the menu in view-only mode.
  const { canOrder, tableNumber, token, resolving, tokenInvalid, expired } = useTableSession()

  // Storefront anon bypasses Supabase entirely (R2 CDN). 120s stale + no focus refetch
  // cuts ~75% menu.json fetches under heavy traffic; kitchen publishes via POST /r2/export-menu
  // and storefront invalidates via window event (publishMenuJson) instead of polling.
  const { data: menuData, error: menuError, isLoading } = useQuery({
    queryKey: [...queryKeys.menu, lang],
    queryFn: () => fetchMenu({ lang }),
    staleTime: 120 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  useEffect(() => {
    if (menuError) {
      logError(menuError, "menu-query")
      setError((menuError instanceof Error ? menuError.message : String(menuError)) || strings.loadError.ar)
    }
  }, [menuError])

  // Apply language direction to the document.
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const trimmedQuery = query.trim().toLowerCase()
  const isSearching = trimmedQuery.length > 0
  const activeCatId = activeCat || menuData?.categories[0]?.id || ""

  const visibleItems = useMemo(() => {
    let list: MenuItem[]
    if (isSearching) {
      const q = query.trim()
      list = (menuData?.menu ?? []).filter(
        (i) =>
          i.title[lang].includes(q) ||
          i.title.en.toLowerCase().includes(trimmedQuery) ||
          i.title.ar.includes(q) ||
          i.description[lang].toLowerCase().includes(trimmedQuery) ||
          i.description.en.toLowerCase().includes(trimmedQuery) ||
          i.description.ar.includes(q),
      )
    } else {
      list = (menuData?.menu ?? []).filter((i) => i.category === activeCatId)
    }
    return list
  }, [isSearching, trimmedQuery, query, lang, activeCatId, menuData])

  const activeLabel = menuData?.categories.find((c) => c.id === activeCatId)?.label[lang]

  if (tokenInvalid) {
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

  if (resolving) {
    return (
      <LangContext.Provider value={{ lang, dir, toggle: toggleLang }}>
        <div dir={dir} className="flex min-h-screen flex-col items-center justify-center bg-bg font-sans text-foreground">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold border-t-transparent"></div>
        </div>
      </LangContext.Provider>
    )
  }

  if (isLoading) {
    return (
      <LangContext.Provider value={{ lang, dir, toggle: toggleLang }}>
        <div dir={dir} className="flex min-h-screen flex-col items-center justify-center bg-bg font-sans text-foreground">
          <div className="menu-cube-loader" aria-hidden="true">
            <span className="menu-cube" />
            <span className="menu-cube" />
            <span className="menu-cube" />
            <span className="menu-cube" />
          </div>
          <p className="mt-5 text-sm font-semibold text-muted">{strings.loadingMenu[lang]}</p>
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
      <div dir={dir} className="menu-ordering-screen min-h-screen bg-bg font-sans text-foreground">
        <div className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
          <Header tableNumber={tableNumber} />
          {!isSearching && (
            <CategoryNav active={activeCatId} onSelect={setActiveCat} categories={menuData?.categories ?? []} />
          )}
        </div>
        <div className="mx-auto max-w-4xl px-4 pt-4">
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
        <main className="mx-auto max-w-4xl px-4 pb-32 pt-6">
          <div className="mb-1 h-px w-12 bg-gold/70" />
          <h2
            className={
              lang === "ar"
                ? "mt-3 text-xl font-bold text-gold md:text-2xl"
                : "mt-3 text-xl font-bold uppercase tracking-[0.3em] text-gold md:text-2xl"
            }
          >
            {isSearching ? strings.search[lang] : activeLabel}
          </h2>

          {visibleItems.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              {strings.noItems[lang]}
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-4 sm:gap-5">
              {visibleItems.map((item, index) => (
                <MenuItemCard
                  key={`${activeCatId}-${query}-${item.id}`}
                  item={item}
                  animationIndex={index}
                  onSelect={setSelectedItem}
                />
              ))}
            </div>
          )}
        </main>

        {expired ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-red-500/40 bg-bg/95 px-4 py-3 pb-safe backdrop-blur">
            <p className="mx-auto max-w-2xl text-center text-xs font-semibold leading-relaxed text-red-400">
              {strings.sessionExpiredBanner[lang]}
            </p>
          </div>
        ) : canOrder ? (
          <CartButton onOpen={() => setCartOpen(true)} />
        ) : (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/30 bg-bg/95 px-4 py-3 pb-safe backdrop-blur">
            <p className="mx-auto max-w-2xl text-center text-xs font-semibold leading-relaxed text-gold">
              {strings.viewOnlyBanner[lang]}
            </p>
          </div>
        )}

        {selectedItem && (
          <MenuItemSheet
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            canOrder={canOrder}
          />
        )}
        {cartOpen && tableNumber && token && (
          <CartSheet
            tableNumber={tableNumber}
            token={token}
            canOrder={canOrder}
            onClose={() => setCartOpen(false)}
          />
        )}
      </div>
    </LangContext.Provider>
  )
}
