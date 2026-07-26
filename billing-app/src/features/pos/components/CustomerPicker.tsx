import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as customersApi from '@/features/customers/api';

interface CustomerPickerProps {
  customerId: string | null;
  onSelect: (customer: customersApi.Customer | null) => void;
}

export function CustomerPicker({ customerId, onSelect }: CustomerPickerProps) {
  const { data } = useQuery({
    queryKey: ['customers-picker'],
    queryFn: () => customersApi.listCustomers({ page: 1, page_size: 50, is_active: true }),
  });

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">Customer</Label>
      <Select
        value={customerId ?? 'none'}
        onValueChange={(value) => {
          if (value === 'none') {
            onSelect(null);
            return;
          }
          const customer = data?.items.find((c) => c.id === value) ?? null;
          onSelect(customer);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue>
            {() => {
              const customer = data?.items.find((c) => c.id === customerId);
              return customer ? `${customer.name}${customer.mobile ? ` · ${customer.mobile}` : ''}` : 'No customer selected';
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No customer selected</SelectItem>
          {data?.items.map((customer) => (
            <SelectItem key={customer.id} value={customer.id}>
              {customer.name}
              {customer.mobile ? ` · ${customer.mobile}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
