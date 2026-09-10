import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as restaurantApi from '@/features/restaurant/api';

/** The Select needs a real string for "no table" — an empty value would clear the selection. */
export const NO_TABLE = '__no_table__';

interface TableSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

/** Picks the table a counter-rung cart belongs to, so a dine-in sale taken at the till is
 * attributed to its table and shows up in table-wise reporting.
 *
 * Occupied tables stay selectable on purpose: ringing up more items for a table that already has
 * a running tab is ordinary — the server appends to that tab and bills it, rather than opening a
 * second order on the same table.
 */
export function TableSelector({ value, onChange }: TableSelectorProps) {
  const { data: layout } = useQuery({
    queryKey: ['restaurant', 'layout'],
    queryFn: restaurantApi.getLayout,
    // A table freed or taken by another till shouldn't need a page reload to show up here.
    staleTime: 15_000,
  });

  const tables = (layout ?? []).flatMap((group) =>
    group.tables.map((table) => ({ table, floor: group.floor?.name })),
  );

  function label(current: string | null): string {
    if (!current || current === NO_TABLE) return 'No table';
    const match = tables.find((entry) => entry.table.id === current);
    if (!match) return 'No table';
    return `${match.table.name}${match.floor ? ` · ${match.floor}` : ''}`;
  }

  if (tables.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-1.5">
      <label htmlFor="checkout-table" className="text-xs text-muted-foreground">
        Table
      </label>
      <Select value={value} onValueChange={(next) => onChange(next ?? NO_TABLE)}>
        <SelectTrigger id="checkout-table" size="sm" className="w-40">
          {/* base-ui shows the raw value without a mapper, and the raw value is a table id. */}
          <SelectValue>{(current: string | null) => label(current)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TABLE}>No table</SelectItem>
          {tables.map(({ table, floor }) => (
            <SelectItem key={table.id} value={table.id}>
              {table.name}
              {floor ? ` · ${floor}` : ''}
              {table.active_order_id ? ' — running tab' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
