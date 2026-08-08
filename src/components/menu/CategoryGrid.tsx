import { useEffect, useRef, useState, useMemo } from "react";
import { useLang } from "../../lang-context";
import type { Category } from "../../types";
import { cn } from "../../lib/design-tokens";

interface CategoryGridProps {
  active: string;
  onSelect: (id: string) => void;
  categories: Category[];
}

export default function CategoryGrid({ active, onSelect, categories }: CategoryGridProps) {
  const { lang } = useLang();
  const railRef = useRef<HTMLDivElement>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const el = rail.querySelector<HTMLButtonElement>(`[data-cat="${active}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      if (a.id === "all") return -1;
      if (b.id === "all") return 1;
      return 0;
    });
  }, [categories]);

  const getCategoryImage = (categoryId: string): string | undefined => {
    return undefined;
  };

  const getFallbackGradient = (index: number): string => {
    const gradients = [
      "from-surface-2 to-surface-3",
      "from-surface-3 via-surface-2 to-surface",
      "from-surface via-surface-2 to-surface-3",
      "from-surface-2 via-surface to-surface-3",
      "from-surface-3 to-surface",
      "from-surface to-surface-2",
    ];
    return gradients[index % gradients.length];
  };

  const getGoldAccent = (index: number): string => {
    const accents = [
      "before:bg-gradient-to-r before:from-gold/30 before:to-transparent",
      "before:bg-gradient-to-br before:from-gold/20 before:to-transparent",
      "before:bg-gradient-to-r before:from-gold/25 before:to-transparent",
      "before:bg-gradient-to-t before:from-gold/15 before:to-transparent",
      "before:bg-gradient-to-l before:from-gold/20 before:to-transparent",
      "before:bg-gradient-to-bl before:from-gold/10 before:to-transparent",
    ];
    return accents[index % accents.length];
  };

  return (
    <nav aria-label="Menu categories" className="relative">
      <div
        ref={railRef}
        className={cn(
          "no-scrollbar mx-auto grid max-w-2xl grid-cols-2 gap-3 overflow-x-auto px-4 py-3",
          "snap-x snap-mandatory",
          "[&>button]:snap-center"
        )}
        role="tablist"
      >
        {sortedCategories.map((c, index) => {
          const isActive = c.id === active;
          const isPressed = pressedId === c.id;
          const categoryImage = getCategoryImage(c.id);
          const fallbackGradient = getFallbackGradient(index);
          const goldAccent = getGoldAccent(index);

          return (
            <button
              key={c.id}
              data-cat={c.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${c.id}`}
              id={`tab-${c.id}`}
              onClick={() => onSelect(c.id)}
              onMouseDown={() => setPressedId(c.id)}
              onMouseUp={() => setPressedId(null)}
              onMouseLeave={() => setPressedId(null)}
              onTouchStart={() => setPressedId(c.id)}
              onTouchEnd={() => setPressedId(null)}
              onTouchCancel={() => setPressedId(null)}
              className={cn(
                "relative group shrink-0 overflow-hidden rounded-2xl transition-all duration-300 ease-out",
                "animate-fade-up",
                "snap-center",
                "touch-target",
                isActive
                  ? "ring-2 ring-gold/50 shadow-[0_0_20px_-2px_rgba(197,160,89,0.25)]"
                  : "border border-border/50 shadow-lg shadow-black/30",
                isPressed && "scale-[0.97] ring-2 ring-gold shadow-[0_4px_20px_-2px_rgba(197,160,89,0.12)]",
                "active:scale-[0.97]",
                "hover:border-gold/30 hover:shadow-[0_8px_30px_-4px_rgba(197,160,89,0.15)]",
                "before:absolute before:inset-0 before:pointer-events-none",
                goldAccent
              )}
              style={{
                minHeight: "140px",
                minWidth: "calc(50% - 1.5rem)",
                animationDelay: `${index * 40}ms`,
              }}
            >
              {categoryImage ? (
                <>
                  <img
                    src={categoryImage}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "absolute inset-0 h-full w-full object-cover transition-all duration-500 ease-out",
                      isActive ? "scale-105" : "scale-100",
                      "group-hover:scale-105"
                    )}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                </>
              ) : (
                <div className={cn(
                  "absolute inset-0 bg-gradient-to-br",
                  fallbackGradient,
                  "relative before:absolute before:inset-0 before:rounded-2xl before:border before:border-gold/15"
                )}>
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gold/5 via-transparent to-transparent" />
                </div>
              )}

              <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
                <span className="text-3xl leading-none select-none" aria-hidden="true">
                  {c.id === "all" ? "☕" : "🍽️"}
                </span>
                <h3 className={cn(
                  "font-arabic text-lg font-bold uppercase tracking-wider leading-tight transition-colors",
                  isActive ? "text-gold" : "text-foreground",
                  "drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                )}>
                  {c.label[lang]}
                </h3>
              </div>

              {isActive && (
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 h-1.5 w-10 rounded-full bg-gradient-to-r from-gold via-gold-soft to-gold animate-scale-in"
                  style={{ animationDelay: `${index * 40}ms` }}
                />
              )}

              <div className={cn(
                "absolute inset-0 transition-opacity duration-300 pointer-events-none",
                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}