import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrialBanner } from './TrialBanner';

const TENANT_ID = 'tenant-1';

function isoDaysFromNow(days: number, hours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(d.getHours() + hours, d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return d.toISOString();
}

describe('TrialBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows "ends in N days" copy with 2+ days remaining', () => {
    render(<TrialBanner tenantId={TENANT_ID} trialEndsAt={isoDaysFromNow(5)} />);
    expect(screen.getByText(/Your trial ends in 5 days\.$/)).toBeInTheDocument();
  });

  it('shows "ends tomorrow" copy with exactly 1 day remaining', () => {
    render(<TrialBanner tenantId={TENANT_ID} trialEndsAt={isoDaysFromNow(1)} />);
    expect(screen.getByText(/Your trial ends tomorrow\.$/)).toBeInTheDocument();
  });

  it('shows "ends today" copy when the trial ends later today', () => {
    render(<TrialBanner tenantId={TENANT_ID} trialEndsAt={isoDaysFromNow(0, 1)} />);
    expect(screen.getByText(/Your trial ends today\.$/)).toBeInTheDocument();
  });

  it('renders nothing once trial_ends_at is in the past — the suspension screen owns that state', () => {
    const { container } = render(<TrialBanner tenantId={TENANT_ID} trialEndsAt={isoDaysFromNow(-1)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dismissing hides the banner and persists the dismissal scoped to tenant + trial_ends_at', async () => {
    const user = userEvent.setup();
    const trialEndsAt = isoDaysFromNow(3);
    render(<TrialBanner tenantId={TENANT_ID} trialEndsAt={trialEndsAt} />);

    expect(screen.getByText(/Your trial ends in 3 days\.$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/Your trial ends in 3 days\.$/)).not.toBeInTheDocument();
    expect(localStorage.getItem(`billiq_trial_banner_dismissed_${TENANT_ID}_${trialEndsAt}`)).toBe('1');
  });

  it('does not re-show after a remount once dismissed for the same trial_ends_at', () => {
    const trialEndsAt = isoDaysFromNow(3);
    localStorage.setItem(`billiq_trial_banner_dismissed_${TENANT_ID}_${trialEndsAt}`, '1');

    const { container } = render(<TrialBanner tenantId={TENANT_ID} trialEndsAt={trialEndsAt} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows again for a new trial_ends_at even if a previous trial period was dismissed', () => {
    const oldEnd = isoDaysFromNow(3);
    localStorage.setItem(`billiq_trial_banner_dismissed_${TENANT_ID}_${oldEnd}`, '1');

    const newEnd = isoDaysFromNow(10);
    render(<TrialBanner tenantId={TENANT_ID} trialEndsAt={newEnd} />);
    expect(screen.getByText(/Your trial ends in 10 days\.$/)).toBeInTheDocument();
  });
});
