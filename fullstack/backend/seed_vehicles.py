"""
One-time seed of vehicle makes and models into the local database.

Data source for MODELS: NHTSA vPIC API (free, no API key, US government).
    https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/{make}?format=json

The list of MAKES is a curated set of brands relevant to the local market
(Philippines) rather than the full ~10,000-entry vPIC catalogue, so the
dropdowns stay clean and useful. Models for each make are fetched from the
API — none are hand-typed.

Design goal: fetch from the external API ONCE at seed time and store the
result locally. The running app never calls NHTSA — it only reads the
vehicle_makes / vehicle_models tables, so the make/model dropdowns are fast
and keep working even if the external API is down.

Notes:
  - Uses only the Python standard library (urllib) so no extra dependency is
    needed. If a make can't be fetched (network error, unknown make), it is
    still created with no models; users can always free-type a model in the
    form.
  - Idempotent: re-running upserts by name, so it is safe to run again to
    refresh/extend the list.
  - Free-text vehicles not in any car API (jeepney, tricycle, custom builds)
    are intentionally NOT seeded — the form's combobox lets staff type those
    in directly.

Usage:
    ./venv/Scripts/python.exe seed_vehicles.py
    ./venv/Scripts/python.exe seed_vehicles.py --offline   # makes only, skip API
"""
import sys
import json
import time
import urllib.parse
import urllib.request

from app import app, db, init_db, VehicleMake, VehicleModel

# Curated makes: common brands in the PH auto market. Extend this list any
# time and re-run — models for new entries will be fetched on the next run.
CURATED_MAKES = [
    'Toyota', 'Mitsubishi', 'Honda', 'Nissan', 'Hyundai', 'Ford', 'Isuzu',
    'Suzuki', 'Kia', 'Mazda', 'Chevrolet', 'Subaru', 'MG', 'Geely', 'Chery',
    'Foton', 'Volkswagen', 'BMW', 'Mercedes-Benz', 'Audi', 'Lexus', 'Jeep',
    'Jaguar', 'Land Rover', 'Volvo', 'Peugeot', 'BYD', 'Changan', 'GAC',
    'Maxus', 'JAC', 'Ssangyong', 'Porsche', 'Mini', 'Dodge', 'Ram', 'GMC',
]

NHTSA_URL = (
    'https://vpic.nhtsa.dot.gov/api/vehicles/'
    'GetModelsForMake/{make}?format=json'
)
REQUEST_TIMEOUT = 20  # seconds


def fetch_models(make_name):
    """Return a sorted, de-duplicated list of model names for a make.

    Returns an empty list on any error so seeding continues for other makes.
    """
    url = NHTSA_URL.format(make=urllib.parse.quote(make_name))
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'SMAve-Seed/1.0'})
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except Exception as exc:  # network, timeout, JSON, etc.
        print(f"    ! could not fetch models for {make_name}: {exc}")
        return []

    names = set()
    for row in payload.get('Results', []):
        model = (row.get('Model_Name') or '').strip()
        if model:
            names.add(model)
    return sorted(names)


def upsert_make(make_name):
    make = VehicleMake.query.filter(
        db.func.lower(VehicleMake.name) == make_name.lower()
    ).first()
    if not make:
        make = VehicleMake(name=make_name, is_active=True)
        db.session.add(make)
        db.session.flush()  # assign id for model FKs
    return make


def upsert_models(make, model_names):
    existing = {
        m.name.lower() for m in VehicleModel.query.filter_by(make_id=make.id).all()
    }
    added = 0
    for name in model_names:
        if name.lower() in existing:
            continue
        db.session.add(VehicleModel(make_id=make.id, name=name, is_active=True))
        existing.add(name.lower())
        added += 1
    return added


def main(offline=False):
    with app.app_context():
        init_db()  # ensures the new tables exist; idempotent

        total_makes = 0
        total_models = 0
        for make_name in CURATED_MAKES:
            make = upsert_make(make_name)
            total_makes += 1

            if offline:
                print(f"  {make_name}: make ensured (offline, models skipped)")
                continue

            models = fetch_models(make_name)
            added = upsert_models(make, models)
            total_models += added
            print(f"  {make_name}: {len(models)} models fetched, {added} new")
            db.session.commit()
            time.sleep(0.3)  # be polite to the free public API

        db.session.commit()
        print("-" * 50)
        print(f"Done. {total_makes} makes ensured, {total_models} new models added.")


if __name__ == '__main__':
    main(offline='--offline' in sys.argv)
