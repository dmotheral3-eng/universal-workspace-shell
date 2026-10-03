import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { LawDogGate } from "./shell/lawdog-gate";
import { PopoutApp } from "./shell/popout-app";
import { RefineHost } from "./shell/refine-host";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Same order as the main window: the host above the gate (BOR-136). */}
    <RefineHost>
      <LawDogGate>
        <PopoutApp />
      </LawDogGate>
    </RefineHost>
  </StrictMode>
);
