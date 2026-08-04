import { useCallback, useEffect, useState } from "react"
import { Clock, Lock, RefreshCw } from "lucide-react"
import type { Lang } from "../types"
import { LangContext } from "../lang-context"
import { supabase } from "../lib/supabase"
import { kitchenStrings } from "../kitchen-i18n"

/** Change this PIN before going live. */
const KITCHEN_PIN = "2026"

interface KitchenOrderItem {
  itemId: string
  title: string
  quantity: number
  unitPrice: number
  modifiers: Array<{ group: string; option: string; price: number }>
}

interface KitchenOrder {
  id: string
  created_at: string
  table_number: string
  customer_name: string
  notes: string
  payment_method: string
  items: KitchenOrderItem[]
  total: number
}

export default function Kitchen() {
  const [lang, setLang] = useState<Lang>("ar")
  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr"
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("kitchenAuthed") === "1")
  const [pin, setPin] = useState("")
  const [pinError, setPinError] = useState(false)
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const t = (k: keyof typeof kitchenStrings) => kitchenStrings[k][lang]

  function unlock() {
    if (pin === KITCHEN_PIN) {
      sessionStorage.setItem("kitchenAuthed", "1")
      setAuthed(true)
      setPinError(false)
    } else {
      setPinError(true)
    }
  }

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      setError("not configured")
      return
    }
    const { data, error: err } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
    if (err) {
      console.error("[kitchen] fetch error:", err.message)
      setError(err.message)
    } else {
      setOrders((data ?? []) as KitchenOrder[])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const client = supabase
    if (!authed || !client) return
    load()

    const channel = client
      .channel("kitchen-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as KitchenOrder
          setOrders((prev) => [row, ...prev.filter((o) => o.id !== row.id)].slice(0, 50))
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as KitchenOrder
          setOrders((prev) => prev.map((o) => (o.id === row.id ? row : o)))
        },
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [authed, load])

  if (!authed) {
    return (
      <LangContext.Provider value={{ lang, dir, toggle: () => setLang((l) => (l === "ar" ? "en" : "ar")) }}>
        <div dir={dir} className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center font-sans text-foreground">
          <img
            src="/images/logo.png"
            alt="Stories"
            className="h-20 w-20 rounded-full border border-gold/40 object-cover"
          />
          <h1 className="mt-4 font-serif text-lg font-bold uppercase tracking-[0.18em] text-gold">
            Stories
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.28em] text-muted">{t("subtitle")}</p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              unlock()
            }}
            className="mt-8 w-full max-w-xs"
          >
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value)
                setPinError(false)
              }}
              placeholder={t("pinPlaceholder")}
              className={
                "w-full rounded-xl border bg-surface px-4 py-3 text-center text-lg font-bold tracking-[0.5em] text-foreground outline-none placeholder:tracking-normal placeholder:text-muted/70 focus:border-gold " +
                (pinError ? "border-red-500" : "border-border")
              }
            />
            {pinError && <p className="mt-2 text-xs text-red-400">{t("wrongPin")}</p>}
            <button
              type="submit"
              className="mt-4 w-full rounded-full bg-gold py-3.5 text-sm font-bold text-bg transition-transform active:scale-[0.98]"
            >
              {t("unlock")}
            </button>
          </form>
        </div>
      </LangContext.Provider>
    )
  }

  return (
    <LangContext.Provider value={{ lang, dir, toggle: () => setLang((l) => (l === "ar" ? "en" : "ar")) }}>
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
                  {t("title")}
                </h1>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{t("subtitle")}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-gold/40 px-3 py-1 text-xs font-semibold text-gold sm:inline">
                {orders.length} {t("orderCount")}
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
                onClick={load}
                aria-label={t("refresh")}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-muted"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem("kitchenAuthed")
                  setAuthed(false)
                }}
                aria-label={t("logout")}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-muted"
              >
                <Lock className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">
          {loading && orders.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted">
              <Clock className="mx-auto mb-3 h-6 w-6 animate-pulse text-gold" />
              {t("loading")}
            </p>
          ) : error ? (
            <p className="py-20 text-center text-sm text-red-400">{error}</p>
          ) : orders.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted">{t("noOrders")}</p>
          ) : (
            <ol className="divide-y divide-border">
              {orders.map((o) => {
                const isNew = now - new Date(o.created_at).getTime() < 60000
                return (
                  <li
                    key={o.id}
                    className={
                      "py-5 " + (isNew ? "rounded-xl bg-gold/5 px-3 shadow-inner shadow-gold/10" : "")
                    }
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Table number */}
                      <div className="flex shrink-0 flex-col items-center">
                        <span className="text-3xl font-extrabold leading-none text-gold">
                          {o.table_number}
                        </span>
                        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                          {t("table")}
                        </span>
                        {isNew && (
                          <span className="mt-1.5 rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-gold">
                            {t("newOrder")}
                          </span>
                        )}
                      </div>

                      {/* Items + notes */}
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-muted">
                          {new Date(o.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>

                        <ul className="mt-2">
                          {o.items.map((it, i) => (
                            <li key={i} className="flex items-start justify-between gap-3 py-1">
                              <div className="min-w-0">
                                <span className="text-sm font-semibold text-foreground">
                                  {it.quantity}× {it.title}
                                </span>
                                {it.modifiers.length > 0 && (
                                  <span className="ms-2 text-[11px] text-muted">
                                    {it.modifiers.map((m) => m.option).join(" · ")}
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
                          <p className="mt-2 border-s-2 border-gold ps-3 text-sm leading-relaxed text-gold">
                            {o.notes}
                          </p>
                        )}
                      </div>

                      {/* Total */}
                      <div className="shrink-0">
                        <span className="text-xl font-extrabold text-foreground">{o.total}</span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </main>
      </div>
    </LangContext.Provider>
  )
}
