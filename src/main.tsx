import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BenchApp } from "@/components/bench/bench-app";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BenchApp />
  </StrictMode>,
);
