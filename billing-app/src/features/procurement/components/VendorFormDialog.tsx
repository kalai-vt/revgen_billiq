import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import * as procurementApi from '@/features/procurement/api';
import type { Vendor, VendorPayload } from '@/features/procurement/api';
import { ApiError } from '@/lib/api-client';

const EMPTY_FORM: VendorPayload = {
  name: '',
  company_name: '',
  contact_person: '',
  phone: '',
  email: '',
  gst_number: '',
  address: '',
  payment_terms_days: null,
  credit_limit: 0,
};

interface VendorFormDialogProps {
  vendor?: Vendor;
  trigger: ReactElement;
}

export function VendorFormDialog({ vendor, trigger }: VendorFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<VendorPayload>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const isEdit = !!vendor;

  useEffect(() => {
    if (open) {
      setForm(
        vendor
          ? {
              name: vendor.name,
              company_name: vendor.company_name ?? '',
              contact_person: vendor.contact_person ?? '',
              phone: vendor.phone ?? '',
              email: vendor.email ?? '',
              gst_number: vendor.gst_number ?? '',
              address: vendor.address ?? '',
              payment_terms_days: vendor.payment_terms_days,
              credit_limit: vendor.credit_limit,
            }
          : EMPTY_FORM,
      );
      setError(null);
    }
  }, [open, vendor]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload: VendorPayload = {
        ...form,
        company_name: form.company_name || null,
        contact_person: form.contact_person || null,
        phone: form.phone || null,
        email: form.email || null,
        gst_number: form.gst_number || null,
        address: form.address || null,
      };
      return isEdit ? procurementApi.updateVendor(vendor!.id, payload) : procurementApi.createVendor(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Vendor updated' : 'Vendor created');
      queryClient.invalidateQueries({ queryKey: ['procurement-vendors'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-vendors-picker'] });
      setOpen(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit vendor' : 'New vendor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="v-name">Vendor name</Label>
              <Input
                id="v-name"
                required
                minLength={1}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-company">Company name</Label>
              <Input
                id="v-company"
                value={form.company_name ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-contact">Contact person</Label>
              <Input
                id="v-contact"
                value={form.contact_person ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, contact_person: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-phone">Mobile number</Label>
              <Input
                id="v-phone"
                value={form.phone ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-email">Email address</Label>
              <Input
                id="v-email"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-gst">GST number</Label>
              <Input
                id="v-gst"
                value={form.gst_number ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, gst_number: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-terms">Payment terms (days)</Label>
              <Input
                id="v-terms"
                type="number"
                min={0}
                value={form.payment_terms_days ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, payment_terms_days: e.target.value === '' ? null : Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-credit">Credit limit</Label>
              <Input
                id="v-credit"
                type="number"
                min={0}
                step="0.01"
                value={form.credit_limit ?? 0}
                onChange={(e) => setForm((prev) => ({ ...prev, credit_limit: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="v-address">Address</Label>
              <Input
                id="v-address"
                value={form.address ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create vendor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
