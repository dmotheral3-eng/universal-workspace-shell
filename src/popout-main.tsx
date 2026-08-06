import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { LawDogGate } from "./shell/lawdog-gate";
import { PopoutApp } from "./shell/popout-app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LawDogGate>
      <PopoutApp />
    </LawDogGate>
  </StrictMode>
);
