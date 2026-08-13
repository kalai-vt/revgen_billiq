import { useState } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

interface TrialBannerProps {
  tenantId: string;
  trialEndsAt: string;
}

function dismissedKey(tenantId: string, trialEndsAt: string): string {
  // Scoped to the specific trial_ends_at value (not just the tenant) so an admin extending the
  // trial — which changes trial_ends_at — mints a new key and the banner reappears, rather than
  // staying dismissed forever for a trial period the user never actually saw the new end date of.
  return `billiq_trial_banner_dismissed_${tenantId}_${trialEndsAt}`;
}

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Best-effort — a browser blocking localStorage (private mode, quota) just means the banner
    // reappears next load, which is a harmless degradation.
  }
}

/**
 * Computes the copy for the trial countdown from calendar-day distance between now and
 * trial_ends_at, per the product spec's exact wording. Returns null once the trial has actually
 * expired — that state is the suspension screen's job (SubscriptionRequiredScreen.tsx), not this
 * banner's; the backend's 402 is the real gate, this is purely informational.
 */
function trialCopy(trialEndsAt: string): string | null {
  const end = new Date(trialEndsAt);
  const now = new Date();
  if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) return null;

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysRemaining = Math.round((startOfDay(end) - startOfDay(now)) / (24 * 60 * 60 * 1000));

  if (daysRemaining <= 0) {
    return "You're currently using the BillIQ trial. Your trial ends today.";
  }
  if (daysRemaining === 1) {
    return "You're currently using the BillIQ trial. Your trial ends tomorrow.";
  }
  return `You're currently using the BillIQ trial. Your trial ends in ${daysRemaining} days.`;
}

/**
 * Persistent, dismissible strip shown above the app header whenever the tenant is on an active
 * (not-yet-expired) trial. Purely informational — dismissing it only sets a localStorage flag
 * (see dismissedKey above) and never touches any subscription/trial data; there's no existing
 * user-preference-sync architecture in this app to hook a server-side dismissal into, so this is
 * a per-browser preference that reappears on a fresh session, which is expected.
 */
export function TrialBanner({ tenantId, trialEndsAt }: TrialBannerProps) {
  const key = dismissedKey(tenantId, trialEndsAt);
  const [dismissed, setDismissed] = useState(() => readDismissed(key));

  const copy = trialCopy(trialEndsAt);
  if (!copy || dismissed) return null;

  return (
    <div className="flex shrink-0 items-center justify-center gap-3 border-b bg-primary/10 px-4 py-2 text-center text-sm text-primary">
      <span>{copy}</span>
      <IconButton
        tooltip="Dismiss"
        aria-label="Dismiss trial banner"
        size="icon-xs"
        className="shrink-0 text-primary hover:bg-primary/20"
        onClick={() => {
          writeDismissed(key);
          setDismissed(true);
        }}
      >
        <X className="size-3.5" />
      </IconButton>
    </div>
  );
}
