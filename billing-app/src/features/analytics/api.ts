import { request, requestBlob } from '@/lib/api-client';
import type { ExportFormat } from '@/components/shared/ExportDropdown';

export type Granularity = 'day' | 'week' | 'month';

export interface DateRangeMeta {
  date_from: string;
  date_to: string;
  days: number;
  granularity: Granularity;
  preset: string | null;
}

export interface DashboardKpis {
  total_sales: number;
  net_sales: number;
  total_orders: number;
  average_order_value: number;
  new_customers: number;
  credit_sales: number;
  cash_sales: number;
  card_payments: number;
  upi_payments: number;
  returned_orders: number;
  returned_amount: number;
  discount_amount: number;
  tax_collected: number;
  total_customers: number;
  total_products: number;
  outstanding_amount: number;
}

export interface TrendPoint {
  bucket_start: string;
  bucket_label: string;
  revenue: number;
  order_count: number;
}

export interface HourlyPoint {
  hour: number;
  revenue: number;
  order_count: number;
}

export interface TopProduct {
  product_id: string;
  name: string;
  identifier_value: string;
  qty_sold: number;
  revenue: number;
}

export interface TopCategory {
  category_id: string | null;
  name: string;
  qty_sold: number;
  revenue: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  amount: number;
  count: number;
}

export interface EmployeeSales {
  user_id: string;
  name: string;
  revenue: number;
  order_count: number;
}

export interface TaxBreakdownRow {
  tax_rate_percent: number;
  taxable_amount: number;
  tax_amount: number;
}

export interface DiscountAnalysis {
  total_discount: number;
  discounted_invoice_count: number;
  total_invoice_count: number;
  avg_discount_percent: number;
}

export interface RecentInvoice {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
}

export interface DashboardData {
  meta: DateRangeMeta;
  kpis: DashboardKpis;
  sales_trend: TrendPoint[];
  hourly_sales: HourlyPoint[];
  payment_methods: PaymentMethodBreakdown[];
  top_products: TopProduct[];
  top_categories: TopCategory[];
  sales_by_employee: EmployeeSales[];
  tax_breakdown: TaxBreakdownRow[];
  discount_analysis: DiscountAnalysis;
  recent_invoices: RecentInvoice[];
}

export type DashboardWidget =
  | 'kpis'
  | 'sales_trend'
  | 'hourly_sales'
  | 'payment_methods'
  | 'top_products'
  | 'top_categories'
  | 'sales_by_employee'
  | 'tax_breakdown'
  | 'discount_analysis'
  | 'recent_invoices'
  | 'full_dashboard';

export function getDashboard(dateFrom: string, dateTo: string, advanced = false, preset?: string): Promise<DashboardData> {
  const search = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, advanced: String(advanced) });
  if (preset) search.set('preset', preset);
  return request(`/api/analytics/dashboard?${search.toString()}`);
}

export function exportDashboardWidget(
  widget: DashboardWidget,
  format: ExportFormat,
  dateFrom: string,
  dateTo: string,
  advanced = false,
  preset?: string,
): Promise<Blob> {
  const search = new URLSearchParams({
    widget,
    format,
    date_from: dateFrom,
    date_to: dateTo,
    advanced: String(advanced),
  });
  if (preset) search.set('preset', preset);
  return requestBlob(`/api/analytics/dashboard/export?${search.toString()}`);
}
