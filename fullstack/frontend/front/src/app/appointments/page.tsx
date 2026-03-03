'use client';
import { useState, useEffect } from 'react';
import { api, Appointment } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function AppointmentsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  // Check authorization
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch appointments
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

  const handleStatusUpdate = async (appointmentId: number, newStatus: string) => {
    setUpdating(true);
    try {
      await api.appointments.update(appointmentId, { 
        status: newStatus,
        adminNotes: adminNotes || undefined
      });
      
      // Refresh the list
      const response = await api.appointments.getAll(statusFilter !== 'all' ? statusFilter : undefined);
      if (response.status === 'success' && response.data) {
        setAppointments(response.data);
      }
      setSelectedAppointment(null);
      setAdminNotes('');
    } catch (err: any) {
      setError(err.message || 'Failed to update appointment');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'confirmed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300';
    }
  };

  const getContactMethodIcon = (method: string) => {
    if (method === 'branch_visit') {
      return (
        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return 'Any time';
    switch (timeStr) {
      case 'morning': return 'Morning (8AM - 12PM)';
      case 'afternoon': return 'Afternoon (12PM - 5PM)';
      case 'evening': return 'Evening (5PM - 8PM)';
      default: return timeStr;
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Appointments</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Manage custom order appointment requests from customers
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-amber-600 text-white'
                  : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="text-2xl font-bold text-zinc-900 dark:text-white">
              {appointments.filter(a => a.status === 'pending').length}
            </div>
            <div className="text-sm text-yellow-600 dark:text-yellow-400">Pending</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="text-2xl font-bold text-zinc-900 dark:text-white">
              {appointments.filter(a => a.status === 'confirmed').length}
            </div>
            <div className="text-sm text-blue-600 dark:text-blue-400">Confirmed</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="text-2xl font-bold text-zinc-900 dark:text-white">
              {appointments.filter(a => a.status === 'completed').length}
            </div>
            <div className="text-sm text-green-600 dark:text-green-400">Completed</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="text-2xl font-bold text-zinc-900 dark:text-white">
              {appointments.length}
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">Total</div>
          </div>
        </div>

        {/* Appointments List */}
        {appointments.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-zinc-400 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">No appointments found</h3>
            <p className="text-zinc-500 dark:text-zinc-400">
              {statusFilter !== 'all' ? `No ${statusFilter} appointments` : 'Appointments will appear here when customers book them'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {appointments.map((appointment) => (
              <div
                key={appointment.id}
                className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  {/* Left side - Main Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      {getContactMethodIcon(appointment.contactMethod)}
                      <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-white">
                          {appointment.customerName}
                        </h3>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                          {appointment.appointmentNumber}
                        </p>
                      </div>
                      <span className={`ml-auto lg:ml-0 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(appointment.status)}`}>
                        {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-zinc-500 dark:text-zinc-400">Contact:</span>
                        <p className="text-zinc-900 dark:text-white">{appointment.customerPhone}</p>
                        {appointment.customerEmail && (
                          <p className="text-zinc-600 dark:text-zinc-300">{appointment.customerEmail}</p>
                        )}
                      </div>
                      <div>
                        <span className="text-zinc-500 dark:text-zinc-400">Contact Method:</span>
                        <p className="text-zinc-900 dark:text-white">
                          {appointment.contactMethod === 'branch_visit' ? 'Branch Visit' : 'Phone Call'}
                        </p>
                        {appointment.branchName && (
                          <p className="text-amber-600 dark:text-amber-400">{appointment.branchName}</p>
                        )}
                      </div>
                      <div>
                        <span className="text-zinc-500 dark:text-zinc-400">Preferred Date:</span>
                        <p className="text-zinc-900 dark:text-white font-medium">
                          {formatDate(appointment.preferredDate)}
                        </p>
                        <p className="text-zinc-600 dark:text-zinc-300">
                          {formatTime(appointment.preferredTime)}
                        </p>
                      </div>
                      {appointment.vehicleInfo && (
                        <div>
                          <span className="text-zinc-500 dark:text-zinc-400">Vehicle:</span>
                          <p className="text-zinc-900 dark:text-white">
                            {appointment.vehicleInfo.year} {appointment.vehicleInfo.make} {appointment.vehicleInfo.model}
                          </p>
                          {appointment.vehicleInfo.plateNumber && (
                            <p className="text-zinc-600 dark:text-zinc-300">{appointment.vehicleInfo.plateNumber}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {appointment.description && (
                      <div className="mt-4 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Customer Request:</span>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1">{appointment.description}</p>
                      </div>
                    )}

                    {appointment.adminNotes && (
                      <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase">Admin Notes:</span>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">{appointment.adminNotes}</p>
                      </div>
                    )}

                    <div className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
                      Created: {new Date(appointment.createdAt).toLocaleString()}
                    </div>
                  </div>

                  {/* Right side - Actions */}
                  <div className="flex flex-col gap-2 lg:w-48">
                    {appointment.status === 'pending' && (
                      <>
                        <button
                          onClick={() => setSelectedAppointment(appointment)}
                          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(appointment.id, 'cancelled')}
                          disabled={updating}
                          className="px-4 py-2 rounded-lg bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
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
                      <span className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                        No actions available
                      </span>
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
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
                Confirm Appointment
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Confirm appointment for <strong>{selectedAppointment.customerName}</strong> on{' '}
                <strong>{formatDate(selectedAppointment.preferredDate)}</strong>?
              </p>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Add Notes (Optional)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Any notes for this appointment..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSelectedAppointment(null);
                    setAdminNotes('');
                  }}
                  className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleStatusUpdate(selectedAppointment.id, 'confirmed')}
                  disabled={updating}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
