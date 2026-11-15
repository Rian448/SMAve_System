'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { homePath } from '@/lib/permissions';

/** The system is for staff only, so the front page is the sign-in page: visitors are
 *  sent to it, and signed-in staff go straight to their own home page. */
export default function Home() {
  const { isAuthenticated, isLoading, can } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(isAuthenticated ? homePath(can) : '/login');
  }, [isLoading, isAuthenticated, can, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#eef1fb] to-[#dde6ff]">
      <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full" aria-label="Loading" />
    </div>
  );
}
