export interface SyntheticEvent {
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented: boolean;
  eventPhase: number;
  isTrusted: boolean;
  nativeEvent: Event;
  timeStamp: number;
  type: string;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  persist(): void;
  preventDefault(): void;
  stopPropagation(): void;
  isDefaultPrevented(): boolean;
  isPersistent(): boolean;
  isPropagationStopped(): boolean;
}
