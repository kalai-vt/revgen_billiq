import type { UserRole } from '@/features/auth/api';

/** Where "Home" points for a given role — owners/managers land on the Analytics dashboard, staff (who can't access it) land on POS. */
export function getRoleHomeRoute(role: UserRole | undefined): string {
  return role === 'owner' || role === 'manager' ? '/dashboard' : '/pos';
}
