import { useCallback, useEffect, useState } from "react"
import { Check, Clock, Lock, RefreshCw } from "lucide-react"
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
  status: "pending" | "preparing" | "ready"
}

const STATUS_NEXT: Record<string, KitchenOrder["status"]> = {
  pending: "preparing",
  preparing: "ready",
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
    if (!authed) return
    load()
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [authed, load])

  async function advance(o: KitchenOrder) {
    const next = STATUS_NEXT[o.status]
    if (!next || !supabase) return
    const { error: err } = await supabase.from("orders").update({ status: next }).eq("id", o.id)
    if (err) {
      console.error("[kitchen] update error:", err.message)
      return
    }
    setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, status: next } : x)))
  }

  const statusLabel: Record<KitchenOrder["status"], string> = {
    pending: t("pending"),
    preparing: t("preparing"),
    ready: t("ready"),
  }

  const statusClass: Record<KitchenOrder["status"], string> = {
    pending: "border-gold/40 bg-gold/10 text-gold",
    preparing: "border-sky-400/40 bg-sky-400/10 text-sky-300",
    ready: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  }

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

  const pendingCount = orders.filter((o) => o.status === "pending").length

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
                {pendingCount} {t("orderCount")}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {orders.map((o) => {
                const isNew = now - new Date(o.created_at).getTime() < 60000
                const next = STATUS_NEXT[o.status]
                return (
                  <div
                    key={o.id}
                    className={
                      "flex flex-col rounded-2xl border bg-surface p-4 " +
                      (isNew ? "border-gold/60 ring-1 ring-gold/30" : "border-border")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-3xl font-extrabold tracking-tight text-foreground">
                          {o.table_number}
                        </span>
                        <span className="ms-2 text-xs font-medium text-muted">{t("table")}</span>
                      </div>
                      <span
                        className={
                          "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest " +
                          statusClass[o.status]
                        }
                      >
                        {statusLabel[o.status]}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
                      <span className="truncate">{o.customer_name}</span>
                      <span className="shrink-0">
                        {new Date(o.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {o.notes && (
                      <p className="mt-2 rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs leading-relaxed text-gold">
                        {o.notes}
                      </p>
                    )}

                    <ul className="mt-3 flex flex-1 flex-col gap-1.5">
                      {o.items.map((it, i) => (
                        <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="min-w-0">
                            <span className="font-semibold text-foreground">
                              {it.quantity}× {it.title}
                            </span>
                            {it.modifiers.length > 0 && (
                              <span className="block text-[11px] text-muted">
                                {it.modifiers.map((m) => m.option).join(" · ")}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-gold">
                            {it.unitPrice * it.quantity}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                      <span className="text-sm font-extrabold text-gold">{o.total}</span>
                      {next ? (
                        <button
                          type="button"
                          onClick={() => advance(o)}
                          className="rounded-full bg-gold px-4 py-2 text-xs font-bold text-bg transition-transform active:scale-95"
                        >
                          {o.status === "pending" ? t("startPreparing") : t("markReady")}
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                          <Check className="h-4 w-4" />
                          {t("done")}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </LangContext.Provider>
  )
}
