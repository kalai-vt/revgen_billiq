import { useState } from 'react';
import { toast } from 'sonner';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent, CardHeader } from '@shared/components/ui/card';
import { downloadCustomersReport, downloadPaymentsReport, downloadRevenueReport } from '@/services/reportsApi';

interface ReportDefinition {
  key: string;
  title: string;
  description: string;
  download: () => Promise<void>;
}

const REPORTS: ReportDefinition[] = [
  {
    key: 'customers',
    title: 'Customer directory',
    description: 'Every customer with owner, plan, status, and usage totals.',
    download: downloadCustomersReport,
  },
  {
    key: 'revenue',
    title: 'Revenue & subscriptions',
    description: 'Plan, price, and subscription status for every customer.',
    download: downloadRevenueReport,
  },
  {
    key: 'payments',
    title: 'Payments ledger',
    description: 'Every recorded payment across all customers.',
    download: downloadPaymentsReport,
  },
];

export function ReportsPage() {
  const [downloading, setDownloading] = useState<string | null>(null);

  async function handleDownload(report: ReportDefinition) {
    setDownloading(report.key);
    try {
      await report.download();
    } catch {
      toast.error('Failed to download report');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Export data as CSV for offline analysis.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <Card key={report.key}>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <FileSpreadsheet className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{report.title}</p>
                <p className="text-sm text-muted-foreground">{report.description}</p>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" disabled={downloading === report.key} onClick={() => handleDownload(report)}>
                <Download className="mr-1.5 size-4" />
                {downloading === report.key ? 'Downloading…' : 'Download CSV'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
