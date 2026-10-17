import React, { memo } from 'react';
import {
  Banknote,
  CreditCard,
  Wallet,
  Receipt
} from 'lucide-react';

interface Props {
  selectedMop: any;
  onChange: () => void;
}

const getMopIcon = (type: string) => {
  switch (type) {
    case 'CASH':
      return <Banknote size={16} />;

    case 'CARD':
      return <CreditCard size={16} />;

    case 'DIGITAL':
      return <Wallet size={16} />;

    default:
      return <Receipt size={16} />;
  }
};

const PaymentModeBar: React.FC<Props> = ({
  selectedMop,
  onChange
}) => {
  return (
    <div className="px-4 py-4 bg-slate-50 flex items-center justify-between border-b">

      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
          {getMopIcon(selectedMop?.type || 'CASH')}
        </div>

        <div>
          <p className="text-[9px] font-black uppercase text-slate-400">
            Pay Via
          </p>

          <p className="font-black text-slate-900 text-sm">
            {selectedMop?.name || 'Select Mode'}
          </p>
        </div>
      </div>

      <button
        onClick={onChange}
        className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-black text-[9px] uppercase tracking-widest text-indigo-600 shadow-sm hover:bg-indigo-50 transition-all"
      >
        Change
      </button>
    </div>
  );
};

export default memo(PaymentModeBar);