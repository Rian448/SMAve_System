// Feature permissions (module.action). The server decides what each user has —
// role defaults plus per-user grants and revokes — and enforces every one; the
// UI only uses them to hide what the server would refuse anyway.

/** True if the user has at least one of the given permissions. */
export function userCan(permissions: string[] | undefined, ...wanted: string[]): boolean {
  if (!permissions) return false;
  return wanted.some(p => permissions.includes(p));
}

/**
 * Pages and the permissions that open them (any one is enough). The longest
 * matching path wins, so /purchase-orders/new overrides /purchase-orders.
 * Pages not listed (home, shop, My Orders, My Profile, the dashboard, which
 * shows customers and workers a simple view) need no permission.
 */
const PAGE_PERMISSIONS: [string, string[]][] = [
  ['/sales/new', ['sales.add']],
  ['/sales', ['sales.view']],
  ['/customers', ['customers.view']],
  ['/payments', ['payments.view']],
  ['/owner', ['owner.view']],
  ['/expenses', ['expenses.view', 'expenses.add']],
  ['/purchase-orders/new', ['purchase_orders.add']],
  ['/purchase-orders/receiving', ['purchase_orders.receive']],
  ['/purchase-orders', ['purchase_orders.view']],
  ['/suppliers', ['suppliers.view']],
  ['/inventory', ['inventory.view', 'premade.view', 'premade.receive']],
  ['/product-orders', ['product_orders.view']],
  ['/customer-orders', ['custom_requests.view']],
  ['/costing', ['costing.view']],
  ['/forecasting', ['forecasting.view']],
  ['/delivery/new', ['item_trail.add']],
  ['/delivery', ['item_trail.view']],
  ['/item-history', ['inventory.view', 'premade.view']],
  ['/reports', ['reports.sales', 'reports.inventory', 'reports.settlement']],
  ['/audit-trail', ['reports.audit_trail']],
  ['/settings', ['settings.edit', 'users.manage', 'branches.manage']],
  ['/announcements', ['announcements.view']],
  ['/worker-dashboard', ['workers.add', 'workers.edit', 'workers.delete']],
];

/**
 * Where an account starts (after login, "Back to Dashboard", fallbacks): the
 * Owner Dashboard for an account that has it but not the day-to-day Dashboard,
 * otherwise the Dashboard.
 */
export function homePath(can: (...permissions: string[]) => boolean): string {
  return can('owner.view') && !can('dashboard.view') ? '/owner' : '/dashboard';
}

/** Permissions that open this page, or null when it needs none. */
export function pagePermissions(pathname: string): string[] | null {
  let best: [string, string[]] | null = null;
  for (const entry of PAGE_PERMISSIONS) {
    const [prefix] = entry;
    if ((pathname === prefix || pathname.startsWith(prefix + '/')) && (!best || prefix.length > best[0].length)) {
      best = entry;
    }
  }
  return best ? best[1] : null;
}
