"""
Tidy the inventory and generate realistic demo history (June 1 - Nov 15, 2026).

1. Inventory: every material gets a supplier (by what each supplier actually
   sells), a cost and selling price at Philippine market levels, an item ID and a
   reorder level. Consumables (cement, thread, staples, fiberfill, foam sheets,
   mats...) are marked with their count unit, and a few common ones are added.
2. History: day by day, through the app's own API with a simulated clock, so
   every rule, stock movement and log is exactly what real use would leave:
   purchase orders (n/30 terms, invoice nos., partial deliveries, returns,
   replacements, supplier payments), job orders (mostly 4 yd of a material),
   worker tasks with cut / used amounts and cutting excess, consumables used,
   customer payments. Then the AI forecasts are recomputed.

Generated records are marked: customers and suppliers created here end in
" (demo)" in their notes, invoice numbers start with "DEMO-", and job orders /
POs carry "[demo]" in their notes, so they can be told apart from real data.

Usage (back up the database first!):
  venv/Scripts/python.exe seed_demo_history.py --db path/to/copy.db      # a SQLite file
  venv/Scripts/python.exe seed_demo_history.py --database-url postgres://...  # e.g. Neon
Add --inventory-only to run step 1 alone.
"""
import argparse
import os
import random
import sys
from datetime import datetime as _real_datetime, timedelta

parser = argparse.ArgumentParser()
parser.add_argument('--db', help='SQLite database file to change')
parser.add_argument('--database-url', help='Database URL to change (instead of --db)')
parser.add_argument('--start', default='2026-06-01')
parser.add_argument('--end', default='2026-11-15')
parser.add_argument('--seed', type=int, default=2026)
parser.add_argument('--inventory-only', action='store_true')
args = parser.parse_args()
if not args.db and not args.database_url:
    sys.exit('Give --db or --database-url')
os.environ['DATABASE_URL'] = args.database_url or ('sqlite:///' + os.path.abspath(args.db).replace('\\', '/'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app as m  # noqa: E402
from sqlalchemy import event  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

rng = random.Random(args.seed)
DEMO = '[demo]'


# ── Simulated clock ─────────────────────────────────────────────────────────────
class Clock:
    now = _real_datetime(2026, 6, 1, 1, 0)  # UTC (9 AM in the Philippines)


class FakeDateTime(_real_datetime):
    @classmethod
    def utcnow(cls):
        return Clock.now

    @classmethod
    def now(cls, tz=None):
        return Clock.now + timedelta(hours=8) if tz is None else _real_datetime.now(tz)


m.datetime = FakeDateTime


# Model defaults captured the real clock (datetime.utcnow): give new and changed rows
# the simulated time. SQLAlchemy wraps the callables, so they're matched by name.
def _is_clock(arg):
    return callable(arg) and getattr(arg, '__name__', '') in ('utcnow', 'now')


@event.listens_for(Session, 'before_flush')
def _stamp_by_name(session, _ctx, _instances):
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


# No background threads while generating (they'd write to the database meanwhile)
m.queue_forecast_refresh = lambda *a, **k: None

app, db = m.app, m.db
client = app.test_client()
H = {'Authorization': 'Bearer seed'}
errors = []


def call(method, url, body=None, ok=(200, 201)):
    r = getattr(client, method)(url, headers=H, json=body)
    data = r.get_json(silent=True) or {}
    if r.status_code not in ok:
        errors.append(f"{Clock.now:%Y-%m-%d} {method.upper()} {url}: {r.status_code} {data.get('message') or data.get('error')}")
        return None
    return data.get('data', data)


def at(day, hour=9, minute=0):
    """A Philippine local date and hour as the simulated UTC clock."""
    Clock.now = _real_datetime(day.year, day.month, day.day, hour, minute) - timedelta(hours=8)


def money(v):
    return round(v + 1e-9, 2)


# ── 1. Inventory ────────────────────────────────────────────────────────────────
# What each supplier sells (Philippine automotive upholstery trade):
#   BIFFANY / TRIGOLDEN  synthetic leather (leatherette / PVC vinyl), plain rolls
#   URATEX RNC           foam lamination of leatherette (LAM14 = 1/4", LAM18 = 1/8"), tricot
#   URATEX RGC           foam sheets
#   GRECO                premium synthetic leather (PU)
#   FMI                  fiberfill and fiber cotton (per kg)
#   JOAQUIN              sewing and installation supplies (cement, thread, velcro, staples)
#   TYE=STAR STOCKIST    car mattings and rubber mat sets
#   SHOPEE               small tools bought online (marking pens, needles, chalk)
#   Divisoria Upholstery Fabrics (demo)  upholstery fabrics: velvet, suede, microfiber, fabric, canvas
SUPPLIER_TERMS = {  # default payment term per supplier
    'BIFFANY': ('net', 30), 'TRIGOLDEN': ('net', 15), 'URATEX RNC': ('net', 30), 'URATEX RGC': ('net', 30),
    'GRECO': ('net', 30), 'FMI': ('cod', None), 'JOAQUIN': ('cod', None), 'TYE=STAR STOCKIST': ('net', 15),
    'SHOPEE': ('advance', None), 'Divisoria Upholstery Fabrics': ('net', 30),
}
# Per-yard cost range (PHP) and markup for the generic material groups
GROUP_PRICES = {
    'Vinyl': ((175, 240), 35, 'TRIGOLDEN'),
    'Leather': ((380, 560), 35, 'GRECO'),          # PU leather by the yard
    'Microfiber': ((220, 320), 35, 'Divisoria Upholstery Fabrics'),
    'Suede': ((280, 420), 35, 'Divisoria Upholstery Fabrics'),
    'Velvet': ((210, 330), 35, 'Divisoria Upholstery Fabrics'),
    'Fabric': ((160, 260), 35, 'Divisoria Upholstery Fabrics'),
    'Canvas': ((120, 190), 35, 'Divisoria Upholstery Fabrics'),
}
# Real items that are consumables: name -> (unit, reorder level)
REAL_CONSUMABLES = {
    'SUPER-DIKIT-CEMENT': ('cans', 3), 'GLUE Carpet': ('packs', 20), 'Glue': ('cans', 3),
    'SILVER SIGN PEN (drawing) per pc': ('pcs', 30), 'MAGIC TAPE (lalaki)': ('rolls', 5),
    'FIBERFILL': ('kg', 25), 'FIBERCOTTON (per kg)': ('kg', 10), 'URATEX 1/2X44x80': ('sheets', 6),
    'Wood': ('pcs', 5),
}
NEW_CONSUMABLES = [  # name, unit, cost, supplier, starting stock, reorder
    ('NYLON THREAD #69 (cone)', 'cones', 165.0, 'JOAQUIN', 24, 8),
    ('UPHOLSTERY STAPLES 1013J (box)', 'boxes', 210.0, 'JOAQUIN', 15, 5),
    ('HOG RINGS (box)', 'boxes', 185.0, 'JOAQUIN', 10, 4),
    ('SEWING NEEDLES DPx17 (pack)', 'packs', 120.0, 'SHOPEE', 12, 4),
    ('TAILOR CHALK (pc)', 'pcs', 15.0, 'SHOPEE', 40, 15),
]


def label(mat):
    return ' - '.join(filter(None, [mat.material_type, mat.color, mat.pattern]))


def real_supplier_for(name):
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


def setup_inventory():
    admin = m.User.query.join(m.Role, m.User.role_id == m.Role.id).filter(m.Role.key == 'administrator').first()
    m.get_user_from_token = lambda _t: m.user_to_dict(admin)
    warehouse = m.Branch.query.filter_by(is_warehouse=True).first()

    suppliers = {s.name: s for s in m.Supplier.query.all()}
    if 'Divisoria Upholstery Fabrics' not in suppliers:
        s = m.Supplier(name='Divisoria Upholstery Fabrics', contact_person='Sales desk',
                       email='orders@divisoria-fabrics.example', address='Divisoria, Manila',
                       notes=f'{DEMO} upholstery fabrics supplier', is_active=True)
        db.session.add(s)
        db.session.flush()
        suppliers[s.name] = s
    for name, (term, days) in SUPPLIER_TERMS.items():
        if name in suppliers:
            suppliers[name].payment_term, suppliers[name].payment_term_days = term, days

    used_ids = {mm.item_id for mm in m.InventoryMaterial.query.filter(m.InventoryMaterial.item_id.isnot(None)).all()}

    def new_item_id(base):
        base = ''.join(ch for ch in base.upper() if ch.isalnum() or ch in '-/')[:40] or 'ITEM'
        cand, i = base, 2
        while cand in used_ids:
            cand, i = f'{base[:36]}-{i}', i + 1
        used_ids.add(cand)
        return cand

    changed = 0
    for mat in m.InventoryMaterial.query.filter_by(is_archived=False).all():
        group = GROUP_PRICES.get(mat.material_type)
        if group and mat.item_id:  # generic materials (linked to the AI history)
            (lo, hi), markup, sup = group
            cost = float(rng.randrange(lo, hi + 1, 5))
            mat.cost_per_unit, mat.markup_percent = cost, markup
            mat.unit_price = money(cost * (1 + markup / 100))
            mat.supplier_id = suppliers[sup].id
            mat.low_stock_threshold = 15
            m.apply_consumable_fields(mat, {'isConsumable': False})
        elif mat.material_type in ('Fabric red', 'Fabric Blue'):
            mat.color = mat.material_type.split()[-1].capitalize()
            mat.material_type, mat.pattern = 'Fabric', 'Plain'
            mat.cost_per_unit, mat.markup_percent = 185.0, 35
            mat.unit_price = money(185 * 1.35)
            # Keep a supplier already chosen for it
            mat.supplier_id = mat.supplier_id or suppliers['Divisoria Upholstery Fabrics'].id
            mat.low_stock_threshold = 15
            mat.item_id = mat.item_id or new_item_id(f'FAB-{mat.color}')
            m.apply_consumable_fields(mat, {'isConsumable': False})
        else:  # the real stock-in items
            name = mat.material_type
            sup = suppliers.get(real_supplier_for(name))
            if sup and not mat.supplier_id:
                mat.supplier_id = sup.id
            if not mat.cost_per_unit:
                mat.cost_per_unit = round(float(mat.unit_price or 0) / 1.25, 2)
            if name == 'Glue':
                mat.material_type, mat.cost_per_unit, mat.markup_percent = 'RUGBY CONTACT CEMENT 1L', 320.0, 25
            if name == 'Wood':
                mat.material_type, mat.cost_per_unit, mat.markup_percent = 'MARINE PLYWOOD 1/4 (cut piece)', 240.0, 25
            mat.unit_price = money(float(mat.cost_per_unit) * (1 + float(mat.markup_percent or 25) / 100))
            if name in REAL_CONSUMABLES:
                unit, reorder = REAL_CONSUMABLES[name]
                m.apply_consumable_fields(mat, {'isConsumable': True, 'unit': unit})
                mat.low_stock_threshold = reorder
            else:
                m.apply_consumable_fields(mat, {'isConsumable': False})
                big = name.startswith(('SHBLK', 'PRES', 'PERFO'))
                mat.low_stock_threshold = 60 if big else 20
            mat.item_id = mat.item_id or new_item_id(mat.sku and name.split(' (')[0] or name)
        changed += 1

    for name, unit, cost, sup, stock, reorder in NEW_CONSUMABLES:
        if m.InventoryMaterial.query.filter_by(material_type=name).first():
            continue
        mat = m.InventoryMaterial(material_type=name, color='', pattern='', cost_per_unit=cost, markup_percent=25,
                                  unit_price=money(cost * 1.25), stock_quantity=stock, low_stock_threshold=reorder,
                                  branch_id=warehouse.id, is_archived=False, status='available',
                                  supplier_id=suppliers[sup].id, item_id=new_item_id(name.split(' (')[0]))
        m.apply_consumable_fields(mat, {'isConsumable': True, 'unit': unit})
        db.session.add(mat)
        db.session.flush()
        m.log_stock_adjustment('material', mat.id, mat.branch_id, 'starting', None, stock, m.user_to_dict(admin))

    # Each supplier's "materials supplied" text
    db.session.flush()
    for s in suppliers.values():
        names = [label(x) for x in m.InventoryMaterial.query.filter_by(supplier_id=s.id, is_archived=False)
                 .order_by(m.InventoryMaterial.material_type).all()]
        if names:
            groups = sorted({n.split(' - ')[0] for n in names})
            s.materials_supplied = ', '.join(groups)[:5000]
        elif s.materials_supplied and not m.InventoryMaterial.query.filter_by(supplier_id=s.id).first():
            s.materials_supplied = None  # nothing in Inventory points to it any more
    db.session.commit()
    print(f'Inventory: {changed} materials updated, consumables added, suppliers mapped.')
    return admin, warehouse


# ── 2. History ──────────────────────────────────────────────────────────────────
FIRST = ['Juan', 'Maria', 'Jose', 'Ana', 'Mark', 'Kristine', 'Paolo', 'Liza', 'Ramon', 'Grace', 'Carlo', 'Joy',
         'Miguel', 'Rhea', 'Arnel', 'Celia', 'Dennis', 'Lorna', 'Jerome', 'Aileen', 'Rodel', 'Marites', 'Noel', 'Bea']
LAST = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres', 'Villanueva', 'Ramos', 'Aquino',
        'Navarro', 'Castillo', 'Flores', 'Domingo', 'Pascual', 'Fernandez', 'Lopez', 'Gonzales']
VEHICLES = [('Toyota', 'Vios'), ('Toyota', 'Innova'), ('Toyota', 'Hilux'), ('Mitsubishi', 'Mirage G4'),
            ('Mitsubishi', 'Montero Sport'), ('Honda', 'City'), ('Honda', 'Civic'), ('Nissan', 'Navara'),
            ('Ford', 'Ranger'), ('Suzuki', 'Ertiga'), ('Isuzu', 'D-Max'), ('Hyundai', 'Accent'), ('Toyota', 'Fortuner')]
SERVICES = ['seat_covers', 'seat_covers', 'seat_covers', 'flooring', 'ceiling', 'sidings', 'seat_covers, flooring',
            'seat_covers, sidings', 'reupholstery (sofa)']
WORKERS = [('Nikko', 'Cutter', 'per_piece', 100.0), ('Ramon Dizon', 'Sewer', 'per_piece', 150.0),
           ('Jun Abad', 'Upholstery', 'per_day', 650.0), ('Carlo Bernal', 'Installer', 'per_piece', 120.0)]
RETURN_REASONS = ['Damaged', 'Bad quality', 'Wrong color / pattern', 'Wrong item']
# How often each best seller is picked (weight); the black leatherettes lead
BEST_SELLERS = {'SHBLK-PLAIN': 40, 'SHBLK-LAM18': 30, 'PRES10312-PLAIN': 20, 'SHBLK-LAM14': 10, 'PRESBLK-PLAIN': 8,
                'PERFOBLK-LAM14': 8, 'MAD016-LAM14': 6, 'MAD016-PLAIN': 6, 'NYLEXBLK-PLAIN': 6, 'GRECO-PREMIUM': 6}


def ensure_workers():
    out = {}
    for name, kind, mode, rate in WORKERS:
        w = m.ManagedWorker.query.filter_by(name=name).first()
        if not w:
            w = m.ManagedWorker(name=name, work_type=kind, pay_mode=mode, rate_per_hour=rate, is_active=True)
            db.session.add(w)
            db.session.flush()
        out[kind] = w
    db.session.commit()
    return out


class Sim:
    def __init__(self, admin, warehouse):
        self.admin, self.warehouse = admin, warehouse
        self.events = []      # (datetime, seq, fn, args)
        self.seq = 0
        self.customers = [(f'{rng.choice(FIRST)} {rng.choice(LAST)}', '0999' + ''.join(rng.choice('0123456789') for _ in range(7)))
                          for _ in range(70)]
        self.shops = [b.id for b in m.Branch.query.filter_by(is_warehouse=False, is_active=True).all()]
        self.workers = ensure_workers()
        self.invoice_no = 10000
        self.counts = {'jo': 0, 'jo_done': 0, 'cancelled': 0, 'po': 0, 'returns': 0, 'payments': 0, 'cuts': 0}
        # Materials job orders use: lengths at the warehouse; the real leatherettes most
        mats = m.InventoryMaterial.query.filter(m.InventoryMaterial.is_archived.is_(False),
                                                m.InventoryMaterial.branch_id == warehouse.id).all()
        self.lengths = [x for x in mats if not x.is_consumable]
        self.consumables = [x for x in mats if x.is_consumable]
        # A shop leans on a few best sellers: those most, other leatherettes some,
        # the generic fabrics in common colors now and then
        self.weights = {x.id: (BEST_SELLERS.get(x.material_type)
                               or (1.5 if x.material_type.startswith(('SHBLK', 'PRES', 'PERFO', 'MAD', 'NYLEX', 'GRECO'))
                                   else 0.6 if x.color in ('Black', 'Gray', 'Beige') and x.pattern == 'Plain' else 0.05))
                        for x in self.lengths}

    def schedule(self, when, fn, *a):
        self.seq += 1
        self.events.append((when, self.seq, fn, a))

    # Purchase orders ------------------------------------------------------------
    def restock(self, day):
        """Monday: order what is at or near its reorder level, one PO per supplier."""
        need = {}
        for mat in m.InventoryMaterial.query.filter(m.InventoryMaterial.is_archived.is_(False),
                                                    m.InventoryMaterial.branch_id == self.warehouse.id).all():
            if not mat.supplier_id:
                continue
            reorder = float(mat.low_stock_threshold or 0)
            if float(mat.stock_quantity or 0) <= reorder * 1.3 and (self.weights.get(mat.id, 0) >= 1.5 or mat.is_consumable):
                qty = max(reorder * 3 - float(mat.stock_quantity or 0), reorder * 2)
                qty = round(qty) if mat.is_consumable else round(qty / 5) * 5 or 10
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
            at(day, 14)
            call('post', f"/api/purchase-orders/{po['id']}/approve")
            arrive = day + timedelta(days=rng.randint(2, 5))
            partial = rng.random() < 0.12
            self.schedule(arrive, self.deliver, po['id'], partial)

    def deliver(self, day, po_id, partial):
        po = call('get', f'/api/purchase-orders/{po_id}')
        if not po or po['status'] not in ('approved', 'partially_received'):
            return
        open_lines = [it for it in po['items'] if it['remainingQuantity'] > 0]
        items = []
        for it in open_lines:
            q = it['remainingQuantity']
            if partial:
                q = round(q * 0.6) if it.get('unit') != 'yd' else round(q * 0.6, 1)
            if q > 0:
                items.append({'line': it['line'], 'quantity': q})
        if not items:
            return
        self.invoice_no += rng.randint(1, 40)
        at(day, rng.randint(9, 15), rng.randint(0, 59))
        po = call('post', f'/api/purchase-orders/{po_id}/receive',
                  {'items': items, 'invoiceNumber': f'DEMO-SI-{self.invoice_no}', 'notes': DEMO})
        if not po:
            return
        if partial:
            self.schedule(day + timedelta(days=rng.randint(3, 7)), self.deliver, po_id, False)
        # Now and then something arrives damaged or wrong and goes back
        if not partial and rng.random() < 0.25:
            self.schedule(day + timedelta(days=1), self.give_back, po_id)
        if po['status'] == 'received':
            self.schedule_payment(day, po)

    def give_back(self, day, po_id):
        po = call('get', f'/api/purchase-orders/{po_id}')
        lines = [it for it in (po or {}).get('items', []) if it['receivedQuantity'] > 0]
        if not lines:
            return
        it = rng.choice(lines)
        qty = min(it['receivedQuantity'], 2 if it.get('unit') != 'yd' else rng.choice([2, 3, 4, 5]))
        replace = rng.random() < 0.6
        at(day, 11, rng.randint(0, 59))
        po = call('post', f'/api/purchase-orders/{po_id}/return', {
            'items': [{'line': it['line'], 'quantity': qty}], 'reason': rng.choice(RETURN_REASONS), 'replacement': replace,
            'documentNumber': f'DEMO-RS-{rng.randint(100, 999)}', 'notes': DEMO,
            **({'expectedReplacement': (day + timedelta(days=5)).isoformat()} if replace else {})})
        if not po:
            return
        self.counts['returns'] += 1
        if replace:
            self.schedule(day + timedelta(days=rng.randint(4, 7)), self.deliver, po_id, False)

    def schedule_payment(self, day, po):
        """Pay by the term: on or a little before the due date; some late, the newest not yet."""
        term_days = po.get('paymentTermDays') or (0 if po.get('paymentTerm') in ('cod', 'advance') else 30)
        if not term_days:  # COD / paid in advance: settled the day it arrives
            self.schedule(day, self.pay_supplier, po['id'])
            return
        due = day + timedelta(days=term_days)
        roll = rng.random()
        pay_on = due - timedelta(days=rng.randint(0, 5)) if roll < 0.8 else due + timedelta(days=rng.randint(3, 12))
        self.schedule(max(pay_on, day + timedelta(days=1)), self.pay_supplier, po['id'])

    def pay_supplier(self, day, po_id):
        po = call('get', f'/api/purchase-orders/{po_id}')
        if not po or po['payableBalance'] <= 0:
            return
        at(day, 15, rng.randint(0, 59))
        if call('post', f'/api/purchase-orders/{po_id}/payments', {
                'amount': po['payableBalance'], 'paymentDate': day.isoformat(),
                'paymentMethod': rng.choice(['bank_transfer', 'bank_transfer', 'check', 'cash']),
                'referenceNumber': f'DEMO-PAY-{rng.randint(1000, 9999)}', 'notes': DEMO}):
            self.counts['payments'] += 1

    # Job orders -----------------------------------------------------------------
    def pick_material(self, qty):
        pool = [x for x in self.lengths if float(db.session.get(m.InventoryMaterial, x.id).stock_quantity or 0) >= qty + 1]
        if not pool:
            return None
        return rng.choices(pool, weights=[self.weights[x.id] for x in pool])[0]

    def new_job_order(self, day):
        name, phone = rng.choice(self.customers)
        services = rng.choice(SERVICES)
        lines, used = [], set()
        for _ in range(1 if rng.random() < 0.6 else 2):
            qty = 4 if rng.random() < 0.75 else rng.choice([3, 5, 6])  # mostly 4 yd
            mat = self.pick_material(qty)
            if not mat or mat.id in used:
                continue
            used.add(mat.id)
            mat = db.session.get(m.InventoryMaterial, mat.id)
            lines.append({'name': mat.material_type, 'category': 'material', 'materialId': mat.id, 'quantity': qty,
                          'unitPrice': float(mat.unit_price), 'materialCost': float(mat.unit_price), 'laborCost': 0})
        if not lines:
            return
        materials = sum(it['quantity'] * it['unitPrice'] for it in lines)
        price = round((materials * rng.uniform(2.0, 2.6) + rng.choice([1500, 2500, 3500])) / 100) * 100
        make, model = rng.choice(VEHICLES)
        vehicle = ({'make': 'Reupholstery', 'model': 'Sofa', 'year': day.year, 'plateNumber': ''}
                   if services.startswith('reupholstery') else
                   {'make': make, 'model': model, 'year': rng.randint(2012, 2025),
                    'plateNumber': f"{''.join(rng.choice('ABCDNPTUVW') for _ in range(3))} {rng.randint(1000, 9999)}"})
        at(day, rng.randint(9, 16), rng.randint(0, 59))
        jo = call('post', '/api/sales/job-orders', {
            'customerName': name, 'customerPhone': phone, 'customerEmail': '', 'branchId': rng.choice(self.shops),
            'description': services, 'vehicleInfo': vehicle, 'items': lines,
            'estimatedCompletion': (day + timedelta(days=rng.randint(4, 8))).isoformat(),
            'downPayment': money(price * 0.5), 'paymentMethod': rng.choice(['cash', 'gcash', 'bank_transfer']),
            'notes': DEMO, 'priority': rng.choice(['normal'] * 6 + ['high', 'urgent']), 'discountPercent': 0,
            'vatIncluded': True, 'priceForWork': price, 'estimatedCost': price,
            'slipData': {'serviceDetails': {}}})
        if not jo:
            return
        self.counts['jo'] += 1
        if rng.random() < 0.04:  # the customer backs out
            self.schedule(day + timedelta(days=1), self.cancel, jo['id'])
            return
        self.schedule(day + timedelta(days=rng.randint(0, 1)), self.start_job, jo['id'], jo['jobOrderId'])

    def cancel(self, day, jo_id):
        at(day, 10)
        if call('put', f'/api/sales/job-orders/{jo_id}', {'status': 'cancelled'}):
            self.counts['cancelled'] += 1

    def start_job(self, day, jo_id, ref):
        at(day, 9, rng.randint(0, 59))
        cutter = call('post', '/api/worker-assignments', {
            'workerId': self.workers['Cutter'].id, 'jobOrderRef': ref, 'jobOrderDbId': jo_id,
            'description': 'Cutting', 'scheduledDate': day.isoformat()})
        sewer = None
        if rng.random() < 0.7:
            sewer = call('post', '/api/worker-assignments', {
                'workerId': self.workers['Sewer'].id, 'jobOrderRef': ref, 'jobOrderDbId': jo_id,
                'description': 'Sewing', 'scheduledDate': (day + timedelta(days=1)).isoformat()})
        call('put', f'/api/sales/job-orders/{jo_id}', {'status': 'in_progress'})
        if not cutter:
            return
        cid = cutter['assignment']['id']
        call('put', f'/api/worker-assignments/{cid}', {'status': 'in_progress'})
        self.schedule(day + timedelta(days=rng.randint(1, 2)), self.finish_cutting, jo_id, cid,
                      sewer['assignment']['id'] if sewer else None)

    def finish_cutting(self, day, jo_id, cid, sewer_id):
        info = call('get', f'/api/worker-assignments/{cid}/cut-materials')
        cuts = []
        for line in (info or {}).get('materials', []):
            planned = float(line['plannedQuantity'])
            cut = planned + (1 / 3 if rng.random() < 0.1 else 0)                  # sometimes a foot extra
            used = cut - rng.choice([0, 0, 0, 1 / 36 * 6, 1 / 3, 1 / 3, 1 / 12 * 2])  # 0, 6 in, 1 ft, 2 in left over
            cuts.append({'line': line['line'], 'materialId': line['options'][0]['id'],
                         'cut': round(cut, 4), 'used': round(max(used, 0), 4)})
        consumables = []
        cement = [c for c in self.consumables if 'CEMENT' in c.material_type.upper()]
        if cement and rng.random() < 0.25:
            c = db.session.get(m.InventoryMaterial, cement[0].id)
            kind = 'full' if float(c.stock_quantity or 0) >= 1 and rng.random() < 0.5 else 'partial'
            consumables.append({'materialId': c.id, 'kind': kind, **({'quantity': 1} if kind == 'full' else {})})
        at(day, rng.randint(13, 17), rng.randint(0, 59))
        if call('put', f'/api/worker-assignments/{cid}', {'status': 'completed', 'unitsWorked': 1, 'hoursWorked': 1,
                                                         'materialCuts': cuts, 'consumables': consumables}):
            self.counts['cuts'] += len(cuts)
        if sewer_id:
            self.schedule(day + timedelta(days=rng.randint(1, 2)), self.finish_task, sewer_id, jo_id)
        else:
            self.schedule(day + timedelta(days=rng.randint(1, 2)), self.complete_job, jo_id)

    def finish_task(self, day, aid, jo_id):
        at(day, 10)
        call('put', f'/api/worker-assignments/{aid}', {'status': 'in_progress'})
        at(day, rng.randint(14, 17), rng.randint(0, 59))
        call('put', f'/api/worker-assignments/{aid}', {'status': 'completed', 'unitsWorked': 1, 'hoursWorked': 1})
        self.schedule(day + timedelta(days=rng.randint(0, 1)), self.complete_job, jo_id)

    def complete_job(self, day, jo_id):
        # The balance is settled when the customer picks up the car, then the job is closed
        at(day, rng.randint(15, 16), rng.randint(0, 59))
        order = db.session.get(m.JobOrder, jo_id)
        balance = money(float(order.total_price or 0) - float(order.down_payment or 0))
        if balance > 0:
            call('post', '/api/payments', {'jobOrderId': jo_id, 'amount': balance,
                                           'paymentMethod': rng.choice(['cash', 'gcash', 'bank_transfer']),
                                           'notes': f'{DEMO} balance on release'})
        Clock.now += timedelta(minutes=5)
        if call('put', f'/api/sales/job-orders/{jo_id}', {'status': 'completed'}):
            self.counts['jo_done'] += 1

    def consumables_week(self, day):
        """Shop supplies used up across the week (thread, staples, chalk...)."""
        at(day, 17, 30)
        for c in self.consumables:
            c = db.session.get(m.InventoryMaterial, c.id)
            if 'CEMENT' in c.material_type.upper():
                continue
            if rng.random() < 0.55 and float(c.stock_quantity or 0) >= 1:
                call('post', f'/api/inventory/raw-materials/{c.id}/consumable-use',
                     {'kind': 'full', 'quantity': 1, 'notes': DEMO})
            elif rng.random() < 0.2:
                call('post', f'/api/inventory/raw-materials/{c.id}/consumable-use', {'kind': 'partial', 'notes': DEMO})

    def run(self, start, end):
        day = start
        while day <= end:
            weekday = day.weekday()
            if weekday == 0:
                self.restock(day)
            if weekday < 6:  # Mon-Sat
                # Four shops: about 1-3 jobs a day, a little busier on Saturdays
                for _ in range(rng.choice([1, 1, 2, 2, 3] + ([3] if weekday == 5 else []))):
                    self.new_job_order(day)
            if weekday == 5:
                self.consumables_week(day)
            # Due follow-ups (deliveries, tasks, completions, payments) up to today
            while True:
                due = sorted((e for e in self.events if e[0] <= day), key=lambda e: (e[0], e[1]))
                if not due:
                    break
                when, seq, fn, a = due[0]
                self.events.remove(due[0])
                fn(when, *a)
            day += timedelta(days=1)
        # Leave what falls after the end date undone: open jobs and unpaid bills, as in real life
        print(f'History: {self.counts}')


def recompute_ai():
    Clock.now = _real_datetime.utcnow()
    m.datetime = _real_datetime
    cache = m.AIPredictionCache.query.first()
    if not cache:
        cache = m.AIPredictionCache(status='computing', predictions_json='[]')
        db.session.add(cache)
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
    print(f"AI: status={cache.status}, {len(preds)} items forecast, {len(tested)} with a tested error, methods={methods}")
    live = [p for p in preds if p.get('dataSource') in ('live', 'hybrid')]
    print(f"AI: {len(live)} items use live usage (hybrid/live)")


if __name__ == '__main__':
    with app.app_context():
        m.init_db()
        start = _real_datetime.strptime(args.start, '%Y-%m-%d').date()
        end = _real_datetime.strptime(args.end, '%Y-%m-%d').date()
        at(start, 8)
        admin, warehouse = setup_inventory()
        if not args.inventory_only:
            Sim(admin, warehouse).run(start, end)
        recompute_ai()
        if errors:
            kinds = {}
            for e in errors:
                k = e.split(': ', 1)[-1]
                kinds[k] = kinds.get(k, 0) + 1
            print('Refused, by kind:', kinds)
            print(f'{len(errors)} requests were refused; first ones:')
            for e in errors[:25]:
                print('  ', e)
