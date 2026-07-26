import { create } from 'zustand';
import type { Product } from '@/features/products/api';

export interface CartLine {
  product: Product;
  quantity: number;
  overridePrice: number | null;
}

interface CartState {
  lines: CartLine[];
  addProduct: (product: Product) => void;
  setQuantity: (productId: string, quantity: number) => void;
  setPrice: (productId: string, price: number | null) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
  setLines: (lines: CartLine[]) => void;
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],

  addProduct: (product) =>
    set((state) => {
      const existing = state.lines.find((line) => line.product.id === product.id);
      const lines = existing
        ? state.lines.map((line) =>
            line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
          )
        : [...state.lines, { product, quantity: 1, overridePrice: null }];
      return { lines };
    }),

  setQuantity: (productId, quantity) =>
    set((state) => ({
      lines: state.lines.map((line) => (line.product.id === productId ? { ...line, quantity } : line)),
    })),

  setPrice: (productId, price) =>
    set((state) => ({
      lines: state.lines.map((line) => (line.product.id === productId ? { ...line, overridePrice: price } : line)),
    })),

  removeLine: (productId) =>
    set((state) => ({ lines: state.lines.filter((line) => line.product.id !== productId) })),

  clear: () => set({ lines: [] }),

  setLines: (lines) => set({ lines }),
}));
