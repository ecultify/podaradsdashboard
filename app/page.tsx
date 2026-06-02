'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { DASHBOARD_BRAND_LETTER, DASHBOARD_TITLE, DASHBOARD_SUBTITLE } from '@/lib/dashboard-config';
import { MetaTab } from '@/components/MetaTab';
// import { GoogleAdsTab } from '@/components/GoogleAdsTab'; // Google Ads tab hidden for now

export default function Dashboard() {
  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <header
        className="sticky top-0 z-50 border-b"
        style={{ borderColor: '#e5e7eb', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)' }}
      >
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{ background: '#3b82f6', color: '#fff' }}
          >
            {DASHBOARD_BRAND_LETTER}
          </div>
          <div>
            <h1 className="text-base font-semibold" style={{ color: '#111827' }}>
              {DASHBOARD_TITLE}
            </h1>
            <p className="text-xs" style={{ color: '#9ca3af' }}>
              {DASHBOARD_SUBTITLE}
            </p>
          </div>
        </div>
      </header>

      <Tabs.Root defaultValue="meta">
        <div className="sticky top-[65px] z-40 border-b" style={{ borderColor: '#e5e7eb', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)' }}>
          <Tabs.List className="max-w-[1200px] mx-auto px-6 flex gap-1">
            <TabTrigger value="meta">Meta Ads</TabTrigger>
            {/* <TabTrigger value="google">Google Ads</TabTrigger> */}
          </Tabs.List>
        </div>

        <main className="max-w-[1200px] mx-auto px-6 py-6">
          <Tabs.Content value="meta" className="focus:outline-none">
            <MetaTab />
          </Tabs.Content>
          {/* <Tabs.Content value="google" className="focus:outline-none">
            <GoogleAdsTab />
          </Tabs.Content> */}
        </main>
      </Tabs.Root>
    </div>
  );
}

function TabTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Tabs.Trigger
      value={value}
      className="relative px-4 py-3 text-sm font-medium transition-colors data-[state=active]:text-blue-600 data-[state=inactive]:text-gray-500 hover:text-gray-700 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-blue-600"
    >
      {children}
    </Tabs.Trigger>
  );
}
