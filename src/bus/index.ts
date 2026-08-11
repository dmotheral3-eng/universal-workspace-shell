export interface EntitySelectedEvent {
  scopeId: string;
  entityId: string;
  entityName: string;
}

export interface ItemSelectedEvent {
  scopeId: string;
  itemId: string;
  itemTitle: string;
  entityId: string;
}

export interface DocOpenEvent {
  scopeId: string;
  docId: string;
  docTitle: string;
}

export interface DocSectionEvent {
  scopeId: string;
  docId: string;
  sectionId: string;
}

export interface ChatContextEvent {
  scopeId: string;
  entityId: string | null;
  entityName: string | null;
  itemId: string | null;
  itemTitle: string | null;
}

/**
 * "Put the cursor in the Ask box." Navigation gets the rail on screen; this is
 * the part that makes "Ask a question →" land the reader somewhere they can type.
 */
export interface AskFocusEvent {
  scopeId: string;
}

/**
 * Pre-set the Evidence view's status filter, so a count on another screen can
 * open the evidence already narrowed to the documents it was counting. Buckets
 * are the `statusTone()` buckets; "all" clears the filter.
 */
export interface EvidenceFilterEvent {
  scopeId: string;
  filter: "all" | "good" | "warn" | "risk";
}

export interface BusEvents {
  "entity.selected": EntitySelectedEvent;
  "item.selected": ItemSelectedEvent;
  "doc.open": DocOpenEvent;
  "doc.section": DocSectionEvent;
  "chat.context": ChatContextEvent;
  "ask.focus": AskFocusEvent;
  "evidence.filter": EvidenceFilterEvent;
}

export type BusEventName = keyof BusEvents;

type Listener<T> = (payload: T) => void;

class EventBus {
  private listeners: Map<string, Set<Listener<unknown>>> = new Map();
  private broadcastHook: (<K extends BusEventName>(event: K, payload: BusEvents[K]) => void) | null = null;

  setBroadcastHook(hook: <K extends BusEventName>(event: K, payload: BusEvents[K]) => void): void {
    this.broadcastHook = hook;
  }

  on<K extends BusEventName>(event: K, listener: Listener<BusEvents[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as Listener<unknown>);
    return () => {
      set.delete(listener as Listener<unknown>);
    };
  }

  onScoped<K extends BusEventName>(
    event: K,
    scopeId: string | null,
    listener: Listener<BusEvents[K]>
  ): () => void {
    const wrapped = (payload: BusEvents[K]) => {
      const p = payload as { scopeId: string };
      if (scopeId === null || p.scopeId === scopeId) {
        listener(payload);
      }
    };
    return this.on(event, wrapped as Listener<BusEvents[K]>);
  }

  emit<K extends BusEventName>(event: K, payload: BusEvents[K]): void {
    this.emitLocal(event, payload);
    if (this.broadcastHook) {
      this.broadcastHook(event, payload);
    }
  }

  emitLocal<K extends BusEventName>(event: K, payload: BusEvents[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((listener) => listener(payload));
    }
  }

  off<K extends BusEventName>(event: K, listener: Listener<BusEvents[K]>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener as Listener<unknown>);
    }
  }
}

export const bus = new EventBus();
