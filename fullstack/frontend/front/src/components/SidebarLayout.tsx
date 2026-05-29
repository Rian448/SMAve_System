'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import Navigation from './Navigation';

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();

  const authlessPages = ['/login', '/register'];
  const showSidebar = isAuthenticated && !isLoading && !authlessPages.includes(pathname);
  const showPublicTopNav = !isAuthenticated && !isLoading && !authlessPages.includes(pathname);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div
        className={`flex-1 min-w-0 transition-all duration-300 ${
          showSidebar ? (collapsed ? 'ml-16' : 'ml-64') : showPublicTopNav ? 'pt-16' : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
}
