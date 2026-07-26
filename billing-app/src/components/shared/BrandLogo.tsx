import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  /** Tenant's uploaded logo URL. Pass `null`/`undefined` (e.g. on pre-auth pages, where no
   * tenant is known yet) to always render the RevGen BillIQ fallback mark. */
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Renders just the square mark/uploaded image with no wordmark — for icon-only rails. */
  iconOnly?: boolean;
  /** Overrides the wordmark's text size/weight independently of the icon's `size` — lets a
   * caller keep icon dimensions consistent across two stacked brand rows while still giving
   * one row's name more visual weight than the other. */
  textClassName?: string;
}

const IMG_SIZE_CLASSES = { sm: 'h-7', md: 'h-9', lg: 'h-14' };
const MARK_SIZE_CLASSES = { sm: 'size-7', md: 'size-9', lg: 'size-12' };
const TEXT_SIZE_CLASSES = { sm: 'text-sm', md: 'text-base', lg: 'text-2xl' };

export function BrandLogo({ logoUrl, size = 'md', className, iconOnly = false, textClassName }: BrandLogoProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="Company logo"
        className={cn(
          IMG_SIZE_CLASSES[size],
          iconOnly ? 'w-auto max-w-9 object-contain' : 'w-auto max-w-40 object-contain',
          className,
        )}
      />
    );
  }

  const mark = (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground',
        MARK_SIZE_CLASSES[size],
      )}
    >
      <Zap className="size-[55%] fill-current" />
    </div>
  );

  if (iconOnly) {
    return <div className={className}>{mark}</div>;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {mark}
      <span className={cn('font-semibold tracking-tight', TEXT_SIZE_CLASSES[size], textClassName)}>RevGen BillIQ</span>
    </div>
  );
}
