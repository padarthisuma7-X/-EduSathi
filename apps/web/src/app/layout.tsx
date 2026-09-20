import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { PLATFORM } from '@sahaj/shared';

import { SkipLink } from '@/components/a11y/SkipLink';
import { OfflineStatusBadge } from '@/components/offline/OfflineStatusBadge';
import { ServiceWorkerRegistrar } from '@/components/offline/ServiceWorkerRegistrar';
import { BOOTSTRAP_SCRIPT } from '@/features/a11y/bootstrap';

import './globals.css';
import { AppProviders } from './providers';

export const metadata: Metadata = {
  title: {
    default: `${PLATFORM.name} — learning that adapts to every child`,
    template: `%s · ${PLATFORM.name}`,
  },
  description:
    'An offline-first, accessible learning platform for children with learning difficulties in government and low-resource schools.',
  applicationName: PLATFORM.name,
  manifest: '/manifest.webmanifest',
  // Search engines must not index learner-facing pages that could be tied to a
  // child; see docs/ACCESSIBILITY.md for the full privacy position.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Kept in sync by `applySettingsToElement` so the browser chrome matches the
  // selected theme instead of flashing white in dark modes.
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  // Zooming must never be blocked (WCAG 1.4.4): learners pinch to enlarge.
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <head>
        {/*
          Runs before the app bundle and before first paint, restoring the
          learner's typography and theme from a cached snapshot. Without it, a
          learner who reads at 220% on a dark theme sees a flash of small
          dark-on-light text on every navigation.

          `dangerouslySetInnerHTML` is required for a synchronous inline script;
          the content is a build-time constant from `features/a11y/bootstrap.ts`,
          not user input.
        */}
        <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas text-ink">
        <SkipLink />
        <AppProviders>
          <SiteHeader />
          {/*
            `tabIndex={-1}` lets the skip link move focus here instead of only
            scrolling, which is what screen-reader users expect from it.
          */}
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 pb-40 pt-6">
            {children}
          </main>
          <SiteFooter />
          <ServiceWorkerRegistrar />
        </AppProviders>
      </body>
    </html>
  );
}

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/lessons', label: 'Lessons' },
  { href: '/quizzes', label: 'Practice' },
  { href: '/progress', label: 'My progress' },
  { href: '/teacher', label: 'Teacher' },
  { href: '/accessibility', label: 'Accessibility' },
] as const;

function SiteHeader() {
  return (
    <header
      // Hidden in focus mode: it is chrome, and chrome is exactly what
      // zero-distraction mode exists to remove. The accessibility launcher is
      // deliberately NOT hidden, so focus mode always has an exit.
      data-focus-mode-hide
      className="border-b-2 border-line bg-surface"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-ink">
          {PLATFORM.name}
        </Link>
        <nav aria-label="Main">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-12 items-center px-1 text-base"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto">
          <OfflineStatusBadge />
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer
      data-focus-mode-hide
      className="mt-8 border-t-2 border-line bg-surface px-4 py-6 pb-32 text-base text-ink-muted"
    >
      <div className="mx-auto w-full max-w-5xl">
        <p>
          {PLATFORM.name}. Works offline. Your settings and your answers stay on this device until it can
          reach the school server.
        </p>
      </div>
    </footer>
  );
}
