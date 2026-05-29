'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, JobOrder } from '@/lib/api';

function NewDeliveryForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [jobOrders, setJobOrders] = useState<JobOrder[]>([]);
  const [loadingJobOrders, setLoadingJobOrders] = useState(true);
  
  // Form state
  const [jobOrderId, setJobOrderId] = useState(searchParams.get('jobOrderId') || '');
  const [scheduledDate, setScheduledDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('morning');
  const [recipientName, setRecipientName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehicleAssigned, setVehicleAssigned] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    api.sales.getJobOrders()
      .then(response => {
        const completedOrders = (response.data || []).filter(
          (jo: JobOrder) => jo.status === 'completed'
        );
        setJobOrders(completedOrders);
        setLoadingJobOrders(false);

        const preselectedId = searchParams.get('jobOrderId');
        if (preselectedId) {
          const selectedOrder = completedOrders.find((jo: JobOrder) => String(jo.id) === preselectedId);
          if (selectedOrder) {
            setRecipientName(selectedOrder.customerName);
            setDeliveryAddress(selectedOrder.customerEmail || '');
            setContactNumber(selectedOrder.customerPhone || '');
          }
        }
      })
      .catch(err => {
        console.error(err);
        setLoadingJobOrders(false);
      });
  }, [searchParams]);

  const handleJobOrderChange = (id: string) => {
    setJobOrderId(id);
    const selectedOrder = jobOrders.find(jo => String(jo.id) === id);
    if (selectedOrder) {
      setRecipientName(selectedOrder.customerName);
      setDeliveryAddress(selectedOrder.customerEmail || '');
      setContactNumber(selectedOrder.customerPhone || '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const delivery = {
        type: 'customer_delivery' as const,
        fromBranchId: 1,
        customerName: recipientName,
        customerPhone: contactNumber,
        customerAddress: deliveryAddress,
        jobOrderId: parseInt(jobOrderId) || undefined,
        items: [],
        scheduledDate,
        driverName,
        vehiclePlate: vehicleAssigned,
        notes,
      };

      await api.deliveries.create(delivery);
      router.push('/delivery');
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const drivers = [
    { name: 'Juan Cruz', vehicle: 'Delivery Van 01' },
    { name: 'Pedro Santos', vehicle: 'Delivery Van 02' },
    { name: 'Miguel Garcia', vehicle: 'Pickup Truck 01' },
  ];

  const timeSlots = [
    { value: 'morning', label: '9:00 AM - 12:00 PM', icon: '🌅' },
    { value: 'afternoon', label: '1:00 PM - 5:00 PM', icon: '☀️' },
    { value: 'evening', label: '5:00 PM - 8:00 PM', icon: '🌆' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/delivery')}
            className="flex items-center text-gray-600 hover:text-[#011c72] mb-2"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Deliveries
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Schedule New Delivery</h1>
          <p className="text-gray-500 mt-1">
            Schedule delivery for a completed job order
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Job Order Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Select Job Order
            </h2>

            {loadingJobOrders ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-[#011c72] border-t-transparent rounded-full"></div>
              </div>
            ) : jobOrders.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-gray-500">No completed job orders available for delivery</p>
                <button
                  type="button"
                  onClick={() => router.push('/sales')}
                  className="mt-4 text-[#011c72] hover:text-[#011c72] font-medium"
                >
                  View Job Orders
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {jobOrders.map(jo => (
                  <label
                    key={jo.id}
                    className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      jobOrderId === String(jo.id)
                        ? 'border-[#011c72] bg-[#eef1fb]'
                        : 'border-gray-200 hover:border-[#011c72]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="jobOrder"
                      value={jo.id}
                      checked={jobOrderId === String(jo.id)}
                      onChange={(e) => handleJobOrderChange(e.target.value)}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">
                          #{jo.id} - {jo.customerName}
                        </p>
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                          COMPLETED
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {jo.vehicleInfo?.make} {jo.vehicleInfo?.model} • {jo.description}
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 ml-4 flex items-center justify-center ${
                      jobOrderId === String(jo.id)
                        ? 'border-[#011c72] bg-[#011c72]'
                        : 'border-gray-300'
                    }`}>
                      {jobOrderId === String(jo.id) && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Delivery Schedule */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Delivery Schedule
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Delivery Date *
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Slot *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map(slot => (
                    <button
                      key={slot.value}
                      type="button"
                      onClick={() => setTimeSlot(slot.value)}
                      className={`p-3 rounded-lg border-2 text-center transition-colors ${
                        timeSlot === slot.value
                          ? 'border-[#011c72] bg-[#eef1fb]'
                          : 'border-gray-200 hover:border-[#011c72]'
                      }`}
                    >
                      <span className="text-lg">{slot.icon}</span>
                      <p className="text-xs font-medium text-gray-900 mt-1">
                        {slot.value.charAt(0).toUpperCase() + slot.value.slice(1)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Recipient Information */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Delivery Address
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipient Name *
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Number *
                </label>
                <input
                  type="tel"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="09XX XXX XXXX"
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Delivery Address *
                </label>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  rows={2}
                  placeholder="Complete address including street, barangay, city..."
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent resize-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Driver Assignment */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Driver Assignment
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign Driver
                </label>
                <select
                  value={driverName}
                  onChange={(e) => {
                    const driver = drivers.find(d => d.name === e.target.value);
                    setDriverName(e.target.value);
                    if (driver) {
                      setVehicleAssigned(driver.vehicle);
                    }
                  }}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                >
                  <option value="">Select driver (optional)</option>
                  {drivers.map(d => (
                    <option key={d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vehicle
                </label>
                <select
                  value={vehicleAssigned}
                  onChange={(e) => setVehicleAssigned(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                >
                  <option value="">Select vehicle (optional)</option>
                  <option value="Delivery Van 01">Delivery Van 01</option>
                  <option value="Delivery Van 02">Delivery Van 02</option>
                  <option value="Pickup Truck 01">Pickup Truck 01</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Special instructions for delivery (e.g., gate code, landmarks, handling instructions)..."
              className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => router.push('/delivery')}
              className="px-6 py-2 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !jobOrderId || !scheduledDate}
              className="inline-flex items-center px-6 py-2 bg-[#011c72] hover:bg-[#01268c] text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Scheduling...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Schedule Delivery
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function NewDeliveryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full"></div>
      </div>
    }>
      <NewDeliveryForm />
    </Suspense>
  );
}


