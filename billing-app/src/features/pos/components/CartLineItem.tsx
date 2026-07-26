import { useRef } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/ui/numeric-input';
import type { CartLine } from '@/features/pos/hooks/useCart';
import { effectivePrice } from '@/features/pos/lib/pricing';

interface CartLineItemProps {
  line: CartLine;
  onQuantityChange: (quantity: number) => void;
  onPriceChange: (price: number | null) => void;
  onRemove: () => void;
  canOverridePrice: boolean;
}

export function CartLineItem({
  line,
  onQuantityChange,
  onPriceChange,
  onRemove,
  canOverridePrice,
}: CartLineItemProps) {
  const priceInputRef = useRef<HTMLInputElement>(null);
  const lineTotal = effectivePrice(line) * line.quantity;

  function applyQuantity(next: number | null) {
    const quantity = next ?? 0;
    if (quantity <= 0) {
      if (window.confirm('Remove this item from the cart?')) {
        onRemove();
      }
      return;
    }
    onQuantityChange(quantity);
  }

  function applyPrice(next: number | null) {
    const price = next ?? 0;
    onPriceChange(price === line.product.selling_price ? null : price);
  }

  return (
    <div className="border-b py-2 last:border-b-0">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{line.product.name}</p>
          {canOverridePrice ? (
            <div className="mt-0.5 flex min-w-0 items-center gap-1">
              <span className="text-xs text-muted-foreground">₹</span>
              <NumericInput
                ref={priceInputRef}
                min={0}
                commitOn="blur"
                value={effectivePrice(line)}
                onChange={applyPrice}
                className="h-6 w-16 px-1.5 py-0 text-xs"
                aria-label={`Unit price for ${line.product.name}`}
              />
              <span className="text-xs text-muted-foreground">each</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{effectivePrice(line).toFixed(2)} each</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label={`Decrease quantity for ${line.product.name}`}
              onClick={() => applyQuantity(line.quantity - 1)}
            >
              <Minus className="size-3" />
            </Button>
            <NumericInput
              allowDecimal={false}
              min={0}
              commitOn="blur"
              value={line.quantity}
              onChange={applyQuantity}
              onEnter={() => {
                if (canOverridePrice) priceInputRef.current?.focus();
              }}
              className="h-7 w-16 px-1.5 text-center text-sm"
              aria-label={`Quantity for ${line.product.name}`}
            />
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label={`Increase quantity for ${line.product.name}`}
              onClick={() => applyQuantity(line.quantity + 1)}
            >
              <Plus className="size-3" />
            </Button>
          </div>
          <p className="w-16 text-right text-sm font-medium">{lineTotal.toFixed(2)}</p>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label={`Remove ${line.product.name} from cart`}
            onClick={onRemove}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
