import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Podar Ads Dashboard',
  description: 'Podar Meta Ads — website leads performance',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-screen antialiased"
        style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
