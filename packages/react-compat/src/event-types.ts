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
  clientX?: number;
  clientY?: number;
  pageX?: number;
  pageY?: number;
  screenX?: number;
  screenY?: number;
  relatedTarget?: EventTarget | null;
  touches?: TouchList;
  changedTouches?: TouchList;
  key?: string;
  persist(): void;
  preventDefault(): void;
  stopPropagation(): void;
  isDefaultPrevented(): boolean;
  isPersistent(): boolean;
  isPropagationStopped(): boolean;
}
