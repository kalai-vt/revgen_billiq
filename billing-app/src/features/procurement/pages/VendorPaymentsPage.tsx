import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import { VendorPaymentFormDialog } from '@/features/procurement/components/VendorPaymentFormDialog';
import { VendorPaymentTable } from '@/features/procurement/components/VendorPaymentTable';
import { usePaginatedVendorPayments } from '@/features/procurement/hooks/usePaginatedVendorPayments';

const PAGE_SIZE = 20;

export function VendorPaymentsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePaginatedVendorPayments({ page, page_size: PAGE_SIZE });

  return (
    <ModulePage
      header={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Vendor Payments</h1>
            <p className="text-sm text-muted-foreground">Payments made to vendors against outstanding purchases.</p>
          </div>
          <VendorPaymentFormDialog
            trigger={
              <Button size="sm">
                <Plus className="size-4" />
                New payment
              </Button>
            }
          />
        </div>
      }
      footer={<TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="payment" />}
    >
      <VendorPaymentTable data={data} isLoading={isLoading} />
    </ModulePage>
  );
}
