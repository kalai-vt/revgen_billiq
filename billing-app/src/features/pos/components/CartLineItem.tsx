import { useRef } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/ui/numeric-input';
import { TableCell, TableRow } from '@/components/ui/table';
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
    <TableRow>
      <TableCell className="whitespace-normal">
        <p className="font-medium">{line.product.name}</p>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-7 rounded-full"
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
            className="h-8 w-14 px-1.5 text-center text-sm"
            aria-label={`Quantity for ${line.product.name}`}
          />
          <Button
            variant="outline"
            size="icon"
            className="size-7 rounded-full"
            aria-label={`Increase quantity for ${line.product.name}`}
            onClick={() => applyQuantity(line.quantity + 1)}
          >
            <Plus className="size-3" />
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-right">
        {canOverridePrice ? (
          <NumericInput
            ref={priceInputRef}
            min={0}
            commitOn="blur"
            value={effectivePrice(line)}
            onChange={applyPrice}
            className="ml-auto h-8 w-20 px-1.5 text-right text-sm"
            aria-label={`Unit price for ${line.product.name}`}
          />
        ) : (
          effectivePrice(line).toFixed(2)
        )}
      </TableCell>
      <TableCell className="text-right font-medium">{lineTotal.toFixed(2)}</TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          aria-label={`Remove ${line.product.name} from cart`}
          onClick={onRemove}
        >
          <X className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
