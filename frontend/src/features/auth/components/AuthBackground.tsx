import {
  BarChart3,
  Barcode,
  Calculator,
  Cloud,
  CreditCard,
  Database,
  FileText,
  IndianRupee,
  LayoutDashboard,
  LineChart,
  Package,
  PieChart,
  QrCode,
  Receipt,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

interface Placement {
  icon: LucideIcon;
  top: string;
  left: string;
  size: number;
  rotate: number;
  opacity: number;
}

// Fixed (not randomized-on-render) so the scattered layout never jumps between re-renders —
// the positions were chosen by hand to read as "randomly distributed" while staying clear of
// the centered auth card and keeping generous spacing between icons.
const PLACEMENTS: Placement[] = [
  { icon: Receipt, top: '6%', left: '10%', size: 56, rotate: -12, opacity: 0.07 },
  { icon: Barcode, top: '16%', left: '82%', size: 64, rotate: 8, opacity: 0.06 },
  { icon: ShoppingCart, top: '38%', left: '5%', size: 60, rotate: 6, opacity: 0.08 },
  { icon: Package, top: '78%', left: '12%', size: 52, rotate: -8, opacity: 0.07 },
  { icon: Warehouse, top: '85%', left: '32%', size: 68, rotate: 4, opacity: 0.05 },
  { icon: Calculator, top: '10%', left: '46%', size: 44, rotate: -6, opacity: 0.06 },
  { icon: IndianRupee, top: '58%', left: '90%', size: 58, rotate: -10, opacity: 0.08 },
  { icon: CreditCard, top: '28%', left: '92%', size: 54, rotate: 14, opacity: 0.06 },
  { icon: Wallet, top: '90%', left: '70%', size: 50, rotate: -14, opacity: 0.07 },
  { icon: BarChart3, top: '68%', left: '4%', size: 60, rotate: 10, opacity: 0.06 },
  { icon: PieChart, top: '4%', left: '68%', size: 50, rotate: -4, opacity: 0.07 },
  { icon: LineChart, top: '48%', left: '85%', size: 46, rotate: 8, opacity: 0.06 },
  { icon: TrendingUp, top: '22%', left: '20%', size: 42, rotate: 18, opacity: 0.08 },
  { icon: Sparkles, top: '80%', left: '88%', size: 40, rotate: -6, opacity: 0.08 },
  { icon: Database, top: '46%', left: '48%', size: 46, rotate: 0, opacity: 0.05 },
  { icon: Cloud, top: '14%', left: '58%', size: 58, rotate: 0, opacity: 0.06 },
  { icon: FileText, top: '92%', left: '50%', size: 44, rotate: -8, opacity: 0.07 },
  { icon: QrCode, top: '62%', left: '22%', size: 46, rotate: 6, opacity: 0.06 },
  { icon: LayoutDashboard, top: '4%', left: '28%', size: 40, rotate: -10, opacity: 0.06 },
];

export function AuthBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {PLACEMENTS.map(({ icon: Icon, top, left, size, rotate, opacity }, index) => (
        <Icon
          key={index}
          className="absolute text-primary"
          style={{ top, left, width: size, height: size, opacity, transform: `rotate(${rotate}deg)` }}
        />
      ))}
    </div>
  );
}
