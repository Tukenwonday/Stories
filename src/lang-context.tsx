import { createContext, useContext } from "react"
import type { Lang } from "./types"

export const LANG_STORAGE_KEY = "stories-lang"

export function storedLang(): Lang {
  const raw = localStorage.getItem(LANG_STORAGE_KEY)
  return raw === "en" || raw === "ar" ? raw : "ar"
}

export function persistLang(lang: Lang) {
  localStorage.setItem(LANG_STORAGE_KEY, lang)
}

interface LangCtx {
  lang: Lang
  dir: "ltr" | "rtl"
  toggle: () => void
}

export const LangContext = createContext<LangCtx>({
  lang: "ar",
  dir: "rtl",
  toggle: () => {},
})

export const useLang = () => useContext(LangContext)
