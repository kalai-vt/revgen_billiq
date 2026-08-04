import { useState } from 'react';
import { ShoppingCart, Trash2 } from 'lucide-react';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { CartLineItem } from '@/features/pos/components/CartLineItem';
import type { CartLine } from '@/features/pos/hooks/useCart';

interface CartPanelProps {
  lines: CartLine[];
  onQuantityChange: (productId: string, quantity: number) => void;
  onPriceChange: (productId: string, price: number | null) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  canOverridePrice: boolean;
}

export function CartPanel({ lines, onQuantityChange, onPriceChange, onRemove, onClear, canOverridePrice }: CartPanelProps) {
  const [clearCartOpen, setClearCartOpen] = useState(false);

  function handleClear() {
    if (lines.length === 0) return;
    setClearCartOpen(true);
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Current Cart <span className="font-normal text-muted-foreground">({lines.length} item{lines.length === 1 ? '' : 's'})</span>
        </h2>
        <button
          type="button"
          onClick={handleClear}
          disabled={lines.length === 0}
          className="flex items-center gap-1 text-xs font-medium text-destructive hover:underline disabled:pointer-events-none disabled:opacity-40"
        >
          Clear Cart
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border scrollbar-thin">
        {lines.length === 0 ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ShoppingCart className="size-8" />
            <p className="text-xs">Cart is empty. Search and add products.</p>
          </div>
        ) : (
          <div className="px-2">
            {lines.map((line) => (
              <CartLineItem
                key={line.product.id}
                line={line}
                onQuantityChange={(qty) => onQuantityChange(line.product.id, qty)}
                onPriceChange={(price) => onPriceChange(line.product.id, price)}
                onRemove={() => onRemove(line.product.id)}
                canOverridePrice={canOverridePrice}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={clearCartOpen}
        onOpenChange={setClearCartOpen}
        title="Clear Cart?"
        description="Are you sure you want to remove all items from the current cart? This action cannot be undone."
        confirmLabel="Clear Cart"
        destructive
        onConfirm={() => {
          onClear();
          setClearCartOpen(false);
        }}
      />
    </div>
  );
}
