import type { ReactNode } from 'react';
import { AuthBackground } from '@/features/auth/components/AuthBackground';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-muted/50 via-background to-muted/40 p-4">
      <AuthBackground />
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  );
}
