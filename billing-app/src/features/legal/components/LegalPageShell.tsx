import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LEGAL_LINKS = [
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
  { to: '/cookies', label: 'Cookie Policy' },
];

interface LegalPageShellProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalPageShell({ title, lastUpdated, children }: LegalPageShellProps) {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            RevGen BillIQ
          </Link>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/login">Sign in</Link>} />
            <Button size="sm" nativeButton={false} render={<Link to="/register">Get started</Link>} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>

        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm">
            <span className="font-semibold">Draft — pending legal review.</span> This is placeholder policy text and
            has not been reviewed by counsel.
          </p>
        </div>

        <article className="max-w-3xl space-y-8 text-sm leading-relaxed text-foreground">{children}</article>
      </main>

      <footer className="border-t bg-background px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <p>&copy; {new Date().getFullYear()} RevGen BillIQ. All rights reserved.</p>
          <div className="flex gap-4">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="hover:text-foreground hover:underline">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
      <div className="space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}
