// Canonical set of subscription plans accepted by the backend. Never accept a plan id from
// anywhere else (free text, legacy values like "explore") — this is the single source of truth.
export type PlanId = 'basic' | 'advance' | 'custom';

export const PLAN_OPTIONS: { value: PlanId; label: string }[] = [
  { value: 'basic', label: 'Basic' },
  { value: 'advance', label: 'Advanced' },
  { value: 'custom', label: 'Custom' },
];

export const PLAN_LABEL: Record<string, string> = Object.fromEntries(PLAN_OPTIONS.map((p) => [p.value, p.label]));

export function planLabel(plan: string | null | undefined): string {
  if (!plan) return '—';
  return PLAN_LABEL[plan] ?? plan;
}
