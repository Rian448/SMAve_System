'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import { pagePermissions } from '@/lib/permissions';
import Navigation from './Navigation';
import ChatBubble from './ChatBubble';

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { isAuthenticated, isLoading, can } = useAuth();
  const pathname = usePathname();
  // Phones: the sidebar is a drawer opened from the top bar. It remembers the page
  // it was opened on, so going to another page closes it.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const mobileOpen = drawerPath === pathname;
  const setMobileOpen = (open: boolean) => setDrawerPath(open ? pathname : null);

  const authlessPages = ['/login'];
  const showSidebar = isAuthenticated && !isLoading && !authlessPages.includes(pathname);
  const showPublicTopNav = !isAuthenticated && !isLoading && !authlessPages.includes(pathname);

  // A signed-in user opening a page their permissions don't cover (e.g. from an old link)
  const required = pagePermissions(pathname);
  const denied = isAuthenticated && !isLoading && required !== null && !can(...required);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen} onMobileOpen={() => setMobileOpen(true)} onMobileClose={() => setMobileOpen(false)} />
      <div
        className={`flex-1 min-w-0 transition-all duration-300 ${
          showSidebar ? `pt-14 md:pt-0 ${collapsed ? 'md:ml-16' : 'md:ml-64'}` : showPublicTopNav ? 'pt-16' : ''
        }`}
      >
        {denied ? <AccessDenied /> : children}
      </div>
      <ChatBubble />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center bg-white rounded-xl border border-gray-200 shadow-sm p-8">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-gray-900">Access denied</h1>
        <p className="mt-2 text-sm text-gray-500">
          Your account doesn&apos;t have permission to open this page. Ask an administrator if you need access.
        </p>
        <Link href="/dashboard"
          className="mt-6 inline-block px-5 py-2.5 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-semibold transition-colors">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
