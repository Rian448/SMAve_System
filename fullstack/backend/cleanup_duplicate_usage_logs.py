"""Remove the duplicate material-usage entries made by the old worker-assignment code.

Before the fix, every time a worker finished an assignment on a job order, the
whole order's material list was logged as "used" again — once per worker — on
top of the single entry written when the job order itself is completed. Those
extra rows are recognisable: job-order usage with no recording user, a worker
attached, and the note "Job order completed by <worker>". They never changed
stock levels, so removing them only fixes the usage history and reports.

Shows what it would delete by default; pass --apply to delete.
Uses DATABASE_URL like the app does, so it works on the local SQLite file or
on the production database.

    python cleanup_duplicate_usage_logs.py           # preview
    python cleanup_duplicate_usage_logs.py --apply   # delete
"""
import sys

from app import app, db, MaterialUsageLog


def duplicate_rows():
    return MaterialUsageLog.query.filter(
        MaterialUsageLog.used_in_type == 'job_order',
        MaterialUsageLog.used_by.is_(None),
        MaterialUsageLog.managed_worker_id.isnot(None),
        MaterialUsageLog.notes.like('Job order completed by %'),
    )


if __name__ == '__main__':
    apply = '--apply' in sys.argv
    with app.app_context():
        rows = duplicate_rows().order_by(MaterialUsageLog.created_at).all()
        print(f"{len(rows)} duplicate usage entr{'y' if len(rows) == 1 else 'ies'} found")
        for r in rows[:50]:
            name = r.material.material_type if r.material else f'material #{r.material_id}'
            print(f"  #{r.id}  {r.used_in_reference}  {name} x{r.quantity_used}  ({r.notes})")
        if len(rows) > 50:
            print(f"  ... and {len(rows) - 50} more")
        if not apply:
            print('Preview only. Run again with --apply to delete them.')
        elif rows:
            deleted = duplicate_rows().delete(synchronize_session=False)
            db.session.commit()
            print(f'Deleted {deleted}.')
