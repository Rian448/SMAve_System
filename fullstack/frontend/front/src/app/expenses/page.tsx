'use client';
import ExpenseTracker from '@/components/ExpenseTracker';

export default function ExpensesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-gray-500 mt-1">What the business spends day to day: rent, utilities, supplies and more.</p>
        </div>
        <ExpenseTracker />
      </main>
    </div>
  );
}
