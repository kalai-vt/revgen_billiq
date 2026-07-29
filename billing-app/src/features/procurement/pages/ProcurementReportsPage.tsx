import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DateRangeSelector } from '@/components/shared/DateRangeSelector';
import { ExportDropdown, type ExportFormat } from '@/components/shared/ExportDropdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as procurementApi from '@/features/procurement/api';
import type { ReportWidget } from '@/features/procurement/api';
import { downloadBlob } from '@/lib/download-blob';
import { ApiError } from '@/lib/api-client';
import { resolveDateRangePreset, OVERVIEW_PRESETS } from '@/lib/date-range';

const EXPORT_EXTENSIONS: Record<ExportFormat, string> = { excel: 'xlsx', pdf: 'pdf', csv: 'csv' };

const REPORT_TABS: { value: ReportWidget; label: string }[] = [
  { value: 'purchase_report', label: 'Purchase Report' },
  { value: 'vendor_report', label: 'Vendor Report' },
  { value: 'outstanding_vendor_report', label: 'Outstanding Vendor Report' },
  { value: 'purchase_return_report', label: 'Purchase Return Report' },
  { value: 'gst_report', label: 'GST Report' },
];

export function ProcurementReportsPage() {
  const { tenant } = useAuth();
  const timezone = tenant?.timezone ?? 'UTC';
  const [range, setRange] = useState(() => resolveDateRangePreset('this_month', timezone));
  const { data, isLoading } = useQuery({
    queryKey: ['procurement-reports', range.from, range.to],
    queryFn: () => procurementApi.getProcurementReports(range.from, range.to),
  });

  async function handleExport(widget: ReportWidget, format: ExportFormat) {
    try {
      const blob = await procurementApi.exportProcurementReport(widget, format, range.from, range.to);
      downloadBlob(blob, `${widget}_${range.from}_to_${range.to}.${EXPORT_EXTENSIONS[format]}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not export report');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Procurement Reports</h1>
          <p className="text-sm text-muted-foreground">Purchase, vendor, outstanding, return, and GST reports.</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeSelector value={range} onChange={setRange} timezone={timezone} presets={OVERVIEW_PRESETS} />
          <ExportDropdown label="Export all" formats={['excel', 'pdf']} onExport={(f) => handleExport('full_reports', f)} />
        </div>
      </div>

      <Tabs defaultValue="purchase_report">
        <TabsList>
          {REPORT_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="purchase_report" className="mt-3">
          <ReportSection title="Purchase Report" isLoading={isLoading} onExport={(f) => handleExport('purchase_report', f)}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.purchase_report.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.purchase_number}</TableCell>
                    <TableCell className="max-w-[140px] truncate">{r.vendor_name}</TableCell>
                    <TableCell>{new Date(r.purchase_date).toLocaleDateString()}</TableCell>
                    <TableCell className="capitalize">{r.status}</TableCell>
                    <TableCell className="text-right">{r.total_amount.toFixed(2)}</TableCell>
                    <TableCell className="capitalize">{r.payment_status}</TableCell>
                    <TableCell className="text-right">{r.outstanding_amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportSection>
        </TabsContent>

        <TabsContent value="vendor_report" className="mt-3">
          <ReportSection title="Vendor Report" isLoading={isLoading} onExport={(f) => handleExport('vendor_report', f)}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Purchases</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.vendor_report.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-[160px] truncate">{r.vendor_name}</TableCell>
                    <TableCell>{r.is_active ? 'Active' : 'Inactive'}</TableCell>
                    <TableCell className="text-right">{r.purchase_count}</TableCell>
                    <TableCell className="text-right">{r.total_purchase_value.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.total_outstanding.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportSection>
        </TabsContent>

        <TabsContent value="outstanding_vendor_report" className="mt-3">
          <ReportSection title="Outstanding Vendor Report" isLoading={isLoading} onExport={(f) => handleExport('outstanding_vendor_report', f)}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.outstanding_vendor_report.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-[160px] truncate">{r.vendor_name}</TableCell>
                    <TableCell>{r.phone ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">{r.outstanding_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.credit_limit.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportSection>
        </TabsContent>

        <TabsContent value="purchase_return_report" className="mt-3">
          <ReportSection title="Purchase Return Report" isLoading={isLoading} onExport={(f) => handleExport('purchase_return_report', f)}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return #</TableHead>
                  <TableHead>Purchase #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.purchase_return_report.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.return_number}</TableCell>
                    <TableCell>{r.purchase_number}</TableCell>
                    <TableCell className="max-w-[140px] truncate">{r.vendor_name}</TableCell>
                    <TableCell className="capitalize">{r.status}</TableCell>
                    <TableCell className="text-right">{r.refund_amount.toFixed(2)}</TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportSection>
        </TabsContent>

        <TabsContent value="gst_report" className="mt-3">
          <ReportSection title="GST Report" isLoading={isLoading} onExport={(f) => handleExport('gst_report', f)}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tax Rate</TableHead>
                  <TableHead className="text-right">Taxable Amount</TableHead>
                  <TableHead className="text-right">Tax Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.gst_report.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.tax_rate_percent}%</TableCell>
                    <TableCell className="text-right">{r.taxable_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.tax_amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportSection({
  title,
  isLoading,
  onExport,
  children,
}: {
  title: string;
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{title}</h2>
        <ExportDropdown formats={['excel', 'pdf', 'csv']} onExport={onExport} />
      </div>
      {isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p> : children}
    </div>
  );
}
