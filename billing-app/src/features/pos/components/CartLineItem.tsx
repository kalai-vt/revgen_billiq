import { useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { NumericInput } from '@/components/ui/numeric-input';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { productAvatarClasses, productInitial } from '@/features/pos/lib/productAvatar';
import type { CartLine } from '@/features/pos/hooks/useCart';
import { effectivePrice } from '@/features/pos/lib/pricing';
import { cn } from '@/lib/utils';

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
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  function applyQuantity(next: number | null) {
    const quantity = next ?? 0;
    if (quantity <= 0) {
      setConfirmRemoveOpen(true);
      return;
    }
    onQuantityChange(quantity);
  }

  function applyPrice(next: number | null) {
    const price = next ?? 0;
    onPriceChange(price === line.product.selling_price ? null : price);
  }

  return (
    <div className="flex items-center gap-2 border-b py-2 last:border-0">
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
          productAvatarClasses(line.product.name),
        )}
      >
        {productInitial(line.product.name)}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{line.product.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {line.product.identifier_value}
          {line.product.category_name ? ` · ${line.product.category_name}` : ''}
        </p>
      </div>

      <div className="w-16 shrink-0 text-right text-xs">
        {canOverridePrice ? (
          <NumericInput
            ref={priceInputRef}
            min={0}
            commitOn="blur"
            value={effectivePrice(line)}
            onChange={applyPrice}
            className="h-7 w-16 px-1 text-right text-xs"
            aria-label={`Unit price for ${line.product.name}`}
          />
        ) : (
          <span className="text-muted-foreground">₹{effectivePrice(line).toFixed(2)}</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          tooltip="Decrease quantity"
          variant="outline"
          size="icon"
          className="size-6 rounded-full"
          aria-label={`Decrease quantity for ${line.product.name}`}
          onClick={() => applyQuantity(line.quantity - 1)}
        >
          <Minus className="size-3" />
        </IconButton>
        <NumericInput
          allowDecimal={false}
          min={0}
          commitOn="blur"
          value={line.quantity}
          onChange={applyQuantity}
          onEnter={() => {
            if (canOverridePrice) priceInputRef.current?.focus();
          }}
          className="h-7 w-10 px-1 text-center text-xs"
          aria-label={`Quantity for ${line.product.name}`}
        />
        <IconButton
          tooltip="Increase quantity"
          variant="outline"
          size="icon"
          className="size-6 rounded-full"
          aria-label={`Increase quantity for ${line.product.name}`}
          onClick={() => applyQuantity(line.quantity + 1)}
        >
          <Plus className="size-3" />
        </IconButton>
      </div>

      <div className="w-16 shrink-0 text-right text-xs font-semibold">₹{lineTotal.toFixed(2)}</div>

      <IconButton
        tooltip="Remove from cart"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={`Remove ${line.product.name} from cart`}
        onClick={onRemove}
      >
        <X className="size-4" />
      </IconButton>

      <ConfirmationDialog
        open={confirmRemoveOpen}
        onOpenChange={setConfirmRemoveOpen}
        title="Remove Item?"
        description={`Remove "${line.product.name}" from the cart?`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          onRemove();
          setConfirmRemoveOpen(false);
        }}
      />
    </div>
  );
}
