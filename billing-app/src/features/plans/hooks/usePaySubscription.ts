import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as plansApi from '@/features/plans/api';
import { openRazorpayCheckout, RazorpayDismissedError } from '@/lib/razorpay';
import { ApiError } from '@/lib/api-client';

/**
 * The Razorpay checkout → verify flow, shared by every place that offers a "pay now" action —
 * originally PlanUsageCard only, now also SubscriptionRequiredScreen (the full-screen block shown
 * when a 402 SUBSCRIPTION_REQUIRED comes back). Both need the exact same order-create → open
 * checkout → verify → invalidate `billing-usage` sequence, so it lives here once rather than
 * duplicated per caller.
 */
export function usePaySubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const order = await plansApi.createCheckoutOrder();
      const payment = await openRazorpayCheckout({
        keyId: order.razorpay_key_id,
        amountInr: order.amount_inr,
        orderId: order.order_id,
        description: `${order.plan_label} plan`,
      });
      return plansApi.verifyPayment({
        razorpay_order_id: payment.razorpay_order_id,
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_signature: payment.razorpay_signature,
      });
    },
    onSuccess: () => {
      toast.success('Payment received — your subscription is active.');
      queryClient.invalidateQueries({ queryKey: ['billing-usage'] });
    },
    onError: (err) => {
      if (err instanceof RazorpayDismissedError) return;
      toast.error(err instanceof ApiError ? err.message : 'Payment failed. Please try again.');
    },
  });
}
