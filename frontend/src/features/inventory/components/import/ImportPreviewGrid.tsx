import { useCallback, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import type { CellValueChangedEvent, ColDef, ICellRendererParams } from 'ag-grid-community';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import * as inventoryApi from '@/features/inventory/api';
import type { ImportRow } from '@/features/inventory/api';
import { ApiError } from '@/lib/api-client';

ModuleRegistry.registerModules([AllCommunityModule]);

interface ImportPreviewGridProps {
  importId: string;
  rows: ImportRow[];
  onRowsChange: (rows: ImportRow[]) => void;
}

function StatusCellRenderer(params: ICellRendererParams<ImportRow>) {
  const status = params.value as string;
  if (status === 'error') return <Badge variant="destructive">Error</Badge>;
  if (status === 'warning') {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-500">
        Warning
      </Badge>
    );
  }
  return <Badge variant="secondary">Ready</Badge>;
}

const EDITABLE_FIELDS = new Set(['quantity', 'cost_price', 'selling_price', 'tax_percent', 'is_skipped']);

export function ImportPreviewGrid({ importId, rows, onRowsChange }: ImportPreviewGridProps) {
  const [, setPendingRowId] = useState<string | null>(null);

  const handleCellValueChanged = useCallback(
    async (event: CellValueChangedEvent<ImportRow>) => {
      const row = event.data;
      const field = event.colDef.field;
      if (!row || !field || !EDITABLE_FIELDS.has(field)) return;

      const payload: inventoryApi.ImportRowUpdatePayload = { [field]: row[field as keyof ImportRow] } as never;
      setPendingRowId(row.id);
      try {
        const updated = await inventoryApi.updateImportRow(importId, row.id, payload);
        onRowsChange(rows.map((r) => (r.id === row.id ? updated : r)));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Could not update row');
      } finally {
        setPendingRowId(null);
      }
    },
    [importId, rows, onRowsChange],
  );

  const columnDefs = useMemo<ColDef<ImportRow>[]>(
    () => [
      { field: 'row_number', headerName: '#', width: 56, minWidth: 56, editable: false },
      {
        field: 'product_name',
        headerName: 'Product',
        flex: 1,
        minWidth: 200,
        editable: false,
        valueFormatter: (p) => p.value ?? '—',
      },
      {
        field: 'current_stock',
        headerName: 'Current Stock',
        width: 120,
        minWidth: 120,
        editable: false,
        valueFormatter: (p) => (p.value === null || p.value === undefined ? '—' : String(p.value)),
      },
      { field: 'quantity', headerName: 'Imported Quantity', width: 150, minWidth: 150, editable: true, cellDataType: 'number' },
      { field: 'cost_price', headerName: 'Cost Price', width: 110, minWidth: 110, editable: true, cellDataType: 'number' },
      { field: 'selling_price', headerName: 'Selling Price', width: 120, minWidth: 120, editable: true, cellDataType: 'number' },
      { field: 'tax_percent', headerName: 'Tax %', width: 90, minWidth: 90, editable: true, cellDataType: 'number' },
      {
        field: 'status',
        headerName: 'Status',
        width: 100,
        minWidth: 100,
        editable: false,
        cellRenderer: StatusCellRenderer,
        tooltipValueGetter: (p) => (p.data?.error_messages ?? []).join('; ') || undefined,
      },
      {
        field: 'is_skipped',
        headerName: 'Skip',
        width: 70,
        minWidth: 70,
        editable: true,
        cellRenderer: 'agCheckboxCellRenderer',
        cellEditor: 'agCheckboxCellEditor',
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef>(() => ({ resizable: true, sortable: false, filter: false }), []);

  return (
    <div style={{ height: 480, width: '100%' }}>
      <AgGridReact<ImportRow>
        theme={themeQuartz}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={(params) => params.data.id}
        onCellValueChanged={handleCellValueChanged}
        stopEditingWhenCellsLoseFocus
        tooltipShowDelay={200}
      />
    </div>
  );
}
