'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, Branch, User as UserType, Role } from '@/lib/api';

type TabType = 'general' | 'users' | 'branches' | 'services' | 'notifications';

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [saving, setSaving] = useState(false);
  
    // Users state
    const [users, setUsers] = useState<UserType[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState<UserType | null>(null);
    const [userFormData, setUserFormData] = useState({
      username: '',
      password: '',
      email: '',
      fullName: '',
      role: 'staff',
      branchId: 0
    });
    const [userError, setUserError] = useState('');
    const [roles, setRoles] = useState<Role[]>([]);
  
  // Branches state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchFormData, setBranchFormData] = useState({
    name: '',
    code: '',
    address: '',
    isWarehouse: false
  });
  const [branchError, setBranchError] = useState('');

  // Load branches when branches tab is active
  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
      loadRoles();
      loadBranches(false);
    }
    if (activeTab === 'branches') {
      loadBranches(true);
    }
  }, [activeTab]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await api.settings.getUsers(true);
      if (response.status === 'success' && response.data) {
        setUsers(response.data);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadRoles = async () => {
    try {
      const response = await api.settings.getRoles();
      if (response.status === 'success' && response.data) {
        setRoles(response.data);
      }
    } catch (err) {
      console.error('Failed to load roles:', err);
    }
  };

  const loadBranches = async (includeInactive = false) => {
    setLoadingBranches(true);
    try {
      const response = await api.settings.getBranches(includeInactive);
      if (response.status === 'success' && response.data) {
        setBranches(response.data);
      }
    } catch (err) {
      console.error('Failed to load branches:', err);
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleAddUser = () => {
    setUserFormData({ 
      username: '', 
      password: '', 
      email: '', 
      fullName: '', 
      role: 'staff',
      branchId: branches.length > 0 ? branches[0].id : 0
    });
    setEditingUser(null);
    setUserError('');
    setShowUserModal(true);
  };

  const handleEditUser = (user: UserType) => {
    setUserFormData({
      username: user.username,
      password: '',
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      branchId: user.branchId || 0
    });
    setEditingUser(user);
    setUserError('');
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    if (!userFormData.username || !userFormData.email || !userFormData.fullName || !userFormData.role) {
      setUserError('Please fill in all required fields');
      return;
    }

    if (!userFormData.branchId) {
      setUserError('Please select a branch');
      return;
    }

    if (!editingUser && !userFormData.password) {
      setUserError('Password is required for new users');
      return;
    }

      setSaving(true);
      setUserError('');

      try {
        if (editingUser) {
          // Update existing user
          const updateData: any = {
            email: userFormData.email,
            fullName: userFormData.fullName,
            role: userFormData.role,
            branchId: userFormData.branchId || null
          };
          if (userFormData.password) {
            updateData.password = userFormData.password;
          }
          await api.settings.updateUser(editingUser.id, updateData);
        } else {
          // Create new user
          await api.settings.createUser({
            username: userFormData.username,
            password: userFormData.password,
            email: userFormData.email,
            fullName: userFormData.fullName,
            role: userFormData.role,
              branchId: userFormData.branchId || undefined
          });
        }
      
        setShowUserModal(false);
        loadUsers();
      } catch (err: any) {
        setUserError(err.message || 'Failed to save user');
      } finally {
        setSaving(false);
      }
    };

    const handleToggleUserStatus = async (user: UserType) => {
      try {
        if (user.isActive) {
          await api.settings.archiveUser(user.id);
        } else {
          await api.settings.restoreUser(user.id);
        }
        loadUsers();
      } catch (err) {
        console.error('Failed to update user status:', err);
      }
    };

  const handleAddBranch = () => {
    setBranchFormData({ name: '', code: '', address: '', isWarehouse: false });
    setEditingBranch(null);
    setBranchError('');
    setShowBranchModal(true);
  };

  const handleEditBranch = (branch: Branch) => {
    setBranchFormData({
      name: branch.name,
      code: branch.code,
      address: branch.address,
      isWarehouse: branch.isWarehouse
    });
    setEditingBranch(branch);
    setBranchError('');
    setShowBranchModal(true);
  };

  const handleSaveBranch = async () => {
    if (!branchFormData.name || !branchFormData.code || !branchFormData.address) {
      setBranchError('Please fill in all required fields');
      return;
    }

    setSaving(true);
    setBranchError('');

    try {
      if (editingBranch) {
        // Update existing branch
        await api.settings.updateBranch(editingBranch.id, branchFormData);
      } else {
        // Create new branch
        await api.settings.createBranch(branchFormData);
      }
      
      setShowBranchModal(false);
      loadBranches();
    } catch (err: any) {
      setBranchError(err.message || 'Failed to save branch');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBranchStatus = async (branch: Branch) => {
    try {
      await api.settings.updateBranch(branch.id, {
        isActive: !branch.isActive
      });
      loadBranches();
    } catch (err) {
      console.error('Failed to update branch status:', err);
    }
  };

  // General Settings State
  const [companyName, setCompanyName] = useState('Seatmakers Automotive Upholstery');
  const [companyEmail, setCompanyEmail] = useState('info@seatmakers.com');
  const [companyPhone, setCompanyPhone] = useState('(02) 8123-4567');
  const [taxRate, setTaxRate] = useState(12);
  const [currency, setCurrency] = useState('PHP');

  const handleSave = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
  };

  const tabs = [
    { id: 'general' as TabType, name: 'General', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
    { id: 'users' as TabType, name: 'Users', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    )},
    { id: 'branches' as TabType, name: 'Branches', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    )},
    { id: 'services' as TabType, name: 'Services', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    )},
    { id: 'notifications' as TabType, name: 'Notifications', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    )},
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Company Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                    <option value="PHP">Philippine Peso (₱)</option>
                    <option value="USD">US Dollar ($)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Tax & Pricing</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'users':
        return (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">User Management</h3>
                {user?.role === 'administrator' && (
                  <button 
                    onClick={handleAddUser}
                    className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
                  >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add User
              </button>
                )}
            </div>

              {loadingUsers ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto text-zinc-400 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <p className="text-zinc-500 dark:text-zinc-400">No users found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Branch</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-amber-600 flex items-center justify-center mr-3">
                              <span className="text-white font-medium">{u.fullName.charAt(0)}</span>
                          </div>
                          <div>
                              <p className="text-sm font-medium text-zinc-900 dark:text-white">{u.fullName}</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          u.role === 'administrator' 
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : u.role === 'supervisor'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : u.role === 'sales_manager'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : u.role === 'seat_maker'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                              : u.role === 'sewer'
                              ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
                            : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}>
                            {(u.roleName || u.role.replace('_', ' ')).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                          {u.branchName || u.branch || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            u.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}>
                            {u.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                          {user?.role === 'administrator' && (
                            <>
                              <button 
                                onClick={() => handleEditUser(u)}
                                className="text-amber-600 dark:text-amber-400 hover:text-amber-700 text-sm font-medium mr-3"
                              >
                          Edit
                        </button>
                              <button 
                                onClick={() => handleToggleUserStatus(u)}
                                className={`text-sm font-medium ${
                                  u.isActive
                                    ? 'text-red-600 dark:text-red-400 hover:text-red-700'
                                    : 'text-green-600 dark:text-green-400 hover:text-green-700'
                                }`}
                              >
                                {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                            </>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              )}
          </div>
        );

      case 'branches':
        return (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Branch Management</h3>
              {user?.role === 'administrator' && (
                <button 
                  onClick={handleAddBranch}
                  className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Branch
                </button>
              )}
            </div>

            {loadingBranches ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
              </div>
            ) : branches.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 mx-auto text-zinc-400 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <p className="text-zinc-500 dark:text-zinc-400">No branches found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {branches.map((branch) => (
                  <div key={branch.id} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                        <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mr-4">
                          <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-lg font-semibold text-zinc-900 dark:text-white">{branch.name}</h4>
                            {branch.isWarehouse && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                WAREHOUSE
                              </span>
                            )}
                          </div>
                          <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                            branch.isActive
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}>
                            {branch.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </div>
                      </div>
                      {user?.role === 'administrator' && (
                        <button 
                          onClick={() => handleEditBranch(branch)}
                          className="text-amber-600 dark:text-amber-400 hover:text-amber-700 text-sm font-medium"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center text-zinc-600 dark:text-zinc-400">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        Code: {branch.code}
                      </div>
                      <div className="flex items-center text-zinc-600 dark:text-zinc-400">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {branch.address}
                      </div>
                    </div>
                    {user?.role === 'administrator' && (
                      <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                        <button
                          onClick={() => handleToggleBranchStatus(branch)}
                          className={`text-sm font-medium ${
                            branch.isActive
                              ? 'text-red-600 dark:text-red-400 hover:text-red-700'
                              : 'text-green-600 dark:text-green-400 hover:text-green-700'
                          }`}
                        >
                          {branch.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'services':
        return (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Service Types</h3>
              <button className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors">
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Service
              </button>
            </div>
            <div className="space-y-4">
              {[
                { name: 'Full Upholstery', description: 'Complete interior upholstery service', basePrice: 15000, duration: '3-5 days' },
                { name: 'Seat Cover Installation', description: 'Install custom or pre-made seat covers', basePrice: 5000, duration: '1-2 days' },
                { name: 'Headliner Replacement', description: 'Replace sagging or damaged headliner', basePrice: 3500, duration: '1 day' },
                { name: 'Door Panel Repair', description: 'Repair or replace door panel upholstery', basePrice: 2500, duration: '1 day' },
                { name: 'Dashboard Cover', description: 'Install dashboard cover or repair dashboard', basePrice: 3000, duration: '1 day' },
                { name: 'Carpet Installation', description: 'Install custom automotive carpet', basePrice: 4000, duration: '1-2 days' },
                { name: 'Custom Work', description: 'Custom upholstery and modifications', basePrice: 8000, duration: 'Varies' },
              ].map((service, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mr-4">
                      <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-zinc-900 dark:text-white">{service.name}</h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{service.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">₱{service.basePrice.toLocaleString()}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{service.duration}</p>
                    </div>
                    <button className="text-amber-600 dark:text-amber-400 hover:text-amber-700 text-sm font-medium">
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Notification Settings</h3>
            <div className="space-y-4">
              {[
                { id: 'low_stock', label: 'Low Stock Alerts', description: 'Get notified when inventory items fall below reorder level', enabled: true },
                { id: 'new_order', label: 'New Order Notifications', description: 'Receive alerts for new job orders', enabled: true },
                { id: 'delivery', label: 'Delivery Updates', description: 'Get notified about delivery status changes', enabled: true },
                { id: 'payment', label: 'Payment Reminders', description: 'Receive reminders for pending payments', enabled: false },
                { id: 'report', label: 'Daily Reports', description: 'Receive daily summary reports via email', enabled: false },
              ].map((setting) => (
                <div key={setting.id} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                  <div>
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-white">{setting.label}</h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{setting.description}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked={setting.enabled} className="sr-only peer" />
                    <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 dark:peer-focus:ring-amber-800 rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-amber-600"></div>
                  </label>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Settings</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Manage system configurations and preferences
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <div className="lg:w-64 flex-shrink-0">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <nav className="p-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span className="mr-3">{tab.icon}</span>
                    {tab.name}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              {renderContent()}

              {/* Save Button */}
              {(activeTab === 'general' || activeTab === 'notifications') && (
                <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Branch Modal */}
      {showBranchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                {editingBranch ? 'Edit Branch' : 'Add New Branch'}
              </h3>
              <button
                onClick={() => setShowBranchModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {branchError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                {branchError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Branch Name *
                </label>
                <input
                  type="text"
                  value={branchFormData.name}
                  onChange={(e) => setBranchFormData({ ...branchFormData, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="e.g., Branch D"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Branch Code *
                </label>
                <input
                  type="text"
                  value={branchFormData.code}
                  onChange={(e) => setBranchFormData({ ...branchFormData, code: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="e.g., BD"
                  maxLength={10}
                  disabled={!!editingBranch}
                />
                {editingBranch && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Branch code cannot be changed after creation
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Address *
                </label>
                <textarea
                  value={branchFormData.address}
                  onChange={(e) => setBranchFormData({ ...branchFormData, address: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Full address"
                  rows={3}
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isWarehouse"
                  checked={branchFormData.isWarehouse}
                  onChange={(e) => setBranchFormData({ ...branchFormData, isWarehouse: e.target.checked })}
                  className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="isWarehouse" className="ml-2 text-sm text-zinc-700 dark:text-zinc-300">
                  This is a warehouse location
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowBranchModal(false)}
                className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBranch}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingBranch ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* User Modal */}
        {showUserModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                  {editingUser ? 'Edit User' : 'Add New User'}
                </h3>
                <button
                  onClick={() => setShowUserModal(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {userError && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                  {userError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={userFormData.username}
                    onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="e.g., jsmith"
                    disabled={!!editingUser}
                  />
                  {editingUser && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      Username cannot be changed after creation
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={userFormData.fullName}
                    onChange={(e) => setUserFormData({ ...userFormData, fullName: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="e.g., John Smith"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="e.g., jsmith@seatmakers.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Password {editingUser ? '(leave blank to keep current)' : '*'}
                  </label>
                  <input
                    type="password"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder={editingUser ? 'Leave blank to keep current password' : 'Enter password'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Role *
                  </label>
                  <select
                    value={userFormData.role}
                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Branch *
                  </label>
                  <select
                    value={userFormData.branchId}
                    onChange={(e) => setUserFormData({ ...userFormData, branchId: Number(e.target.value) })}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                    <option value={0}>Select a branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowUserModal(false)}
                  className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveUser}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingUser ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}


