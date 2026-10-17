import { usePosStore } from "../store/posStore";

export default function Header() {
  const {
    orderType,
    setOrderType,
    setSearch,
    setCategory
  } = usePosStore();

  return (
    <div className="p-4 flex gap-4">
      <select onChange={(e) => setOrderType(e.target.value)}>
        <option>DINE_IN</option>
        <option>TAKEAWAY</option>
        <option>DELIVERY</option>
      </select>

      <input
        placeholder="Search..."
        onChange={(e) => setSearch(e.target.value)}
      />

      <button onClick={() => setCategory("All")}>Reset</button>
    </div>
  );
}