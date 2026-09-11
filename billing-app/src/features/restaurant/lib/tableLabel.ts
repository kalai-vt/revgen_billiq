/** How a table is named on screen.
 *
 * Tables are named by the restaurant, and people name them both ways: "5" and "Table 5" are both
 * common. Blindly prefixing produced "Table Table 2" for anyone who typed the word themselves, so
 * the prefix is only added when the name doesn't already carry it.
 */
export function tableLabel(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'Table';
  return /^table\b/i.test(trimmed) ? trimmed : `Table ${trimmed}`;
}

/** The same, but for somewhere a takeaway order can also appear. */
export function orderLocationLabel(tableName: string | null | undefined, takeaway = 'Takeaway'): string {
  return tableName ? tableLabel(tableName) : takeaway;
}
