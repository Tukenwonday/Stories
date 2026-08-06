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
      retry: 1,
    },
  },
})

const path = window.location.pathname
const isKitchen = path === "/kitchen"
const isCheckout = path === "/checkout"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {isKitchen ? <Kitchen /> : isCheckout ? <Checkout /> : <App />}
    </QueryClientProvider>
  </React.StrictMode>,
)
