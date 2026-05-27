'use client';
import { useState, useEffect } from 'react';
import { api, Appointment } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

const TIME_RANGES: Record<string, [number, number]> = {
  morning:   [8,  12],
  afternoon: [12, 17],
  evening:   [17, 20],
};

function getTimeSlots(preferredTime?: string): string[] {
  const [startH, endH] = TIME_RANGES[preferredTime ?? ''] ?? [8, 20];
  const slots: string[] = [];
  for (let mins = startH * 60; mins <= endH * 60; mins += 30) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const period = h < 12 ? 'AM' : 'PM';
    slots.push(`${h12}:${m.toString().padStart(2, '0')} ${period}`);
  }
  return slots;
}

export default function AppointmentsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [confirmedTime, setConfirmedTime] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const response = await api.appointments.getAll(statusFilter !== 'all' ? statusFilter : undefined);
        if (response.status === 'success' && response.data) {
          setAppointments(response.data);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load appointments');
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchAppointments();
    }
  }, [isAuthenticated, statusFilter]);

  const handleStatusUpdate = async (appointmentId: number, newStatus: string, time?: string) => {
    setUpdating(true);
    try {
      await api.appointments.update(appointmentId, {
        status: newStatus,
        adminNotes: adminNotes || undefined,
        ...(time ? { confirmedTime: time } : {}),
      });

      const response = await api.appointments.getAll(statusFilter !== 'all' ? statusFilter : undefined);
      if (response.status === 'success' && response.data) {
        setAppointments(response.data);
      }
      setSelectedAppointment(null);
      setAdminNotes('');
      setConfirmedTime('');
    } catch (err: any) {
      setError(err.message || 'Failed to update appointment');
    } finally {
      setUpdating(false);
    }
  };

  const openConfirmModal = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setAdminNotes('');
    setConfirmedTime('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':   return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default:          return 'bg-gray-100 text-gray-800';
    }
  };

  const getContactMethodIcon = (method: string) => {
    if (method === 'branch_visit') {
      return (
        <svg className="w-5 h-5 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    );
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

  const applyDateFilter = (list: Appointment[]) => {
    if (dateFilter === 'all') return list;
    const now = new Date();
    return list.filter((a) => {
      const date = new Date(a.preferredDate);
      if (dateFilter === 'day') {
        return date.toDateString() === now.toDateString();
      }
      if (dateFilter === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        return date >= startOfWeek && date <= endOfWeek;
      }
      if (dateFilter === 'month') {
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      }
      if (dateFilter === 'year') {
        return date.getFullYear() === now.getFullYear();
      }
      return true;
    });
  };

  const filteredAppointments = applyDateFilter(appointments);

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return 'Any time';
    switch (timeStr) {
      case 'morning':   return 'Morning (8:00 AM – 12:00 PM)';
      case 'afternoon': return 'Afternoon (12:00 PM – 5:00 PM)';
      case 'evening':   return 'Evening (5:00 PM – 8:00 PM)';
      default:          return timeStr;
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Appointments</h1>
          <p className="text-gray-600 mt-2">
            Manage custom order appointment requests from customers
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Status:
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-colors"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="date-filter" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Period:
            </label>
            <select
              id="date-filter"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-colors"
            >
              <option value="all">All Time</option>
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {(['pending', 'confirmed', 'completed'] as const).map((s) => (
            <div key={s} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900">
                {filteredAppointments.filter(a => a.status === s).length}
              </div>
              <div className={`text-sm ${s === 'pending' ? 'text-yellow-600' : s === 'confirmed' ? 'text-blue-600' : 'text-green-600'}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </div>
            </div>
          ))}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-2xl font-bold text-gray-900">{filteredAppointments.length}</div>
            <div className="text-sm text-gray-600">Total</div>
          </div>
        </div>

        {/* Appointments List */}
        {filteredAppointments.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No appointments found</h3>
            <p className="text-gray-500">
              {statusFilter !== 'all' ? `No ${statusFilter} appointments` : 'Appointments will appear here when customers book them'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAppointments.map((appointment) => (
              <div
                key={appointment.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  {/* Left side */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      {getContactMethodIcon(appointment.contactMethod)}
                      <div>
                        <h3 className="font-semibold text-gray-900">{appointment.customerName}</h3>
                        <p className="text-sm text-gray-500">{appointment.appointmentNumber}</p>
                      </div>
                      <span className={`ml-auto lg:ml-0 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(appointment.status)}`}>
                        {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Contact:</span>
                        <p className="text-gray-900">{appointment.customerPhone}</p>
                        {appointment.customerEmail && (
                          <p className="text-gray-600">{appointment.customerEmail}</p>
                        )}
                      </div>
                      <div>
                        <span className="text-gray-500">Contact Method:</span>
                        <p className="text-gray-900">
                          {appointment.contactMethod === 'branch_visit' ? 'Branch Visit' : 'Phone Call'}
                        </p>
                        {appointment.branchName && (
                          <p className="text-[#011c72]">{appointment.branchName}</p>
                        )}
                      </div>
                      <div>
                        <span className="text-gray-500">Preferred Date & Time:</span>
                        <p className="text-gray-900 font-medium">{formatDate(appointment.preferredDate)}</p>
                        <p className="text-gray-600">{formatTime(appointment.preferredTime)}</p>
                        {appointment.confirmedTime && (
                          <p className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-semibold">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Confirmed at {appointment.confirmedTime}
                          </p>
                        )}
                      </div>
                      {appointment.vehicleInfo && (
                        <div>
                          <span className="text-gray-500">Vehicle:</span>
                          <p className="text-gray-900">
                            {appointment.vehicleInfo.year} {appointment.vehicleInfo.make} {appointment.vehicleInfo.model}
                          </p>
                          {appointment.vehicleInfo.plateNumber && (
                            <p className="text-gray-600">{appointment.vehicleInfo.plateNumber}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {appointment.description && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                        <span className="text-xs font-medium text-gray-500 uppercase">Customer Request:</span>
                        <p className="text-sm text-gray-700 mt-1">{appointment.description}</p>
                      </div>
                    )}

                    {appointment.adminNotes && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                        <span className="text-xs font-medium text-blue-600 uppercase">Admin Notes:</span>
                        <p className="text-sm text-blue-700 mt-1">{appointment.adminNotes}</p>
                      </div>
                    )}

                    <div className="mt-3 text-xs text-gray-400">
                      Created: {new Date(appointment.createdAt).toLocaleString()}
                    </div>
                  </div>

                  {/* Right side - Actions */}
                  <div className="flex flex-col gap-2 lg:w-48">
                    {appointment.status === 'pending' && (
                      <>
                        <button
                          onClick={() => openConfirmModal(appointment)}
                          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(appointment.id, 'cancelled')}
                          disabled={updating}
                          className="px-4 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {appointment.status === 'confirmed' && (
                      <button
                        onClick={() => handleStatusUpdate(appointment.id, 'completed')}
                        disabled={updating}
                        className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        Mark Completed
                      </button>
                    )}
                    {(appointment.status === 'completed' || appointment.status === 'cancelled') && (
                      <span className="text-center text-sm text-gray-500">No actions available</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Confirm Modal */}
        {selectedAppointment && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Confirm Appointment
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                <strong>{selectedAppointment.customerName}</strong> —{' '}
                {formatDate(selectedAppointment.preferredDate)}
              </p>

              {/* Preferred window reminder */}
              <div className="mb-4 px-3 py-2 rounded-lg bg-[#eef1fb] border border-[#c7d2f5] text-sm text-[#011c72]">
                Customer&apos;s preferred window:{' '}
                <span className="font-semibold">{formatTime(selectedAppointment.preferredTime)}</span>
              </div>

              {/* Time picker — required */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Set Appointment Time <span className="text-red-500">*</span>
                </label>
                <select
                  value={confirmedTime}
                  onChange={(e) => setConfirmedTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                >
                  <option value="">-- Select a time --</option>
                  {getTimeSlots(selectedAppointment.preferredTime).map((slot) => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
              </div>

              {/* Optional notes */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Any notes for this appointment..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSelectedAppointment(null);
                    setAdminNotes('');
                    setConfirmedTime('');
                  }}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleStatusUpdate(selectedAppointment.id, 'confirmed', confirmedTime)}
                  disabled={updating || !confirmedTime}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {updating ? 'Confirming...' : 'Confirm Appointment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
