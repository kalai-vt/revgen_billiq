import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import * as restaurantApi from '@/features/restaurant/api';
import { ApiError } from '@/lib/api-client';

const UNASSIGNED = '__none__';

export function TableSetupPage() {
  const queryClient = useQueryClient();
  const [floorName, setFloorName] = useState('');
  const [tableName, setTableName] = useState('');
  const [tableSeats, setTableSeats] = useState('4');
  const [tableFloorId, setTableFloorId] = useState<string>(UNASSIGNED);

  const { data: floors, isLoading: floorsLoading } = useQuery({
    queryKey: ['restaurant', 'floors'],
    queryFn: restaurantApi.listFloors,
  });
  const { data: tables, isLoading: tablesLoading } = useQuery({
    queryKey: ['restaurant', 'tables'],
    queryFn: () => restaurantApi.listTables(),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['restaurant'] });
  }
  function fail(err: unknown, fallback: string) {
    toast.error(err instanceof ApiError ? err.message : fallback);
  }

  const addFloor = useMutation({
    mutationFn: () => restaurantApi.createFloor({ name: floorName.trim() }),
    onSuccess: () => {
      toast.success('Floor added');
      setFloorName('');
      invalidate();
    },
    onError: (err) => fail(err, 'Could not add that floor'),
  });

  const removeFloor = useMutation({
    mutationFn: (floorId: string) => restaurantApi.deleteFloor(floorId),
    onSuccess: () => {
      toast.success('Floor removed');
      invalidate();
    },
    onError: (err) => fail(err, 'Could not remove that floor'),
  });

  const addTable = useMutation({
    mutationFn: () =>
      restaurantApi.createTable({
        name: tableName.trim(),
        seats: Number(tableSeats) || 4,
        floor_id: tableFloorId === UNASSIGNED ? null : tableFloorId,
      }),
    onSuccess: () => {
      toast.success('Table added');
      setTableName('');
      invalidate();
    },
    onError: (err) => fail(err, 'Could not add that table'),
  });

  const removeTable = useMutation({
    mutationFn: (tableId: string) => restaurantApi.deleteTable(tableId),
    onSuccess: () => {
      toast.success('Table removed');
      invalidate();
    },
    onError: (err) => fail(err, 'Could not remove that table'),
  });

  function floorLabel(value: string | null): string {
    if (!value || value === UNASSIGNED) return 'No floor';
    return (floors ?? []).find((floor) => floor.id === value)?.name ?? 'No floor';
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Table setup</h1>
        <p className="text-sm text-muted-foreground">
          Group tables into floors or sections. A table with a running order can't be removed until it's billed.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <p className="text-sm font-medium">Floors</p>
          <div className="flex gap-2">
            <Input
              placeholder="Ground Floor"
              value={floorName}
              onChange={(e) => setFloorName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && floorName.trim()) addFloor.mutate();
              }}
            />
            <Button disabled={!floorName.trim() || addFloor.isPending} onClick={() => addFloor.mutate()}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          {floorsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (floors ?? []).length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">No floors yet — tables can go without one.</p>
          ) : (
            <div className="divide-y">
              {(floors ?? []).map((floor) => (
                <div key={floor.id} className="flex items-center justify-between py-2">
                  <span className="text-sm">{floor.name}</span>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => removeFloor.mutate(floor.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <p className="text-sm font-medium">Tables</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="table-name">Name</Label>
              <Input
                id="table-name"
                placeholder="Table 1"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="table-seats">Seats</Label>
              <Input
                id="table-seats"
                type="number"
                min={1}
                value={tableSeats}
                onChange={(e) => setTableSeats(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Floor</Label>
              <Select value={tableFloorId} onValueChange={(value) => setTableFloorId(value ?? UNASSIGNED)}>
                <SelectTrigger className="w-full">
                  {/* base-ui renders the raw value unless given a mapper, and the raw value here
                      is a floor UUID — meaningless to whoever is setting up the room. */}
                  <SelectValue>{(value: string | null) => floorLabel(value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>No floor</SelectItem>
                  {(floors ?? []).map((floor) => (
                    <SelectItem key={floor.id} value={floor.id}>{floor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="w-full"
            disabled={!tableName.trim() || addTable.isPending}
            onClick={() => addTable.mutate()}
          >
            <Plus className="size-4" />
            Add table
          </Button>

          {tablesLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (tables ?? []).length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">No tables yet.</p>
          ) : (
            <div className="divide-y">
              {(tables ?? []).map((table) => (
                <div key={table.id} className="flex items-center justify-between py-2">
                  <span className="text-sm">
                    {table.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {table.seats} seats · {restaurantApi.TABLE_STATUS_LABELS[table.status]}
                    </span>
                  </span>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => removeTable.mutate(table.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
