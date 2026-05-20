from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import datetime, timedelta
from functools import wraps
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from werkzeug.utils import secure_filename
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
    password = db.Column(db.String(64), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    full_name = db.Column(db.String(255), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=False)
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=True)
    branch = db.Column(db.String(100), nullable=True)  # Keep for backward compatibility
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    role = db.relationship('Role')
    branch_rel = db.relationship('Branch')

class Branch(db.Model):
    __tablename__ = 'branches'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    code = db.Column(db.String(50), unique=True, nullable=False)
    address = db.Column(db.String(255), nullable=False)
    is_warehouse = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
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
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    admin_notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    branch = db.relationship('Branch')
    customer_user = db.relationship('User', foreign_keys=[user_id])

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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    order = db.relationship('ProductOrder', backref=db.backref('transfers', lazy=True))
    source_branch = db.relationship('Branch')

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
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    material = db.relationship('InventoryMaterial')
    premade_product = db.relationship('PremadeProduct')
    branch = db.relationship('Branch')
    used_by_user = db.relationship('User', foreign_keys=[used_by])

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
        'createdAt': order.created_at.isoformat() if order.created_at else None,
        # Quotation fields
        'userId': order.user_id,
        'quotationItems': order.quotation_items,
        'quotationTotal': order.quotation_total,
        'quotationStatus': order.quotation_status,
        'quotationNotes': order.quotation_notes,
        'customerResponseNotes': order.customer_response_notes,
        'quotedAt': order.quoted_at.isoformat() if order.quoted_at else None,
        'respondedAt': order.responded_at.isoformat() if order.responded_at else None
    }

def branch_to_dict(branch):
    return {
        'id': branch.id,
        'name': branch.name,
        'code': branch.code,
        'address': branch.address,
        'isWarehouse': branch.is_warehouse,
        'isActive': branch.is_active,
        'createdAt': branch.created_at.isoformat() if branch.created_at else None
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
            password=hashlib.sha256(user['password'].encode()).hexdigest(),
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
    """Add new columns to existing tables without dropping data."""
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE inventory_materials ADD COLUMN source_job_order_id VARCHAR(50)",
        "ALTER TABLE inventory_materials ADD COLUMN status VARCHAR(20) DEFAULT 'available'",
        "ALTER TABLE material_usage_logs ADD COLUMN job_order_db_id INTEGER",
        "ALTER TABLE inventory_materials ADD COLUMN low_stock_threshold REAL DEFAULT 0",
        "ALTER TABLE inventory_materials ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)",
        "ALTER TABLE product_orders ADD COLUMN amount_paid REAL DEFAULT 0.0",
    ]
    with db.engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # Column already exists

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
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
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
    password = hashlib.sha256(data.get('password', '').encode()).hexdigest()
    
    user = User.query.filter_by(username=username, password=password, is_active=True).first()
    
    if not user:
        return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401
    
    # Generate session token
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
        'createdAt': datetime.now().isoformat()
    }
    
    print(f"DEBUG LOGIN: User {username} logged in successfully")
    print(f"DEBUG LOGIN: Token stored with value: {token[:20]}...")
    print(f"DEBUG LOGIN: Sessions count: {len(sessions)}")
    
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
        'notes': log.notes,
        'usedAt': log.created_at.isoformat() if log.created_at else None
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

    required = ['materialType', 'stockQuantity', 'unitPrice', 'branchId']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400

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
    material = InventoryMaterial(
        item_id=custom_item_id,
        material_type=data['materialType'].strip(),
        color=data.get('color', '').strip(),
        pattern=data.get('pattern', '').strip(),
        unit_price=float(data['unitPrice']),
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
    if 'unitPrice' in data:
        material.unit_price = float(data['unitPrice'])
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
        'createdAt': log.created_at.isoformat() if log.created_at else None,
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
        'createdAt': p.created_at.isoformat() if p.created_at else None,
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
    
    # Create database record
    new_order = JobOrder(
        job_order_id=job_order_id,
        customer_id=data.get('customerId'),
        customer_name=data['customerName'],
        customer_phone=data['customerPhone'],
        customer_email=data.get('customerEmail', ''),
        branch_id=data['branchId'],
        description=data['description'],
        vehicle_info=data.get('vehicleInfo'),
        items=items,
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
        'preferredDate': appointment.preferred_date.isoformat() if appointment.preferred_date else None,
        'preferredTime': appointment.preferred_time,
        'description': appointment.description,
        'vehicleInfo': appointment.vehicle_info,
        'status': appointment.status,
        'confirmedTime': appointment.confirmed_time,
        'adminNotes': appointment.admin_notes,
        'createdAt': appointment.created_at.isoformat() if appointment.created_at else None,
        'updatedAt': appointment.updated_at.isoformat() if appointment.updated_at else None
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
            if not data.get('confirmedTime'):
                return jsonify({'status': 'error', 'message': 'A confirmed time must be selected when confirming an appointment'}), 400
            appointment.confirmed_time = data['confirmedTime']
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
        'createdAt': transfer.created_at.isoformat() if transfer.created_at else None,
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
        'createdAt': order.created_at.isoformat() if order.created_at else None,
        'updatedAt': order.updated_at.isoformat() if order.updated_at else None
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
            'timestamp': order.created_at.isoformat(),
            'by': order.customer_name or 'Customer'
        })

    if order.status and order.status != 'pending':
        events.append({
            'type': 'status',
            'title': 'Status Updated',
            'description': f"Order status is now {order.status}",
            'timestamp': order.updated_at.isoformat() if order.updated_at else order.created_at.isoformat(),
            'by': 'Branch Staff'
        })

    if order.payment_status and order.payment_status != 'unpaid':
        events.append({
            'type': 'payment',
            'title': 'Payment Updated',
            'description': f"Payment status is now {order.payment_status}",
            'timestamp': order.updated_at.isoformat() if order.updated_at else order.created_at.isoformat(),
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

@app.route('/api/product-orders/multi', methods=['POST'])
def create_multi_branch_product_order():
    """Create a single order at the pickup branch. Items from other branches
    generate transfer requests notifying those branches to send the items over."""
    data = request.get_json()

    required = ['customerName', 'customerPhone', 'items', 'pickupBranchId']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    if not data['items']:
        return jsonify({'status': 'error', 'message': 'At least one item is required'}), 400

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

    # Validate all items and enrich with source branch info
    all_items = []
    items_by_source = {}
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

        src = int(product.branch_id)
        if src != pickup_branch_id:
            items_by_source.setdefault(src, []).append(item_dict)

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
        shipment_status='not_needed',
        status='pending',
        payment_status='unpaid',
        user_id=user_id,
        notes=data.get('notes', '')
    )
    db.session.add(order)
    db.session.flush()  # get order.id

    # Create a transfer request for each source branch ≠ pickup branch
    for src_branch_id, branch_items in items_by_source.items():
        db.session.add(ProductOrderTransfer(
            product_order_id=order.id,
            source_branch_id=src_branch_id,
            items=branch_items,
            status='pending'
        ))

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

    # Validate stock before deducting
    deductions = []
    for item in transfer.items:
        product = PremadeProduct.query.get(item.get('productId')) if item.get('productId') else None
        if not product or product.branch_id != transfer.source_branch_id:
            # Fallback: find by SKU at source branch
            product = PremadeProduct.query.filter_by(
                sku=item.get('sku', ''), branch_id=transfer.source_branch_id
            ).first()
        if not product:
            return jsonify({'status': 'error', 'message': f"Product '{item.get('name')}' not found in source branch inventory"}), 400
        requested_qty = float(item.get('quantity', 0))
        if float(product.quantity) < requested_qty:
            return jsonify({'status': 'error', 'message': f"Insufficient stock for '{product.name}' at source branch. Available: {product.quantity:g}, required: {requested_qty:g}"}), 400
        deductions.append((product, requested_qty))

    for product, qty in deductions:
        product.quantity = float(product.quantity) - qty

    transfer.status = 'transferred'
    db.session.commit()

    log_action(user['id'], user['fullName'], 'TRANSFER', 'Product Orders',
        f"Transfer {transfer_id} for order {transfer.order.order_number if transfer.order else '?'} marked as sent to {transfer.order.branch.name if (transfer.order and transfer.order.branch) else 'N/A'}. Inventory deducted from source branch.",
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
    db.session.commit()

    log_action(user['id'], user['fullName'], 'RECEIVE', 'Product Orders',
        f"Transfer {transfer_id} received at {pickup_branch.name if pickup_branch else 'N/A'}. Items added to inventory.",
        request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': transfer_to_dict(transfer)})


@app.route('/api/product-orders', methods=['POST'])
def create_product_order():
    """Create a new product order - public endpoint for ordering premade products"""
    data = request.get_json()
    
    required = ['customerName', 'customerPhone', 'items', 'branchId']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
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
        password=hashlib.sha256(data['password'].encode()).hexdigest(),
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
        'createdAt': datetime.utcnow().isoformat()
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

    query = JobOrder.query.filter(
        JobOrder.created_at >= start_dt,
        JobOrder.created_at <= end_dt
    )

    # Branch-level access control
    if user['role'] != 'administrator':
        user_branch = Branch.query.filter_by(name=user['branch']).first()
        if user_branch:
            query = query.filter(JobOrder.branch_id == user_branch.id)
        else:
            query = query.filter(False)
    elif branch_id:
        query = query.filter(JobOrder.branch_id == int(branch_id))

    orders = query.all()

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
        ]
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
        password=hashlib.sha256(data['password'].encode()).hexdigest(),
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
        user.password = hashlib.sha256(data['password'].encode()).hexdigest()
    
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
        
        tasks = query.order_by(WorkTask.due_date.asc(), WorkTask.priority.desc()).all()
        
        task_list = []
        for task in tasks:
            task_list.append({
                'id': task.id,
                'taskNumber': task.task_number,
                'jobOrderId': task.job_order_id,
                'title': task.title,
                'description': task.description,
                'taskType': task.task_type,
                'priority': task.priority,
                'status': task.status,
                'estimatedHours': task.estimated_hours,
                'actualHours': task.actual_hours,
                'dueDate': task.due_date.isoformat() if task.due_date else None,
                'startedAt': task.started_at.isoformat() if task.started_at else None,
                'completedAt': task.completed_at.isoformat() if task.completed_at else None,
                'createdAt': task.created_at.isoformat(),
                'notes': task.notes
            })
        
        print(f"DEBUG: Returning {len(task_list)} tasks for worker {worker.id}")
        return jsonify({
            'status': 'success',
            'data': {
                'tasks': task_list
            }
        })
    except Exception as e:
        print(f"Error in get_worker_tasks: {str(e)}")
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
    
    return jsonify({
        'status': 'success',
        'data': {
            'task': {
                'id': task.id,
                'taskNumber': task.task_number,
                'jobOrderId': task.job_order_id,
                'title': task.title,
                'description': task.description,
                'taskType': task.task_type,
                'priority': task.priority,
                'status': task.status,
                'estimatedHours': task.estimated_hours,
                'actualHours': task.actual_hours,
                'dueDate': task.due_date.isoformat() if task.due_date else None,
                'startedAt': task.started_at.isoformat() if task.started_at else None,
                'completedAt': task.completed_at.isoformat() if task.completed_at else None,
                'createdAt': task.created_at.isoformat(),
                'notes': task.notes
            }
        }
    })

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
        task.status = new_status
        if new_status == 'in_progress' and not task.started_at:
            task.started_at = datetime.utcnow()
        elif new_status == 'completed':
            task.completed_at = datetime.utcnow()
    
    if 'actualHours' in data:
        task.actual_hours = data['actualHours']
    
    if 'notes' in data:
        task.notes = data['notes']
    
    db.session.commit()
    
    return jsonify({
        'status': 'success',
        'message': 'Task updated successfully',
        'data': {
            'task': {
                'id': task.id,
                'status': task.status,
                'startedAt': task.started_at.isoformat() if task.started_at else None,
                'completedAt': task.completed_at.isoformat() if task.completed_at else None
            }
        }
    })

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
    
    db.session.add(task)
    db.session.commit()
    
    return jsonify({
        'status': 'success',
        'message': 'Task created successfully',
        'data': {
            'task': {
                'id': task.id,
                'taskNumber': task.task_number,
                'jobOrderId': task.job_order_id,
                'workerId': task.worker_id,
                'title': task.title,
                'status': task.status
            }
        }
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
    
    tasks = query.order_by(WorkTask.created_at.desc()).all()
    
    task_list = []
    for task in tasks:
        worker_name = None
        if task.worker_id:
            worker = Worker.query.get(task.worker_id)
            if worker:
                user_data = User.query.get(worker.user_id)
                worker_name = user_data.full_name if user_data else 'Unknown'
        
        task_list.append({
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
            'dueDate': task.due_date.isoformat() if task.due_date else None,
            'startedAt': task.started_at.isoformat() if task.started_at else None,
            'completedAt': task.completed_at.isoformat() if task.completed_at else None,
            'createdAt': task.created_at.isoformat(),
            'notes': task.notes
        })
    
    return jsonify({
        'status': 'success',
        'data': {
            'tasks': task_list
        }
    })

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
    
    return jsonify({
        'status': 'success',
        'data': {
            'workers': worker_list
        }
    })

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
# HEALTH CHECK
# ============================================

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'success',
        'message': 'Seatmakers Avenue API is running!',
        'version': '1.0.0',
        'timestamp': datetime.now().isoformat()
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
