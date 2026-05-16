// Cart — the canonical store demo.
// Demonstrates: createStore + update(patch) + replace(fullState) +
// reactive reads of store.state inside JSX. See README.md > Tour.
import { cartStore, setQuantity, applyPromo, resetCart } from "./store.ts";

const cartState = cartStore.state;

export function App() {
  return (
    <main>
      <h1>cart store</h1>
      <p>
        One <code>createStore</code> shared across pages. Open
        <a href="/selectors.html"> /selectors.html</a> in a second tab,
        change the cart here, and watch only the relevant slices update
        there.
      </p>
      <table>
        <thead>
          <tr><th>item</th><th>price</th><th>qty</th><th>line</th></tr>
        </thead>
        <tbody>
          {cartState.get().lines.map((line) => (
            <tr key={line.id}>
              <td>{line.name}</td>
              <td>${line.price}</td>
              <td>
                <button
                  type="button"
                  onClick={() => setQuantity(line.id, line.quantity - 1)}
                >−</button>{" "}
                {line.quantity}{" "}
                <button
                  type="button"
                  onClick={() => setQuantity(line.id, line.quantity + 1)}
                >+</button>
              </td>
              <td>${line.price * line.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <button
          type="button"
          onClick={() =>
            setQuantity(
              "book",
              (cartState.get().lines.find((line) => line.id === "book")?.quantity ?? 0) + 1,
            )}
        >
          add one book
        </button>
      </p>
      <p>
        promo code: <strong>{cartState.get().promoCode ?? "(none)"}</strong>{" "}
        <button type="button" onClick={() => applyPromo("MREACT10")}>apply MREACT10</button>{" "}
        <button type="button" onClick={() => applyPromo(null)}>clear</button>
      </p>
      <p>
        <button type="button" onClick={() => resetCart()}>reset cart (replace)</button>
      </p>
      <p><a href="/index.html">← Back</a></p>
    </main>
  );
}
