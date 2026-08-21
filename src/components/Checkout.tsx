import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, Clock, Lock, RefreshCw, X, CheckCircle2, Circle } from "lucide-react"
import type { TableSummary } from "../lib/supabase"
import { supabase, verifyKitchenPin, fetchTablesSummary, fetchTableOrdersPage, fetchOrderDetail, markOrderPaid, queryKeys } from "../lib/supabase"
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { checkoutStrings, t } from "../checkout-i18n"

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "now"
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  return `${Math.floor(diffHr / 24)}d`
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function isRecent(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 60 * 60 * 1000
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function modifierUnitTotal(modifiers: Array<{ price?: number }> = []): number {
  return modifiers.reduce((sum, modifier) => sum + Number(modifier.price || 0), 0)
}

function baseLineTotal(item: { unitPrice: number; quantity: number; modifiers?: Array<{ price?: number }> }): number {
  return Math.max(0, (Number(item.unitPrice) - modifierUnitTotal(item.modifiers)) * item.quantity)
}

export default function Checkout() {
  const [lang, setLang] = useState<"en" | "ar">("en")
  const dir = lang === "ar" ? "rtl" : "ltr"

  const [authed, setAuthed] = useState(() => sessionStorage.getItem("checkoutAuthed") === "1")
  const [pin, setPin] = useState("")
  const [pinError, setPinError] = useState(false)
  const [unlocking, setUnlocking] = useState(false)

  const [view, setView] = useState<"dashboard" | "detail">("dashboard")
  const [selectedTable, setSelectedTable] = useState<string | null>(null)

  const [localError, setLocalError] = useState<string | null>(null)
  const [channelError, setChannelError] = useState(false)

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  async function unlock() {
    setUnlocking(true)
    try {
      const valid = await verifyKitchenPin(pin.trim())
      if (valid) {
        sessionStorage.setItem("checkoutAuthed", "1")
        sessionStorage.setItem("kitchenPin", pin.trim())
        setAuthed(true)
        setPinError(false)
      } else {
        setPinError(true)
      }
    } catch {
      setPinError(true)
    } finally {
      setUnlocking(false)
    }
  }

  const queryClient = useQueryClient()

  // Phase 6: TanStack Query for caching/dedup — dashboard summary 15s stale, detail 15s
  const tablesQuery = useQuery({
    queryKey: queryKeys.tablesSummary,
    queryFn: fetchTablesSummary,
    enabled: authed && view === "dashboard",
    staleTime: 15_000,
    gcTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  })

  // Phase 2: paginated slim history — 30 newest, cursor (created_at,id), no items
  const ordersInfiniteQuery = useInfiniteQuery({
    queryKey: queryKeys.tableOrders(selectedTable ?? "__none__"),
    queryFn: ({ pageParam }: { pageParam?: { created_at: string; id: string } }) =>
      fetchTableOrdersPage(selectedTable!, { cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as { created_at: string; id: string } | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 30) return undefined
      const last = lastPage[lastPage.length - 1] as any
      return { created_at: last.created_at, id: last.id }
    },
    enabled: authed && view === "detail" && !!selectedTable,
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  })

  // Flatten pages with dedup by id (avoids duplicates when Realtime inserts while paginated)
  const ordersFlat = (ordersInfiniteQuery.data?.pages.flat() ?? []) as any[]
  const ordersDeduped = (() => {
    const seen = new Set<string>()
    const out: any[] = []
    for (const o of ordersFlat) {
      if (!seen.has(o.id)) {
        seen.add(o.id)
        out.push(o)
      }
    }
    return out
  })()

  // Detail cache: fetch full items only when order opened
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [orderDetails, setOrderDetails] = useState<Map<string, any>>(new Map())
  const toggleOrderDetail = useCallback(async (orderId: string) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null)
      return
    }
    setExpandedOrderId(orderId)
    if (!orderDetails.has(orderId)) {
      try {
        const detail = await fetchOrderDetail(orderId)
        if (detail) {
          setOrderDetails((prev) => {
            const next = new Map(prev)
            next.set(orderId, detail)
            return next
          })
        }
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : String(e))
      }
    }
  }, [expandedOrderId, orderDetails])

  // Derive tables/orders/loading/error from queries (with local overrides for realtime)
  const tables = tablesQuery.data ?? []
  const orders = ordersDeduped
  const loading = view === "dashboard" ? tablesQuery.isLoading && !tablesQuery.data : view === "detail" ? ordersInfiniteQuery.isLoading && !ordersInfiniteQuery.data : false
  const queryError = view === "dashboard" ? tablesQuery.error : view === "detail" ? ordersInfiniteQuery.error : null
  const error = localError ?? (queryError ? (queryError as Error).message : null)

  // Paid ids derived from orders query (local optimistic)
  const [paidOrderIds, setPaidOrderIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (orders.length) {
      setPaidOrderIds(new Set(orders.filter((o: any) => o.paid === true).map((o: any) => o.id)))
    } else {
      setPaidOrderIds(new Set())
    }
  }, [orders])

  // Invalidate helpers — targeted, deduped by QueryClient
  const invalidateDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tablesSummary })
  }, [queryClient])
  const invalidateDetail = useCallback((tableNumber?: string) => {
    const tn = tableNumber ?? selectedTable
    if (tn) queryClient.invalidateQueries({ queryKey: queryKeys.tableOrders(tn) })
  }, [queryClient, selectedTable])

  const reloadCurrentView = useCallback(() => {
    if (view === "dashboard") invalidateDashboard()
    else if (selectedTable) invalidateDetail(selectedTable)
  }, [view, selectedTable, invalidateDashboard, invalidateDetail])

  // Phase 7: Targeted realtime — only invalidate affected view/table, debounced 800ms
  useEffect(() => {
    if (!authed || !supabase) return
    const client = supabase
    const reloadDebounceRef = { current: null as ReturnType<typeof setTimeout> | null }
    const debouncedInvalidate = (tableNumber?: string) => {
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current)
      reloadDebounceRef.current = setTimeout(() => {
        if (view === "dashboard") invalidateDashboard()
        else if (view === "detail" && tableNumber && tableNumber === selectedTable) invalidateDetail(tableNumber)
      }, 800)
    }
    const channel = client
      .channel("checkout-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: "paid=eq.false" },
        (payload) => {
          const tn = (payload.new as any)?.table_number
          if (view === "detail" && selectedTable && tn === selectedTable) {
            debouncedInvalidate(tn)
          } else if (view === "dashboard") {
            debouncedInvalidate(tn)
          }
          // Also invalidate dashboard even from detail, since counts change
          if (view === "detail") invalidateDashboard()
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders" },
        (payload) => {
          const tn = (payload.old as any)?.table_number
          if (view === "detail" && selectedTable && tn === selectedTable) {
            debouncedInvalidate(tn)
          } else if (view === "dashboard") {
            debouncedInvalidate(tn)
          }
          if (view === "detail") invalidateDashboard()
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setChannelError(false)
          // Initial load handled by useQuery enabled, but force refresh on (re)subscribe
          reloadCurrentView()
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setChannelError(true)
        }
      })

    return () => {
      client.removeChannel(channel)
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current)
    }
  }, [authed, view, selectedTable, invalidateDashboard, invalidateDetail, reloadCurrentView])

  useEffect(() => {
    if (!authed) return

    const resyncTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null }

    const resync = () => {
      if (resyncTimeoutRef.current) clearTimeout(resyncTimeoutRef.current)
      const jitter = Math.random() * 3000
      resyncTimeoutRef.current = setTimeout(() => reloadCurrentView(), 5000 + jitter)
    }
    const resyncWhenVisible = () => {
      if (document.visibilityState === "visible") resync()
    }

    window.addEventListener("online", resync)
    document.addEventListener("visibilitychange", resyncWhenVisible)
    return () => {
      window.removeEventListener("online", resync)
      document.removeEventListener("visibilitychange", resyncWhenVisible)
      if (resyncTimeoutRef.current) clearTimeout(resyncTimeoutRef.current)
    }
  }, [authed, reloadCurrentView])

  // Manual refresh button invalidates instead of direct fetch
  const handleManualRefresh = useCallback(() => {
    reloadCurrentView()
  }, [reloadCurrentView])

  async function handleMarkPaid(orderId: string) {
    try {
      const pin = sessionStorage.getItem("kitchenPin")
      if (!pin) {
        setLocalError("Session expired. Please log in again.")
        return
      }
      const res = await markOrderPaid(pin, orderId)
      if (res.ok) {
        setPaidOrderIds((prev) => {
          const next = new Set(prev)
          next.add(orderId)
          return next
        })
        // Optimistic + invalidate to reflect paid state server-side
        invalidateDetail()
        invalidateDashboard()
      } else {
        setLocalError(res.error ?? "Failed to mark paid")
      }
    } catch {
      setLocalError("Network error")
    }
  }

  if (!authed) {
    return (
      <div dir={dir} className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center font-sans text-foreground">
        <img
          src="/images/logo.png"
          alt="Stories"
          className="h-20 w-20 rounded-full border border-gold/40 object-cover"
        />
        <h1 className="mt-4 font-serif text-lg font-bold uppercase tracking-[0.18em] text-gold">
          {t("title", lang)}
        </h1>
        <p className="mt-1 text-xs uppercase tracking-[0.28em] text-muted">{t("subtitle", lang)}</p>

        <form onSubmit={(e) => { e.preventDefault(); unlock() }} className="mt-8 w-full max-w-xs">
          <input
            type="password"
            autoFocus
            value={pin}
            onChange={(e) => { setPin(e.target.value); setPinError(false) }}
            placeholder={t("pinPlaceholder", lang)}
            className={
              "w-full rounded-xl border bg-surface px-4 py-3 text-center text-lg font-bold tracking-[0.5em] text-foreground outline-none placeholder:tracking-normal placeholder:text-muted/70 focus:border-gold " +
              (pinError ? "border-red-500" : "border-border")
            }
          />
          {pinError && <p className="mt-2 text-xs text-red-400">{t("wrongPin", lang)}</p>}
          <button
            type="submit"
            disabled={unlocking}
            className="mt-4 w-full rounded-full bg-gold py-3.5 text-sm font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {unlocking ? "..." : t("unlock", lang)}
          </button>
        </form>
      </div>
    )
  }

  if (view === "detail" && selectedTable) {
    return (
      <div dir={dir} className="min-h-screen bg-bg font-sans text-foreground">
        <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => { setView("dashboard"); setSelectedTable(null) }}
              className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-muted transition-colors active:bg-surface-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("backToTables", lang)}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold uppercase tracking-widest text-gold">
                {t("table", lang)} {selectedTable}
              </span>
              <button
                type="button"
                onClick={() => setLang((l) => (l === "ar" ? "en" : "ar"))}
                className="rounded-full border border-gold/40 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-gold"
              >
                {lang === "ar" ? "ENG" : "العربية"}
              </button>
              <button
                type="button"
                onClick={() => { sessionStorage.removeItem("checkoutAuthed"); setAuthed(false) }}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-muted"
              >
                <Lock className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {channelError && (
          <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2.5 text-center text-xs font-semibold text-red-400">
            {t("connectionLost", lang)}
          </div>
        )}

        <main className="mx-auto max-w-3xl px-4 py-6">
          {error && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-red-400">{error}</p>
              <button onClick={() => setLocalError(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center text-sm text-muted">
              <Clock className="mx-auto mb-3 h-6 w-6 animate-pulse text-gold" />
              {t("loading", lang)}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-muted">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{t("emptyCart", lang)}</h3>
              <p className="text-sm text-muted">{t("emptyCartHint", lang)}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {orders.map((o) => {
                  const recent = isRecent(o.created_at)
                  const detail = orderDetails.get(o.id)
                  const isExpanded = expandedOrderId === o.id
                  return (
                    <div
                      key={o.id}
                      className={
                        "rounded-2xl border p-5 " +
                        (paidOrderIds.has(o.id)
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : recent
                            ? "border-gold/40 bg-gold/5"
                            : "border-border bg-surface/60")
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted" />
                          <span className="text-sm font-semibold text-foreground">{formatTime(o.created_at)}</span>
                          {recent && (
                            <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gold">
                              {t("recent", lang)}
                            </span>
                          )}
                        </div>
                        <span className="text-lg font-extrabold text-foreground">{o.total}</span>
                        {!paidOrderIds.has(o.id) ? (
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(o.id)}
                            className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold transition-colors active:bg-gold/20"
                          >
                            {t("markPaid", lang)}
                          </button>
                        ) : (
                          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300">
                            {t("paid", lang)}
                          </span>
                        )}
                      </div>

                      {o.customer_name && (
                        <p className="mt-2 text-sm text-muted">
                          <span className="font-semibold text-foreground">{t("customer", lang)}:</span> {o.customer_name}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleOrderDetail(o.id)}
                        className="mt-3 rounded-full border border-border bg-surface px-4 py-2 text-xs font-bold text-muted active:bg-surface-2"
                      >
                        {isExpanded ? "Hide details" : "View details"}
                      </button>

                      {isExpanded && (
                        <div className="mt-3">
                          {!detail ? (
                            <p className="py-4 text-center text-xs text-muted">Loading details...</p>
                          ) : (
                            <>
                              <ul className="divide-y divide-border">
                                {(detail.items ?? []).map((it: any, i: number) => {
                                  const baseTotal = baseLineTotal(it)
                                  return (
                                    <li key={i} className="flex items-start justify-between gap-3 py-2">
                                      <div className="min-w-0">
                                        <span className="text-sm font-semibold text-foreground">
                                          {it.quantity}× {lang === "ar" ? (it.title_ar ?? it.title) : it.title}
                                        </span>
                                        {it.modifiers?.length > 0 && (
                                          <ul className="mt-1 list-none">
                                            {it.modifiers.map((m: any, k: number) => {
                                              const modifierTotal = Number(m.price || 0) * it.quantity
                                              return (
                                                <li key={k} className="flex items-center gap-1.5 text-sm leading-relaxed text-foreground/85">
                                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                                                  <span>{lang === "ar" ? (m.option_ar ?? m.option) : m.option}</span>
                                                  {modifierTotal > 0 && (
                                                    <span className="text-gold">+{formatAmount(modifierTotal)}</span>
                                                  )}
                                                </li>
                                              )
                                            })}
                                          </ul>
                                        )}
                                      </div>
                                      <span className="shrink-0 text-sm font-semibold text-foreground">
                                        {formatAmount(baseTotal)}
                                      </span>
                                    </li>
                                  )
                                })}
                              </ul>
                              {detail.notes && (
                                <p className="mt-3 border-s-2 border-gold ps-3 text-sm leading-relaxed text-gold">
                                  {detail.notes}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {ordersInfiniteQuery.hasNextPage && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => ordersInfiniteQuery.fetchNextPage()}
                    disabled={ordersInfiniteQuery.isFetchingNextPage}
                    className="rounded-full border border-gold/40 bg-gold/10 px-6 py-3 text-sm font-bold text-gold disabled:opacity-50 active:bg-gold/20"
                  >
                    {ordersInfiniteQuery.isFetchingNextPage ? "Loading..." : `Load more (${orders.length} shown)`}
                  </button>
                </div>
              )}
              {!ordersInfiniteQuery.hasNextPage && orders.length >= 30 && (
                <p className="mt-3 text-center text-xs text-muted">All 48h orders loaded. No more hidden.</p>
              )}
            </>
          )}
        </main>
      </div>
    )
  }

  // Dashboard view
  return (
    <div dir={dir} className="min-h-screen bg-bg font-sans text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src="/images/logo.png"
              alt="Stories"
              className="h-9 w-9 rounded-full border border-gold/40 object-cover"
            />
            <div>
              <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-gold">
                {t("title", lang)}
              </h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{t("subtitle", lang)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualRefresh}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-muted"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setLang((l) => (l === "ar" ? "en" : "ar"))}
              className="rounded-full border border-gold/40 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-gold"
            >
              {lang === "ar" ? "ENG" : "العربية"}
            </button>
            <button
              type="button"
              onClick={() => { sessionStorage.removeItem("checkoutAuthed"); setAuthed(false) }}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-muted"
            >
              <Lock className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {channelError && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2.5 text-center text-xs font-semibold text-red-400">
          {t("connectionLost", lang)}
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        {error && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-sm font-semibold text-red-400">{error}</p>
            <button onClick={() => setLocalError(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm text-muted">
            <Clock className="mx-auto mb-3 h-6 w-6 animate-pulse text-gold" />
            {t("loading", lang)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {tables.map((tbl) => {
              const hasOrders = tbl.orderCount > 0
              return (
                <button
                  key={tbl.tableNumber}
                  type="button"
                  onClick={() => { setSelectedTable(tbl.tableNumber); setView("detail") }}
                  disabled={!hasOrders}
                  className={
                    "flex flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-6 text-center transition-all " +
                    (hasOrders
                      ? "border-gold/40 bg-gold/5 active:bg-gold/10 hover:border-gold/60"
                      : "border-border bg-surface/40 opacity-60 cursor-default")
                  }
                >
                  <span className="text-3xl font-extrabold leading-none text-gold">
                    {tbl.tableNumber}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                    {t("table", lang)}
                  </span>
                  {hasOrders ? (
                    tbl.lastOrderAt && (
                      <span className="mt-2 text-[10px] text-muted">{timeAgo(tbl.lastOrderAt)}</span>
                    )
                  ) : (
                    <span className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                      {t("noOrders", lang)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
