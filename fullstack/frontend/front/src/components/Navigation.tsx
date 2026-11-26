'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { formatDateTime } from '@/lib/dateUtils';
import { useEffect, useRef, useState } from 'react';
import { useConfirm } from './ConfirmDialog';
import { useBranding } from '@/lib/branding';
import { WORKER_MANAGEMENT_PERMS } from '@/lib/permissions';

type NavItem = { name: string; path: string; icon: () => React.JSX.Element; perms?: string[] };
type NavGroup = { name: string; icon: () => React.JSX.Element; items: NavItem[] };
type NavEntry = NavItem | NavGroup;

interface NavigationProps {
  collapsed: boolean;
  onToggle: () => void;
  // Below the md breakpoint the sidebar is a drawer instead of a fixed column
  mobileOpen: boolean;
  onMobileOpen: () => void;
  onMobileClose: () => void;
}
const DashboardIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);
const OwnerIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const ExpensesIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
  </svg>
);
const SalesIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);
const InventoryIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);
const CostingIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);
const ForecastIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);
const ReportsIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
const SettingsIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const WorkerIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const CustomersIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const PurchaseOrderIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);
const ReceivingIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V7a2 2 0 00-2-2H6a2 2 0 00-2 2v6m16 0v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4m16 0h-3.586a1 1 0 00-.707.293l-1.414 1.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-1.414-1.414A1 1 0 007.586 13H4" />
  </svg>
);
const SupplierIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
  </svg>
);
const AuditIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);
const LogoIcon = () => (
  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);
const PaymentsIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);
const AnnouncementsIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
  </svg>
);
const LogoutIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

// Pages are grouped into categories that open a flyout. Each page needs any one of its permissions.
const NAV_ENTRIES: NavEntry[] = [
  { name: 'Overview', icon: DashboardIcon, items: [
    { name: 'Dashboard', path: '/dashboard', icon: DashboardIcon, perms: ['dashboard.view'] },
    { name: 'Owner Dashboard', path: '/owner', icon: OwnerIcon, perms: ['owner.view'] },
    { name: 'Announcements', path: '/announcements', icon: AnnouncementsIcon, perms: ['announcements.view'] },
  ] },
  { name: 'Sales', icon: SalesIcon, items: [
    { name: 'Sales', path: '/sales', icon: SalesIcon, perms: ['sales.view'] },
    { name: 'Customers', path: '/customers', icon: CustomersIcon, perms: ['customers.view'] },
  ] },
  // Its own entry: payments are managed here, and each one still opens its job order
  { name: 'Payments', path: '/payments', icon: PaymentsIcon, perms: ['payments.view'] },
  { name: 'Operations', icon: InventoryIcon, items: [
    { name: 'Inventory', path: '/inventory', icon: InventoryIcon, perms: ['inventory.view', 'premade.view', 'premade.receive'] },
    // Product orders are opened from Sales (View Details); /product-orders still works
    // Item History is off the menu (Inventory's Item Trail tab covers usage); /item-history still opens it
    { name: 'Worker Management', path: '/worker-dashboard', icon: WorkerIcon, perms: WORKER_MANAGEMENT_PERMS },
  ] },
  { name: 'Purchasing', icon: PurchaseOrderIcon, items: [
    { name: 'Purchase Orders', path: '/purchase-orders', icon: PurchaseOrderIcon, perms: ['purchase_orders.view'] },
    { name: 'Receiving', path: '/purchase-orders/receiving', icon: ReceivingIcon, perms: ['purchase_orders.receive'] },
    { name: 'Suppliers', path: '/suppliers', icon: SupplierIcon, perms: ['suppliers.view'] },
  ] },
  // Expenses is off the menu; /expenses still opens it
  { name: 'Costing', path: '/costing', icon: CostingIcon, perms: ['costing.view'] },
  { name: 'Analytics', icon: ReportsIcon, items: [
    { name: 'Forecasting', path: '/forecasting', icon: ForecastIcon, perms: ['forecasting.view'] },
    { name: 'Reports', path: '/reports', icon: ReportsIcon, perms: ['reports.sales', 'reports.inventory', 'reports.settlement'] },
  ] },
  // Its own entry so the full log isn't buried under Settings
  { name: 'Audit Trail', path: '/audit-trail', icon: AuditIcon, perms: ['reports.audit_trail'] },
  { name: 'Settings', path: '/settings', icon: SettingsIcon, perms: ['settings.edit', 'users.manage', 'branches.manage'] },
];

/** Key a custom sidebar icon is saved under: the page's path, or "group:Name" for a category */
const iconKey = (entry: NavEntry) => ('items' in entry ? `group:${entry.name}` : entry.path);

/** Every sidebar icon that can be changed in Settings > Appearance, with its built-in one */
export const NAV_ICON_SLOTS: { key: string; label: string; group?: string; Icon: () => React.JSX.Element }[] =
  NAV_ENTRIES.flatMap((entry) => 'items' in entry
    ? [{ key: iconKey(entry), label: `${entry.name} (menu group)`, Icon: entry.icon },
       ...entry.items.map((i) => ({ key: iconKey(i), label: i.name, group: entry.name, Icon: i.icon }))]
    : [{ key: iconKey(entry), label: entry.name, Icon: entry.icon }]);

/** The built-in logo mark, for Settings to show next to an uploaded one */
export const DefaultLogo = () => (
  <div className="w-8 h-8 bg-[#011c72] rounded-lg flex items-center justify-center shrink-0"><LogoIcon /></div>
);

/** A custom icon from Settings when there is one, else the built-in icon */
function NavIcon({ entry, custom }: { entry: NavEntry; custom: Record<string, string> }) {
  const src = custom[iconKey(entry)];
  const Icon = entry.icon;
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className="w-5 h-5 shrink-0 object-contain" /> : <Icon />;
}

/** The logo square: the uploaded logo, or the built-in mark */
function LogoMark({ logo }: { logo: string | null }) {
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="Logo" className="w-8 h-8 rounded-lg object-contain shrink-0 bg-white" />
  ) : (
    <div className="w-8 h-8 bg-[#011c72] rounded-lg flex items-center justify-center shrink-0">
      <LogoIcon />
    </div>
  );
}

export default function Navigation({ collapsed: collapsedSetting, onToggle, mobileOpen, onMobileOpen, onMobileClose }: NavigationProps) {
  // The open drawer always shows full labels, whatever the desktop collapse setting is
  const collapsed = collapsedSetting && !mobileOpen;
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout, isLoading, can } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead, archived, loadArchived, archive, restore, remove } = useNotifications();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const branding = useBranding();
  const [notifOpen, setNotifOpen] = useState(false);
  // The account menu under the name and initial, top right
  const [accountOpen, setAccountOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  // Desktop: the category whose flyout is open, and where to draw it
  const [flyout, setFlyout] = useState<{ name: string; top: number; left: number } | null>(null);
  const flyoutCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Phone drawer: the expanded category (undefined = the one holding the current page)
  const [drawerExpanded, setDrawerExpanded] = useState<string | null | undefined>(undefined);

  // Escape closes the phone drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onMobileClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onMobileClose]);

  // Escape or scrolling the sidebar closes the flyout
  useEffect(() => {
    if (!flyout) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFlyout(null); };
    const onScroll = () => setFlyout(null);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [flyout]);

  useEffect(() => () => { if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current); }, []);

  // The front page (which forwards to sign-in) and the sign-in page are open to visitors
  const publicRoutes = ['/', '/login'];
  const mustSignIn = !isLoading && !isAuthenticated && !publicRoutes.includes(pathname);

  // Navigating is a state update on the router, so it can't happen during render
  useEffect(() => {
    if (mustSignIn) router.push('/login');
  }, [mustSignIn, router]);

  if (pathname === '/login' || pathname === '/') return null;
  if (isLoading) return null;

  // Signed-out visitors only ever see the sign-in page (the front page forwards there)
  if (!isAuthenticated) return null;

  const navEntries = NAV_ENTRIES;

  const allowed = (item: NavItem) => (item.perms ? can(...item.perms) : true);
  // Drop pages the user can't open; a category left with a single page shows as that page
  const visibleEntries: NavEntry[] = navEntries.flatMap((entry): NavEntry[] => {
    if (!('items' in entry)) return allowed(entry) ? [entry] : [];
    // Without the day-to-day Dashboard (the owner role), the owner one is just "Dashboard"
    const items = entry.items.filter(allowed).map((i) =>
      i.path === '/owner' && !can('dashboard.view') ? { ...i, name: 'Dashboard' } : i);
    if (items.length === 0) return [];
    if (items.length === 1) return [items[0]];
    return [{ ...entry, items }];
  });

  const isActivePath = (path: string) => pathname === path || (path !== '/' && pathname.startsWith(path));
  const flyoutGroup = flyout ? visibleEntries.find((e): e is NavGroup => 'items' in e && e.name === flyout.name) : undefined;

  const openFlyout = (name: string, el: HTMLElement) => {
    if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current);
    const rect = el.getBoundingClientRect();
    setFlyout({ name, top: rect.top, left: rect.right + 8 });
  };
  // A short delay lets the pointer cross the gap between the sidebar and the flyout
  const scheduleFlyoutClose = () => {
    if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current);
    flyoutCloseTimer.current = setTimeout(() => setFlyout(null), 150);
  };
  const cancelFlyoutClose = () => {
    if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current);
  };

  // Item Trail carries the unread count
  const badgeFor = (path: string) => (path === '/delivery' && unreadCount > 0 ? unreadCount : 0);

  const renderLink = (item: NavItem, inFlyout = false) => {
    const isActive = isActivePath(item.path);
    const badge = badgeFor(item.path);
    const iconOnly = collapsed && !inFlyout;
    return (
      <Link
        key={item.path}
        href={item.path}
        onClick={() => { setFlyout(null); onMobileClose(); }}
        title={iconOnly ? item.name : undefined}
        className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
          iconOnly ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'
        } ${
          isActive
            ? 'bg-[#dde6ff] text-[#011c72]'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        <span className="relative shrink-0">
          <NavIcon entry={item} custom={branding.navIcons} />
          {iconOnly && badge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </span>
        {!iconOnly && <span className="truncate flex-1">{item.name}</span>}
        {!iconOnly && badge > 0 && (
          <span className="ml-auto shrink-0 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </Link>
    );
  };

  // The page's name for the top bar: the menu item that matches best (/purchase-orders/receiving
  // is "Receiving", not "Purchase Orders"; /sales/12 is "Sales")
  const pageName = (() => {
    if (pathname === '/profile') return 'My Account';
    const items = visibleEntries.flatMap(e => ('items' in e ? e.items : [e]));
    const match = items.filter(i => isActivePath(i.path)).sort((a, b) => b.path.length - a.path.length)[0];
    return match?.name || 'Seatmakers Ave';
  })();
  const roleLabel = (user?.role || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const initial = user?.fullName?.charAt(0).toUpperCase() || '?';

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Log out?',
      message: 'You will need to log in again to use your account.',
      confirmLabel: 'Logout',
      variant: 'warning',
    });
    if (!ok) return;
    setAccountOpen(false);
    setIsLoggingOut(true);
    try {
      await logout();
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <>
    {/* Top bar, beside the sidebar: the page's name on the left; notifications and the
        account menu on the right. Phones also get the menu button (the sidebar is a drawer). */}
    <header className={`fixed top-0 right-0 left-0 h-14 md:h-16 z-30 bg-white border-b border-gray-200 flex items-center gap-2 px-3 md:px-6 transition-all duration-300 ${
      collapsed ? 'md:left-16' : 'md:left-64'}`}>
      <button onClick={onMobileOpen} aria-label="Open menu" aria-expanded={mobileOpen}
        className="md:hidden p-2 -ml-1 rounded-lg text-gray-600 hover:text-[#011c72] hover:bg-gray-100 transition-colors">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <Link href="/" className="md:hidden flex items-center gap-2 min-w-0">
        <LogoMark logo={branding.logo} />
      </Link>
      <span className="min-w-0 truncate px-3 md:px-4 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-900 shadow-sm">
        {pageName}
      </span>

      <div className="ml-auto flex items-center gap-2 shrink-0">
        <button onClick={() => { setNotifOpen(o => !o); setAccountOpen(false); }} aria-label="Notifications" aria-expanded={notifOpen}
          title="Notifications"
          className={`relative w-10 h-10 rounded-xl border flex items-center justify-center transition-colors ${
            notifOpen ? 'border-[#011c72] text-[#011c72] bg-[#eef1fb]' : 'border-gray-200 text-gray-600 hover:text-[#011c72] hover:border-gray-300'}`}>
          <BellIcon />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <span className="hidden sm:block w-px h-7 bg-gray-200 mx-1" aria-hidden="true" />
        <div className="relative">
          <button onClick={() => { setAccountOpen(o => !o); setNotifOpen(false); }} aria-haspopup="menu" aria-expanded={accountOpen}
            className="flex items-center gap-2 rounded-xl pl-1 pr-1 sm:pl-2 py-1 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#011c72] transition-colors">
            <span className="hidden sm:block max-w-40 truncate text-sm font-semibold text-gray-900">{user?.fullName}</span>
            <span className="w-9 h-9 rounded-full bg-[#011c72] text-white text-sm font-bold flex items-center justify-center shrink-0">{initial}</span>
            <svg className={`hidden sm:block w-4 h-4 text-gray-400 transition-transform ${accountOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {accountOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAccountOpen(false)} aria-hidden="true" />
              <div role="menu" className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] z-50 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
                  <span className="w-12 h-12 rounded-full bg-[#011c72] text-white text-lg font-bold flex items-center justify-center shrink-0">{initial}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{user?.fullName}</p>
                    {roleLabel && <p className="text-xs font-medium text-[#011c72]">{roleLabel}</p>}
                    {user?.email && <p className="text-xs text-gray-500 truncate">{user.email}</p>}
                  </div>
                </div>
                <Link href="/profile" role="menuitem" onClick={() => setAccountOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 border-b border-gray-100">
                  <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <span className="flex-1">My account</span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                <button type="button" role="menuitem" onClick={handleLogout} disabled={isLoggingOut}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-red-50 hover:text-red-700 disabled:opacity-50">
                  <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
                    <LogoutIcon />
                  </span>
                  {isLoggingOut ? 'Logging out…' : 'Log out'}
                </button>
                <p className="px-4 py-2.5 border-t border-gray-100 text-xs font-medium text-gray-400">Seatmakers Avenue</p>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
    {mobileOpen && (
      <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={onMobileClose} aria-hidden="true" />
    )}
    <aside
      className={`fixed top-0 h-full bg-white border-r border-gray-200 z-40 flex flex-col shadow-sm transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      } ${mobileOpen ? 'left-0' : '-left-64'} md:left-0`}
    >
      {/* Header */}
      <div className={`flex items-center h-16 px-3 border-b border-gray-200 shrink-0 ${collapsed ? 'justify-center' : 'gap-2'}`}>
        <Link href="/" title="Home" className={`flex items-center gap-2 min-w-0 ${collapsed ? '' : 'flex-1'}`}>
          <LogoMark logo={branding.logo} />
          {!collapsed && (
            <span className="font-bold text-gray-900 text-sm flex-1 truncate">
              Seatmakers Ave
            </span>
          )}
        </Link>
        <button onClick={onMobileClose} aria-label="Close menu"
          className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <button
          onClick={onToggle}
          className="hidden md:block p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {collapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            )}
          </svg>
        </button>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleEntries.map((entry) => {
          if (!('items' in entry)) return renderLink(entry);

          const isActive = entry.items.some((i) => isActivePath(i.path));
          const badge = entry.items.reduce((n, i) => n + badgeFor(i.path), 0);
          const isOpen = mobileOpen
            ? (drawerExpanded === undefined ? isActive : drawerExpanded === entry.name)
            : flyout?.name === entry.name;

          return (
            <div key={entry.name}>
              <button
                type="button"
                title={collapsed ? entry.name : undefined}
                aria-expanded={isOpen}
                // Desktop: hover or click opens the flyout. Phone drawer: click expands in place.
                onMouseEnter={(e) => { if (!mobileOpen) openFlyout(entry.name, e.currentTarget); }}
                onMouseLeave={() => { if (!mobileOpen) scheduleFlyoutClose(); }}
                onClick={(e) => {
                  if (mobileOpen) setDrawerExpanded(isOpen ? null : entry.name);
                  else if (flyout?.name === entry.name) setFlyout(null);
                  else openFlyout(entry.name, e.currentTarget);
                }}
                className={`w-full flex items-center rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-[#dde6ff] text-[#011c72]'
                    : isOpen
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="relative shrink-0">
                  <NavIcon entry={entry} custom={branding.navIcons} />
                  {collapsed && badge > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
                  )}
                </span>
                {!collapsed && <span className="truncate flex-1 text-left">{entry.name}</span>}
                {!collapsed && badge > 0 && (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" />
                )}
                {!collapsed && (
                  <svg className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${mobileOpen && isOpen ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
              {mobileOpen && isOpen && (
                <div className="ml-4 pl-2 mt-0.5 border-l border-gray-200 space-y-0.5">
                  {entry.items.map((item) => renderLink(item, true))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Category flyout (desktop): lists the category's pages beside the sidebar */}
      {!mobileOpen && flyout && flyoutGroup && (
        <div
          onMouseEnter={cancelFlyoutClose}
          onMouseLeave={scheduleFlyoutClose}
          style={{
            top: Math.max(8, Math.min(flyout.top, window.innerHeight - (flyoutGroup.items.length * 44 + 64))),
            left: flyout.left,
          }}
          className="hidden md:block fixed z-50 w-60 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden"
        >
          <p className="px-4 py-2.5 border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {flyoutGroup.name}
          </p>
          <div className="p-2 space-y-0.5">
            {flyoutGroup.items.map((item) => renderLink(item, true))}
          </div>
        </div>
      )}


      {/* Notification Panel */}
      {notifOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => { setNotifOpen(false); setShowArchive(false); }} />
          <div className="fixed top-16 md:top-[4.5rem] inset-x-2 md:inset-x-auto md:right-6 z-40 md:w-96 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="px-4 pt-3 pb-2 border-b border-gray-100">
              <p className="text-sm font-bold text-gray-900">{showArchive ? 'Archived Notifications' : 'Notifications'}</p>
              <div className="flex items-center justify-between mt-1.5">
                {showArchive ? (
                  <button onClick={() => setShowArchive(false)} className="text-xs text-[#011c72] hover:underline font-medium">
                    &larr; Back to notifications
                  </button>
                ) : (
                  <>
                    <button onClick={markAllRead} disabled={unreadCount === 0}
                      className="text-xs text-[#011c72] hover:underline font-medium disabled:text-gray-300 disabled:no-underline">
                      Mark all as read
                    </button>
                    <button onClick={() => { setShowArchive(true); loadArchived(); }}
                      className="text-xs text-[#011c72] hover:underline font-medium">
                      View archive
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {(showArchive ? archived : notifications).length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">
                  {showArchive ? 'No archived notifications' : 'No notifications'}
                </p>
              ) : (showArchive ? archived : notifications).map(n => {
                const href = notificationHref(n.type, n.data, can);
                const unread = !showArchive && !n.isRead;
                const body = (
                  <div className="flex items-start gap-2">
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${unread ? 'bg-blue-500' : 'bg-transparent'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {formatDateTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                );

                const handleDelete = async () => {
                  const ok = await confirm({
                    title: 'Delete notification?',
                    message: 'This notification will be removed permanently.',
                    confirmLabel: 'Delete',
                    variant: 'danger',
                  });
                  if (ok) await remove(n.id);
                };

                return (
                  <div key={n.id} className={`flex items-start gap-1 pr-2 transition-colors hover:bg-gray-50 ${unread ? 'bg-blue-50' : ''}`}>
                    {/* Only a notification with somewhere to go is clickable */}
                    {href ? (
                      <button type="button" title="Open"
                        onClick={() => { if (!n.isRead) markRead(n.id); setNotifOpen(false); setShowArchive(false); router.push(href); }}
                        className="flex-1 min-w-0 text-left pl-4 py-3 cursor-pointer">
                        {body}
                      </button>
                    ) : (
                      <div className="flex-1 min-w-0 pl-4 py-3 cursor-default">
                        {body}
                        {unread && (
                          <div className="mt-1 pl-4">
                            <button type="button" onClick={() => markRead(n.id)}
                              className="text-[11px] font-medium text-[#011c72] hover:underline">
                              Mark read
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5 py-2 shrink-0">
                      {showArchive ? (
                        <button type="button" title="Restore" onClick={() => restore(n.id)}
                          className="p-1 rounded text-gray-400 hover:text-[#011c72] hover:bg-white transition-colors">
                          <RestoreIcon />
                        </button>
                      ) : (
                        <button type="button" title="Archive" onClick={() => archive(n.id)}
                          className="p-1 rounded text-gray-400 hover:text-[#011c72] hover:bg-white transition-colors">
                          <ArchiveIcon />
                        </button>
                      )}
                      <button type="button" title="Delete" onClick={handleDelete}
                        className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-white transition-colors">
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </aside>
    {confirmDialog}
    </>
  );
}

/**
 * Where a notification leads, or null when it has nowhere to go for this role
 * (the row is then shown as plain text rather than a link).
 */
function notificationHref(type: string, data: unknown,
  can: (...permissions: string[]) => boolean): string | null {
  const d = (data || {}) as { orderId?: number; jobOrderId?: number; purchaseOrderId?: number };
  switch (type) {
    case 'po_sent':
      // A supplier account: a new purchase order to set the delivery date of
      return '/dashboard';
    case 'po_due_soon':
    case 'po_overdue':
    case 'po_delivery_set':
      // Supplier payment reminders and delivery dates open the purchase order
      return d.purchaseOrderId && can('purchase_orders.view') ? `/purchase-orders/${d.purchaseOrderId}` : null;
    case 'work_submitted':
      // A worker's finished task waiting for approval
      return can('workers.approve') ? '/worker-dashboard' : null;
    case 'transfer_request':
    case 'transfer_dispatched':
    case 'order_cancelled':
    case 'order_ready':
    case 'sale_completed':
      return d.orderId && can('product_orders.view') ? `/product-orders/${d.orderId}` : null;
    case 'premade_delivery':
      // Incoming premade stock is confirmed on the Finished Goods tab
      return can('premade.view', 'premade.receive') ? '/inventory?tab=finished-goods' : null;
    default:
      return null;
  }
}

function BellIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
