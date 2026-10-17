import * as XLSX from 'xlsx';

type TemplateSheet = {
  name: string;
  rows: Record<string, any>[];
};

const downloadWorkbook = (fileName: string, sheets: TemplateSheet[]) => {
  const workbook = XLSX.utils.book_new();

  sheets.forEach(sheet => {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  });

  XLSX.writeFile(workbook, fileName);
};

export const templateExportService = {
  downloadInventoryBulkTemplate() {
    downloadWorkbook('PapaPOS_Inventory_Bulk_Import_Proforma.xlsx', [
      {
        name: 'Stock Import',
        rows: [
          {
            ItemName: 'Tomato',
            Qty: 12.5,
            CostPrice: 28,
            BatchCode: 'TOM-APR-01',
            Expiry: '2026-04-30',
          },
          {
            ItemName: 'Paneer',
            Qty: 8,
            CostPrice: 320,
            BatchCode: 'PAN-APR-02',
            Expiry: '2026-04-12',
          },
        ],
      },
      {
        name: 'Instructions',
        rows: [
          { Field: 'ItemName', Required: 'Yes', Notes: 'Inventory item name exactly as used in PapaPOS inventory master.' },
          { Field: 'Qty', Required: 'Yes', Notes: 'Numeric quantity to stock in.' },
          { Field: 'CostPrice', Required: 'Yes', Notes: 'Unit cost price for the inbound batch.' },
          { Field: 'BatchCode', Required: 'No', Notes: 'Optional batch or lot code. Defaults to BULK-IMPORT if empty.' },
          { Field: 'Expiry', Required: 'No', Notes: 'Optional expiry date in YYYY-MM-DD format.' },
        ],
      },
    ]);
  },

  downloadMenuBulkTemplate() {
    downloadWorkbook('PapaPOS_Menu_Bulk_Import_Proforma.xlsx', [
      {
        name: 'Menu Import',
        rows: [
          {
            Name: 'Paneer Butter Masala',
            Price: 249,
            Category: 'Main Course',
            Description: 'Creamy tomato gravy with paneer cubes.',
            'GST %': 5,
            'Price Includes Tax (YES/NO)': 'YES',
          },
          {
            Name: 'Masala Dosa',
            Price: 139,
            Category: 'Breakfast',
            Description: 'Crisp dosa with spiced potato filling.',
            'GST %': 5,
            'Price Includes Tax (YES/NO)': 'NO',
          },
        ],
      },
      {
        name: 'Instructions',
        rows: [
          { Field: 'Name', Required: 'Yes', Notes: 'Menu item display name.' },
          { Field: 'Price', Required: 'Yes', Notes: 'Base selling price as a number.' },
          { Field: 'Category', Required: 'Yes', Notes: 'Category name. PapaPOS will create the category if it does not exist.' },
          { Field: 'Description', Required: 'No', Notes: 'Short item description.' },
          { Field: 'GST %', Required: 'No', Notes: 'Tax percentage like 5, 12, or 18. Defaults based on importer logic if omitted.' },
          { Field: 'Price Includes Tax (YES/NO)', Required: 'No', Notes: 'Use YES for inclusive pricing, NO for exclusive pricing.' },
        ],
      },
    ]);
  },
};
