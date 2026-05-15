// Shared store for the cart demo. Created once at module top level so
// every page that imports this file sees the same store instance. The
// store works with plain JS objects — the shallow `set` merges patches,
// `replace` swaps the whole state, and `select` exposes a reactive
// `ReadonlyCell` for any slice.
import { createStore } from "@reckona/mreact-store";

export interface CartLine {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface CartState {
  lines: CartLine[];
  promoCode: string | null;
}

const initial: CartState = {
  lines: [
    { id: "book", name: "Programmable Matter (book)", price: 24, quantity: 1 },
    { id: "shirt", name: "mreact T-shirt", price: 30, quantity: 0 },
  ],
  promoCode: null,
};

export const cartStore = createStore<CartState>(initial);

export function addLine(line: CartLine): void {
  cartStore.update((previous) => ({
    lines: [...previous.lines, line],
  }));
}

export function setQuantity(id: string, quantity: number): void {
  cartStore.update((previous) => ({
    lines: previous.lines.map((line) =>
      line.id === id ? { ...line, quantity: Math.max(0, quantity) } : line,
    ),
  }));
}

export function applyPromo(code: string | null): void {
  cartStore.set({ promoCode: code });
}

export function resetCart(): void {
  cartStore.replace(initial);
}
