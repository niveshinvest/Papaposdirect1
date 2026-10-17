import { usePosStore } from "../../store/posStore";
import { X, Utensils } from "lucide-react";

export type Table = {
  id: string;
  name: string;
  capacity: number;
  status?: "available" | "occupied";
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function TableSelector({ isOpen, onClose }: Props) {
  const tables = usePosStore((s) => s.tables);
  const selectedTable = usePosStore((s) => s.selectedTable);
  const setSelectedTable = usePosStore((s) => s.setSelectedTable);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 `z-1500` flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
      <div className="bg-white rounded-[32px] w-full max-w-4xl shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in duration-300">

        {/* HEADER */}
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-black uppercase">Select Table</h3>
            <p className="text-[10px] text-slate-400 uppercase">
              Choose active table
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white border hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-6">
          {tables.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-300">
              <Utensils size={48} />
              <p className="text-xs font-bold mt-2 uppercase">
                No tables defined
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {tables.map((table) => {
                const isActive = selectedTable?.id === table.id;

                return (
                  <button
                    key={table.id}
                    onClick={() => {
                      setSelectedTable(table);
                      onClose();
                    }}
                    disabled={table.status === "occupied"}
                    className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all
                      ${
                        isActive
                          ? "bg-indigo-600 text-white border-indigo-600 scale-105"
                          : table.status === "occupied"
                          ? "bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed"
                          : "bg-white hover:border-orange-500 hover:scale-105"
                      }`}
                  >
                    <Utensils
                      size={20}
                      className={
                        isActive ? "text-white" : "text-slate-400"
                      }
                    />
                    <div className="text-center">
                      <div className="font-bold text-sm">
                        {table.name}
                      </div>
                      <div className="text-[10px] uppercase text-slate-400">
                        {table.capacity} pax
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t flex justify-end bg-slate-50">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
