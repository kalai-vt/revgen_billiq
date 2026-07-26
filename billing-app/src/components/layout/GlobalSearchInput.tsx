import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Search, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import * as searchApi from '@/features/search/api';
import type { SearchResultItem } from '@/features/search/api';

const GROUPS: { key: keyof searchApi.GlobalSearchResult; label: string; route: string }[] = [
  { key: 'products', label: 'Products', route: '/products' },
  { key: 'customers', label: 'Customers', route: '/customers' },
  { key: 'inventory', label: 'Inventory', route: '/inventory/products' },
  { key: 'invoices', label: 'Invoices', route: '/invoices' },
  { key: 'categories', label: 'Categories', route: '/categories' },
];

const RECENT_SEARCHES_KEY = 'revgeniq_recent_searches';
const MAX_RECENT_SEARCHES = 5;

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string, current: string[]): string[] {
  const trimmed = query.trim();
  if (!trimmed) return current;
  const next = [trimmed, ...current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    MAX_RECENT_SEARCHES,
  );
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  return next;
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-primary/20 text-inherit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function GlobalSearchInput() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecentSearches());

  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', q],
    queryFn: () => searchApi.globalSearch(q),
    enabled: q.length > 0,
  });

  const hasResults = !!data && GROUPS.some((g) => data[g.key].length > 0);
  const showRecent = q.length === 0 && recentSearches.length > 0;

  function handleSelect(route: string) {
    setRecentSearches(saveRecentSearch(q, recentSearches));
    navigate(`${route}?q=${encodeURIComponent(q)}`);
    setOpen(false);
    setInput('');
    setQ('');
  }

  function handleRecentSearchClick(term: string) {
    setInput(term);
    setQ(term);
  }

  function handleClearRecent() {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    setRecentSearches([]);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next, eventDetails) => {
        // The trigger here is a live-typing input, not a click-to-toggle button — opening is
        // driven entirely by our own onFocus/onChange handlers below. Base UI's built-in
        // "press the trigger again to close" behavior still fires on every click though (even a
        // click that's just refocusing an already-open input), which would immediately re-close
        // the popover right after it opens. Ignore that specific close reason; still honor real
        // dismiss reasons (clicking outside, Escape, selecting a result).
        if (!next && eventDetails?.reason === 'trigger-press') return;
        setOpen(next);
      }}
    >
      <PopoverTrigger
        nativeButton={false}
        render={
          <div className="relative hidden w-full md:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="global-search-input"
              placeholder="Search products, customers, invoices… (/ or Ctrl+K)"
              className="pl-8"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
            />
          </div>
        }
      />
      <PopoverContent align="start" initialFocus={false} className="w-96 p-0">
        {showRecent && (
          <div className="py-1">
            <div className="flex items-center justify-between px-3 py-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Recent searches
              </p>
              <button
                onClick={handleClearRecent}
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
                Clear
              </button>
            </div>
            {recentSearches.map((term) => (
              <button
                key={term}
                onClick={() => handleRecentSearchClick(term)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Clock className="size-3.5 text-muted-foreground" />
                {term}
              </button>
            ))}
          </div>
        )}

        {q.length > 0 && isFetching && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}

        {q.length > 0 && !isFetching && data && !hasResults && (
          <EmptyState icon={Search} title="No results found" description={`Nothing matches "${q}".`} className="py-6" />
        )}

        {q.length > 0 && !isFetching && data && hasResults && (
          <div className="max-h-96 overflow-y-auto py-1">
            {GROUPS.map((group) => {
              const items = data[group.key];
              if (items.length === 0) return null;
              return (
                <div key={group.key} className="py-1">
                  <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group.label}
                  </p>
                  {items.map((item: SearchResultItem) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(group.route)}
                      className="flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-medium">{highlightMatch(item.label, q)}</span>
                      {item.subtitle && (
                        <span className="text-xs text-muted-foreground">{highlightMatch(item.subtitle, q)}</span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {q.length === 0 && recentSearches.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">Start typing to search…</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
