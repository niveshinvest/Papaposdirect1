import { usePosStore } from "../store/posStore";
import { getMopIcon } from "../utils/Mop";

export default function PaymentBar() {
  const selectedMop = usePosStore((s) => s.selectedMop);

  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 border-b">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
          {getMopIcon(selectedMop?.type)}
        </div>
        <div>
          <p className="text-xs text-slate-400">Pay Via</p>
          <p className="font-bold">
            {selectedMop?.name || "Select Mode"}
          </p>
        </div>
      </div>
    </div>
  );











  
}