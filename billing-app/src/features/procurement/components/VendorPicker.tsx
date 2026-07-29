import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as procurementApi from '@/features/procurement/api';

interface VendorPickerProps {
  vendorId: string | null;
  onSelect: (vendorId: string | null) => void;
}

export function VendorPicker({ vendorId, onSelect }: VendorPickerProps) {
  const { data } = useQuery({
    queryKey: ['procurement-vendors-picker'],
    queryFn: () => procurementApi.listVendorsForPicker(),
  });

  return (
    <div className="space-y-1.5">
      <Label>Vendor</Label>
      <Select value={vendorId ?? ''} onValueChange={(value) => onSelect(value || null)}>
        <SelectTrigger className="w-full">
          <SelectValue>
            {() => {
              const vendor = data?.find((v) => v.id === vendorId);
              return vendor ? vendor.name : 'Select a vendor';
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {data?.map((vendor) => (
            <SelectItem key={vendor.id} value={vendor.id}>
              {vendor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
