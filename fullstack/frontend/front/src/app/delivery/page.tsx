'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, Delivery } from '@/lib/api';
import Link from 'next/link';

export default function DeliveryPage() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchDeliveries();
  }, [filter]);

  const fetchDeliveries = async () => {
    try {
      const response = await api.deliveries.getAll(filter !== 'all' ? { status: filter } : undefined);
      setDeliveries(response.data || []);
    } catch (error) {
      console.error('Error fetching deliveries:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    const statusStyles: Record<string, string> = {
      scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      in_transit: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      delivered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      pending: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
    };
    return statusStyles[status] || 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
  };

  const filteredDeliveries = deliveries.filter(delivery =>
    delivery.deliveryNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    delivery.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    delivery.toBranchName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    delivery.customerAddress?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const updateDeliveryStatus = async (id: number, newStatus: string) => {
    try {
      await api.deliveries.updateStatus(id, newStatus);
      fetchDeliveries();
    } catch (error) {
      console.error('Error updating delivery status:', error);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Delivery Management</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              Schedule and track deliveries
            </p>
          </div>
          <Link
            href="/delivery/new"
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Schedule Delivery
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Scheduled</p>
                <p className="text-xl font-bold text-zinc-900 dark:text-white">
                  {deliveries.filter(d => d.status === 'scheduled').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">In Transit</p>
                <p className="text-xl font-bold text-zinc-900 dark:text-white">
                  {deliveries.filter(d => d.status === 'in_transit').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Delivered</p>
                <p className="text-xl font-bold text-zinc-900 dark:text-white">
                  {deliveries.filter(d => d.status === 'delivered').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-zinc-600 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Total</p>
                <p className="text-xl font-bold text-zinc-900 dark:text-white">
                  {deliveries.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search deliveries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
            {/* Status Filter */}
            <div className="flex gap-2 flex-wrap">
              {['all', 'scheduled', 'in_transit', 'delivered'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === status
                      ? 'bg-amber-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Deliveries List */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full mx-auto"></div>
              <p className="mt-4 text-zinc-500 dark:text-zinc-400">Loading deliveries...</p>
            </div>
          ) : filteredDeliveries.length === 0 ? (
            <div className="p-8 text-center">
              <svg className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">No deliveries found</h3>
              <p className="text-zinc-500 dark:text-zinc-400">Schedule a delivery to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredDeliveries.map((delivery) => (
                <div key={delivery.id} className="p-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-start space-x-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        delivery.status === 'delivered' 
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : delivery.status === 'in_transit'
                          ? 'bg-yellow-100 dark:bg-yellow-900/30'
                          : 'bg-blue-100 dark:bg-blue-900/30'
                      }`}>
                        <svg className={`w-6 h-6 ${
                          delivery.status === 'delivered' 
                            ? 'text-green-600 dark:text-green-400'
                            : delivery.status === 'in_transit'
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-amber-600 dark:text-amber-400">{delivery.deliveryNumber}</h3>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusBadge(delivery.status)}`}>
                            {delivery.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-white mt-1">
                          {delivery.type === 'customer_delivery' ? delivery.customerName : delivery.toBranchName}
                        </p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                          {delivery.type === 'customer_delivery' ? delivery.customerAddress : `To: ${delivery.toBranchName}`}
                        </p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                          {delivery.jobOrderNumber ? `Job Order: ${delivery.jobOrderNumber} • ` : ''}Scheduled: {formatDate(delivery.scheduledDate)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-16 md:ml-0">
                      {delivery.status === 'scheduled' && (
                        <button
                          onClick={() => updateDeliveryStatus(delivery.id, 'in_transit')}
                          className="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg text-sm font-medium hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors"
                        >
                          Start Transit
                        </button>
                      )}
                      {delivery.status === 'in_transit' && (
                        <button
                          onClick={() => updateDeliveryStatus(delivery.id, 'delivered')}
                          className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-sm font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                        >
                          Mark Delivered
                        </button>
                      )}
                      <Link
                        href={`/delivery/${delivery.id}`}
                        className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

