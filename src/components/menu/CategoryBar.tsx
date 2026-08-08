import { useEffect, useRef, useMemo } from "react";
import { useLang } from "../../lang-context";
import type { Category } from "../../types";
import { getCategoryIcon, cn } from "../../lib/design-tokens";

interface CategoryBarProps {
  active: string;
  onSelect: (id: string) => void;
  categories: Category[];
}

export default function CategoryBar({ active, onSelect, categories }: CategoryBarProps) {
  const { lang } = useLang();
  const railRef = useRef<HTMLDivElement>(null);

  // Keep the active pill scrolled into view.
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

  return (
    <nav aria-label="Menu categories" className="relative">
      <div
        ref={railRef}
        className={cn(
          "no-scrollbar mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-3",
          "snap-x snap-mandatory"
        )}
        role="tablist"
      >
        {sortedCategories.map((c, index) => {
          const isActive = c.id === active;
          const icon = getCategoryIcon(c.id, c.label);
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
              className={cn(
                "shrink-0 flex flex-col items-center gap-1.5 rounded-2xl px-4 py-3 transition-all duration-300 ease-out",
                "animate-fade-up",
                "snap-center",
                isActive
                  ? "bg-gold/10 border-2 border-gold/30 text-gold shadow-gold"
                  : "bg-surface border border-border text-muted hover:border-gold/50 hover:bg-gold/5 hover:text-foreground active:scale-[0.97]",
                "touch-target"
              )}
              style={{
                minWidth: "88px",
                animationDelay: `${index * 40}ms`,
              }}
            >
              <span className="text-2xl leading-none" aria-hidden="true">
                {icon}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                {c.label[lang]}
              </span>
              {isActive && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 h-1.5 w-6 rounded-full bg-gold animate-scale-in"
                  style={{ animationDelay: `${index * 40}ms` }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
