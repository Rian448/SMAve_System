'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface MaterialItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

interface LaborItem {
  description: string;
  hours: number;
  rate: number;
}

export default function NewJobOrderPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  
  // Customer Information
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  
  // Vehicle Information
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  
  // Service Information
  const [serviceType, setServiceType] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState('');
  const [priority, setPriority] = useState('normal');
  
  // Materials and Labor
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [labor, setLabor] = useState<LaborItem[]>([]);
  
  // Payment
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [downPayment, setDownPayment] = useState(0);
  const [notes, setNotes] = useState('');

  const serviceTypes = [
    'Full Upholstery',
    'Seat Cover Installation',
    'Headliner Replacement',
    'Door Panel Repair',
    'Dashboard Cover',
    'Carpet Installation',
    'Custom Work',
    'Repair/Restoration'
  ];

  const addMaterial = () => {
    setMaterials([...materials, { id: Date.now().toString(), name: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeMaterial = (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
  };

  const updateMaterial = (id: string, field: keyof MaterialItem, value: string | number) => {
    setMaterials(materials.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const addLabor = () => {
    setLabor([...labor, { description: '', hours: 1, rate: 0 }]);
  };

  const removeLabor = (index: number) => {
    setLabor(labor.filter((_, i) => i !== index));
  };

  const updateLabor = (index: number, field: keyof LaborItem, value: string | number) => {
    setLabor(labor.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const calculateSubtotals = () => {
    const materialsTotal = materials.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0);
    const laborTotal = labor.reduce((sum, l) => sum + (l.hours * l.rate), 0);
    return { materialsTotal, laborTotal };
  };

  const { materialsTotal, laborTotal } = calculateSubtotals();
  const totalAmount = materialsTotal + laborTotal;
  const balanceDue = totalAmount - downPayment;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const jobOrderData = {
        customerName,
        customerPhone,
        customerEmail,
        customerAddress,
        vehicleInfo: `${vehicleYear} ${vehicleMake} ${vehicleModel}`,
        vehiclePlate,
        serviceType,
        serviceDescription,
        estimatedCompletionDate,
        priority,
        materials,
        labor,
        materialsTotal,
        laborTotal,
        totalAmount,
        downPayment,
        balanceDue,
        paymentMethod,
        notes,
        branch: user?.branch || 'Main Branch'
      };

      await api.sales.createJobOrder(jobOrderData);
      router.push('/sales');
    } catch (err) {
      setError('Failed to create job order. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Customer Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Juan dela Cruz"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="09XX XXX XXXX"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="customer@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="123 Main St, City"
                />
              </div>
            </div>
          </div>
        );
      
      case 2:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Vehicle Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Vehicle Make *
                </label>
                <input
                  type="text"
                  value={vehicleMake}
                  onChange={(e) => setVehicleMake(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Toyota"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Vehicle Model *
                </label>
                <input
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Fortuner"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Year *
                </label>
                <input
                  type="text"
                  value={vehicleYear}
                  onChange={(e) => setVehicleYear(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="2023"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Plate Number
                </label>
                <input
                  type="text"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="ABC 1234"
                />
              </div>
            </div>
          </div>
        );
      
      case 3:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Service Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Service Type *
                </label>
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">Select service type</option>
                  {serviceTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Estimated Completion Date
                </label>
                <input
                  type="date"
                  value={estimatedCompletionDate}
                  onChange={(e) => setEstimatedCompletionDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Service Description
              </label>
              <textarea
                value={serviceDescription}
                onChange={(e) => setServiceDescription(e.target.value)}
                rows={4}
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="Describe the work to be done..."
              />
            </div>
          </div>
        );
      
      case 4:
        return (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Materials</h3>
                <button
                  type="button"
                  onClick={addMaterial}
                  className="inline-flex items-center px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Material
                </button>
              </div>
              {materials.length === 0 ? (
                <div className="text-center py-8 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border-2 border-dashed border-zinc-200 dark:border-zinc-700">
                  <p className="text-zinc-500 dark:text-zinc-400">No materials added yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {materials.map((material) => (
                    <div key={material.id} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                      <input
                        type="text"
                        value={material.name}
                        onChange={(e) => updateMaterial(material.id, 'name', e.target.value)}
                        placeholder="Material name"
                        className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                      <input
                        type="number"
                        value={material.quantity}
                        onChange={(e) => updateMaterial(material.id, 'quantity', parseInt(e.target.value) || 0)}
                        placeholder="Qty"
                        className="w-20 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                      <input
                        type="number"
                        value={material.unitPrice}
                        onChange={(e) => updateMaterial(material.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                        placeholder="Price"
                        className="w-28 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                      <span className="w-24 text-right text-sm font-medium text-zinc-900 dark:text-white">
                        ₱{(material.quantity * material.unitPrice).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeMaterial(material.id)}
                        className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Labor</h3>
                <button
                  type="button"
                  onClick={addLabor}
                  className="inline-flex items-center px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Labor
                </button>
              </div>
              {labor.length === 0 ? (
                <div className="text-center py-8 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border-2 border-dashed border-zinc-200 dark:border-zinc-700">
                  <p className="text-zinc-500 dark:text-zinc-400">No labor items added yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {labor.map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLabor(index, 'description', e.target.value)}
                        placeholder="Labor description"
                        className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                      <input
                        type="number"
                        value={item.hours}
                        onChange={(e) => updateLabor(index, 'hours', parseFloat(e.target.value) || 0)}
                        placeholder="Hours"
                        className="w-20 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                      <input
                        type="number"
                        value={item.rate}
                        onChange={(e) => updateLabor(index, 'rate', parseFloat(e.target.value) || 0)}
                        placeholder="Rate"
                        className="w-28 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                      <span className="w-24 text-right text-sm font-medium text-zinc-900 dark:text-white">
                        ₱{(item.hours * item.rate).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLabor(index)}
                        className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      
      case 5:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Payment & Summary</h3>
            
            {/* Summary */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-6">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Materials Subtotal</span>
                  <span className="font-medium text-zinc-900 dark:text-white">₱{materialsTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Labor Subtotal</span>
                  <span className="font-medium text-zinc-900 dark:text-white">₱{laborTotal.toLocaleString()}</span>
                </div>
                <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3">
                  <div className="flex justify-between text-lg font-semibold">
                    <span className="text-zinc-900 dark:text-white">Total Amount</span>
                    <span className="text-amber-600 dark:text-amber-400">₱{totalAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="installment">Installment</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Down Payment
                </label>
                <input
                  type="number"
                  value={downPayment}
                  onChange={(e) => setDownPayment(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
              <div className="flex justify-between text-lg font-semibold">
                <span className="text-amber-800 dark:text-amber-300">Balance Due</span>
                <span className="text-amber-800 dark:text-amber-300">₱{balanceDue.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Additional Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="Any special instructions or notes..."
              />
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">New Job Order</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Create a new job order for a customer
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[
              { num: 1, label: 'Customer' },
              { num: 2, label: 'Vehicle' },
              { num: 3, label: 'Service' },
              { num: 4, label: 'Costing' },
              { num: 5, label: 'Payment' }
            ].map((s, index) => (
              <div key={s.num} className="flex items-center">
                <button
                  onClick={() => setStep(s.num)}
                  className={`flex items-center justify-center w-10 h-10 rounded-full font-medium transition-colors ${
                    step >= s.num
                      ? 'bg-amber-600 text-white'
                      : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {s.num}
                </button>
                <span className={`ml-2 text-sm font-medium hidden sm:block ${
                  step >= s.num ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'
                }`}>
                  {s.label}
                </span>
                {index < 4 && (
                  <div className={`w-8 sm:w-16 h-1 mx-2 rounded ${
                    step > s.num ? 'bg-amber-600' : 'bg-zinc-200 dark:bg-zinc-700'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            {renderStep()}
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                step === 1
                  ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              Previous
            </button>
            {step < 5 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    Creating...
                  </>
                ) : (
                  'Create Job Order'
                )}
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}

