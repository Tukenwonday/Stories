import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import Kitchen from "./components/Kitchen"
import "./index.css"

const isKitchen = window.location.pathname === "/kitchen"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isKitchen ? <Kitchen /> : <App />}
  </React.StrictMode>,
)
