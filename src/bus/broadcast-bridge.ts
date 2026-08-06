import { bus, type BusEventName, type BusEvents } from "./index";

const CHANNEL_NAME = "workspace-bus";
const INSTANCE_ID = crypto.randomUUID();

interface BridgeMessage<K extends BusEventName = BusEventName> {
  senderId: string;
  event: K;
  payload: BusEvents[K];
}

let channel: BroadcastChannel | null = null;

export function initBusBridge(): void {
  if (channel) return;
  channel = new BroadcastChannel(CHANNEL_NAME);

  channel.onmessage = (e: MessageEvent<BridgeMessage>) => {
    const { senderId, event, payload } = e.data;
    if (senderId === INSTANCE_ID) return;
    bus.emitLocal(event, payload);
  };

  bus.setBroadcastHook(<K extends BusEventName>(event: K, payload: BusEvents[K]) => {
    if (!channel) return;
    const msg: BridgeMessage<K> = { senderId: INSTANCE_ID, event, payload };
    channel.postMessage(msg);
  });
}

export function destroyBusBridge(): void {
  if (channel) {
    channel.close();
    channel = null;
  }
}
