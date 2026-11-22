"""
Wipe the day-to-day records and rebuild a realistic business history
(Feb 1, 2026 - today) for a car upholstery / reupholstery shop.

What is kept: user accounts, roles and permissions, branches, settings, vehicle
makes/models, catalog, suppliers, managed workers, the uploaded AI history
(historical_inventory_data), the inventory's material names and the premade
product names/prices.

What is wiped: customers (their names are reused for the new records), job
orders, premade sales, purchase orders and their receipts/payments/returns,
payments, worker tasks, stock and usage logs, expenses, notifications, audit
logs and the AI cache. Material stock restarts from an opening count on the
start date; branch premade stock restarts at zero.

Then, day by day through the app's own API with a simulated clock (so every
rule, stock movement and log is what real use leaves):
  * job orders (normally 4 yd of one material) -> cutter, sewer, installer
    tasks with cut / used amounts, cutting excess and consumables -> balance paid
    and job completed on release
  * premade sales, about 1 for every 8-10 job orders, from stock produced at the
    warehouse and delivered to the shops
  * weekly purchase orders for what reached its reorder level, with partial
    deliveries, returns, replacements and supplier payments by their terms
  * monthly running expenses per branch
Finally the AI forecasts are recomputed.

Usage (back up the database first!):
  venv/Scripts/python.exe seed_realistic_history.py --db smaeve_system.db
  venv/Scripts/python.exe seed_realistic_history.py --database-url postgresql://...   (Neon)
"""
import argparse
import os
import random
import sys
from datetime import datetime as _real_datetime, timedelta

parser = argparse.ArgumentParser()
parser.add_argument('--db', help='SQLite database file to change')
parser.add_argument('--database-url', help='Database URL to change (instead of --db)')
parser.add_argument('--start', default='2026-02-01')
parser.add_argument('--end', default=None, help='Last day to simulate (default: today, Philippine time)')
parser.add_argument('--seed', type=int, default=2026)
parser.add_argument('--yes', action='store_true', help='Do not ask before wiping')
args = parser.parse_args()
if not args.db and not args.database_url:
    sys.exit('Give --db or --database-url')
os.environ['DATABASE_URL'] = args.database_url or ('sqlite:///' + os.path.abspath(args.db).replace('\\', '/'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app as m  # noqa: E402
from sqlalchemy import event  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

rng = random.Random(args.seed)


# ── Simulated clock ─────────────────────────────────────────────────────────────
class Clock:
    now = _real_datetime(2026, 2, 1, 0, 0)  # UTC


class FakeDateTime(_real_datetime):
    @classmethod
    def utcnow(cls):
        return Clock.now

    @classmethod
    def now(cls, tz=None):
        return Clock.now + timedelta(hours=8) if tz is None else _real_datetime.now(tz)


m.datetime = FakeDateTime


def _is_clock(arg):
    return callable(arg) and getattr(arg, '__name__', '') in ('utcnow', 'now')


@event.listens_for(Session, 'before_flush')
def _stamp_by_name(session, _ctx, _instances):
    """Model defaults captured the real clock: give new and changed rows the simulated time."""
    for obj in session.new:
        for col in obj.__table__.columns:
            d = getattr(col, 'default', None)
            if d is not None and _is_clock(getattr(d, 'arg', None)) and getattr(obj, col.key, None) is None:
                setattr(obj, col.key, Clock.now)
    for obj in session.dirty:
        for col in obj.__table__.columns:
            u = getattr(col, 'onupdate', None)
            if u is not None and _is_clock(getattr(u, 'arg', None)):
                setattr(obj, col.key, Clock.now)


m.queue_forecast_refresh = lambda *a, **k: None  # no background threads while generating

app, db = m.app, m.db
client = app.test_client()
errors = []
USERS = {}      # token -> user dict
ADMIN_TOKEN = 'u-admin'


def call(method, url, body=None, as_token=ADMIN_TOKEN, ok=(200, 201), raw=False):
    r = getattr(client, method)(url, headers={'Authorization': f'Bearer {as_token}'}, json=body)
    if r.status_code == 403 and as_token != ADMIN_TOKEN:
        # That staff account lacks the permission: the branch's admin records it
        return call(method, url, body, ADMIN_TOKEN, ok, raw)
    data = r.get_json(silent=True) or {}
    if r.status_code not in ok:
        errors.append(f"{Clock.now + timedelta(hours=8):%Y-%m-%d} {method.upper()} {url}: {r.status_code} "
                      f"{data.get('message') or data.get('error')}")
        return None
    return data if raw else data.get('data', data)


def at(day, hour=9, minute=0):
    """A Philippine local date and hour as the simulated UTC clock."""
    Clock.now = _real_datetime(day.year, day.month, day.day, hour, minute) - timedelta(hours=8)


def money(v):
    return round(v + 1e-9, 2)


def label(mat):
    return ' - '.join(filter(None, [mat.material_type, mat.color, mat.pattern]))


def phone():
    return rng.choice(['0917', '0918', '0919', '0920', '0927', '0928', '0939', '0945', '0947', '0955', '0961',
                       '0966', '0977', '0995', '0998']) + ''.join(rng.choice('0123456789') for _ in range(7))


# ── 0. Wipe ─────────────────────────────────────────────────────────────────────
WIPE_TABLES = [
    'material_waste_logs', 'material_usage_logs', 'stock_adjustment_logs', 'worker_assignments', 'work_tasks',
    'worker_availability_schedules', 'payment_override_requests', 'excess_payments', 'payment_records',
    'purchase_order_credits', 'purchase_order_payments', 'purchase_order_receipts', 'expenses', 'purchase_orders',
    'product_order_transfers', 'deliveries', 'premade_stock_transfers', 'premade_drafts', 'product_orders',
    'lineup_slips', 'appointments', 'customer_orders', 'cart_drafts', 'job_orders', 'chat_messages',
    'notifications', 'audit_logs', 'ai_prediction_cache', 'customers',
]
NOT_CUSTOMERS = ('walk-in', 'customer', 'no name', 'cash', 'rian', 'test', 'talyer')


def wipe():
    # Real customer names to reuse (one-word nicknames and placeholders left out)
    names = sorted({(c.name or '').strip() for c in m.Customer.query.all()})
    names = [n for n in names if len(n.split()) >= 2 and not any(w in n.lower() for w in NOT_CUSTOMERS)]
    present = set(db.inspect(db.engine).get_table_names())
    tables = {t.name: t for t in db.metadata.sorted_tables}
    # Children before parents, so foreign keys hold on Postgres too
    order = [t.name for t in reversed(db.metadata.sorted_tables) if t.name in WIPE_TABLES]
    order += [t for t in WIPE_TABLES if t not in order]
    for name in order:
        if name in present:
            db.session.execute(tables[name].delete() if name in tables else db.text(f'DELETE FROM "{name}"'))
    warehouse = m.Branch.query.filter_by(is_warehouse=True).first()
    db.session.execute(db.text('DELETE FROM premade_products WHERE branch_id <> :w'), {'w': warehouse.id})
    for p in m.PremadeProduct.query.all():
        p.quantity = 0
        p.cost = money(float(p.price or 0) * 0.45)  # replaced by the real cost once a batch is made
    for mat in m.InventoryMaterial.query.all():
        mat.stock_quantity = 0
    db.session.commit()
    print(f'Wiped. {len(names)} customer names kept for reuse.')
    return names


# ── 1. Inventory ────────────────────────────────────────────────────────────────
SUPPLIER_TERMS = {
    'BIFFANY': ('net', 30), 'TRIGOLDEN': ('net', 15), 'URATEX RNC': ('net', 30), 'URATEX RGC': ('net', 30),
    'GRECO': ('net', 30), 'FMI': ('cod', None), 'JOAQUIN': ('cod', None), 'TYE=STAR STOCKIST': ('net', 15),
    'SHOPEE': ('advance', None),
}
SUPPLIES = {  # what each supplier sells (shown on the Suppliers page)
    'BIFFANY': 'Leatherette (plain, perforated), PVC vinyl',
    'TRIGOLDEN': 'Leatherette (plain), PVC vinyl',
    'URATEX RNC': 'Foam-laminated leatherette (1/4", 1/8"), tricot-backed foam',
    'URATEX RGC': 'Foam sheets',
    'GRECO': 'Premium upholstery fabric / PU leather',
    'FMI': 'Fiberfill, fiber cotton',
    'JOAQUIN': 'Contact cement, thread, staples, hog rings, velcro, nylon webbing',
    'TYE=STAR STOCKIST': 'Coil floor matting, rubber floor mat sets',
    'SHOPEE': 'Marking pens, sewing needles, tailor chalk',
}
# Consumables (counted, used up): name -> (unit, reorder level, opening count)
CONSUMABLES = {
    'SUPER-DIKIT-CEMENT': ('cans', 4, 12),          # contact cement (adhesive)
    'MAGIC TAPE (lalaki)': ('rolls', 4, 10),
    'SILVER SIGN PEN (drawing) per pc': ('pcs', 20, 60),
    'FIBERFILL': ('kg', 15, 40),
    'FIBERCOTTON (per kg)': ('kg', 10, 30),
    'URATEX 1/2X44x80': ('sheets', 4, 10),
    'NYLON BLK': ('rolls', 3, 8),                   # nylon webbing
}
NEW_CONSUMABLES = [  # name, pattern, unit, cost, supplier, reorder, opening, item id
    ('NYLON THREAD #69 (cone)', 'Bonded nylon sewing thread', 'cones', 165.0, 'JOAQUIN', 8, 24, 'ACC-004'),
    ('UPHOLSTERY STAPLES 1013J (box)', 'Staple wire for upholstery guns', 'boxes', 210.0, 'JOAQUIN', 4, 12, 'ACC-005'),
    ('HOG RINGS (box)', 'Seat cover hog rings', 'boxes', 185.0, 'JOAQUIN', 3, 10, 'ACC-006'),
    ('SEWING NEEDLES DPx17 (pack)', 'Industrial machine needles', 'packs', 120.0, 'SHOPEE', 3, 10, 'ACC-007'),
    ('TAILOR CHALK (pc)', 'Pattern marking chalk', 'pcs', 15.0, 'SHOPEE', 15, 40, 'ACC-008'),
]
# How often each leatherette is picked for a job order (weight); the black ones lead
BEST_SELLERS = {'SHBLK-PLAIN': 40, 'SHBLK-LAM18': 30, 'PRES10312-PLAIN': 20, 'SHBLK-LAM14': 12, 'PRESBLK-PLAIN': 8,
                'PERFOBLK-LAM14': 8, 'MAD016-LAM14': 6, 'MAD016-PLAIN': 6, 'NYLEXBLK-PLAIN': 6, 'GRECO-PREMIUM': 5}


def supplier_for(name):
    n = name.upper()
    if '-LAM' in n or n.startswith('TRICOT'):
        return 'URATEX RNC'
    if n.startswith('SHBLK-PLAIN'):
        return 'TRIGOLDEN'
    if n.endswith('-PLAIN') or n.startswith('NYLEX'):
        return 'BIFFANY'
    if n.startswith('GRECO'):
        return 'GRECO'
    if n.startswith('FIBER'):
        return 'FMI'
    if n.startswith('URATEX'):
        return 'URATEX RGC'
    if n.startswith(('NOMAD', 'R.M')):
        return 'TYE=STAR STOCKIST'
    if 'PEN' in n:
        return 'SHOPEE'
    return 'JOAQUIN'


def is_cover_material(mat):
    """Leatherette / upholstery fabric sold by the yard: what a job order is made of."""
    return (mat.item_id or '').startswith(('LTH-', 'FAB-'))


def weight_of(mat):
    if not is_cover_material(mat):
        return 0
    return BEST_SELLERS.get(mat.material_type, 1.5)


def levels_for(mat):
    """(reorder level, opening stock) for a length material."""
    w = weight_of(mat)
    n = mat.material_type.upper()
    if w >= 20:
        return 40, 130
    if w >= 5:
        return 20, 60
    if w > 0:
        return 8, 25
    if n.startswith('TRICOT'):
        return 20, 60
    if n.startswith('NOMAD'):
        return 6, 20
    if n.startswith('R.M'):
        return 2, 6
    return 5, 15


def setup_inventory(admin):
    warehouse = m.Branch.query.filter_by(is_warehouse=True).first()
    suppliers = {s.name: s for s in m.Supplier.query.all()}
    for name, (term, days) in SUPPLIER_TERMS.items():
        if name in suppliers:
            suppliers[name].payment_term, suppliers[name].payment_term_days = term, days
            suppliers[name].materials_supplied = SUPPLIES[name]

    for name, pattern, unit, cost, sup, reorder, opening, item_id in NEW_CONSUMABLES:
        if m.InventoryMaterial.query.filter_by(material_type=name).first():
            continue
        mat = m.InventoryMaterial(material_type=name, color='', pattern=pattern, cost_per_unit=cost,
                                  markup_percent=25, unit_price=money(cost * 1.25), stock_quantity=0,
                                  low_stock_threshold=reorder, branch_id=warehouse.id, is_archived=False,
                                  status='available', supplier_id=suppliers[sup].id, item_id=item_id)
        m.apply_consumable_fields(mat, {'isConsumable': True, 'unit': unit})
        db.session.add(mat)
    db.session.flush()

    opening_counts = {n: o for n, _p, _u, _c, _s, _r, o, _i in NEW_CONSUMABLES}
    count = 0
    for mat in m.InventoryMaterial.query.filter_by(is_archived=False).all():
        sup = suppliers.get(supplier_for(mat.material_type))
        if sup and not mat.supplier_id:
            mat.supplier_id = sup.id
        if not mat.cost_per_unit:
            mat.cost_per_unit = round(float(mat.unit_price or 0) / 1.25, 2)
        if mat.material_type in CONSUMABLES:
            unit, reorder, opening = CONSUMABLES[mat.material_type]
            m.apply_consumable_fields(mat, {'isConsumable': True, 'unit': unit})
        elif mat.material_type in opening_counts:
            reorder, opening = float(mat.low_stock_threshold or 0), opening_counts[mat.material_type]
        else:
            m.apply_consumable_fields(mat, {'isConsumable': False})
            reorder, opening = levels_for(mat)
        mat.low_stock_threshold = reorder
        mat.stock_quantity = opening
        m.log_stock_adjustment('material', mat.id, mat.branch_id, 'starting', 0, opening, m.user_to_dict(admin),
                               note='Opening stock count')
        count += 1
    db.session.commit()
    print(f'Inventory: {count} materials with supplier, reorder level and opening stock.')
    return warehouse


# ── 2. History ──────────────────────────────────────────────────────────────────
VEHICLES = [('Toyota', 'Vios'), ('Toyota', 'Vios'), ('Toyota', 'Innova'), ('Toyota', 'Innova'), ('Toyota', 'Hilux'),
            ('Toyota', 'Fortuner'), ('Toyota', 'Avanza'), ('Toyota', 'Wigo'), ('Toyota', 'Rush'),
            ('Mitsubishi', 'Mirage G4'), ('Mitsubishi', 'Montero Sport'), ('Mitsubishi', 'Xpander'),
            ('Mitsubishi', 'Strada'), ('Honda', 'City'), ('Honda', 'Civic'), ('Honda', 'BR-V'), ('Nissan', 'Navara'),
            ('Nissan', 'Almera'), ('Ford', 'Ranger'), ('Ford', 'Everest'), ('Suzuki', 'Ertiga'), ('Suzuki', 'Dzire'),
            ('Isuzu', 'D-Max'), ('Isuzu', 'mu-X'), ('Hyundai', 'Accent'), ('Hyundai', 'Stargazer'), ('Kia', 'Stonic')]
SERVICES = ['seat_covers'] * 9 + ['seat_covers, flooring'] * 2 + ['flooring', 'reupholstery (sofa)', 'sidings']
RETURN_REASONS = ['Damaged', 'Bad quality', 'Wrong color / pattern', 'Wrong item']
NEW_WORKERS = [('Arnel Domingo', 'Sewer', 'per_hour', 90.0), ('Rodel Pascual', 'Installer', 'per_hour', 85.0)]
PREMADE_STARTERS = ['Toyota Vios Ready-Made Seat Cover (AF)', 'Toyota Innova J/E 2023 Ready-Made Seat Cover',
                    'Mitsubishi Mirage Glx Ready-Made Seat Cover (AF)', 'Toyota Fortuner 2023 Ready-Made Seat Cover',
                    'Toyota Hilux Ready-Made Seat Cover (AF)', 'Nissan Navara w/ Arm Ready-Made Seat Cover',
                    'Honda City Ready-Made Seat Cover', 'Mitsubishi Xpander Ready-Made Seat Cover',
                    'Universal Ready-Made Seat Cover', 'Mitsubishi Strada Ready-Made Seat Cover (AF)',
                    'Toyota Avanza 2023 Ready-Made Seat Cover', 'Mitsubishi Montero 2023 Ready-Made Seat Cover']
SOURCES = ['Walk-in'] * 6 + ['Facebook Page', 'Phone call']
EXPENSES = {  # branch name keyword -> monthly rent
    'Warehouse': 25000, 'Pasig': 20000, 'Brookside': 16000, 'Kamuning': 18000, 'Cubao': 18000,
}


def workers_by_trade():
    for name, kind, mode, rate in NEW_WORKERS:
        if not m.ManagedWorker.query.filter_by(name=name).first():
            db.session.add(m.ManagedWorker(name=name, work_type=kind, pay_mode=mode, rate_per_hour=rate,
                                           is_active=True))
    db.session.commit()
    trades = {}
    for w in m.ManagedWorker.query.filter_by(is_active=True).order_by(m.ManagedWorker.id).all():
        kind = w.work_type.lower()
        key = 'cut' if 'cut' in kind else 'sew' if 'sew' in kind else 'install'
        trades.setdefault(key, []).append(w)
    return trades


class Sim:
    def __init__(self, admin, warehouse, customer_names):
        self.admin, self.warehouse = admin, warehouse
        self.events, self.seq = [], 0
        self.customers = [(n, phone() if rng.random() < 0.85 else '') for n in customer_names]
        rng.shuffle(self.customers)
        self.regulars = self.customers[:25]  # some come back
        self.shops = m.Branch.query.filter_by(is_warehouse=False, is_active=True).order_by(m.Branch.id).all()
        self.staff = {}  # branch id -> tokens of the sales staff there
        for u in m.User.query.join(m.Role, m.User.role_id == m.Role.id).filter(
                m.Role.key == 'sales_manager', m.User.is_active.is_(True)).all():
            USERS[f'u{u.id}'] = m.user_to_dict(u)
            self.staff.setdefault(u.branch_id, []).append(f'u{u.id}')
        self.trades = workers_by_trade()
        self.invoice_no = 41200
        self.premade_due = 0.0
        self.counts = {'jo': 0, 'jo_done': 0, 'cancelled': 0, 'premade_sales': 0, 'premade_made': 0, 'po': 0,
                       'returns': 0, 'supplier_payments': 0, 'cuts': 0, 'expenses': 0}
        mats = m.InventoryMaterial.query.filter(m.InventoryMaterial.is_archived.is_(False),
                                                m.InventoryMaterial.branch_id == warehouse.id).all()
        self.covers = [x for x in mats if is_cover_material(x)]
        self.weights = {x.id: weight_of(x) for x in self.covers}
        by_name = {x.material_type: x for x in mats}
        self.tricot = [x for x in mats if x.material_type.upper().startswith('TRICOT')]
        self.matting = [x for x in mats if x.material_type.upper().startswith('NOMAD')]
        self.mat = lambda name: by_name.get(name)
        self.premade = {p.name: p for p in m.PremadeProduct.query.filter_by(branch_id=warehouse.id,
                                                                            is_archived=False).all()}

    def schedule(self, when, fn, *a):
        self.seq += 1
        self.events.append((when, self.seq, fn, a))

    def clerk(self, branch_id):
        return rng.choice(self.staff.get(branch_id) or [ADMIN_TOKEN])

    def customer(self):
        return rng.choice(self.regulars) if rng.random() < 0.2 else rng.choice(self.customers)

    def stock(self, mat_id):
        return float(db.session.get(m.InventoryMaterial, mat_id).stock_quantity or 0)

    # Purchase orders ------------------------------------------------------------
    def restock(self, day):
        """Monday: order what is at or under its reorder level, one PO per supplier."""
        need = {}
        db.session.expire_all()
        for mat in m.InventoryMaterial.query.filter(m.InventoryMaterial.is_archived.is_(False),
                                                    m.InventoryMaterial.branch_id == self.warehouse.id).all():
            reorder = float(mat.low_stock_threshold or 0)
            if not mat.supplier_id or float(mat.stock_quantity or 0) > reorder:
                continue
            open_po = any(mat.id in ids for ids in self.on_order.values())
            if open_po:
                continue
            qty = reorder * 3 - float(mat.stock_quantity or 0)
            qty = max(round(qty), 1) if mat.is_consumable else max(round(qty / 5) * 5, 10)
            need.setdefault(mat.supplier_id, []).append((mat, qty))
        for sup_id, lines in need.items():
            sup = db.session.get(m.Supplier, sup_id)
            at(day, 10, rng.randint(0, 50))
            po = call('post', '/api/purchase-orders', {
                'supplierId': sup.id, 'supplierName': sup.name, 'expectedDelivery': (day + timedelta(days=3)).isoformat(),
                'items': [{'materialId': mat.id, 'name': label(mat), 'quantity': qty, 'unit': m.material_unit(mat),
                           'unitPrice': float(mat.cost_per_unit or mat.unit_price), 'consumable': bool(mat.is_consumable)}
                          for mat, qty in lines]})
            if not po:
                continue
            self.counts['po'] += 1
            self.on_order[po['id']] = {mat.id for mat, _ in lines}
            at(day, 14, rng.randint(0, 40))
            call('post', f"/api/purchase-orders/{po['id']}/approve")
            self.schedule(day + timedelta(days=rng.randint(2, 5)), self.deliver, po['id'], rng.random() < 0.12)

    on_order = {}

    def deliver(self, day, po_id, partial):
        po = call('get', f'/api/purchase-orders/{po_id}')
        if not po or po['status'] not in ('approved', 'partially_received'):
            return
        items = []
        for it in po['items']:
            q = it['remainingQuantity']
            if partial:
                q = round(q * 0.6) if it.get('unit') != 'yd' else round(q * 0.6, 1)
            if q > 0:
                items.append({'line': it['line'], 'quantity': q})
        if not items:
            return
        self.invoice_no += rng.randint(3, 60)
        at(day, rng.randint(9, 15), rng.randint(0, 59))
        po = call('post', f'/api/purchase-orders/{po_id}/receive',
                  {'items': items, 'invoiceNumber': f'SI-{self.invoice_no}', 'notes': ''})
        if not po:
            return
        if partial:
            self.schedule(day + timedelta(days=rng.randint(3, 7)), self.deliver, po_id, False)
            return
        if po['status'] == 'received':
            self.on_order.pop(po_id, None)
        if rng.random() < 0.15:  # something arrived damaged or wrong and goes back
            self.schedule(day + timedelta(days=1), self.give_back, po_id)
        if po['status'] == 'received':
            self.schedule_payment(day, po)

    def give_back(self, day, po_id):
        po = call('get', f'/api/purchase-orders/{po_id}')
        lines = [it for it in (po or {}).get('items', []) if it['receivedQuantity'] > 0]
        if not lines:
            return
        it = rng.choice(lines)
        qty = min(it['receivedQuantity'], 1 if it.get('unit') != 'yd' else rng.choice([2, 3, 4, 5]))
        replace = rng.random() < 0.6
        at(day, 11, rng.randint(0, 59))
        po = call('post', f'/api/purchase-orders/{po_id}/return', {
            'items': [{'line': it['line'], 'quantity': qty}], 'reason': rng.choice(RETURN_REASONS), 'replacement': replace,
            'documentNumber': f'RS-{rng.randint(1000, 9999)}', 'notes': '',
            **({'expectedReplacement': (day + timedelta(days=5)).isoformat()} if replace else {})})
        if not po:
            return
        self.counts['returns'] += 1
        if replace:
            self.schedule(day + timedelta(days=rng.randint(4, 7)), self.deliver, po_id, False)

    def schedule_payment(self, day, po):
        """Pay by the term: on or a little before the due date; some late, the newest not yet."""
        term_days = po.get('paymentTermDays') or (0 if po.get('paymentTerm') in ('cod', 'advance') else 30)
        if not term_days:
            self.schedule(day, self.pay_supplier, po['id'])
            return
        due = day + timedelta(days=term_days)
        pay_on = due - timedelta(days=rng.randint(0, 5)) if rng.random() < 0.8 else due + timedelta(days=rng.randint(3, 12))
        self.schedule(max(pay_on, day + timedelta(days=1)), self.pay_supplier, po['id'])

    def pay_supplier(self, day, po_id):
        po = call('get', f'/api/purchase-orders/{po_id}')
        if not po or po['payableBalance'] <= 0:
            return
        at(day, 15, rng.randint(0, 59))
        method = rng.choice(['bank_transfer', 'bank_transfer', 'check', 'cash'])
        ref = {'bank_transfer': f'BDO-{rng.randint(100000, 999999)}', 'check': f'CHK-{rng.randint(10000, 99999)}',
               'cash': f'OR-{rng.randint(1000, 9999)}'}[method]
        if call('post', f'/api/purchase-orders/{po_id}/payments', {
                'amount': po['payableBalance'], 'paymentDate': day.isoformat(), 'paymentMethod': method,
                'referenceNumber': ref, 'notes': ''}):
            self.counts['supplier_payments'] += 1

    # Job orders -----------------------------------------------------------------
    def pick(self, pool, qty, weights=None, spare=1):
        # Some spare, since jobs taken before this one may cut from the same roll first
        pool = [x for x in pool if self.stock(x.id) >= qty + spare]
        if not pool:
            return None
        return rng.choices(pool, weights=[(weights or {}).get(x.id, 1) for x in pool])[0]

    def new_job_order(self, day, shop):
        name, cphone = self.customer()
        services = rng.choice(SERVICES)
        lines = []

        def add(mat, qty):
            mat = db.session.get(m.InventoryMaterial, mat.id)
            lines.append({'name': mat.material_type, 'category': 'material', 'materialId': mat.id, 'quantity': qty,
                          'unitPrice': float(mat.unit_price), 'materialCost': float(mat.unit_price), 'laborCost': 0})

        if services != 'flooring':
            qty = 4 if rng.random() < 0.85 else rng.choice([3, 5])  # normally 4 yd
            main = self.pick(self.covers, qty, self.weights)
            if not main:
                return
            add(main, qty)
            if main.material_type.endswith('-PLAIN') and rng.random() < 0.3 and self.tricot:
                foam = self.pick(self.tricot, qty)
                if foam:
                    add(foam, qty)
        if 'flooring' in services and self.matting:
            floor = self.pick(self.matting, 3, spare=7)
            if floor:
                add(floor, 3)
        if not lines:
            return
        materials = sum(it['quantity'] * it['unitPrice'] for it in lines)
        labor = rng.choice([2500, 3000, 3500, 4000, 4500]) + (2500 if services.startswith('reupholstery') else 0)
        price = round((materials * rng.uniform(2.4, 3.0) + labor) / 100) * 100
        make, model = rng.choice(VEHICLES)
        vehicle = ({'make': 'Reupholstery', 'model': 'Sofa', 'year': day.year, 'plateNumber': ''}
                   if services.startswith('reupholstery') else
                   {'make': make, 'model': model, 'year': rng.randint(2012, 2025),
                    'plateNumber': f"{''.join(rng.choice('ABCDEFGHJKLMNPRTUVWXYZ') for _ in range(3))} "
                                   f"{rng.randint(1000, 9999)}"})
        down = money(price * (1 if rng.random() < 0.1 else 0.5))
        at(day, rng.randint(9, 16), rng.randint(0, 59))
        token = self.clerk(shop.id)
        jo = call('post', '/api/sales/job-orders', {
            'customerName': name, 'customerPhone': cphone, 'customerEmail': '', 'branchId': shop.id,
            'description': services, 'vehicleInfo': vehicle, 'items': lines,
            'estimatedCompletion': (day + timedelta(days=rng.randint(4, 8))).isoformat(),
            'downPayment': down, 'paymentMethod': rng.choice(['cash', 'cash', 'gcash', 'bank_transfer']),
            'notes': '', 'priority': rng.choice(['normal'] * 6 + ['high', 'urgent']), 'discountPercent': 0,
            'vatIncluded': True, 'priceForWork': price, 'estimatedCost': price,
            'slipData': {'serviceDetails': {}}}, as_token=token)
        if not jo:
            return
        self.counts['jo'] += 1
        self.premade_due += 1 / rng.uniform(8, 10)
        if rng.random() < 0.03:  # the customer backs out
            self.schedule(day + timedelta(days=1), self.cancel, jo['id'], token)
            return
        self.schedule(day + timedelta(days=rng.randint(0, 1)), self.start_job, jo['id'], jo['jobOrderId'],
                      services, token)

    def cancel(self, day, jo_id, token):
        at(day, 10)
        if call('put', f'/api/sales/job-orders/{jo_id}', {'status': 'cancelled'}, as_token=token):
            self.counts['cancelled'] += 1

    def assign(self, day, trade, jo_id, ref, task, offset_days):
        worker = rng.choice(self.trades[trade])
        res = call('post', '/api/worker-assignments', {
            'workerId': worker.id, 'jobOrderRef': ref, 'jobOrderDbId': jo_id, 'description': task,
            'scheduledDate': (day + timedelta(days=offset_days)).isoformat()})
        return res['assignment']['id'] if res else None

    def start_job(self, day, jo_id, ref, services, token):
        at(day, 9, rng.randint(0, 59))
        tasks = [('cut', 'Cutting', 0)]
        if services != 'flooring':
            tasks.append(('sew', 'Sewing', 1))
        tasks.append(('install', 'Installation', 2))
        ids = [(t, self.assign(day, t, jo_id, ref, name, off)) for t, name, off in tasks]
        ids = [(t, a) for t, a in ids if a]
        call('put', f'/api/sales/job-orders/{jo_id}', {'status': 'in_progress'})
        if not ids:
            return
        self.schedule(day, self.work, jo_id, ids, services, token)

    def consumable(self, name, kind=None, qty=1):
        c = self.mat(name)
        if not c:
            return []
        on_hand = self.stock(c.id)
        kind = kind or ('full' if on_hand >= qty and rng.random() < 0.4 else 'partial')
        if kind == 'full' and on_hand < qty:
            kind = 'partial'
        return [{'materialId': c.id, 'kind': kind, **({'quantity': qty} if kind == 'full' else {})}]

    def work(self, day, jo_id, tasks, services, token):
        """Finish the next task on the job order, then schedule the one after."""
        trade, aid = tasks[0]
        start_h = rng.randint(8, 11)
        at(day, start_h, rng.randint(0, 59))
        call('put', f'/api/worker-assignments/{aid}', {'status': 'in_progress'})
        body = {'status': 'completed'}
        if trade == 'cut':
            info = call('get', f'/api/worker-assignments/{aid}/cut-materials')
            cuts = []
            for line in (info or {}).get('materials', []):
                planned = float(line['plannedQuantity'])
                cut = planned + (1 / 3 if rng.random() < 0.1 else 0)  # sometimes a foot extra
                used = cut - rng.choice([0, 0, 0, 1 / 6, 1 / 3, 1 / 3, 1 / 18])  # 0, 6 in, 1 ft, 2 in left over
                cuts.append({'line': line['line'], 'materialId': line['options'][0]['id'],
                             'cut': round(cut, 4), 'used': round(max(used, 0), 4)})
            body.update(materialCuts=cuts, hoursWorked=rng.choice([1.5, 2, 2.5, 3]),
                        consumables=self.consumable('SILVER SIGN PEN (drawing) per pc', 'partial')
                        if rng.random() < 0.3 else [])
            self.counts['cuts'] += len(cuts)
        elif trade == 'sew':
            used = self.consumable('NYLON THREAD #69 (cone)')
            if services.startswith('reupholstery'):
                used += self.consumable('FIBERFILL', 'full', 2) + self.consumable('URATEX 1/2X44x80', 'full', 1)
            body.update(hoursWorked=rng.choice([3, 4, 4.5, 5, 6]), consumables=used)
        else:
            used = self.consumable('SUPER-DIKIT-CEMENT') if rng.random() < 0.5 else []
            used += self.consumable('HOG RINGS (box)') if services != 'flooring' and rng.random() < 0.5 else []
            used += self.consumable('UPHOLSTERY STAPLES 1013J (box)') if rng.random() < 0.3 else []
            body.update(hoursWorked=rng.choice([2, 2.5, 3, 4]), consumables=used)
        at(day, min(start_h + int(body['hoursWorked']) + 1, 18), rng.randint(0, 59))
        if not call('put', f'/api/worker-assignments/{aid}', body):
            # Short of stock to cut: the task waits for the next delivery
            self.schedule(day + timedelta(days=3), self.work, jo_id, tasks, services, token)
            return
        if len(tasks) > 1:
            self.schedule(day + timedelta(days=rng.randint(1, 2)), self.work, jo_id, tasks[1:], services, token)
        else:
            self.schedule(day + timedelta(days=rng.randint(0, 1)), self.complete_job, jo_id, token)

    def complete_job(self, day, jo_id, token):
        # The balance is settled when the customer picks up the car, then the job is closed
        at(day, rng.randint(15, 17), rng.randint(0, 59))
        db.session.expire_all()
        order = db.session.get(m.JobOrder, jo_id)
        balance = money(float(order.total_price or 0) - float(order.down_payment or 0))
        if balance > 0:
            call('post', '/api/payments', {'jobOrderId': jo_id, 'amount': balance,
                                           'paymentMethod': rng.choice(['cash', 'cash', 'gcash', 'bank_transfer']),
                                           'notes': 'Balance paid on release'}, as_token=token)
        Clock.now += timedelta(minutes=5)
        if call('put', f'/api/sales/job-orders/{jo_id}', {'status': 'completed'}, as_token=token):
            self.counts['jo_done'] += 1

    # Premade --------------------------------------------------------------------
    def produce(self, day, product_name, shop_id, pieces=1):
        """Make pieces at the warehouse (4 yd of leatherette + fiber each) and send them to a shop."""
        p = self.premade.get(product_name)
        if not p:
            return
        main = self.pick([x for x in self.covers if self.weights[x.id] >= 5], 4 * pieces, self.weights)
        fiber = self.mat('FIBERCOTTON (per kg)')
        if not main:
            return
        used = [{'materialId': main.id, 'quantityUsed': 4 * pieces}]
        mat_cost = float(main.cost_per_unit or 0) * 4
        if fiber and self.stock(fiber.id) >= pieces:
            used.append({'materialId': fiber.id, 'quantityUsed': pieces})
            mat_cost += float(fiber.cost_per_unit or 0)
        cost = money(mat_cost + rng.choice([1800, 2000, 2200, 2500]))  # materials + sewing labor per piece
        at(day, 10, rng.randint(0, 59))
        res = call('post', '/api/inventory/finished-goods', {
            'existingProductId': p.id, 'quantity': pieces, 'branchId': shop_id, 'materialsUsed': used, 'cost': cost},
            raw=True)
        if not res:
            return
        self.counts['premade_made'] += pieces
        transfer = res.get('pendingTransfer') if isinstance(res, dict) else None
        if transfer:
            self.schedule(day + timedelta(days=rng.randint(1, 2)), self.receive_premade, transfer['id'], shop_id)

    def receive_premade(self, day, transfer_id, shop_id):
        at(day, 11, rng.randint(0, 59))
        call('post', f'/api/inventory/premade-transfers/{transfer_id}/confirm', as_token=self.clerk(shop_id))

    def stock_premade(self, day):
        """Opening premade stock: one piece of each best seller at each shop."""
        for i, name in enumerate(PREMADE_STARTERS):
            for shop in self.shops:
                if (i + shop.id) % 2 == 0:
                    self.produce(day, name, shop.id)

    def premade_sale(self, day):
        rows = m.PremadeProduct.query.filter(m.PremadeProduct.branch_id != self.warehouse.id,
                                             m.PremadeProduct.is_archived.is_(False),
                                             m.PremadeProduct.quantity >= 1).all()
        if not rows:
            return False
        p = rng.choice(rows)
        name, cphone = self.customer()
        method = rng.choice(['cash', 'cash', 'gcash', 'bank_transfer'])
        at(day, rng.randint(10, 17), rng.randint(0, 59))
        token = self.clerk(p.branch_id)
        order = call('post', '/api/product-orders', {
            'customerName': name, 'customerPhone': cphone, 'branchId': p.branch_id,
            'items': [{'productId': p.id, 'quantity': 1}], 'paymentAmount': float(p.price),
            'paymentMethod': method,
            'notes': f'Order Source: {rng.choice(SOURCES)}\nPayment Method: {method}'}, as_token=token)
        if not order:
            return False
        Clock.now += timedelta(minutes=rng.randint(5, 30))
        call('put', f"/api/product-orders/{order['id']}", {'status': 'completed'}, as_token=token)
        self.counts['premade_sales'] += 1
        # The warehouse makes a replacement for that shop
        self.schedule(day + timedelta(days=rng.randint(4, 10)), self.produce, p.name, p.branch_id)
        return True

    # Expenses -------------------------------------------------------------------
    def expense(self, day, branch, category, particulars, amount, method='cash', ref=None):
        at(day, 16, rng.randint(0, 59))
        if call('post', '/api/expenses', {'date': day.isoformat(), 'category': category, 'particulars': particulars,
                                          'amount': money(amount), 'paymentMethod': method, 'branchId': branch.id,
                                          'referenceNumber': ref}):
            self.counts['expenses'] += 1

    def month_expenses(self, day):
        month = day.strftime('%B')
        hot = day.month in (3, 4, 5, 6)  # summer: more aircon
        for b in [self.warehouse] + self.shops:
            rent = next((v for k, v in EXPENSES.items() if k.lower() in b.name.lower()), 30000)
            self.expense(day, b, 'Rent', f'{month} rent', rent, 'bank_transfer', f'BDO-{rng.randint(100000, 999999)}')
            self.expense(day + timedelta(days=9), b, 'Internet & Phone', f'{month} internet (PLDT)',
                         2499 if b.is_warehouse else 1699, 'gcash')
            self.expense(day + timedelta(days=14), b, 'Electricity', f'Meralco bill ({month})',
                         rng.randint(9000, 15000) * (1.3 if hot else 1) if b.is_warehouse else
                         rng.randint(4500, 8000) * (1.3 if hot else 1), 'gcash')
            self.expense(day + timedelta(days=16), b, 'Water', f'Water bill ({month})', rng.randint(700, 1600), 'cash')
        self.expense(day + timedelta(days=4), self.warehouse, 'Marketing', f'Facebook page ads ({month})',
                     rng.choice([2000, 2500, 3000, 3500]), 'credit_card')

    def payday(self, day):
        """Sales staff salaries, 15th and end of month, per shop."""
        for b in self.shops:
            people = min(len(self.staff.get(b.id, [])), 2) or 1
            self.expense(day, b, 'Salaries & Wages', f'Staff salary ({day:%b} {day.day})', 8000 * people, 'cash')

    def odd_costs(self, day):
        if rng.random() < 0.5:
            b = rng.choice(self.shops)
            self.expense(day, b, 'Transportation', 'Lalamove delivery of stock from the warehouse',
                         rng.randint(350, 900), 'gcash')
        if rng.random() < 0.06:
            b = rng.choice([self.warehouse] + self.shops)
            what = rng.choice(['Sewing machine repair', 'Staple gun repair', 'Aircon cleaning', 'Electric fan repair'])
            self.expense(day, b, 'Repairs & Maintenance', what, rng.randint(800, 3500), 'cash')
        if rng.random() < 0.1:
            b = rng.choice(self.shops)
            self.expense(day, b, 'Supplies', rng.choice(['Office supplies (receipts, pens)', 'Cleaning supplies',
                                                         'Plastic bags and packaging']),
                         rng.randint(250, 1200), 'cash')

    # Loop -----------------------------------------------------------------------
    def run(self, start, end):
        day = start
        self.stock_premade(day)
        while day <= end:
            wd = day.weekday()
            if day.day == 1:
                self.month_expenses(day)
            if day.day == 15 or (day + timedelta(days=1)).day == 1:
                self.payday(day)
            if wd == 0:
                self.restock(day)
            if wd < 6:  # Mon-Sat
                for shop in self.shops:
                    # About 2-3 jobs a day across the four shops, a bit busier on Saturdays
                    for _ in range(rng.choice([0, 1, 1] + ([1, 2] if wd == 5 else []))):
                        self.new_job_order(day, shop)
                while self.premade_due >= 1:
                    self.premade_due -= 1
                    if not self.premade_sale(day):
                        break
                self.odd_costs(day)
            # Due follow-ups (deliveries, tasks, completions, payments) up to today.
            # Closed on Sundays: what falls then is done on Monday.
            while wd < 6:
                due = sorted((e for e in self.events if e[0] <= day), key=lambda e: (e[0], e[1]))
                if not due:
                    break
                self.events.remove(due[0])
                due[0][2](day, *due[0][3])
            if day.day == 1:
                print(f'  {day:%b %Y}: {self.counts}', flush=True)
            day += timedelta(days=1)
        print(f'History: {self.counts}')


def recompute_ai():
    Clock.now = _real_datetime.utcnow()
    m.datetime = _real_datetime
    cache = m.AIPredictionCache.query.first()
    if not cache:
        cache = m.AIPredictionCache(status='computing', predictions_json='[]')
        db.session.add(cache)
    # Keep the record of the uploaded history (it was not wiped)
    rows = m.HistoricalInventoryData.query.count()
    if rows:
        cache.upload_rows = rows
        cache.upload_items = db.session.query(m.HistoricalInventoryData.item_id).distinct().count()
        cache.last_uploaded_at = db.session.query(db.func.max(m.HistoricalInventoryData.uploaded_at)).scalar()
    cache.status = 'computing'
    db.session.commit()
    m._run_predictions_background(app)
    db.session.expire_all()
    cache = m.AIPredictionCache.query.first()
    import json as _json
    preds = _json.loads(cache.predictions_json or '[]')
    tested = [p for p in preds if p.get('errorPercent') is not None]
    methods = {}
    for p in preds:
        methods[p['method']] = methods.get(p['method'], 0) + 1
    live = [p for p in preds if p.get('dataSource') in ('live', 'hybrid')]
    print(f"AI: status={cache.status}, {len(preds)} items forecast, {len(tested)} with a tested error, "
          f"{len(live)} using live usage, methods={methods}")


if __name__ == '__main__':
    with app.app_context():
        m.init_db()
        start = _real_datetime.strptime(args.start, '%Y-%m-%d').date()
        end = (_real_datetime.strptime(args.end, '%Y-%m-%d').date() if args.end
               else (_real_datetime.utcnow() + timedelta(hours=8)).date())
        target = args.database_url.split('@')[-1] if args.database_url else os.path.abspath(args.db)
        if not args.yes and input(f'Wipe and rebuild {target} ({start} to {end})? Type yes: ').strip() != 'yes':
            sys.exit('Stopped.')
        admin = m.User.query.join(m.Role, m.User.role_id == m.Role.id).filter(m.Role.key == 'administrator').first()
        USERS[ADMIN_TOKEN] = m.user_to_dict(admin)
        m.get_user_from_token = lambda t: USERS.get(t)
        at(start, 7)
        names = wipe()
        warehouse = setup_inventory(admin)
        Sim(admin, warehouse, names).run(start, end)
        recompute_ai()
        if errors:
            kinds = {}
            for e in errors:
                k = e.split(': ', 1)[-1]
                kinds[k] = kinds.get(k, 0) + 1
            print('Refused, by kind:', kinds)
            print(f'{len(errors)} requests were refused; first ones:')
            for e in errors[:30]:
                print('  ', e)
