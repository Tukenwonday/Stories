import { useEffect, useState } from "react";
import { Check, ShoppingBag } from "lucide-react";
import { useLang } from "../../lang-context";
import { strings } from "../../i18n";
import { Button, Sheet } from "../ui";

interface OrderConfirmationProps {
  orderNumber: string;
  tableNumber: string;
  estimatedMinutes: number;
  onNewOrder: () => void;
  onClose: () => void;
}

export default function OrderConfirmation({
  orderNumber,
  tableNumber,
  estimatedMinutes,
  onNewOrder,
  onClose,
}: OrderConfirmationProps) {
  const { lang } = useLang();
  const [pieces, setPieces] = useState<ConfettiPieceData[]>([]);

  useEffect(() => {
    const data: ConfettiPieceData[] = [];
    const colors = ["#c9a359", "#d4b45e", "#f59e0b", "#22c57e", "#3b82f6", "#ef4444"];
    for (let i = 0; i < 36; i++) {
      data.push({
        id: i,
        color: colors[i % colors.length],
        left: Math.random() * 100,
        delay: (i * 40) % 1200,
        size: 8 + Math.random() * 8,
        duration: 1800 + Math.random() * 800,
      });
    }
    setPieces(data);

    // Haptic feedback
    if ("vibrate" in navigator) {
      navigator.vibrate([40, 80, 40, 80, 120]);
    }

    // Auto close after 8 seconds
    const timer = setTimeout(() => {
      onNewOrder();
    }, 8000);
    return () => clearTimeout(timer);
  }, [onNewOrder]);

  return (
    <Sheet open={true} onClose={onClose} maxHeight="92vh" showHandle={false}>
      <div className="relative flex h-full min-h-[420px] flex-col items-center justify-center gap-5 overflow-hidden px-6 py-12 text-center">
        {/* Confetti */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
        >
          {pieces.map((p) => (
            <ConfettiPiece key={p.id} piece={p} />
          ))}
        </div>

        <div className="relative z-10 grid h-20 w-20 place-items-center rounded-full bg-gold/15 text-gold ring-4 ring-gold/20 animate-scale-in">
          <Check className="h-10 w-10 gold-glow-icon" />
        </div>

        <div className="relative z-10">
          <h3 className="text-2xl font-bold text-foreground">{strings.orderPlaced[lang]}</h3>
          <p className="mt-1 text-sm text-muted">#{orderNumber}</p>
        </div>

        <div className="relative z-10 flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface-3 px-5 py-3">
          <div className="flex items-center gap-2 text-sm">
            <ShoppingBag className="h-4 w-4 text-gold" />
            <span className="font-semibold text-foreground">
              {strings.table[lang]} {tableNumber}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>⏱</span>
            <span>
              {strings.estimatedTime[lang]} {estimatedMinutes}-{estimatedMinutes + 5}{" "}
              {strings.minutes[lang]}
            </span>
          </div>
        </div>

        <p className="relative z-10 max-w-xs text-sm leading-relaxed text-muted">
          {strings.orderPlacedHint[lang]}
        </p>

        <div className="relative z-10 flex w-full flex-col gap-2">
          <Button onClick={onNewOrder} size="lg" variant="primary" fullWidth>
            {strings.newOrder[lang]}
          </Button>
          <Button onClick={onClose} size="md" variant="ghost" fullWidth>
            {strings.close[lang]}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

interface ConfettiPieceData {
  id: number;
  color: string;
  left: number;
  delay: number;
  size: number;
  duration: number;
}

function ConfettiPiece({ piece }: { piece: ConfettiPieceData }) {
  return (
    <div
      className="absolute top-0"
      style={{
        left: `${piece.left}%`,
        width: `${piece.size}px`,
        height: `${piece.size * 1.6}px`,
        backgroundColor: piece.color,
        animation: `confetti ${piece.duration}ms ease-in ${piece.delay}ms forwards`,
        clipPath: "polygon(50% 0%, 100% 35%, 85% 100%, 15% 100%, 0% 35%)",
      }}
      aria-hidden="true"
    />
  );
}
