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
import * as categoriesApi from '@/features/categories/api';
import type { Category, CategoryPayload } from '@/features/categories/api';
import { ApiError } from '@/lib/api-client';

const EMPTY_FORM: CategoryPayload = { name: '', description: '' };

interface CategoryFormDialogProps {
  category?: Category;
  trigger: ReactElement;
}

export function CategoryFormDialog({ category, trigger }: CategoryFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CategoryPayload>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const isEdit = !!category;

  useEffect(() => {
    if (open) {
      setForm(category ? { name: category.name, description: category.description ?? '' } : EMPTY_FORM);
      setError(null);
    }
  }, [open, category]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, description: form.description || null };
      return isEdit ? categoriesApi.updateCategory(category!.id, payload) : categoriesApi.createCategory(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Category updated' : 'Category created');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
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
          <DialogTitle>{isEdit ? 'Edit category' : 'New category'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Category name</Label>
            <Input
              id="c-name"
              required
              minLength={1}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-description">Description</Label>
            <Input
              id="c-description"
              value={form.description ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
