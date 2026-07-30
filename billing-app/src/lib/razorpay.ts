interface RazorpayPaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayPaymentResponse) => void;
  modal?: { ondismiss?: () => void };
  theme?: { color?: string };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Could not load the payment provider. Check your connection and try again.'));
      };
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

export class RazorpayDismissedError extends Error {
  constructor() {
    super('Payment window closed before completing.');
    this.name = 'RazorpayDismissedError';
  }
}

export async function openRazorpayCheckout(options: {
  keyId: string;
  amountInr: number;
  orderId: string;
  description: string;
}): Promise<RazorpayPaymentResponse> {
  await loadRazorpayScript();
  if (!window.Razorpay) {
    throw new Error('Payment provider failed to load.');
  }
  const Razorpay = window.Razorpay;
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: options.keyId,
      amount: options.amountInr * 100,
      currency: 'INR',
      name: 'RevGen BillIQ',
      description: options.description,
      order_id: options.orderId,
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject(new RazorpayDismissedError()) },
      theme: { color: '#1e5a52' },
    });
    rzp.open();
  });
}
