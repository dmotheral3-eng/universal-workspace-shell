import { useEffect, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Entity } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "./layout-context";
import { PRESET_NAMES } from "./presets";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Layout, User, Search } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [entities, setEntities] = useState<Entity[]>([]);
  const { switchLayout } = useLayout();
  const vocab = getVocabulary();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open && entities.length === 0) {
      getDataProvider().listEntities().then(setEntities);
    }
  }, [open, entities.length]);

  const handleSelectEntity = (entity: Entity) => {
    bus.emit("entity.selected", { scopeId: "command-palette", entityId: entity.id, entityName: entity.name });
    bus.emit("chat.context", { scopeId: "command-palette", entityId: entity.id, entityName: entity.name, itemId: null, itemTitle: null });
    setOpen(false);
  };

  const handleSwitchLayout = (name: string) => {
    switchLayout(name);
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search or type a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Layouts">
          {PRESET_NAMES.map((name) => (
            <CommandItem key={name} onSelect={() => handleSwitchLayout(name)}>
              <Layout className="mr-2 h-4 w-4" />
              Switch to {name} layout
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={vocab.entityPlural}>
          {entities.map((entity) => (
            <CommandItem key={entity.id} onSelect={() => handleSelectEntity(entity)}>
              <User className="mr-2 h-4 w-4" />
              {entity.name}
              <span className="ml-2 text-xs text-muted-foreground">{entity.tags.join(", ")}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => setOpen(false)}>
            <Search className="mr-2 h-4 w-4" />
            Search across all panels
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
