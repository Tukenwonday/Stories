import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, Clock, Lock, RefreshCw, Trash2, X, CheckCircle2, Circle } from "lucide-react"
import type { TableSummary } from "../lib/supabase"
import { supabase, verifyKitchenPin, fetchTablesSummary, fetchTableOrders, clearTableOrders, markOrderPaid } from "../lib/supabase"
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

export default function Checkout() {
  const [lang, setLang] = useState<"en" | "ar">("en")
  const dir = lang === "ar" ? "rtl" : "ltr"

  const [authed, setAuthed] = useState(() => sessionStorage.getItem("checkoutAuthed") === "1")
  const [pin, setPin] = useState("")
  const [pinError, setPinError] = useState(false)
  const [unlocking, setUnlocking] = useState(false)

  const [view, setView] = useState<"dashboard" | "detail">("dashboard")
  const [selectedTable, setSelectedTable] = useState<string | null>(null)

  const [tables, setTables] = useState<TableSummary[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [paidOrderIds, setPaidOrderIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
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

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const summary = await fetchTablesSummary()
      setTables(summary)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (tableNumber: string) => {
    setLoading(true)
    setError(null)
    setOrders([])
    try {
      const data = await fetchTableOrders(tableNumber)
      setOrders(data)
      setPaidOrderIds(new Set(data.filter((o: any) => o.paid === true).map((o: any) => o.id)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadCurrentView = useCallback(async () => {
    if (view === "dashboard") {
      await loadDashboard()
    } else if (selectedTable) {
      await loadDetail(selectedTable)
    }
  }, [view, selectedTable, loadDashboard, loadDetail])

  useEffect(() => {
    if (authed && view === "dashboard") loadDashboard()
  }, [authed, view, loadDashboard])

  useEffect(() => {
    if (authed && view === "detail" && selectedTable) loadDetail(selectedTable)
  }, [authed, view, selectedTable, loadDetail])

  useEffect(() => {
    if (!authed || !supabase) return
    const client = supabase
    const reloadDebounceRef = { current: null as ReturnType<typeof setTimeout> | null }
    const debouncedReload = () => {
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current)
      reloadDebounceRef.current = setTimeout(() => void reloadCurrentView(), 800)
    }
    const channel = client
      .channel("checkout-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: "paid=eq.false" },
        (payload) => {
          if (view === "detail" && selectedTable && payload.new.table_number === selectedTable) {
            debouncedReload()
          } else if (view === "dashboard") {
            debouncedReload()
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders" },
        (payload) => {
          if (view === "detail" && selectedTable && payload.old.table_number === selectedTable) {
            debouncedReload()
          } else if (view === "dashboard") {
            debouncedReload()
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setChannelError(false)
          void reloadCurrentView()
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setChannelError(true)
        }
      })

    return () => {
      client.removeChannel(channel)
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current)
    }
  }, [authed, reloadCurrentView, view, selectedTable])

  useEffect(() => {
    if (!authed) return

    const resyncTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null }

    const resync = () => {
      if (resyncTimeoutRef.current) clearTimeout(resyncTimeoutRef.current)
      const jitter = Math.random() * 3000
      resyncTimeoutRef.current = setTimeout(() => void reloadCurrentView(), 5000 + jitter)
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

  async function handleClear() {
    if (!selectedTable) return
    setClearing(true)
    setError(null)
    try {
      const pin = sessionStorage.getItem("kitchenPin")
      if (!pin) {
        setError("Session expired. Please log in again.")
        return
      }
      const res = await clearTableOrders(pin, selectedTable)
      if (res.ok) {
        setPaidOrderIds(new Set())
        setTimeout(() => {
          setView("dashboard")
          setSelectedTable(null)
        }, 800)
      } else {
        setError(res.error ?? "Failed")
      }
    } catch {
      setError("Network error")
    } finally {
      setClearing(false)
    }
  }

  async function handleMarkPaid(orderId: string) {
    try {
      const pin = sessionStorage.getItem("kitchenPin")
      if (!pin) {
        setError("Session expired. Please log in again.")
        return
      }
      const res = await markOrderPaid(pin, orderId)
      if (res.ok) {
        setPaidOrderIds((prev) => {
          const next = new Set(prev)
          next.add(orderId)
          return next
        })
      } else {
        setError(res.error ?? "Failed to mark paid")
      }
    } catch {
      setError("Network error")
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
              <button onClick={() => setError(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-muted">
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

                      <ul className="mt-3 divide-y divide-border">
                        {(o.items ?? []).map((it: any, i: number) => (
                          <li key={i} className="flex items-start justify-between gap-3 py-2">
                            <div className="min-w-0">
                              <span className="text-sm font-semibold text-foreground">
                                {it.quantity}× {lang === "ar" ? (it.title_ar ?? it.title) : it.title}
                              </span>
                              {it.modifiers?.length > 0 && (
                                <span className="ms-2 text-[11px] text-muted">
                                  {it.modifiers
                                    .map((m: any) => (lang === "ar" ? (m.option_ar ?? m.option) : m.option))
                                    .join(" · ")}
                                </span>
                              )}
                            </div>
                            <span className="shrink-0 text-sm font-semibold text-foreground">
                              {it.unitPrice * it.quantity}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {o.notes && (
                        <p className="mt-3 border-s-2 border-gold ps-3 text-sm leading-relaxed text-gold">
                          {o.notes}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </main>

        {orders.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-safe">
            <div className="mx-auto flex max-w-3xl justify-center">
              <button
                type="button"
                onClick={handleClear}
                disabled={clearing}
                className="flex w-fit items-center justify-center gap-2 rounded-full bg-red-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-black/40 transition-transform active:scale-[0.99] disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {clearing ? t("clearing", lang) : t("clearTable", lang)}
              </button>
            </div>
          </div>
        )}
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
              onClick={loadDashboard}
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
            <button onClick={() => setError(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-muted">
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
