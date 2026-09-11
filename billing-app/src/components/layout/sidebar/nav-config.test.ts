import { describe, expect, it } from 'vitest';
import { LayoutDashboard } from 'lucide-react';
import { isLeafVisible, type NavLeaf } from '@/components/layout/sidebar/nav-config';

function leaf(overrides: Partial<NavLeaf> = {}): NavLeaf {
  return {
    to: '/restaurant/tables',
    label: 'Tables',
    icon: LayoutDashboard,
    roles: ['owner', 'manager', 'staff'],
    moduleKey: 'restaurant',
    ...overrides,
  };
}

describe('isLeafVisible', () => {
  it('hides a module an admin switched off', () => {
    expect(isLeafVisible(leaf(), 'owner', 'basic', { restaurant: false })).toBe(false);
  });

  it('shows a module with no admin override, so an untouched tenant sees the whole app', () => {
    expect(isLeafVisible(leaf(), 'owner', 'basic', { pos_billing: true })).toBe(true);
  });

  it('hides every gated module when the flag map is missing', () => {
    // The reported bug. A feature-flags request that failed left this `undefined`, and the old
    // optional reads ("no entry for this key means enabled") rendered the customer every module
    // in the product — including ones an admin had explicitly switched off — until they reloaded.
    expect(isLeafVisible(leaf(), 'owner', 'basic', undefined)).toBe(false);
    expect(isLeafVisible(leaf({ moduleKey: 'inventory' }), 'owner', 'basic', undefined)).toBe(false);
    expect(
      isLeafVisible(leaf({ moduleKey: 'advanced_analytics', feature: 'advanced_analytics' }), 'owner', 'premium', undefined),
    ).toBe(false);
  });

  it('still shows an ungated leaf when the flag map is missing', () => {
    // Settings has no moduleKey — it is not an admin-toggleable module, so nothing is being
    // guessed about it and the user keeps a way out of a half-loaded app.
    expect(isLeafVisible(leaf({ moduleKey: undefined, to: '/settings', label: 'Settings' }), 'owner', 'basic', undefined)).toBe(
      true,
    );
  });

  it('keeps enforcing roles', () => {
    expect(isLeafVisible(leaf({ roles: ['owner'] }), 'staff', 'basic', { restaurant: true })).toBe(false);
  });

  it('lets an admin override beat the plan for a plan-tier feature', () => {
    const paid = leaf({ moduleKey: 'advanced_analytics', feature: 'advanced_analytics' });
    expect(isLeafVisible(paid, 'owner', 'basic', { advanced_analytics: true })).toBe(true);
    expect(isLeafVisible(paid, 'owner', 'premium', { advanced_analytics: false })).toBe(false);
  });
});
