import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface FlyItem {
  id: number;
  imageUrl: string;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  targetX: number;
  targetY: number;
  targetWidth: number;
  targetHeight: number;
}

export interface FlyToCartContextValue {
  /** Start a hero image flying toward the cart target. Pass the source element's DOMRect. */
  fly: (start: DOMRect, imageUrl: string) => void;
  /** Attach to the cart element so we know where images fly to. */
  targetRef: (el: HTMLElement | null) => void;
}

const FlyToCartContext = createContext<FlyToCartContextValue | null>(null);

export function useFlyToCart() {
  const ctx = useContext(FlyToCartContext);
  if (!ctx) throw new Error("useFlyToCart must be used within a FlyToCartProvider");
  return ctx;
}

export function FlyToCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FlyItem[]>([]);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const targetRef = useCallback((el: HTMLElement | null) => {
    if (!el) {
      setTargetRect(null);
      return;
    }
    setTargetRect(el.getBoundingClientRect());
  }, []);

  const fly = useCallback(
    (start: DOMRect, imageUrl: string) => {
      if (!imageUrl || !targetRect || targetRect.width === 0) return;
      const id = Date.now() + Math.random();
      const sw = Math.max(start.width, 1);
      const sh = Math.max(start.height, 1);
      const item: FlyItem = {
        id,
        imageUrl,
        startX: start.left + window.scrollX,
        startY: start.top + window.scrollY,
        startWidth: sw,
        startHeight: sh,
        targetX: targetRect.left + window.scrollX,
        targetY: targetRect.top + window.scrollY,
        targetWidth: Math.max(targetRect.width, 1),
        targetHeight: Math.max(targetRect.height, 1),
      };
      setItems((prev) => [...prev, item]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 900);
    },
    [targetRect]
  );

  useEffect(() => {
    const onMove = () => {
      // Re-measure the target on scroll so the flight lands correctly.
      const el = document.querySelector("[data-cart-target]");
      if (el) setTargetRect(el.getBoundingClientRect());
    };
    window.addEventListener("scroll", onMove, true);
    return () => window.removeEventListener("scroll", onMove, true);
  }, []);

  return (
    <FlyToCartContext.Provider value={{ fly, targetRef }}>
      {children}
      {createPortal(<FlyLayer items={items} />, document.body)}
    </FlyToCartContext.Provider>
  );
}

function FlyLayer({ items }: { items: FlyItem[] }) {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 9999 }}>
      {items.map((item) => (
        <FlyingImage key={item.id} item={item} />
      ))}
    </div>
  );
}

function FlyingImage({ item }: { item: FlyItem }) {
  const [go, setGo] = useState(false);
  useEffect(() => setGo(true), []);

  const dx = item.targetX - item.startX;
  const dy = item.targetY - item.startY;
  const scaleX = item.targetWidth / item.startWidth;
  const scaleY = item.targetHeight / item.startHeight;

  const style: React.CSSProperties = {
    position: "fixed" as const,
    left: item.startX,
    top: item.startY,
    width: item.startWidth,
    height: item.startHeight,
    backgroundImage: `url(${item.imageUrl})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    borderRadius: "14px",
    transform: go ? `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})` : "none",
    opacity: go ? 0 : 1,
    transition:
      "transform 780ms cubic-bezier(0.22,1,0.36,1), opacity 780ms ease-out",
    boxShadow: "0 20px 48px rgba(0,0,0,.65), 0 0 0 4px rgba(201,163,89,.4)",
    pointerEvents: "none",
    zIndex: 9999,
  };

  return <div style={style} aria-hidden="true" />;
}
