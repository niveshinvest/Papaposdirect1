import { Banknote, CreditCard, Wallet, Receipt } from "lucide-react";
import type { ReactNode } from "react";

export type PaymentType = "CASH" | "CARD" | "DIGITAL";

const mopIcons = {
  CASH: <Banknote size={16} />,
  CARD: <CreditCard size={16} />,
  DIGITAL: <Wallet size={16} />,
} as const;

export const getMopIcon = (type?: string): ReactNode => {
  return mopIcons[type as keyof typeof mopIcons] ?? <Receipt size={16} />;
};