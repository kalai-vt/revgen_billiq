import { request, requestBlob } from '@/lib/api-client';

export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'wallet' | 'cheque';
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  wallet: 'Wallet',
  cheque: 'Cheque',
};
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'upi', 'bank_transfer', 'wallet', 'cheque'];

export interface PaymentAllocationInput {
  invoice_id: string;
  amount: number;
}

export interface PaymentCreatePayload {
  customer_id: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number?: string | null;
  notes?: string | null;
  allocations?: PaymentAllocationInput[] | null;
}

export interface PaymentAllocation {
  id: string;
  invoice_id: string;
  invoice_number: string;
  amount: number;
}

export interface Payment {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string;
  payment_number: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number: string | null;
  notes: string | null;
  received_by: string;
  received_by_name: string;
  created_at: string;
  allocations: PaymentAllocation[];
}

export interface PaymentListResult {
  items: Payment[];
  total: number;
  page: number;
  page_size: number;
}

export interface OutstandingInvoice {
  id: string;
  invoice_number: string;
  created_at: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: string;
  is_overdue: boolean;
}

export interface LedgerEntry {
  date: string;
  type: 'invoice' | 'payment' | 'return' | 'adjustment';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface CustomerLedger {
  customer_id: string;
  customer_name: string;
  opening_balance: number;
  closing_balance: number;
  entries: LedgerEntry[];
}

export interface TrendPoint {
  date: string;
  amount: number;
}

export interface CreditSummary {
  current_outstanding: number;
  total_outstanding_invoices: number;
  total_overdue_amount: number;
  total_overdue_invoices: number;
  last_payment_date: string | null;
  average_payment_days: number | null;
  outstanding_trend: TrendPoint[];
}

export type AgeingBucketKey = 'current' | '1-30' | '31-60' | '61-90' | '90+';

export interface OutstandingDashboard {
  total_outstanding: number;
  total_overdue: number;
  today_collections: number;
  due_today: number;
  due_this_week: number;
  overdue_customers: number;
  customers_on_credit: number;
  average_collection_days: number | null;
  outstanding_trend: TrendPoint[];
  collection_trend: TrendPoint[];
  ageing_distribution: Record<AgeingBucketKey, number>;
}

export interface AgeingInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string | null;
  due_date: string | null;
  outstanding_amount: number;
  days_overdue: number;
  bucket: AgeingBucketKey;
}

export interface AgeingCustomer {
  customer_id: string;
  customer_name: string;
  current: number;
  bucket_1_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
  total_outstanding: number;
}

export interface AgeingReport {
  invoices: AgeingInvoice[];
  by_customer: AgeingCustomer[];
}

export function createPayment(payload: PaymentCreatePayload): Promise<Payment> {
  return request('/api/payments', { method: 'POST', body: JSON.stringify(payload) });
}

export function listPayments(params: { page: number; page_size?: number; customer_id?: string }): Promise<PaymentListResult> {
  const search = new URLSearchParams();
  search.set('page', String(params.page));
  search.set('page_size', String(params.page_size ?? 20));
  if (params.customer_id) search.set('customer_id', params.customer_id);
  return request(`/api/payments?${search.toString()}`);
}

export function getOutstandingInvoices(customerId: string): Promise<{ items: OutstandingInvoice[] }> {
  return request(`/api/customers/${customerId}/outstanding-invoices`);
}

export function getCreditSummary(customerId: string): Promise<CreditSummary> {
  return request(`/api/customers/${customerId}/credit-summary`);
}

export function getCustomerLedger(customerId: string): Promise<CustomerLedger> {
  return request(`/api/customers/${customerId}/ledger`);
}

export function exportCustomerLedger(customerId: string, format: 'excel' | 'pdf' | 'csv'): Promise<Blob> {
  return requestBlob(`/api/customers/${customerId}/ledger/export?format=${format}`);
}

export function createLedgerAdjustment(customerId: string, amount: number, reason: string): Promise<CustomerLedger> {
  return request(`/api/customers/${customerId}/ledger/adjustments`, {
    method: 'POST',
    body: JSON.stringify({ amount, reason }),
  });
}

export function getOutstandingDashboard(): Promise<OutstandingDashboard> {
  return request('/api/outstanding/dashboard');
}

export function getAgeingReport(): Promise<AgeingReport> {
  return request('/api/outstanding/ageing');
}

export function exportAgeingReport(format: 'excel' | 'pdf' | 'csv'): Promise<Blob> {
  return requestBlob(`/api/outstanding/ageing/export?format=${format}`);
}

export function exportOutstandingReport(format: 'excel' | 'pdf' | 'csv'): Promise<Blob> {
  return requestBlob(`/api/outstanding/export?format=${format}`);
}
