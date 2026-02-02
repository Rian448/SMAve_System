'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Delivery } from '@/lib/api';

export default function DeliveryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (params.id) {
      api.getDelivery(params.id as string)
        .then(response => {
          setDelivery(response.data || null);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [params.id]);

  const updateStatus = async (newStatus: string) => {
    if (!delivery) return;
    setUpdating(true);
    try {
      await api.updateDelivery(delivery.id, { status: newStatus });
      setDelivery({ ...delivery, status: newStatus });
    } catch (err) {
      console.error(err);
    }
    setUpdating(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'in_transit': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'delivered': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'cancelled': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled':
        return (
          <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'in_transit':
        return (
          <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
          </svg>
        );
      case 'delivered':
        return (
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
          </div>
        </main>
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <p className="text-red-600 dark:text-red-400">Delivery not found</p>
            <button
              onClick={() => router.push('/delivery')}
              className="mt-4 text-amber-600 hover:text-amber-700 font-medium"
            >
              Back to Deliveries
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <button
              onClick={() => router.push('/delivery')}
              className="flex items-center text-zinc-600 dark:text-zinc-400 hover:text-amber-600 mb-2"
            >
              <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Deliveries
            </button>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              Delivery #{delivery.id}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              Job Order #{delivery.job_order_id}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 text-sm font-medium rounded-full ${getStatusColor(delivery.status)}`}>
              {delivery.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>
        </div>

        {/* Status Timeline */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6">Delivery Progress</h2>
          <div className="relative">
            <div className="flex items-center justify-between">
              {['scheduled', 'in_transit', 'delivered'].map((status, index) => {
                const isCompleted = 
                  (delivery.status === 'in_transit' && index === 0) ||
                  (delivery.status === 'delivered' && index <= 1) ||
                  delivery.status === status;
                const isCurrent = delivery.status === status;
                
                return (
                  <div key={status} className="flex flex-col items-center relative z-10">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                      isCompleted || isCurrent
                        ? 'bg-amber-100 dark:bg-amber-900/30'
                        : 'bg-zinc-100 dark:bg-zinc-800'
                    }`}>
                      {getStatusIcon(isCompleted || isCurrent ? status : 'pending')}
                    </div>
                    <p className={`mt-2 text-sm font-medium ${
                      isCompleted || isCurrent
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-zinc-400 dark:text-zinc-500'
                    }`}>
                      {status.replace('_', ' ').charAt(0).toUpperCase() + status.replace('_', ' ').slice(1)}
                    </p>
                  </div>
                );
              })}
            </div>
            {/* Progress line */}
            <div className="absolute top-8 left-8 right-8 h-0.5 bg-zinc-200 dark:bg-zinc-700 -z-0">
              <div 
                className="h-full bg-amber-500 transition-all duration-500"
                style={{
                  width: delivery.status === 'scheduled' ? '0%' : 
                         delivery.status === 'in_transit' ? '50%' : 
                         delivery.status === 'delivered' ? '100%' : '0%'
                }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex justify-center gap-4">
            {delivery.status === 'scheduled' && (
              <button
                onClick={() => updateStatus('in_transit')}
                disabled={updating}
                className="inline-flex items-center px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                </svg>
                Start Transit
              </button>
            )}
            {delivery.status === 'in_transit' && (
              <button
                onClick={() => updateStatus('delivered')}
                disabled={updating}
                className="inline-flex items-center px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Mark Delivered
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Delivery Information */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Delivery Schedule
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Scheduled Date</span>
                <span className="text-sm font-medium text-zinc-900 dark:text-white">
                  {new Date(delivery.scheduled_date).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Time Slot</span>
                <span className="text-sm font-medium text-zinc-900 dark:text-white">
                  {delivery.time_slot || '9:00 AM - 12:00 PM'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Driver</span>
                <span className="text-sm font-medium text-zinc-900 dark:text-white">
                  {delivery.driver_name || 'Not assigned'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Vehicle</span>
                <span className="text-sm font-medium text-zinc-900 dark:text-white">
                  {delivery.vehicle_assigned || 'Delivery Van 01'}
                </span>
              </div>
            </div>
          </div>

          {/* Delivery Address */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Delivery Address
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Recipient</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white mt-1">
                  {delivery.recipient_name || delivery.customer_name}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Address</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white mt-1">
                  {delivery.delivery_address}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Contact Number</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white mt-1">
                  {delivery.contact_number || 'N/A'}
                </p>
              </div>
              {delivery.delivery_notes && (
                <div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Notes</p>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white mt-1">
                    {delivery.delivery_notes}
                  </p>
                </div>
              )}
            </div>
            
            {/* Map Placeholder */}
            <div className="mt-4 h-48 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <svg className="w-12 h-12 text-zinc-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <p className="text-sm text-zinc-500 mt-2">Map Preview</p>
              </div>
            </div>
          </div>
        </div>

        {/* Delivery History */}
        <div className="mt-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Delivery History</h2>
          <div className="space-y-4">
            {[
              { time: '2026-01-22 09:00', event: 'Delivery scheduled', status: 'scheduled' },
              ...(delivery.status === 'in_transit' || delivery.status === 'delivered' ? [
                { time: '2026-01-22 10:30', event: 'Driver dispatched - Vehicle in transit', status: 'in_transit' }
              ] : []),
              ...(delivery.status === 'delivered' ? [
                { time: '2026-01-22 11:45', event: 'Package delivered successfully', status: 'delivered' }
              ] : []),
            ].map((item, index) => (
              <div key={index} className="flex items-start">
                <div className={`w-2 h-2 rounded-full mt-2 mr-3 ${
                  item.status === 'delivered' ? 'bg-green-500' :
                  item.status === 'in_transit' ? 'bg-yellow-500' :
                  'bg-blue-500'
                }`} />
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{item.event}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button 
            onClick={() => router.push(`/sales/${delivery.job_order_id}`)}
            className="inline-flex items-center px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-amber-300 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View Job Order
          </button>
          <button className="inline-flex items-center px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-amber-300 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium transition-colors">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Delivery Note
          </button>
          {delivery.status !== 'delivered' && delivery.status !== 'cancelled' && (
            <button
              onClick={() => updateStatus('cancelled')}
              disabled={updating}
              className="inline-flex items-center px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:bg-red-100 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel Delivery
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
