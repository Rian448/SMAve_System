'use client';
import AuditTrailPanel from '@/components/AuditTrailPanel';

export default function AuditTrailPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
          <p className="text-gray-500 mt-1">Every recorded action in the system: who did what, and when</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <AuditTrailPanel />
        </div>
      </main>
    </div>
  );
}
