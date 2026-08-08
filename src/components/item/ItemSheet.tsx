import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { X } from "lucide-react";
import type { MenuItem, ModifierGroup, SelectedModifier } from "../../types";
import { useLang } from "../../lang-context";
import { strings } from "../../i18n";
import { useCart } from "../../store/cart";
import { getUnavailableReason } from "../../lib/availability";
import { buildPublicImageUrl } from "../../lib/supabase";
import { cn } from "../../lib/design-tokens";
import { Sheet, SheetFooter, Stepper, RadioCard, ToggleCard, Button } from "../ui";
import { useFlyToCart } from "../FlyToCart";

function initialSelection(item: MenuItem): Record<string, string[]> {
  const state: Record<string, string[]> = {};
  for (const g of item.modifiers ?? []) {
    state[g.id] = g.type === "single" && g.required ? [g.options[0].id] : [];
  }
  return state;
}

interface ItemSheetProps {
  item: MenuItem;
  onClose: () => void;
  canOrder: boolean;
}

export default function ItemSheet({ item, onClose, canOrder }: ItemSheetProps) {
  const { lang } = useLang();
  const addItem = useCart((s) => s.addItem);
  const [selection, setSelection] = useState<Record<string, string[]>>(() => initialSelection(item));
  const [quantity, setQuantity] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const g of item.modifiers ?? []) {
      initial[g.id] = g.type === "single" && g.required ? true : g.options.length <= 3;
    }
    return initial;
  });

  const { fly: flyToCart } = useFlyToCart();
  const imageWrapperRef = useRef<HTMLDivElement>(null);

  const groups = item.modifiers ?? [];

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  function toggle(group: ModifierGroup, optionId: string) {
    setSelection((prev) => {
      const current = prev[group.id] ?? [];
      if (group.type === "single") return { ...prev, [group.id]: [optionId] };
      const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
      return { ...prev, [group.id]: next };
    });
  }

  const selectedModifiers: SelectedModifier[] = useMemo(() => {
    const result: SelectedModifier[] = [];
    for (const g of groups) {
      for (const optId of selection[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (!opt) continue;
        result.push({
          groupId: g.id,
          groupLabel: g.label,
          optionId: opt.id,
          optionLabel: opt.label,
          price: opt.price ?? 0,
        });
      }
    }
    return result;
  }, [groups, selection]);

  const unitPrice = item.price + selectedModifiers.reduce((s, m) => s + m.price, 0);
  const canAdd = groups.every((g) => !g.required || (selection[g.id]?.length ?? 0) > 0);

  const reason = getUnavailableReason(item);
  const reasonLabel = reason
    ? reason === "stock"
      ? strings.unavailable[lang]
      : reason === "date"
      ? strings.notServedToday[lang]
      : strings.notServedTime[lang]
    : null;
  const addDisabled = !canAdd || reason !== null;

  function handleAdd() {
    if (addDisabled) return;
    addItem(item, selectedModifiers, quantity);
    if (imageWrapperRef.current && item.image) {
      const rect = imageWrapperRef.current.getBoundingClientRect();
      const imageUrl = buildPublicImageUrl(item.image);
      if (imageUrl) {
        flyToCart(rect, imageUrl);
      }
    }
    onClose();
  }

  const imageUrl = item.image ? buildPublicImageUrl(item.image) : undefined;

  return (
    <Sheet
      open={true}
      onClose={onClose}
      title={item.title[lang]}
      description={item.description[lang]}
      maxHeight="95vh"
      showHandle={true}
    >
      {/* Hero Image */}
      {item.image && (
        <div
          ref={imageWrapperRef}
          className="relative -mx-6 -mt-6 overflow-hidden rounded-b-3xl"
        >
          <img
            src={imageUrl}
            alt={item.title.en}
            loading="eager"
            decoding="async"
            className="h-56 w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 end-4 grid h-9 w-9 place-items-center rounded-full bg-bg/70 text-foreground backdrop-blur-sm hover:bg-bg/90 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {!item.image && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold uppercase tracking-widest text-foreground">
              {item.title[lang]}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-muted hover:bg-surface-2 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {item.tag && (
          <span className="mb-4 inline-block rounded-full border border-gold/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-gold">
            {item.tag[lang]}
          </span>
        )}

        <p className="mb-4 text-xs leading-relaxed text-muted">{item.description[lang]}</p>

        {reasonLabel && (
          <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
            <p className="text-sm font-bold text-gold">{reasonLabel}</p>
            <p className="mt-0.5 text-xs text-muted">{strings.notServedHint[lang]}</p>
          </div>
        )}

        {groups.length > 0 && (
          <div className="mt-2 flex flex-col gap-3 border-t border-border pt-4">
            {groups.map((g, index) => {
              const isExpanded = expandedGroups[g.id] ?? true;
              return (
                <fieldset
                  key={g.id}
                  className="animate-fade-up"
                  style={{ animationDelay: `${(index + 1) * 50}ms` }}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className="flex w-full items-center justify-between gap-3 py-2 text-start"
                    aria-expanded={isExpanded}
                  >
                    <legend className="text-sm font-semibold text-foreground">
                      {g.label[lang]}
                    </legend>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                      {g.required ? strings.required[lang] : strings.optional[lang]} ·{" "}
                      {g.type === "single" ? strings.chooseOne[lang] : strings.chooseAny[lang]}
                    </span>
                    <span className="shrink-0 text-muted">{isExpanded ? "−" : "+"}</span>
                  </button>

                  {isExpanded && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {g.options.map((opt) => {
                        const checked = (selection[g.id] ?? []).includes(opt.id);
                        return g.type === "single" ? (
                          <RadioCard
                            key={opt.id}
                            selected={checked}
                            label={opt.label[lang]}
                            price={opt.price}
                            onClick={() => toggle(g, opt.id)}
                            disabled={addDisabled}
                            size="md"
                          />
                        ) : (
                          <ToggleCard
                            key={opt.id}
                            selected={checked}
                            label={opt.label[lang]}
                            price={opt.price}
                            onClick={() => toggle(g, opt.id)}
                            disabled={addDisabled}
                            size="md"
                          />
                        );
                      })}
                    </div>
                  )}
                </fieldset>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer: quantity + golden add button */}
      <SheetFooter>
        <div className="flex w-full items-center gap-3">
          <div className="flex items-center gap-3 rounded-full border border-border bg-surface-3 px-2 py-1.5">
            <Stepper
              value={quantity}
              onValueChange={setQuantity}
              min={1}
              max={99}
              size="md"
              showInput
              aria-label="Quantity"
            />
          </div>

          <Button
            type="button"
            onClick={handleAdd}
            disabled={addDisabled || !canOrder}
            fullWidth
            size="lg"
            variant="primary"
            loading={false}
          >
            {!canOrder
              ? strings.tapToOrder[lang]
              : reasonLabel
                ? reasonLabel
                : `${strings.addToOrder[lang]} · ${unitPrice * quantity} ${strings.currency[lang]}`}
          </Button>
        </div>
      </SheetFooter>
    </Sheet>
  );
}
