import React from 'react';
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from '@tanstack/react-table';

interface EntityTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  className?: string;
}

export function EntityTable<T>({ columns, data, className }: EntityTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className={className}>
      <table className="w-full text-left border-collapse">
        <thead className="text-xs text-slate-400 uppercase tracking-widest">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th key={header.id} className="px-4 py-3 border-b border-slate-100">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="text-sm text-slate-700">
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className="hover:bg-slate-50/50">
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className="px-4 py-3 border-b border-slate-100">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default EntityTable;
