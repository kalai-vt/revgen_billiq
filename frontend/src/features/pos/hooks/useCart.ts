import { useCartStore } from '@/features/pos/store/cartStore';

export const useCart = () => useCartStore();

export type { CartLine } from '@/features/pos/store/cartStore';
