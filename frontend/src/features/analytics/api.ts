import { request } from '@/lib/api-client';

export interface DashboardKpis {
  today_revenue: number;
  today_bill_count: number;
  today_units_sold: number;
  total_products: number;
  total_customers: number;
}

export interface DailySalesPoint {
  date: string;
  revenue: number;
  bill_count: number;
}

export interface TopProduct {
  product_id: string;
  name: string;
  identifier_value: string;
  qty_sold: number;
  revenue: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  amount: number;
  count: number;
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
  kpis: DashboardKpis;
  daily_sales: DailySalesPoint[];
  top_products: TopProduct[];
  payment_methods: PaymentMethodBreakdown[];
  recent_invoices: RecentInvoice[];
}

export function getDashboard(days: number, advanced = false): Promise<DashboardData> {
  return request(`/api/analytics/dashboard?days=${days}&advanced=${advanced}`);
}
