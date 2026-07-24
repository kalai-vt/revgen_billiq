import { create } from 'zustand';
import type { Product } from '@/features/products/api';

export interface CartLine {
  product: Product;
  quantity: number;
  overridePrice: number | null;
}

interface CartState {
  lines: CartLine[];
  subtotal: number;
  addProduct: (product: Product) => void;
  setQuantity: (productId: string, quantity: number) => void;
  setPrice: (productId: string, price: number | null) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
  setLines: (lines: CartLine[]) => void;
}

function linePrice(line: CartLine): number {
  return line.overridePrice ?? line.product.selling_price;
}

function computeSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + linePrice(line) * line.quantity, 0);
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  subtotal: 0,

  addProduct: (product) =>
    set((state) => {
      const existing = state.lines.find((line) => line.product.id === product.id);
      const lines = existing
        ? state.lines.map((line) =>
            line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
          )
        : [...state.lines, { product, quantity: 1, overridePrice: null }];
      return { lines, subtotal: computeSubtotal(lines) };
    }),

  setQuantity: (productId, quantity) =>
    set((state) => {
      const lines = state.lines.map((line) =>
        line.product.id === productId ? { ...line, quantity } : line,
      );
      return { lines, subtotal: computeSubtotal(lines) };
    }),

  setPrice: (productId, price) =>
    set((state) => {
      const lines = state.lines.map((line) =>
        line.product.id === productId ? { ...line, overridePrice: price } : line,
      );
      return { lines, subtotal: computeSubtotal(lines) };
    }),

  removeLine: (productId) =>
    set((state) => {
      const lines = state.lines.filter((line) => line.product.id !== productId);
      return { lines, subtotal: computeSubtotal(lines) };
    }),

  clear: () => set({ lines: [], subtotal: 0 }),

  setLines: (lines) => set({ lines, subtotal: computeSubtotal(lines) }),
}));
