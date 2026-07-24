import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface CustomerSearchBarProps {
  q: string;
  onQChange: (value: string) => void;
}

export function CustomerSearchBar({ q, onQChange }: CustomerSearchBarProps) {
  return (
    <div className="relative max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search by name, mobile, or email…"
        className="pl-8"
        value={q}
        onChange={(e) => onQChange(e.target.value)}
      />
    </div>
  );
}
