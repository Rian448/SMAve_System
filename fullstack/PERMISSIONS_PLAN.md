# Permissions Refactor — Plan and Final Defaults

Implemented with the recommended answers to Q1–Q5 (§8). §4 shows the final role
defaults; three were trimmed during implementation so every screen stays exactly as
it was (see the note under the table).

## 1. What exists today

| Where | What | Count |
|---|---|---|
| `backend/app.py` | Routes | 173 |
| | `@require_roles(...)` on routes | 120 |
| | Inline `user['role']` checks | 45 (almost all are branch scoping, see §5) |
| Frontend | Files using `hasAccess` / `user.role` | 24 |

Roles: `administrator`, `supervisor`, `sales_manager`, `seat_maker`, `sewer`, `customer`.
`STAFF_ROLES` and `APPOINTMENT_STAFF` are both administrator + supervisor + sales_manager.

## 2. How it will work

- **Permission** = `module.action`, e.g. `inventory.add`.
- **Effective permissions** = role defaults + user grants − user revokes.
- **Server** checks permissions on every endpoint (`@require_permission`); the UI
  only hides what the server would refuse anyway.
- **Branch scope** is a permission too: `branches.all` = "see and act on every
  branch". Today that is exactly "is administrator". Without it, a user is limited
  to their own branch, as today.
- **Customers** stay self-service: their own orders, cart, appointments and
  profile are tied to their account, not to permissions. Overrides cannot be set
  on customer accounts.

## 3. Permission list

| Module | Permissions | Notes |
|---|---|---|
| Dashboard | `dashboard.view` | |
| Sales / Job Orders | `sales.view`, `sales.add`, `sales.edit`, `sales.delete`, `sales.void`, `sales.quote`, `sales.edit_unpaid` | `sales.quote` = sending a job order as a quotation (the `sendQuotation` field). `sales.edit_unpaid` = edit a confirmed order before its down payment, and its parts, status and workers (replaces the old sales-manager role check; administrators and supervisors have it by default). Lineup slips and premade drafts fall under Sales. |
| Custom Requests | `custom_requests.view`, `custom_requests.edit`, `custom_requests.quote` | Customer-submitted custom orders (staff side). |
| Customers | `customers.view`, `customers.add`, `customers.edit` | No delete endpoint exists. |
| Payments | `payments.view`, `payments.add`, `payments.request_override`, `payments.approve_override` | |
| Appointments | `appointments.view`, `appointments.edit` | Edit includes confirming and no-show. Booking stays public. |
| Inventory (raw materials) | `inventory.view`, `inventory.add`, `inventory.edit`, `inventory.delete`, `inventory.log_waste` | Delete = archive / restore (nothing is hard-deleted). |
| Premade Products | `premade.view`, `premade.add`, `premade.edit`, `premade.distribute`, `premade.receive` | Receive = confirm/cancel incoming stock transfers. |
| Suppliers | `suppliers.view`, `suppliers.add`, `suppliers.edit` | |
| Purchase Orders | `purchase_orders.view`, `purchase_orders.add`, `purchase_orders.approve`, `purchase_orders.receive` | |
| Product Orders | `product_orders.view`, `product_orders.edit`, `product_orders.payment`, `product_orders.transfer`, `product_orders.flag_spam` | Edit = status/notes; payment = record payments; transfer = dispatch/receive/bulk transfer actions. |
| Costing | `costing.view`, `costing.edit` | |
| Forecasting | `forecasting.view`, `forecasting.manage` | Manage = upload history / recompute AI. |
| Item Trail | `item_trail.view`, `item_trail.add`, `item_trail.update_status` | |
| Reports | `reports.sales`, `reports.inventory`, `reports.settlement`, `reports.audit_trail` | Each report is its own permission. |
| Announcements | `announcements.view`, `announcements.manage` | |
| Worker Management | `workers.view`, `workers.add`, `workers.edit`, `workers.delete`, `workers.assign`, `workers.delete_assignment` | |
| Catalog | `catalog.manage` | Viewing is public. |
| Spam Blacklist | `blacklist.manage` | |
| Chat | `chat.use` | Staff chat bubble. |
| Settings | `settings.edit` | System settings (thresholds, markup). |
| Branches | `branches.manage`, `branches.all` | `branches.all` = cross-branch scope (see §5). |
| Users | `users.manage` | Add/edit/archive/delete users and edit their permissions. |
| Owner Dashboard | `owner.view` | Executive summary, job costing margins, P&L, receivables, inventory value (`/owner`). Administrators and the Owner role. |
| Expenses | `expenses.view`, `expenses.add`, `expenses.delete` | Business cash outflows (payables). Supervisors and sales managers log their branch's; deleting is administrator-only. |

**72 permissions in 25 modules.**

The **Owner** role reviews rather than operates: every view permission, all branches and the owner dashboard, with no add/edit/delete permissions. A default `owner` account (password `owner123`) is created on startup if missing; change its password after the first login.

### Delegation policy

Administrators can change anyone's access. Anyone else granted `users.manage`:

- can't change their own account in user management (they use My Profile),
- can't change, archive, delete or edit the permissions of an administrator account,
- can't give out the administrator role,
- can only grant or remove permissions they hold themselves, and never
  `users.manage`, `branches.manage` or `branches.all` (administrators only).

The same rule applies when creating a user or changing a role: the access that
changes must all be within what the editor may delegate. Saving permissions
sends back the version that was loaded; if someone else saved in between, the
save is refused (409) and the dialog offers to reload.

## 4. Role defaults (reproduce today exactly)

✅ = on by default · — = off by default (can still be granted per user)

| Permission | Admin | Supervisor | Sales Mgr | Seat Maker / Sewer |
|---|:-:|:-:|:-:|:-:|
| dashboard.view | ✅ | ✅ | ✅ | — |
| sales.view / add / edit / delete / quote | ✅ | ✅ | ✅ | — |
| sales.void | ✅ | ✅ | — | — |
| custom_requests.view / edit / quote | ✅ | ✅ | ✅ | — |
| customers.view / edit | ✅ | ✅ | ✅ | — |
| customers.add | ✅ | ✅ | — | — |
| payments.view / add / request_override | ✅ | ✅ | ✅ | — |
| payments.approve_override | ✅ | — | — | — |
| appointments.view / edit | ✅ | ✅ | ✅ | — |
| inventory.* (all 5) | ✅ | ✅ | — | — |
| premade.view / add / edit / distribute | ✅ | ✅ | — | — |
| premade.receive | ✅ | ✅ | ✅ (own branch) | — |
| suppliers.* | ✅ | ✅ | — | — |
| purchase_orders.view / add / receive | ✅ | ✅ | — | — |
| purchase_orders.approve | ✅ | — | — | — |
| product_orders.* | ✅ | ✅ | — | — |
| costing.* | ✅ | ✅ | — | — |
| forecasting.* | ✅ | ✅ | — | — |
| item_trail.* | ✅ | ✅ | — | — |
| reports.sales | ✅ | ✅ | ✅ | — |
| reports.inventory / settlement | ✅ | ✅ | — | — |
| reports.audit_trail | ✅ | — | — | — |
| announcements.view | ✅ | ✅ | ✅ | — |
| announcements.manage | ✅ | ✅ | — | — |
| workers.view / assign | ✅ | ✅ | ✅ | — |
| workers.add / edit / delete / delete_assignment | ✅ | — | — | — |
| catalog.manage, blacklist.manage | ✅ | — | — | — |
| chat.use | ✅ | ✅ | — | — |
| settings.edit | ✅ | ✅ | — | — |
| branches.manage, users.manage, branches.all | ✅ | — | — | — |

Customers: no staff permissions (self-service only).

**Trimmed during implementation** (the server allowed these, but no screen ever used
them, and granting them would have added new menu items/buttons):
- Sales manager: `item_trail.*` (Item Trail was admin/supervisor-only in the UI),
  `customers.add` (the Customers page only showed Create to admins/supervisors).
- Seat maker / sewer: `announcements.view` (no announcements screen for workers).

All can be granted per user from Settings → Users → Permissions.

**Menu visibility** follows `<module>.view` (or the module's only permission), so with
defaults the sidebar shows exactly what each role sees today.

## 5. Branch scoping (stays a rule, driven by `branches.all`)

These inline checks limit non-admins to their own branch. They become
`if not can('branches.all')` with no change in behaviour:

- Lines 1450 (`can_see_delivery`), 1925, 1999 (dashboard), 3217, 3270, 3351 (payments),
  3613, 3681, 4177, 4357, 4415, 4503, 4512, 4592, 4716 (sales/costing),
  4887 (deliveries), 5146, 5172 (appointments), 5591–5595 (`can_manage_product_order`),
  5842, 5862, 5889, 5915, 5936, 5955, 6007, 6131, 6627, 6683, 6702 (product orders &
  transfers — written as `role == 'supervisor'`, equivalent to "not branches.all" on
  those admin/supervisor-only routes), 6820, 6851, 6877, 7063 (custom requests),
  7219 (forecasting), 7334, 7384, 7458, 7547 (reports).

Not permissions, left as they are:
- 5426 `notify_branch_users` — who *receives* notifications (admins + branch
  supervisors). Proposed: recipients = users with `branches.all` + that branch's
  users holding the relevant module permission. (Or leave role-based — see Q4.)
- 6548 — customers only see order notifications (customer rule).
- 7682–7721, 7764–7807, 7850, 7928, 7967 — user management logic (role assignment,
  last-administrator protection). Last-admin protection will also cover `users.manage`.
- 2222–2224 `can_resolve_premade_transfer` — see Q3.

## 6. Endpoints that do more than one thing

| Endpoint | Fields / actions | Proposal |
|---|---|---|
| `POST /api/sales/job-orders`, `PUT /api/sales/job-orders/<id>` | normal edits **and** `sendQuotation` | `sales.add`/`sales.edit`, plus `sales.quote` when `sendQuotation` is true |
| `PUT /api/sales/job-orders/<id>` | also `status` (incl. cancelled) and payment fields (`downPayment`, `paymentStatus`) | Keep under `sales.edit` (today the same roles can do all of it). Optional split: see Q5 |
| `PUT /api/product-orders/<id>` | `status`, `notes` **and** `addPayment`, `paymentStatus` | `product_orders.edit` for status/notes, `product_orders.payment` for payment fields |
| `PUT /api/inventory/raw-materials/<id>` | details **and** `stockQuantity` | Keep under `inventory.edit`. Optional `inventory.adjust_stock`: see Q5 |
| `PUT /api/worker-assignments/<id>` | hours/status **and** `payOverride` | Keep under `workers.assign`. Optional `workers.pay_override`: see Q5 |
| Archive/restore routes | separate routes already | `inventory.delete`, `users.manage` |

## 7. Shared lookups (any-of rules)

Some pages read another module's data. To keep them working without giving full
module access:

| Endpoint | Allowed with any of |
|---|---|
| `GET /api/inventory/raw-materials` (+ `/<id>`) | `inventory.view`, `sales.add`, `sales.edit`, `purchase_orders.add` |
| `GET /api/inventory/finished-goods` | `premade.view`, `sales.add` |
| `GET /api/inventory/suppliers` | `suppliers.view`, `purchase_orders.add` |
| `GET /api/payments` | `payments.view`, `sales.view` |
| `GET /api/sales/job-orders` (+ `/<id>`) | `sales.view`, `item_trail.add`, `workers.assign` |
| `GET /api/vehicles/*`, `/api/inventory/categories`, `/api/settings/branches`, `/api/settings/system` | any staff account (vehicles also customers, for the booking form) |

## 8. Questions for you (please answer before Step 2)

**Q1. Close the open read endpoints? (recommended: yes)**
16 read endpoints (⚠️ in the table) currently only require *being logged in*. That
means a **customer account can call them directly** and read, for example, every
branch's payments, job orders, inventory and suppliers. No customer page uses them.
The plan restricts them to the permissions above. Customers, seat makers and sewers
lose access they never use in the app. This is the only intended behaviour change.

**Q2. Overrides on seat maker / sewer accounts?**
Proposed: allowed (e.g. give a sewer `item_trail.view`). Customer accounts: not allowed.

**Q3. Premade transfer confirm/cancel scope.**
Today supervisors can confirm/cancel incoming premade transfers for **any** branch,
while sales managers only for their own branch. Proposed: keep exactly that by
treating `premade.distribute` holders as any-branch. Alternative: limit supervisors
to their own branch like everywhere else.

**Q4. Notification recipients.**
Keep "admins + branch supervisors" (role-based), or switch to permission-based
(e.g. transfer requests go to anyone at that branch with `product_orders.transfer`)?
Proposed: permission-based, which matches today with default permissions.

**Q5. Optional finer splits** — add any of these now?
`inventory.adjust_stock`, `sales.change_status`, `sales.record_payment`,
`workers.pay_override`. Proposed: not now; easy to add later.

## 9. Step 2–4 outline (after approval)

1. Backend core: `PERMISSIONS`, `ROLE_DEFAULT_PERMISSIONS`, `user_permission_overrides`
   table, `get_effective_permissions`, `@require_permission`, `permissions` in
   `user_to_dict`, session-cache invalidation, lock-out protection, 3 new endpoints.
2. Convert endpoints module by module (table below), then the branch-scope checks.
3. Frontend: `can()` / `canAny()`, sidebar, the 24 files, access-denied state,
   Settings → Users → **Permissions** matrix (View / Add / Edit / Delete + extras,
   "from role" vs "granted" vs "revoked", Reset to role defaults).
4. Verify: before/after allow-deny test for every role across all modules, override
   tests (e.g. sales manager with `inventory.add` only → POST ok, PUT/DELETE 403),
   lock-out tests, `tsc` + `eslint`.

## 10. Endpoint table (all 173 routes)

Line = line in `backend/app.py` today. ⚠️ = tightened (see Q1).

| Line | Method | Path | Current check | Inline role checks | Proposed |
|---|---|---|---|---|---|
| 1459 | POST | `/api/auth/login` | public |  | public |
| 1523 | POST | `/api/auth/logout` | any signed-in user |  | any signed-in user (own data) |
| 1533 | GET | `/api/auth/me` | any signed-in user |  | any signed-in user (own data) |
| 1599 | POST | `/api/auth/recover` | public |  | public |
| 1651 | POST | `/api/auth/reset-password` | public |  | public |
| 1733 | GET | `/api/profile` | any signed-in user |  | any signed-in user (own data) |
| 1739 | PUT | `/api/profile` | any signed-in user |  | any signed-in user (own data) |
| 1787 | POST | `/api/profile/password` | any signed-in user |  | any signed-in user (own data) |
| 1810 | POST | `/api/profile/email/request` | any signed-in user |  | any signed-in user (own data) |
| 1860 | POST | `/api/profile/email/confirm` | any signed-in user |  | any signed-in user (own data) |
| 1940 | GET | `/api/dashboard/stats` | STAFF_ROLES |  | dashboard.view |
| 2005 | GET | `/api/dashboard/recent-activity` | STAFF_ROLES |  | dashboard.view |
| 2047 | GET | `/api/dashboard/alerts` | STAFF_ROLES |  | dashboard.view |
| 2256 | GET | `/api/vehicles/makes` | any signed-in user |  | staff lookup (any staff account) + customer (booking form) |
| 2266 | GET | `/api/vehicles/models` | any signed-in user |  | staff lookup (any staff account) + customer (booking form) |
| 2286 | GET | `/api/inventory/raw-materials` | any signed-in user |  | inventory.view ⚠️ |
| 2320 | GET | `/api/inventory/raw-materials/summary` | any signed-in user |  | inventory.view ⚠️ |
| 2347 | GET | `/api/inventory/raw-materials/group-detail` | any signed-in user |  | inventory.view ⚠️ |
| 2371 | GET | `/api/inventory/raw-materials/<int:material_id>` | any signed-in user |  | inventory.view ⚠️ |
| 2379 | POST | `/api/inventory/raw-materials` | administrator, supervisor |  | inventory.add |
| 2444 | PUT | `/api/inventory/raw-materials/<int:material_id>` | administrator, supervisor |  | inventory.edit |
| 2489 | POST | `/api/inventory/raw-materials/<int:material_id>/archive` | administrator, supervisor |  | inventory.delete |
| 2504 | POST | `/api/inventory/raw-materials/<int:material_id>/restore` | administrator, supervisor |  | inventory.delete |
| 2523 | GET | `/api/inventory/finished-goods` | any signed-in user |  | premade.view ⚠️ |
| 2544 | POST | `/api/inventory/finished-goods` | administrator, supervisor |  | premade.add |
| 2671 | PUT | `/api/inventory/finished-goods/<int:item_id>` | administrator, supervisor |  | premade.edit |
| 2815 | POST | `/api/inventory/finished-goods/<int:item_id>/distribute` | administrator, supervisor |  | premade.distribute |
| 2872 | GET | `/api/inventory/premade-transfers` | any signed-in user |  | premade.view ⚠️ |
| 2890 | POST | `/api/inventory/premade-transfers/<int:transfer_id>/confirm` | administrator, supervisor, sales_manager |  | premade.receive |
| 2942 | POST | `/api/inventory/premade-transfers/<int:transfer_id>/cancel` | administrator, supervisor, sales_manager |  | premade.receive |
| 2967 | GET | `/api/inventory/material-usage` | any signed-in user |  | inventory.view ⚠️ |
| 2982 | GET | `/api/inventory/finished-goods/public` | public |  | public |
| 3025 | GET | `/api/inventory/categories` | any signed-in user |  | staff lookup (any staff account) |
| 3039 | GET | `/api/inventory/low-stock` | any signed-in user |  | inventory.view ⚠️ |
| 3080 | GET | `/api/inventory/suppliers` | any signed-in user |  | suppliers.view ⚠️ |
| 3090 | POST | `/api/inventory/suppliers` | administrator, supervisor |  | suppliers.add |
| 3111 | PUT | `/api/inventory/suppliers/<int:supplier_id>` | administrator, supervisor |  | suppliers.edit |
| 3152 | GET | `/api/inventory/waste-logs` | any signed-in user |  | inventory.view ⚠️ |
| 3162 | POST | `/api/inventory/waste-logs` | administrator, supervisor |  | inventory.log_waste |
| 3209 | GET | `/api/payments` | any signed-in user | administrator | payments.view ⚠️ |
| 3226 | POST | `/api/payments` | administrator, supervisor, sales_manager |  | payments.add |
| 3263 | GET | `/api/payments/summary` | administrator, supervisor, sales_manager | administrator | payments.view |
| 3313 | POST | `/api/payment-overrides` | administrator, supervisor, sales_manager |  | payments.request_override |
| 3342 | GET | `/api/payment-overrides` | administrator, supervisor, sales_manager | administrator | payments.view |
| 3360 | POST | `/api/payment-overrides/<int:req_id>/approve` | administrator |  | payments.approve_override |
| 3387 | POST | `/api/payment-overrides/<int:req_id>/reject` | administrator |  | payments.approve_override |
| 3604 | GET | `/api/sales/job-orders` | any signed-in user | administrator | sales.view ⚠️ |
| 3672 | GET | `/api/sales/job-orders/<int:order_id>` | any signed-in user | administrator | sales.view ⚠️ |
| 3749 | POST | `/api/sales/job-orders` | administrator, supervisor, sales_manager |  | sales.add (+ sales.quote if sendQuotation) |
| 3934 | PUT | `/api/sales/job-orders/<int:order_id>` | administrator, supervisor, sales_manager |  | sales.edit (+ sales.quote if sendQuotation) |
| 4169 | POST | `/api/sales/job-orders/<int:order_id>/void` | administrator, supervisor | administrator | sales.void |
| 4294 | GET | `/api/job-orders/mine` | customer |  | customer self-service (own data) |
| 4309 | POST | `/api/job-orders/<int:order_id>/quotation/respond` | customer |  | customer self-service (own data) |
| 4349 | GET | `/api/sales/drafts` | administrator, supervisor, sales_manager | administrator | sales.view |
| 4384 | DELETE | `/api/sales/job-orders/<int:order_id>` | administrator, supervisor, sales_manager |  | sales.delete |
| 4402 | GET | `/api/sales/all-orders` | administrator, supervisor, sales_manager | administrator | sales.view |
| 4506 | GET | `/api/sales/lineup-slips` | administrator, supervisor, sales_manager | administrator | sales.view |
| 4517 | POST | `/api/sales/lineup-slips` | administrator, supervisor, sales_manager |  | sales.add |
| 4550 | PUT | `/api/sales/lineup-slips/<int:slip_id>` | administrator, supervisor, sales_manager |  | sales.edit |
| 4631 | GET | `/api/costing/all` | administrator, supervisor |  | costing.view |
| 4652 | GET | `/api/costing/job-order/<int:order_id>` | administrator, supervisor |  | costing.view |
| 4677 | PUT | `/api/costing/job-order/<int:order_id>/actual` | administrator, supervisor |  | costing.edit |
| 4686 | GET | `/api/costing/variance-report` | administrator, supervisor |  | costing.view |
| 4708 | GET | `/api/costing/receipt/<int:order_id>` | administrator, supervisor, sales_manager | administrator | sales.view |
| 4750 | GET | `/api/purchase-orders` | administrator, supervisor |  | purchase_orders.view |
| 4781 | GET | `/api/purchase-orders/<int:po_id>` | administrator, supervisor |  | purchase_orders.view |
| 4790 | POST | `/api/purchase-orders` | administrator, supervisor |  | purchase_orders.add |
| 4831 | POST | `/api/purchase-orders/<int:po_id>/approve` | administrator |  | purchase_orders.approve |
| 4850 | POST | `/api/purchase-orders/<int:po_id>/receive` | administrator, supervisor |  | purchase_orders.receive |
| 4881 | GET | `/api/deliveries` | STAFF_ROLES | administrator | item_trail.view |
| 4897 | GET | `/api/deliveries/<int:delivery_id>` | STAFF_ROLES |  | item_trail.view |
| 4908 | POST | `/api/deliveries` | administrator, supervisor |  | item_trail.add |
| 4953 | PUT | `/api/deliveries/<int:delivery_id>/status` | STAFF_ROLES |  | item_trail.update_status |
| 4981 | GET | `/api/deliveries/<int:delivery_id>/receipt` | STAFF_ROLES |  | item_trail.view |
| 5052 | POST | `/api/appointments` | public |  | public |
| 5154 | GET | `/api/appointments` | APPOINTMENT_STAFF | administrator | appointments.view |
| 5179 | GET | `/api/appointments/<int:appointment_id>` | APPOINTMENT_STAFF |  | appointments.view |
| 5192 | PUT | `/api/appointments/<int:appointment_id>` | APPOINTMENT_STAFF |  | appointments.edit |
| 5242 | GET | `/api/appointments/my-appointments` | any signed-in user |  | customer self-service (own data) |
| 5254 | POST | `/api/admin/appointments/<int:appointment_id>/no-show` | APPOINTMENT_STAFF |  | appointments.edit |
| 5290 | POST | `/api/admin/product-orders/<int:order_id>/flag-spam` | administrator, supervisor |  | product_orders.flag_spam |
| 5321 | GET | `/api/admin/phone-blacklist` | administrator |  | blacklist.manage |
| 5343 | POST | `/api/admin/phone-blacklist/<int:record_id>/unblock` | administrator |  | blacklist.manage |
| 5366 | DELETE | `/api/admin/phone-blacklist/<int:record_id>` | administrator |  | blacklist.manage |
| 5802 | POST | `/api/product-orders/multi-branch` | public |  | public (shop checkout) |
| 5825 | GET | `/api/product-orders/group/<group_id>` | administrator |  | product_orders.view (+ branches.all) |
| 5836 | GET | `/api/product-orders/my-transfer-requests` | administrator, supervisor | supervisor | product_orders.view |
| 5856 | GET | `/api/product-orders/pickup-queue` | administrator, supervisor | supervisor | product_orders.view |
| 5882 | GET | `/api/product-orders/direct-sales` | administrator, supervisor | supervisor | product_orders.view |
| 5905 | POST | `/api/product-order-transfers/<int:transfer_id>/mark-transferred` | administrator, supervisor | administrator, supervisor | product_orders.transfer |
| 5944 | POST | `/api/product-order-transfers/<int:transfer_id>/confirm-receipt` | administrator, supervisor | administrator, supervisor | product_orders.transfer |
| 6015 | POST | `/api/product-orders` | public |  | public (shop checkout) |
| 6117 | GET | `/api/product-orders` | administrator, supervisor | supervisor | product_orders.view |
| 6140 | PUT | `/api/product-orders/<int:order_id>` | administrator, supervisor |  | product_orders.edit (+ product_orders.payment for addPayment/paymentStatus) |
| 6277 | GET | `/api/product-orders/<int:order_id>` | administrator, supervisor |  | product_orders.view |
| 6292 | GET | `/api/product-orders/<int:order_id>/timeline` | administrator, supervisor |  | product_orders.view |
| 6346 | GET | `/api/product-orders/draft` | any signed-in user |  | customer self-service (own data) |
| 6355 | PUT | `/api/product-orders/draft` | any signed-in user |  | customer self-service (own data) |
| 6416 | DELETE | `/api/product-orders/draft` | any signed-in user |  | customer self-service (own data) |
| 6426 | POST | `/api/product-orders/draft/confirm` | any signed-in user |  | customer self-service (own data) |
| 6477 | GET | `/api/product-orders/drafts` | administrator, supervisor, sales_manager |  | sales.view |
| 6485 | GET | `/api/product-orders/my-orders` | any signed-in user |  | customer self-service (own data) |
| 6493 | POST | `/api/product-orders/my-orders/<int:order_id>/cancel` | customer |  | customer self-service (own data) |
| 6552 | GET | `/api/notifications` | any signed-in user |  | any signed-in user (own data) |
| 6573 | POST | `/api/notifications/read-all` | any signed-in user |  | any signed-in user (own data) |
| 6583 | POST | `/api/notifications/<int:notif_id>/read` | any signed-in user |  | any signed-in user (own data) |
| 6592 | POST | `/api/notifications/<int:notif_id>/archive` | any signed-in user |  | any signed-in user (own data) |
| 6605 | DELETE | `/api/notifications/<int:notif_id>` | any signed-in user |  | any signed-in user (own data) |
| 6619 | GET | `/api/product-orders/transfer-dashboard` | administrator, supervisor | supervisor | product_orders.view |
| 6665 | POST | `/api/product-order-transfers/bulk-action` | administrator, supervisor | supervisor | product_orders.transfer |
| 6757 | POST | `/api/customer-orders` | public |  | public |
| 6812 | GET | `/api/customer-orders` | administrator, supervisor, sales_manager | administrator | custom_requests.view |
| 6840 | GET | `/api/customer-orders/<int:order_id>` | administrator, supervisor, sales_manager | administrator | custom_requests.view |
| 6866 | PUT | `/api/customer-orders/<int:order_id>/status` | administrator, supervisor, sales_manager | administrator | custom_requests.edit |
| 6922 | POST | `/api/auth/register/send-code` | public |  | public |
| 6962 | POST | `/api/auth/register` | public |  | public |
| 7027 | GET | `/api/customer-orders/my-orders` | customer |  | customer self-service (own data) |
| 7038 | GET | `/api/customer-orders/my-orders/<int:order_id>` | customer |  | customer self-service (own data) |
| 7051 | PUT | `/api/customer-orders/<int:order_id>/quotation` | administrator, supervisor, sales_manager | administrator | custom_requests.quote |
| 7098 | PUT | `/api/customer-orders/<int:order_id>/respond` | customer |  | customer self-service (own data) |
| 7136 | GET | `/api/forecasting/inventory` | administrator, supervisor |  | forecasting.view |
| 7224 | GET | `/api/forecasting/demand` | administrator, supervisor |  | forecasting.view |
| 7270 | GET | `/api/forecasting/materials` | administrator, supervisor |  | forecasting.view |
| 7311 | GET | `/api/reports/sales` | administrator, supervisor, sales_manager | administrator | reports.sales |
| 7450 | GET | `/api/reports/inventory` | administrator, supervisor | administrator | reports.inventory |
| 7522 | GET | `/api/reports/branch-settlement` | administrator, supervisor | administrator | reports.settlement |
| 7623 | GET | `/api/reports/audit-trail` | administrator |  | reports.audit_trail |
| 7653 | GET | `/api/settings/users` | administrator |  | users.manage |
| 7666 | POST | `/api/settings/users` | administrator | [seat_maker,sewer] | users.manage |
| 7739 | PUT | `/api/settings/users/<int:user_id>` | administrator |  | users.manage |
| 7838 | POST | `/api/settings/users/<int:user_id>/archive` | administrator |  | users.manage |
| 7861 | POST | `/api/settings/users/<int:user_id>/restore` | administrator |  | users.manage |
| 7912 | GET | `/api/settings/users/<int:user_id>/delete-check` | administrator |  | users.manage |
| 7951 | DELETE | `/api/settings/users/<int:user_id>` | administrator |  | users.manage |
| 8014 | GET | `/api/settings/roles` | any signed-in user |  | users.manage ⚠️ |
| 8028 | GET | `/api/settings/branches` | any signed-in user |  | staff lookup (any staff account) |
| 8041 | GET | `/api/settings/branches/public` | public |  | public |
| 8047 | POST | `/api/settings/branches` | administrator |  | branches.manage |
| 8079 | PUT | `/api/settings/branches/<int:branch_id>` | administrator |  | branches.manage |
| 8113 | GET | `/api/settings/system` | any signed-in user |  | staff lookup (any staff account) |
| 8119 | PUT | `/api/settings/system/<key>` | administrator, supervisor |  | settings.edit |
| 8139 | GET | `/api/managed-workers` | administrator, supervisor, sales_manager |  | workers.view |
| 8162 | POST | `/api/managed-workers` | administrator |  | workers.add |
| 8192 | PUT | `/api/managed-workers/<int:worker_id>` | administrator |  | workers.edit |
| 8225 | DELETE | `/api/managed-workers/<int:worker_id>` | administrator |  | workers.delete |
| 8236 | GET | `/api/worker-assignments` | administrator, supervisor, sales_manager |  | workers.view |
| 8282 | POST | `/api/worker-assignments` | administrator, supervisor, sales_manager |  | workers.assign |
| 8371 | PUT | `/api/worker-assignments/<int:assignment_id>` | administrator, supervisor, sales_manager |  | workers.assign |
| 8456 | GET | `/api/worker-assignments/calendar` | administrator, supervisor, sales_manager |  | workers.view |
| 8492 | DELETE | `/api/worker-assignments/<int:assignment_id>` | administrator |  | workers.delete_assignment |
| 8514 | GET | `/api/worker-availability` | administrator, supervisor, sales_manager |  | workers.view |
| 8553 | POST | `/api/worker-availability` | administrator, supervisor, sales_manager |  | workers.assign |
| 8615 | GET | `/api/health` | public |  | public |
| 8640 | GET | `/api/catalog` | public |  | public |
| 8646 | POST | `/api/catalog` | administrator |  | catalog.manage |
| 8669 | PUT | `/api/catalog/<int:item_id>` | administrator |  | catalog.manage |
| 8694 | DELETE | `/api/catalog/<int:item_id>` | administrator |  | catalog.manage |
| 8706 | POST | `/api/catalog/<int:item_id>/image` | administrator |  | catalog.manage |
| 8728 | GET | `/api/catalog/images/<filename>` | public |  | public |
| 8895 | POST | `/api/inventory/ai/upload-historical` | administrator, supervisor |  | forecasting.manage |
| 9011 | GET | `/api/inventory/ai/predictions` | any signed-in user |  | forecasting.view ⚠️ |
| 9045 | POST | `/api/inventory/ai/recompute` | administrator, supervisor |  | forecasting.manage |
| 9106 | GET | `/api/customers/search` | administrator, supervisor, sales_manager |  | customers.view |
| 9123 | GET | `/api/customers` | administrator, supervisor, sales_manager |  | customers.view |
| 9150 | POST | `/api/customers` | administrator, supervisor, sales_manager |  | customers.add |
| 9171 | GET | `/api/customers/<int:customer_id>` | administrator, supervisor, sales_manager |  | customers.view |
| 9209 | PUT | `/api/customers/<int:customer_id>` | administrator, supervisor, sales_manager |  | customers.edit |
| 9259 | GET | `/api/announcements` | any signed-in user |  | announcements.view ⚠️ |
| 9277 | POST | `/api/announcements` | administrator, supervisor |  | announcements.manage |
| 9303 | PUT | `/api/announcements/<int:ann_id>` | administrator, supervisor |  | announcements.manage |
| 9322 | DELETE | `/api/announcements/<int:ann_id>` | administrator, supervisor |  | announcements.manage |
| 9356 | GET | `/api/chat/messages` | administrator, supervisor |  | chat.use |
| 9371 | POST | `/api/chat/messages` | administrator, supervisor |  | chat.use |
