import { Search, X } from "lucide-react"

export default function SearchBar({ query, onChange, placeholder }: { query: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-4">
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
        {query && (
          <button type="button" onClick={() => onChange("")} aria-label="Clear search">
            <X className="h-4 w-4 text-muted" />
          </button>
        )}
      </div>
    </div>
  )
}
