import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type Cell = boolean | string;

interface FeatureRow {
  label: string;
  basic: Cell;
  explore: Cell;
  advance: Cell;
}

const PLAN_CARDS = [
  { id: 'basic', label: 'Basic', price: '₹999', tagline: 'Perfect for Small Businesses', highlight: false },
  { id: 'explore', label: 'Explore', price: '₹1,999', tagline: 'Best for Growing Businesses', highlight: true },
  { id: 'advance', label: 'Advance', price: '₹2,999', tagline: 'Built for Enterprises & Multi-Branch Businesses', highlight: false },
] as const;

const FEATURE_ROWS: FeatureRow[] = [
  { label: 'Branches', basic: '1', explore: 'Up to 3', advance: 'Unlimited' },
  { label: 'Users', basic: '1', explore: 'Up to 10', advance: 'Unlimited' },
  { label: 'Products', basic: '500', explore: '10,000', advance: 'Unlimited' },
  { label: 'Customers', basic: '500', explore: 'Unlimited', advance: 'Unlimited' },
  { label: 'Monthly Invoices', basic: '1,000', explore: 'Unlimited', advance: 'Unlimited' },
  { label: 'Product Categories', basic: true, explore: true, advance: true },
  { label: 'Billing', basic: true, explore: true, advance: true },
  { label: 'Invoice Generation', basic: true, explore: true, advance: true },
  { label: 'GST Invoice', basic: true, explore: true, advance: true },
  { label: 'PDF Invoice', basic: true, explore: true, advance: true },
  { label: 'WhatsApp Invoice', basic: false, explore: true, advance: true },
  { label: 'Customer Management', basic: true, explore: true, advance: true },
  { label: 'Overview & Basic Analytics', basic: true, explore: true, advance: true },
  { label: 'Advanced Analytics', basic: false, explore: true, advance: true },
  { label: 'Barcode Support', basic: false, explore: true, advance: true },
  { label: 'Product Variants', basic: false, explore: true, advance: true },
  { label: 'Excel / PDF Reports', basic: false, explore: true, advance: true },
  { label: 'User Management', basic: false, explore: true, advance: true },
  { label: 'Branch Management', basic: false, explore: true, advance: true },
  { label: 'Audit Logs', basic: false, explore: true, advance: true },
  { label: 'AI Business Insights', basic: false, explore: false, advance: true },
  { label: 'Multi-Branch Analytics', basic: false, explore: false, advance: true },
  { label: 'Business Branding', basic: false, explore: false, advance: true },
  { label: 'Backup & Restore', basic: false, explore: false, advance: true },
  { label: 'Priority Support', basic: 'Email', explore: 'Priority', advance: 'Dedicated' },
];

function CellValue({ value }: { value: Cell }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="mx-auto size-4 text-primary" />
    ) : (
      <X className="mx-auto size-4 text-muted-foreground/40" />
    );
  }
  return <span>{value}</span>;
}

const BRANDING_ITEMS = [
  'Upload your own company logo',
  'Customize invoice branding',
  'Personalized email templates',
  'Custom login branding',
  'Brand colors and theme customization',
  'Remove "Powered by RevGen BillIQ" from invoices and customer-facing screens (optional)',
];

export function PricingPage() {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <p className="text-sm font-semibold tracking-tight">RevGen BillIQ</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/login">Sign in</Link>} />
            <Button size="sm" nativeButton={false} render={<Link to="/register">Get started</Link>} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-4 py-12 sm:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Simple, transparent pricing</h1>
          <p className="mt-2 text-muted-foreground">Choose the plan that fits your business. Upgrade anytime.</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {PLAN_CARDS.map((plan) => (
            <Card key={plan.id} className={cn(plan.highlight && 'border-primary shadow-md')}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>{plan.label}</CardTitle>
                  {plan.highlight && <span className="text-lg">⭐</span>}
                </div>
                <CardDescription>{plan.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </p>
                <Button
                  className="w-full"
                  variant={plan.highlight ? 'default' : 'outline'}
                  nativeButton={false}
                  render={<Link to="/register">Get started</Link>}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="overflow-x-auto rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead className="text-center">Basic</TableHead>
                <TableHead className="text-center">Explore ⭐</TableHead>
                <TableHead className="text-center">Advance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FEATURE_ROWS.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-center">
                    <CellValue value={row.basic} />
                  </TableCell>
                  <TableCell className="text-center">
                    <CellValue value={row.explore} />
                  </TableCell>
                  <TableCell className="text-center">
                    <CellValue value={row.advance} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>What's included in Business Branding (Advance Plan)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {BRANDING_ITEMS.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
