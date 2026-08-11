import { getBrand, getConfig, type PanelType } from "@/config";
import { useLayout } from "./layout-context";
import { PRESET_NAMES } from "./presets";
import { Download, Upload, Layout, PanelLeft, Undo2, RotateCcw, Check, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

const ALL_PANEL_TYPES: PanelType[] = [
  "EntityList", "MatterHome", "ItemTable", "ReadingPane", "ChatRail", "StageTracker", "DocBrowser", "MetricGrid", "MasterBoard", "CoverageMatrix",
  "Parties", "Rates", "Savings", "Subpoenas", "ClaimValue", "RecoveryOutlook",
];

/** The profile decides which panels exist; this list only fixes their order.
 *  A profile that registers no panels gets all of them, as before. */
function availablePanelTypes(): PanelType[] {
  const registered = getConfig().panels;
  if (!registered || registered.length === 0) return ALL_PANEL_TYPES;
  return ALL_PANEL_TYPES.filter((pt) => registered.includes(pt));
}

function panelLabel(panelType: PanelType): string {
  const vocab = getConfig().vocabulary;
  switch (panelType) {
    case "EntityList": return vocab.entityPlural;
    case "MatterHome": return `${vocab.entity} home`;
    case "ItemTable": return vocab.itemPlural;
    case "ReadingPane": return "Reading Pane";
    case "ChatRail": return "Ask";
    case "StageTracker": return "Stages";
    case "DocBrowser": return "Evidence";
    case "MetricGrid": return "Metrics";
    case "MasterBoard": return "Master Board";
    case "CoverageMatrix": return "Coverage Matrix";
    case "Parties": return "Parties";
    case "Rates": return "Rates";
    case "Savings": return "Savings";
    case "Subpoenas": return "Subpoenas";
    case "ClaimValue": return "Claim value";
    case "RecoveryOutlook": return "Recovery outlook";
  }
}

export function WorkspaceHeader() {
  const brand = getBrand();
  const {
    switchLayout, resetToDefault, undo, canUndo,
    savedLayouts, saveLayout, loadLayout,
    exportLayout, importLayout,
    openPanel, openNewInstance, getVisiblePanelTypes,
  } = useLayout();

  const visiblePanels = getVisiblePanelTypes();
  const panelTypes = availablePanelTypes();

  const handleExport = () => {
    const json = exportLayout();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workspace-layout.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        importLayout(text);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleSave = () => {
    const name = window.prompt("Layout name:");
    if (name) saveLayout(name);
  };

  return (
    <header className="flex h-10 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          {brand.logoText}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <PanelLeft className="h-3.5 w-3.5" />
              Panels
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {panelTypes.map((pt) => {
              const visible = visiblePanels.includes(pt);
              return (
                <DropdownMenuItem
                  key={pt}
                  onClick={() => { if (!visible) openPanel(pt); }}
                  className="text-xs flex items-center justify-between"
                >
                  <span>{panelLabel(pt)}</span>
                  {visible && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs">
                <Plus className="mr-2 h-3.5 w-3.5" />
                Open new instance
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {panelTypes.map((pt) => (
                  <DropdownMenuItem
                    key={pt}
                    onClick={() => openNewInstance(pt)}
                    className="text-xs"
                  >
                    {panelLabel(pt)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <Layout className="h-3.5 w-3.5" />
              Layout
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {PRESET_NAMES.map((name) => (
              <DropdownMenuItem key={name} onClick={() => switchLayout(name)} className="text-xs">
                {name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={resetToDefault} className="text-xs">
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Reset to default
            </DropdownMenuItem>
            <DropdownMenuItem onClick={undo} disabled={!canUndo} className="text-xs">
              <Undo2 className="mr-2 h-3.5 w-3.5" />
              Undo
            </DropdownMenuItem>
            {savedLayouts.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="text-xs">Saved</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {savedLayouts.map((l) => (
                      <DropdownMenuItem key={l.name} onClick={() => loadLayout(l.name)} className="text-xs">
                        {l.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSave} className="text-xs">
              Save current layout
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleExport} className="text-xs">
              <Download className="mr-2 h-3.5 w-3.5" />
              Export layout
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleImport} className="text-xs">
              <Upload className="mr-2 h-3.5 w-3.5" />
              Import layout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
