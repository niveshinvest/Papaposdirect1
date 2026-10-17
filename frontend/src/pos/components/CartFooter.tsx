import React, { memo } from 'react';
import {
  Printer,
  Loader2,
  Wifi,
  WifiOff
} from 'lucide-react';

interface CartFooterProps {
  totals: any;
  isOnline: boolean;
  selectedMop: any;
  cart: any[];
  isProcessing: boolean;
  directPrintAvailable: boolean;
  handleFinalizeAndPrint: () => void;
}

const CartFooter: React.FC<CartFooterProps> = ({
  totals,
  isOnline,
  selectedMop,
  cart,
  isProcessing,
  directPrintAvailable,
  handleFinalizeAndPrint
}) => {
  return (
    <div className="p-5 bg-slate-900 text-white border-t border-slate-700 shadow-2xl shrink-0 sticky bottom-0 left-0 right-0 z-20">

      <div className="flex items-center justify-between mb-4">
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${
            isOnline
              ? 'border-emerald-500/20 text-emerald-500'
              : 'border-rose-500/20 text-rose-500'
          }`}
        >
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="text-[9px] font-black uppercase">
            {isOnline ? 'Sync' : 'Offline'}
          </span>
        </div>

        <div className="text-right">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Grand Payable
          </p>

          <span className="font-black text-3xl text-orange-500 tracking-tighter">
            ₹{totals.grandTotal}
          </span>
        </div>
      </div>

      <button
        onClick={handleFinalizeAndPrint}
        disabled={
          cart.length === 0 ||
          isProcessing ||
          !selectedMop
        }
        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-emerald-900/30 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
      >
        {isProcessing ? (
          <Loader2 className="animate-spin" size={24} />
        ) : (
          <>
            <div className="p-2 bg-white/20 rounded-xl">
              <Printer size={20} />
            </div>

            {directPrintAvailable
              ? `FINALIZE & PRINT (₹${totals.grandTotal})`
              : `FINALIZE & PREVIEW (₹${totals.grandTotal})`}
          </>
        )}
      </button>
    </div>
  );
};

export default memo(CartFooter);