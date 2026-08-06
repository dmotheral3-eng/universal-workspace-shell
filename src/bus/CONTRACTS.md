# Event Bus Contracts

All inter-panel communication flows through the typed event bus at `@/bus`.

## Scoped Events

Every event payload includes a `scopeId: string` field. This enables multi-instance panels to operate independently.

### Scope Model

- An **EntityList** instance publishes events using its own `tab.id` as the `scopeId`.
- Subscribing panels read their `tab.scopeId` (set via the panel's "Follow scope" menu) and use `bus.onScoped(event, scopeId, listener)`.
- If `tab.scopeId` is `undefined`, the panel passes `null` to `onScoped`, which means "listen to ALL scopes" (global behavior).
- A panel can be re-pointed to follow a different EntityList instance via `setScopeForTab(tabId, newScopeId)` in layout-context.

### `bus.onScoped(event, scopeId, listener)`

Wraps `bus.on()` with a filter: the listener only fires when `payload.scopeId === scopeId`, or when `scopeId === null` (wildcard).

---

## Event Types

### `entity.selected`

Published by: **EntityList**

```typescript
interface EntitySelectedEvent {
  scopeId: string;    // tab.id of the publishing EntityList
  entityId: string;
  entityName: string;
}
```

Consumed by: ItemTable, ReadingPane, StageTracker, MetricGrid, ChatRail (via chat.context)

---

### `item.selected`

Published by: **ItemTable**

```typescript
interface ItemSelectedEvent {
  scopeId: string;    // forwarded from the entity.selected scope
  itemId: string;
  itemTitle: string;
  entityId: string;
}
```

Consumed by: ReadingPane, ChatRail (via chat.context)

---

### `doc.open`

Published by: **DocBrowser**, **ChatRail** (citation clicks)

```typescript
interface DocOpenEvent {
  scopeId: string;
  docId: string;
  docTitle: string;
}
```

Consumed by: ReadingPane

---

### `doc.section`

Published by: **ChatRail** (citation clicks)

```typescript
interface DocSectionEvent {
  scopeId: string;
  docId: string;
  sectionId: string;
}
```

Consumed by: ReadingPane (scrolls to section)

---

### `chat.context`

Published by: **EntityList**, **ItemTable** (contextual update)

```typescript
interface ChatContextEvent {
  scopeId: string;
  entityId: string | null;
  entityName: string | null;
  itemId: string | null;
  itemTitle: string | null;
}
```

Consumed by: ChatRail (shows context chip)

---

## Subscription Patterns

### Following a specific EntityList instance

```typescript
const { tab } = usePanelScope();
const scopeId = tab.scopeId ?? null; // null = follow all

useEffect(() => {
  return bus.onScoped("entity.selected", scopeId, (event) => {
    // Only fires for events from the matched scope
  });
}, [scopeId]);
```

### Publishing with scope

```typescript
const { tab } = usePanelScope();

bus.emit("entity.selected", {
  scopeId: tab.id, // EntityList uses its own id as scope
  entityId: entity.id,
  entityName: entity.name,
});
```

### Changing followed scope at runtime

The panel container's "..." menu shows a "Follow scope" submenu listing all EntityList instances. Selecting one calls:

```typescript
setScopeForTab(tab.id, selectedEntityListTabId);
```

This updates `tab.scopeId` in the layout tree, causing the panel to re-subscribe to the new scope.
