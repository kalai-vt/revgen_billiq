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
import * as customersApi from '@/features/customers/api';
import type { Customer, CustomerPayload } from '@/features/customers/api';
import { ApiError } from '@/lib/api-client';

const EMPTY_FORM: CustomerPayload = { name: '', mobile: '', email: '', address: '' };

interface CustomerFormDialogProps {
  customer?: Customer;
  trigger: ReactElement;
}

export function CustomerFormDialog({ customer, trigger }: CustomerFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CustomerPayload>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const isEdit = !!customer;

  useEffect(() => {
    if (open) {
      setForm(
        customer
          ? {
              name: customer.name,
              mobile: customer.mobile ?? '',
              email: customer.email ?? '',
              address: customer.address ?? '',
            }
          : EMPTY_FORM,
      );
      setError(null);
    }
  }, [open, customer]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        mobile: form.mobile || null,
        email: form.email || null,
        address: form.address || null,
      };
      return isEdit ? customersApi.updateCustomer(customer!.id, payload) : customersApi.createCustomer(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Customer updated' : 'Customer created');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit customer' : 'New customer'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cu-name">Customer name</Label>
            <Input
              id="cu-name"
              required
              minLength={1}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-mobile">Mobile</Label>
            <Input
              id="cu-mobile"
              value={form.mobile ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, mobile: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-email">Email</Label>
            <Input
              id="cu-email"
              type="email"
              value={form.email ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-address">Address</Label>
            <Input
              id="cu-address"
              value={form.address ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
