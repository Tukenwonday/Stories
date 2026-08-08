import { useState, useEffect, useRef } from "react";
import { ShoppingBag, ChevronUp } from "lucide-react";
import { useLang } from "../../lang-context";
import { strings } from "../../i18n";
import { useCart } from "../../store/cart";
import { cn } from "../../lib/design-tokens";
import { Button } from "../ui";
import { useFlyToCart } from "../FlyToCart";

interface CartFabProps {
  onOpen: () => void;
}

export default function CartFab({ onOpen }: CartFabProps) {
  const { lang } = useLang();
  const count = useCart((s) => s.count());
  const total = useCart((s) => s.total());
  const lines = useCart((s) => s.lines);
  const [isPeeking, setIsPeeking] = useState(false);
  const [pulse, setPulse] = useState(false);
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { targetRef } = useFlyToCart();

  useEffect(() => {
    if (count > 0) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 600);
      return () => clearTimeout(t);
    }
  }, [count]);

  const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    const startY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const handleMove = (moveEvent: TouchEvent | MouseEvent) => {
      const currentY = "touches" in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const delta = startY - currentY;
      if (delta > 30) {
        setIsPeeking(true);
        if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current);
      }
    };
    const handleEnd = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
      peekTimeoutRef.current = setTimeout(() => setIsPeeking(false), 3000);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove, { passive: true });
    window.addEventListener("touchend", handleEnd);
  };

  if (count === 0) return null;

  const previewItems = lines.slice(-3).reverse();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-safe">
      <div className="mx-auto max-w-2xl">
        {isPeeking && (
          <div
            className="mb-3 animate-slide-in-right pointer-events-auto overflow-hidden rounded-2xl border border-border/50 bg-surface/95 shadow-2xl backdrop-blur-md"
            role="region"
            aria-label="Cart preview"
          >
            <div className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {strings.yourOrder[lang]} ({count} {count === 1 ? strings.item[lang] : strings.items[lang]})
                </span>
                <span className="text-sm font-extrabold text-gold">
                  {total} {strings.currency[lang]}
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2 max-h-40 overflow-y-auto custom-scroll">
                {previewItems.map((line) => (
                  <div key={line.lineId} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-foreground truncate">{line.title[lang]}</span>
                    <span className="shrink-0 font-bold text-gold">
                      {line.quantity} × {line.unitPrice} {strings.currency[lang]}
                    </span>
                  </div>
                ))}
                {lines.length > 3 && (
                  <div className="py-1 text-center text-xs text-muted">
                    +{lines.length - 3} more {strings.item[lang]}
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-border px-4 py-3">
              <Button onClick={onOpen} fullWidth size="md" variant="primary">
                {strings.viewCart[lang]}
              </Button>
            </div>
          </div>
        )}

        <div className="pointer-events-auto">
          <button
            ref={targetRef}
            data-cart-target
            type="button"
            onClick={onOpen}
            onTouchStart={handleDragStart}
            onMouseDown={handleDragStart}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-full bg-gold px-5 py-4 text-bg shadow-xl shadow-black/40 transition-all duration-300 ease-out",
              "active:scale-[0.98]",
              "hover:shadow-gold hover:-translate-y-1",
              pulse && "animate-pulse-gold"
            )}
            aria-label={`${strings.viewCart[lang]}, ${count} ${count === 1 ? strings.item[lang] : strings.items[lang]}, ${total} ${strings.currency[lang]}`}
          >
            <span className="flex items-center gap-3">
              <span className="relative grid h-8 w-8 place-items-center rounded-full bg-bg/15">
                <ShoppingBag className="h-4.5 w-4.5" />
                {count > 0 && count < 10 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
                    {count}
                  </span>
                )}
                {count >= 10 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-6 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
                    9+
                  </span>
                )}
              </span>
              <span className="hidden text-sm font-bold sm:block">
                {strings.viewCart[lang]} · {count} {count === 1 ? strings.item[lang] : strings.items[lang]}
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm font-extrabold">
              {total} <span className="text-xs font-medium">{strings.currency[lang]}</span>
              <ChevronUp className="h-4 w-4 opacity-70" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}