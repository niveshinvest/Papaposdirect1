import { usePosStore } from "../store/posStore";

export default function Cart() {
  const cart = usePosStore((s) => s.cart);
  const updateQty = usePosStore((s) => s.updateQty);

  return (
    <div className="p-4 space-y-3">
      {cart.map((item) => (
        <div key={item.id} className="flex justify-between">
          <span>{item.name}</span>
          <div className="flex gap-2">
            <button onClick={() => updateQty(item.id, -1)}>-</button>
            <span>{item.quantity}</span>
            <button onClick={() => updateQty(item.id, 1)}>+</button>
          </div>
        </div>
      ))}
    </div>
  );
}