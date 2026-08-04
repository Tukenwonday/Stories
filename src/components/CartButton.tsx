import { ShoppingBag } from "lucide-react"
import { useLang } from "../lang-context"
import { strings } from "../i18n"
import { useCart } from "../store/cart"

export default function CartButton({ onOpen }: { onOpen: () => void }) {
  const { lang } = useLang()
  const count = useCart((s) => s.count())
  const total = useCart((s) => s.total())

  if (count === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-safe">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={onOpen}
          className="animate-fade pointer-events-auto flex w-full items-center justify-between gap-3 rounded-full bg-gold px-5 py-4 text-bg shadow-lg shadow-black/40 transition-transform active:scale-[0.99]"
        >
          <span className="flex items-center gap-3">
            <span className="relative grid h-8 w-8 place-items-center rounded-full bg-bg/15">
              <ShoppingBag className="h-4.5 w-4.5" />
            </span>
            <span className="text-sm font-bold">
              {strings.viewCart[lang]} · {count} {count === 1 ? strings.item[lang] : strings.items[lang]}
            </span>
          </span>
          <span className="text-sm font-extrabold">
            {total} {strings.currency[lang]}
          </span>
        </button>
      </div>
    </div>
  )
}
