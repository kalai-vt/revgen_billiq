import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminBrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  iconOnly?: boolean;
}

const MARK_SIZE_CLASSES = { sm: 'size-7', md: 'size-9', lg: 'size-12' };
const TEXT_SIZE_CLASSES = { sm: 'text-sm', md: 'text-base', lg: 'text-2xl' };

export function AdminBrandLogo({ size = 'md', className, iconOnly = false }: AdminBrandLogoProps) {
  const mark = (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground',
        MARK_SIZE_CLASSES[size],
      )}
    >
      <ShieldCheck className="size-[55%] fill-current" />
    </div>
  );

  if (iconOnly) {
    return <div className={className}>{mark}</div>;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {mark}
      <span className={cn('font-semibold tracking-tight', TEXT_SIZE_CLASSES[size])}>RevGenIQ Admin</span>
    </div>
  );
}
