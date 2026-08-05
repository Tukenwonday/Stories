import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import Kitchen from "./components/Kitchen"
import Checkout from "./components/Checkout"
import "./index.css"

const path = window.location.pathname
const isKitchen = path === "/kitchen"
const isCheckout = path === "/checkout"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isKitchen ? <Kitchen /> : isCheckout ? <Checkout /> : <App />}
  </React.StrictMode>,
)
