// Products have no image_url anywhere in the data model (frontend or backend), so the POS product
// list and cart use a deterministic colored-initial swatch instead of a photo thumbnail.
const AVATAR_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',
  'bg-lime-100 text-lime-700',
];

export function productInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export function productAvatarClasses(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}
