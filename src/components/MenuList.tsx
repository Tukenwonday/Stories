import { useLang } from "../lang-context"
import { strings } from "../i18n"
import MenuItemCard from "./MenuItemCard"
import { Skeleton } from "./ui/Skeleton"
import { cn } from "../lib/design-tokens"

export default function MenuList({ items, loading, error, isSearching, activeLabel, onSelectItem }: {
  items: any[]
  loading: boolean
  error: string | null
  isSearching: boolean
  activeLabel?: string
  onSelectItem: (item: any) => void
}) {
  const { lang } = useLang()

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-32 pt-7">
        <div className="flex items-center gap-3">
          <span className="hairline w-8" />
          <h2 className="font-serif text-2xl font-bold uppercase tracking-[0.16em] text-gold-gradient">
            {strings.loadingMenu[lang]}
          </h2>
        </div>
        <div className="mt-6 flex flex-col gap-4">
          {[0, 1, 2, 3].map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl border border-border/70 bg-surface/60 p-4">
              <div className="relative shrink-0">
                <div className="h-20 w-20 rounded-xl border border-border/20 bg-surface-2" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span className="rounded-full bg-bg/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gold backdrop-blur">
                    {strings.loadingMenu[lang]}
                  </span>
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-4 w-3/4 rounded bg-surface-2" />
                <div className="h-4 w-full rounded bg-surface-2" />
                <div className="h-4 w-1/2 rounded bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-32 pt-7 text-center">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center justify-center mb-6">
            <div className="h-12 w-12 flex items-center justify-center rounded-xl border border-danger/30 bg-danger/10">
              <svg className="h-6 w-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <p className="mb-4 text-lg font-semibold text-red-400">{error}</p>
          <p className="mb-6 text-sm text-muted">
            {strings.loadError[lang] || "Something went wrong. Please try again."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-gradient-to-b from-gold-soft to-gold px-6 py-3 text-sm font-bold text-bg-deep shadow-gold transition-all duration-300 hover:shadow-gold/50 active:scale-[0.98]"
          >
            {strings.retry[lang]}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-32 pt-6">
      <div className="mb-1 h-px w-12 bg-gradient-to-r from-transparent via-gold to-transparent" />
      <div className="flex items-center gap-3">
        <span className="hairline w-8 shrink-0" />
        <h2 className="whitespace-nowrap font-serif text-2xl font-bold uppercase tracking-[0.16em] text-gold-gradient">
          {isSearching ? strings.search[lang] : activeLabel}
        </h2>
        <span className="hairline h-px flex-1" />
        <span className="grid h-7 min-w-7 place-items-center rounded-full border border-gold/40 bg-gold/10 px-2 text-[11px] font-bold text-gold">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center text-center py-16">
          <div className="mb-6">
            <div className="h-16 w-16 flex items-center justify-center rounded-xl border border-gold/40 bg-gold/10">
              <svg className="h-8 w-8 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
          <h3 className="mb-3 text-xl font-semibold text-foreground">
            {strings.noItems[lang]}
          </h3>
          <p className="text-sm text-muted max-w-xl">
            {strings.emptyCartHint[lang] || "Try adjusting your search or browsing different categories."}
          </p>
          {!isSearching && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => { /* Could implement browse all or featured items */ }}
                className="rounded-full bg-gold px-4 py-2 text-xs font-medium text-bg transition-all duration-200 hover:bg-gold/90"
              >
                {strings.search[lang]}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {items.map((item, i) => (
            <div key={item.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
              <MenuItemCard item={item} onSelect={onSelectItem} />
            </div>
          ))}
        </div>
      )}
    </main>
  )
}