import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as posApi from '@/features/pos/api';

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: posApi.InvoiceCreatePayload) => posApi.createInvoice(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}
