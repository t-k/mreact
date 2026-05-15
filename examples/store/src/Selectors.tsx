// Selectors — derive ReadonlyCell views of one slice at a time.
// Demonstrates: store.select<U>((state) => U) returning a ReadonlyCell.
// Each selector only recomputes when its picked slice actually changes.
// See README.md > Tour.
import { cartStore } from "./store.ts";

const itemCount = cartStore.select((state) =>
  state.lines.reduce((sum, line) => sum + line.quantity, 0),
);
const subtotal = cartStore.select((state) =>
  state.lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
);
const discountedTotal = cartStore.select((state) => {
  const base = state.lines.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0,
  );
  return state.promoCode === "MREACT10" ? base * 0.9 : base;
});

export function App() {
  return (
    <main>
      <h1>selectors</h1>
      <p>
        Three independent <code>select</code> calls. Each reads only the
        fields it needs, so the total recomputes when quantities change
        but item-count does not flicker for promo changes.
      </p>
      <dl>
        <dt>items</dt><dd><strong>{itemCount.get()}</strong></dd>
        <dt>subtotal</dt><dd>$<strong>{subtotal.get()}</strong></dd>
        <dt>after promo</dt><dd>$<strong>{discountedTotal.get().toFixed(2)}</strong></dd>
      </dl>
      <p>
        Mutate the cart from <a href="/cart.html">/cart.html</a> (open
        in a second tab); the numbers above update via the shared store.
      </p>
      <p><a href="/index.html">← Back</a></p>
    </main>
  );
}
