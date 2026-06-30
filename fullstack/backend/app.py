from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import datetime, timedelta
from functools import wraps
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import os
import random
import hashlib
import secrets
import uuid

app = Flask(__name__)
CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    supports_credentials=False
)

# ============================================
# DATABASE CONFIGURATION (PostgreSQL)
# ============================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL',
    f"sqlite:///{os.path.join(BASE_DIR, 'smaeve_system.db')}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CATALOG_UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'catalog')
os.makedirs(CATALOG_UPLOAD_FOLDER, exist_ok=True)
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

db = SQLAlchemy(app)
migrate = Migrate(app, db)

# ============================================
# DATABASE MODELS
# ============================================

class Role(db.Model):
    __tablename__ = 'roles'
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    full_name = db.Column(db.String(255), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=False)
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=True)
    branch = db.Column(db.String(100), nullable=True)  # Keep for backward compatibility
    is_active = db.Column(db.Boolean, default=True)
    failed_login_attempts = db.Column(db.Integer, default=0)
    lockout_until = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    role = db.relationship('Role')
    branch_rel = db.relationship('Branch')

class Branch(db.Model):
    __tablename__ = 'branches'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    code = db.Column(db.String(50), unique=True, nullable=False)
    address = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(50), nullable=True)
    is_warehouse = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Customer(db.Model):
    __tablename__ = 'customers'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(50), nullable=True)
    email = db.Column(db.String(255), nullable=True)
    address = db.Column(db.String(255), nullable=True)
    discount_percent = db.Column(db.Float, nullable=True)
    promo_code = db.Column(db.String(100), nullable=True)
    promo_discount = db.Column(db.Float, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class CustomerOrder(db.Model):
    __tablename__ = 'customer_orders'
    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(50), unique=True, nullable=False)
    customer_name = db.Column(db.String(255), nullable=False)
    customer_phone = db.Column(db.String(50), nullable=False)
    customer_email = db.Column(db.String(255))
    customer_address = db.Column(db.String(255))
    vehicle_info = db.Column(db.JSON, nullable=False)
    services = db.Column(db.JSON, nullable=False)
    notes = db.Column(db.Text)
    status = db.Column(db.String(50), default='pending')
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Customer user link (for logged-in customers)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    
    # Quotation fields
    quotation_items = db.Column(db.JSON)  # [{name, description, quantity, unitPrice, total}]
    quotation_total = db.Column(db.Float, default=0)
    quotation_status = db.Column(db.String(50), default='pending_quotation')  # pending_quotation, quoted, accepted, rejected
    quotation_notes = db.Column(db.Text)  # Admin notes for quotation
    customer_response_notes = db.Column(db.Text)  # Customer notes when accepting/rejecting
    quoted_at = db.Column(db.DateTime)  # When admin sent quotation
    responded_at = db.Column(db.DateTime)  # When customer responded
    
    branch = db.relationship('Branch')
    customer_user = db.relationship('User', foreign_keys=[user_id])

class JobOrder(db.Model):
    __tablename__ = 'job_orders'
    id = db.Column(db.Integer, primary_key=True)
    job_order_id = db.Column(db.String(50), unique=True, nullable=False)
    customer_id = db.Column(db.Integer, nullable=True)
    customer_name = db.Column(db.String(255), nullable=False)
    customer_phone = db.Column(db.String(50), nullable=False)
    customer_email = db.Column(db.String(255))
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=False)
    description = db.Column(db.Text, nullable=False)
    vehicle_info = db.Column(db.JSON)
    items = db.Column(db.JSON, nullable=False)
    slip_data = db.Column(db.JSON, nullable=True)
    estimated_cost = db.Column(db.Float, default=0)
    actual_cost = db.Column(db.Float, default=0)
    total_price = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(50), default='pending')  # pending, in_progress, completed, voided, cancelled
    payment_status = db.Column(db.String(50), default='unpaid')  # unpaid, partial, paid
    down_payment = db.Column(db.Float, default=0)
    balance = db.Column(db.Float, default=0)
    estimated_completion = db.Column(db.Date, nullable=False)
    completed_at = db.Column(db.Date)
    voided_at = db.Column(db.Date)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    branch = db.relationship('Branch')
    creator = db.relationship('User', foreign_keys=[created_by])

class Worker(db.Model):
    __tablename__ = 'workers'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    worker_type = db.Column(db.String(50), nullable=False)  # seat_maker, sewer, etc.
    is_available = db.Column(db.Boolean, default=True)
    specialization = db.Column(db.String(255))  # car_seats, motorcycle_seats, upholstery
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    user = db.relationship('User', backref='worker_profile')
    branch = db.relationship('Branch')

class WorkTask(db.Model):
    __tablename__ = 'work_tasks'
    id = db.Column(db.Integer, primary_key=True)
    task_number = db.Column(db.String(50), unique=True, nullable=False)
    job_order_id = db.Column(db.String(50), nullable=False)  # Reference to job order
    worker_id = db.Column(db.Integer, db.ForeignKey('workers.id'), nullable=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    task_type = db.Column(db.String(50), nullable=False)  # cutting, sewing, assembly, etc.
    priority = db.Column(db.String(20), default='normal')  # low, normal, high, urgent
    status = db.Column(db.String(50), default='pending')  # pending, in_progress, completed, cancelled
    estimated_hours = db.Column(db.Float)
    actual_hours = db.Column(db.Float)
    due_date = db.Column(db.DateTime)
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    notes = db.Column(db.Text)
    
    worker = db.relationship('Worker', backref='tasks')

class Appointment(db.Model):
    __tablename__ = 'appointments'
    id = db.Column(db.Integer, primary_key=True)
    appointment_number = db.Column(db.String(50), unique=True, nullable=False)
    customer_name = db.Column(db.String(255), nullable=False)
    customer_phone = db.Column(db.String(50), nullable=False)
    customer_email = db.Column(db.String(255))
    contact_method = db.Column(db.String(50), nullable=False)  # 'branch_visit' or 'phone_call'
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=True)  # Only if branch_visit
    preferred_date = db.Column(db.Date, nullable=False)
    preferred_time = db.Column(db.String(50))  # morning, afternoon, evening
    description = db.Column(db.Text)  # What the customer needs
    vehicle_info = db.Column(db.JSON)  # Optional vehicle info
    status = db.Column(db.String(50), default='pending')  # pending, confirmed, completed, cancelled
    confirmed_time = db.Column(db.String(20), nullable=True)  # e.g. "2:30 PM"
    confirmed_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    admin_notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    branch = db.relationship('Branch')
    customer_user = db.relationship('User', foreign_keys=[user_id])
    confirmer = db.relationship('User', foreign_keys=[confirmed_by])

class PhoneBlacklist(db.Model):
    __tablename__ = 'phone_blacklist'
    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(50), unique=True, nullable=False, index=True)
    strike_count = db.Column(db.Integer, default=0, nullable=False)
    is_blocked = db.Column(db.Boolean, default=False, nullable=False)
    reason = db.Column(db.Text, nullable=True)
    blocked_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ProductOrder(db.Model):
    __tablename__ = 'product_orders'
    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(50), unique=True, nullable=False)
    customer_name = db.Column(db.String(255), nullable=False)
    customer_phone = db.Column(db.String(50), nullable=False)
    customer_email = db.Column(db.String(255))
    customer_address = db.Column(db.String(255))
    items = db.Column(db.JSON, nullable=False)  # [{productId, name, quantity, price}]
    total_amount = db.Column(db.Float, nullable=False)
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=True)
    status = db.Column(db.String(50), default='pending')  # pending, processing, ready, completed, cancelled
    payment_status = db.Column(db.String(50), default='unpaid')  # unpaid, partial, paid
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    notes = db.Column(db.Text)
    group_id = db.Column(db.String(50), nullable=True, index=True)
    pickup_branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=True)
    shipment_status = db.Column(db.String(20), default='not_needed')  # not_needed, pending, shipped, received
    amount_paid = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    branch = db.relationship('Branch', foreign_keys=[branch_id])
    pickup_branch = db.relationship('Branch', foreign_keys=[pickup_branch_id])
    customer_user = db.relationship('User', foreign_keys=[user_id])

class ProductOrderTransfer(db.Model):
    """Tracks items that need to be physically transferred from a source branch
    to the pickup branch for a multi-branch premade order."""
    __tablename__ = 'product_order_transfers'
    id = db.Column(db.Integer, primary_key=True)
    product_order_id = db.Column(db.Integer, db.ForeignKey('product_orders.id'), nullable=False)
    source_branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=False)
    items = db.Column(db.JSON, nullable=False)  # [{productId, name, sku, quantity, unitPrice, total, sourceBranchId}]
    status = db.Column(db.String(20), default='pending')  # pending, transferred, received
    transferred_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    transferred_at = db.Column(db.DateTime, nullable=True)
    received_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    received_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    order = db.relationship('ProductOrder', backref=db.backref('transfers', lazy=True))
    source_branch = db.relationship('Branch')
    transferred_by = db.relationship('User', foreign_keys=[transferred_by_id])
    received_by = db.relationship('User', foreign_keys=[received_by_id])

class Notification(db.Model):
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    data = db.Column(db.JSON, nullable=True)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user = db.relationship('User', backref='notifications')

class InventoryMaterial(db.Model):
    __tablename__ = 'inventory_materials'
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.String(50), unique=True, nullable=True)
    material_type = db.Column(db.String(255), nullable=False)
    color = db.Column(db.String(100), default='')
    pattern = db.Column(db.String(100), default='')
    unit_price = db.Column(db.Float, default=0)
    stock_quantity = db.Column(db.Float, default=0)
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=False)
    is_archived = db.Column(db.Boolean, default=False)
    # Tracks which job order this material was added for when not yet in stock
    source_job_order_id = db.Column(db.String(50), nullable=True)
    # 'available' = normal stock item; 'needed' = ordered/reserved for a specific job order
    status = db.Column(db.String(20), default='available')
    low_stock_threshold = db.Column(db.Float, default=0)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=True)
    # Stock-keeping unit / item code from supplier purchase logs
    sku = db.Column(db.String(100), nullable=True)
    # What we paid the supplier per unit (purchase cost)
    cost_per_unit = db.Column(db.Float, default=0)
    # Markup applied on cost to derive the selling unit_price (e.g. 25 = +25%)
    markup_percent = db.Column(db.Float, default=25)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    branch = db.relationship('Branch')
    supplier = db.relationship('Supplier', foreign_keys=[supplier_id])

class PremadeProduct(db.Model):
    __tablename__ = 'premade_products'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    sku = db.Column(db.String(100), unique=True, nullable=False)
    quantity = db.Column(db.Float, default=0)
    unit = db.Column(db.String(50), default='pcs')
    category = db.Column(db.String(100), default='General')
    price = db.Column(db.Float, default=0)
    cost = db.Column(db.Float, default=0)
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=False)
    is_archived = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    branch = db.relationship('Branch')

class MaterialUsageLog(db.Model):
    __tablename__ = 'material_usage_logs'
    id = db.Column(db.Integer, primary_key=True)
    material_id = db.Column(db.Integer, db.ForeignKey('inventory_materials.id'), nullable=False)
    premade_product_id = db.Column(db.Integer, db.ForeignKey('premade_products.id'), nullable=True)
    quantity_used = db.Column(db.Float, nullable=False)
    used_in_type = db.Column(db.String(100), default='premade_product')
    used_in_reference = db.Column(db.String(255), nullable=False)
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=False)
    used_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    managed_worker_id = db.Column(db.Integer, db.ForeignKey('managed_workers.id'), nullable=True)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    material = db.relationship('InventoryMaterial')
    premade_product = db.relationship('PremadeProduct')
    branch = db.relationship('Branch')
    used_by_user = db.relationship('User', foreign_keys=[used_by])
    managed_worker = db.relationship('ManagedWorker', foreign_keys=[managed_worker_id])

class CatalogItem(db.Model):
    __tablename__ = 'catalog_items'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, default='')
    tag = db.Column(db.String(100), default='')
    image_url = db.Column(db.String(500), default='')
    sort_order = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class SystemSetting(db.Model):
    __tablename__ = 'system_settings'
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text, default='')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Supplier(db.Model):
    __tablename__ = 'suppliers'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    contact_person = db.Column(db.String(255), nullable=True)
    phone = db.Column(db.String(50), nullable=True)
    email = db.Column(db.String(255), nullable=True)
    address = db.Column(db.String(500), nullable=True)
    materials_supplied = db.Column(db.Text, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MaterialWasteLog(db.Model):
    __tablename__ = 'material_waste_logs'
    id = db.Column(db.Integer, primary_key=True)
    material_id = db.Column(db.Integer, db.ForeignKey('inventory_materials.id'), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    reason = db.Column(db.String(255), nullable=False)
    notes = db.Column(db.Text, nullable=True)
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=False)
    logged_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    material = db.relationship('InventoryMaterial')
    branch = db.relationship('Branch')
    logged_by_user = db.relationship('User', foreign_keys=[logged_by])

class HistoricalInventoryData(db.Model):
    __tablename__ = 'historical_inventory_data'
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.String(50), nullable=False, index=True)
    material_type = db.Column(db.String(255), default='')
    stock_quantity = db.Column(db.Float, default=0)
    incoming_date = db.Column(db.Date, nullable=True)
    outgoing_date = db.Column(db.Date, nullable=True)
    restock_date = db.Column(db.Date, nullable=True)
    restock_quantity = db.Column(db.Float, default=0)
    restock_cycle = db.Column(db.Integer, default=0)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

class AIPredictionCache(db.Model):
    __tablename__ = 'ai_prediction_cache'
    id = db.Column(db.Integer, primary_key=True)
    status = db.Column(db.String(20), default='idle')  # idle, computing, done, error
    predictions_json = db.Column(db.Text, default='[]')
    total_items = db.Column(db.Integer, default=0)
    processed_items = db.Column(db.Integer, default=0)
    error_message = db.Column(db.Text, nullable=True)
    computed_at = db.Column(db.DateTime, nullable=True)
    upload_rows = db.Column(db.Integer, default=0)
    upload_items = db.Column(db.Integer, default=0)
    last_uploaded_at = db.Column(db.DateTime, nullable=True)

class PaymentRecord(db.Model):
    __tablename__ = 'payment_records'
    id = db.Column(db.Integer, primary_key=True)
    job_order_id = db.Column(db.Integer, db.ForeignKey('job_orders.id'), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    payment_method = db.Column(db.String(50), default='cash')  # cash, gcash, card, bank_transfer
    reference_number = db.Column(db.String(100), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    recorded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    job_order = db.relationship('JobOrder', backref='payment_records')
    recorder = db.relationship('User', foreign_keys=[recorded_by])

class ManagedWorker(db.Model):
    __tablename__ = 'managed_workers'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    work_type = db.Column(db.String(100), nullable=False)  # seat_maker, sewer, upholstery, installer
    rate_per_hour = db.Column(db.Float, nullable=False, default=0)  # rate value (unit depends on pay_mode)
    pay_mode = db.Column(db.String(20), default='per_hour')  # per_hour | per_day | per_piece
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class WorkerAssignment(db.Model):
    __tablename__ = 'worker_assignments'
    id = db.Column(db.Integer, primary_key=True)
    worker_id = db.Column(db.Integer, db.ForeignKey('managed_workers.id'), nullable=False)
    job_order_ref = db.Column(db.String(50), nullable=False)
    job_order_db_id = db.Column(db.Integer, nullable=True)
    description = db.Column(db.String(255), nullable=True)
    expected_hours = db.Column(db.Float, nullable=True)
    start_time = db.Column(db.DateTime, nullable=True)
    end_time = db.Column(db.DateTime, nullable=True)
    hours_worked = db.Column(db.Float, nullable=True)
    pay = db.Column(db.Float, nullable=True)
    pay_override = db.Column(db.Float, nullable=True)          # admin-set final pay amount
    materials_used = db.Column(db.JSON, nullable=True)         # snapshot of materials on completion
    status = db.Column(db.String(50), default='pending')       # pending, in_progress, completed
    # Calendar: which date this assignment is scheduled for
    scheduled_date = db.Column(db.Date, nullable=True)
    # 'job_order' = normal work on a job order | 'special_task' = installer etc.
    assignment_type = db.Column(db.String(20), default='job_order')
    special_task_title = db.Column(db.String(255), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    worker = db.relationship('ManagedWorker', backref='assignments')


class WorkerAvailabilitySchedule(db.Model):
    """Explicit availability overrides per worker per date.
    Absence of a row = default working day.
    A row with is_available=False = worker is off/unavailable that day."""
    __tablename__ = 'worker_availability_schedules'
    id = db.Column(db.Integer, primary_key=True)
    managed_worker_id = db.Column(db.Integer, db.ForeignKey('managed_workers.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    is_available = db.Column(db.Boolean, default=False, nullable=False)  # False = marked unavailable
    note = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    worker = db.relationship('ManagedWorker', backref='schedule')
    __table_args__ = (db.UniqueConstraint('managed_worker_id', 'date', name='uq_worker_date'),)

# ============================================
# SEED DATA
# ============================================

default_roles = [
    {'key': 'administrator', 'name': 'Administrator'},
    {'key': 'supervisor', 'name': 'Supervisor'},
    {'key': 'sales_manager', 'name': 'Sales Manager'},
    {'key': 'staff', 'name': 'Staff'},
    {'key': 'seat_maker', 'name': 'Seat Maker'},
    {'key': 'sewer', 'name': 'Sewer'},
    {'key': 'customer', 'name': 'Customer'}
]

default_users = [
    {'username': 'admin', 'password': 'admin123', 'email': 'admin@seatmakers.com', 'fullName': 'System Administrator', 'role': 'administrator', 'branch': 'Main Warehouse', 'isActive': True},
    {'username': 'supervisor', 'password': 'super123', 'email': 'supervisor@seatmakers.com', 'fullName': 'John Supervisor', 'role': 'supervisor', 'branch': 'Main Warehouse', 'isActive': True},
    {'username': 'salesmanager', 'password': 'sales123', 'email': 'sales@seatmakers.com', 'fullName': 'Jane Sales', 'role': 'sales_manager', 'branch': 'Branch A', 'isActive': True},
    {'username': 'staff1', 'password': 'staff123', 'email': 'staff1@seatmakers.com', 'fullName': 'Mike Staff', 'role': 'staff', 'branch': 'Branch B', 'isActive': True},
]

# ============================================
# IN-MEMORY DATABASE (Replace with real DB in production)
# ============================================

# Sessions for authentication
sessions = {}

# Branches
branches = [
    {'id': 1, 'name': 'Main Warehouse', 'code': 'MW', 'address': '123 Main St', 'isWarehouse': True, 'isActive': True},
    {'id': 2, 'name': 'Branch A', 'code': 'BA', 'address': '456 Branch A St', 'isWarehouse': False, 'isActive': True},
    {'id': 3, 'name': 'Branch B', 'code': 'BB', 'address': '789 Branch B St', 'isWarehouse': False, 'isActive': True},
    {'id': 4, 'name': 'Branch C', 'code': 'BC', 'address': '321 Branch C St', 'isWarehouse': False, 'isActive': True},
]

# Raw Materials Inventory
raw_materials = []

# Finished Goods Inventory
finished_goods = [
    {'id': 1, 'name': 'Car Seat Cover - Standard', 'sku': 'FG-CSC-001', 'quantity': 25, 'unit': 'pcs', 'category': 'Seat Covers', 'price': 150.00, 'cost': 75.00, 'branchId': 2, 'isArchived': False, 'lastUpdated': '2026-01-20'},
    {'id': 2, 'name': 'Car Seat Cover - Premium', 'sku': 'FG-CSC-002', 'quantity': 15, 'unit': 'pcs', 'category': 'Seat Covers', 'price': 250.00, 'cost': 120.00, 'branchId': 2, 'isArchived': False, 'lastUpdated': '2026-01-20'},
    {'id': 3, 'name': 'Motorcycle Seat - Custom', 'sku': 'FG-MCS-001', 'quantity': 10, 'unit': 'pcs', 'category': 'Motorcycle', 'price': 180.00, 'cost': 85.00, 'branchId': 3, 'isArchived': False, 'lastUpdated': '2026-01-19'},
    {'id': 4, 'name': 'Sofa Cushion Set', 'sku': 'FG-SCS-001', 'quantity': 8, 'unit': 'pcs', 'category': 'Furniture', 'price': 200.00, 'cost': 95.00, 'branchId': 2, 'isArchived': False, 'lastUpdated': '2026-01-18'},
]

# Job Orders
job_orders = [
    {
        'id': 1, 
        'jobOrderId': 'JO-BA-2026-0001',
        'customerId': 1,
        'customerName': 'Robert Chen',
        'customerPhone': '09171234567',
        'customerEmail': 'robert@email.com',
        'branchId': 2,
        'branchName': 'Branch A',
        'description': 'Full car interior upholstery - Toyota Vios 2023',
        'vehicleInfo': {'make': 'Toyota', 'model': 'Vios', 'year': 2023, 'plateNumber': 'ABC 1234'},
        'items': [
            {'name': 'Seat Cover - Front', 'quantity': 2, 'unitPrice': 150.00, 'materialCost': 60.00, 'laborCost': 40.00},
            {'name': 'Seat Cover - Back', 'quantity': 1, 'unitPrice': 180.00, 'materialCost': 80.00, 'laborCost': 50.00},
            {'name': 'Door Panel', 'quantity': 4, 'unitPrice': 80.00, 'materialCost': 30.00, 'laborCost': 25.00}
        ],
        'estimatedCost': 500.00,
        'actualCost': 0,
        'totalPrice': 800.00,
        'status': 'in_progress',
        'paymentStatus': 'partial',
        'downPayment': 400.00,
        'balance': 400.00,
        'estimatedCompletion': '2026-01-25',
        'createdAt': '2026-01-18',
        'createdBy': 3,
        'updatedAt': '2026-01-20'
    },
    {
        'id': 2, 
        'jobOrderId': 'JO-BB-2026-0001',
        'customerId': 2,
        'customerName': 'Maria Santos',
        'customerPhone': '09189876543',
        'customerEmail': 'maria@email.com',
        'branchId': 3,
        'branchName': 'Branch B',
        'description': 'Motorcycle seat reupholstery - Honda Click',
        'vehicleInfo': {'make': 'Honda', 'model': 'Click 150i', 'year': 2024, 'plateNumber': 'MC 5678'},
        'items': [
            {'name': 'Motorcycle Seat Cover', 'quantity': 1, 'unitPrice': 180.00, 'materialCost': 50.00, 'laborCost': 35.00}
        ],
        'estimatedCost': 85.00,
        'actualCost': 82.00,
        'totalPrice': 180.00,
        'status': 'completed',
        'paymentStatus': 'paid',
        'downPayment': 180.00,
        'balance': 0,
        'estimatedCompletion': '2026-01-20',
        'completedAt': '2026-01-19',
        'createdAt': '2026-01-15',
        'createdBy': 4,
        'updatedAt': '2026-01-19'
    },
    {
        'id': 3, 
        'jobOrderId': 'JO-BA-2026-0002',
        'customerId': 3,
        'customerName': 'James Dela Cruz',
        'customerPhone': '09175551234',
        'customerEmail': 'james@email.com',
        'branchId': 2,
        'branchName': 'Branch A',
        'description': 'Sofa set reupholstery - 3 seater and 2 single',
        'vehicleInfo': None,
        'items': [
            {'name': 'Sofa Reupholstery - 3 Seater', 'quantity': 1, 'unitPrice': 450.00, 'materialCost': 180.00, 'laborCost': 120.00},
            {'name': 'Sofa Reupholstery - Single', 'quantity': 2, 'unitPrice': 200.00, 'materialCost': 80.00, 'laborCost': 60.00}
        ],
        'estimatedCost': 520.00,
        'actualCost': 0,
        'totalPrice': 850.00,
        'status': 'pending',
        'paymentStatus': 'unpaid',
        'downPayment': 0,
        'balance': 850.00,
        'estimatedCompletion': '2026-01-30',
        'createdAt': '2026-01-20',
        'createdBy': 3,
        'updatedAt': '2026-01-20'
    }
]

# Line-up Slips
lineup_slips = [
    {
        'id': 1,
        'slipNumber': 'LS-BA-2026-0001',
        'jobOrderId': 1,
        'jobOrderNumber': 'JO-BA-2026-0001',
        'customerName': 'Robert Chen',
        'branchId': 2,
        'items': [
            {'description': 'Front Seat Covers (2)', 'status': 'in_progress'},
            {'description': 'Back Seat Cover (1)', 'status': 'pending'},
            {'description': 'Door Panels (4)', 'status': 'pending'}
        ],
        'priority': 'high',
        'assignedTo': 'Team A',
        'notes': 'Customer prefers darker shade of leather',
        'createdAt': '2026-01-18',
        'updatedAt': '2026-01-20'
    }
]

# Purchase Orders
purchase_orders = [
    {
        'id': 1,
        'poNumber': 'PO-2026-0001',
        'supplierId': 1,
        'supplierName': 'LeatherCo',
        'items': [
            {'materialId': 1, 'name': 'Leather - Black', 'quantity': 200, 'unit': 'sqft', 'unitPrice': 14.50, 'totalPrice': 2900.00},
            {'materialId': 2, 'name': 'Leather - Brown', 'quantity': 150, 'unit': 'sqft', 'unitPrice': 14.50, 'totalPrice': 2175.00}
        ],
        'totalAmount': 5075.00,
        'status': 'approved',
        'expectedDelivery': '2026-01-25',
        'createdAt': '2026-01-18',
        'createdBy': 2,
        'approvedAt': '2026-01-19',
        'approvedBy': 1
    }
]

# Deliveries
deliveries = [
    {
        'id': 1,
        'deliveryNumber': 'DL-2026-0001',
        'type': 'branch_restock',
        'fromBranchId': 1,
        'fromBranchName': 'Main Warehouse',
        'toBranchId': 2,
        'toBranchName': 'Branch A',
        'items': [
            {'name': 'Leather - Black', 'quantity': 50, 'unit': 'sqft'},
            {'name': 'Thread - Black', 'quantity': 100, 'unit': 'spools'}
        ],
        'status': 'in_transit',
        'scheduledDate': '2026-01-22',
        'estimatedArrival': '2026-01-22 14:00',
        'driverName': 'Pedro Garcia',
        'driverContact': '09171112233',
        'vehiclePlate': 'XYZ 789',
        'notes': 'Handle with care',
        'createdAt': '2026-01-20',
        'createdBy': 2
    },
    {
        'id': 2,
        'deliveryNumber': 'DL-2026-0002',
        'type': 'customer_delivery',
        'fromBranchId': 3,
        'fromBranchName': 'Branch B',
        'toBranchId': None,
        'toBranchName': None,
        'customerName': 'Maria Santos',
        'customerAddress': '456 Customer St, City',
        'customerPhone': '09189876543',
        'jobOrderId': 2,
        'jobOrderNumber': 'JO-BB-2026-0001',
        'items': [
            {'name': 'Motorcycle Seat - Custom', 'quantity': 1, 'unit': 'pc'}
        ],
        'status': 'delivered',
        'scheduledDate': '2026-01-20',
        'deliveredAt': '2026-01-20 10:30',
        'driverName': 'Juan Cruz',
        'driverContact': '09172223344',
        'vehiclePlate': 'ABC 123',
        'notes': '',
        'createdAt': '2026-01-19',
        'createdBy': 4
    }
]

# Void Items (unclaimed after 60 days)
void_items = []

# Audit Trail
audit_logs = [
    {'id': 1, 'userId': 1, 'userName': 'System Administrator', 'action': 'LOGIN', 'module': 'Auth', 'details': 'User logged in', 'ipAddress': '192.168.1.1', 'timestamp': '2026-01-22 08:00:00'},
    {'id': 2, 'userId': 3, 'userName': 'Jane Sales', 'action': 'CREATE', 'module': 'Job Orders', 'details': 'Created job order JO-BA-2026-0001', 'ipAddress': '192.168.1.10', 'timestamp': '2026-01-18 09:30:00'},
    {'id': 3, 'userId': 2, 'userName': 'John Supervisor', 'action': 'APPROVE', 'module': 'Purchase Orders', 'details': 'Approved PO-2026-0001', 'ipAddress': '192.168.1.5', 'timestamp': '2026-01-19 11:00:00'},
]

# Counters for ID generation
counters = {
    'user': 5,
    'raw_material': 11,
    'finished_good': 5,
    'job_order': 4,
    'lineup_slip': 2,
    'purchase_order': 2,
    'delivery': 3,
    'audit_log': 4,
    'customer_order': 1
}

# ============================================
# HELPER FUNCTIONS
# ============================================

db_initialized = False

def user_to_dict(user):
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'fullName': user.full_name,
        'role': user.role.key if user.role else None,
        'roleName': user.role.name if user.role else None,
        'branch': user.branch,
        'branchId': user.branch_id,
        'branchName': user.branch_rel.name if user.branch_rel else user.branch,
        'isActive': user.is_active
    }

def customer_order_to_dict(order):
    return {
        'id': order.id,
        'orderNumber': order.order_number,
        'customerName': order.customer_name,
        'customerPhone': order.customer_phone,
        'customerEmail': order.customer_email,
        'customerAddress': order.customer_address,
        'vehicleInfo': order.vehicle_info,
        'services': order.services,
        'notes': order.notes,
        'status': order.status,
        'branchId': order.branch_id,
        'branchName': order.branch.name if order.branch else None,
        'createdAt': fmt_dt(order.created_at),
        # Quotation fields
        'userId': order.user_id,
        'quotationItems': order.quotation_items,
        'quotationTotal': order.quotation_total,
        'quotationStatus': order.quotation_status,
        'quotationNotes': order.quotation_notes,
        'customerResponseNotes': order.customer_response_notes,
        'quotedAt': fmt_dt(order.quoted_at),
        'respondedAt': fmt_dt(order.responded_at)
    }

def branch_to_dict(branch):
    return {
        'id': branch.id,
        'name': branch.name,
        'code': branch.code,
        'address': branch.address,
        'phone': branch.phone,
        'isWarehouse': branch.is_warehouse,
        'isActive': branch.is_active,
        'createdAt': fmt_dt(branch.created_at)
    }

def seed_default_users():
    for user in default_users:
        existing = User.query.filter_by(username=user['username']).first()
        if existing:
            continue

        role = Role.query.filter_by(key=user['role']).first()
        if not role:
            continue

        branch = Branch.query.filter_by(name=user['branch']).first()

        new_user = User(
            username=user['username'],
            password=hash_password(user['password']),
            email=user['email'],
            full_name=user['fullName'],
            role_id=role.id,
            branch_id=branch.id if branch else None,
            branch=user['branch'],
            is_active=user['isActive']
        )
        db.session.add(new_user)
        db.session.flush()  # Flush to get the user ID
        
        # Create Worker profile for worker roles
        worker_roles = ['seat_maker', 'sewer', 'staff']
        if user['role'] in worker_roles:
            # Determine specialization based on role
            if user['role'] in ['seat_maker', 'sewer']:
                specialization = user['role']
            else:
                specialization = 'general'
            
            new_worker = Worker(
                user_id=new_user.id,
                worker_type='staff',
                is_available=True,
                specialization=specialization,
                branch_id=branch.id if branch else None
            )
            db.session.add(new_worker)

    db.session.commit()

def seed_inventory_items():
    if InventoryMaterial.query.count() == 0:
        pass  # No default seed data for the new inventory schema

    if PremadeProduct.query.count() == 0:
        for product in finished_goods:
            db.session.add(PremadeProduct(
                name=product['name'],
                sku=product.get('sku') or f"FG-{product['id']:03d}",
                quantity=float(product.get('quantity', 0)),
                unit=product.get('unit', 'pcs'),
                category=product.get('category', 'General'),
                price=float(product.get('price', 0)),
                cost=float(product.get('cost', 0)),
                branch_id=product.get('branchId', 1),
                is_archived=product.get('isArchived', False)
            ))

    db.session.commit()

def normalize_premade_units():
    """Ensure premade product unit values stay consistent as plain piece counts."""
    updated = False
    for item in PremadeProduct.query.all():
        if not item.unit or item.unit.strip().lower() != 'pcs':
            item.unit = 'pcs'
            updated = True

    if updated:
        db.session.commit()

def run_migrations():
    """Add new columns to existing tables without dropping data.
    Each migration runs in its own transaction so a failure (e.g. column
    already exists) does not poison the connection for subsequent migrations.
    This is required for PostgreSQL which marks the whole connection as aborted
    after any error — unlike SQLite which is more forgiving.
    """
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE inventory_materials ADD COLUMN source_job_order_id VARCHAR(50)",
        "ALTER TABLE inventory_materials ADD COLUMN status VARCHAR(20) DEFAULT 'available'",
        "ALTER TABLE material_usage_logs ADD COLUMN job_order_db_id INTEGER",
        "ALTER TABLE inventory_materials ADD COLUMN low_stock_threshold REAL DEFAULT 0",
        "ALTER TABLE inventory_materials ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)",
        "ALTER TABLE product_orders ADD COLUMN amount_paid REAL DEFAULT 0.0",
        "ALTER TABLE appointments ADD COLUMN confirmed_by INTEGER REFERENCES users(id)",
        "ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN lockout_until TIMESTAMP",
        # Expand password column for salted hashes (SQLite ignores length; PostgreSQL enforces it)
        "ALTER TABLE users ALTER COLUMN password TYPE VARCHAR(255)",
        # Transfer trackability: who sent, who received, and when
        "ALTER TABLE product_order_transfers ADD COLUMN transferred_by_id INTEGER REFERENCES users(id)",
        "ALTER TABLE product_order_transfers ADD COLUMN transferred_at TIMESTAMP",
        "ALTER TABLE product_order_transfers ADD COLUMN received_by_id INTEGER REFERENCES users(id)",
        "ALTER TABLE product_order_transfers ADD COLUMN received_at TIMESTAMP",
        "ALTER TABLE worker_assignments ADD COLUMN expected_hours REAL",
        # Material cost / markup-based selling price + supplier SKU
        "ALTER TABLE inventory_materials ADD COLUMN sku VARCHAR(100)",
        "ALTER TABLE inventory_materials ADD COLUMN cost_per_unit REAL DEFAULT 0",
        "ALTER TABLE inventory_materials ADD COLUMN markup_percent REAL DEFAULT 25",
        # Worker pay mode: per_hour, per_day, per_piece
        "ALTER TABLE managed_workers ADD COLUMN pay_mode VARCHAR(20) DEFAULT 'per_hour'",
        # Worker assignment: calendar date, type (job_order | special_task), title for special tasks
        "ALTER TABLE worker_assignments ADD COLUMN scheduled_date DATE",
        "ALTER TABLE worker_assignments ADD COLUMN assignment_type VARCHAR(20) DEFAULT 'job_order'",
        "ALTER TABLE worker_assignments ADD COLUMN special_task_title VARCHAR(255)",
        # On completion: pay override + materials snapshot
        "ALTER TABLE worker_assignments ADD COLUMN pay_override REAL",
        "ALTER TABLE worker_assignments ADD COLUMN materials_used JSON",
        # Track which managed worker used materials (FK to managed_workers)
        "ALTER TABLE material_usage_logs ADD COLUMN managed_worker_id INTEGER REFERENCES managed_workers(id)",
    ]
    for sql in migrations:
        try:
            # engine.begin() gives an auto-commit/auto-rollback transaction per statement
            with db.engine.begin() as conn:
                conn.execute(text(sql))
        except Exception:
            pass  # Column already exists or statement not supported on this DB

def init_db():
    db.create_all()
    run_migrations()

    # Seed roles
    for role in default_roles:
        existing = Role.query.filter_by(key=role['key']).first()
        if not existing:
            db.session.add(Role(key=role['key'], name=role['name']))

    # Seed default system settings
    default_settings = [
        ('inventory_low_stock_threshold', '0'),
        # Default markup applied to a material's cost to derive its selling unit price
        ('default_material_markup', '25'),
    ]
    for key, value in default_settings:
        if not SystemSetting.query.filter_by(key=key).first():
            db.session.add(SystemSetting(key=key, value=value))

    db.session.commit()

    # Seed branches
    default_branches = [
        {'name': 'Main Warehouse', 'code': 'MW', 'address': '123 Main St', 'is_warehouse': True},
        {'name': 'Branch A', 'code': 'BA', 'address': '456 Branch A St', 'is_warehouse': False},
        {'name': 'Branch B', 'code': 'BB', 'address': '789 Branch B St', 'is_warehouse': False},
        {'name': 'Branch C', 'code': 'BC', 'address': '321 Branch C St', 'is_warehouse': False},
    ]
    
    for branch_data in default_branches:
        existing = Branch.query.filter_by(code=branch_data['code']).first()
        if not existing:
            db.session.add(Branch(
                name=branch_data['name'],
                code=branch_data['code'],
                address=branch_data['address'],
                is_warehouse=branch_data['is_warehouse'],
                is_active=True
            ))
    
    db.session.commit()

    # Seed users
    seed_default_users()
    seed_inventory_items()
    normalize_premade_units()

    # Seed default catalog items
    if CatalogItem.query.count() == 0:
        default_catalog = [
            CatalogItem(title='Toyota Vios 2025', description='Latest model with modern features and exceptional fuel efficiency.', tag='New Arrival', image_url='/pictures/Toyota Vios 2025.jpg', sort_order=1),
            CatalogItem(title='Mitsubishi TRITON 2025', description='Powerful pickup truck built for adventure and heavy-duty performance.', tag='Best Seller', image_url='/pictures/Mitsubishi TRITON 2025.jpg', sort_order=2),
            CatalogItem(title='Toyota Grandia GL 2024', description='Spacious family van with premium comfort and reliability.', tag='Premium', image_url='/pictures/Toyota_Grandia_GL_2024.jpg', sort_order=3),
            CatalogItem(title='Toyota Vios 2020', description='Trusted sedan with proven performance and value.', tag='Classic', image_url='/pictures/Toyota Vios 2020.jpg', sort_order=4),
        ]
        for item in default_catalog:
            db.session.add(item)
        db.session.commit()

def get_user_from_token(token):
    """Get user from session token"""
    if token in sessions:
        user_id = sessions[token]['userId']
        user = User.query.get(user_id)
        if user:
            return user_to_dict(user)
    return None

def require_auth(f):
    """Decorator for protected routes"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        user = get_user_from_token(token)
        if not user:
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
        request.current_user = user
        return f(*args, **kwargs)
    return decorated

def require_roles(*roles):
    """Decorator for role-based access"""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(request, 'current_user'):
                return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
            if request.current_user['role'] not in roles:
                return jsonify({'status': 'error', 'message': 'Forbidden - Insufficient permissions'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

PH_OFFSET = timedelta(hours=8)

# ============================================
# PASSWORD HELPERS
# ============================================

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

def hash_password(raw_password: str) -> str:
    """Hash a password using PBKDF2-SHA256 with a random salt (werkzeug)."""
    return generate_password_hash(raw_password)

def verify_password(user, raw_password: str) -> bool:
    """Verify a password against the stored hash.
    Supports both the old plain-SHA256 format and the new salted werkzeug format.
    If the old format matches it silently upgrades the hash in-place.
    """
    stored = user.password
    # New salted format from werkzeug
    if stored.startswith('pbkdf2:') or stored.startswith('scrypt:'):
        return check_password_hash(stored, raw_password)
    # Legacy format: plain SHA-256 hex digest (no salt)
    legacy_hash = hashlib.sha256(raw_password.encode()).hexdigest()
    if legacy_hash == stored:
        # Upgrade to salted hash on the spot — no commit here, caller does it
        user.password = generate_password_hash(raw_password)
        return True
    return False

def to_pht(dt):
    """Convert a UTC datetime to Philippine Time (UTC+8) ISO-8601 string."""
    if dt is None:
        return None
    return (dt + PH_OFFSET).strftime('%Y-%m-%dT%H:%M:%S+08:00')

def now_pht():
    """Current Philippine Time as a formatted string for audit logs."""
    return (datetime.utcnow() + PH_OFFSET).strftime('%Y-%m-%d %H:%M:%S PHT')

MAX_ACTIVE_APPOINTMENTS = 2   # per phone number
MAX_ACTIVE_ORDERS = 3         # per phone number
MAX_STRIKES_BEFORE_BLOCK = 3  # no-shows / fake orders before auto-block

def check_spam_protection(phone: str, check_type: str = 'appointment'):
    """Return (allowed: bool, error_message: str | None).
    check_type: 'appointment' or 'order'
    Checks:
      1. Phone is on the blocklist.
      2. Too many active records for this phone.
      3. Duplicate booking on same branch+date within 24 h (appointments only).
    """
    if not phone:
        return True, None

    record = PhoneBlacklist.query.filter_by(phone_number=phone).first()
    if record and record.is_blocked:
        return False, (
            'This phone number has been blocked due to repeated no-shows or fake orders. '
            'Please contact the branch to resolve this.'
        )

    if check_type == 'appointment':
        active_count = Appointment.query.filter(
            Appointment.customer_phone == phone,
            Appointment.status.in_(['pending', 'confirmed'])
        ).count()
        if active_count >= MAX_ACTIVE_APPOINTMENTS:
            return False, (
                f'You already have {active_count} active appointment request(s). '
                f'Please wait for them to be completed before booking a new one.'
            )
    else:
        active_count = ProductOrder.query.filter(
            ProductOrder.customer_phone == phone,
            ProductOrder.status.in_(['pending', 'processing', 'ready'])
        ).count()
        if active_count >= MAX_ACTIVE_ORDERS:
            return False, (
                f'You already have {active_count} active order(s). '
                f'Please wait for them to be completed before placing a new one.'
            )

    return True, None


def add_strike(phone: str, reason: str):
    """Add a strike to a phone number. Auto-blocks at MAX_STRIKES_BEFORE_BLOCK."""
    record = PhoneBlacklist.query.filter_by(phone_number=phone).first()
    if not record:
        record = PhoneBlacklist(phone_number=phone, strike_count=0, is_blocked=False)
        db.session.add(record)

    record.strike_count = (record.strike_count or 0) + 1
    record.reason = reason
    record.updated_at = datetime.utcnow()

    if record.strike_count >= MAX_STRIKES_BEFORE_BLOCK:
        record.is_blocked = True
        record.blocked_at = datetime.utcnow()

    db.session.commit()
    return record


def log_action(user_id, user_name, action, module, details, ip_address='0.0.0.0'):
    """Log user action to audit trail"""
    global counters
    audit_logs.append({
        'id': counters['audit_log'],
        'userId': user_id,
        'userName': user_name,
        'action': action,
        'module': module,
        'details': details,
        'ipAddress': ip_address,
        'timestamp': now_pht()
    })
    counters['audit_log'] += 1

@app.before_request
def ensure_db_initialized():
    global db_initialized
    if not db_initialized:
        init_db()
        db_initialized = True
    else:
        # Ensure default users exist (safe no-op when already seeded)
        seed_default_users()

def generate_job_order_id(branch_code):
    """Generate unique job order ID"""
    year = datetime.now().year
    prefix = f'JO-{branch_code}-{year}-'

    existing_ids = [
        row[0]
        for row in db.session.query(JobOrder.job_order_id)
        .filter(JobOrder.job_order_id.like(f'{prefix}%'))
        .all()
        if row[0]
    ]
    existing_ids.extend(
        jo['jobOrderId']
        for jo in job_orders
        if jo.get('jobOrderId', '').startswith(prefix)
    )

    next_sequence = 1
    for job_order_id in existing_ids:
        try:
            sequence = int(job_order_id.rsplit('-', 1)[-1])
        except (TypeError, ValueError):
            continue
        next_sequence = max(next_sequence, sequence + 1)

    return f'{prefix}{next_sequence:04d}'

def generate_lineup_slip_number(branch_code):
    """Generate unique lineup slip number"""
    year = datetime.now().year
    count = sum(1 for ls in lineup_slips if ls['slipNumber'].startswith(f'LS-{branch_code}-{year}')) + 1
    return f'LS-{branch_code}-{year}-{count:04d}'

def generate_po_number():
    """Generate unique PO number"""
    year = datetime.now().year
    count = len([po for po in purchase_orders if po['poNumber'].startswith(f'PO-{year}')]) + 1
    return f'PO-{year}-{count:04d}'

def generate_delivery_number():
    """Generate unique delivery number"""
    year = datetime.now().year
    count = len([d for d in deliveries if d['deliveryNumber'].startswith(f'DL-{year}')]) + 1
    return f'DL-{year}-{count:04d}'

# ============================================
# AUTHENTICATION ROUTES
# ============================================

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username', '')
    raw_password = data.get('password', '')

    user = User.query.filter_by(username=username, is_active=True).first()

    if not user:
        return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401

    # Check if account is locked
    now_utc = datetime.utcnow()
    if user.lockout_until and user.lockout_until > now_utc:
        remaining_secs = int((user.lockout_until - now_utc).total_seconds())
        remaining_mins = (remaining_secs // 60) + 1
        log_action(0, username, 'LOGIN_BLOCKED', 'Auth',
                   f'Login attempt blocked — account locked for {remaining_mins} more minute(s)',
                   request.remote_addr or '0.0.0.0')
        return jsonify({
            'status': 'error',
            'message': f'Account is locked due to too many failed attempts. Try again in {remaining_mins} minute(s).',
            'lockedOut': True,
            'retryAfterSeconds': remaining_secs
        }), 429

    # Verify password (supports legacy SHA-256 and new salted hash)
    if not verify_password(user, raw_password):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        attempts_left = MAX_FAILED_ATTEMPTS - user.failed_login_attempts
        if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            user.lockout_until = now_utc + timedelta(minutes=LOCKOUT_MINUTES)
            db.session.commit()
            log_action(user.id, user.full_name, 'LOGIN_LOCKED', 'Auth',
                       f'Account locked after {MAX_FAILED_ATTEMPTS} failed attempts',
                       request.remote_addr or '0.0.0.0')
            return jsonify({
                'status': 'error',
                'message': f'Too many failed attempts. Account locked for {LOCKOUT_MINUTES} minutes.',
                'lockedOut': True,
                'retryAfterSeconds': LOCKOUT_MINUTES * 60
            }), 429
        db.session.commit()
        log_action(user.id, user.full_name, 'LOGIN_FAILED', 'Auth',
                   f'Failed login attempt {user.failed_login_attempts}/{MAX_FAILED_ATTEMPTS}',
                   request.remote_addr or '0.0.0.0')
        return jsonify({
            'status': 'error',
            'message': f'Invalid credentials. {attempts_left} attempt(s) remaining before lockout.',
            'attemptsLeft': attempts_left
        }), 401

    # Successful login — reset lockout counters and upgrade legacy hash if needed
    user.failed_login_attempts = 0
    user.lockout_until = None

    # Invalidate any existing sessions for this user (prevent concurrent logins)
    existing_tokens = [t for t, s in sessions.items() if s.get('userId') == user.id]
    for t in existing_tokens:
        del sessions[t]

    token = secrets.token_hex(32)
    sessions[token] = {
        'id': user.id,
        'userId': user.id,
        'username': user.username,
        'email': user.email,
        'fullName': user.full_name,
        'role': user.role.key if user.role else None,
        'roleName': user.role.name if user.role else None,
        'branch': user.branch,
        'branchId': user.branch_id,
        'isActive': user.is_active,
        'createdAt': fmt_dt(datetime.utcnow())
    }

    db.session.commit()
    log_action(user.id, user.full_name, 'LOGIN', 'Auth', 'User logged in', request.remote_addr or '0.0.0.0')

    return jsonify({
        'status': 'success',
        'data': {
            'token': token,
            'user': user_to_dict(user)
        }
    })

@app.route('/api/auth/logout', methods=['POST'])
@require_auth
def logout():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token in sessions:
        log_action(request.current_user['id'], request.current_user['fullName'], 'LOGOUT', 'Auth', 'User logged out', request.remote_addr or '0.0.0.0')
        del sessions[token]
    return jsonify({'status': 'success', 'message': 'Logged out successfully'})

@app.route('/api/auth/me', methods=['GET'])
@require_auth
def get_current_user():
    user = request.current_user
    return jsonify({
        'status': 'success',
        'data': {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'fullName': user['fullName'],
            'role': user['role'],
            'branch': user['branch']
        }
    })

@app.route('/api/auth/recover', methods=['POST'])
def recover_account():
    data = request.get_json()
    email = data.get('email', '')
    
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'status': 'success', 'message': 'If the email exists, a recovery link has been sent'})
    
    # In production, send actual email
    recovery_token = secrets.token_hex(32)
    return jsonify({
        'status': 'success',
        'message': 'If the email exists, a recovery link has been sent',
        'debug_token': recovery_token  # Remove in production
    })

# ============================================
# DASHBOARD ROUTES
# ============================================

@app.route('/api/dashboard/stats', methods=['GET'])
@require_auth
def get_dashboard_stats():
    user = request.current_user
    role = user['role']
    
    # Calculate stats based on role
    total_job_orders = len(job_orders)
    pending_orders = len([jo for jo in job_orders if jo['status'] == 'pending'])
    in_progress_orders = len([jo for jo in job_orders if jo['status'] == 'in_progress'])
    completed_orders = len([jo for jo in job_orders if jo['status'] == 'completed'])
    
    total_revenue = sum(jo['totalPrice'] for jo in job_orders if jo['status'] == 'completed')
    total_cost = sum(jo['actualCost'] for jo in job_orders if jo['status'] == 'completed')
    profit = total_revenue - total_cost
    
    low_stock_count = len([rm for rm in raw_materials if rm['quantity'] <= rm['reorderPoint'] and not rm['isArchived']])
    
    pending_deliveries = len([d for d in deliveries if d['status'] in ['scheduled', 'in_transit']])
    
    stats = {
        'totalJobOrders': total_job_orders,
        'pendingOrders': pending_orders,
        'inProgressOrders': in_progress_orders,
        'completedOrders': completed_orders,
        'totalRevenue': total_revenue,
        'totalCost': total_cost,
        'profit': profit,
        'profitMargin': round((profit / total_revenue * 100), 2) if total_revenue > 0 else 0,
        'lowStockItems': low_stock_count,
        'pendingDeliveries': pending_deliveries,
        'totalRawMaterials': len([rm for rm in raw_materials if not rm['isArchived']]),
        'totalFinishedGoods': len([fg for fg in finished_goods if not fg['isArchived']])
    }
    
    # Role-specific data
    if role == 'administrator':
        stats['totalUsers'] = User.query.filter_by(is_active=True).count()
        stats['totalBranches'] = len([b for b in branches if b['isActive']])
    
    return jsonify({'status': 'success', 'data': stats})

@app.route('/api/dashboard/recent-activity', methods=['GET'])
@require_auth
def get_recent_activity():
    recent_orders = sorted(job_orders, key=lambda x: x['updatedAt'], reverse=True)[:5]
    recent_deliveries = sorted(deliveries, key=lambda x: x['createdAt'], reverse=True)[:5]
    
    activities = []
    for jo in recent_orders:
        activities.append({
            'type': 'job_order',
            'title': f"Job Order {jo['jobOrderId']}",
            'description': f"{jo['customerName']} - {jo['status'].replace('_', ' ').title()}",
            'timestamp': jo['updatedAt'],
            'status': jo['status']
        })
    
    for d in recent_deliveries:
        activities.append({
            'type': 'delivery',
            'title': f"Delivery {d['deliveryNumber']}",
            'description': f"To {d.get('toBranchName') or d.get('customerName')} - {d['status'].replace('_', ' ').title()}",
            'timestamp': d['createdAt'],
            'status': d['status']
        })
    
    activities.sort(key=lambda x: x['timestamp'], reverse=True)
    
    return jsonify({'status': 'success', 'data': activities[:10]})

@app.route('/api/dashboard/alerts', methods=['GET'])
@require_auth
def get_alerts():
    alerts = []
    
    # Low stock alerts
    for rm in raw_materials:
        if rm['quantity'] <= rm['reorderPoint'] and not rm['isArchived']:
            alerts.append({
                'type': 'low_stock',
                'severity': 'warning' if rm['quantity'] > 0 else 'critical',
                'title': f"Low Stock: {rm['name']}",
                'description': f"Current: {rm['quantity']} {rm['unit']} (Reorder at: {rm['reorderPoint']})",
                'itemId': rm['id']
            })
    
    # Pending deliveries
    for d in deliveries:
        if d['status'] == 'scheduled' and d['scheduledDate'] <= datetime.now().strftime('%Y-%m-%d'):
            alerts.append({
                'type': 'delivery_due',
                'severity': 'info',
                'title': f"Delivery Due: {d['deliveryNumber']}",
                'description': f"Scheduled for {d['scheduledDate']}",
                'itemId': d['id']
            })
    
    # Overdue job orders
    for jo in job_orders:
        if jo['status'] not in ['completed', 'cancelled'] and jo['estimatedCompletion'] < datetime.now().strftime('%Y-%m-%d'):
            alerts.append({
                'type': 'overdue_order',
                'severity': 'warning',
                'title': f"Overdue: {jo['jobOrderId']}",
                'description': f"Was due on {jo['estimatedCompletion']}",
                'itemId': jo['id']
            })
    
    return jsonify({'status': 'success', 'data': alerts})

# ============================================
# INVENTORY ROUTES - RAW MATERIALS
# ============================================

def material_to_dict(material):
    return {
        'id': material.id,
        'itemId': material.item_id or str(material.id),
        'materialType': material.material_type,
        'color': material.color or '',
        'pattern': material.pattern or '',
        'unitPrice': float(material.unit_price),
        'costPerUnit': float(material.cost_per_unit or 0),
        'markupPercent': float(material.markup_percent if material.markup_percent is not None else 25),
        'sku': material.sku or '',
        'stockQuantity': float(material.stock_quantity),
        'lowStockThreshold': float(material.low_stock_threshold or 0),
        'supplierId': material.supplier_id,
        'supplierName': material.supplier.name if material.supplier else None,
        'branchId': material.branch_id,
        'isArchived': material.is_archived,
        'sourceJobOrderId': material.source_job_order_id,
        'status': material.status or 'available',
        'lastUpdated': material.updated_at.strftime('%Y-%m-%d') if material.updated_at else None
    }

def build_raw_material_group_key(material):
    return f"{material.material_type.lower()}|{material.color.lower()}|{material.pattern.lower()}"

def raw_material_group_to_dict(materials, include_components=True):
    first = materials[0]
    group_key = build_raw_material_group_key(first)
    total_stock_quantity = sum(float(m.stock_quantity or 0) for m in materials)

    return {
        'key': group_key,
        'name': first.material_type,
        'color': first.color or '',
        'pattern': first.pattern or '',
        'unitPrice': float(first.unit_price),
        'totalStockQuantity': total_stock_quantity,
        'components': [material_to_dict(m) for m in materials] if include_components else []
    }

def premade_product_to_dict(product):
    return {
        'id': product.id,
        'name': product.name,
        'sku': product.sku,
        'quantity': float(product.quantity),
        'unit': product.unit,
        'category': product.category,
        'price': float(product.price),
        'cost': float(product.cost),
        'branchId': product.branch_id,
        'branchName': product.branch.name if product.branch else None,
        'isArchived': product.is_archived,
        'lastUpdated': product.updated_at.strftime('%Y-%m-%d') if product.updated_at else None
    }

def material_usage_to_dict(log):
    return {
        'id': log.id,
        'materialId': log.material_id,
        'materialName': log.material.material_type if log.material else None,
        'materialUnit': '',
        'premadeProductId': log.premade_product_id,
        'premadeProductName': log.premade_product.name if log.premade_product else None,
        'quantityUsed': float(log.quantity_used),
        'usedInType': log.used_in_type,
        'usedInReference': log.used_in_reference,
        'branchId': log.branch_id,
        'branchName': log.branch.name if log.branch else None,
        'usedBy': log.used_by,
        'usedByName': log.used_by_user.full_name if log.used_by_user else None,
        'managedWorkerId': log.managed_worker_id,
        'workerName': log.managed_worker.name if log.managed_worker else None,
        'notes': log.notes,
        'usedAt': fmt_dt(log.created_at)
    }

@app.route('/api/inventory/raw-materials', methods=['GET'])
@require_auth
def get_raw_materials():
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'
    branch_id = request.args.get('branchId')
    include_warehouse = request.args.get('includeWarehouse', 'false').lower() == 'true'
    category = request.args.get('category')

    query = InventoryMaterial.query
    if not include_archived:
        query = query.filter_by(is_archived=False)
    if branch_id:
        branch_id_int = int(branch_id)
        if include_warehouse:
            warehouse = Branch.query.filter_by(is_warehouse=True).first()
            warehouse_id = warehouse.id if warehouse else 1
            if branch_id_int != warehouse_id:
                query = query.filter(InventoryMaterial.branch_id.in_([branch_id_int, warehouse_id]))
            else:
                query = query.filter_by(branch_id=branch_id_int)
        else:
            query = query.filter_by(branch_id=branch_id_int)
    if category:
        query = query.filter_by(category=category)

    items = query.order_by(InventoryMaterial.material_type.asc()).all()
    return jsonify({'status': 'success', 'data': [material_to_dict(m) for m in items]})

@app.route('/api/inventory/raw-materials/summary', methods=['GET'])
@require_auth
def get_raw_materials_summary():
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'
    include_components = request.args.get('includeComponents', 'false').lower() == 'true'
    branch_id = request.args.get('branchId')
    category = request.args.get('category')

    query = InventoryMaterial.query
    if not include_archived:
        query = query.filter_by(is_archived=False)
    if branch_id:
        query = query.filter_by(branch_id=int(branch_id))
    if category:
        query = query.filter_by(category=category)

    items = query.order_by(InventoryMaterial.material_type.asc(), InventoryMaterial.created_at.asc()).all()

    grouped = {}
    for material in items:
        key = build_raw_material_group_key(material)
        grouped.setdefault(key, []).append(material)

    summaries = [raw_material_group_to_dict(group_items, include_components=include_components) for _, group_items in grouped.items()]
    summaries.sort(key=lambda x: x['name'])
    return jsonify({'status': 'success', 'data': summaries})

@app.route('/api/inventory/raw-materials/group-detail', methods=['GET'])
@require_auth
def get_raw_material_group_detail():
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'
    branch_id = request.args.get('branchId')
    group_key = request.args.get('key')

    if not group_key:
        return jsonify({'status': 'error', 'message': 'Group key is required'}), 400

    query = InventoryMaterial.query
    if not include_archived:
        query = query.filter_by(is_archived=False)
    if branch_id:
        query = query.filter_by(branch_id=int(branch_id))

    items = query.order_by(InventoryMaterial.material_type.asc(), InventoryMaterial.created_at.asc()).all()
    group_items = [m for m in items if build_raw_material_group_key(m) == group_key]

    if not group_items:
        return jsonify({'status': 'error', 'message': 'Material group not found'}), 404

    return jsonify({'status': 'success', 'data': raw_material_group_to_dict(group_items, include_components=True)})

@app.route('/api/inventory/raw-materials/<int:material_id>', methods=['GET'])
@require_auth
def get_raw_material(material_id):
    material = InventoryMaterial.query.get(material_id)
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404
    return jsonify({'status': 'success', 'data': material_to_dict(material)})

@app.route('/api/inventory/raw-materials', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def create_raw_material():
    data = request.get_json()

    required = ['materialType', 'stockQuantity', 'branchId']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    # Selling price may be given directly (unitPrice) or derived from cost + markup
    if 'unitPrice' not in data and 'costPerUnit' not in data:
        return jsonify({'status': 'error', 'message': 'Either unitPrice or costPerUnit is required'}), 400

    branch = Branch.query.get(data['branchId'])
    if not branch or not branch.is_active:
        return jsonify({'status': 'error', 'message': 'Invalid or inactive branch'}), 400

    custom_item_id = data.get('itemId', '').strip() if data.get('itemId') else None
    if custom_item_id:
        existing = InventoryMaterial.query.filter_by(item_id=custom_item_id).first()
        if existing:
            return jsonify({'status': 'error', 'message': f'Item ID "{custom_item_id}" already exists'}), 400

    source_job_order_id = data.get('sourceJobOrderId', '').strip() or None
    material_status = data.get('status', 'available').strip()
    if material_status not in ('available', 'needed'):
        material_status = 'available'

    supplier_id = int(data['supplierId']) if data.get('supplierId') else None

    cost_per_unit = float(data['costPerUnit']) if data.get('costPerUnit') not in (None, '') else 0.0
    markup_percent = float(data['markupPercent']) if data.get('markupPercent') not in (None, '') else 25.0
    # If a selling price is supplied use it; otherwise derive it from cost + markup
    if data.get('unitPrice') not in (None, ''):
        unit_price = float(data['unitPrice'])
    else:
        unit_price = round(cost_per_unit * (1 + markup_percent / 100), 2)

    material = InventoryMaterial(
        item_id=custom_item_id,
        material_type=data['materialType'].strip(),
        color=data.get('color', '').strip(),
        pattern=data.get('pattern', '').strip(),
        unit_price=unit_price,
        cost_per_unit=cost_per_unit,
        markup_percent=markup_percent,
        sku=(data.get('sku', '').strip() or None),
        stock_quantity=float(data['stockQuantity']),
        low_stock_threshold=float(data.get('lowStockThreshold', 0) or 0),
        supplier_id=supplier_id,
        branch_id=int(data['branchId']),
        is_archived=False,
        source_job_order_id=source_job_order_id,
        status=material_status
    )

    db.session.add(material)
    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Inventory',
               f"Created inventory item: {material.material_type}" + (f" (needed for {source_job_order_id})" if source_job_order_id else ""),
               request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': material_to_dict(material)}), 201

@app.route('/api/inventory/raw-materials/<int:material_id>', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor')
def update_raw_material(material_id):
    material = InventoryMaterial.query.get(material_id)
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404

    data = request.get_json()

    if 'materialType' in data:
        material.material_type = data['materialType'].strip()
    if 'color' in data:
        material.color = data['color'].strip()
    if 'pattern' in data:
        material.pattern = data['pattern'].strip()
    if 'sku' in data:
        material.sku = data['sku'].strip() or None
    if 'costPerUnit' in data:
        material.cost_per_unit = float(data['costPerUnit'] or 0)
    if 'markupPercent' in data:
        material.markup_percent = float(data['markupPercent'] if data['markupPercent'] not in (None, '') else 25)
    # A directly-supplied unitPrice wins; otherwise recompute from cost + markup when either changed
    if 'unitPrice' in data and data['unitPrice'] not in (None, ''):
        material.unit_price = float(data['unitPrice'])
    elif 'costPerUnit' in data or 'markupPercent' in data:
        material.unit_price = round((material.cost_per_unit or 0) * (1 + (material.markup_percent if material.markup_percent is not None else 25) / 100), 2)
    if 'stockQuantity' in data:
        material.stock_quantity = float(data['stockQuantity'])
    if 'lowStockThreshold' in data:
        material.low_stock_threshold = float(data['lowStockThreshold'] or 0)
    if 'supplierId' in data:
        material.supplier_id = int(data['supplierId']) if data['supplierId'] else None
    if 'branchId' in data:
        branch = Branch.query.get(data['branchId'])
        if not branch or not branch.is_active:
            return jsonify({'status': 'error', 'message': 'Invalid or inactive branch'}), 400
        material.branch_id = int(data['branchId'])

    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Inventory', f"Updated inventory item: {material.material_type}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': material_to_dict(material)})

@app.route('/api/inventory/raw-materials/<int:material_id>/archive', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def archive_raw_material(material_id):
    material = InventoryMaterial.query.get(material_id)
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404

    material.is_archived = True
    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'ARCHIVE', 'Inventory', f"Archived inventory item: {material.material_type}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'message': 'Material archived'})

@app.route('/api/inventory/raw-materials/<int:material_id>/restore', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def restore_raw_material(material_id):
    material = InventoryMaterial.query.get(material_id)
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404

    material.is_archived = False
    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'RESTORE', 'Inventory', f"Restored inventory item: {material.material_type}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'message': 'Material restored'})

# ============================================
# INVENTORY ROUTES - FINISHED GOODS
# ============================================

@app.route('/api/inventory/finished-goods', methods=['GET'])
@require_auth
def get_finished_goods():
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'
    branch_id = request.args.get('branchId')

    query = PremadeProduct.query
    if not include_archived:
        query = query.filter_by(is_archived=False)
    if branch_id:
        query = query.filter_by(branch_id=int(branch_id))

    items = query.order_by(PremadeProduct.name.asc()).all()

    return jsonify({'status': 'success', 'data': [premade_product_to_dict(i) for i in items]})

@app.route('/api/inventory/finished-goods', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def create_finished_good():
    data = request.get_json()

    required = ['name', 'quantity', 'category', 'price', 'branchId', 'materialsUsed']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400

    if not isinstance(data.get('materialsUsed'), list) or len(data.get('materialsUsed')) == 0:
        return jsonify({'status': 'error', 'message': 'Please provide materials used for this premade product'}), 400

    branch = Branch.query.get(data['branchId'])
    if not branch or not branch.is_active:
        return jsonify({'status': 'error', 'message': 'Invalid or inactive branch'}), 400

    usage_entries = []
    computed_cost = 0
    for idx, used in enumerate(data.get('materialsUsed', [])):
        material_id = used.get('materialId')
        quantity_used = used.get('quantityUsed')

        try:
            quantity_used = float(quantity_used)
        except (TypeError, ValueError):
            return jsonify({'status': 'error', 'message': f'Invalid quantity used for material at row {idx + 1}'}), 400

        if quantity_used <= 0:
            return jsonify({'status': 'error', 'message': f'Quantity used must be greater than zero at row {idx + 1}'}), 400

        warehouse = Branch.query.filter_by(is_warehouse=True).first()
        warehouse_id = warehouse.id if warehouse else None
        allowed_branch_ids = [int(data['branchId'])]
        if warehouse_id and warehouse_id != int(data['branchId']):
            allowed_branch_ids.append(warehouse_id)
        material = InventoryMaterial.query.filter(
            InventoryMaterial.id == material_id,
            InventoryMaterial.branch_id.in_(allowed_branch_ids),
            InventoryMaterial.is_archived.is_(False)
        ).first()
        if not material:
            return jsonify({'status': 'error', 'message': f'Material not found or unavailable at row {idx + 1}'}), 400

        if float(material.stock_quantity) < quantity_used:
            return jsonify({'status': 'error', 'message': f'Insufficient stock for {material.material_type}. Available: {float(material.stock_quantity)}'}), 400

        usage_entries.append({'material': material, 'quantityUsed': quantity_used})
        computed_cost += float(material.unit_price) * quantity_used

    next_id = (db.session.query(db.func.max(PremadeProduct.id)).scalar() or 0) + 1
    product = PremadeProduct(
        name=data['name'].strip(),
        sku=data.get('sku') or f"FG-{next_id:03d}",
        quantity=float(data['quantity']),
        unit='pcs',
        category=data['category'],
        price=float(data['price']),
        cost=float(data.get('cost', computed_cost)),
        branch_id=int(data['branchId']),
        is_archived=False
    )

    db.session.add(product)

    # Flush so product.id is available for usage logs before commit.
    db.session.flush()

    for entry in usage_entries:
        material = entry['material']
        quantity_used = entry['quantityUsed']
        material.stock_quantity = float(material.stock_quantity) - quantity_used

        db.session.add(MaterialUsageLog(
            material_id=material.id,
            premade_product_id=product.id,
            quantity_used=quantity_used,
            used_in_type='premade_product',
            used_in_reference=f"{product.sku} - {product.name}",
            branch_id=product.branch_id,
            used_by=request.current_user['id'],
            notes=f"Used to add premade product stock (qty: {product.quantity})"
        ))

    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Inventory', f"Created finished good: {product.name}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': premade_product_to_dict(product)}), 201

@app.route('/api/inventory/finished-goods/<int:item_id>', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor')
def update_finished_good(item_id):
    product = PremadeProduct.query.get(item_id)
    if not product:
        return jsonify({'status': 'error', 'message': 'Premade product not found'}), 404

    data = request.get_json()

    if 'name' in data:
        product.name = data['name'].strip()
    if 'sku' in data:
        product.sku = data['sku']
    if 'quantity' in data:
        product.quantity = float(data['quantity'])
    product.unit = 'pcs'
    if 'category' in data:
        product.category = data['category']
    if 'price' in data:
        product.price = float(data['price'])
    if 'cost' in data:
        product.cost = float(data['cost'])
    if 'branchId' in data:
        branch = Branch.query.get(data['branchId'])
        if not branch or not branch.is_active:
            return jsonify({'status': 'error', 'message': 'Invalid or inactive branch'}), 400
        product.branch_id = int(data['branchId'])

    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Inventory', f"Updated finished good: {product.name}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': premade_product_to_dict(product)})

@app.route('/api/inventory/material-usage', methods=['GET'])
@require_auth
def get_material_usage_logs():
    branch_id = request.args.get('branchId')
    material_id = request.args.get('materialId')

    query = MaterialUsageLog.query
    if branch_id:
        query = query.filter_by(branch_id=int(branch_id))
    if material_id:
        query = query.filter_by(material_id=int(material_id))

    logs = query.order_by(MaterialUsageLog.created_at.desc()).limit(300).all()
    return jsonify({'status': 'success', 'data': [material_usage_to_dict(log) for log in logs]})

@app.route('/api/inventory/finished-goods/public', methods=['GET'])
def get_finished_goods_public():
    """Public API to get available finished goods (products) for customers.
    Only returns products from active, non-warehouse retail branches."""
    branch_id = request.args.get('branchId')
    category = request.args.get('category')

    query = PremadeProduct.query.join(
        Branch, PremadeProduct.branch_id == Branch.id
    ).filter(
        PremadeProduct.is_archived.is_(False),
        PremadeProduct.quantity > 0,
        Branch.is_warehouse.is_(False),
        Branch.is_active.is_(True)
    )

    if branch_id:
        query = query.filter(PremadeProduct.branch_id == int(branch_id))

    if category:
        query = query.filter(db.func.lower(PremadeProduct.category) == category.lower())

    items = query.order_by(PremadeProduct.name.asc()).all()

    public_items = [{
        'id': item.id,
        'name': item.name,
        'sku': item.sku,
        'quantity': float(item.quantity),
        'unit': item.unit,
        'category': item.category,
        'price': float(item.price),
        'branchId': item.branch_id,
        'branchName': item.branch.name if item.branch else None
    } for item in items]

    return jsonify({'status': 'success', 'data': public_items})

@app.route('/api/inventory/categories', methods=['GET'])
@require_auth
def get_categories():
    rm_categories = sorted({m.material_type for m in InventoryMaterial.query.filter_by(is_archived=False).all() if m.material_type})
    fg_categories = sorted({p.category for p in PremadeProduct.query.filter_by(is_archived=False).all() if p.category})
    
    return jsonify({
        'status': 'success',
        'data': {
            'rawMaterials': rm_categories,
            'finishedGoods': fg_categories
        }
    })

@app.route('/api/inventory/low-stock', methods=['GET'])
@require_auth
def get_low_stock_items():
    threshold_setting = SystemSetting.query.filter_by(key='inventory_low_stock_threshold').first()
    threshold = float(threshold_setting.value) if threshold_setting and threshold_setting.value else 0

    if threshold > 0:
        from sqlalchemy import or_
        low_stock = InventoryMaterial.query.filter(
            InventoryMaterial.is_archived.is_(False),
            or_(
                InventoryMaterial.stock_quantity <= 0,
                InventoryMaterial.stock_quantity <= threshold
            )
        ).order_by(InventoryMaterial.stock_quantity.asc()).all()
    else:
        low_stock = InventoryMaterial.query.filter(
            InventoryMaterial.is_archived.is_(False),
            InventoryMaterial.stock_quantity <= 0
        ).order_by(InventoryMaterial.stock_quantity.asc()).all()

    return jsonify({'status': 'success', 'data': [material_to_dict(m) for m in low_stock]})

# ============================================
# INVENTORY - SUPPLIERS
# ============================================

def supplier_to_dict(s):
    return {
        'id': s.id,
        'name': s.name,
        'contactPerson': s.contact_person,
        'phone': s.phone,
        'email': s.email,
        'address': s.address,
        'materialsSupplied': s.materials_supplied,
        'notes': s.notes,
        'isActive': s.is_active,
        'createdAt': s.created_at.strftime('%Y-%m-%d') if s.created_at else None,
    }

@app.route('/api/inventory/suppliers', methods=['GET'])
@require_auth
def get_suppliers():
    include_inactive = request.args.get('includeInactive', 'false').lower() == 'true'
    query = Supplier.query
    if not include_inactive:
        query = query.filter_by(is_active=True)
    suppliers = query.order_by(Supplier.name.asc()).all()
    return jsonify({'status': 'success', 'data': [supplier_to_dict(s) for s in suppliers]})

@app.route('/api/inventory/suppliers', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def create_supplier():
    data = request.get_json()
    if not data.get('name', '').strip():
        return jsonify({'status': 'error', 'message': 'Supplier name is required'}), 400
    supplier = Supplier(
        name=data['name'].strip(),
        contact_person=data.get('contactPerson', '').strip() or None,
        phone=data.get('phone', '').strip() or None,
        email=data.get('email', '').strip() or None,
        address=data.get('address', '').strip() or None,
        materials_supplied=data.get('materialsSupplied', '').strip() or None,
        notes=data.get('notes', '').strip() or None,
    )
    db.session.add(supplier)
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Inventory', f"Created supplier: {supplier.name}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': supplier_to_dict(supplier)}), 201

@app.route('/api/inventory/suppliers/<int:supplier_id>', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor')
def update_supplier(supplier_id):
    supplier = Supplier.query.get(supplier_id)
    if not supplier:
        return jsonify({'status': 'error', 'message': 'Supplier not found'}), 404
    data = request.get_json()
    if 'name' in data: supplier.name = data['name'].strip()
    if 'contactPerson' in data: supplier.contact_person = data['contactPerson'].strip() or None
    if 'phone' in data: supplier.phone = data['phone'].strip() or None
    if 'email' in data: supplier.email = data['email'].strip() or None
    if 'address' in data: supplier.address = data['address'].strip() or None
    if 'materialsSupplied' in data: supplier.materials_supplied = data['materialsSupplied'].strip() or None
    if 'notes' in data: supplier.notes = data['notes'].strip() or None
    if 'isActive' in data: supplier.is_active = bool(data['isActive'])
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Inventory', f"Updated supplier: {supplier.name}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': supplier_to_dict(supplier)})

# ============================================
# INVENTORY - WASTE LOGS
# ============================================

def waste_log_to_dict(log):
    return {
        'id': log.id,
        'materialId': log.material_id,
        'materialName': log.material.material_type if log.material else None,
        'materialColor': log.material.color if log.material else None,
        'materialPattern': log.material.pattern if log.material else None,
        'quantity': float(log.quantity),
        'reason': log.reason,
        'notes': log.notes,
        'branchId': log.branch_id,
        'branchName': log.branch.name if log.branch else None,
        'loggedBy': log.logged_by,
        'loggedByName': log.logged_by_user.full_name if log.logged_by_user else None,
        'createdAt': fmt_dt(log.created_at),
    }

@app.route('/api/inventory/waste-logs', methods=['GET'])
@require_auth
def get_waste_logs():
    branch_id = request.args.get('branchId')
    query = MaterialWasteLog.query
    if branch_id:
        query = query.filter_by(branch_id=int(branch_id))
    logs = query.order_by(MaterialWasteLog.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [waste_log_to_dict(l) for l in logs]})

@app.route('/api/inventory/waste-logs', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def create_waste_log():
    data = request.get_json()
    if not data.get('materialId') or not data.get('quantity') or not data.get('reason', '').strip():
        return jsonify({'status': 'error', 'message': 'materialId, quantity, and reason are required'}), 400
    material = InventoryMaterial.query.get(int(data['materialId']))
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404
    qty = float(data['quantity'])
    if qty <= 0:
        return jsonify({'status': 'error', 'message': 'Quantity must be positive'}), 400
    # Deduct from stock
    material.stock_quantity = max(0, float(material.stock_quantity) - qty)
    log = MaterialWasteLog(
        material_id=material.id,
        quantity=qty,
        reason=data['reason'].strip(),
        notes=data.get('notes', '').strip() or None,
        branch_id=int(data.get('branchId', material.branch_id)),
        logged_by=request.current_user['id'],
    )
    db.session.add(log)
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Inventory', f"Logged waste: {qty} of {material.material_type}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': waste_log_to_dict(log)}), 201

# ============================================
# PAYMENTS
# ============================================

def payment_record_to_dict(p):
    return {
        'id': p.id,
        'jobOrderId': p.job_order_id,
        'jobOrderRef': p.job_order.job_order_id if p.job_order else None,
        'customerName': p.job_order.customer_name if p.job_order else None,
        'amount': float(p.amount),
        'paymentMethod': p.payment_method,
        'referenceNumber': p.reference_number,
        'notes': p.notes,
        'recordedBy': p.recorded_by,
        'recordedByName': p.recorder.full_name if p.recorder else None,
        'createdAt': fmt_dt(p.created_at),
    }

@app.route('/api/payments', methods=['GET'])
@require_auth
def get_payments():
    user = request.current_user
    job_order_id = request.args.get('jobOrderId')
    query = PaymentRecord.query
    if job_order_id:
        query = query.filter_by(job_order_id=int(job_order_id))
    elif user['role'] != 'administrator':
        # Non-admins: only show payments for their branch's job orders
        branch_id = user.get('branchId')
        if branch_id:
            branch_order_ids = [jo.id for jo in JobOrder.query.filter_by(branch_id=branch_id).all()]
            query = query.filter(PaymentRecord.job_order_id.in_(branch_order_ids))
    payments = query.order_by(PaymentRecord.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [payment_record_to_dict(p) for p in payments]})

@app.route('/api/payments', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def create_payment():
    data = request.get_json()
    if not data.get('jobOrderId') or not data.get('amount'):
        return jsonify({'status': 'error', 'message': 'jobOrderId and amount are required'}), 400
    job_order = JobOrder.query.get(int(data['jobOrderId']))
    if not job_order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    amount = float(data['amount'])
    if amount <= 0:
        return jsonify({'status': 'error', 'message': 'Amount must be positive'}), 400
    payment = PaymentRecord(
        job_order_id=job_order.id,
        amount=amount,
        payment_method=data.get('paymentMethod', 'cash'),
        reference_number=data.get('referenceNumber', '').strip() or None,
        notes=data.get('notes', '').strip() or None,
        recorded_by=request.current_user['id'],
    )
    db.session.add(payment)
    # Recompute job order totals
    total_paid = sum(float(p.amount) for p in job_order.payment_records) + amount
    balance = max(0, float(job_order.total_price or 0) - total_paid)
    if balance <= 0:
        job_order.payment_status = 'paid'
    elif total_paid > 0:
        job_order.payment_status = 'partial'
    else:
        job_order.payment_status = 'unpaid'
    job_order.down_payment = total_paid
    job_order.balance = balance
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Payment', f"Recorded payment of {amount} for {job_order.job_order_id}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': payment_record_to_dict(payment)}), 201

@app.route('/api/payments/summary', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def get_payment_summary():
    user = request.current_user
    jo_query = JobOrder.query
    if user['role'] != 'administrator' and user.get('branchId'):
        jo_query = jo_query.filter_by(branch_id=user['branchId'])
    orders = jo_query.all()
    total_revenue = sum(float(o.total_price or 0) for o in orders if o.status not in ('voided', 'cancelled'))
    total_collected = sum(float(o.down_payment or 0) for o in orders if o.status not in ('voided', 'cancelled'))
    total_balance = sum(float(o.balance or 0) for o in orders if o.status not in ('voided', 'cancelled'))
    unpaid_count = sum(1 for o in orders if o.payment_status == 'unpaid' and o.status not in ('voided', 'cancelled'))
    partial_count = sum(1 for o in orders if o.payment_status == 'partial' and o.status not in ('voided', 'cancelled'))
    paid_count = sum(1 for o in orders if o.payment_status == 'paid')
    return jsonify({'status': 'success', 'data': {
        'totalRevenue': round(total_revenue, 2),
        'totalCollected': round(total_collected, 2),
        'totalBalance': round(total_balance, 2),
        'unpaidCount': unpaid_count,
        'partialCount': partial_count,
        'paidCount': paid_count,
    }})

# ============================================
# SALES MODULE - JOB ORDERS
# ============================================

@app.route('/api/sales/job-orders', methods=['GET'])
@require_auth
def get_job_orders():
    user = request.current_user
    status = request.args.get('status')
    
    # Branch-level access control with database
    query = JobOrder.query
    
    if user['role'] == 'administrator':
        # Admins see all job orders
        pass
    else:
        # Supervisors and sales managers see only orders from their branch
        # Use branch_id directly from user if available, otherwise look up by name
        if user.get('branchId'):
            query = query.filter_by(branch_id=user['branchId'])
        elif user.get('branch'):
            user_branch = Branch.query.filter_by(name=user['branch']).first()
            if user_branch:
                query = query.filter_by(branch_id=user_branch.id)
            else:
                return jsonify({'status': 'success', 'data': []})
        else:
            return jsonify({'status': 'success', 'data': []})
    
    # Filter by status if provided
    if status:
        query = query.filter_by(status=status)
    
    orders = query.order_by(JobOrder.created_at.desc()).all()
    
    # Convert to dict format
    def job_order_to_dict(jo):
        return {
            'id': jo.id,
            'jobOrderId': jo.job_order_id,
            'customerId': jo.customer_id,
            'customerName': jo.customer_name,
            'customerPhone': jo.customer_phone,
            'customerEmail': jo.customer_email,
            'branchId': jo.branch_id,
            'branchName': jo.branch.name if jo.branch else '',
            'description': jo.description,
            'vehicleInfo': jo.vehicle_info,
            'items': jo.items,
            'slipData': jo.slip_data,
            'estimatedCost': jo.estimated_cost,
            'actualCost': jo.actual_cost,
            'totalPrice': jo.total_price,
            'status': jo.status,
            'paymentStatus': jo.payment_status,
            'downPayment': jo.down_payment,
            'balance': jo.balance,
            'estimatedCompletion': jo.estimated_completion.strftime('%Y-%m-%d') if jo.estimated_completion else '',
            'completedAt': jo.completed_at.strftime('%Y-%m-%d') if jo.completed_at else None,
            'createdAt': jo.created_at.strftime('%Y-%m-%d'),
            'createdBy': jo.created_by,
            'updatedAt': jo.updated_at.strftime('%Y-%m-%d')
        }

    return jsonify({'status': 'success', 'data': [job_order_to_dict(jo) for jo in orders]})

@app.route('/api/sales/job-orders/<int:order_id>', methods=['GET'])
@require_auth
def get_job_order(order_id):
    user = request.current_user
    order = JobOrder.query.get(order_id)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    
    # Branch-level access control
    if user['role'] != 'administrator':
        # Use branch_id directly from user if available, otherwise look up by name
        user_branch_id = None
        if user.get('branchId'):
            user_branch_id = user['branchId']
        elif user.get('branch'):
            user_branch = Branch.query.filter_by(name=user['branch']).first()
            if user_branch:
                user_branch_id = user_branch.id
        
        if not user_branch_id or order.branch_id != user_branch_id:
            return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    
    # Get tasks associated with this job order
    tasks = WorkTask.query.filter_by(job_order_id=order.job_order_id).all()
    tasks_with_workers = []
    for task in tasks:
        worker_info = None
        if task.worker_id:
            worker = Worker.query.get(task.worker_id)
            if worker:
                user_data = User.query.get(worker.user_id)
                worker_info = {
                    'id': worker.id,
                    'name': user_data.full_name if user_data else 'Unknown',
                    'specialization': worker.specialization
                }
        
        tasks_with_workers.append({
            'id': task.id,
            'taskNumber': task.task_number,
            'title': task.title,
            'status': task.status,
            'worker': worker_info
        })
    
    # Convert to dict format
    order_dict = {
        'id': order.id,
        'jobOrderId': order.job_order_id,
        'customerId': order.customer_id,
        'customerName': order.customer_name,
        'customerPhone': order.customer_phone,
        'customerEmail': order.customer_email,
        'branchId': order.branch_id,
        'branchName': order.branch.name if order.branch else '',
        'description': order.description,
        'vehicleInfo': order.vehicle_info,
        'items': order.items,
        'slipData': order.slip_data,
        'estimatedCost': order.estimated_cost,
        'actualCost': order.actual_cost,
        'totalPrice': order.total_price,
        'status': order.status,
        'paymentStatus': order.payment_status,
        'downPayment': order.down_payment,
        'balance': order.balance,
        'estimatedCompletion': order.estimated_completion.strftime('%Y-%m-%d') if order.estimated_completion else '',
        'completedAt': order.completed_at.strftime('%Y-%m-%d') if order.completed_at else None,
        'createdAt': order.created_at.strftime('%Y-%m-%d'),
        'createdBy': order.created_by,
        'updatedAt': order.updated_at.strftime('%Y-%m-%d'),
        'tasks': tasks_with_workers
    }
    
    return jsonify({'status': 'success', 'data': order_dict})

@app.route('/api/sales/job-orders', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def create_job_order():
    data = request.get_json()
    
    required = ['customerName', 'customerPhone', 'branchId', 'description', 'items', 'estimatedCompletion']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    # Look up branch from database
    branch_db = Branch.query.get(data['branchId'])
    if not branch_db:
        return jsonify({'status': 'error', 'message': 'Invalid branch'}), 400
    
    job_order_id = generate_job_order_id(branch_db.code)
    
    items = data.get('items') or []

    # Calculate costs
    total_price = data.get('totalPrice')
    if total_price is None:
        total_price = sum(item.get('quantity', 0) * item.get('unitPrice', 0) for item in items)
    computed_cost = sum(item.get('quantity', 0) * (item.get('materialCost', 0) + item.get('laborCost', 0)) for item in items)
    estimated_cost = data.get('estimatedCost') if data.get('estimatedCost') is not None else computed_cost
    down_payment = data.get('downPayment', 0)
    balance = max(total_price - down_payment, 0) if total_price > 0 else 0
    
    # Determine payment status
    if total_price > 0 and down_payment >= total_price:
        payment_status = 'paid'
    elif down_payment > 0:
        payment_status = 'partial'
    else:
        payment_status = 'unpaid'
    
    # Parse date
    from datetime import datetime as dt
    estimated_completion = dt.strptime(data['estimatedCompletion'], '%Y-%m-%d').date()

    # Find or create customer account
    resolved_customer_id = data.get('customerId')
    if resolved_customer_id and not Customer.query.get(resolved_customer_id):
        resolved_customer_id = None
    if not resolved_customer_id:
        phone = data.get('customerPhone', '').strip()
        email = data.get('customerEmail', '').strip()
        customer = None
        if phone:
            customer = Customer.query.filter(Customer.phone == phone).first()
        if not customer and email:
            customer = Customer.query.filter(Customer.email == email).first()
        if not customer:
            customer = Customer(
                name=data['customerName'],
                phone=phone,
                email=email,
                address=data.get('customerAddress', ''),
            )
            db.session.add(customer)
            db.session.flush()
        resolved_customer_id = customer.id

    # Create database record
    new_order = JobOrder(
        job_order_id=job_order_id,
        customer_id=resolved_customer_id,
        customer_name=data['customerName'],
        customer_phone=data['customerPhone'],
        customer_email=data.get('customerEmail', ''),
        branch_id=data['branchId'],
        description=data['description'],
        vehicle_info=data.get('vehicleInfo'),
        items=items,
        slip_data=data.get('slipData'),
        estimated_cost=estimated_cost,
        actual_cost=0,
        total_price=total_price,
        status='pending',
        payment_status=payment_status,
        down_payment=down_payment,
        balance=balance,
        estimated_completion=estimated_completion,
        created_by=request.current_user['id']
    )
    
    db.session.add(new_order)
    db.session.flush()  # get new_order.id before commit

    # Auto-create a PaymentRecord for the initial down payment
    if down_payment > 0:
        initial_payment = PaymentRecord(
            job_order_id=new_order.id,
            amount=down_payment,
            payment_method=data.get('paymentMethod', 'cash'),
            notes='Initial payment on order creation',
            recorded_by=request.current_user['id']
        )
        db.session.add(initial_payment)

    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Sales', f"Created job order: {job_order_id}", request.remote_addr or '0.0.0.0')

    # Return the created order
    return jsonify({
        'status': 'success',
        'data': {
            'id': new_order.id,
            'jobOrderId': new_order.job_order_id,
            'branchName': branch_db.name,
            'totalPrice': total_price,
            'status': 'pending'
        }
    }), 201

@app.route('/api/sales/job-orders/<int:order_id>', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def update_job_order(order_id):
    # Use database instead of in-memory list
    order = JobOrder.query.get(order_id)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404

    user = request.current_user
    if user.get('role') == 'sales_manager' and (order.down_payment or 0) <= 0:
        return jsonify({'status': 'error', 'message': 'Down payment is required before sales managers can edit this job order'}), 403
    
    data = request.get_json()

    # Capture previous status BEFORE any updates
    prev_status = order.status

    # Update allowed fields
    if 'status' in data:
        order.status = data['status']
    if 'paymentStatus' in data:
        order.payment_status = data['paymentStatus']
    if 'downPayment' in data:
        order.down_payment = data['downPayment']
    if 'actualCost' in data:
        order.actual_cost = data['actualCost']
    if 'totalPrice' in data:
        order.total_price = data['totalPrice']
    if 'items' in data:
        order.items = data['items']
        order.estimated_cost = sum(
            item.get('quantity', 0) * (item.get('materialCost', 0) + item.get('laborCost', 0))
            for item in data['items']
        )
    if 'slipData' in data:
        order.slip_data = data['slipData']

    # Recalculate balance
    if 'downPayment' in data or 'totalPrice' in data:
        order.balance = max(order.total_price - order.down_payment, 0)
        if order.total_price > 0 and order.down_payment >= order.total_price:
            order.payment_status = 'paid'
        elif order.down_payment > 0:
            order.payment_status = 'partial'
        elif order.total_price <= 0 and order.down_payment > 0:
            order.payment_status = 'partial'
        elif order.total_price <= 0:
            order.payment_status = 'unpaid'

    if data.get('status') == 'completed':
        order.completed_at = datetime.now()

    order.updated_at = datetime.now()

    # ── Deduct inventory when a job order is completed ──────────────────────
    if data.get('status') == 'completed' and prev_status != 'completed':
        for item in (order.items or []):
            qty = float(item.get('quantity', 0))
            if qty <= 0:
                continue

            # Skip pure-labor items (have laborCost > 0 and no materialCost)
            labor_cost = float(item.get('laborCost', 0))
            material_cost = float(item.get('materialCost', 0))
            if labor_cost > 0 and material_cost == 0:
                continue

            # Resolve the inventory material – prefer stored ID, fall back to name match.
            # Do NOT restrict by branch_id on ID lookup — the material may belong to the
            # warehouse even when the order is from a different branch.
            inv_material = None
            stored_material_id = item.get('materialId')
            if stored_material_id:
                inv_material = InventoryMaterial.query.filter_by(
                    id=int(stored_material_id)
                ).first()
            if not inv_material:
                material_name = item.get('name', '').strip().lower()
                if material_name:
                    warehouse = Branch.query.filter_by(is_warehouse=True).first()
                    warehouse_id = warehouse.id if warehouse else 1
                    # Search the order's branch first, then the warehouse
                    inv_material = InventoryMaterial.query.filter(
                        db.func.lower(InventoryMaterial.material_type) == material_name,
                        InventoryMaterial.branch_id.in_([order.branch_id, warehouse_id]),
                        InventoryMaterial.is_archived.is_(False)
                    ).order_by(
                        db.case((InventoryMaterial.branch_id == order.branch_id, 0), else_=1)
                    ).first()

            if inv_material:
                inv_material.stock_quantity = float(inv_material.stock_quantity) - qty
                inv_material.status = 'available'   # clear 'needed' flag
                inv_material.updated_at = datetime.now()

                usage_log = MaterialUsageLog(
                    material_id=inv_material.id,
                    quantity_used=qty,
                    used_in_type='job_order',
                    used_in_reference=order.job_order_id,
                    branch_id=order.branch_id,
                    used_by=request.current_user['id'],
                    notes=f"Used in job order {order.job_order_id} — {order.customer_name}"
                )
                db.session.add(usage_log)

    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Sales', f"Updated job order: {order.job_order_id}", request.remote_addr or '0.0.0.0')
    
    return jsonify({
        'status': 'success', 
        'data': {
            'id': order.id,
            'jobOrderId': order.job_order_id,
            'status': order.status,
            'paymentStatus': order.payment_status,
            'downPayment': order.down_payment,
            'balance': order.balance,
            'actualCost': order.actual_cost,
            'totalPrice': order.total_price,
            'items': order.items,
            'completedAt': order.completed_at.strftime('%Y-%m-%d') if order.completed_at else None,
            'updatedAt': order.updated_at.strftime('%Y-%m-%d')
        }
    })

@app.route('/api/sales/job-orders/<int:order_id>/void', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def void_job_order(order_id):
    order = next((jo for jo in job_orders if jo['id'] == order_id), None)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    
    # Check if unclaimed for 60 days
    created_date = datetime.strptime(order['createdAt'], '%Y-%m-%d')
    if (datetime.now() - created_date).days < 60:
        return jsonify({'status': 'error', 'message': 'Job order can only be voided after 60 days'}), 400
    
    order['status'] = 'voided'
    order['voidedAt'] = datetime.now().strftime('%Y-%m-%d')
    order['updatedAt'] = datetime.now().strftime('%Y-%m-%d')
    
    void_items.append({
        'type': 'job_order',
        'originalId': order['id'],
        'jobOrderId': order['jobOrderId'],
        'customerName': order['customerName'],
        'voidedAt': order['voidedAt'],
        'reason': 'Unclaimed after 60 days'
    })
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'VOID', 'Sales', f"Voided job order: {order['jobOrderId']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'message': 'Job order voided'})

@app.route('/api/sales/all-orders', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager', 'staff')
def get_all_orders():
    """Get both job orders and customer orders - filtered by branch for non-admin users"""
    user = request.current_user
    
    # Get job orders from database
    if user['role'] == 'administrator':
        # Administrators can see all orders
        job_orders_db = JobOrder.query.order_by(JobOrder.created_at.desc()).all()
        customer_orders_db = CustomerOrder.query.order_by(CustomerOrder.created_at.desc()).all()
    else:
        # Other users can only see orders from their branch
        # Use branch_id directly from user if available, otherwise look up by name
        if user.get('branchId'):
            job_orders_db = JobOrder.query.filter_by(branch_id=user['branchId']).order_by(JobOrder.created_at.desc()).all()
            customer_orders_db = CustomerOrder.query.filter_by(branch_id=user['branchId']).order_by(CustomerOrder.created_at.desc()).all()
        elif user.get('branch'):
            user_branch = Branch.query.filter_by(name=user['branch']).first()
            if user_branch:
                job_orders_db = JobOrder.query.filter_by(branch_id=user_branch.id).order_by(JobOrder.created_at.desc()).all()
                customer_orders_db = CustomerOrder.query.filter_by(branch_id=user_branch.id).order_by(CustomerOrder.created_at.desc()).all()
            else:
                job_orders_db = []
                customer_orders_db = []
        else:
            job_orders_db = []
            customer_orders_db = []
    
    # Convert to dict format
    def job_order_to_dict(jo):
        return {
            'id': jo.id,
            'jobOrderId': jo.job_order_id,
            'customerId': jo.customer_id,
            'customerName': jo.customer_name,
            'customerPhone': jo.customer_phone,
            'customerEmail': jo.customer_email,
            'branchId': jo.branch_id,
            'branchName': jo.branch.name if jo.branch else '',
            'description': jo.description,
            'vehicleInfo': jo.vehicle_info,
            'items': jo.items,
            'slipData': jo.slip_data,
            'estimatedCost': jo.estimated_cost,
            'actualCost': jo.actual_cost,
            'totalPrice': jo.total_price,
            'status': jo.status,
            'paymentStatus': jo.payment_status,
            'downPayment': jo.down_payment,
            'balance': jo.balance,
            'estimatedCompletion': jo.estimated_completion.strftime('%Y-%m-%d') if jo.estimated_completion else '',
            'completedAt': jo.completed_at.strftime('%Y-%m-%d') if jo.completed_at else None,
            'createdAt': jo.created_at.strftime('%Y-%m-%d'),
            'createdBy': jo.created_by,
            'updatedAt': jo.updated_at.strftime('%Y-%m-%d')
        }

    job_orders_list = [job_order_to_dict(jo) for jo in job_orders_db]
    customer_orders_list = [customer_order_to_dict(o) for o in customer_orders_db]
    
    return jsonify({
        'status': 'success',
        'data': {
            'jobOrders': job_orders_list,
            'customerOrders': customer_orders_list
        }
    })

# ============================================
# SALES MODULE - LINE-UP SLIPS
# ============================================

@app.route('/api/sales/lineup-slips', methods=['GET'])
@require_auth
def get_lineup_slips():
    return jsonify({'status': 'success', 'data': lineup_slips})

@app.route('/api/sales/lineup-slips', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def create_lineup_slip():
    global counters
    data = request.get_json()
    
    job_order = next((jo for jo in job_orders if jo['id'] == data.get('jobOrderId')), None)
    if not job_order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 400
    
    branch = next((b for b in branches if b['id'] == job_order['branchId']), None)
    slip_number = generate_lineup_slip_number(branch['code'])
    
    new_slip = {
        'id': counters['lineup_slip'],
        'slipNumber': slip_number,
        'jobOrderId': job_order['id'],
        'jobOrderNumber': job_order['jobOrderId'],
        'customerName': job_order['customerName'],
        'branchId': job_order['branchId'],
        'items': data.get('items', [{'description': item['name'], 'status': 'pending'} for item in job_order['items']]),
        'priority': data.get('priority', 'normal'),
        'assignedTo': data.get('assignedTo', ''),
        'notes': data.get('notes', ''),
        'createdAt': datetime.now().strftime('%Y-%m-%d'),
        'updatedAt': datetime.now().strftime('%Y-%m-%d')
    }
    
    lineup_slips.append(new_slip)
    counters['lineup_slip'] += 1
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Sales', f"Created lineup slip: {slip_number}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': new_slip}), 201

@app.route('/api/sales/lineup-slips/<int:slip_id>', methods=['PUT'])
@require_auth
def update_lineup_slip(slip_id):
    slip = next((ls for ls in lineup_slips if ls['id'] == slip_id), None)
    if not slip:
        return jsonify({'status': 'error', 'message': 'Lineup slip not found'}), 404
    
    data = request.get_json()
    for key in ['items', 'priority', 'assignedTo', 'notes']:
        if key in data:
            slip[key] = data[key]
    
    slip['updatedAt'] = datetime.now().strftime('%Y-%m-%d')
    
    return jsonify({'status': 'success', 'data': slip})

# ============================================
# JOB ORDER COSTING MODULE
# ============================================

@app.route('/api/costing/all', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_all_costings():
    user = request.current_user
    orders = list(job_orders)

    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if user_branch:
            orders = [jo for jo in orders if jo['branchId'] == user_branch.id]

    result = []
    for order in orders:
        total_material_cost = sum(item.get('materialCost', 0) * item['quantity'] for item in order.get('items', []))
        total_labor_cost = sum(item.get('laborCost', 0) * item['quantity'] for item in order.get('items', []))
        overhead = total_material_cost * 0.1

        result.append({
            'id': order['id'],
            'jobOrderNumber': order['jobOrderId'],
            'materialsCost': round(total_material_cost, 2),
            'laborCost': round(total_labor_cost, 2),
            'overheadCost': round(overhead, 2),
            'totalAmount': order.get('totalPrice', 0),
            'status': order.get('status', ''),
        })

    return jsonify({'status': 'success', 'data': result})

@app.route('/api/costing/job-order/<int:order_id>', methods=['GET'])
@require_auth
def get_job_order_costing(order_id):
    user = request.current_user
    order = next((jo for jo in job_orders if jo['id'] == order_id), None)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    
    # Branch-level access control
    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if not user_branch or order['branchId'] != user_branch.id:
            return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    
    total_material_cost = sum(item.get('materialCost', 0) * item['quantity'] for item in order['items'])
    total_labor_cost = sum(item.get('laborCost', 0) * item['quantity'] for item in order['items'])
    overhead = total_material_cost * 0.1  # 10% overhead
    
    costing_data = {
        'jobOrderId': order['jobOrderId'],
        'items': order['items'],
        'estimatedCost': order['estimatedCost'],
        'actualCost': order['actualCost'],
        'materialCost': total_material_cost,
        'laborCost': total_labor_cost,
        'overheadCost': round(overhead, 2),
        'totalCost': round(total_material_cost + total_labor_cost + overhead, 2),
        'totalPrice': order['totalPrice'],
        'grossProfit': round(order['totalPrice'] - (total_material_cost + total_labor_cost + overhead), 2),
        'profitMargin': round((order['totalPrice'] - (total_material_cost + total_labor_cost + overhead)) / order['totalPrice'] * 100, 2) if order['totalPrice'] > 0 else 0,
        'variance': round(order['actualCost'] - order['estimatedCost'], 2) if order['actualCost'] > 0 else 0
    }
    
    return jsonify({'status': 'success', 'data': costing_data})

@app.route('/api/costing/job-order/<int:order_id>/actual', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor')
def update_actual_cost(order_id):
    user = request.current_user
    order = next((jo for jo in job_orders if jo['id'] == order_id), None)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    
    # Branch-level access control
    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if not user_branch or order['branchId'] != user_branch.id:
            return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    
    data = request.get_json()
    
    if 'actualCost' in data:
        order['actualCost'] = data['actualCost']
    
    if 'items' in data:
        order['items'] = data['items']
    
    order['updatedAt'] = datetime.now().strftime('%Y-%m-%d')
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Costing', f"Updated actual cost for: {order['jobOrderId']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': order})

@app.route('/api/costing/variance-report', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_variance_report():
    user = request.current_user
    completed_orders = [jo for jo in job_orders if jo['status'] == 'completed' and jo['actualCost'] > 0]
    
    # Branch-level access control
    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if user_branch:
            completed_orders = [jo for jo in completed_orders if jo['branchId'] == user_branch.id]
    
    report = []
    for order in completed_orders:
        variance = order['actualCost'] - order['estimatedCost']
        variance_pct = (variance / order['estimatedCost'] * 100) if order['estimatedCost'] > 0 else 0
        
        report.append({
            'jobOrderId': order['jobOrderId'],
            'customerName': order['customerName'],
            'estimatedCost': order['estimatedCost'],
            'actualCost': order['actualCost'],
            'variance': round(variance, 2),
            'variancePercent': round(variance_pct, 2),
            'status': 'over' if variance > 0 else 'under' if variance < 0 else 'on_target'
        })
    
    return jsonify({'status': 'success', 'data': report})

@app.route('/api/costing/receipt/<int:order_id>', methods=['GET'])
@require_auth
def generate_receipt(order_id):
    user = request.current_user
    order = next((jo for jo in job_orders if jo['id'] == order_id), None)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    
    # Branch-level access control
    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if not user_branch or order['branchId'] != user_branch.id:
            return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    
    receipt = {
        'receiptNumber': f"RCP-{order['jobOrderId']}",
        'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'customer': {
            'name': order['customerName'],
            'phone': order['customerPhone'],
            'email': order['customerEmail']
        },
        'jobOrder': order['jobOrderId'],
        'branch': order['branchName'],
        'items': [
            {
                'description': item['name'],
                'quantity': item['quantity'],
                'unitPrice': item['unitPrice'],
                'total': item['quantity'] * item['unitPrice']
            }
            for item in order['items']
        ],
        'subtotal': order['totalPrice'],
        'downPayment': order['downPayment'],
        'balance': order['balance'],
        'paymentStatus': order['paymentStatus']
    }
    
    return jsonify({'status': 'success', 'data': receipt})

# ============================================
# PURCHASE ORDERS
# ============================================

@app.route('/api/purchase-orders', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_purchase_orders():
    status = request.args.get('status')
    items = purchase_orders
    if status:
        items = [po for po in items if po['status'] == status]
    return jsonify({'status': 'success', 'data': items})

@app.route('/api/purchase-orders/<int:po_id>', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_purchase_order(po_id):
    po = next((p for p in purchase_orders if p['id'] == po_id), None)
    if not po:
        return jsonify({'status': 'error', 'message': 'Purchase order not found'}), 404
    return jsonify({'status': 'success', 'data': po})

@app.route('/api/purchase-orders', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def create_purchase_order():
    global counters
    data = request.get_json()
    
    required = ['supplierName', 'items', 'expectedDelivery']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    total_amount = sum(item['quantity'] * item['unitPrice'] for item in data['items'])
    
    new_po = {
        'id': counters['purchase_order'],
        'poNumber': generate_po_number(),
        'supplierId': data.get('supplierId'),
        'supplierName': data['supplierName'],
        'items': data['items'],
        'totalAmount': total_amount,
        'status': 'pending',
        'expectedDelivery': data['expectedDelivery'],
        'createdAt': datetime.now().strftime('%Y-%m-%d'),
        'createdBy': request.current_user['id'],
        'approvedAt': None,
        'approvedBy': None
    }
    
    purchase_orders.append(new_po)
    counters['purchase_order'] += 1
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Purchase Orders', f"Created PO: {new_po['poNumber']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': new_po}), 201

@app.route('/api/purchase-orders/<int:po_id>/approve', methods=['POST'])
@require_auth
@require_roles('administrator')
def approve_purchase_order(po_id):
    po = next((p for p in purchase_orders if p['id'] == po_id), None)
    if not po:
        return jsonify({'status': 'error', 'message': 'Purchase order not found'}), 404
    
    po['status'] = 'approved'
    po['approvedAt'] = datetime.now().strftime('%Y-%m-%d')
    po['approvedBy'] = request.current_user['id']
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'APPROVE', 'Purchase Orders', f"Approved PO: {po['poNumber']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': po})

@app.route('/api/purchase-orders/<int:po_id>/receive', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def receive_purchase_order(po_id):
    po = next((p for p in purchase_orders if p['id'] == po_id), None)
    if not po:
        return jsonify({'status': 'error', 'message': 'Purchase order not found'}), 404
    
    if po['status'] != 'approved':
        return jsonify({'status': 'error', 'message': 'PO must be approved first'}), 400
    
    # Update inventory
    for item in po['items']:
        material = InventoryMaterial.query.get(item.get('materialId'))
        if material:
            material.stock_quantity = float(material.stock_quantity) + float(item['quantity'])
    
    po['status'] = 'received'
    po['receivedAt'] = datetime.now().strftime('%Y-%m-%d')

    db.session.commit()
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'RECEIVE', 'Purchase Orders', f"Received PO: {po['poNumber']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': po})

# ============================================
# DELIVERY MODULE
# ============================================

@app.route('/api/deliveries', methods=['GET'])
@require_auth
def get_deliveries():
    user = request.current_user
    status = request.args.get('status')
    delivery_type = request.args.get('type')
    
    items = deliveries
    
    # Branch-level access control
    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if user_branch:
            items = [d for d in items if d['fromBranchId'] == user_branch.id or d.get('toBranchId') == user_branch.id]
        else:
            items = []
    
    if status:
        items = [d for d in items if d['status'] == status]
    if delivery_type:
        items = [d for d in items if d['type'] == delivery_type]
    
    return jsonify({'status': 'success', 'data': items})

@app.route('/api/deliveries/<int:delivery_id>', methods=['GET'])
@require_auth
def get_delivery(delivery_id):
    user = request.current_user
    delivery = next((d for d in deliveries if d['id'] == delivery_id), None)
    if not delivery:
        return jsonify({'status': 'error', 'message': 'Delivery not found'}), 404
    
    # Branch-level access control
    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if not user_branch or (delivery['fromBranchId'] != user_branch.id and delivery.get('toBranchId') != user_branch.id):
            return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    
    return jsonify({'status': 'success', 'data': delivery})

@app.route('/api/deliveries', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def create_delivery():
    global counters
    data = request.get_json()
    
    required = ['type', 'fromBranchId', 'items', 'scheduledDate']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    from_branch = next((b for b in branches if b['id'] == data['fromBranchId']), None)
    to_branch = next((b for b in branches if b['id'] == data.get('toBranchId')), None) if data.get('toBranchId') else None
    
    new_delivery = {
        'id': counters['delivery'],
        'deliveryNumber': generate_delivery_number(),
        'type': data['type'],
        'fromBranchId': data['fromBranchId'],
        'fromBranchName': from_branch['name'] if from_branch else None,
        'toBranchId': data.get('toBranchId'),
        'toBranchName': to_branch['name'] if to_branch else None,
        'customerName': data.get('customerName'),
        'customerAddress': data.get('customerAddress'),
        'customerPhone': data.get('customerPhone'),
        'jobOrderId': data.get('jobOrderId'),
        'jobOrderNumber': data.get('jobOrderNumber'),
        'items': data['items'],
        'status': 'scheduled',
        'scheduledDate': data['scheduledDate'],
        'estimatedArrival': data.get('estimatedArrival'),
        'driverName': data.get('driverName', ''),
        'driverContact': data.get('driverContact', ''),
        'vehiclePlate': data.get('vehiclePlate', ''),
        'notes': data.get('notes', ''),
        'createdAt': datetime.now().strftime('%Y-%m-%d'),
        'createdBy': request.current_user['id']
    }
    
    deliveries.append(new_delivery)
    counters['delivery'] += 1
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Delivery', f"Created delivery: {new_delivery['deliveryNumber']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': new_delivery}), 201

@app.route('/api/deliveries/<int:delivery_id>/status', methods=['PUT'])
@require_auth
def update_delivery_status(delivery_id):
    user = request.current_user
    delivery = next((d for d in deliveries if d['id'] == delivery_id), None)
    if not delivery:
        return jsonify({'status': 'error', 'message': 'Delivery not found'}), 404
    
    # Branch-level access control
    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if not user_branch or (delivery['fromBranchId'] != user_branch.id and delivery.get('toBranchId') != user_branch.id):
            return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    
    data = request.get_json()
    new_status = data.get('status')
    
    if new_status not in ['scheduled', 'in_transit', 'delivered', 'cancelled']:
        return jsonify({'status': 'error', 'message': 'Invalid status'}), 400
    
    delivery['status'] = new_status
    
    if new_status == 'delivered':
        delivery['deliveredAt'] = datetime.now().strftime('%Y-%m-%d %H:%M')
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Delivery', f"Updated delivery status: {delivery['deliveryNumber']} to {new_status}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': delivery})

@app.route('/api/deliveries/<int:delivery_id>/receipt', methods=['GET'])
@require_auth
def generate_delivery_receipt(delivery_id):
    user = request.current_user
    delivery = next((d for d in deliveries if d['id'] == delivery_id), None)
    if not delivery:
        return jsonify({'status': 'error', 'message': 'Delivery not found'}), 404
    
    # Branch-level access control
    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if not user_branch or (delivery['fromBranchId'] != user_branch.id and delivery.get('toBranchId') != user_branch.id):
            return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    
    receipt = {
        'receiptNumber': f"DR-{delivery['deliveryNumber']}",
        'date': datetime.now().strftime('%Y-%m-%d'),
        'deliveryNumber': delivery['deliveryNumber'],
        'type': delivery['type'],
        'from': delivery['fromBranchName'],
        'to': delivery.get('toBranchName') or delivery.get('customerName'),
        'address': delivery.get('customerAddress') or next((b['address'] for b in branches if b['id'] == delivery.get('toBranchId')), ''),
        'items': delivery['items'],
        'driver': delivery['driverName'],
        'vehicle': delivery['vehiclePlate'],
        'status': delivery['status'],
        'deliveredAt': delivery.get('deliveredAt')
    }
    
    return jsonify({'status': 'success', 'data': receipt})

# ============================================
# APPOINTMENTS MODULE
# ============================================

def appointment_to_dict(appointment):
    """Helper to convert Appointment model to dictionary"""
    branch_name = None
    if appointment.branch:
        branch_name = appointment.branch.name
    
    return {
        'id': appointment.id,
        'appointmentNumber': appointment.appointment_number,
        'customerName': appointment.customer_name,
        'customerPhone': appointment.customer_phone,
        'customerEmail': appointment.customer_email,
        'contactMethod': appointment.contact_method,
        'branchId': appointment.branch_id,
        'branchName': branch_name,
        'preferredDate': fmt_dt(appointment.preferred_date),
        'preferredTime': appointment.preferred_time,
        'description': appointment.description,
        'vehicleInfo': appointment.vehicle_info,
        'status': appointment.status,
        'confirmedTime': appointment.confirmed_time,
        'confirmedBy': appointment.confirmed_by,
        'confirmedByName': appointment.confirmer.full_name if appointment.confirmer else None,
        'confirmedByRole': appointment.confirmer.role.key if (appointment.confirmer and appointment.confirmer.role) else None,
        'adminNotes': appointment.admin_notes,
        'createdAt': to_pht(appointment.created_at),
        'updatedAt': to_pht(appointment.updated_at),
    }

@app.route('/api/appointments', methods=['POST'])
def create_appointment():
    """Create a new appointment request - public endpoint"""
    data = request.get_json()

    required = ['customerName', 'customerPhone', 'contactMethod', 'preferredDate']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400

    contact_method = data['contactMethod']
    if contact_method not in ['branch_visit', 'phone_call']:
        return jsonify({'status': 'error', 'message': 'Invalid contact method'}), 400

    # Spam / abuse protection
    phone = data.get('customerPhone', '').strip()
    allowed, spam_msg = check_spam_protection(phone, 'appointment')
    if not allowed:
        return jsonify({'status': 'error', 'message': spam_msg}), 429

    # Branch is always required so appointments are routed to the selected branch.
    branch_id = data.get('branchId')
    if not branch_id:
        return jsonify({'status': 'error', 'message': 'Please select a branch for this appointment'}), 400
    
    # Validate selected branch
    branch = Branch.query.get(branch_id)
    if not branch or not branch.is_active:
        return jsonify({'status': 'error', 'message': 'Invalid or inactive branch'}), 400
    
    # Check if user is authenticated (optional)
    user_id = None
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token:
        user = get_user_from_token(token)
        if user:
            user_id = user['id']
    
    # Generate appointment number
    appointment_count = Appointment.query.count() + 1
    appointment_number = f"APT-{appointment_count:04d}"
    
    # Parse date
    try:
        preferred_date = datetime.strptime(data['preferredDate'], '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format. Use YYYY-MM-DD'}), 400

    # Validate date/time against Philippine time (UTC+8)
    now_ph = datetime.utcnow() + timedelta(hours=8)
    today_ph = now_ph.date()
    current_hour_ph = now_ph.hour

    if preferred_date < today_ph:
        return jsonify({'status': 'error', 'message': 'Cannot book an appointment for a past date.'}), 400

    if preferred_date == today_ph:
        # All slots end at 20:00 (8 PM)
        if current_hour_ph >= 20:
            return jsonify({'status': 'error', 'message': 'All time slots for today have already passed. Please choose tomorrow or a later date.'}), 400
        # Validate specific period if provided
        preferred_time = data.get('preferredTime', '')
        period_end = {'morning': 12, 'afternoon': 17, 'evening': 20}
        if preferred_time in period_end and current_hour_ph >= period_end[preferred_time]:
            return jsonify({
                'status': 'error',
                'message': f'The {preferred_time} slot has already ended today. Please choose a later time period or a different date.'
            }), 400

    new_appointment = Appointment(
        appointment_number=appointment_number,
        customer_name=data['customerName'],
        customer_phone=data['customerPhone'],
        customer_email=data.get('customerEmail', ''),
        contact_method=contact_method,
        branch_id=branch_id,
        preferred_date=preferred_date,
        preferred_time=data.get('preferredTime', ''),
        description=data.get('description', ''),
        vehicle_info=data.get('vehicleInfo'),
        status='pending',
        user_id=user_id
    )
    
    db.session.add(new_appointment)
    db.session.commit()
    
    return jsonify({'status': 'success', 'data': appointment_to_dict(new_appointment)}), 201

@app.route('/api/appointments', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_appointments():
    """Get all appointments - staff endpoint"""
    user = request.current_user
    status = request.args.get('status')
    
    query = Appointment.query
    
    # Filter by status if provided
    if status:
        query = query.filter_by(status=status)
    
    # Supervisors only see appointments for their assigned branch.
    if user['role'] == 'supervisor':
        if not user.get('branchId'):
            return jsonify({'status': 'error', 'message': 'Supervisor account has no assigned branch'}), 400
        query = query.filter(Appointment.branch_id == user['branchId'])
    
    appointments = query.order_by(Appointment.preferred_date.desc()).all()
    
    return jsonify({'status': 'success', 'data': [appointment_to_dict(a) for a in appointments]})

@app.route('/api/appointments/<int:appointment_id>', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor')
def update_appointment(appointment_id):
    """Update an appointment status or notes"""
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return jsonify({'status': 'error', 'message': 'Appointment not found'}), 404

    user = request.current_user
    if user['role'] == 'supervisor':
        if not user.get('branchId'):
            return jsonify({'status': 'error', 'message': 'Supervisor account has no assigned branch'}), 400
        if appointment.branch_id != user['branchId']:
            return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    
    data = request.get_json()

    if 'status' in data:
        new_status = data['status']
        if new_status == 'confirmed':
            confirmed_time = data.get('confirmedTime')
            if not confirmed_time:
                return jsonify({'status': 'error', 'message': 'A confirmed time must be selected when confirming an appointment'}), 400

            # Double-booking check: same branch, same date, same time slot, already confirmed
            if appointment.branch_id and appointment.preferred_date:
                clash = Appointment.query.filter(
                    Appointment.id != appointment.id,
                    Appointment.branch_id == appointment.branch_id,
                    Appointment.preferred_date == appointment.preferred_date,
                    Appointment.confirmed_time == confirmed_time,
                    Appointment.status == 'confirmed'
                ).first()
                if clash:
                    return jsonify({
                        'status': 'error',
                        'message': f'This time slot ({confirmed_time}) is already taken by appointment {clash.appointment_number} on this date. Please choose a different time.'
                    }), 409

            appointment.confirmed_time = confirmed_time
            appointment.confirmed_by = user['id']

        appointment.status = new_status

    if 'adminNotes' in data:
        appointment.admin_notes = data['adminNotes']

    db.session.commit()

    return jsonify({'status': 'success', 'data': appointment_to_dict(appointment)})

@app.route('/api/appointments/my-appointments', methods=['GET'])
@require_auth
def get_my_appointments():
    """Get appointments for the logged-in customer"""
    user_id = request.current_user['id']
    appointments = Appointment.query.filter_by(user_id=user_id).order_by(Appointment.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [appointment_to_dict(a) for a in appointments]})

# ============================================
# SPAM / ABUSE PROTECTION ADMIN ENDPOINTS
# ============================================

@app.route('/api/admin/appointments/<int:appointment_id>/no-show', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def mark_appointment_no_show(appointment_id):
    """Mark a confirmed appointment as no-show and add a strike to the phone number."""
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return jsonify({'status': 'error', 'message': 'Appointment not found'}), 404

    user = request.current_user
    if user['role'] == 'supervisor' and user.get('branchId') != appointment.branch_id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    appointment.status = 'cancelled'
    appointment.admin_notes = (appointment.admin_notes or '') + ' [No-Show]'
    db.session.flush()

    record = add_strike(
        appointment.customer_phone,
        f'No-show for appointment {appointment.appointment_number}'
    )

    log_action(user['id'], user['fullName'], 'NO_SHOW', 'Appointments',
               f'Marked {appointment.appointment_number} as no-show. '
               f'Strikes for {appointment.customer_phone}: {record.strike_count}/{MAX_STRIKES_BEFORE_BLOCK}',
               request.remote_addr or '0.0.0.0')

    return jsonify({
        'status': 'success',
        'message': 'Appointment marked as no-show.',
        'strikeCount': record.strike_count,
        'isBlocked': record.is_blocked
    })


@app.route('/api/admin/product-orders/<int:order_id>/flag-spam', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def flag_order_spam(order_id):
    """Flag a product order as fake/spam and add a strike to the phone number."""
    order = ProductOrder.query.get(order_id)
    if not order:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404

    user = request.current_user
    order.status = 'cancelled'
    db.session.flush()

    record = add_strike(
        order.customer_phone,
        f'Fake/spam order flagged: {order.order_number}'
    )

    log_action(user['id'], user['fullName'], 'FLAG_SPAM', 'Product Orders',
               f'Flagged order {order.order_number} as spam. '
               f'Strikes for {order.customer_phone}: {record.strike_count}/{MAX_STRIKES_BEFORE_BLOCK}',
               request.remote_addr or '0.0.0.0')

    return jsonify({
        'status': 'success',
        'message': 'Order flagged as spam.',
        'strikeCount': record.strike_count,
        'isBlocked': record.is_blocked
    })


@app.route('/api/admin/phone-blacklist', methods=['GET'])
@require_auth
@require_roles('administrator')
def get_phone_blacklist():
    """Get all phone numbers with strikes or blocks."""
    records = PhoneBlacklist.query.order_by(
        PhoneBlacklist.is_blocked.desc(),
        PhoneBlacklist.strike_count.desc()
    ).all()
    return jsonify({'status': 'success', 'data': [
        {
            'id': r.id,
            'phoneNumber': r.phone_number,
            'strikeCount': r.strike_count,
            'isBlocked': r.is_blocked,
            'reason': r.reason,
            'blockedAt': to_pht(r.blocked_at),
            'createdAt': to_pht(r.created_at),
        } for r in records
    ]})


@app.route('/api/admin/phone-blacklist/<int:record_id>/unblock', methods=['POST'])
@require_auth
@require_roles('administrator')
def unblock_phone(record_id):
    """Admin unblocks a phone number and resets its strike count."""
    record = PhoneBlacklist.query.get(record_id)
    if not record:
        return jsonify({'status': 'error', 'message': 'Record not found'}), 404

    record.is_blocked = False
    record.strike_count = 0
    record.blocked_at = None
    record.reason = None
    db.session.commit()

    user = request.current_user
    log_action(user['id'], user['fullName'], 'UNBLOCK', 'Spam Control',
               f'Unblocked phone {record.phone_number}',
               request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'message': f'{record.phone_number} has been unblocked.'})


@app.route('/api/admin/phone-blacklist/<int:record_id>', methods=['DELETE'])
@require_auth
@require_roles('administrator')
def delete_phone_record(record_id):
    """Completely remove a phone record from the list."""
    record = PhoneBlacklist.query.get(record_id)
    if not record:
        return jsonify({'status': 'error', 'message': 'Record not found'}), 404

    phone = record.phone_number
    db.session.delete(record)
    db.session.commit()

    user = request.current_user
    log_action(user['id'], user['fullName'], 'DELETE_RECORD', 'Spam Control',
               f'Deleted phone record for {phone}',
               request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'message': 'Record deleted.'})


# ============================================
# PRODUCT ORDERS MODULE (Premade Products)
# ============================================

def generate_product_order_number():
    """Generate a unique PO-XXXX order number that won't collide."""
    max_id = db.session.query(db.func.max(ProductOrder.id)).scalar() or 0
    candidate = f"PO-{max_id + 1:04d}"
    # If somehow it already exists, keep incrementing
    offset = 1
    while ProductOrder.query.filter_by(order_number=candidate).first():
        offset += 1
        candidate = f"PO-{max_id + offset:04d}"
    return candidate

def fmt_dt(dt):
    """Serialize a datetime (or date) to ISO-8601 string.
    Datetime objects get a 'Z' suffix so the browser knows it's UTC and
    converts to local time (Asia/Manila = UTC+8) automatically.
    Plain date objects are returned as 'YYYY-MM-DD' with no suffix."""
    if dt is None:
        return None
    if hasattr(dt, 'hour'):   # datetime — append Z
        return dt.isoformat() + 'Z'
    return dt.isoformat()     # date only


def notify_branch_users(branch_id, notif_type, title, message, data=None):
    """Push an in-app notification to all active supervisors of a branch + all admins."""
    if branch_id is None:
        return
    targets = (User.query
               .join(Role, User.role_id == Role.id)
               .filter(Role.key.in_(['administrator', 'supervisor']),
                       User.is_active == True)
               .all())
    for u in targets:
        if u.role.key == 'administrator' or u.branch_id == branch_id:
            db.session.add(Notification(
                user_id=u.id,
                type=notif_type,
                title=title,
                message=message,
                data=data or {},
            ))

def transfer_to_dict(transfer):
    order = transfer.order
    return {
        'id': transfer.id,
        'productOrderId': transfer.product_order_id,
        'orderNumber': order.order_number if order else None,
        'customerName': order.customer_name if order else None,
        'customerPhone': order.customer_phone if order else None,
        'pickupBranchId': order.branch_id if order else None,
        'pickupBranchName': order.branch.name if (order and order.branch) else None,
        'sourceBranchId': transfer.source_branch_id,
        'sourceBranchName': transfer.source_branch.name if transfer.source_branch else None,
        'items': transfer.items,
        'status': transfer.status,
        'transferredByName': transfer.transferred_by.full_name if transfer.transferred_by else None,
        'transferredAt': fmt_dt(transfer.transferred_at),
        'receivedByName': transfer.received_by.full_name if transfer.received_by else None,
        'receivedAt': fmt_dt(transfer.received_at),
        'createdAt': fmt_dt(transfer.created_at),
        'updatedAt': fmt_dt(transfer.updated_at),
    }

def product_order_to_dict(order):
    """Helper to convert ProductOrder model to dictionary"""
    branch_name = order.branch.name if order.branch else None
    transfers = []
    try:
        transfers = [transfer_to_dict(t) for t in (order.transfers or [])]
    except Exception:
        pass

    return {
        'id': order.id,
        'orderNumber': order.order_number,
        'customerName': order.customer_name,
        'customerPhone': order.customer_phone,
        'customerEmail': order.customer_email,
        'customerAddress': order.customer_address,
        'items': order.items,
        'totalAmount': order.total_amount,
        'branchId': order.branch_id,
        'branchName': branch_name,
        'groupId': order.group_id,
        'pickupBranchId': order.pickup_branch_id,
        'pickupBranchName': order.pickup_branch.name if order.pickup_branch else None,
        'shipmentStatus': order.shipment_status or 'not_needed',
        'transfers': transfers,
        'status': order.status,
        'paymentStatus': order.payment_status,
        'amountPaid': order.amount_paid or 0.0,
        'remainingBalance': max(0.0, (order.total_amount or 0.0) - (order.amount_paid or 0.0)),
        'notes': order.notes,
        'createdAt': fmt_dt(order.created_at),
        'updatedAt': fmt_dt(order.updated_at)
    }

def can_manage_product_order(user, order):
    """Check if current user can manage this product order."""
    if user['role'] == 'administrator':
        return True

    if user['role'] == 'supervisor':
        user_branch_id = user.get('branchId')
        if not user_branch_id:
            return False
        # Source branch supervisor OR pickup branch supervisor can manage
        return order.branch_id == user_branch_id or order.pickup_branch_id == user_branch_id

    return False

def build_product_order_timeline(order):
    """Build timeline events for a product order using order fields and audit logs."""
    events = []

    if order.created_at:
        events.append({
            'type': 'created',
            'title': 'Order Placed',
            'description': f"Customer placed order {order.order_number}",
            'timestamp': fmt_dt(order.created_at),
            'by': order.customer_name or 'Customer'
        })

    if order.status and order.status != 'pending':
        events.append({
            'type': 'status',
            'title': 'Status Updated',
            'description': f"Order status is now {order.status}",
            'timestamp': fmt_dt(order.updated_at) if order.updated_at else fmt_dt(order.created_at),
            'by': 'Branch Staff'
        })

    if order.payment_status and order.payment_status != 'unpaid':
        events.append({
            'type': 'payment',
            'title': 'Payment Updated',
            'description': f"Payment status is now {order.payment_status}",
            'timestamp': fmt_dt(order.updated_at) if order.updated_at else fmt_dt(order.created_at),
            'by': 'Branch Staff'
        })

    related_logs = [
        l for l in audit_logs
        if l.get('module') == 'Product Orders' and order.order_number in (l.get('details') or '')
    ]

    for log in related_logs:
        events.append({
            'type': 'audit',
            'title': f"{log.get('action', 'UPDATE').title()} by {log.get('userName', 'User')}",
            'description': log.get('details', ''),
            'timestamp': log.get('timestamp', ''),
            'by': log.get('userName', 'User')
        })

    events.sort(key=lambda e: e.get('timestamp') or '', reverse=True)
    return events

@app.route('/api/product-orders/multi-branch', methods=['POST'])
def create_multi_branch_product_order():
    """Create a single order at the pickup branch. Items from other branches
    generate transfer requests notifying those branches to send the items over."""
    data = request.get_json()

    required = ['customerName', 'customerPhone', 'items', 'pickupBranchId']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    if not data['items']:
        return jsonify({'status': 'error', 'message': 'At least one item is required'}), 400

    # Spam / abuse protection
    phone = data.get('customerPhone', '').strip()
    allowed, spam_msg = check_spam_protection(phone, 'order')
    if not allowed:
        return jsonify({'status': 'error', 'message': spam_msg}), 429

    pickup_branch_id = int(data['pickupBranchId'])
    pickup_branch = Branch.query.get(pickup_branch_id)
    if not pickup_branch or not pickup_branch.is_active:
        return jsonify({'status': 'error', 'message': 'Invalid or inactive pickup branch'}), 400

    user_id = None
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token:
        u = get_user_from_token(token)
        if u:
            user_id = u['id']

    # Validate all items, enrich with source branch info, and reserve inventory
    all_items = []
    items_by_source = {}
    all_deductions = []  # every item deducted at allocation time (requirement: source branch deducts on selection)
    for item_data in data['items']:
        product_id = item_data.get('productId')
        quantity = int(item_data.get('quantity', 1))
        product = PremadeProduct.query.filter_by(id=product_id, is_archived=False).first()
        if not product:
            return jsonify({'status': 'error', 'message': f'Product {product_id} not found'}), 400
        if float(product.quantity) < quantity:
            return jsonify({'status': 'error', 'message': f'Insufficient stock for {product.name}'}), 400

        item_dict = {
            'productId': product.id,
            'name': product.name,
            'sku': product.sku,
            'quantity': quantity,
            'unitPrice': float(product.price),
            'total': float(product.price) * quantity,
            'sourceBranchId': int(product.branch_id),
            'sourceBranchName': product.branch.name if product.branch else None,
        }
        all_items.append(item_dict)
        all_deductions.append((product, quantity))

        src = int(product.branch_id)
        if src != pickup_branch_id:
            items_by_source.setdefault(src, []).append(item_dict)

    needs_transfers = len(items_by_source) > 0
    group_id = str(uuid.uuid4()) if needs_transfers else None

    # Create ONE order at the pickup branch with all items
    order = ProductOrder(
        order_number=generate_product_order_number(),
        customer_name=data['customerName'],
        customer_phone=data['customerPhone'],
        customer_email=data.get('customerEmail', ''),
        customer_address=data.get('customerAddress', ''),
        items=all_items,
        total_amount=sum(i['total'] for i in all_items),
        branch_id=pickup_branch_id,
        pickup_branch_id=pickup_branch_id,
        shipment_status='pending' if needs_transfers else 'not_needed',
        group_id=group_id,
        status='pending',
        payment_status='unpaid',
        user_id=user_id,
        notes=data.get('notes', '')
    )
    db.session.add(order)
    db.session.flush()  # get order.id

    # Deduct inventory at allocation time from every source branch (sales attribution stays with source)
    for product, qty in all_deductions:
        product.quantity = float(product.quantity) - qty

    # Create a transfer request for each source branch ≠ pickup branch
    for src_branch_id, branch_items in items_by_source.items():
        db.session.add(ProductOrderTransfer(
            product_order_id=order.id,
            source_branch_id=src_branch_id,
            items=branch_items,
            status='pending'
        ))
        notify_branch_users(
            src_branch_id,
            'transfer_request',
            f'Transfer Request — {order.order_number}',
            f'Items needed at {pickup_branch.name}. Please prepare and dispatch.',
            {'orderId': order.id, 'orderNumber': order.order_number, 'pickupBranchName': pickup_branch.name},
        )

    db.session.commit()

    log_action(
        user_id or 0, data.get('customerName', 'Customer'), 'CREATE', 'Product Orders',
        f"Order {order.order_number} at {pickup_branch.name} — {len(items_by_source)} transfer request(s) created",
        request.remote_addr or '0.0.0.0'
    )

    return jsonify({'status': 'success', 'data': product_order_to_dict(order)}), 201


@app.route('/api/product-orders/group/<group_id>', methods=['GET'])
@require_auth
@require_roles('administrator')
def get_product_order_group(group_id):
    """Get all orders belonging to the same multi-branch group (admin only)."""
    orders = ProductOrder.query.filter_by(group_id=group_id).order_by(ProductOrder.created_at.asc()).all()
    if not orders:
        return jsonify({'status': 'error', 'message': 'Group not found'}), 404
    return jsonify({'status': 'success', 'data': [product_order_to_dict(o) for o in orders]})


@app.route('/api/product-orders/my-transfer-requests', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_my_transfer_requests():
    """Source branch supervisors see transfer requests assigned to their branch."""
    user = request.current_user
    if user['role'] == 'supervisor':
        branch_id = user.get('branchId')
        if not branch_id:
            return jsonify({'status': 'success', 'data': []})
        transfers = ProductOrderTransfer.query.filter_by(
            source_branch_id=branch_id
        ).order_by(ProductOrderTransfer.created_at.desc()).all()
    else:
        transfers = ProductOrderTransfer.query.order_by(
            ProductOrderTransfer.created_at.desc()
        ).all()
    return jsonify({'status': 'success', 'data': [transfer_to_dict(t) for t in transfers]})


@app.route('/api/product-orders/pickup-queue', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_pickup_queue():
    """Orders where this branch is the pickup location and items come from other branches."""
    user = request.current_user
    if user['role'] == 'supervisor':
        branch_id = user.get('branchId')
        if not branch_id:
            return jsonify({'status': 'success', 'data': []})
        orders = (ProductOrder.query
            .filter(ProductOrder.pickup_branch_id == branch_id)
            .join(ProductOrderTransfer, ProductOrderTransfer.product_order_id == ProductOrder.id)
            .filter(ProductOrderTransfer.source_branch_id != branch_id)
            .distinct()
            .order_by(ProductOrder.created_at.desc())
            .all())
    else:
        orders = (ProductOrder.query
            .join(ProductOrderTransfer, ProductOrderTransfer.product_order_id == ProductOrder.id)
            .distinct()
            .order_by(ProductOrder.created_at.desc())
            .all())
    return jsonify({'status': 'success', 'data': [product_order_to_dict(o) for o in orders]})


@app.route('/api/product-orders/direct-sales', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_direct_sales():
    """Single-branch premade orders where this branch is both the supplier and pickup.
    These don't generate transfers — they're direct sales from the branch's own stock."""
    user = request.current_user
    if user['role'] == 'supervisor':
        branch_id = user.get('branchId')
        if not branch_id:
            return jsonify({'status': 'success', 'data': []})
        orders = (ProductOrder.query
                  .filter_by(branch_id=branch_id, shipment_status='not_needed')
                  .order_by(ProductOrder.created_at.desc())
                  .all())
    else:
        orders = (ProductOrder.query
                  .filter_by(shipment_status='not_needed')
                  .order_by(ProductOrder.created_at.desc())
                  .all())
    return jsonify({'status': 'success', 'data': [product_order_to_dict(o) for o in orders]})


@app.route('/api/product-order-transfers/<int:transfer_id>/mark-transferred', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def mark_transfer_sent(transfer_id):
    """Source branch marks their items as sent to the pickup branch."""
    transfer = ProductOrderTransfer.query.get(transfer_id)
    if not transfer:
        return jsonify({'status': 'error', 'message': 'Transfer request not found'}), 404

    user = request.current_user
    if user['role'] == 'supervisor' and user.get('branchId') != transfer.source_branch_id:
        return jsonify({'status': 'error', 'message': 'Only the source branch can mark this transfer as sent'}), 403

    if transfer.status != 'pending':
        return jsonify({'status': 'error', 'message': 'Transfer is not in pending status'}), 400

    # Inventory was already deducted from the source branch at order creation (allocation).
    # This step only records the physical dispatch.
    transfer.status = 'transferred'
    transfer.transferred_by_id = user['id']
    transfer.transferred_at = datetime.utcnow()
    order = transfer.order
    notify_branch_users(
        order.branch_id if order else None,
        'transfer_dispatched',
        f'Items In Transit — {order.order_number if order else "?"}',
        f'Transfer from {transfer.source_branch.name if transfer.source_branch else "source branch"} is on its way.',
        {'transferId': transfer.id, 'orderId': order.id if order else None, 'orderNumber': order.order_number if order else None},
    )
    db.session.commit()

    is_override = user['role'] == 'administrator' and user.get('branchId') != transfer.source_branch_id
    log_action(user['id'], user['fullName'], 'TRANSFER', 'Product Orders',
        f"{'[ADMIN OVERRIDE] ' if is_override else ''}Transfer {transfer_id} for order {transfer.order.order_number if transfer.order else '?'} dispatched from {transfer.source_branch.name if transfer.source_branch else 'N/A'} to {transfer.order.branch.name if (transfer.order and transfer.order.branch) else 'N/A'}.",
        request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': transfer_to_dict(transfer)})


@app.route('/api/product-order-transfers/<int:transfer_id>/confirm-receipt', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def confirm_transfer_receipt(transfer_id):
    """Pickup branch confirms they received the transferred items; adds to their inventory."""
    transfer = ProductOrderTransfer.query.get(transfer_id)
    if not transfer:
        return jsonify({'status': 'error', 'message': 'Transfer request not found'}), 404

    user = request.current_user
    order = transfer.order
    if user['role'] == 'supervisor' and user.get('branchId') != (order.branch_id if order else None):
        return jsonify({'status': 'error', 'message': 'Only the pickup branch can confirm receipt'}), 403

    if transfer.status != 'transferred':
        return jsonify({'status': 'error', 'message': 'Items have not been marked as transferred yet'}), 400

    pickup_branch = order.branch if order else None
    for item in transfer.items:
        orig_product = PremadeProduct.query.get(item.get('productId')) if item.get('productId') else None
        derived_sku = f"{item['sku']}-{pickup_branch.code}" if pickup_branch else item['sku']

        existing = (
            PremadeProduct.query.filter_by(sku=item['sku'], branch_id=order.branch_id).first()
            or PremadeProduct.query.filter_by(sku=derived_sku, branch_id=order.branch_id).first()
        )
        if existing:
            existing.quantity = float(existing.quantity) + float(item['quantity'])
        else:
            db.session.add(PremadeProduct(
                name=item['name'],
                sku=derived_sku,
                quantity=float(item['quantity']),
                unit=orig_product.unit if orig_product else 'pcs',
                category=orig_product.category if orig_product else 'General',
                price=float(item.get('unitPrice', 0)),
                cost=float(orig_product.cost) if orig_product else 0,
                branch_id=order.branch_id,
                is_archived=False
            ))

    transfer.status = 'received'
    transfer.received_by_id = user['id']
    transfer.received_at = datetime.utcnow()
    db.session.flush()

    # Auto-advance the order when all transfers are received
    if order:
        all_transfers = ProductOrderTransfer.query.filter_by(product_order_id=order.id).all()
        if all(t.status == 'received' for t in all_transfers):
            order.shipment_status = 'received'
            if order.status == 'pending':
                order.status = 'ready'
            notify_branch_users(
                order.branch_id,
                'order_ready',
                f'Order Ready for Pickup — {order.order_number}',
                'All items received. Order automatically marked Ready for Pickup.',
                {'orderId': order.id, 'orderNumber': order.order_number},
            )

    db.session.commit()

    is_override = user['role'] == 'administrator' and user.get('branchId') != (order.branch_id if order else None)
    log_action(user['id'], user['fullName'], 'RECEIVE', 'Product Orders',
        f"{'[ADMIN OVERRIDE] ' if is_override else ''}Transfer {transfer_id} received at {pickup_branch.name if pickup_branch else 'N/A'}. Items added to inventory.",
        request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': transfer_to_dict(transfer)})


@app.route('/api/product-orders', methods=['POST'])
def create_product_order():
    """Create a new product order - public endpoint for ordering premade products"""
    data = request.get_json()

    required = ['customerName', 'customerPhone', 'items', 'branchId']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400

    # Spam / abuse protection
    phone = data.get('customerPhone', '').strip()
    allowed, spam_msg = check_spam_protection(phone, 'order')
    if not allowed:
        return jsonify({'status': 'error', 'message': spam_msg}), 429

    if not data['items'] or len(data['items']) == 0:
        return jsonify({'status': 'error', 'message': 'At least one item is required'}), 400
    
    # Validate branch
    branch_id = data['branchId']
    branch = Branch.query.get(branch_id)
    if not branch or not branch.is_active:
        return jsonify({'status': 'error', 'message': 'Invalid or inactive branch'}), 400
    
    # Check if user is authenticated (optional)
    user_id = None
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token:
        user = get_user_from_token(token)
        if user:
            user_id = user['id']
    
    # Validate items and calculate total
    total_amount = 0
    validated_items = []
    
    for item in data['items']:
        product_id = item.get('productId')
        quantity = item.get('quantity', 1)

        # Find product in database-backed premade products
        product = PremadeProduct.query.filter_by(id=product_id, is_archived=False).first()
        if not product:
            return jsonify({'status': 'error', 'message': f'Product with ID {product_id} not found'}), 400

        if float(product.quantity) < quantity:
            return jsonify({'status': 'error', 'message': f'Insufficient stock for {product.name}'}), 400

        # Enforce that all products come from the selected pickup branch.
        if int(product.branch_id) != int(branch_id):
            return jsonify({'status': 'error', 'message': f'{product.name} is not available in the selected branch'}), 400

        item_total = float(product.price) * quantity
        total_amount += item_total

        validated_items.append({
            'productId': product_id,
            'name': product.name,
            'sku': product.sku,
            'quantity': quantity,
            'unitPrice': float(product.price),
            'total': item_total
        })
    
    payment_amount = float(data.get('paymentAmount') or 0)
    if payment_amount >= total_amount and total_amount > 0:
        initial_payment_status = 'paid'
    elif payment_amount > 0:
        initial_payment_status = 'partial'
    else:
        initial_payment_status = 'unpaid'

    new_order = ProductOrder(
        order_number=generate_product_order_number(),
        customer_name=data['customerName'],
        customer_phone=data['customerPhone'],
        customer_email=data.get('customerEmail', ''),
        customer_address=data.get('customerAddress', ''),
        items=validated_items,
        total_amount=total_amount,
        branch_id=branch_id,
        status='pending',
        payment_status=initial_payment_status,
        amount_paid=payment_amount,
        user_id=user_id,
        notes=data.get('notes', '')
    )
    
    db.session.add(new_order)
    db.session.commit()

    log_action(
        user_id if user_id else 0,
        data.get('customerName', 'Customer'),
        'CREATE',
        'Product Orders',
        f"Created product order {new_order.order_number} for branch {branch.name}",
        request.remote_addr or '0.0.0.0'
    )
    
    return jsonify({'status': 'success', 'data': product_order_to_dict(new_order)}), 201

@app.route('/api/product-orders', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_product_orders():
    """Get all product orders - staff endpoint"""
    user = request.current_user
    status = request.args.get('status')
    
    query = ProductOrder.query
    
    if status:
        query = query.filter_by(status=status)
    
    # Supervisors only see orders assigned to their branch.
    if user['role'] == 'supervisor':
        if not user.get('branchId'):
            return jsonify({'status': 'error', 'message': 'Supervisor account has no assigned branch'}), 400
        query = query.filter_by(branch_id=user['branchId'])
    
    orders = query.order_by(ProductOrder.created_at.desc()).all()
    
    return jsonify({'status': 'success', 'data': [product_order_to_dict(o) for o in orders]})

@app.route('/api/product-orders/<int:order_id>', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor')
def update_product_order(order_id):
    """Update a product order status"""
    order = ProductOrder.query.get(order_id)
    if not order:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404
    
    user = request.current_user
    if not can_manage_product_order(user, order):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    data = request.get_json()

    valid_statuses = {'pending', 'processing', 'ready', 'completed', 'cancelled'}
    valid_payment_statuses = {'unpaid', 'partial', 'paid'}
    
    updated_fields = []

    if 'status' in data:
        incoming_status = data['status']
        if incoming_status in {'done', 'finished'}:
            incoming_status = 'completed'

        if incoming_status not in valid_statuses:
            return jsonify({'status': 'error', 'message': 'Invalid status'}), 400

        # Completion rule: block ready/completed until all transferred items are physically at the pickup branch
        if incoming_status in ('ready', 'completed'):
            pending_transfers = [
                t for t in (order.transfers or [])
                if t.status != 'received'
            ]
            if pending_transfers:
                return jsonify({
                    'status': 'error',
                    'message': f"Cannot mark as '{incoming_status}'. {len(pending_transfers)} transfer(s) are still in transit. All items must be received at the pickup branch first."
                }), 400

        previous_status = order.status
        if previous_status != incoming_status:
            updated_fields.append(f"status: {previous_status} -> {incoming_status}")
        order.status = incoming_status

        # Deduct inventory only once when transitioning into completed.
        if previous_status != 'completed' and incoming_status == 'completed':
            pickup_branch = order.branch
            stock_deductions = []
            for item in order.items:
                source_branch_id = item.get('sourceBranchId', order.branch_id)
                item_sku = item.get('sku', '')

                if source_branch_id == order.branch_id:
                    # Local item — deduct from the original product at the pickup branch
                    product = PremadeProduct.query.get(item.get('productId'))
                    if not product or product.branch_id != order.branch_id:
                        product = PremadeProduct.query.filter_by(
                            sku=item_sku, branch_id=order.branch_id
                        ).first()
                else:
                    # Transferred item — find the copy added to the pickup branch on receipt
                    derived_sku = f"{item_sku}-{pickup_branch.code}" if pickup_branch else item_sku
                    product = (
                        PremadeProduct.query.filter_by(sku=item_sku, branch_id=order.branch_id).first()
                        or PremadeProduct.query.filter_by(sku=derived_sku, branch_id=order.branch_id).first()
                    )

                if not product:
                    return jsonify({'status': 'error', 'message': f"Cannot complete order. Product '{item.get('name')}' not found in pickup branch inventory. Ensure all transfers have been received first."}), 400

                requested_qty = float(item.get('quantity', 0))
                current_qty = float(product.quantity)
                if current_qty < requested_qty:
                    return jsonify({
                        'status': 'error',
                        'message': f"Cannot complete order. Insufficient stock for '{product.name}' at pickup branch. Current stock: {current_qty:g}, required: {requested_qty:g}"
                    }), 400

                stock_deductions.append((product, requested_qty))

            for product, requested_qty in stock_deductions:
                product.quantity = float(product.quantity) - requested_qty

            # Notify every source branch that their sold items have been delivered
            source_branch_ids = {t.source_branch_id for t in (order.transfers or [])}
            for src_id in source_branch_ids:
                notify_branch_users(
                    src_id,
                    'sale_completed',
                    f'Sale Completed — {order.order_number}',
                    f'Your items have been delivered to the customer at {order.branch.name if order.branch else "pickup branch"}.',
                    {'orderId': order.id, 'orderNumber': order.order_number,
                     'pickupBranchName': order.branch.name if order.branch else None},
                )

    if 'paymentStatus' in data:
        if data['paymentStatus'] not in valid_payment_statuses:
            return jsonify({'status': 'error', 'message': 'Invalid payment status'}), 400
        if order.payment_status != data['paymentStatus']:
            updated_fields.append(f"payment: {order.payment_status} -> {data['paymentStatus']}")
        order.payment_status = data['paymentStatus']
    
    if 'addPayment' in data:
        add_amount = float(data.get('addPayment') or 0)
        if add_amount > 0:
            current_paid = order.amount_paid or 0.0
            order.amount_paid = current_paid + add_amount
            if order.amount_paid >= order.total_amount:
                order.amount_paid = order.total_amount
                prev = order.payment_status
                order.payment_status = 'paid'
                updated_fields.append(f"payment: {prev} -> paid (added ₱{add_amount:,.2f})")
            else:
                order.payment_status = 'partial'
                remaining = order.total_amount - order.amount_paid
                updated_fields.append(f"payment: added ₱{add_amount:,.2f}, remaining ₱{remaining:,.2f}")

    if 'notes' in data:
        if order.notes != data['notes']:
            updated_fields.append('notes updated')
        order.notes = data['notes']

    db.session.commit()

    if updated_fields:
        log_action(
            user['id'],
            user['fullName'],
            'UPDATE',
            'Product Orders',
            f"Updated product order {order.order_number} ({'; '.join(updated_fields)})",
            request.remote_addr or '0.0.0.0'
        )
    
    return jsonify({'status': 'success', 'data': product_order_to_dict(order)})

@app.route('/api/product-orders/<int:order_id>', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_product_order(order_id):
    """Get detailed product order by ID for branch admin/supervisor."""
    order = ProductOrder.query.get(order_id)
    if not order:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404

    user = request.current_user
    if not can_manage_product_order(user, order):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    return jsonify({'status': 'success', 'data': product_order_to_dict(order)})

@app.route('/api/product-orders/<int:order_id>/timeline', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_product_order_timeline(order_id):
    """Get timeline events for a product order."""
    order = ProductOrder.query.get(order_id)
    if not order:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404

    user = request.current_user
    if not can_manage_product_order(user, order):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    return jsonify({'status': 'success', 'data': build_product_order_timeline(order)})

@app.route('/api/product-orders/my-orders', methods=['GET'])
@require_auth
def get_my_product_orders():
    """Get product orders for the logged-in customer"""
    user_id = request.current_user['id']
    orders = ProductOrder.query.filter_by(user_id=user_id).order_by(ProductOrder.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [product_order_to_dict(o) for o in orders]})

# ============================================
# NOTIFICATIONS
# ============================================

@app.route('/api/notifications', methods=['GET'])
@require_auth
def get_notifications():
    uid = request.current_user['id']
    limit = min(int(request.args.get('limit', 30)), 100)
    notifs = (Notification.query
              .filter_by(user_id=uid)
              .order_by(Notification.created_at.desc())
              .limit(limit).all())
    unread = Notification.query.filter_by(user_id=uid, is_read=False).count()
    return jsonify({
        'status': 'success',
        'data': [{
            'id': n.id, 'type': n.type, 'title': n.title,
            'message': n.message, 'data': n.data,
            'isRead': n.is_read,
            'createdAt': fmt_dt(n.created_at),
        } for n in notifs],
        'unreadCount': unread,
    })

@app.route('/api/notifications/read-all', methods=['POST'])
@require_auth
def mark_all_notifications_read():
    Notification.query.filter_by(user_id=request.current_user['id'], is_read=False).update({'is_read': True})
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/notifications/<int:notif_id>/read', methods=['POST'])
@require_auth
def mark_notification_read(notif_id):
    n = Notification.query.filter_by(id=notif_id, user_id=request.current_user['id']).first()
    if n:
        n.is_read = True
        db.session.commit()
    return jsonify({'status': 'success'})

# ============================================
# TRANSFER DASHBOARD + BULK ACTIONS
# ============================================

@app.route('/api/product-orders/transfer-dashboard', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_transfer_dashboard():
    user = request.current_user
    now = datetime.utcnow()
    status_filter = request.args.get('status')

    if user['role'] == 'supervisor':
        branch_id = user.get('branchId')
        outgoing = ProductOrderTransfer.query.filter_by(source_branch_id=branch_id).all()
        pickup_ids = [r[0] for r in db.session.query(ProductOrder.id).filter_by(branch_id=branch_id).all()]
        incoming = ProductOrderTransfer.query.filter(
            ProductOrderTransfer.product_order_id.in_(pickup_ids),
            ProductOrderTransfer.source_branch_id != branch_id,
        ).all() if pickup_ids else []
        all_t = list({t.id: t for t in outgoing + incoming}.values())
    else:
        all_t = ProductOrderTransfer.query.all()

    if status_filter:
        all_t = [t for t in all_t if t.status == status_filter]

    def enrich(t):
        d = transfer_to_dict(t)
        ref = (t.created_at if t.status == 'pending'
               else t.transferred_at or t.updated_at or t.created_at if t.status == 'transferred'
               else t.received_at or t.updated_at or t.created_at)
        aging = (now - ref).total_seconds() / 3600 if ref else 0
        d['agingHours'] = round(aging, 1)
        d['isOverdue'] = aging > 24 and t.status != 'received'
        return d

    enriched = sorted([enrich(t) for t in all_t], key=lambda x: x['createdAt'] or '', reverse=True)
    counts = {s: sum(1 for t in all_t if t.status == s) for s in ('pending', 'transferred', 'received')}
    return jsonify({
        'status': 'success',
        'data': enriched,
        'summary': {
            'pending': counts['pending'],
            'inTransit': counts['transferred'],
            'received': counts['received'],
            'overdue': sum(1 for e in enriched if e['isOverdue']),
        },
    })

@app.route('/api/product-order-transfers/bulk-action', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def bulk_transfer_action():
    user = request.current_user
    data = request.get_json()
    action = data.get('action')          # 'mark-sent' | 'confirm-receipt'
    transfer_ids = data.get('transferIds', [])
    if not action or not transfer_ids:
        return jsonify({'status': 'error', 'message': 'action and transferIds required'}), 400

    ok, failed = [], []
    for tid in transfer_ids:
        transfer = ProductOrderTransfer.query.get(int(tid))
        if not transfer:
            failed.append({'id': tid, 'reason': 'Not found'}); continue

        if action == 'mark-sent':
            if user['role'] == 'supervisor' and user.get('branchId') != transfer.source_branch_id:
                failed.append({'id': tid, 'reason': 'Not your branch'}); continue
            if transfer.status != 'pending':
                failed.append({'id': tid, 'reason': f'Already {transfer.status}'}); continue
            transfer.status = 'transferred'
            transfer.transferred_by_id = user['id']
            transfer.transferred_at = datetime.utcnow()
            order = transfer.order
            notify_branch_users(
                order.branch_id if order else None,
                'transfer_dispatched',
                f'Items In Transit — {order.order_number if order else "?"}',
                f'Transfer from {transfer.source_branch.name if transfer.source_branch else "source"} is on its way.',
                {'transferId': transfer.id, 'orderId': order.id if order else None},
            )
            ok.append(tid)

        elif action == 'confirm-receipt':
            order = transfer.order
            if user['role'] == 'supervisor' and user.get('branchId') != (order.branch_id if order else None):
                failed.append({'id': tid, 'reason': 'Not your branch'}); continue
            if transfer.status != 'transferred':
                failed.append({'id': tid, 'reason': f'Status is {transfer.status}'}); continue

            pickup_branch = order.branch if order else None
            for item in transfer.items:
                orig = PremadeProduct.query.get(item.get('productId')) if item.get('productId') else None
                derived_sku = f"{item['sku']}-{pickup_branch.code}" if pickup_branch else item['sku']
                existing = (
                    PremadeProduct.query.filter_by(sku=item['sku'], branch_id=order.branch_id).first()
                    or PremadeProduct.query.filter_by(sku=derived_sku, branch_id=order.branch_id).first()
                )
                if existing:
                    existing.quantity = float(existing.quantity) + float(item['quantity'])
                else:
                    db.session.add(PremadeProduct(
                        name=item['name'], sku=derived_sku,
                        quantity=float(item['quantity']),
                        unit=orig.unit if orig else 'pcs',
                        category=orig.category if orig else 'General',
                        price=float(item.get('unitPrice', 0)),
                        cost=float(orig.cost) if orig else 0,
                        branch_id=order.branch_id, is_archived=False,
                    ))
            transfer.status = 'received'
            transfer.received_by_id = user['id']
            transfer.received_at = datetime.utcnow()
            db.session.flush()
            if order:
                all_t2 = ProductOrderTransfer.query.filter_by(product_order_id=order.id).all()
                if all(t.status == 'received' for t in all_t2):
                    order.shipment_status = 'received'
                    if order.status == 'pending':
                        order.status = 'ready'
                    notify_branch_users(
                        order.branch_id, 'order_ready',
                        f'Order Ready — {order.order_number}',
                        'All items received. Marked Ready for Pickup.',
                        {'orderId': order.id, 'orderNumber': order.order_number},
                    )
            ok.append(tid)
        else:
            failed.append({'id': tid, 'reason': 'Unknown action'})

    db.session.commit()
    log_action(user['id'], user['fullName'], 'BULK_TRANSFER', 'Product Orders',
               f"Bulk {action}: {len(ok)} succeeded, {len(failed)} failed",
               request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': {'succeeded': ok, 'failed': failed}})

# ============================================
# CUSTOMER ORDERS MODULE
# ============================================

@app.route('/api/customer-orders', methods=['POST'])
def place_customer_order():
    """Place a new customer order - supports both authenticated and guest users"""
    data = request.get_json()
    
    required = ['customerName', 'customerPhone', 'vehicleInfo', 'services']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    if not data['services']:
        return jsonify({'status': 'error', 'message': 'At least one service is required'}), 400
    
    # Validate branch if provided
    branch_id = data.get('branchId', None)
    if branch_id:
        branch = Branch.query.get(branch_id)
        if not branch or not branch.is_active:
            return jsonify({'status': 'error', 'message': 'Invalid or inactive branch'}), 400
    
    # Check if user is authenticated (optional)
    user_id = None
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token:
        user = get_user_from_token(token)
        if user:
            user_id = user['id']
    
    order_count = CustomerOrder.query.count() + 1
    order_number = f"CO-{order_count:04d}"
    
    new_order = CustomerOrder(
        order_number=order_number,
        customer_name=data['customerName'],
        customer_phone=data['customerPhone'],
        customer_email=data.get('customerEmail', ''),
        customer_address=data.get('customerAddress', ''),
        vehicle_info={
            'make': data['vehicleInfo'].get('make', ''),
            'model': data['vehicleInfo'].get('model', ''),
            'year': str(data['vehicleInfo'].get('year', '')),
            'plateNumber': data['vehicleInfo'].get('plateNumber', '')
        },
        services=data['services'],
        notes=data.get('notes', ''),
        status='pending',
        branch_id=branch_id,
        user_id=user_id,
        quotation_status='pending_quotation'
    )
    
    db.session.add(new_order)
    db.session.commit()
    
    return jsonify({'status': 'success', 'data': customer_order_to_dict(new_order)}), 201

@app.route('/api/customer-orders', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager', 'staff')
def get_customer_orders():
    """Get customer orders - filtered by branch for non-admin users"""
    user = request.current_user
    
    # Administrators can see all orders
    if user['role'] == 'administrator':
        orders = CustomerOrder.query.order_by(CustomerOrder.created_at.desc()).all()
    else:
        # Other users can only see orders from their branch
        # Use branch_id directly from user if available, otherwise look up by name
        if user.get('branchId'):
            orders = CustomerOrder.query.filter_by(branch_id=user['branchId']).order_by(CustomerOrder.created_at.desc()).all()
        elif user.get('branch'):
            user_branch = Branch.query.filter_by(name=user['branch']).first()
            if user_branch:
                orders = CustomerOrder.query.filter_by(branch_id=user_branch.id).order_by(CustomerOrder.created_at.desc()).all()
            else:
                # If branch not found, return empty list
                orders = []
        else:
            # If no branch info, return empty list
            orders = []
    
    return jsonify({'status': 'success', 'data': [customer_order_to_dict(o) for o in orders]})

@app.route('/api/customer-orders/<int:order_id>', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def get_customer_order(order_id):
    """Get a specific customer order"""
    user = request.current_user
    order = CustomerOrder.query.get(order_id)
    if order is None:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404
    
    # Branch-level access control
    if user['role'] != 'administrator':
        # Use branch_id directly from user if available, otherwise look up by name
        user_branch_id = None
        if user.get('branchId'):
            user_branch_id = user['branchId']
        elif user.get('branch'):
            user_branch = Branch.query.filter_by(name=user['branch']).first()
            if user_branch:
                user_branch_id = user_branch.id
        
        if not user_branch_id or order.branch_id != user_branch_id:
            return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    
    return jsonify({'status': 'success', 'data': customer_order_to_dict(order)})

@app.route('/api/customer-orders/<int:order_id>/status', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def update_customer_order_status(order_id):
    """Update customer order status"""
    user = request.current_user
    order = CustomerOrder.query.get(order_id)
    if order is None:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404
    
    # Branch-level access control
    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if not user_branch or order.branch_id != user_branch.id:
            return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    
    data = request.get_json()
    new_status = data.get('status')
    
    # Accept more status options
    valid_statuses = ['pending', 'processing', 'in_progress', 'ready_for_installation', 'completed', 'delivered', 'cancelled']
    if new_status not in valid_statuses:
        return jsonify({'status': 'error', 'message': f'Invalid status. Valid options: {", ".join(valid_statuses)}'}), 400
    
    order.status = new_status
    db.session.commit()
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Customer Orders', f"Updated order status: {order.order_number} to {new_status}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': customer_order_to_dict(order)})

@app.route('/api/auth/register', methods=['POST'])
def register_customer():
    """Register a new customer account"""
    data = request.get_json()
    
    required = ['username', 'password', 'email', 'fullName', 'phone']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    # Check if username or email already exists
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'status': 'error', 'message': 'Username already exists'}), 400
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'status': 'error', 'message': 'Email already exists'}), 400
    
    # Get customer role
    customer_role = Role.query.filter_by(key='customer').first()
    if not customer_role:
        return jsonify({'status': 'error', 'message': 'Customer role not configured'}), 500
    
    # Create new customer user
    new_user = User(
        username=data['username'],
        password=hash_password(data['password']),
        email=data['email'],
        full_name=data['fullName'],
        role_id=customer_role.id,
        branch_id=None,
        branch=None,
        is_active=True
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    # Generate session token
    token = secrets.token_hex(32)
    sessions[token] = {
        'userId': new_user.id,
        'createdAt': fmt_dt(datetime.utcnow())
    }
    
    log_action(new_user.id, new_user.full_name, 'REGISTER', 'Auth', 'New customer registered', request.remote_addr or '0.0.0.0')
    
    return jsonify({
        'status': 'success',
        'data': {
            'token': token,
            'user': user_to_dict(new_user)
        }
    }), 201

@app.route('/api/customer-orders/my-orders', methods=['GET'])
@require_auth
@require_roles('customer')
def get_my_customer_orders():
    """Get orders for the logged-in customer"""
    user = request.current_user
    
    orders = CustomerOrder.query.filter_by(user_id=user['id']).order_by(CustomerOrder.created_at.desc()).all()
    
    return jsonify({'status': 'success', 'data': [customer_order_to_dict(o) for o in orders]})

@app.route('/api/customer-orders/my-orders/<int:order_id>', methods=['GET'])
@require_auth
@require_roles('customer')
def get_my_customer_order(order_id):
    """Get a specific order for the logged-in customer"""
    user = request.current_user
    
    order = CustomerOrder.query.filter_by(id=order_id, user_id=user['id']).first()
    if not order:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404
    
    return jsonify({'status': 'success', 'data': customer_order_to_dict(order)})

@app.route('/api/customer-orders/<int:order_id>/quotation', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def set_customer_order_quotation(order_id):
    """Set quotation for a customer order"""
    user = request.current_user
    order = CustomerOrder.query.get(order_id)
    
    if order is None:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404
    
    # Branch-level access control
    if user['role'] != 'administrator':
        user_branch_id = user.get('branchId')
        if not user_branch_id and user.get('branch'):
            user_branch = Branch.query.filter_by(name=user['branch']).first()
            user_branch_id = user_branch.id if user_branch else None
        
        if not user_branch_id or order.branch_id != user_branch_id:
            return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    
    data = request.get_json()
    
    # Validate quotation items
    items = data.get('items', [])
    if not items:
        return jsonify({'status': 'error', 'message': 'Quotation items are required'}), 400
    
    # Calculate total
    total = 0
    for item in items:
        item_total = float(item.get('quantity', 1)) * float(item.get('unitPrice', 0))
        item['total'] = item_total
        total += item_total
    
    order.quotation_items = items
    order.quotation_total = total
    order.quotation_notes = data.get('notes', '')
    order.quotation_status = 'quoted'
    order.quoted_at = datetime.utcnow()
    
    db.session.commit()
    
    log_action(user['id'], user['fullName'], 'QUOTATION', 'Customer Orders', f"Sent quotation for order: {order.order_number}, Total: {total}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': customer_order_to_dict(order)})

@app.route('/api/customer-orders/<int:order_id>/respond', methods=['PUT'])
@require_auth
@require_roles('customer')
def respond_to_quotation(order_id):
    """Customer responds to quotation (accept/reject)"""
    user = request.current_user
    
    order = CustomerOrder.query.filter_by(id=order_id, user_id=user['id']).first()
    if not order:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404
    
    if order.quotation_status != 'quoted':
        return jsonify({'status': 'error', 'message': 'No quotation to respond to'}), 400
    
    data = request.get_json()
    response = data.get('response')  # 'accept' or 'reject'
    
    if response not in ['accept', 'reject']:
        return jsonify({'status': 'error', 'message': 'Invalid response. Use "accept" or "reject"'}), 400
    
    order.quotation_status = 'accepted' if response == 'accept' else 'rejected'
    order.customer_response_notes = data.get('notes', '')
    order.responded_at = datetime.utcnow()
    
    # If accepted, update order status to processing
    if response == 'accept':
        order.status = 'processing'
    
    db.session.commit()
    
    log_action(user['id'], user['fullName'], 'RESPOND', 'Customer Orders', f"Customer {response}ed quotation for order: {order.order_number}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': customer_order_to_dict(order)})

# ============================================
# FORECASTING MODULE
# ============================================

@app.route('/api/forecasting/inventory', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_inventory_forecast():
    from sqlalchemy import func
    period = request.args.get('period', 'month')
    period_days = {'week': 7, 'month': 30, 'quarter': 90}.get(period, 30)
    today = datetime.now().date()
    cutoff = today + timedelta(days=period_days)

    cache = AIPredictionCache.query.first()
    predictions = []
    if cache and cache.status == 'done':
        try:
            predictions = json.loads(cache.predictions_json or '[]')
        except Exception:
            predictions = []

    # Items needing restock within the selected period
    restock_items = []
    for p in predictions:
        days_left = p.get('daysUntilStockout', 9999)
        restock_by = p.get('restockByDate')
        in_period = days_left <= period_days
        if restock_by:
            try:
                in_period = in_period or (datetime.strptime(restock_by, '%Y-%m-%d').date() <= cutoff)
            except Exception:
                pass
        if in_period:
            mat = InventoryMaterial.query.filter_by(item_id=p['itemId'], is_archived=False).first()
            unit_price = float(mat.unit_price) if mat else 0
            restock_items.append({**p, 'estimatedCost': round(p.get('suggestedRestockQty', 0) * unit_price, 2)})

    restock_items.sort(key=lambda x: x.get('daysUntilStockout', 9999))

    # Monthly usage trend from MaterialUsageLog — last 6 months
    six_months_ago = datetime.now() - timedelta(days=180)
    is_sqlite = 'sqlite' in str(db.engine.url)
    if is_sqlite:
        rows = db.session.query(
            func.strftime('%Y-%m', MaterialUsageLog.created_at).label('month'),
            func.sum(MaterialUsageLog.quantity_used).label('total')
        ).filter(MaterialUsageLog.created_at >= six_months_ago).group_by('month').order_by('month').all()
    else:
        rows = db.session.query(
            func.to_char(MaterialUsageLog.created_at, 'YYYY-MM').label('month'),
            func.sum(MaterialUsageLog.quantity_used).label('total')
        ).filter(MaterialUsageLog.created_at >= six_months_ago).group_by('month').order_by('month').all()

    monthly_usage = [{'month': r.month, 'total': float(r.total or 0), 'projected': False} for r in rows]

    # Add 3 projected months using avg daily usage from AI
    avg_daily_all = sum(p.get('avgDailyUsage', 0) for p in predictions) if predictions else 0
    for i in range(1, 4):
        future = datetime.now() + timedelta(days=30 * i)
        monthly_usage.append({
            'month': future.strftime('%Y-%m'),
            'total': round(avg_daily_all * 30, 1),
            'projected': True
        })

    urgent = [p for p in predictions if p.get('daysUntilStockout', 9999) <= 7]
    soon = [p for p in predictions if 7 < p.get('daysUntilStockout', 9999) <= 30]
    top_consuming = max(predictions, key=lambda p: p.get('avgDailyUsage', 0)) if predictions else None

    return jsonify({'status': 'success', 'data': {
        'restockItems': restock_items,
        'monthlyUsageTrend': monthly_usage,
        'totalPredictedItems': len(predictions),
        'urgentCount': len(urgent),
        'soonCount': len(soon),
        'periodItemCount': len(restock_items),
        'estimatedRestockCost': round(sum(r.get('estimatedCost', 0) for r in restock_items), 2),
        'topConsuming': top_consuming,
        'hasPredictions': len(predictions) > 0,
        'predictionStatus': cache.status if cache else 'idle',
        'period': period,
    }})

@app.route('/api/forecasting/demand', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_demand_forecast():
    # Simple demand forecasting based on historical data
    months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']
    
    # Simulated forecast based on completed orders
    completed_count = len([jo for jo in job_orders if jo['status'] == 'completed'])
    base_demand = max(completed_count * 1.2, 5)  # Minimum 5 orders forecasted
    
    forecast = []
    for i, month in enumerate(months):
        # Add some variance for realistic forecasting
        seasonal_factor = 1.0 + (0.1 * (i % 3))  # Slight seasonal variation
        forecasted = round(base_demand * seasonal_factor + random.uniform(-2, 2))
        
        forecast.append({
            'month': month,
            'forecastedOrders': max(forecasted, 1),
            'forecastedRevenue': round(forecasted * 500, 2),  # Avg order value
            'confidence': round(85 - (i * 3), 1)  # Confidence decreases over time
        })
    
    return jsonify({'status': 'success', 'data': forecast})

@app.route('/api/forecasting/materials', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_material_forecast():
    # Material requirement prediction
    forecasts = []
    
    for material in raw_materials:
        if material['isArchived']:
            continue
        
        # Calculate average daily usage (simulated)
        daily_usage = material['quantity'] * 0.02  # 2% daily usage
        days_until_reorder = int((material['quantity'] - material['reorderPoint']) / daily_usage) if daily_usage > 0 else 999
        
        forecasts.append({
            'materialId': material['id'],
            'name': material['name'],
            'currentStock': material['quantity'],
            'reorderPoint': material['reorderPoint'],
            'dailyUsage': round(daily_usage, 2),
            'daysUntilReorder': max(days_until_reorder, 0),
            'recommendedOrderQty': max(int(daily_usage * 30), material['reorderPoint']),  # 30 days supply
            'urgency': 'high' if days_until_reorder <= 7 else 'medium' if days_until_reorder <= 14 else 'low'
        })
    
    # Sort by urgency
    urgency_order = {'high': 0, 'medium': 1, 'low': 2}
    forecasts.sort(key=lambda x: urgency_order[x['urgency']])
    
    return jsonify({'status': 'success', 'data': forecasts})

# ============================================
# REPORTING MODULE
# ============================================

@app.route('/api/reports/sales', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def get_sales_report():
    user = request.current_user
    start_date = request.args.get('startDate', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    end_date = request.args.get('endDate', datetime.now().strftime('%Y-%m-%d'))
    branch_id = request.args.get('branchId')

    try:
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format'}), 400

    # ── Job Orders ──
    jo_query = JobOrder.query.filter(
        JobOrder.created_at >= start_dt,
        JobOrder.created_at <= end_dt
    )

    user_branch = None
    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if user_branch:
            jo_query = jo_query.filter(JobOrder.branch_id == user_branch.id)
        else:
            jo_query = jo_query.filter(False)
    elif branch_id:
        jo_query = jo_query.filter(JobOrder.branch_id == int(branch_id))

    orders = jo_query.all()

    total_orders = len(orders)
    total_revenue = sum(float(o.total_price) for o in orders if o.status == 'completed')
    total_pending_revenue = sum(float(o.balance) for o in orders if o.payment_status != 'paid')

    status_breakdown = {}
    daily_sales = {}

    for o in orders:
        status = o.status
        if status not in status_breakdown:
            status_breakdown[status] = {'count': 0, 'value': 0}
        status_breakdown[status]['count'] += 1
        status_breakdown[status]['value'] += float(o.total_price)

        date = o.created_at.strftime('%Y-%m-%d') if o.created_at else ''
        if date:
            if date not in daily_sales:
                daily_sales[date] = {'orders': 0, 'revenue': 0}
            daily_sales[date]['orders'] += 1
            if o.status == 'completed':
                daily_sales[date]['revenue'] += float(o.total_price)

    # ── Premade Product Orders ──
    # Each branch gets revenue credit for items where sourceBranchId == their branch.
    # This covers both single-branch orders (all items attributed to one branch) and
    # multi-branch orders (each branch credited for items they supplied).
    all_product_orders = ProductOrder.query.filter(
        ProductOrder.created_at >= start_dt,
        ProductOrder.created_at <= end_dt
    ).all()

    premade_revenue = 0.0
    premade_pending = 0.0
    premade_orders_seen = set()
    premade_daily = {}

    for po in all_product_orders:
        # Determine how much of this order is attributed to the current branch
        if user['role'] != 'administrator':
            if not user_branch:
                continue
            attributed_total = sum(
                float(item.get('total', 0))
                for item in (po.items or [])
                if item.get('sourceBranchId') == user_branch.id
            )
        elif branch_id:
            bid = int(branch_id)
            attributed_total = sum(
                float(item.get('total', 0))
                for item in (po.items or [])
                if item.get('sourceBranchId') == bid
            )
        else:
            # Admin with no branch filter: full order value
            attributed_total = float(po.total_amount or 0)

        if attributed_total <= 0:
            continue

        premade_orders_seen.add(po.id)
        date = po.created_at.strftime('%Y-%m-%d') if po.created_at else ''
        if date not in premade_daily:
            premade_daily[date] = {'orders': 0, 'revenue': 0}
        premade_daily[date]['orders'] += 1

        if po.status == 'completed':
            premade_revenue += attributed_total
            if date:
                premade_daily[date]['revenue'] += attributed_total
        elif po.status not in ('cancelled',):
            # pending / processing / ready all count as pending revenue
            premade_pending += attributed_total

    report = {
        'period': {'startDate': start_date, 'endDate': end_date},
        'summary': {
            'totalOrders': total_orders,
            'completedOrders': sum(1 for o in orders if o.status == 'completed'),
            'totalRevenue': total_revenue,
            'pendingRevenue': total_pending_revenue,
            'averageOrderValue': round(total_revenue / total_orders, 2) if total_orders > 0 else 0
        },
        'statusBreakdown': [
            {'status': k, 'count': v['count'], 'value': v['value']}
            for k, v in status_breakdown.items()
        ],
        'dailySales': [
            {'date': k, 'orders': v['orders'], 'revenue': v['revenue']}
            for k, v in sorted(daily_sales.items())
        ],
        'premadeSummary': {
            'totalOrders': len(premade_orders_seen),
            'completedRevenue': round(premade_revenue, 2),
            'pendingRevenue': round(premade_pending, 2),
        },
        'premadeDailySales': [
            {'date': k, 'orders': v['orders'], 'revenue': v['revenue']}
            for k, v in sorted(premade_daily.items())
        ],
    }

    return jsonify({'status': 'success', 'data': report})

@app.route('/api/reports/inventory', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_inventory_report():
    user = request.current_user
    branch_id = request.args.get('branchId')

    # Branch-level access control
    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if user_branch:
            branch_id = user_branch.id
        else:
            return jsonify({'status': 'error', 'message': 'Branch not found'}), 404

    rm_query = InventoryMaterial.query.filter_by(is_archived=False)
    if branch_id:
        rm_query = rm_query.filter_by(branch_id=int(branch_id))
    rm_items = rm_query.all()

    fg_query = PremadeProduct.query.filter_by(is_archived=False)
    if branch_id:
        fg_query = fg_query.filter_by(branch_id=int(branch_id))
    fg_items = fg_query.all()

    total_rm_value = sum(float(m.stock_quantity) * float(m.unit_price) for m in rm_items)
    total_fg_value = sum(float(fg.quantity) * float(fg.price) for fg in fg_items)
    total_fg_cost = sum(float(fg.quantity) * float(fg.cost) for fg in fg_items)

    low_stock = [
        m for m in rm_items
        if float(m.low_stock_threshold or 0) > 0 and float(m.stock_quantity) <= float(m.low_stock_threshold)
    ]

    # Category breakdown grouped by material_type
    rm_by_category = {}
    for m in rm_items:
        cat = m.material_type or 'Unknown'
        if cat not in rm_by_category:
            rm_by_category[cat] = {'count': 0, 'value': 0}
        rm_by_category[cat]['count'] += 1
        rm_by_category[cat]['value'] += float(m.stock_quantity) * float(m.unit_price)

    report = {
        'summary': {
            'totalRawMaterials': len(rm_items),
            'totalFinishedGoods': len(fg_items),
            'rawMaterialsValue': round(total_rm_value, 2),
            'finishedGoodsValue': round(total_fg_value, 2),
            'finishedGoodsCost': round(total_fg_cost, 2),
            'potentialProfit': round(total_fg_value - total_fg_cost, 2),
            'lowStockItemsCount': len(low_stock)
        },
        'lowStockItems': [
            {
                'id': m.id,
                'name': m.material_type,
                'currentStock': float(m.stock_quantity),
                'reorderPoint': float(m.low_stock_threshold or 0),
                'unit': ''
            }
            for m in low_stock
        ],
        'categoryBreakdown': [
            {'category': k, 'count': v['count'], 'value': round(v['value'], 2)}
            for k, v in rm_by_category.items()
        ]
    }

    return jsonify({'status': 'success', 'data': report})


@app.route('/api/reports/branch-settlement', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor')
def get_branch_settlement():
    """Inter-branch settlement ledger.
    For every completed multi-branch order, records how much each source branch
    is owed by the pickup branch for items they supplied.
    Admins see all branches; supervisors see entries affecting their branch."""
    user = request.current_user
    start_date = request.args.get('startDate', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    end_date = request.args.get('endDate', datetime.now().strftime('%Y-%m-%d'))

    try:
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format'}), 400

    # Only multi-branch orders (have transfers) are relevant for settlement
    orders = (ProductOrder.query
              .filter(ProductOrder.created_at >= start_dt,
                      ProductOrder.created_at <= end_dt)
              .filter(ProductOrder.shipment_status != 'not_needed')
              .all())

    user_branch_id = user.get('branchId') if user['role'] != 'administrator' else None

    entries = []
    # branch_pair_totals: (source_branch_id, pickup_branch_id) -> {owed, settled}
    branch_pair_totals = {}

    for order in orders:
        transfers = order.transfers or []
        if not transfers:
            continue
        for transfer in transfers:
            src_id = transfer.source_branch_id
            pickup_id = order.branch_id
            if src_id == pickup_id:
                continue

            # Supervisor filter: only show entries involving their branch
            if user_branch_id and user_branch_id not in (src_id, pickup_id):
                continue

            items_value = sum(
                float(item.get('total', 0)) for item in (transfer.items or [])
            )
            is_settled = order.status == 'completed'

            entries.append({
                'orderId': order.id,
                'orderNumber': order.order_number,
                'orderStatus': order.status,
                'orderDate': fmt_dt(order.created_at),
                'sourceBranchId': src_id,
                'sourceBranchName': transfer.source_branch.name if transfer.source_branch else f'Branch {src_id}',
                'pickupBranchId': pickup_id,
                'pickupBranchName': order.branch.name if order.branch else f'Branch {pickup_id}',
                'itemsValue': round(items_value, 2),
                'transferStatus': transfer.status,
                'isSettled': is_settled,
                'customerName': order.customer_name,
            })

            key = (src_id, pickup_id)
            if key not in branch_pair_totals:
                branch_pair_totals[key] = {
                    'sourceBranchId': src_id,
                    'sourceBranchName': transfer.source_branch.name if transfer.source_branch else f'Branch {src_id}',
                    'pickupBranchId': pickup_id,
                    'pickupBranchName': order.branch.name if order.branch else f'Branch {pickup_id}',
                    'totalOwed': 0.0,
                    'totalSettled': 0.0,
                    'pendingOrders': 0,
                    'completedOrders': 0,
                }
            branch_pair_totals[key]['totalOwed'] += items_value
            if is_settled:
                branch_pair_totals[key]['totalSettled'] += items_value
                branch_pair_totals[key]['completedOrders'] += 1
            else:
                branch_pair_totals[key]['pendingOrders'] += 1

    summary = []
    for v in branch_pair_totals.values():
        v['totalOwed'] = round(v['totalOwed'], 2)
        v['totalSettled'] = round(v['totalSettled'], 2)
        v['outstandingBalance'] = round(v['totalOwed'] - v['totalSettled'], 2)
        summary.append(v)

    return jsonify({
        'status': 'success',
        'data': {
            'period': {'startDate': start_date, 'endDate': end_date},
            'summary': summary,
            'entries': entries,
        }
    })


@app.route('/api/reports/audit-trail', methods=['GET'])
@require_auth
@require_roles('administrator')
def get_audit_trail():
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    user_id = request.args.get('userId')
    module = request.args.get('module')
    
    logs = audit_logs
    
    if start_date:
        logs = [l for l in logs if l['timestamp'][:10] >= start_date]
    if end_date:
        logs = [l for l in logs if l['timestamp'][:10] <= end_date]
    if user_id:
        logs = [l for l in logs if l['userId'] == int(user_id)]
    if module:
        logs = [l for l in logs if l['module'].lower() == module.lower()]
    
    logs = sorted(logs, key=lambda x: x['timestamp'], reverse=True)
    
    return jsonify({'status': 'success', 'data': logs})

# ============================================
# SETTINGS MODULE - USER MANAGEMENT
# ============================================

@app.route('/api/settings/users', methods=['GET'])
@require_auth
@require_roles('administrator')
def get_users():
    include_inactive = request.args.get('includeInactive', 'false').lower() == 'true'
    
    query = User.query
    if not include_inactive:
        query = query.filter_by(is_active=True)
    
    users_list = query.all()
    return jsonify({'status': 'success', 'data': [user_to_dict(u) for u in users_list]})

@app.route('/api/settings/users', methods=['POST'])
@require_auth
@require_roles('administrator')
def create_user():
    data = request.get_json()
    
    required = ['username', 'password', 'email', 'fullName', 'role']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'status': 'error', 'message': 'Username already exists'}), 400
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'status': 'error', 'message': 'Email already exists'}), 400
    
    role = Role.query.filter_by(key=data['role']).first()
    if not role:
        return jsonify({'status': 'error', 'message': 'Invalid role'}), 400
    
    # Handle branch - support both branchId and branch (string)
    branch_id = data.get('branchId')
    branch_name = data.get('branch')

    if branch_id:
        branch = Branch.query.get(branch_id)
        if not branch:
            return jsonify({'status': 'error', 'message': 'Invalid branch'}), 400
    elif branch_name:
        branch = Branch.query.filter_by(name=branch_name).first()
        if not branch:
            return jsonify({'status': 'error', 'message': 'Invalid branch'}), 400
        branch_id = branch.id
    else:
        return jsonify({'status': 'error', 'message': 'Branch is required'}), 400
    
    new_user = User(
        username=data['username'],
        password=hash_password(data['password']),
        email=data['email'],
        full_name=data['fullName'],
        role_id=role.id,
        branch_id=branch_id,
        branch=branch_name,
        is_active=True
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    # Automatically create Worker profile for worker roles
    worker_roles = ['seat_maker', 'sewer', 'staff']
    if data['role'] in worker_roles:
        # Determine specialization based on role
        if data['role'] in ['seat_maker', 'sewer']:
            specialization = data['role']
        else:
            specialization = data.get('specialization', 'general')
        
        new_worker = Worker(
            user_id=new_user.id,
            worker_type='staff',
            is_available=True,
            specialization=specialization,
            branch_id=branch_id
        )
        db.session.add(new_worker)
        db.session.commit()
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Settings', f"Created user: {new_user.username}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': user_to_dict(new_user)}), 201

@app.route('/api/settings/users/<int:user_id>', methods=['PUT'])
@require_auth
@require_roles('administrator')
def update_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404
    
    data = request.get_json()
    
    old_role_key = user.role.key if user.role else None
    
    if 'email' in data:
        user.email = data['email']
    if 'fullName' in data:
        user.full_name = data['fullName']
        if 'branchId' in data:
            if data['branchId']:
                branch = Branch.query.get(data['branchId'])
                if not branch:
                    return jsonify({'status': 'error', 'message': 'Invalid branch'}), 400
                user.branch_id = data['branchId']
            else:
                user.branch_id = None
    if 'branch' in data:
        user.branch = data['branch']
    if 'role' in data:
        role = Role.query.filter_by(key=data['role']).first()
        if not role:
            return jsonify({'status': 'error', 'message': 'Invalid role'}), 400
        user.role_id = role.id
    if 'password' in data and data['password']:
        user.password = hash_password(data['password'])
    
    db.session.commit()
    
    # Handle Worker profile when role changes
    worker_roles = ['seat_maker', 'sewer', 'staff']
    new_role_key = user.role.key if user.role else None
    
    if new_role_key in worker_roles:
        # Determine specialization based on role
        if new_role_key in ['seat_maker', 'sewer']:
            specialization = new_role_key
        else:
            specialization = 'general'
        
        # Check if worker profile exists
        existing_worker = Worker.query.filter_by(user_id=user.id).first()
        if not existing_worker:
            # Create new worker profile
            new_worker = Worker(
                user_id=user.id,
                worker_type='staff',
                is_available=True,
                specialization=specialization,
                branch_id=user.branch_id
            )
            db.session.add(new_worker)
            db.session.commit()
        elif old_role_key != new_role_key:
            # Update worker specialization if role changed
            existing_worker.specialization = specialization
            db.session.commit()
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Settings', f"Updated user: {user.username}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': user_to_dict(user)})

@app.route('/api/settings/users/<int:user_id>/archive', methods=['POST'])
@require_auth
@require_roles('administrator')
def archive_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404
    
    if user.id == request.current_user['id']:
        return jsonify({'status': 'error', 'message': 'Cannot archive yourself'}), 400
    
    user.is_active = False
    db.session.commit()
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'ARCHIVE', 'Settings', f"Archived user: {user.username}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'message': 'User archived'})

@app.route('/api/settings/users/<int:user_id>/restore', methods=['POST'])
@require_auth
@require_roles('administrator')
def restore_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404
    
    user.is_active = True
    db.session.commit()
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'RESTORE', 'Settings', f"Restored user: {user.username}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'message': 'User restored'})

@app.route('/api/settings/roles', methods=['GET'])
@require_auth
def get_roles():
    roles = Role.query.all()
    role_list = [
        {
            'id': role.key,
            'name': role.name,
            'description': ''
        }
        for role in roles
    ]
    return jsonify({'status': 'success', 'data': role_list})

@app.route('/api/settings/branches', methods=['GET'])
@require_auth
def get_branches():
    """Get all branches from database"""
    include_inactive = request.args.get('includeInactive', 'false').lower() == 'true'
    
    if include_inactive:
        branches_list = Branch.query.all()
    else:
        branches_list = Branch.query.filter_by(is_active=True).all()
    
    return jsonify({'status': 'success', 'data': [branch_to_dict(b) for b in branches_list]})

@app.route('/api/settings/branches/public', methods=['GET'])
def get_branches_public():
    """Get active branches without authentication (for order form)"""
    branches_list = Branch.query.filter_by(is_active=True).all()
    return jsonify({'status': 'success', 'data': [branch_to_dict(b) for b in branches_list]})

@app.route('/api/settings/branches', methods=['POST'])
@require_auth
@require_roles('administrator')
def create_branch():
    """Create a new branch"""
    data = request.get_json()
    
    required = ['name', 'code', 'address']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    # Check if code already exists
    existing = Branch.query.filter_by(code=data['code']).first()
    if existing:
        return jsonify({'status': 'error', 'message': 'Branch code already exists'}), 400
    
    new_branch = Branch(
        name=data['name'],
        code=data['code'],
        address=data['address'],
        phone=data.get('phone', None),
        is_warehouse=data.get('isWarehouse', False),
        is_active=True
    )
    
    db.session.add(new_branch)
    db.session.commit()
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Settings', f"Created branch: {new_branch.name}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': branch_to_dict(new_branch)}), 201

@app.route('/api/settings/branches/<int:branch_id>', methods=['PUT'])
@require_auth
@require_roles('administrator')
def update_branch(branch_id):
    """Update a branch"""
    branch = Branch.query.get(branch_id)
    if not branch:
        return jsonify({'status': 'error', 'message': 'Branch not found'}), 404
    
    data = request.get_json()
    
    if 'name' in data:
        branch.name = data['name']
    if 'code' in data:
        # Check if new code conflicts with another branch
        existing = Branch.query.filter_by(code=data['code']).first()
        if existing and existing.id != branch_id:
            return jsonify({'status': 'error', 'message': 'Branch code already exists'}), 400
        branch.code = data['code']
    if 'address' in data:
        branch.address = data['address']
    if 'isWarehouse' in data:
        branch.is_warehouse = data['isWarehouse']
    if 'isActive' in data:
        branch.is_active = data['isActive']
    if 'phone' in data:
        branch.phone = data['phone'] or None

    db.session.commit()
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Settings', f"Updated branch: {branch.name}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': branch_to_dict(branch)})

@app.route('/api/settings/system', methods=['GET'])
@require_auth
def get_system_settings():
    settings = SystemSetting.query.all()
    return jsonify({'status': 'success', 'data': {s.key: s.value for s in settings}})

@app.route('/api/settings/system/<key>', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor')
def update_system_setting(key):
    data = request.get_json()
    value = str(data.get('value', ''))
    setting = SystemSetting.query.filter_by(key=key).first()
    if not setting:
        setting = SystemSetting(key=key, value=value)
        db.session.add(setting)
    else:
        setting.value = value
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Settings', f"Updated system setting: {key} = {value}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': {setting.key: setting.value}})

# ============================================
# ============================================
# WORKER ENDPOINTS
# ============================================

@app.route('/api/workers/profile', methods=['GET'])
@require_auth
def get_worker_profile():
    try:
        user = request.current_user
        print(f"DEBUG: get_worker_profile called for user: {user.get('fullName', 'Unknown')}")
        
        # Check if user has a worker profile
        worker = Worker.query.filter_by(user_id=user['id']).first()
        if not worker:
            print(f"DEBUG: Creating new worker profile for user {user['id']}")
            # Create worker profile if user is a seat_maker or sewer
            if user.get('role') in ['seat_maker', 'sewer', 'staff']:
                # Determine specialization based on role
                if user.get('role') in ['seat_maker', 'sewer']:
                    specialization = user.get('role')
                else:
                    specialization = 'general'
                
                worker = Worker(
                    user_id=user['id'],
                    worker_type='staff',
                    is_available=True,
                    specialization=specialization,
                    branch_id=user.get('branchId')
                )
                db.session.add(worker)
                db.session.commit()
                print(f"DEBUG: Worker profile created successfully")
            else:
                print(f"DEBUG: User role {user.get('role')} is not a worker role")
                return jsonify({'error': 'Not a worker account'}), 403
        
        print(f"DEBUG: Returning worker profile: ID={worker.id}")
        return jsonify({
            'status': 'success',
            'data': {
                'worker': {
                    'id': worker.id,
                    'userId': worker.user_id,
                    'workerType': worker.worker_type,
                    'isAvailable': worker.is_available,
                    'specialization': worker.specialization,
                    'branchId': worker.branch_id,
                    'userName': user['fullName']
                }
            }
        })
    except Exception as e:
        print(f"Error in get_worker_profile: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/workers/availability', methods=['POST'])
def toggle_worker_availability():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token or token not in sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user = sessions[token]
    data = request.json
    
    worker = Worker.query.filter_by(user_id=user['id']).first()
    if not worker:
        return jsonify({'error': 'Worker profile not found'}), 404
    
    worker.is_available = data.get('isAvailable', worker.is_available)
    db.session.commit()
    
    return jsonify({
        'status': 'success',
        'data': {
            'isAvailable': worker.is_available
        },
        'message': f'Availability updated to {"Available" if worker.is_available else "Unavailable"}'
    })

@app.route('/api/workers/tasks', methods=['GET'])
def get_worker_tasks():
    try:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token or token not in sessions:
            return jsonify({'error': 'Unauthorized'}), 401

        user = sessions[token]
        status = request.args.get('status')

        worker = Worker.query.filter_by(user_id=user['id']).first()
        if not worker:
            return jsonify({'error': 'Worker profile not found'}), 404

        query = WorkTask.query.filter_by(worker_id=worker.id)
        if status:
            query = query.filter_by(status=status)

        # in_progress first, then pending (by queue position / created_at), then rest
        tasks = query.order_by(
            db.case({'in_progress': 0, 'pending': 1}, value=WorkTask.status, else_=2),
            WorkTask.created_at.asc()
        ).all()

        return jsonify({'status': 'success', 'data': {'tasks': [serialize_task(t) for t in tasks]}})
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/workers/tasks/<int:task_id>', methods=['GET'])
def get_worker_task_detail(task_id):
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token or token not in sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    user = sessions[token]
    worker = Worker.query.filter_by(user_id=user['id']).first()
    if not worker:
        return jsonify({'error': 'Worker profile not found'}), 404

    task = WorkTask.query.filter_by(id=task_id, worker_id=worker.id).first()
    if not task:
        return jsonify({'error': 'Task not found'}), 404

    return jsonify({'status': 'success', 'data': {'task': serialize_task(task)}})

@app.route('/api/workers/tasks/<int:task_id>/status', methods=['POST'])
def update_task_status(task_id):
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token or token not in sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    user = sessions[token]
    data = request.json

    worker = Worker.query.filter_by(user_id=user['id']).first()
    if not worker:
        return jsonify({'error': 'Worker profile not found'}), 404

    task = WorkTask.query.filter_by(id=task_id, worker_id=worker.id).first()
    if not task:
        return jsonify({'error': 'Task not found'}), 404

    new_status = data.get('status')
    if new_status:
        if new_status == 'in_progress':
            # Queue rule: only one task may be in_progress at a time
            existing = WorkTask.query.filter(
                WorkTask.worker_id == worker.id,
                WorkTask.status == 'in_progress',
                WorkTask.id != task.id
            ).first()
            if existing:
                return jsonify({
                    'error': f'You already have an active task: "{existing.title}". '
                             f'Complete it before starting another.'
                }), 400
            if not task.started_at:
                task.started_at = datetime.utcnow()

        elif new_status == 'completed':
            task.completed_at = datetime.utcnow()
            # Auto-promote the next queued (pending) task for this worker
            next_task = (WorkTask.query
                         .filter_by(worker_id=worker.id, status='pending')
                         .order_by(WorkTask.created_at.asc())
                         .first())
            if next_task:
                next_task.status = 'in_progress'
                next_task.started_at = datetime.utcnow()

        task.status = new_status

    if 'actualHours' in data:
        task.actual_hours = data['actualHours']
    if 'notes' in data:
        task.notes = data['notes']

    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Task updated successfully',
                    'data': {'task': serialize_task(task)}})

def _worker_queue_position(worker_id, task_id):
    """Return 1-based queue position of a pending task among all pending tasks for this worker."""
    if worker_id is None:
        return None
    pending = (WorkTask.query
               .filter_by(worker_id=worker_id, status='pending')
               .order_by(WorkTask.created_at.asc())
               .all())
    for i, t in enumerate(pending):
        if t.id == task_id:
            return i + 1
    return None


def serialize_task(task):
    """Serialize a WorkTask with computed queuePosition, isOverdue, and overdueByHours."""
    is_overdue = False
    overdue_by_hours = 0.0
    if task.status == 'in_progress' and task.started_at and task.estimated_hours:
        elapsed = (datetime.utcnow() - task.started_at).total_seconds() / 3600.0
        if elapsed > float(task.estimated_hours):
            is_overdue = True
            overdue_by_hours = round(elapsed - float(task.estimated_hours), 1)

    queue_position = _worker_queue_position(task.worker_id, task.id) if task.status == 'pending' else None

    worker_name = None
    if task.worker_id:
        w = Worker.query.get(task.worker_id)
        if w:
            u = User.query.get(w.user_id)
            worker_name = u.full_name if u else 'Unknown'

    return {
        'id': task.id,
        'taskNumber': task.task_number,
        'jobOrderId': task.job_order_id,
        'workerId': task.worker_id,
        'workerName': worker_name,
        'title': task.title,
        'description': task.description,
        'taskType': task.task_type,
        'priority': task.priority,
        'status': task.status,
        'estimatedHours': task.estimated_hours,
        'actualHours': task.actual_hours,
        'dueDate': fmt_dt(task.due_date),
        'startedAt': fmt_dt(task.started_at),
        'completedAt': fmt_dt(task.completed_at),
        'createdAt': fmt_dt(task.created_at),
        'notes': task.notes,
        'queuePosition': queue_position,
        'isOverdue': is_overdue,
        'overdueByHours': overdue_by_hours,
    }


@app.route('/api/workers/tasks', methods=['POST'])
def create_work_task():
    """Admin/Supervisor/Sales Manager endpoint to create tasks for workers"""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token or token not in sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user = sessions[token]
    if user.get('role') not in ['administrator', 'supervisor', 'sales_manager']:
        return jsonify({'error': 'Insufficient permissions'}), 403
    
    data = request.json
    
    # Validate worker exists
    if data.get('workerId'):
        worker = Worker.query.get(data['workerId'])
        if not worker:
            return jsonify({'error': 'Worker not found'}), 404
        # Allow task assignment regardless of availability status
    
    # Generate task number
    task_count = WorkTask.query.count() + 1
    task_number = f"TASK-{datetime.now().strftime('%Y%m')}-{task_count:04d}"
    
    due_date = None
    if data.get('dueDate'):
        try:
            due_date = datetime.fromisoformat(data['dueDate'].replace('Z', '+00:00'))
        except:
            pass
    
    task = WorkTask(
        task_number=task_number,
        job_order_id=data['jobOrderId'],
        worker_id=data.get('workerId'),
        title=data['title'],
        description=data.get('description'),
        task_type=data['taskType'],
        priority=data.get('priority', 'normal'),
        estimated_hours=data.get('estimatedHours'),
        due_date=due_date
    )

    # Queue rule: auto-start if this worker has no current in_progress task
    if task.worker_id:
        has_active = WorkTask.query.filter_by(
            worker_id=task.worker_id, status='in_progress'
        ).first()
        if not has_active:
            task.status = 'in_progress'
            task.started_at = datetime.utcnow()
        # else: leave as 'pending' — it joins the queue

    db.session.add(task)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Task created successfully',
        'data': {'task': serialize_task(task)}
    })

@app.route('/api/workers/all-tasks', methods=['GET'])
def get_all_tasks_admin():
    """Admin/Supervisor endpoint to get all tasks"""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token or token not in sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user = sessions[token]
    if user.get('role') not in ['administrator', 'supervisor', 'sales_manager']:
        return jsonify({'error': 'Insufficient permissions'}), 403
    
    status = request.args.get('status')
    job_order_id = request.args.get('jobOrderId')
    
    query = WorkTask.query
    
    # Filter by status if provided
    if status:
        query = query.filter_by(status=status)
    
    # Filter by job order if provided
    if job_order_id:
        query = query.filter_by(job_order_id=job_order_id)
    
    # Branch filtering for non-admin users
    if user.get('role') != 'administrator':
        user_branch_id = user.get('branchId')
        if user_branch_id:
            # Get workers from this branch
            branch_workers = Worker.query.filter_by(branch_id=user_branch_id).all()
            worker_ids = [w.id for w in branch_workers]
            if worker_ids:
                query = query.filter(WorkTask.worker_id.in_(worker_ids))
    
    tasks = query.order_by(
        db.case({'in_progress': 0, 'pending': 1}, value=WorkTask.status, else_=2),
        WorkTask.created_at.asc()
    ).all()

    return jsonify({'status': 'success', 'data': {'tasks': [serialize_task(t) for t in tasks]}})

@app.route('/api/workers/list', methods=['GET'])
def get_all_workers():
    """Admin/Supervisor endpoint to get all workers"""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token or token not in sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user = sessions[token]
    if user.get('role') not in ['administrator', 'supervisor', 'sales_manager']:
        return jsonify({'error': 'Insufficient permissions'}), 403
    
    # Get workers based on role
    if user.get('role') == 'administrator':
        # Admins see all workers
        workers = Worker.query.all()
    else:
        # Supervisors and sales managers see only workers from their branch
        user_branch_id = user.get('branchId')
        if user_branch_id:
            workers = Worker.query.filter_by(branch_id=user_branch_id).all()
        else:
            workers = []
    
    worker_list = []
    for worker in workers:
        user_data = User.query.get(worker.user_id)
        worker_list.append({
            'id': worker.id,
            'userId': worker.user_id,
            'userName': user_data.full_name if user_data else 'Unknown',
            'workerType': worker.worker_type,
            'isAvailable': worker.is_available,
            'specialization': worker.specialization or '',
            'branchId': worker.branch_id
        })
    
    return jsonify({'status': 'success', 'data': {'workers': worker_list}})


@app.route('/api/workers/workload', methods=['GET'])
def get_workers_workload():
    """Per-worker workload: active task, queued count, total remaining hours.
    Used by supervisors when deciding who to assign next."""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token or token not in sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    user = sessions[token]
    if user.get('role') not in ['administrator', 'supervisor', 'sales_manager']:
        return jsonify({'error': 'Insufficient permissions'}), 403

    if user.get('role') == 'administrator':
        workers = Worker.query.all()
    else:
        user_branch_id = user.get('branchId')
        workers = Worker.query.filter_by(branch_id=user_branch_id).all() if user_branch_id else []

    result = []
    for worker in workers:
        user_data = User.query.get(worker.user_id)
        worker_name = user_data.full_name if user_data else 'Unknown'

        active_task = WorkTask.query.filter_by(worker_id=worker.id, status='in_progress').first()
        queued_tasks = (WorkTask.query
                        .filter_by(worker_id=worker.id, status='pending')
                        .order_by(WorkTask.created_at.asc())
                        .all())

        # Remaining hours on the active task
        active_remaining = 0.0
        if active_task and active_task.estimated_hours:
            if active_task.started_at:
                elapsed = (datetime.utcnow() - active_task.started_at).total_seconds() / 3600.0
                active_remaining = max(0.0, float(active_task.estimated_hours) - elapsed)
            else:
                active_remaining = float(active_task.estimated_hours)

        queued_hours = sum(float(t.estimated_hours or 0) for t in queued_tasks)

        result.append({
            'workerId': worker.id,
            'workerName': worker_name,
            'workerType': worker.worker_type,
            'isAvailable': worker.is_available,
            'branchId': worker.branch_id,
            'activeTask': serialize_task(active_task) if active_task else None,
            'queuedCount': len(queued_tasks),
            'queuedTasks': [serialize_task(t) for t in queued_tasks],
            'totalRemainingHours': round(active_remaining + queued_hours, 1),
        })

    return jsonify({'status': 'success', 'data': {'workload': result}})


@app.route('/api/workers/sync', methods=['POST'])
@require_auth
@require_roles('administrator')
def sync_worker_profiles():
    """Create Worker profiles for users with worker roles that don't have profiles yet"""
    worker_roles = ['seat_maker', 'sewer', 'staff']
    
    # Get all roles
    all_roles = Role.query.all()
    print(f"DEBUG: All roles in database: {[(r.id, r.key, r.name) for r in all_roles]}")
    
    # Get all users with worker roles
    role_ids = [role.id for role in Role.query.filter(Role.key.in_(worker_roles)).all()]
    print(f"DEBUG: Worker role IDs: {role_ids}")
    
    users_with_worker_roles = User.query.filter(User.role_id.in_(role_ids)).all()
    print(f"DEBUG: Found {len(users_with_worker_roles)} users with worker roles")
    
    created_count = 0
    created_users = []
    skipped_users = []
    
    for user in users_with_worker_roles:
        print(f"DEBUG: Checking user {user.username} (ID: {user.id}, Role: {user.role.key if user.role else 'None'})")
        # Check if worker profile already exists
        existing_worker = Worker.query.filter_by(user_id=user.id).first()
        if not existing_worker:
            # Determine specialization based on role
            if user.role.key in ['seat_maker', 'sewer']:
                specialization = user.role.key
            else:
                specialization = 'general'
            
            # Create worker profile
            new_worker = Worker(
                user_id=user.id,
                worker_type='staff',
                is_available=True,
                specialization=specialization,
                branch_id=user.branch_id
            )
            db.session.add(new_worker)
            created_count += 1
            created_users.append(user.username)
            print(f"DEBUG: Created worker profile for {user.username}")
        else:
            skipped_users.append(user.username)
            print(f"DEBUG: Worker profile already exists for {user.username}")
    
    db.session.commit()
    
    return jsonify({
        'status': 'success',
        'message': f'Created {created_count} worker profile(s)',
        'created': created_count,
        'createdUsers': created_users,
        'skippedUsers': skipped_users,
        'totalUsersWithWorkerRoles': len(users_with_worker_roles)
    })

@app.route('/api/workers/debug', methods=['GET'])
@require_auth
@require_roles('administrator')
def debug_workers():
    """Debug endpoint to see all users, their roles, and worker profiles"""
    all_users = User.query.all()
    all_workers = Worker.query.all()
    all_roles = Role.query.all()
    
    users_info = []
    for user in all_users:
        worker = Worker.query.filter_by(user_id=user.id).first()
        users_info.append({
            'id': user.id,
            'username': user.username,
            'fullName': user.full_name,
            'roleId': user.role_id,
            'roleKey': user.role.key if user.role else None,
            'roleName': user.role.name if user.role else None,
            'branchId': user.branch_id,
            'branchName': user.branch_rel.name if user.branch_rel else user.branch,
            'hasWorkerProfile': worker is not None,
            'workerProfileId': worker.id if worker else None
        })
    
    roles_info = [{'id': r.id, 'key': r.key, 'name': r.name} for r in all_roles]
    workers_info = [{'id': w.id, 'userId': w.user_id, 'workerType': w.worker_type, 'specialization': w.specialization} for w in all_workers]
    
    return jsonify({
        'status': 'success',
        'data': {
            'users': users_info,
            'roles': roles_info,
            'workers': workers_info,
            'totalUsers': len(all_users),
            'totalWorkers': len(all_workers),
            'totalRoles': len(all_roles)
        }
    })

# ============================================
# MANAGED WORKERS & ASSIGNMENTS
# ============================================

@app.route('/api/managed-workers', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def list_managed_workers():
    workers = ManagedWorker.query.order_by(ManagedWorker.name).all()
    return jsonify({
        'status': 'success',
        'data': {
            'workers': [
                {
                    'id': w.id,
                    'name': w.name,
                    'workType': w.work_type,
                    'ratePerHour': w.rate_per_hour,
                    'payMode': w.pay_mode or 'per_hour',
                    'isActive': w.is_active,
                    'createdAt': fmt_dt(w.created_at),
                }
                for w in workers
            ]
        }
    })

@app.route('/api/managed-workers', methods=['POST'])
@require_auth
@require_roles('administrator')
def create_managed_worker():
    data = request.get_json()
    name = (data.get('name') or '').strip()
    work_type = (data.get('workType') or '').strip()
    rate = float(data.get('ratePerHour') or 0)
    pay_mode = data.get('payMode', 'per_hour')
    if pay_mode not in ('per_hour', 'per_day', 'per_piece'):
        pay_mode = 'per_hour'
    if not name or not work_type:
        return jsonify({'error': 'name and workType are required'}), 400
    worker = ManagedWorker(name=name, work_type=work_type, rate_per_hour=rate, pay_mode=pay_mode)
    db.session.add(worker)
    db.session.commit()
    return jsonify({
        'status': 'success',
        'data': {
            'worker': {
                'id': worker.id,
                'name': worker.name,
                'workType': worker.work_type,
                'ratePerHour': worker.rate_per_hour,
                'payMode': worker.pay_mode or 'per_hour',
                'isActive': worker.is_active,
            }
        }
    }), 201

@app.route('/api/managed-workers/<int:worker_id>', methods=['PUT'])
@require_auth
@require_roles('administrator')
def update_managed_worker(worker_id):
    worker = ManagedWorker.query.get(worker_id)
    if not worker:
        return jsonify({'error': 'Worker not found'}), 404
    data = request.get_json()
    if 'name' in data:
        worker.name = (data['name'] or '').strip()
    if 'workType' in data:
        worker.work_type = (data['workType'] or '').strip()
    if 'ratePerHour' in data:
        worker.rate_per_hour = float(data['ratePerHour'] or 0)
    if 'payMode' in data and data['payMode'] in ('per_hour', 'per_day', 'per_piece'):
        worker.pay_mode = data['payMode']
    if 'isActive' in data:
        worker.is_active = bool(data['isActive'])
    db.session.commit()
    return jsonify({
        'status': 'success',
        'data': {
            'worker': {
                'id': worker.id,
                'name': worker.name,
                'workType': worker.work_type,
                'ratePerHour': worker.rate_per_hour,
                'payMode': worker.pay_mode or 'per_hour',
                'isActive': worker.is_active,
            }
        }
    })

@app.route('/api/managed-workers/<int:worker_id>', methods=['DELETE'])
@require_auth
@require_roles('administrator')
def deactivate_managed_worker(worker_id):
    worker = ManagedWorker.query.get(worker_id)
    if not worker:
        return jsonify({'error': 'Worker not found'}), 404
    worker.is_active = False
    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Worker deactivated'})

@app.route('/api/worker-assignments', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def list_worker_assignments():
    worker_id = request.args.get('workerId', type=int)
    query = WorkerAssignment.query
    if worker_id:
        query = query.filter_by(worker_id=worker_id)
    assignments = query.order_by(WorkerAssignment.created_at.desc()).all()
    result = []
    for a in assignments:
        is_overdue = False
        overdue_by_hours = 0.0
        if a.status == 'in_progress' and a.start_time and a.expected_hours:
            elapsed = (datetime.utcnow() - a.start_time).total_seconds() / 3600.0
            if elapsed > float(a.expected_hours):
                is_overdue = True
                overdue_by_hours = round(elapsed - float(a.expected_hours), 1)
        result.append({
            'id': a.id,
            'workerId': a.worker_id,
            'workerName': a.worker.name if a.worker else '',
            'workType': a.worker.work_type if a.worker else '',
            'ratePerHour': a.worker.rate_per_hour if a.worker else 0,
            'payMode': (a.worker.pay_mode or 'per_hour') if a.worker else 'per_hour',
            'jobOrderRef': a.job_order_ref,
            'jobOrderDbId': a.job_order_db_id,
            'description': a.description,
            'expectedHours': a.expected_hours,
            'startTime': fmt_dt(a.start_time),
            'endTime': fmt_dt(a.end_time),
            'hoursWorked': a.hours_worked,
            'pay': a.pay,
            'payOverride': a.pay_override,
            'materialsUsed': a.materials_used,
            'scheduledDate': a.scheduled_date.isoformat() if a.scheduled_date else None,
            'assignmentType': a.assignment_type or 'job_order',
            'specialTaskTitle': a.special_task_title,
            'status': a.status,
            'notes': a.notes,
            'createdAt': fmt_dt(a.created_at),
            'isOverdue': is_overdue,
            'overdueByHours': overdue_by_hours,
        })
    return jsonify({'status': 'success', 'data': {'assignments': result}})

@app.route('/api/worker-assignments', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def create_worker_assignment():
    data = request.get_json()
    worker_id = data.get('workerId')
    job_order_ref = (data.get('jobOrderRef') or '').strip()
    if not worker_id or not job_order_ref:
        return jsonify({'error': 'workerId and jobOrderRef are required'}), 400
    worker = ManagedWorker.query.get(worker_id)
    if not worker:
        return jsonify({'error': 'Worker not found'}), 404
    description = data.get('description', '') or ''
    # Prevent exact duplicates (same worker + job order + description)
    existing = WorkerAssignment.query.filter_by(
        worker_id=worker_id,
        job_order_ref=job_order_ref,
        description=description,
    ).first()
    if existing:
        return jsonify({
            'status': 'success',
            'data': {
                'assignment': {
                    'id': existing.id,
                    'workerId': existing.worker_id,
                    'workerName': worker.name,
                    'jobOrderRef': existing.job_order_ref,
                    'description': existing.description,
                    'status': existing.status,
                }
            }
        })
    assignment_type = data.get('assignmentType', 'job_order')
    if assignment_type not in ('job_order', 'special_task'):
        assignment_type = 'job_order'
    special_task_title = (data.get('specialTaskTitle') or '').strip() or None
    scheduled_date = None
    if data.get('scheduledDate'):
        try:
            from datetime import date as _date
            scheduled_date = _date.fromisoformat(data['scheduledDate'])
        except Exception:
            pass
    assignment = WorkerAssignment(
        worker_id=worker_id,
        job_order_ref=job_order_ref,
        job_order_db_id=data.get('jobOrderDbId'),
        description=description,
        expected_hours=data.get('expectedHours'),
        assignment_type=assignment_type,
        special_task_title=special_task_title,
        scheduled_date=scheduled_date,
        status='pending',
        notes=data.get('notes', ''),
    )
    db.session.add(assignment)
    db.session.commit()
    return jsonify({
        'status': 'success',
        'data': {
            'assignment': {
                'id': assignment.id,
                'workerId': assignment.worker_id,
                'workerName': worker.name,
                'jobOrderRef': assignment.job_order_ref,
                'description': assignment.description,
                'status': assignment.status,
            }
        }
    }), 201

@app.route('/api/worker-assignments/<int:assignment_id>', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def update_worker_assignment(assignment_id):
    assignment = WorkerAssignment.query.get(assignment_id)
    if not assignment:
        return jsonify({'error': 'Assignment not found'}), 404
    data = request.get_json()
    new_status = data.get('status')
    if new_status:
        assignment.status = new_status
        if new_status == 'in_progress' and not assignment.start_time:
            assignment.start_time = datetime.utcnow()
        elif new_status == 'completed' and not assignment.end_time:
            assignment.end_time = datetime.utcnow()
            if assignment.start_time and not data.get('hoursWorked'):
                delta = assignment.end_time - assignment.start_time
                assignment.hours_worked = round(delta.total_seconds() / 3600, 2)
            if data.get('hoursWorked') is not None:
                assignment.hours_worked = float(data['hoursWorked'])
            # Materials snapshot
            if data.get('materialsUsed') is not None:
                assignment.materials_used = data['materialsUsed']
            # Log material usage when a job order assignment is completed
            if assignment.assignment_type != 'special_task' and assignment.job_order_db_id:
                job_order = JobOrder.query.get(assignment.job_order_db_id)
                if job_order and job_order.items:
                    worker_name = assignment.worker.name if assignment.worker else 'Unknown'
                    for item in job_order.items:
                        material_id = item.get('materialId')
                        qty = float(item.get('quantity') or 0)
                        if not material_id or qty <= 0:
                            continue
                        material = InventoryMaterial.query.get(material_id)
                        if not material:
                            continue
                        db.session.add(MaterialUsageLog(
                            material_id=material.id,
                            quantity_used=qty,
                            used_in_type='job_order',
                            used_in_reference=assignment.job_order_ref,
                            branch_id=job_order.branch_id,
                            managed_worker_id=assignment.worker_id,
                            notes=f"Job order completed by {worker_name}",
                        ))
            # Pay: explicit override wins; otherwise compute from pay_mode
            if data.get('payOverride') is not None:
                assignment.pay = float(data['payOverride'])
                assignment.pay_override = assignment.pay
            elif assignment.worker:
                w = assignment.worker
                pay_mode = w.pay_mode or 'per_hour'
                rate = w.rate_per_hour or 0
                if pay_mode == 'per_hour':
                    assignment.pay = round((assignment.hours_worked or 0) * rate, 2)
                elif pay_mode == 'per_day':
                    days = float(data.get('unitsWorked', 1) or 1)
                    assignment.pay = round(days * rate, 2)
                elif pay_mode == 'per_piece':
                    pieces = float(data.get('unitsWorked', 1) or 1)
                    assignment.pay = round(pieces * rate, 2)
    if 'hoursWorked' in data and data['hoursWorked'] is not None:
        assignment.hours_worked = float(data['hoursWorked'])
    if 'scheduledDate' in data:
        if data['scheduledDate']:
            try:
                from datetime import date as _date
                assignment.scheduled_date = _date.fromisoformat(data['scheduledDate'])
            except Exception:
                pass
        else:
            assignment.scheduled_date = None
    if 'notes' in data:
        assignment.notes = data['notes']
    if 'description' in data:
        assignment.description = data['description']
    if 'expectedHours' in data and data['expectedHours'] is not None:
        assignment.expected_hours = float(data['expectedHours'])
    assignment.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({
        'status': 'success',
        'data': {
            'assignment': {
                'id': assignment.id,
                'workerId': assignment.worker_id,
                'workerName': assignment.worker.name if assignment.worker else '',
                'jobOrderRef': assignment.job_order_ref,
                'description': assignment.description,
                'scheduledDate': assignment.scheduled_date.isoformat() if assignment.scheduled_date else None,
                'assignmentType': assignment.assignment_type or 'job_order',
                'specialTaskTitle': assignment.special_task_title,
                'startTime': fmt_dt(assignment.start_time),
                'endTime': fmt_dt(assignment.end_time),
                'hoursWorked': assignment.hours_worked,
                'pay': assignment.pay,
                'payOverride': assignment.pay_override,
                'materialsUsed': assignment.materials_used,
                'status': assignment.status,
                'notes': assignment.notes,
            }
        }
    })

@app.route('/api/worker-assignments/calendar', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def get_assignments_calendar():
    """Return all assignments for a worker in a given month, keyed by date."""
    worker_id = request.args.get('workerId', type=int)
    month = request.args.get('month')  # YYYY-MM
    query = WorkerAssignment.query.filter(WorkerAssignment.scheduled_date.isnot(None))
    if worker_id:
        query = query.filter_by(worker_id=worker_id)
    if month:
        try:
            year, mon = int(month.split('-')[0]), int(month.split('-')[1])
            from datetime import date as _date
            import calendar as _cal
            start = _date(year, mon, 1)
            end = _date(year, mon, _cal.monthrange(year, mon)[1])
            query = query.filter(WorkerAssignment.scheduled_date >= start,
                                 WorkerAssignment.scheduled_date <= end)
        except Exception:
            pass
    items = query.all()
    result = {}
    for a in items:
        d = a.scheduled_date.isoformat()
        result.setdefault(d, []).append({
            'id': a.id,
            'jobOrderRef': a.job_order_ref,
            'assignmentType': a.assignment_type or 'job_order',
            'specialTaskTitle': a.special_task_title,
            'workerName': a.worker.name if a.worker else '',
            'status': a.status,
            'description': a.description,
        })
    return jsonify({'status': 'success', 'data': result})

@app.route('/api/worker-assignments/<int:assignment_id>', methods=['DELETE'])
@require_auth
@require_roles('administrator')
def delete_worker_assignment(assignment_id):
    assignment = WorkerAssignment.query.get(assignment_id)
    if not assignment:
        return jsonify({'error': 'Assignment not found'}), 404
    db.session.delete(assignment)
    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Assignment deleted'})

# ============================================
# WORKER AVAILABILITY CALENDAR
# ============================================

@app.route('/api/worker-availability', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def get_worker_availability():
    """Get availability schedule entries for a worker, optionally filtered by month (YYYY-MM)."""
    worker_id = request.args.get('workerId', type=int)
    month = request.args.get('month')  # e.g. '2026-06'

    query = WorkerAvailabilitySchedule.query
    if worker_id:
        query = query.filter_by(managed_worker_id=worker_id)
    if month:
        try:
            year, mon = int(month.split('-')[0]), int(month.split('-')[1])
            from datetime import date as date_type
            start = date_type(year, mon, 1)
            # last day of month
            import calendar as cal_mod
            last_day = cal_mod.monthrange(year, mon)[1]
            end = date_type(year, mon, last_day)
            query = query.filter(WorkerAvailabilitySchedule.date >= start,
                                 WorkerAvailabilitySchedule.date <= end)
        except Exception:
            pass

    entries = query.order_by(WorkerAvailabilitySchedule.date.asc()).all()
    return jsonify({'status': 'success', 'data': {'entries': [
        {
            'id': e.id,
            'managedWorkerId': e.managed_worker_id,
            'workerName': e.worker.name if e.worker else '',
            'date': e.date.isoformat(),
            'isAvailable': e.is_available,
            'note': e.note,
        }
        for e in entries
    ]}})


@app.route('/api/worker-availability', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def set_worker_availability():
    """Upsert an availability entry. Send isAvailable=null or omit to delete."""
    data = request.get_json()
    worker_id = data.get('managedWorkerId')
    date_str = data.get('date')
    if not worker_id or not date_str:
        return jsonify({'error': 'managedWorkerId and date are required'}), 400

    from datetime import date as date_type
    try:
        entry_date = date_type.fromisoformat(date_str)
    except ValueError:
        return jsonify({'error': 'Invalid date format'}), 400

    worker = ManagedWorker.query.get(worker_id)
    if not worker:
        return jsonify({'error': 'Worker not found'}), 404

    is_available = data.get('isAvailable')

    # If isAvailable is None/not sent, delete the entry (reset to default)
    if is_available is None:
        existing = WorkerAvailabilitySchedule.query.filter_by(
            managed_worker_id=worker_id, date=entry_date
        ).first()
        if existing:
            db.session.delete(existing)
            db.session.commit()
        return jsonify({'status': 'success', 'data': None})

    existing = WorkerAvailabilitySchedule.query.filter_by(
        managed_worker_id=worker_id, date=entry_date
    ).first()
    if existing:
        existing.is_available = bool(is_available)
        existing.note = data.get('note', existing.note)
    else:
        existing = WorkerAvailabilitySchedule(
            managed_worker_id=worker_id,
            date=entry_date,
            is_available=bool(is_available),
            note=data.get('note'),
        )
        db.session.add(existing)

    db.session.commit()
    return jsonify({'status': 'success', 'data': {
        'id': existing.id,
        'managedWorkerId': existing.managed_worker_id,
        'date': existing.date.isoformat(),
        'isAvailable': existing.is_available,
        'note': existing.note,
    }})


# ============================================
# HEALTH CHECK
# ============================================

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'success',
        'message': 'Seatmakers Avenue API is running!',
        'version': '1.0.0',
        'timestamp': fmt_dt(datetime.utcnow())
    })

@app.route('/api/debug/branches-and-orders', methods=['GET'])
@require_auth
def debug_branches_and_orders():
    """Debug endpoint to see all branches and orders"""
    user = request.current_user
    
    # Get database branches
    db_branches = Branch.query.all()
    db_branches_list = [{'id': b.id, 'name': b.name, 'code': b.code} for b in db_branches]
    
    # Get in-memory branches
    memory_branches = branches
    
    # Get job orders with their branch info
    orders_info = [{
        'id': jo['id'],
        'jobOrderId': jo['jobOrderId'],
        'branchId': jo['branchId'],
        'branchName': jo['branchName'],
        'customerName': jo['customerName'],
        'status': jo['status']
    } for jo in job_orders]
    
    return jsonify({
        'status': 'success',
        'data': {
            'currentUser': {
                'username': user['username'],
                'branch': user['branch'],
                'branchId': user.get('branchId'),
                'role': user['role']
            },
            'databaseBranches': db_branches_list,
            'memoryBranches': memory_branches,
            'jobOrders': orders_info,
            'totalOrders': len(job_orders)
        }
    })

# ============================================================
# CATALOG ROUTES
# ============================================================

@app.route('/api/catalog', methods=['GET'])
def get_catalog():
    items = CatalogItem.query.filter_by(is_active=True).order_by(CatalogItem.sort_order, CatalogItem.id).all()
    return jsonify({'status': 'success', 'data': [
        {'id': i.id, 'title': i.title, 'description': i.description, 'tag': i.tag,
         'imageUrl': i.image_url, 'sortOrder': i.sort_order}
        for i in items
    ]})

@app.route('/api/catalog', methods=['POST'])
@require_auth
@require_roles('administrator')
def create_catalog_item():
    data = request.get_json()
    if not data or not data.get('title', '').strip():
        return jsonify({'status': 'error', 'message': 'Title is required'}), 400
    max_order = db.session.query(db.func.max(CatalogItem.sort_order)).scalar() or 0
    item = CatalogItem(
        title=data['title'].strip(),
        description=data.get('description', '').strip(),
        tag=data.get('tag', '').strip(),
        image_url=data.get('imageUrl', ''),
        sort_order=max_order + 1,
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({'status': 'success', 'data': {
        'id': item.id, 'title': item.title, 'description': item.description,
        'tag': item.tag, 'imageUrl': item.image_url, 'sortOrder': item.sort_order
    }}), 201

@app.route('/api/catalog/<int:item_id>', methods=['PUT'])
@require_auth
@require_roles('administrator')
def update_catalog_item(item_id):
    item = CatalogItem.query.get(item_id)
    if not item:
        return jsonify({'status': 'error', 'message': 'Item not found'}), 404
    data = request.get_json()
    if 'title' in data:
        item.title = data['title'].strip()
    if 'description' in data:
        item.description = data['description'].strip()
    if 'tag' in data:
        item.tag = data['tag'].strip()
    if 'sortOrder' in data:
        item.sort_order = int(data['sortOrder'])
    item.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'status': 'success', 'data': {
        'id': item.id, 'title': item.title, 'description': item.description,
        'tag': item.tag, 'imageUrl': item.image_url, 'sortOrder': item.sort_order
    }})

@app.route('/api/catalog/<int:item_id>', methods=['DELETE'])
@require_auth
@require_roles('administrator')
def delete_catalog_item(item_id):
    item = CatalogItem.query.get(item_id)
    if not item:
        return jsonify({'status': 'error', 'message': 'Item not found'}), 404
    item.is_active = False
    item.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Item removed from catalog'})

@app.route('/api/catalog/<int:item_id>/image', methods=['POST'])
@require_auth
@require_roles('administrator')
def upload_catalog_image(item_id):
    item = CatalogItem.query.get(item_id)
    if not item:
        return jsonify({'status': 'error', 'message': 'Item not found'}), 404
    if 'image' not in request.files:
        return jsonify({'status': 'error', 'message': 'No image file provided'}), 400
    file = request.files['image']
    if not file.filename:
        return jsonify({'status': 'error', 'message': 'No file selected'}), 400
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({'status': 'error', 'message': 'File type not allowed'}), 400
    filename = secure_filename(f"catalog_{item_id}_{uuid.uuid4().hex[:8]}.{ext}")
    file.save(os.path.join(CATALOG_UPLOAD_FOLDER, filename))
    item.image_url = f"/api/catalog/images/{filename}"
    item.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'status': 'success', 'imageUrl': item.image_url})

@app.route('/api/catalog/images/<filename>', methods=['GET'])
def serve_catalog_image(filename):
    return send_from_directory(CATALOG_UPLOAD_FOLDER, filename)

# ============================================
# AI PREDICTIONS - PROPHET
# ============================================

import json
import threading
from collections import defaultdict
from datetime import date as date_type

def _parse_date(val):
    if not val or str(val).strip().lower() in ('', 'no restock', 'none', 'nat', 'nan'):
        return None
    try:
        import pandas as pd
        ts = pd.to_datetime(val, errors='coerce')
        return None if pd.isna(ts) else ts.date()
    except Exception:
        return None

def _compute_prediction_for_item(item_id):
    try:
        import pandas as pd
        from prophet import Prophet
    except ImportError:
        return None

    xlsx_rows = HistoricalInventoryData.query.filter_by(item_id=item_id).order_by(
        HistoricalInventoryData.incoming_date
    ).all()

    daily_records = []
    for row in xlsx_rows:
        if row.incoming_date and row.outgoing_date and row.stock_quantity:
            days = max(1, (row.outgoing_date - row.incoming_date).days)
            daily_usage = float(row.stock_quantity) / days
            cur = row.incoming_date
            while cur <= row.outgoing_date:
                daily_records.append({'ds': pd.Timestamp(cur), 'y': round(daily_usage, 4)})
                cur += timedelta(days=1)

    material = InventoryMaterial.query.filter_by(item_id=item_id, is_archived=False).first()
    live_day_span = 0
    if material:
        logs = MaterialUsageLog.query.filter_by(material_id=material.id).all()
        day_totals = defaultdict(float)
        for log in logs:
            day_totals[log.created_at.date()] += log.quantity_used
        if day_totals:
            sorted_days = sorted(day_totals.keys())
            live_day_span = (sorted_days[-1] - sorted_days[0]).days
            for d, qty in day_totals.items():
                daily_records.append({'ds': pd.Timestamp(d), 'y': round(qty, 4)})

    if not daily_records:
        return None

    data_source = 'live' if live_day_span >= 90 else ('hybrid' if live_day_span >= 30 else 'xlsx')
    material_type = xlsx_rows[0].material_type if xlsx_rows else (material.material_type if material else 'Unknown')

    lead_times = [
        (row.restock_date - row.outgoing_date).days
        for row in xlsx_rows
        if row.outgoing_date and row.restock_date and 0 < (row.restock_date - row.outgoing_date).days < 180
    ]
    avg_lead_time = int(sum(lead_times) / len(lead_times)) if lead_times else 7

    restock_qtys = [float(row.restock_quantity) for row in xlsx_rows if row.restock_quantity and float(row.restock_quantity) > 0]
    suggested_qty = round(sum(restock_qtys) / len(restock_qtys)) if restock_qtys else None

    df = None
    try:
        import pandas as pd
        df = pd.DataFrame(daily_records).groupby('ds', as_index=False)['y'].sum()
        df = df.sort_values('ds').reset_index(drop=True)
        df['y'] = df['y'].clip(lower=0)
    except Exception:
        pass

    n_unique = len(df) if df is not None else 0
    confidence = 'low' if n_unique < 5 else ('medium' if n_unique < 20 else 'high')

    avg_daily_usage = 0.001
    try:
        if df is not None and n_unique >= 2:
            import pandas as pd
            model = Prophet(
                yearly_seasonality=n_unique > 365,
                weekly_seasonality=n_unique > 14,
                daily_seasonality=False,
                changepoint_prior_scale=0.05,
                seasonality_mode='additive'
            )
            model.fit(df)
            future = model.make_future_dataframe(periods=60)
            forecast = model.predict(future)
            future_only = forecast[forecast['ds'] > pd.Timestamp.now()]
            avg_daily_usage = max(0.001, float(future_only['yhat'].head(60).mean()))
        elif daily_records:
            avg_daily_usage = max(0.001, sum(r['y'] for r in daily_records) / len(daily_records))
    except Exception:
        if daily_records:
            avg_daily_usage = max(0.001, sum(r['y'] for r in daily_records) / len(daily_records))

    current_stock = float(material.stock_quantity) if material else 0
    days_until_stockout = min(9999, int(current_stock / avg_daily_usage))
    stockout_date = (datetime.now() + timedelta(days=days_until_stockout)).date() if days_until_stockout < 9999 else None
    restock_by = (datetime.now() + timedelta(days=max(0, days_until_stockout - avg_lead_time))).date() if days_until_stockout < 9999 else None

    if not suggested_qty:
        suggested_qty = max(1, round(avg_daily_usage * 30))

    return {
        'itemId': item_id,
        'materialType': material_type,
        'color': material.color if material else '',
        'pattern': material.pattern if material else '',
        'currentStock': current_stock,
        'avgDailyUsage': round(avg_daily_usage, 3),
        'daysUntilStockout': days_until_stockout,
        'stockoutDate': fmt_dt(stockout_date),
        'restockByDate': fmt_dt(restock_by),
        'suggestedRestockQty': int(suggested_qty),
        'avgLeadTimeDays': avg_lead_time,
        'confidence': confidence,
        'dataSource': data_source,
        'dataPoints': n_unique,
        'hasCurrentInventory': material is not None,
    }

def _run_predictions_background(app_obj):
    with app_obj.app_context():
        cache = AIPredictionCache.query.first()
        if not cache:
            return
        try:
            item_ids = [
                r[0] for r in db.session.query(HistoricalInventoryData.item_id).distinct().all()
            ]
            cache.total_items = len(item_ids)
            cache.processed_items = 0
            db.session.commit()

            results = []
            for i, item_id in enumerate(item_ids):
                try:
                    pred = _compute_prediction_for_item(item_id)
                    if pred:
                        results.append(pred)
                except Exception:
                    pass
                cache.processed_items = i + 1
                if i % 10 == 0:
                    db.session.commit()

            cache.predictions_json = json.dumps(results)
            cache.status = 'done'
            cache.computed_at = datetime.utcnow()
            db.session.commit()
        except Exception as e:
            cache.status = 'error'
            cache.error_message = str(e)
            db.session.commit()

@app.route('/api/inventory/ai/upload-historical', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def upload_historical_inventory():
    try:
        import pandas as pd
    except ImportError:
        return jsonify({'status': 'error', 'message': 'pandas not installed. Run: pip install pandas openpyxl'}), 503

    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename or not file.filename.lower().endswith(('.xlsx', '.xls')):
        return jsonify({'status': 'error', 'message': 'Please upload an Excel file (.xlsx or .xls)'}), 400

    try:
        df = pd.read_excel(file, engine='openpyxl')
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Could not read file: {str(e)}'}), 400

    # Normalize column names
    df.columns = [str(c).strip().lower().replace(' ', '_') for c in df.columns]

    col_map = {
        'item_id': next((c for c in df.columns if 'item' in c and 'id' in c), None),
        'material_type': next((c for c in df.columns if 'material' in c and 'type' in c), None),
        'stock_quantity': next((c for c in df.columns if 'stock' in c and 'qty' in c or ('stock' in c and 'quantity' in c)), None),
        'incoming_date': next((c for c in df.columns if 'incoming' in c), None),
        'outgoing_date': next((c for c in df.columns if 'outgoing' in c), None),
        'restock_date': next((c for c in df.columns if 'restock' in c and 'date' in c), None),
        'restock_quantity': next((c for c in df.columns if 'restock' in c and ('qty' in c or 'quantity' in c)), None),
        'restock_cycle': next((c for c in df.columns if 'restock' in c and 'cycle' in c), None),
    }

    if not col_map['item_id'] or not col_map['stock_quantity'] or not col_map['incoming_date'] or not col_map['outgoing_date']:
        missing = [k for k, v in col_map.items() if v is None and k in ('item_id', 'stock_quantity', 'incoming_date', 'outgoing_date')]
        return jsonify({'status': 'error', 'message': f'Missing required columns: {", ".join(missing)}. Found columns: {list(df.columns)}'}), 400

    # Clear old data
    HistoricalInventoryData.query.delete()
    db.session.commit()

    rows_saved = 0
    for _, row in df.iterrows():
        item_id = str(row.get(col_map['item_id'], '') or '').strip()
        if not item_id:
            continue

        stock_qty = row.get(col_map['stock_quantity'], 0)
        try:
            stock_qty = float(stock_qty)
        except (ValueError, TypeError):
            stock_qty = 0

        restock_qty = 0
        if col_map['restock_quantity']:
            try:
                restock_qty = float(row.get(col_map['restock_quantity'], 0) or 0)
            except (ValueError, TypeError):
                restock_qty = 0

        restock_cycle = 0
        if col_map['restock_cycle']:
            try:
                restock_cycle = int(float(row.get(col_map['restock_cycle'], 0) or 0))
            except (ValueError, TypeError):
                restock_cycle = 0

        entry = HistoricalInventoryData(
            item_id=item_id,
            material_type=str(row.get(col_map['material_type'], '') or '').strip() if col_map['material_type'] else '',
            stock_quantity=stock_qty,
            incoming_date=_parse_date(row.get(col_map['incoming_date'])),
            outgoing_date=_parse_date(row.get(col_map['outgoing_date'])),
            restock_date=_parse_date(row.get(col_map['restock_date'])) if col_map['restock_date'] else None,
            restock_quantity=restock_qty,
            restock_cycle=restock_cycle,
        )
        db.session.add(entry)
        rows_saved += 1

    # Update/create cache record
    cache = AIPredictionCache.query.first()
    if not cache:
        cache = AIPredictionCache()
        db.session.add(cache)

    unique_items = len(df[col_map['item_id']].dropna().unique()) if col_map['item_id'] else 0
    cache.status = 'computing'
    cache.predictions_json = '[]'
    cache.total_items = unique_items
    cache.processed_items = 0
    cache.upload_rows = rows_saved
    cache.upload_items = unique_items
    cache.last_uploaded_at = datetime.utcnow()
    cache.error_message = None
    db.session.commit()

    log_action(
        request.current_user['id'], request.current_user['fullName'],
        'CREATE', 'AI', f"Uploaded {rows_saved} historical rows for {unique_items} items",
        request.remote_addr or '0.0.0.0'
    )

    # Start background computation
    t = threading.Thread(target=_run_predictions_background, args=(app,), daemon=True)
    t.start()

    return jsonify({
        'status': 'success',
        'message': f'Uploaded {rows_saved} rows for {unique_items} items. Computing predictions in background...',
        'rowsSaved': rows_saved,
        'uniqueItems': unique_items,
    })

@app.route('/api/inventory/ai/predictions', methods=['GET'])
@require_auth
def get_ai_predictions():
    cache = AIPredictionCache.query.first()
    if not cache:
        return jsonify({'status': 'success', 'data': {
            'status': 'idle',
            'predictions': [],
            'totalItems': 0,
            'processedItems': 0,
            'uploadRows': 0,
            'uploadItems': 0,
            'lastUploadedAt': None,
            'computedAt': None,
            'error': None,
        }})

    try:
        predictions = json.loads(cache.predictions_json or '[]')
    except Exception:
        predictions = []

    return jsonify({'status': 'success', 'data': {
        'status': cache.status,
        'predictions': predictions,
        'totalItems': cache.total_items,
        'processedItems': cache.processed_items,
        'uploadRows': cache.upload_rows,
        'uploadItems': cache.upload_items,
        'lastUploadedAt': fmt_dt(cache.last_uploaded_at),
        'computedAt': fmt_dt(cache.computed_at),
        'error': cache.error_message,
    }})

@app.route('/api/inventory/ai/recompute', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def recompute_ai_predictions():
    cache = AIPredictionCache.query.first()
    if not cache or cache.upload_rows == 0:
        return jsonify({'status': 'error', 'message': 'No historical data uploaded yet'}), 400

    if cache.status == 'computing':
        return jsonify({'status': 'error', 'message': 'Computation already in progress'}), 400

    cache.status = 'computing'
    cache.predictions_json = '[]'
    cache.processed_items = 0
    cache.error_message = None
    db.session.commit()

    t = threading.Thread(target=_run_predictions_background, args=(app,), daemon=True)
    t.start()

    return jsonify({'status': 'success', 'message': 'Recomputing predictions...'})

# =========================================
# CUSTOMER MANAGEMENT ROUTES
# =========================================

def customer_to_dict(c):
    return {
        'id': c.id,
        'name': c.name,
        'phone': c.phone or '',
        'email': c.email or '',
        'address': c.address or '',
        'discountPercent': c.discount_percent,
        'promoCode': c.promo_code,
        'promoDiscount': c.promo_discount,
        'notes': c.notes or '',
        'createdAt': c.created_at.strftime('%Y-%m-%d') if c.created_at else None,
    }

@app.route('/api/customers/search', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def search_customers():
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify({'status': 'success', 'data': []})
    like = f'%{q}%'
    results = Customer.query.filter(
        db.or_(
            Customer.name.ilike(like),
            Customer.phone.ilike(like),
            Customer.email.ilike(like)
        )
    ).limit(5).all()
    return jsonify({'status': 'success', 'data': [customer_to_dict(c) for c in results]})

@app.route('/api/customers', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def get_customers():
    q = request.args.get('q', '').strip()
    query = Customer.query
    if q:
        like = f'%{q}%'
        query = query.filter(
            db.or_(
                Customer.name.ilike(like),
                Customer.phone.ilike(like),
                Customer.email.ilike(like)
            )
        )
    customers = query.order_by(Customer.name.asc()).all()
    return jsonify({'status': 'success', 'data': [customer_to_dict(c) for c in customers]})

@app.route('/api/customers', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def create_customer():
    data = request.get_json()
    if not data.get('name'):
        return jsonify({'status': 'error', 'message': 'Name is required'}), 400
    customer = Customer(
        name=data['name'],
        phone=data.get('phone', ''),
        email=data.get('email', ''),
        address=data.get('address', ''),
        discount_percent=data.get('discountPercent'),
        promo_code=data.get('promoCode'),
        promo_discount=data.get('promoDiscount'),
        notes=data.get('notes', ''),
    )
    db.session.add(customer)
    db.session.commit()
    return jsonify({'status': 'success', 'data': customer_to_dict(customer)}), 201

@app.route('/api/customers/<int:customer_id>', methods=['GET'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def get_customer(customer_id):
    customer = Customer.query.get_or_404(customer_id)
    orders = JobOrder.query.filter_by(customer_id=customer_id).order_by(JobOrder.created_at.desc()).all()
    order_history = [{
        'id': o.id,
        'jobOrderId': o.job_order_id,
        'totalPrice': o.total_price,
        'status': o.status,
        'paymentStatus': o.payment_status,
        'downPayment': o.down_payment,
        'balance': o.balance,
        'createdAt': o.created_at.strftime('%Y-%m-%d'),
        'estimatedCompletion': o.estimated_completion.strftime('%Y-%m-%d') if o.estimated_completion else None,
    } for o in orders]
    result = customer_to_dict(customer)
    result['orderHistory'] = order_history
    return jsonify({'status': 'success', 'data': result})

@app.route('/api/customers/<int:customer_id>', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def update_customer(customer_id):
    customer = Customer.query.get_or_404(customer_id)
    data = request.get_json()
    if 'name' in data: customer.name = data['name']
    if 'phone' in data: customer.phone = data['phone']
    if 'email' in data: customer.email = data['email']
    if 'address' in data: customer.address = data['address']
    if 'discountPercent' in data: customer.discount_percent = data['discountPercent']
    if 'promoCode' in data: customer.promo_code = data['promoCode']
    if 'promoDiscount' in data: customer.promo_discount = data['promoDiscount']
    if 'notes' in data: customer.notes = data['notes']
    db.session.commit()
    return jsonify({'status': 'success', 'data': customer_to_dict(customer)})

# ============================================
# ANNOUNCEMENTS
# ============================================

class Announcement(db.Model):
    __tablename__ = 'announcements'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text, nullable=False)
    # 'info' | 'warning' | 'urgent'
    priority = db.Column(db.String(20), default='info')
    is_pinned = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    created_by = db.relationship('User', foreign_keys=[created_by_id])

def announcement_to_dict(a):
    return {
        'id': a.id,
        'title': a.title,
        'body': a.body,
        'priority': a.priority or 'info',
        'isPinned': a.is_pinned,
        'isActive': a.is_active,
        'createdById': a.created_by_id,
        'createdByName': a.created_by.full_name if a.created_by else 'System',
        'createdAt': fmt_dt(a.created_at),
        'updatedAt': fmt_dt(a.updated_at),
    }

@app.route('/api/announcements', methods=['GET'])
@require_auth
def get_announcements():
    # Only staff can see announcements — customers are excluded via require_auth + role check
    if request.current_user.get('role') == 'customer':
        return jsonify({'status': 'error', 'message': 'Forbidden'}), 403
    items = (Announcement.query
             .filter_by(is_active=True)
             .order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
             .all())
    return jsonify({'status': 'success', 'data': [announcement_to_dict(a) for a in items]})

@app.route('/api/announcements', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def create_announcement():
    data = request.get_json()
    if not data.get('title', '').strip():
        return jsonify({'status': 'error', 'message': 'Title is required'}), 400
    if not data.get('body', '').strip():
        return jsonify({'status': 'error', 'message': 'Body is required'}), 400
    priority = data.get('priority', 'info')
    if priority not in ('info', 'warning', 'urgent'):
        priority = 'info'
    a = Announcement(
        title=data['title'].strip(),
        body=data['body'].strip(),
        priority=priority,
        is_pinned=bool(data.get('isPinned', False)),
        is_active=True,
        created_by_id=request.current_user['id'],
    )
    db.session.add(a)
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Announcements',
               f"Created announcement: {a.title}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': announcement_to_dict(a)}), 201

@app.route('/api/announcements/<int:ann_id>', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor')
def update_announcement(ann_id):
    a = Announcement.query.get(ann_id)
    if not a:
        return jsonify({'status': 'error', 'message': 'Announcement not found'}), 404
    data = request.get_json()
    if 'title' in data: a.title = data['title'].strip()
    if 'body' in data: a.body = data['body'].strip()
    if 'priority' in data and data['priority'] in ('info', 'warning', 'urgent'):
        a.priority = data['priority']
    if 'isPinned' in data: a.is_pinned = bool(data['isPinned'])
    if 'isActive' in data: a.is_active = bool(data['isActive'])
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Announcements',
               f"Updated announcement: {a.title}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': announcement_to_dict(a)})

@app.route('/api/announcements/<int:ann_id>', methods=['DELETE'])
@require_auth
@require_roles('administrator', 'supervisor')
def delete_announcement(ann_id):
    a = Announcement.query.get(ann_id)
    if not a:
        return jsonify({'status': 'error', 'message': 'Announcement not found'}), 404
    db.session.delete(a)
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'DELETE', 'Announcements',
               f"Deleted announcement: {a.title}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'message': 'Deleted'})

if __name__ == '__main__':
    with app.app_context():
        # Ensure tables and seed data exist before startup diagnostics.
        init_db()
        print("=" * 60)
        print("STARTUP DIAGNOSTICS")
        print("=" * 60)
        db_branches = Branch.query.all()
        print(f"Database branches: {[(b.id, b.name) for b in db_branches]}")
        print(f"In-memory branches: {[(b['id'], b['name']) for b in branches]}")
        print(f"Job orders count: {len(job_orders)}")
        print(f"Job orders by branch: {[(jo['id'], jo['branchId'], jo['branchName']) for jo in job_orders]}")
        print("=" * 60)
    app.run(debug=True, port=8080)
