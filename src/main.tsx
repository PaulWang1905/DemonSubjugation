import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/silkscreen/400.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
