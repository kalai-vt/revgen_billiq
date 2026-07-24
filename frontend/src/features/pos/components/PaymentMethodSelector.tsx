import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import type { PaymentMethod } from '@/features/pos/api';

interface PaymentMethodSelectorProps {
  method: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  amountTendered: number | null;
  onAmountTenderedChange: (value: number | null) => void;
  total: number;
}

export function PaymentMethodSelector({
  method,
  onMethodChange,
  amountTendered,
  onAmountTenderedChange,
  total,
}: PaymentMethodSelectorProps) {
  const change = method === 'cash' && amountTendered !== null ? amountTendered - total : null;

  return (
    <div className="space-y-2">
      <Tabs value={method} onValueChange={(value) => onMethodChange(value as PaymentMethod)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="cash">Cash</TabsTrigger>
          <TabsTrigger value="card">Card</TabsTrigger>
          <TabsTrigger value="upi">UPI</TabsTrigger>
        </TabsList>
      </Tabs>
      {method === 'cash' && (
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="amount-tendered" className="text-xs text-muted-foreground">
              Amount tendered
            </Label>
            <NumericInput
              id="amount-tendered"
              min={0}
              required={false}
              value={amountTendered}
              onChange={onAmountTenderedChange}
            />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Change due</p>
            <p className={`text-lg font-semibold ${change !== null && change < 0 ? 'text-destructive' : ''}`}>
              {change !== null ? change.toFixed(2) : '—'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
