import { createContext, useContext } from "react"
import type { Lang } from "./types"

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
