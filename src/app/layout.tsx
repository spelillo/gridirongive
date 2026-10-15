import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: 'Gridiron Give', template: '%s · Gridiron Give' },
  description: 'Fund specific gear for specific high school and youth athletes. Coaches buy it and post the receipt.',
  applicationName: 'Gridiron Give',
  formatDetection: { telephone: false },
  icons: { icon: '/icon.svg' },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f5f6f7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a href="#main" className="sr-only z-[2000] rounded-md bg-primary px-4 py-3 font-medium text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to main content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
