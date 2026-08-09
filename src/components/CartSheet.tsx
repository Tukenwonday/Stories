import { useRef, useState } from "react"
import { Check, Minus, Plus, ShoppingBag, Trash2, Wallet, X } from "lucide-react"
import { useLang } from "../lang-context"
import { strings } from "../i18n"
import { useCart } from "../store/cart"
import { buildOrderPayload, submitOrder } from "../lib/supabase"

export default function CartSheet({
  tableNumber,
  token,
  canOrder,
  onClose,
}: {
  tableNumber: string
  token: string
  canOrder: boolean
  onClose: () => void
}) {
  const { lang, dir } = useLang()
  const { lines, increment, decrement, removeLine, clear } = useCart()
  const total = useCart((s) => s.total())

  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("stories-customer-name") ?? ""
    } catch {
      return ""
    }
  })
  const [nameError, setNameError] = useState(false)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  // Synchronous guard: the `submitting` state is async, so two clicks in the
  // same tick could both reach submitOrder before the button re-renders. The
  // ref closes that race so a slow connection can never submit a duplicate.
  const submittingRef = useRef(false)
  const [placed, setPlaced] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  async function handleSubmit() {
    if (submittingRef.current) return
    if (!name.trim()) {
      setNameError(true)
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    setServerError(null)

    try {
      const payload = buildOrderPayload({ tableNumber, customerName: name, notes, lines })
      const res = await submitOrder(payload, token)

      if (res.ok) {
        setPlaced(true)
        clear()
      } else {
        setServerError(res.error ?? "Something went wrong")
      }
    } catch {
      setServerError("Network error. Your order was not sent — please try again.")
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" dir={dir}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-black/70"
      />

      <div className="animate-sheet relative flex max-h-[92vh] flex-col overflow-hidden rounded-t-3xl border-t border-border bg-surface">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <ShoppingBag className="h-5 w-5 text-gold" />
            {strings.yourOrder[lang]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {placed ? (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-gold/15 text-gold">
              <Check className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-foreground">{strings.orderPlaced[lang]}</h3>
            <p className="max-w-xs text-sm leading-relaxed text-muted">{strings.orderPlacedHint[lang]}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-full bg-gold px-6 py-3 text-sm font-bold text-bg"
            >
              {strings.newOrder[lang]}
            </button>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-muted">
              <ShoppingBag className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{strings.emptyCart[lang]}</h3>
            <p className="text-sm text-muted">{strings.emptyCartHint[lang]}</p>
          </div>
        ) : (
          <>
            {/* Items */}
            <div className="flex-1 overflow-y-auto px-5 py-2">
              <div className="divide-y divide-border">
                {lines.map((l) => (
                  <div key={l.lineId} className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4
                          className={
                            "text-sm font-bold text-foreground " +
                            (lang === "ar" ? "" : "uppercase tracking-widest")
                          }
                        >
                          {l.title[lang]}
                        </h4>
                        {l.modifiers.length > 0 && (
                          <ul className="mt-1.5 flex flex-wrap gap-1">
                            {l.modifiers.map((m) => (
                              <li
                                key={m.groupId + m.optionId}
                                className="rounded-full border border-gold/30 px-2 py-0.5 text-[10px] font-medium text-muted"
                              >
                                {m.optionLabel[lang]}
                                {m.price ? (
                                  <span className="text-gold-soft"> +{m.price}</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(l.lineId)}
                        aria-label="Remove item"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted active:bg-surface"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-2 py-1">
                        <button
                          type="button"
                          onClick={() => decrement(l.lineId)}
                          aria-label="Decrease"
                          className="grid h-7 w-7 place-items-center rounded-full text-foreground active:bg-surface-2"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-4 text-center text-sm font-bold text-foreground">
                          {l.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => increment(l.lineId)}
                          aria-label="Increase"
                          className="grid h-7 w-7 place-items-center rounded-full text-foreground active:bg-surface-2"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-bold text-gold">
                        {l.unitPrice * l.quantity} {strings.currency[lang]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Checkout */}
            <div className="pb-safe border-t border-border p-5">
              {/* Name */}
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                {strings.customerName[lang]}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  try {
                    localStorage.setItem("stories-customer-name", e.target.value)
                  } catch {
                    // Storage unavailable (private mode) — name stays in-memory.
                  }
                  if (e.target.value.trim()) setNameError(false)
                }}
                placeholder={strings.customerNamePlaceholder[lang]}
                className={
                  "w-full rounded-xl border bg-surface-2 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-gold " +
                  (nameError ? "border-red-500" : "border-border")
                }
              />
              {nameError && <p className="mt-1 text-xs text-red-400">{strings.nameError[lang]}</p>}

              {/* Notes */}
              <label className="mb-1.5 mt-4 block text-sm font-semibold text-foreground">
                {strings.notes[lang]}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={strings.notesPlaceholder[lang]}
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-gold"
              />

              {/* Payment (cash only) */}
              <div className="mt-4">
                <span className="mb-1.5 block text-sm font-semibold text-foreground">
                  {strings.payment[lang]}
                </span>
                <div className="flex items-center gap-3 rounded-xl border border-gold bg-gold/10 px-4 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-gold/20 text-gold">
                    <Wallet className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {strings.payWaiter[lang]}
                    </span>
                    <span className="block text-xs text-muted">{strings.payWaiterHint[lang]}</span>
                  </span>
                  <span className="ms-auto grid h-5 w-5 place-items-center rounded-full bg-gold text-bg">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>

              {/* Total */}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted">{strings.total[lang]}</span>
                <span className="text-lg font-extrabold text-gold">
                  {total} {strings.currency[lang]}
                </span>
              </div>

              {serverError && <p className="mt-2 text-xs text-red-400">{serverError}</p>}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !canOrder}
                className="mt-3 w-full rounded-full bg-gold py-3.5 text-sm font-bold text-bg transition-transform active:scale-[0.99] disabled:opacity-50"
              >
                {submitting
                  ? strings.placing[lang]
                  : canOrder
                    ? `${strings.placeOrder[lang]} · ${strings.table[lang]} ${tableNumber}`
                    : strings.tapToOrder[lang]}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
