'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, DashboardStats, Alert, Activity, type DashboardPeriod } from '@/lib/api';
import { formatDateTime as formatDate } from '@/lib/dateUtils';
import Link from 'next/link';
import MyWork from '@/components/MyWork';

const PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
];

export default function Dashboard() {
  const { user, isLoading: authLoading, can } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<Array<Alert & { rowKey: string }>>([]);
  const [activities, setActivities] = useState<Array<Activity & { rowKey: string; user: string; action: string; details: string }>>([]);
  const [loading, setLoading] = useState(true);
  // Administrators can narrow the dashboard to one branch ('' = whole company);
  // everyone else always sees only their own branch.
  const isAdmin = can('branches.all');
  const isStaff = can('dashboard.view');
  const isWorkerAccount = user?.role === 'seat_maker' || user?.role === 'sewer';
  const [branchFilter, setBranchFilter] = useState('');
  // Period the sales figures cover
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label || '';
  const [branches, setBranches] = useState<{ id: number; name: string; isWarehouse: boolean }[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    api.settings.getBranches().then(r => {
      if (r.data) setBranches(r.data.filter(b => b.isActive));
    }).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!authLoading && !user) {
      setLoading(false);
      return;
    }

    // Customers and worker accounts get a simple dashboard and no company figures
    if (!authLoading && user && !isStaff) {
      setLoading(false);
      return;
    }

    if (!authLoading && user) {
      fetchDashboardData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, branchFilter, period]);

  const fetchDashboardData = async () => {
    const branchId = isAdmin && branchFilter ? Number(branchFilter) : undefined;
    try {
      const [statsData, alertsData, activitiesData] = await Promise.all([
        api.dashboard.getStats(branchId, period),
        api.dashboard.getAlerts(branchId),
        api.dashboard.getRecentActivity(branchId)
      ]);
      setStats(statsData.data || null);
      // rowKey is only a React key — it must not shadow `id`/`itemId`, which
      // carry the real record ids the rows link to.
      setAlerts(
        (alertsData.data || []).map((alert, index) => ({
          ...alert,
          rowKey: `${alert.type}-${index}`
        }))
      );
      setActivities(
        (activitiesData.data || []).map((activity, index) => ({
          ...activity,
          rowKey: `${activity.type}-${index}`,
          user: activity.status ? activity.status.replace('_', ' ').toUpperCase() : 'SYSTEM',
          action: activity.title,
          details: activity.description
        }))
      );
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };


  /**
   * Where an alert row should take you. Returns null when this user's role
   * can't reach the destination, in which case the row stays non-clickable
   * rather than linking somewhere that would bounce them.
   */
  const getAlertHref = (alert: Alert): string | null => {
    switch (alert.type) {
      case 'low_stock':
        if (!can('inventory.view')) return null;
        // Land on the raw-materials tab, filtered to low stock and this material.
        return `/inventory?tab=raw-materials&status=low-stock${
          alert.itemName ? `&q=${encodeURIComponent(alert.itemName)}` : ''
        }`;
      case 'delivery_due':
        if (!can('item_trail.view')) return null;
        return alert.itemId ? `/delivery/${alert.itemId}` : '/delivery';
      case 'overdue_order':
        if (!can('sales.view')) return null;
        return alert.itemId ? `/sales/${alert.itemId}` : '/sales';
      default:
        return null;
    }
  };

  /** Where a recent-activity row should take you, with the same role gating. */
  const getActivityHref = (activity: Activity): string | null => {
    switch (activity.type) {
      case 'job_order':
        if (!can('sales.view')) return null;
        return activity.id ? `/sales/${activity.id}` : '/sales';
      case 'delivery':
        if (!can('item_trail.view')) return null;
        return activity.id ? `/delivery/${activity.id}` : '/delivery';
      default:
        return null;
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'low_stock':
        return (
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        );
      case 'pending_delivery':
        return (
          <div className="w-10 h-10 rounded-full bg-[#dde6ff] flex items-center justify-center">
            <svg className="w-5 h-5 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-gray-200 rounded"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-80 bg-gray-200 rounded-xl"></div>
              <div className="h-80 bg-gray-200 rounded-xl"></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Welcome back, {user?.fullName?.split(' ')[0]}!
              </h1>
              <p className="text-gray-500 mt-1">
                {`Here's what's happening at ${
                  isAdmin
                    ? (stats?.scopeBranchName || 'all branches')
                    : (stats?.scopeBranchName || user?.branch || 'your branch')
                } today.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as DashboardPeriod)}
              aria-label="Sales period"
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm"
            >
              {PERIOD_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {isAdmin && (
              <select
                value={branchFilter}
                onChange={(e) => { setLoading(true); setBranchFilter(e.target.value); }}
                aria-label="Branch"
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm"
              >
                <option value="">All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}{b.isWarehouse ? ' (Warehouse)' : ''}</option>
                ))}
              </select>
            )}
            </div>
          </div>
        </div>

        {/* Worker accounts: their own tasks, assigned and run from Worker Management */}
        {isWorkerAccount && <MyWork />}

        {/* Stats Cards - For staff only */}
        {isStaff && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
          {/* Pending Orders */}
          <Link href="/sales" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-[#011c72] hover:shadow-md transition-all block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Pending Jobs</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {stats?.pendingOrders || 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#dde6ff] flex items-center justify-center">
                <svg className="w-6 h-6 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
            {can('sales.view') && (
              <span className="text-sm text-[#011c72] mt-4 inline-block">
                Review jobs →
              </span>
            )}
          </Link>

          {/* In Progress Orders */}
          <Link href="/sales" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-blue-500 hover:shadow-md transition-all block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">In Progress</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">
                  {stats?.inProgressOrders || 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Completed Orders */}
          <Link href="/reports" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-green-500 hover:shadow-md transition-all block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Completed · {periodLabel}</p>
                <p className="text-3xl font-bold text-green-600 mt-1">
                  {stats?.completedOrders || 0}
                </p>
                {(stats?.completedPremadeOrders || 0) > 0 && (
                  <p className="text-xs text-gray-500 mt-1">+ {stats?.completedPremadeOrders} premade sale{stats?.completedPremadeOrders === 1 ? '' : 's'}</p>
                )}
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            {can('reports.inventory') && (
              <span className="text-sm text-green-600 mt-4 inline-block">
                View reports →
              </span>
            )}
          </Link>

          {/* Low Stock Items */}
          <Link href="/inventory" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-red-500 hover:shadow-md transition-all block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Low Stock</p>
                <p className={`text-3xl font-bold mt-1 ${(stats?.lowStockItems || 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {stats?.lowStockItems || 0}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${(stats?.lowStockItems || 0) > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                <svg className={`w-6 h-6 ${(stats?.lowStockItems || 0) > 0 ? 'text-red-600' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            </div>
            {can('inventory.view') && (
              <span className="text-sm text-[#011c72] mt-4 inline-block">
                Manage inventory →
              </span>
            )}
          </Link>

          {/* Pending Deliveries */}
          <Link href="/delivery" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-blue-500 hover:shadow-md transition-all block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Pending Deliveries</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">
                  {stats?.pendingDeliveries || 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
            </div>
            {can('item_trail.view') && (
              <span className="text-sm text-blue-600 mt-4 inline-block">
                Track deliveries →
              </span>
            )}
          </Link>

          {/* Total Revenue */}
          <Link href="/reports" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-emerald-500 hover:shadow-md transition-all block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Sales · {periodLabel}</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">
                  {formatCurrency(stats?.totalRevenue || 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Job orders {formatCurrency(stats?.jobOrderRevenue || 0)} · Premade {formatCurrency(stats?.premadeRevenue || 0)}
                  <span className="block text-gray-400">VAT excluded</span>
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            {can('reports.inventory') && (
              <span className="text-sm text-emerald-600 mt-4 inline-block">
                View reports →
              </span>
            )}
          </Link>
        </div>
        )}

        {/* Main Content Grid - For staff only */}
        {isStaff && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alerts Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <svg className="w-5 h-5 mr-2 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Alerts & Notifications
              </h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-80 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>All caught up! No alerts at the moment.</p>
                </div>
              ) : (
                alerts.map((alert) => {
                  const href = getAlertHref(alert);
                  const body = (
                    <>
                      {getAlertIcon(alert.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {alert.title}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          {alert.description}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                        alert.severity === 'critical'
                          ? 'bg-red-100 text-red-700'
                          : alert.severity === 'warning'
                          ? 'bg-[#dde6ff] text-[#011c72]'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {alert.severity}
                      </span>
                      {href && (
                        <svg className="w-4 h-4 text-gray-300 shrink-0 self-center" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </>
                  );

                  // Rows this user can't act on stay as plain text instead of
                  // linking somewhere their role would be refused.
                  return href ? (
                    <Link key={alert.rowKey} href={href}
                      className="px-6 py-4 flex items-start space-x-4 hover:bg-[#f5f7ff] transition-colors cursor-pointer group">
                      {body}
                    </Link>
                  ) : (
                    <div key={alert.rowKey} className="px-6 py-4 flex items-start space-x-4">
                      {body}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <svg className="w-5 h-5 mr-2 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Recent Activity
              </h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-80 overflow-y-auto">
              {activities.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p>No recent activity to show.</p>
                </div>
              ) : (
                activities.map((activity) => {
                  const href = getActivityHref(activity);
                  const body = (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-gray-900 min-w-0 truncate">
                          {activity.action}
                        </p>
                        <span className="text-xs text-gray-500 shrink-0">
                          {formatDate(activity.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {activity.details} • <span className="text-gray-400">{activity.user}</span>
                      </p>
                    </>
                  );

                  return href ? (
                    <Link key={activity.rowKey} href={href}
                      className="block px-6 py-4 hover:bg-[#f5f7ff] transition-colors cursor-pointer">
                      {body}
                    </Link>
                  ) : (
                    <div key={activity.rowKey} className="px-6 py-4">
                      {body}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        )}

        {/* Quick Actions */}
        {can('sales.add', 'purchase_orders.add', 'item_trail.add', 'reports.inventory') && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {can('sales.add') && (
              <Link
                href="/sales/new"
                className="flex flex-col items-center justify-center p-6 bg-white rounded-xl border border-gray-200 hover:border-[#011c72] hover:shadow-md transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-[#dde6ff] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-900">New Job Order</span>
              </Link>
              )}

              <>
                  {can('purchase_orders.add') && (
                  <Link
                    href="/inventory/purchase-orders/new"
                    className="flex flex-col items-center justify-center p-6 bg-white rounded-xl border border-gray-200 hover:border-green-500 hover:shadow-md transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-900">Purchase Order</span>
                  </Link>
                  )}

                  {can('item_trail.add') && (
                  <Link
                    href="/delivery/new"
                    className="flex flex-col items-center justify-center p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-900">Schedule Delivery</span>
                  </Link>
                  )}

                  {can('reports.inventory') && (
                  <Link
                    href="/reports"
                    className="flex flex-col items-center justify-center p-6 bg-white rounded-xl border border-gray-200 hover:border-purple-500 hover:shadow-md transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-900">View Reports</span>
                  </Link>
                  )}
              </>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
