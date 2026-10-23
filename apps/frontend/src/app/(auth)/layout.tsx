'use client';

import type { ReactNode } from 'react';

import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { useThemeEffect } from '@/store/theme';

export default function AuthLayout({ children }: { children: ReactNode }) {
  useThemeEffect();

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-[#080E1E] lg:sticky lg:top-0 lg:block lg:h-screen">
        <img
          src="/jobdev-auth-poster.png"
          alt="JobDev - get hired faster"
          className="absolute inset-0 h-full w-full object-contain"
        />
      </aside>

      <main className="relative flex flex-col items-center justify-center bg-background p-6 sm:p-10">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <ThemeToggle />
        </div>
        <div className="mb-6 lg:hidden">
          <Logo size={40} />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
