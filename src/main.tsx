import React from "react"
import ReactDOM from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import App from "./App"
import Kitchen from "./components/Kitchen"
import Checkout from "./components/Checkout"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,   // 10 minutes (cache time)
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
})

const path = window.location.pathname
const isKitchen = path === "/kitchen"
const isCheckout = path === "/checkout"

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-foreground">
          <p className="text-xl font-bold">Something went wrong</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-gold px-6 py-3 text-sm font-bold text-bg"
          >
            Refresh Page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        {isKitchen ? <Kitchen /> : isCheckout ? <Checkout /> : <App />}
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
)
