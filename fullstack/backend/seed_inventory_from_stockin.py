"""
One-time import of the Stock-In (Purchases) Log into inventory.

Source data was extracted/verified from
"INVENTORY REPORT IN_OUT 06_18_2026.xlsx" -> "Stock In (Purchases) Log"
and written to inventory_seed.json (name, sku, quantity, costPerUnit, supplier).

For each product:
  - the Product Name is used as the displayed material name
  - the supplier is created (if missing) so it shows up in the supplier dropdown
  - cost_per_unit is the purchase cost; selling unit_price = cost * (1 + markup/100)
  - default markup is 25%

Upserts by material name within the warehouse branch, so re-running is safe.

Usage:  ./venv/Scripts/python.exe seed_inventory_from_stockin.py path/to/inventory_seed.json
"""
import sys
import json

from app import app, db, init_db, Branch, Supplier, InventoryMaterial, SystemSetting

DEFAULT_MARKUP = 25.0


def main(json_path):
    with open(json_path, 'r', encoding='utf-8') as f:
        seed = json.load(f)

    with app.app_context():
        init_db()  # ensures new columns/settings exist; idempotent

        # Resolve the markup from settings (falls back to 25)
        ms = SystemSetting.query.filter_by(key='default_material_markup').first()
        try:
            markup = float(ms.value) if ms and ms.value else DEFAULT_MARKUP
        except (TypeError, ValueError):
            markup = DEFAULT_MARKUP

        warehouse = Branch.query.filter_by(is_warehouse=True).first()
        if not warehouse:
            warehouse = Branch.query.order_by(Branch.id.asc()).first()
        if not warehouse:
            print('ERROR: no branch found to import into.')
            return
        print(f'Importing into branch: {warehouse.name} (id={warehouse.id}), markup={markup}%')

        # --- Suppliers ---
        supplier_ids = {}
        for name in seed.get('suppliers', []):
            name = name.strip()
            if not name:
                continue
            sup = Supplier.query.filter(db.func.lower(Supplier.name) == name.lower()).first()
            if not sup:
                sup = Supplier(name=name, is_active=True)
                db.session.add(sup)
                db.session.flush()
                print(f'  + supplier created: {name}')
            supplier_ids[name] = sup.id
        db.session.commit()

        # --- Materials ---
        created = updated = 0
        for p in seed.get('products', []):
            name = p['name'].strip()
            cost = float(p.get('costPerUnit') or 0)
            qty = float(p.get('quantity') or 0)
            sku = (p.get('sku') or '').strip() or None
            sup_name = (p.get('supplier') or '').strip()
            sup_id = supplier_ids.get(sup_name)
            unit_price = round(cost * (1 + markup / 100), 2)

            mat = (InventoryMaterial.query
                   .filter(db.func.lower(InventoryMaterial.material_type) == name.lower(),
                           InventoryMaterial.branch_id == warehouse.id)
                   .first())
            if mat:
                mat.cost_per_unit = cost
                mat.markup_percent = markup
                mat.unit_price = unit_price
                mat.sku = sku
                mat.supplier_id = sup_id
                mat.stock_quantity = qty
                mat.is_archived = False
                mat.status = 'available'
                updated += 1
            else:
                db.session.add(InventoryMaterial(
                    material_type=name,
                    color='', pattern='',
                    sku=sku,
                    cost_per_unit=cost,
                    markup_percent=markup,
                    unit_price=unit_price,
                    stock_quantity=qty,
                    supplier_id=sup_id,
                    branch_id=warehouse.id,
                    is_archived=False,
                    status='available',
                ))
                created += 1
        db.session.commit()

        total = InventoryMaterial.query.filter_by(branch_id=warehouse.id, is_archived=False).count()
        print(f'Done. {created} created, {updated} updated. '
              f'{len(supplier_ids)} suppliers ensured. '
              f'Warehouse now has {total} active materials.')


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'inventory_seed.json'
    main(path)
