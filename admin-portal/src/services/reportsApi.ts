import { getAccessToken } from '@/lib/api-client';

async function downloadCsv(path: string, filename: string): Promise<void> {
  const accessToken = getAccessToken();
  const response = await fetch(path, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!response.ok) {
    throw new Error(`Failed to download report (status ${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCustomersReport(): Promise<void> {
  return downloadCsv('/api/admin/reports/customers.csv', 'customers.csv');
}

export function downloadRevenueReport(): Promise<void> {
  return downloadCsv('/api/admin/reports/revenue.csv', 'revenue.csv');
}

export function downloadPaymentsReport(): Promise<void> {
  return downloadCsv('/api/admin/reports/payments.csv', 'payments.csv');
}
