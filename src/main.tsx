import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { App } from "./app/App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {/* Vercel Web Analytics: page views only; game files never leave the browser */}
    <Analytics />
  </StrictMode>,
);
