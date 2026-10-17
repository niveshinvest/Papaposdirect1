import { create } from "zustand";
import { Table } from "../modules/table/TableSelector";

export type PaymentType = "CASH" | "CARD" | "DIGITAL";

export type Mop = {
  id: string;
  name: string;
  type: PaymentType;
  is_default?: boolean;
};

export type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

interface PosState {
  // CART
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  updateQty: (id: string, delta: number) => void;

  // PAYMENT
  selectedMop: Mop | null;
  setSelectedMop: (mop: Mop) => void;

   // TABLES  👈 ADD THIS PART
  tables: Table[];
  selectedTable: Table | null;
  setSelectedTable: (table: Table) => void;


  // TOTALS
  total: number;
  calculateTotal: () => void;
}

export const usePosStore = create<PosState>((set, get) => ({
  // =========================
  // CART
  // =========================
  cart: [],

  addToCart: (item) =>
    set((state) => {
      const exists = state.cart.find((i) => i.id === item.id);

      if (exists) {
        return {
          cart: state.cart.map((i) =>
            i.id === item.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }

      return {
        cart: [...state.cart, { ...item, quantity: 1 }],
      };
    }),

  updateQty: (id, delta) =>
    set((state) => ({
      cart: state.cart
        .map((i) =>
          i.id === id
            ? { ...i, quantity: i.quantity + delta }
            : i
        )
        .filter((i) => i.quantity > 0),
    })),

  // =========================
  // PAYMENT
  // =========================
  selectedMop: null,

  setSelectedMop: (mop) =>
    set({
      selectedMop: mop,
    }),

  // =========================
  // TABLES
  // =========================
  tables: [
    {
      id: "1",
      name: "T1",
      capacity: 4,
      status: "available",
    },
    {
      id: "2",
      name: "T2",
      capacity: 2,
      status: "occupied",
    },
  ],

  selectedTable: null,

  setSelectedTable: (table) =>
    set({
      selectedTable: table,
    }),

  // =========================
  // TOTALS
  // =========================
  total: 0,

  calculateTotal: () => {
    const total = get().cart.reduce(
      (sum, item) =>
        sum + item.price * item.quantity,
      0
    );

    set({ total });
  },
}));