export const EXPANDED_GROUPS_KEY = 'revgeniq_sidebar_expanded_groups';

/** Called on logout/login so accordion expansion never leaks across user sessions —
 * within a single session, expanded state still survives a plain page refresh. */
export function clearSidebarExpansionState(): void {
  localStorage.removeItem(EXPANDED_GROUPS_KEY);
}

export function loadExpandedGroups(): string[] {
  try {
    const raw = localStorage.getItem(EXPANDED_GROUPS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
