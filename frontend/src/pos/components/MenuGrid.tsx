import { usePosStore } from "../store/posStore";

const dummyMenu = [
  { id: "1", name: "Burger", price: 120 },
  { id: "2", name: "Pizza", price: 200 },
];

export default function MenuGrid() {
  const addToCart = usePosStore((s) => s.addToCart);

  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      {dummyMenu.map((item) => (
        <button
          key={item.id}
          onClick={() => addToCart(item)}
          className="p-4 bg-white border rounded"
        >
          {item.name} ₹{item.price}
        </button>
      ))}
    </div>
  );
}