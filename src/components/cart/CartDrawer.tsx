import { useState, useCallback, useEffect, useRef } from "react";
import { Minus, Plus, Trash2, Copy, Wallet, X, AlertCircle, ShoppingBag } from "lucide-react";
import { useLang } from "../../lang-context";
import { strings } from "../../i18n";
import { useCart } from "../../store/cart";
import { buildOrderPayload, submitOrder } from "../../lib/supabase";
import { cn } from "../../lib/design-tokens";
import { Button, Card, toastSuccess, toastError, useToast, Sheet } from "../ui";
import OrderConfirmation from "./OrderConfirmation";

interface CartDrawerProps {
  tableNumber: string;
  token: string;
  canOrder: boolean;
  onClose: () => void;
}

export default function CartDrawer({ tableNumber, token, canOrder, onClose }: CartDrawerProps) {
  const { lang } = useLang();
  const { lines, increment, decrement, removeLine, clear } = useCart();
  const total = useCart((s) => s.total());
  const count = useCart((s) => s.count());
  const { addToast } = useToast();

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setSubmitting(true);
    setServerError(null);

    let payload;
    try {
      payload = buildOrderPayload({ tableNumber, customerName: name, notes, lines });
    } catch (e) {
      setSubmitting(false);
      setServerError(e instanceof Error ? e.message : "Something went wrong");
      return;
    }
    const res = await submitOrder(payload, token);

    setSubmitting(false);
    if (res.ok) {
      clear();
      setPlaced(true);
      addToast(
        toastSuccess(strings.orderPlaced[lang], strings.orderPlacedHint[lang], { duration: 5000 })
      );
    } else {
      setServerError(res.error ?? "Something went wrong");
      addToast(toastError(strings.orderPlaced[lang], res.error ?? "Something went wrong"));
    }
  }

  const confirmRemove = useCallback(
    (lineId: string) => {
      setPendingRemove(lineId);
      setTimeout(() => {
        removeLine(lineId);
        setPendingRemove(null);
        addToast(toastSuccess(strings.remove[lang], undefined, { duration: 1400 }));
      }, 500);
    },
    [removeLine, addToast]
  );

  if (placed) {
    return (
      <OrderConfirmation
        orderNumber={String(1000 + Math.floor(Math.random() * 9000))}
        tableNumber={tableNumber}
        estimatedMinutes={18}
        onNewOrder={() => {
          setPlaced(false);
          setName("");
          setNotes("");
          onClose();
        }}
        onClose={onClose}
      />
    );
  }

  if (lines.length === 0) {
    return (
      <Sheet open={true} onClose={onClose} title={strings.yourOrder[lang]} maxHeight="92vh">
        <div className="flex flex-col items-center gap-4 px-6 py-16 text-center animate-fade-up">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-surface-3 text-muted">
            <ShoppingBag className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">{strings.emptyCart[lang]}</h3>
          <p className="text-sm text-muted">{strings.emptyCartHint[lang]}</p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={true}
      onClose={onClose}
      title={`${strings.yourOrder[lang]} — ${strings.table[lang]} ${tableNumber}`}
      maxHeight="95vh"
      className="bg-bg"
    >
      {/* Items */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 custom-scroll">
        <div className="divide-y divide-border/50">
          {lines.map((line, index) => {
            const offset = offsets[line.lineId] ?? 0;
            const removing = pendingRemove === line.lineId;
            const translateX = Math.min(0, offset);
            return (
              <SwipeableLine
                key={line.lineId}
                line={line}
                lang={lang}
                index={index}
                offsetX={translateX}
                removing={removing}
                onDrag={(delta) => {
                  const clamped = Math.min(0, Math.max(-120, delta));
                  setOffsets((prev) => ({ ...prev, [line.lineId]: clamped }));
                }}
                onDragEnd={(delta) => {
                  setOffsets((prev) => ({ ...prev, [line.lineId]: 0 }));
                  if (delta < -100) {
                    confirmRemove(line.lineId);
                  } else if (delta < -40) {
                    removeLine(line.lineId);
                  } else {
                    // settle back — no action
                  }
                }}
                onRemove={() => confirmRemove(line.lineId)}
                onIncrement={() => increment(line.lineId)}
                onDecrement={() => decrement(line.lineId)}
              />
            );
          })}
        </div>
      </div>

      {/* Checkout */}
      <div className="shrink-0 border-t border-border bg-surface-2/50 p-5 backdrop-blur-sm">
        {/* Name */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-foreground">
            {strings.customerName[lang]}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) setNameError(false);
            }}
            onBlur={() => {
              if (!name.trim()) setNameError(true);
            }}
            placeholder={strings.customerNamePlaceholder[lang]}
            className={cn(
              "w-full rounded-xl border bg-surface-3 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-2 transition-all duration-200 focus:border-gold focus:ring-2 focus:ring-gold/20",
              nameError ? "border-danger" : "border-border"
            )}
            autoComplete="name"
            autoFocus
          />
          {nameError && <p className="mt-1.5 text-xs text-danger">{strings.nameError[lang]}</p>}
        </div>

        {/* Notes */}
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-semibold text-foreground">
            {strings.notes[lang]}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={strings.notesPlaceholder[lang]}
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-surface-3 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-2 transition-all duration-200 focus:border-gold focus:ring-2 focus:ring-gold/20"
          />
        </div>

        {/* Payment (cash only) */}
        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-semibold text-foreground">
            {strings.payment[lang]}
          </span>
          <Card variant="outlined" padding="md" className="border-gold/30 bg-gold/5">
            <div className="flex items-center gap-3">
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
                <Copy className="h-3.5 w-3.5" />
              </span>
            </div>
          </Card>
        </div>

        {/* Total */}
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm text-muted">{strings.total[lang]}</span>
          <span className="text-xl font-extrabold text-gold">
            {total} <span className="text-xs font-medium text-gold-warm">{strings.currency[lang]}</span>
          </span>
        </div>

        {serverError && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
            <p className="text-xs text-danger">{serverError}</p>
          </div>
        )}

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !canOrder}
          fullWidth
          size="lg"
          variant="primary"
          loading={submitting}
          className="mt-3"
        >
          {submitting
            ? strings.placing[lang]
            : canOrder
              ? `${strings.placeOrder[lang]} · ${strings.table[lang]} ${tableNumber}`
              : strings.tapToOrder[lang]}
        </Button>
      </div>
    </Sheet>
  );
}

/* Swipeable cart line */
function SwipeableLine({
  line,
  lang,
  index,
  offsetX,
  removing,
  onDrag,
  onDragEnd,
  onRemove,
  onIncrement,
  onDecrement,
}: {
  line: { lineId: string; title: { en: string; ar: string }; modifiers: any[]; quantity: number; unitPrice: number };
  lang: "en" | "ar";
  index: number;
  offsetX: number;
  removing: boolean;
  onDrag: (delta: number) => void;
  onDragEnd: (delta: number) => void;
  onRemove: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const startX = useRef(0);
  const active = useRef(false);
  const currentDelta = useRef(0);

  const onPointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (line.modifiers.length === 0 && e.type === "mousedown" && (e as any).button !== 0) return;
      active.current = true;
      const pt = "touches" in e ? e.touches[0] : e;
      startX.current = pt.clientX;
      currentDelta.current = offsetX;
    },
    [offsetX]
  );

  const onPointerMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!active.current) return;
      const pt = "touches" in e ? e.touches[0] : e;
      const delta = currentDelta.current + pt.clientX - startX.current;
      onDrag(delta);
    },
    [onDrag, currentDelta]
  );

  const onPointerUp = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!active.current) return;
      active.current = false;
      const pt = "touches" in e ? e.changedTouches[0] : e;
      const delta = currentDelta.current + pt.clientX - startX.current;
      onDragEnd(delta);
    },
    [onDragEnd, currentDelta]
  );

  useEffect(() => {
    if (!active.current) return;
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchmove", onPointerMove, { passive: true });
    window.addEventListener("touchend", onPointerUp);
    return () => {
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  return (
    <div
      className="relative transition-transform duration-200 ease-out"
      style={{ transform: `translateX(${offsetX}px)`, opacity: removing ? 0 : 1 }}
    >
      <div
        className="absolute inset-0 flex items-center justify-end rounded-xl bg-danger/15 pr-4 opacity-0 transition-opacity"
        style={{ opacity: offsetX < -30 ? 1 : 0 }}
      >
        <Trash2 className="h-5 w-5 text-danger" />
      </div>

      <div
        className={cn(
          "relative z-10 flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-surface/80 p-4 backdrop-blur-sm",
          "transition-all duration-200",
          index === 0 && "animate-fade-up"
        )}
        style={{ animationDelay: `${index * 40}ms` }}
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
      >
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold uppercase tracking-widest text-foreground">
            {line.title[lang]}
          </h4>
          {line.modifiers.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {line.modifiers.map((m) => (
                <li
                  key={m.groupId + m.optionId}
                  className="rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] font-medium text-muted"
                >
                  {m.optionLabel[lang]}
                  {m.price ? <span className="text-gold-warm"> +{m.price}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove item"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/20 hover:text-danger transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface-3 px-2 py-1">
          <button
            type="button"
            onClick={onDecrement}
            aria-label="Decrease"
            className="grid h-7 w-7 place-items-center rounded-full text-foreground active:bg-surface-2 transition-colors"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-4 text-center text-sm font-bold text-foreground">{line.quantity}</span>
          <button
            type="button"
            onClick={onIncrement}
            aria-label="Increase"
            className="grid h-7 w-7 place-items-center rounded-full text-foreground active:bg-surface-2 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="text-sm font-bold text-gold">
          {line.unitPrice * line.quantity} <span className="text-xs font-medium text-gold-warm">{strings.currency[lang]}</span>
        </span>
      </div>
    </div>
  );
}