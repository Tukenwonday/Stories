function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message
    if (typeof m === "string" && m) return m
  }
  return String(error)
}

/**
 * Centralized error logging.
 * In development the full error object (message, stack, cause) is printed for
 * debugging. In production only the clean error message is printed, so raw
 * stack traces and backend/database details never leak into the browser
 * console.
 */
export function logError(error: unknown, context?: string): void {
  const label = context ? `[${context}]` : ""
  if (import.meta.env.DEV) {
    console.error(label, error)
  } else {
    console.error(label, toMessage(error))
  }
}
