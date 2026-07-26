import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DraggableList } from '@/features/invoice-designer/components/DraggableList';
import { FieldToggle } from '@/features/invoice-designer/components/FieldToggle';
import { ITEM_COLUMN_LABELS, type ColumnAlign, type ItemColumn } from '@/features/invoice-designer/api';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';

export function ItemTablePanel({ config, onChange }: PanelProps) {
  const columns = [...config.item_table.columns].sort((a, b) => a.order - b.order);

  function updateColumn(key: string, patch: Partial<ItemColumn>) {
    onChange((cfg) => ({
      ...cfg,
      item_table: {
        ...cfg.item_table,
        columns: cfg.item_table.columns.map((col) => (col.key === key ? { ...col, ...patch } : col)),
      },
    }));
  }

  function reorder(newColumns: ItemColumn[]) {
    onChange((cfg) => ({
      ...cfg,
      item_table: {
        ...cfg.item_table,
        columns: newColumns.map((col, index) => ({ ...col, order: index })),
      },
    }));
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs text-muted-foreground">Drag to reorder columns, then set visibility, alignment, and width for each.</p>
        <DraggableList
          items={columns.map((c) => ({ ...c, key: c.key }))}
          onReorder={reorder}
          renderItem={(col) => (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex min-w-36 flex-1 items-center gap-2">
                <Checkbox
                  checked={col.visible}
                  onCheckedChange={(v) => updateColumn(col.key, { visible: v === true })}
                  aria-label={`Show ${ITEM_COLUMN_LABELS[col.key]}`}
                />
                <span className="truncate text-sm">{ITEM_COLUMN_LABELS[col.key]}</span>
              </label>
              <Select value={col.align} onValueChange={(v) => updateColumn(col.key, { align: v as ColumnAlign })}>
                <SelectTrigger size="sm" className="w-24 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-20 shrink-0">
                <Input
                  type="number"
                  placeholder="Auto"
                  className="pr-6"
                  value={col.width ?? ''}
                  onChange={(e) => updateColumn(col.key, { width: e.target.value ? Number(e.target.value) : null })}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-muted-foreground">%</span>
              </div>
            </div>
          )}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <FieldToggle
          id="table-borders"
          label="Table borders"
          checked={config.item_table.show_borders}
          onChange={(v) => onChange((cfg) => ({ ...cfg, item_table: { ...cfg.item_table, show_borders: v } }))}
        />
        <FieldToggle
          id="table-alt-rows"
          label="Alternate row colors"
          checked={config.item_table.alternate_row_colors}
          onChange={(v) => onChange((cfg) => ({ ...cfg, item_table: { ...cfg.item_table, alternate_row_colors: v } }))}
        />
      </div>
    </div>
  );
}
