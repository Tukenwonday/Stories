import { useLang } from "../lang-context"
import { strings } from "../i18n"

export default function Header({ tableNumber }: { tableNumber: string }) {
  const { lang, toggle } = useLang()

  return (
    <div className="pt-safe relative mx-auto flex max-w-2xl flex-col items-center px-4 pb-2.5 pt-2">
      <button
        type="button"
        onClick={toggle}
        className="absolute top-1/2 end-4 -translate-y-1/2 rounded-full border border-gold/40 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-gold transition-colors active:bg-gold/10"
      >
        {lang === "ar" ? "ENG" : "العربية"}
      </button>

      <img
        src="/images/logo.png"
        alt="Stories"
        className="h-20 w-20 rounded-full border border-gold/40 object-cover"
      />
      <h1 className="mt-1.5 font-serif text-lg font-bold uppercase tracking-[0.18em] text-gold">
        Stories
      </h1>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.28em] text-muted">
        {strings.tagline[lang]}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-gold" />
        <span className="text-[11px] text-muted">
          {strings.table[lang]} {tableNumber}
        </span>
      </div>
    </div>
  )
}
