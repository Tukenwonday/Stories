import { useEffect, useState } from "react"
import { resolveTableToken } from "../lib/supabase"

/**
 * NFC / QR table session hook.
 *
 * Ordering is only enabled for customers who physically tapped their table's
 * NFC card (or scanned its QR code), which loads the app with a secret
 * `?table=<token>` query param. That token is validated server-side and, once
 * confirmed, a 2-hour session is persisted to localStorage so a page refresh
 * (or the URL being shared without the token) keeps ordering unlocked.
 *
 * Visits without a token (or with an expired/absent session) get the menu in
 * "view-only" mode: everything is browsable but ordering is disabled.
 */

const SESSION_KEY = "table_session"
const SESSION_MS = 2 * 60 * 60 * 1000

export interface TableSession {
  token: string
  table: string
  expiry: number
}

function readSession(): TableSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TableSession
    if (
      !parsed ||
      typeof parsed.token !== "string" ||
      typeof parsed.table !== "string" ||
      typeof parsed.expiry !== "number"
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeSession(session: TableSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Storage unavailable (private mode / quota) — session stays in-memory.
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function useTableSession() {
  // Seed from a still-valid persisted session so we don't flash view-only on reload.
  const [session, setSession] = useState<TableSession | null>(() => {
    const s = readSession()
    return s && s.expiry > Date.now() ? s : null
  })
  // True while a fresh token from the URL is being validated server-side.
  const [resolving, setResolving] = useState(false)
  // True when a token was present in the URL but failed to resolve.
  const [tokenInvalid, setTokenInvalid] = useState(false)
  // True once the 2h session has lapsed while the app is still open. The
  // session data is kept in memory so an in-flight order submission can
  // finish, but ordering is disabled and a "tap your tag again" banner shows.
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("table")

    if (token) {
      // Fresh tap: validate the token, then persist a 2h session.
      setResolving(true)
      resolveTableToken(token)
        .then((table) => {
          if (table) {
            const next: TableSession = {
              token,
              table,
              expiry: Date.now() + SESSION_MS,
            }
            writeSession(next)
            setSession(next)
            // Clean the secret token out of the address bar without reloading.
            const cleanUrl = window.location.pathname + window.location.hash
            window.history.replaceState({}, "", cleanUrl)
          } else {
            setTokenInvalid(true)
          }
        })
        .catch(() => setTokenInvalid(true))
        .finally(() => setResolving(false))
      return
    }

    // No token in the URL: honor a valid persisted session, purge an expired one.
    const saved = readSession()
    if (saved && saved.expiry > Date.now()) {
      setSession(saved)
    } else {
      if (saved) clearSession()
      setSession(null)
    }
  }, [])

  // Auto-expire the session exactly at its deadline, without needing a reload.
  // The in-memory session is kept (so an in-flight submission can finish),
  // but localStorage is purged so a later reload lands in view-only mode.
  useEffect(() => {
    if (!session) return
    setExpired(false)
    const msLeft = session.expiry - Date.now()
    if (msLeft <= 0) {
      setExpired(true)
      clearSession()
      return
    }
    const timer = setTimeout(() => {
      setExpired(true)
      clearSession()
    }, msLeft)
    return () => clearTimeout(timer)
  }, [session])

  return {
    canOrder: session !== null && !expired,
    tableNumber: session?.table ?? null,
    token: session?.token ?? null,
    resolving,
    tokenInvalid,
    expired,
  }
}
