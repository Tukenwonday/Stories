import { Search, X } from "lucide-react";
import { useLang } from "../../lang-context";
import { strings } from "../../i18n";
import { cn } from "../../lib/design-tokens";

interface SearchBarProps {
  query: string;
  onChange: (query: string) => void;
  placeholder: string;
}

export default function SearchBar({ query, onChange, placeholder }: SearchBarProps) {
  const { lang } = useLang();
  const isSearching = query.trim().length > 0;

  const handleClear = () => {
    onChange("");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4">
      <div className="relative">
        <div className={cn(
          "flex items-center gap-2 rounded-2xl border bg-surface-2 px-4 py-3",
          "transition-all duration-200",
          isSearching ? "border-gold/40 ring-2 ring-gold/20" : "border-border",
          "focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/30"
        )}>
          <Search className={cn("h-5 w-5 shrink-0 transition-colors", isSearching ? "text-gold" : "text-muted")} />
          <input
            type="text"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            autoComplete="off"
            aria-label={placeholder}
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}