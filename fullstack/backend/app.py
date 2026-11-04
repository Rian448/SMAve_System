from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import date as date_cls, datetime, timedelta
from functools import wraps
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import IntegrityError
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import os
import hashlib
import hmac
import json
import math
import re
import secrets
import threading
import time
import urllib.error
import urllib.request
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from html import escape

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
DATABASE_URL = os.getenv('DATABASE_URL', f"sqlite:///{os.path.join(BASE_DIR, 'smaeve_system.db')}")
# Name the driver explicitly: SQLAlchemy 2.1 made psycopg (v3) the default for
# postgresql:// URLs, but the installed driver is psycopg2.
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = 'postgresql://' + DATABASE_URL[len('postgres://'):]
if DATABASE_URL.startswith('postgresql://'):
    DATABASE_URL = 'postgresql+psycopg2://' + DATABASE_URL[len('postgresql://'):]
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
if DATABASE_URL.startswith('postgresql'):
    # The hosted database (Neon) suspends after a few idle minutes and closes
    # open connections. Test each pooled connection before use (replacing a dead
    # one instead of failing the request), and retire connections before
    # Neon's ~5-minute idle cutoff.
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'pool_pre_ping': True, 'pool_recycle': 240}

CATALOG_UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'catalog')
os.makedirs(CATALOG_UPLOAD_FOLDER, exist_ok=True)
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

db = SQLAlchemy(app)

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
    phone = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # Bumped whenever the account's access changes (archive, role, branch,
    # permissions) so every server worker drops its cached copy at once
    auth_version = db.Column(db.Integer, default=0)

    role = db.relationship('Role')
    branch_rel = db.relationship('Branch')

class UserSession(db.Model):
    """A sign-in session. Stored in the database (not in memory) so logins
    survive restarts, redeploys and Render's free-tier sleep. Only a hash of
    the token is kept, so a copy of this table cannot be used to sign in."""
    __tablename__ = 'user_sessions'
    id = db.Column(db.Integer, primary_key=True)
    token_hash = db.Column(db.String(64), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)

class PasswordResetCode(db.Model):
    """A 6-digit code emailed for 'Forgot password'. Only its hash is stored."""
    __tablename__ = 'password_reset_codes'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False, index=True)
    code_hash = db.Column(db.String(64), nullable=False)
    attempts = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime, nullable=True)  # also set when superseded or out of attempts

class SignupCode(db.Model):
    """A 6-digit code emailed during sign-up to prove the address is real
    before the account is created. Only its hash is stored."""
    __tablename__ = 'signup_codes'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, index=True)  # stored lower-case
    code_hash = db.Column(db.String(64), nullable=False)
    attempts = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime, nullable=True)  # also set when superseded or out of attempts

class EmailChangeCode(db.Model):
    """A 6-digit code sent to a new email address to confirm a user owns it
    before their account email is changed. Only its hash is stored."""
    __tablename__ = 'email_change_codes'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False, index=True)
    new_email = db.Column(db.String(255), nullable=False)
    code_hash = db.Column(db.String(64), nullable=False)
    attempts = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime, nullable=True)  # also set when superseded or out of attempts

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
    # Lifecycle: deactivated -> (optionally) archived -> deleted. A branch with
    # records can only be deleted 30 days after deactivation.
    deactivated_at = db.Column(db.DateTime, nullable=True)
    archived_at = db.Column(db.DateTime, nullable=True)
    # Deleted branches stay as a row so the history that points at them keeps
    # its branch, but they are hidden everywhere.
    deleted_at = db.Column(db.DateTime, nullable=True)

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
    # The online account (users row) of a customer who signed up; walk-ins have none
    user_id = db.Column(db.Integer, nullable=True, index=True)

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
    
    # Retired quotation feature: columns kept so older rows load; quotation_total
    # is still read as the request's amount on the customer's history
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
    # How urgent the work is; Worker Management lists higher priority first
    priority = db.Column(db.String(20), default='normal')  # low, normal, high, urgent
    payment_status = db.Column(db.String(50), default='unpaid')  # unpaid, partial, paid
    down_payment = db.Column(db.Float, default=0)
    balance = db.Column(db.Float, default=0)
    discount_percent = db.Column(db.Float, nullable=True)  # per-order discount override
    vat_percent = db.Column(db.Float, nullable=True)  # VAT rate applied to this order (None = no VAT)
    # True: the price entered already included VAT (orders priced since VAT-inclusive
    # entry). NULL/False: older orders, where VAT was added on top of the entered
    # price. total_price is the final customer price either way.
    vat_inclusive = db.Column(db.Boolean, nullable=True)
    # Retired quotation feature: columns kept only so older rows load. Nothing
    # reads or writes them any more.
    quote_status = db.Column(db.String(20), nullable=True)
    quote_reject_reason = db.Column(db.Text, nullable=True)
    quote_sent_at = db.Column(db.DateTime, nullable=True)
    quote_responded_at = db.Column(db.DateTime, nullable=True)
    appointment_id = db.Column(db.Integer, nullable=True)  # the appointment the quotation came from
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
    """Retired: appointments were booked online. The table and its rows are kept,
    but nothing in the system reads or writes them any more."""
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
    # VAT rate included in the product prices when the order was placed (NULL on
    # older orders, whose receipts always used the standard 12%)
    vat_percent = db.Column(db.Float, nullable=True)
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

class CartDraft(db.Model):
    """A logged-in customer's saved premade cart, kept until they confirm it.

    Deliberately NOT a ProductOrder with status='draft': a draft holds no order
    number, reserves no stock and must never reach sales totals, the pickup
    queue or reports. Keeping it in its own table means no existing order query
    has to learn to exclude it.
    """
    __tablename__ = 'cart_drafts'
    id = db.Column(db.Integer, primary_key=True)
    # One saved cart per customer — saving again replaces it.
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    # [{productId, name, sku, quantity, unitPrice, sourceBranchId, sourceBranchName}]
    # unitPrice is the price when saved; current price is re-read on confirm.
    items = db.Column(db.JSON, nullable=False, default=list)
    pickup_branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=True)
    customer_name = db.Column(db.String(255), nullable=True)
    customer_phone = db.Column(db.String(50), nullable=True)
    customer_email = db.Column(db.String(255), nullable=True)
    customer_address = db.Column(db.String(255), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', foreign_keys=[user_id])
    pickup_branch = db.relationship('Branch', foreign_keys=[pickup_branch_id])

class PremadeDraft(db.Model):
    """A premade job order staff are still preparing. It is not a sale: it has
    no order number, takes and reserves no stock, and stays out of sales
    figures, the pickup queue and reports until it is confirmed, when it becomes
    a ProductOrder through the same code as a premade sale. Confirmed drafts
    stay (status 'confirmed', product_order_id) so the link can be traced."""
    __tablename__ = 'premade_drafts'
    id = db.Column(db.Integer, primary_key=True)
    draft_number = db.Column(db.String(50), unique=True, nullable=False)  # PD-BA-2026-0001
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=False, index=True)
    customer_id = db.Column(db.Integer, nullable=True)  # a customers row, when one was picked
    customer_name = db.Column(db.String(255), nullable=False)
    customer_phone = db.Column(db.String(50), nullable=True)
    customer_email = db.Column(db.String(255), nullable=True)
    customer_address = db.Column(db.String(255), nullable=True)
    # [{productId, quantity, name, sku, unitPrice}] -- name/sku/price as when saved;
    # stock and current price are re-read every time the draft is shown
    items = db.Column(db.JSON, nullable=False, default=list)
    notes = db.Column(db.Text, nullable=True)
    payment_method = db.Column(db.String(30), nullable=True)
    status = db.Column(db.String(20), default='draft', nullable=False, index=True)  # draft | confirmed
    product_order_id = db.Column(db.Integer, db.ForeignKey('product_orders.id'), nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    updated_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    confirmed_at = db.Column(db.DateTime, nullable=True)

    branch = db.relationship('Branch')
    product_order = db.relationship('ProductOrder')
    creator = db.relationship('User', foreign_keys=[created_by])
    updater = db.relationship('User', foreign_keys=[updated_by])

class Notification(db.Model):
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    data = db.Column(db.JSON, nullable=True)
    is_read = db.Column(db.Boolean, default=False)
    is_archived = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user = db.relationship('User', backref='notifications')

class UserPermissionOverride(db.Model):
    """A permission granted to or revoked from one user on top of their role's
    defaults (see ROLE_DEFAULT_PERMISSIONS)."""
    __tablename__ = 'user_permission_overrides'
    __table_args__ = (db.UniqueConstraint('user_id', 'permission', name='uq_user_permission'),)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    permission = db.Column(db.String(64), nullable=False)
    effect = db.Column(db.String(10), nullable=False)  # grant | revoke
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

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

class PremadeStockTransfer(db.Model):
    """A pending hand-over of premade stock from the warehouse to a branch.

    Stock is deliberately NOT moved when the transfer is raised — the warehouse
    keeps it until the destination confirms receipt. So the quantity a warehouse
    row can still promise is its quantity minus everything already pending
    (see premade_available_quantity).
    """
    __tablename__ = 'premade_stock_transfers'
    id = db.Column(db.Integer, primary_key=True)
    # The warehouse row the stock is taken from.
    product_id = db.Column(db.Integer, db.ForeignKey('premade_products.id'), nullable=False)
    source_branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=False)
    destination_branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    # pending -> received | cancelled
    status = db.Column(db.String(20), default='pending', nullable=False, index=True)
    # Groups the rows created by one "give to all branches" action.
    batch_id = db.Column(db.String(50), nullable=True, index=True)
    notes = db.Column(db.Text, nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # Who accepted or cancelled it, and when.
    resolved_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)

    product = db.relationship('PremadeProduct', foreign_keys=[product_id])
    source_branch = db.relationship('Branch', foreign_keys=[source_branch_id])
    destination_branch = db.relationship('Branch', foreign_keys=[destination_branch_id])
    created_by = db.relationship('User', foreign_keys=[created_by_id])
    resolved_by = db.relationship('User', foreign_keys=[resolved_by_id])

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
    # Which gallery filter the item appears under (see CATALOG_CATEGORIES)
    category = db.Column(db.String(50), default='Automotive')
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

class VehicleMake(db.Model):
    """Reference table of vehicle makes/brands (e.g. Toyota, Honda).

    Populated once by seed_vehicles.py; the app only reads from it so the
    make/model dropdowns never depend on an external API at runtime.
    """
    __tablename__ = 'vehicle_makes'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False, index=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    models = db.relationship('VehicleModel', backref='make', cascade='all, delete-orphan')

class VehicleModel(db.Model):
    """Reference table of vehicle models, each belonging to one make."""
    __tablename__ = 'vehicle_models'
    id = db.Column(db.Integer, primary_key=True)
    make_id = db.Column(db.Integer, db.ForeignKey('vehicle_makes.id'), nullable=False, index=True)
    name = db.Column(db.String(150), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('make_id', 'name', name='uq_vehicle_model_make_name'),
    )

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
    # Set when the material was extra material issued for a job order (e.g. a
    # recut after a mistake): it then counts in that job's actual cost
    job_order_id = db.Column(db.Integer, db.ForeignKey('job_orders.id'), nullable=True, index=True)
    managed_worker_id = db.Column(db.Integer, db.ForeignKey('managed_workers.id'), nullable=True)
    # Cost per unit when it was logged, so later price changes don't rewrite it
    unit_cost = db.Column(db.Float, nullable=True)

    material = db.relationship('InventoryMaterial')
    branch = db.relationship('Branch')
    logged_by_user = db.relationship('User', foreign_keys=[logged_by])
    job_order = db.relationship('JobOrder')
    worker = db.relationship('ManagedWorker')

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

class ExcessPayment(db.Model):
    """Money received on a job order beyond its balance (e.g. a GCash transfer for
    more than was owed). It is not a payment on the order: the shop holds it until
    it is refunded or applied to another of the customer's orders."""
    __tablename__ = 'excess_payments'
    id = db.Column(db.Integer, primary_key=True)
    job_order_id = db.Column(db.Integer, db.ForeignKey('job_orders.id'), nullable=False)
    customer_id = db.Column(db.Integer, nullable=True, index=True)
    amount = db.Column(db.Float, nullable=False)
    payment_method = db.Column(db.String(50), nullable=False)
    reference_number = db.Column(db.String(100), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='open')  # open, refunded, applied
    received_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # How it was settled
    resolved_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    refund_method = db.Column(db.String(50), nullable=True)
    refund_reference = db.Column(db.String(100), nullable=True)
    resolution_notes = db.Column(db.Text, nullable=True)
    applied_job_order_id = db.Column(db.Integer, db.ForeignKey('job_orders.id'), nullable=True)

    job_order = db.relationship('JobOrder', foreign_keys=[job_order_id])
    applied_job_order = db.relationship('JobOrder', foreign_keys=[applied_job_order_id])
    receiver = db.relationship('User', foreign_keys=[received_by])
    resolver = db.relationship('User', foreign_keys=[resolved_by])

class PaymentOverrideRequest(db.Model):
    """A supervisor-initiated override of a job order's payment status/balance
    that must be approved by an administrator before it is applied."""
    __tablename__ = 'payment_override_requests'
    id = db.Column(db.Integer, primary_key=True)
    job_order_id = db.Column(db.Integer, db.ForeignKey('job_orders.id'), nullable=False)
    requested_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    # Requested new values (any may be null = "leave unchanged")
    new_payment_status = db.Column(db.String(50), nullable=True)  # unpaid, partial, paid
    new_balance = db.Column(db.Float, nullable=True)
    new_down_payment = db.Column(db.Float, nullable=True)
    reason = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='pending')  # pending, approved, rejected
    reviewed_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    review_notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    reviewed_at = db.Column(db.DateTime, nullable=True)

    job_order = db.relationship('JobOrder')
    requester = db.relationship('User', foreign_keys=[requested_by])
    reviewer = db.relationship('User', foreign_keys=[reviewed_by])

class ManagedWorker(db.Model):
    __tablename__ = 'managed_workers'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    work_type = db.Column(db.String(100), nullable=False)  # seat_maker, sewer, upholstery, installer
    rate_per_hour = db.Column(db.Float, nullable=False, default=0)  # rate value (unit depends on pay_mode)
    pay_mode = db.Column(db.String(20), default='per_hour')  # per_hour | per_day | per_piece
    is_active = db.Column(db.Boolean, default=True)
    # The worker's own login (a seat maker or sewer account), so they can see their work
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', foreign_keys=[user_id])

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

class Expense(db.Model):
    """Money the business spends that isn't stock bought through purchase orders:
    rent, power, wages paid outside job orders, supplies and so on."""
    __tablename__ = 'expenses'
    id = db.Column(db.Integer, primary_key=True)
    expense_date = db.Column(db.Date, nullable=False, index=True)
    category = db.Column(db.String(50), nullable=False)
    particulars = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    payment_method = db.Column(db.String(30), nullable=False, default='cash')
    notes = db.Column(db.Text)
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    branch = db.relationship('Branch')
    creator = db.relationship('User', foreign_keys=[created_by])

class AuditLog(db.Model):
    """Audit trail. Kept in the database — an in-memory list was wiped on every
    restart, and on serverless hosting each request could see a different one."""
    __tablename__ = 'audit_logs'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True)
    user_name = db.Column(db.String(255))
    action = db.Column(db.String(50))
    module = db.Column(db.String(100), index=True)
    details = db.Column(db.Text)
    ip_address = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

class PurchaseOrder(db.Model):
    __tablename__ = 'purchase_orders'
    id = db.Column(db.Integer, primary_key=True)
    po_number = db.Column(db.String(50), unique=True, nullable=False)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=True)
    supplier_name = db.Column(db.String(255), nullable=False)
    items = db.Column(db.JSON, nullable=False)  # [{materialId?, name, quantity, unit?, unitPrice}]
    total_amount = db.Column(db.Float, default=0)
    status = db.Column(db.String(20), default='pending')  # pending, approved, received, cancelled
    expected_delivery = db.Column(db.String(20))
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    approved_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    received_at = db.Column(db.DateTime, nullable=True)

class LineupSlip(db.Model):
    """Production line-up slip for a job order: its tasks and who is on them."""
    __tablename__ = 'lineup_slips'
    id = db.Column(db.Integer, primary_key=True)
    slip_number = db.Column(db.String(50), unique=True, nullable=False)
    job_order_id = db.Column(db.Integer, db.ForeignKey('job_orders.id'), nullable=False)
    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=True)
    items = db.Column(db.JSON)  # [{description, status}]
    priority = db.Column(db.String(20), default='normal')
    assigned_to = db.Column(db.String(255), default='')
    notes = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    job_order = db.relationship('JobOrder')

class Delivery(db.Model):
    """Scheduled delivery of a finished job to a customer (or a branch restock)."""
    __tablename__ = 'deliveries'
    id = db.Column(db.Integer, primary_key=True)
    delivery_number = db.Column(db.String(50), unique=True, nullable=False)
    type = db.Column(db.String(30), default='customer_delivery')  # customer_delivery | branch_restock
    from_branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=True)
    to_branch_id = db.Column(db.Integer, db.ForeignKey('branches.id'), nullable=True)
    customer_name = db.Column(db.String(255))
    customer_address = db.Column(db.Text)
    customer_phone = db.Column(db.String(50))
    job_order_id = db.Column(db.Integer, db.ForeignKey('job_orders.id'), nullable=True)
    items = db.Column(db.JSON)
    status = db.Column(db.String(20), default='scheduled')  # scheduled, in_transit, delivered, cancelled
    scheduled_date = db.Column(db.String(10))
    time_slot = db.Column(db.String(20))
    estimated_arrival = db.Column(db.String(30))
    driver_name = db.Column(db.String(255))
    driver_contact = db.Column(db.String(50))
    vehicle_plate = db.Column(db.String(50))
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    delivered_at = db.Column(db.DateTime, nullable=True)

    from_branch = db.relationship('Branch', foreign_keys=[from_branch_id])
    to_branch = db.relationship('Branch', foreign_keys=[to_branch_id])
    job_order = db.relationship('JobOrder')

# ============================================
# SEED DATA
# ============================================

default_roles = [
    {'key': 'administrator', 'name': 'Administrator'},
    {'key': 'supervisor', 'name': 'Supervisor'},
    {'key': 'sales_manager', 'name': 'Sales Manager'},
    {'key': 'seat_maker', 'name': 'Seat Maker'},
    {'key': 'sewer', 'name': 'Sewer'},
    {'key': 'customer', 'name': 'Customer'},
    {'key': 'owner', 'name': 'Owner'},
]

# Demo accounts the system used to create with known passwords. They are no
# longer created; startup only warns if one still has its old password.
DEMO_ACCOUNT_PASSWORDS = {'admin': 'admin123', 'supervisor': 'super123',
                          'salesmanager': 'sales123', 'owner': 'owner123'}

# ============================================
# IN-MEMORY STATE AND SEED DATA
# ============================================

# Sign-in sessions live in the user_sessions table; see create_session()

# Branch seed data, used only to populate an empty database.
branches = [
    {'id': 1, 'name': 'Main Warehouse', 'code': 'MW', 'address': '123 Main St', 'isWarehouse': True, 'isActive': True},
    {'id': 2, 'name': 'Branch A', 'code': 'BA', 'address': '456 Branch A St', 'isWarehouse': False, 'isActive': True},
    {'id': 3, 'name': 'Branch B', 'code': 'BB', 'address': '789 Branch B St', 'isWarehouse': False, 'isActive': True},
    {'id': 4, 'name': 'Branch C', 'code': 'BC', 'address': '321 Branch C St', 'isWarehouse': False, 'isActive': True},
]


# ============================================
# HELPER FUNCTIONS
# ============================================

db_initialized = False

# ============================================
# PERMISSIONS
# ============================================
# Every feature as module.action. A role only supplies defaults; an admin can
# grant or revoke any permission for an individual user (user_permission_overrides).
# branches.all is the cross-branch scope: without it a user only sees and acts on
# their own branch.
PERMISSION_MODULES = [
    ('dashboard', 'Dashboard', [('view', 'View')]),
    ('sales', 'Sales / Job Orders', [('view', 'View'), ('add', 'Add'), ('edit', 'Edit'), ('delete', 'Delete'),
                                     ('void', 'Void'),
                                     ('edit_unpaid', 'Edit before down payment')]),
    # Requests customers sent online before online ordering was retired; kept as history
    ('custom_requests', 'Custom Requests (online, retired)', [('view', 'View'), ('edit', 'Edit')]),
    ('customers', 'Customers', [('view', 'View'), ('add', 'Add'), ('edit', 'Edit')]),
    ('payments', 'Payments', [('view', 'View'), ('add', 'Add'), ('request_override', 'Request override'),
                              ('approve_override', 'Approve overrides')]),
    ('inventory', 'Inventory', [('view', 'View'), ('add', 'Add'), ('edit', 'Edit'), ('delete', 'Archive'),
                                ('log_waste', 'Log waste')]),
    ('premade', 'Premade Products', [('view', 'View'), ('add', 'Add'), ('edit', 'Edit'),
                                     ('distribute', 'Distribute'), ('receive', 'Receive deliveries')]),
    ('suppliers', 'Suppliers', [('view', 'View'), ('add', 'Add'), ('edit', 'Edit')]),
    ('purchase_orders', 'Purchase Orders', [('view', 'View'), ('add', 'Add'), ('approve', 'Approve'),
                                            ('receive', 'Receive')]),
    ('product_orders', 'Product Orders', [('view', 'View'), ('edit', 'Edit'), ('payment', 'Record payments'),
                                          ('transfer', 'Transfers'), ('flag_spam', 'Flag spam')]),
    ('costing', 'Costing', [('view', 'View'), ('edit', 'Edit')]),
    ('forecasting', 'Forecasting', [('view', 'View'), ('manage', 'Manage AI data')]),
    ('item_trail', 'Item Trail', [('view', 'View'), ('add', 'Add'), ('update_status', 'Update status')]),
    ('reports', 'Reports', [('sales', 'Sales'), ('inventory', 'Inventory'), ('settlement', 'Branch settlement'),
                            ('audit_trail', 'Audit trail')]),
    ('announcements', 'Announcements', [('view', 'View'), ('manage', 'Manage')]),
    ('workers', 'Worker Management', [('view', 'View'), ('add', 'Add'), ('edit', 'Edit'), ('delete', 'Delete'),
                                      ('assign', 'Assign work'), ('delete_assignment', 'Delete assignments')]),
    ('catalog', 'Catalog', [('manage', 'Manage')]),
    ('blacklist', 'Spam Blacklist', [('manage', 'Manage')]),
    ('chat', 'Staff Chat', [('use', 'Use')]),
    ('settings', 'System Settings', [('edit', 'Edit')]),
    ('branches', 'Branches', [('manage', 'Manage'), ('all', 'Access all branches')]),
    ('users', 'Users', [('manage', 'Manage users & permissions')]),
    ('owner', 'Owner Dashboard', [('view', 'View business financials')]),
    ('expenses', 'Expenses', [('view', 'View'), ('add', 'Add'), ('delete', 'Delete')]),
]
PERMISSIONS = {
    f'{module}.{action}': {'module': module, 'moduleLabel': module_label, 'action': action, 'label': label}
    for module, module_label, actions in PERMISSION_MODULES
    for action, label in actions
}

_SUPERVISOR_EXCLUDED = {
    'payments.approve_override', 'purchase_orders.approve', 'reports.audit_trail',
    'workers.add', 'workers.edit', 'workers.delete', 'workers.delete_assignment',
    'catalog.manage', 'blacklist.manage', 'branches.manage', 'branches.all', 'users.manage',
    'owner.view', 'expenses.delete',
}
# Defaults reproduce what each role could do before permissions existed
ROLE_DEFAULT_PERMISSIONS = {
    'administrator': frozenset(PERMISSIONS),
    'supervisor': frozenset(set(PERMISSIONS) - _SUPERVISOR_EXCLUDED),
    'sales_manager': frozenset({
        'dashboard.view',
        'sales.view', 'sales.add', 'sales.edit', 'sales.delete',
        'custom_requests.view', 'custom_requests.edit',
        'customers.view', 'customers.edit',
        'payments.view', 'payments.add', 'payments.request_override',
        'premade.receive',
        # Premade sales at their own branch: see them, take payments, mark them done
        'product_orders.view', 'product_orders.edit', 'product_orders.payment',
        'reports.sales',
        'announcements.view',
        'workers.view', 'workers.assign',
        'expenses.view', 'expenses.add',
    }),
    # The owner reviews the results of the day-to-day work rather than doing it:
    # every view, all branches, and the owner dashboard -- no editing
    'owner': frozenset({
        'owner.view', 'dashboard.view', 'branches.all',
        'sales.view', 'custom_requests.view', 'customers.view', 'payments.view',
        'inventory.view', 'premade.view', 'suppliers.view', 'purchase_orders.view', 'product_orders.view',
        'costing.view', 'forecasting.view', 'item_trail.view', 'announcements.view', 'workers.view',
        'reports.sales', 'reports.inventory', 'reports.settlement', 'reports.audit_trail',
        'expenses.view',
    }),
    # Worker accounts only use their profile; Worker Management tracks their work
    'seat_maker': frozenset(),
    'sewer': frozenset(),
    # Online customer accounts were retired with online ordering and can't sign in
    'customer': frozenset(),
}

def effective_permissions(user_id, role_key, overrides=None):
    """Role defaults plus this user's grants, minus their revokes."""
    perms = set(ROLE_DEFAULT_PERMISSIONS.get(role_key, ()))
    if role_key == 'customer':
        return perms
    if overrides is None:
        overrides = UserPermissionOverride.query.filter_by(user_id=user_id).all()
    for o in overrides:
        if o.permission not in PERMISSIONS:
            continue
        if o.effect == 'grant':
            perms.add(o.permission)
        elif o.effect == 'revoke':
            perms.discard(o.permission)
    return perms

def has_perm(user, *permissions):
    """True if the signed-in user (request.current_user) has any of these."""
    granted = user.get('permissions') or ()
    return any(p in granted for p in permissions)

# Workers' pay on a job order is payroll: only these roles see or change it.
# Everyone else gets the labor lines without rates or pay.
LABOR_COST_ROLES = ('administrator', 'owner', 'supervisor')

def sees_labor_cost(user):
    return user.get('role') in LABOR_COST_ROLES

def without_labor_cost(items):
    """Labor lines with their rate and pay taken out, for roles that may not see them."""
    return [{k: v for k, v in it.items() if k not in ('laborCost', 'actualLaborCost')}
            if it.get('category') == 'labor' else it for it in items or []]

def all_branches(user):
    """Whether the user sees every branch rather than only their own."""
    return has_perm(user, 'branches.all')

def all_inventory_branches(user):
    """Inventory of every branch: administrators (all-branch access) and accounts
    based at the warehouse. Everyone else changes only their own branch's stock."""
    return all_branches(user) or bool(user.get('atWarehouse'))

def inventory_branch_error(user, branch_id):
    """403 response if the user may not change stock held at branch_id, else None.
    Pass the branch stored on the record (or the one it is moving to)."""
    if all_inventory_branches(user) or (branch_id is not None and branch_id == user_branch_id(user)):
        return None
    return jsonify({'status': 'error', 'message': 'You can only change inventory for your own branch'}), 403

def all_job_order_branches(user):
    """Job orders (and their payments and lineup slips) of every branch. Accounts
    based at the warehouse are general: they take orders for any branch and keep
    managing them. Other modules still follow all_branches."""
    return all_branches(user) or bool(user.get('atWarehouse'))

# Delegation policy. Administrators may change anyone's access. Anyone else who
# manages users can't change their own account, can't touch administrator
# accounts or hand out the administrator role, and can only grant or remove
# permissions they hold themselves -- never these privileged ones, which decide
# who manages accounts and who sees every branch.
PRIVILEGED_PERMISSIONS = frozenset({'users.manage', 'branches.manage', 'branches.all'})

def is_administrator(user):
    return user.get('role') == 'administrator'

def target_account_error(actor, target):
    """Why `actor` may not manage the `target` account at all, or None."""
    if is_administrator(actor):
        return None
    if target.id == actor['id']:
        return 'Only an administrator can change your own account here. Use My Profile for your details.'
    if target.role and target.role.key == 'administrator':
        return 'Only an administrator can change an administrator account.'
    return None

def delegation_error(actor, perms_before, perms_after, new_role_key=None):
    """Why `actor` may not change an account's access from perms_before to
    perms_after (and to new_role_key, if the role changes), or None."""
    if is_administrator(actor):
        return None
    if new_role_key == 'administrator':
        return 'Only an administrator can give out the administrator role.'
    changed = set(perms_before) ^ set(perms_after)
    privileged = changed & PRIVILEGED_PERMISSIONS
    if privileged:
        return f"Only an administrator can grant or remove: {', '.join(sorted(privileged))}"
    not_held = changed - set(actor.get('permissions') or ())
    if not_held:
        return f"You can only grant or remove permissions you have yourself: {', '.join(sorted(not_held))}"
    return None

def user_to_dict(user):
    role_key = user.role.key if user.role else None
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'fullName': user.full_name,
        'role': role_key,
        'roleName': user.role.name if user.role else None,
        'branch': user.branch,
        'branchId': user.branch_id,
        'branchName': user.branch_rel.name if user.branch_rel else user.branch,
        # Warehouse-based accounts pick the branch a job order is for
        'atWarehouse': bool(user.branch_rel and user.branch_rel.is_warehouse),
        'isActive': user.is_active,
        'phone': user.phone,
        'permissions': sorted(effective_permissions(user.id, role_key)),
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
        'userId': order.user_id,
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
        'isArchived': branch.archived_at is not None,
        'deactivatedAt': fmt_dt(branch.deactivated_at),
        'archivedAt': fmt_dt(branch.archived_at),
        'createdAt': fmt_dt(branch.created_at)
    }

def retire_staff_role():
    """The 'staff' role was removed: move any remaining staff accounts to
    sales_manager, then drop the role so it can no longer be assigned.

    Idempotent, and safe if several workers start at once — a worker that loses
    the race just rolls back and finds nothing left to do next time."""
    staff_role = Role.query.filter_by(key='staff').first()
    sales_manager_role = Role.query.filter_by(key='sales_manager').first()
    if not staff_role or not sales_manager_role:
        return
    try:
        moved = User.query.filter_by(role_id=staff_role.id).update(
            {'role_id': sales_manager_role.id}, synchronize_session=False)
        Role.query.filter_by(id=staff_role.id).delete(synchronize_session=False)
        db.session.commit()
        print(f"[migration] Retired 'staff' role; {moved} user(s) moved to sales_manager")
    except Exception as e:
        db.session.rollback()
        print(f"[migration] Retiring 'staff' role skipped: {e}")

def seed_first_administrator():
    """On a brand-new database (no staff accounts at all) create one
    administrator so someone can sign in and set up the rest. Its password comes
    from INITIAL_ADMIN_PASSWORD, or is random and printed once to the server log.
    An existing database is never given accounts, so a deleted or renamed
    account can't come back with a known password."""
    staff = User.query.join(Role, User.role_id == Role.id).filter(Role.key != 'customer').count()
    if staff:
        return
    role = Role.query.filter_by(key='administrator').first()
    if not role:
        return
    password = os.getenv('INITIAL_ADMIN_PASSWORD') or secrets.token_urlsafe(12)
    warehouse = Branch.query.filter_by(is_warehouse=True).first()
    db.session.add(User(username='admin', password=hash_password(password), email='admin@seatmakers.com',
                        full_name='System Administrator', role_id=role.id,
                        branch_id=warehouse.id if warehouse else None,
                        branch=warehouse.name if warehouse else None, is_active=True))
    db.session.commit()
    if os.getenv('INITIAL_ADMIN_PASSWORD'):
        print("[setup] Created the first administrator 'admin' with INITIAL_ADMIN_PASSWORD.", flush=True)
    else:
        print(f"[setup] Created the first administrator 'admin' with password: {password}  "
              f"-- sign in and change it now.", flush=True)

def warn_about_demo_passwords():
    """Log a warning for every active account still using an old demo password."""
    for username, demo_password in DEMO_ACCOUNT_PASSWORDS.items():
        user = User.query.filter_by(username=username, is_active=True).first()
        if user and verify_password(user, demo_password):
            print(f"[security] WARNING: account '{username}' still uses its demo password. "
                  f"Change it in My Profile or Settings > Users.", flush=True)
    db.session.rollback()  # verify_password may upgrade an old hash; nothing to save here

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
        "ALTER TABLE inventory_materials ADD COLUMN IF NOT EXISTS source_job_order_id VARCHAR(50)",
        "ALTER TABLE inventory_materials ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'available'",
        "ALTER TABLE material_usage_logs ADD COLUMN IF NOT EXISTS job_order_db_id INTEGER",
        "ALTER TABLE inventory_materials ADD COLUMN IF NOT EXISTS low_stock_threshold REAL DEFAULT 0",
        "ALTER TABLE inventory_materials ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id)",
        "ALTER TABLE product_orders ADD COLUMN IF NOT EXISTS amount_paid REAL DEFAULT 0.0",
        "ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'",
        "ALTER TABLE managed_workers ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmed_by INTEGER REFERENCES users(id)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMP",
        # Expand password column for salted hashes (SQLite ignores length; PostgreSQL enforces it)
        "ALTER TABLE users ALTER COLUMN password TYPE VARCHAR(255)",
        # Transfer trackability: who sent, who received, and when
        "ALTER TABLE product_order_transfers ADD COLUMN IF NOT EXISTS transferred_by_id INTEGER REFERENCES users(id)",
        "ALTER TABLE product_order_transfers ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMP",
        "ALTER TABLE product_order_transfers ADD COLUMN IF NOT EXISTS received_by_id INTEGER REFERENCES users(id)",
        "ALTER TABLE product_order_transfers ADD COLUMN IF NOT EXISTS received_at TIMESTAMP",
        "ALTER TABLE worker_assignments ADD COLUMN IF NOT EXISTS expected_hours REAL",
        # Material cost / markup-based selling price + supplier SKU
        "ALTER TABLE inventory_materials ADD COLUMN IF NOT EXISTS sku VARCHAR(100)",
        "ALTER TABLE inventory_materials ADD COLUMN IF NOT EXISTS cost_per_unit REAL DEFAULT 0",
        "ALTER TABLE inventory_materials ADD COLUMN IF NOT EXISTS markup_percent REAL DEFAULT 25",
        # Worker pay mode: per_hour, per_day, per_piece
        "ALTER TABLE managed_workers ADD COLUMN IF NOT EXISTS pay_mode VARCHAR(20) DEFAULT 'per_hour'",
        # Worker assignment: calendar date, type (job_order | special_task), title for special tasks
        "ALTER TABLE worker_assignments ADD COLUMN IF NOT EXISTS scheduled_date DATE",
        "ALTER TABLE worker_assignments ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(20) DEFAULT 'job_order'",
        "ALTER TABLE worker_assignments ADD COLUMN IF NOT EXISTS special_task_title VARCHAR(255)",
        # On completion: pay override + materials snapshot
        "ALTER TABLE worker_assignments ADD COLUMN IF NOT EXISTS pay_override REAL",
        "ALTER TABLE worker_assignments ADD COLUMN IF NOT EXISTS materials_used JSON",
        # Track which managed worker used materials (FK to managed_workers)
        "ALTER TABLE material_usage_logs ADD COLUMN IF NOT EXISTS managed_worker_id INTEGER REFERENCES managed_workers(id)",
        # Per-order discount override on job orders
        "ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS discount_percent REAL",
        # Printed job order slip snapshot
        "ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS slip_data JSON",
        # Optional VAT on job orders
        "ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS vat_percent REAL",
        # Branch contact phone number
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone VARCHAR(50)",
        # User's own contact number, editable on My Profile
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)",
        # Link a customer record to the online account of a customer who signed up
        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS user_id INTEGER",
        # Quotations sent to customers (job orders kept as drafts until accepted)
        "ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS quote_status VARCHAR(20)",
        "ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS quote_reject_reason TEXT",
        "ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMP",
        "ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS quote_responded_at TIMESTAMP",
        "ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS appointment_id INTEGER",
        # Gallery filter for catalog items; existing items were all vehicle work
        "ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'Automotive'",
        # Notifications a user has moved out of the bell into their archive
        "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE",
        # Invalidates cached sessions on every worker when a user's access changes
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER DEFAULT 0",
        # VAT-inclusive pricing: which job orders were priced that way, and the rate
        # each product order was sold at. Existing rows stay NULL (their old meaning).
        "ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS vat_inclusive BOOLEAN",
        "ALTER TABLE product_orders ADD COLUMN IF NOT EXISTS vat_percent REAL",
        # Extra materials issued for a job order (waste linked to the job)
        "ALTER TABLE material_waste_logs ADD COLUMN IF NOT EXISTS job_order_id INTEGER REFERENCES job_orders(id)",
        "ALTER TABLE material_waste_logs ADD COLUMN IF NOT EXISTS managed_worker_id INTEGER REFERENCES managed_workers(id)",
        "ALTER TABLE material_waste_logs ADD COLUMN IF NOT EXISTS unit_cost REAL",
        "CREATE INDEX IF NOT EXISTS ix_material_waste_logs_job_order_id ON material_waste_logs (job_order_id)",
        # Branch lifecycle (deactivate / archive / delete)
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP",
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP",
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
        # Branches deactivated before the column existed start their 30-day clock now
        "UPDATE branches SET deactivated_at = CURRENT_TIMESTAMP WHERE is_active = FALSE AND deactivated_at IS NULL",
    ]
    is_sqlite = db.engine.dialect.name == 'sqlite'
    for sql in migrations:
        if is_sqlite:
            # SQLite (local dev) has no "ADD COLUMN IF NOT EXISTS"; without the clause a
            # column that already exists just errors and is skipped below.
            sql = sql.replace(' IF NOT EXISTS', '')
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
    db.session.commit()
    retire_staff_role()

    # Seed default system settings
    default_settings = [
        ('inventory_low_stock_threshold', '0'),
        # Default markup applied to a material's cost to derive its selling unit price
        ('default_material_markup', '25'),
        # VAT rate included in customer prices (the standard Philippine rate)
        ('vat_percent', str(DEFAULT_VAT_PERCENT)),
        # Row locked while a premade order number is picked (lock_product_order_numbering)
        (PRODUCT_ORDER_NUMBER_LOCK, ''),
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
    
    # Only on a brand-new database: branch codes can be edited, so matching by
    # code would re-create a default branch whose code was changed.
    for branch_data in (default_branches if Branch.query.count() == 0 else []):
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

    # Accounts: only a first administrator on a brand-new database
    seed_first_administrator()
    warn_about_demo_passwords()
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

SESSION_TTL = timedelta(hours=12)  # signed out after 12 hours without using the system
SESSION_REFRESH = timedelta(minutes=10)  # how often a session in use has its expiry pushed back
SESSION_CACHE_SECONDS = 60

# Per-process cache of token -> (user dict, cached_at, auth_version), so a burst
# of API calls doesn't rebuild the user (role, branch, permissions) every time.
# Each request still checks the session row and the user's auth_version in one
# query, so archiving, sign-outs and access changes apply at once on every worker.
_session_cache = {}

def _token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()

def end_user_sessions(user_id):
    """Sign a user out everywhere. The caller commits."""
    UserSession.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    forget_cached_sessions(user_id)

def forget_cached_sessions(user_id):
    """Drop this worker's cached copy of a user's sessions. Other workers notice
    the change through bump_auth_version."""
    for t in [t for t, (u, *_) in _session_cache.items() if u['id'] == user_id]:
        _session_cache.pop(t, None)

def bump_auth_version(user):
    """Mark the user's access as changed so every worker reloads it on their next
    request. The caller commits."""
    user.auth_version = (user.auth_version or 0) + 1
    forget_cached_sessions(user.id)

def create_session(user):
    """Start a session and return its token. One login at a time: any other
    session the user has is ended. Commits."""
    now = datetime.utcnow()
    end_user_sessions(user.id)
    UserSession.query.filter(UserSession.expires_at < now).delete(synchronize_session=False)
    token = secrets.token_hex(32)
    db.session.add(UserSession(token_hash=_token_hash(token), user_id=user.id,
                               created_at=now, expires_at=now + SESSION_TTL))
    db.session.commit()
    return token

def get_user_from_token(token):
    """Get the signed-in user for a session token, or None."""
    if not token:
        return None
    now_ts = time.time()
    now = datetime.utcnow()
    token_hash = _token_hash(token)
    # One cheap query every request: is the session still there, the account
    # still active, and its access unchanged since we cached it?
    row = (db.session.query(UserSession.expires_at, User.is_active, User.auth_version)
           .join(User, User.id == UserSession.user_id)
           .filter(UserSession.token_hash == token_hash).first())
    if not row or row.expires_at <= now or not row.is_active:
        _session_cache.pop(token, None)
        return None
    version = row.auth_version or 0

    # Sliding expiry, written at most once every SESSION_REFRESH per session
    if row.expires_at - now < SESSION_TTL - SESSION_REFRESH:
        UserSession.query.filter_by(token_hash=token_hash).update(
            {'expires_at': now + SESSION_TTL}, synchronize_session=False)
        db.session.commit()

    cached = _session_cache.get(token)
    if cached and cached[2] == version and (now_ts - cached[1]) < SESSION_CACHE_SECONDS:
        return cached[0]

    s = UserSession.query.filter_by(token_hash=token_hash).first()
    user = User.query.get(s.user_id) if s else None
    # A customer still signed in from before online ordering was retired is signed out
    if not user or is_customer_account(user):
        _session_cache.pop(token, None)
        return None

    if len(_session_cache) > 1000:
        for t in [t for t, (_, at, _v) in _session_cache.items() if now_ts - at >= SESSION_CACHE_SECONDS]:
            _session_cache.pop(t, None)
    resolved = user_to_dict(user)
    _session_cache[token] = (resolved, now_ts, version)
    return resolved

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

def require_permission(*permissions):
    """Decorator: the signed-in user needs at least one of these permissions."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(request, 'current_user'):
                return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
            if not has_perm(request.current_user, *permissions):
                return jsonify({'status': 'error', 'message': 'You do not have permission to do this'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

def require_staff(f):
    """Decorator: any staff account (lookups shared by several modules)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not hasattr(request, 'current_user'):
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
        if request.current_user['role'] == 'customer':
            return jsonify({'status': 'error', 'message': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return decorated

CUSTOMER_LOGIN_RETIRED_MESSAGE = ('Online customer accounts are no longer available. '
                                  'Please contact Seatmakers Avenue by phone, Messenger or at any branch.')

def is_customer_account(user):
    """An online customer account. They were only for ordering online, which
    was retired: the accounts and their history stay, but can't sign in."""
    return bool(user.role and user.role.key == 'customer')

PH_OFFSET = timedelta(hours=8)

def manila_today():
    """Today's date in the Philippines (the server clock is UTC)."""
    return (datetime.utcnow() + PH_OFFSET).date()

# ============================================
# VAT (customer prices include it)
# ============================================

DEFAULT_VAT_PERCENT = 12  # standard Philippine VAT, until changed in Settings
MAX_VAT_PERCENT = 100

def finite_number(value, default=None):
    """value as a float if it is a real, finite number; default for None or a
    blank string; None for anything else (text, NaN, Infinity, true/false)."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None

def money(amount):
    """Round to the centavo, halves up (0.005 -> 0.01), as a float."""
    return float(Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

def vat_percent_error(raw):
    """Error message if raw isn't a valid VAT rate, else None."""
    try:
        rate = Decimal(str(raw).strip())
    except (InvalidOperation, ValueError):
        return 'VAT rate must be a number'
    if not rate.is_finite() or rate < 0 or rate > MAX_VAT_PERCENT:
        return f'VAT rate must be between 0 and {MAX_VAT_PERCENT}%'
    if rate != rate.quantize(Decimal('0.01')):
        return 'VAT rate can have at most 2 decimal places'
    return None

def current_vat_percent():
    """The VAT rate set in Settings, applied to newly priced orders."""
    setting = SystemSetting.query.filter_by(key='vat_percent').first()
    if setting is None or vat_percent_error(setting.value):
        return float(DEFAULT_VAT_PERCENT)
    return float(setting.value)

def vat_breakdown(gross, vat_percent):
    """Split a VAT-inclusive amount into its net and VAT parts, to the centavo.
    net + vat always equals gross; VAT is taken out of the price, not added."""
    gross = money(gross or 0)
    rate = float(vat_percent or 0)
    net = money(gross / (1 + rate / 100)) if rate > 0 else gross
    return {'gross': gross, 'net': net, 'vat': money(gross - net), 'vatPercent': rate}

# ============================================
# PASSWORD HELPERS
# ============================================

MAX_FAILED_ATTEMPTS = 5
# Same reply for an unknown username and a wrong password, so neither is revealed
LOGIN_FAILED_MESSAGE = 'Incorrect username or password.'
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

MAX_STRIKES_BEFORE_BLOCK = 3  # no-shows / fake orders before auto-block

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
    """Log user action to audit trail. Every caller has already committed its
    own changes, so committing here only saves the log entry."""
    try:
        db.session.add(AuditLog(user_id=user_id, user_name=user_name, action=action, module=module,
                                details=details, ip_address=ip_address))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"[audit] could not record {action} {module}: {e}")


def audit_log_to_dict(log):
    return {
        'id': log.id,
        'userId': log.user_id,
        'userName': log.user_name,
        'action': log.action,
        'module': log.module,
        'details': log.details,
        'ipAddress': log.ip_address,
        # Same 'YYYY-MM-DD HH:MM:SS PHT' format the in-memory log used
        'timestamp': (log.created_at + PH_OFFSET).strftime('%Y-%m-%d %H:%M:%S PHT') if log.created_at else '',
    }

@app.before_request
def ensure_db_initialized():
    global db_initialized
    if not db_initialized:
        init_db()  # init_db() already seeds default users
        db_initialized = True

PRODUCT_ORDER_NUMBER_LOCK = '_lock:product_order_numbers'
NUMBER_CLASH_MESSAGE = 'Another order was saved at the same moment. Please try again.'

def lock_branch_numbering(branch_id):
    """Make saves that number a job order for this branch take turns: the branch
    row stays locked until the transaction ends, so the next save waits and then
    sees the number this one used. (PostgreSQL; SQLite ignores row locks.)"""
    Branch.query.filter_by(id=branch_id).with_for_update().first()

def lock_product_order_numbering():
    """The same for premade order numbers, which run across all branches."""
    SystemSetting.query.filter_by(key=PRODUCT_ORDER_NUMBER_LOCK).with_for_update().first()

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

    next_sequence = 1
    for job_order_id in existing_ids:
        try:
            sequence = int(job_order_id.rsplit('-', 1)[-1])
        except (TypeError, ValueError):
            continue
        next_sequence = max(next_sequence, sequence + 1)

    return f'{prefix}{next_sequence:04d}'

def generate_lineup_slip_number(branch_code):
    """Next line-up slip number for this branch and year (LS-MW-2026-0001, ...)"""
    prefix = f'LS-{branch_code}-{datetime.now().year}-'
    numbers = [int(n[len(prefix):]) for (n,) in
               db.session.query(LineupSlip.slip_number).filter(LineupSlip.slip_number.like(f'{prefix}%')).all()
               if n[len(prefix):].isdigit()]
    return f'{prefix}{(max(numbers) + 1 if numbers else 1):04d}'

def generate_po_number():
    """Next PO number for this year (PO-2026-0001, ...)"""
    prefix = f'PO-{datetime.now().year}-'
    numbers = [int(n[len(prefix):]) for (n,) in
               db.session.query(PurchaseOrder.po_number).filter(PurchaseOrder.po_number.like(f'{prefix}%')).all()
               if n[len(prefix):].isdigit()]
    return f'{prefix}{(max(numbers) + 1 if numbers else 1):04d}'

def generate_delivery_number():
    """Next delivery number for this year (DL-2026-0001, ...)"""
    prefix = f'DL-{datetime.now().year}-'
    numbers = [int(n[len(prefix):]) for (n,) in
               db.session.query(Delivery.delivery_number).filter(Delivery.delivery_number.like(f'{prefix}%')).all()
               if n[len(prefix):].isdigit()]
    return f'{prefix}{(max(numbers) + 1 if numbers else 1):04d}'


def delivery_to_dict(d):
    return {
        'id': d.id,
        'deliveryNumber': d.delivery_number,
        'type': d.type,
        'fromBranchId': d.from_branch_id,
        'fromBranchName': d.from_branch.name if d.from_branch else None,
        'toBranchId': d.to_branch_id,
        'toBranchName': d.to_branch.name if d.to_branch else None,
        'customerName': d.customer_name,
        'customerAddress': d.customer_address,
        'customerPhone': d.customer_phone,
        'jobOrderId': d.job_order_id,
        'jobOrderNumber': d.job_order.job_order_id if d.job_order else None,
        'items': d.items or [],
        'status': d.status,
        'scheduledDate': d.scheduled_date,
        'timeSlot': d.time_slot,
        'estimatedArrival': d.estimated_arrival,
        'driverName': d.driver_name or '',
        'driverContact': d.driver_contact or '',
        'vehiclePlate': d.vehicle_plate or '',
        'notes': d.notes or '',
        'createdAt': d.created_at.strftime('%Y-%m-%d') if d.created_at else None,
        'createdBy': d.created_by,
        'deliveredAt': (d.delivered_at + PH_OFFSET).strftime('%Y-%m-%d %H:%M') if d.delivered_at else None,
    }


def can_see_delivery(user, d):
    if all_branches(user):
        return True
    bid = user_branch_id(user)
    return bid is not None and bid in (d.from_branch_id, d.to_branch_id)

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
        return jsonify({'status': 'error', 'message': LOGIN_FAILED_MESSAGE}), 401

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
        # Attempts are still counted toward the lockout, but how many remain isn't revealed
        return jsonify({'status': 'error', 'message': LOGIN_FAILED_MESSAGE}), 401

    # Successful login — reset lockout counters and upgrade legacy hash if needed
    user.failed_login_attempts = 0
    user.lockout_until = None

    # Online ordering was retired: the system is for staff only, and customer
    # accounts made for ordering can no longer sign in (their records are kept)
    if is_customer_account(user):
        db.session.commit()
        return jsonify({'status': 'error', 'message': CUSTOMER_LOGIN_RETIRED_MESSAGE}), 403

    # Ends any other session this user has (one login at a time) and commits
    token = create_session(user)
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
    UserSession.query.filter_by(token_hash=_token_hash(token)).delete(synchronize_session=False)
    db.session.commit()
    _session_cache.pop(token, None)
    log_action(request.current_user['id'], request.current_user['fullName'], 'LOGOUT', 'Auth', 'User logged out', request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'message': 'Logged out successfully'})

@app.route('/api/auth/me', methods=['GET'])
@require_auth
def get_current_user():
    # The same details login returns (branch included), so a page reload or the
    # periodic permission refresh doesn't lose the user's branch
    return jsonify({'status': 'success', 'data': request.current_user})

# ============================================
# EMAIL + PASSWORD RESET CODES
# ============================================

# Email goes out through Brevo's HTTP API, since Render's free tier blocks SMTP.
BREVO_API_KEY = os.getenv('BREVO_API_KEY', '')
MAIL_SENDER_EMAIL = os.getenv('MAIL_SENDER_EMAIL', '')
MAIL_SENDER_NAME = os.getenv('MAIL_SENDER_NAME', 'Seatmakers Avenue')

RESET_CODE_TTL = timedelta(minutes=10)
RESET_CODE_MAX_ATTEMPTS = 5
RESET_CODE_RESEND_SECONDS = 60
RESET_CODE_MAX_PER_HOUR = 5
MIN_PASSWORD_LENGTH = 8
EMAIL_PATTERN = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

def send_email(to_email, to_name, subject, text, html):
    """Send one email through Brevo. Returns True on success.

    Without BREVO_API_KEY / MAIL_SENDER_EMAIL nothing is sent and the message
    is printed to the server log instead, which is how it works locally."""
    if not BREVO_API_KEY or not MAIL_SENDER_EMAIL:
        print(f"[email] Brevo not configured, not sent. To: {to_email} | {subject}\n{text}", flush=True)
        return False
    payload = json.dumps({
        'sender': {'name': MAIL_SENDER_NAME, 'email': MAIL_SENDER_EMAIL},
        'to': [{'email': to_email, 'name': to_name or to_email}],
        'subject': subject,
        'textContent': text,
        'htmlContent': html,
    }).encode('utf-8')
    req = urllib.request.Request(
        'https://api.brevo.com/v3/smtp/email', data=payload, method='POST',
        headers={'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as e:
        print(f"[email] Brevo rejected the message to {to_email}: {e.code} {e.read().decode('utf-8', 'replace')[:300]}", flush=True)
    except Exception as e:
        print(f"[email] Sending to {to_email} failed: {e}", flush=True)
    return False

def _reset_code_hash(user_id, code):
    return hashlib.sha256(f"{user_id}:{code}".encode()).hexdigest()

def _active_user_by_email(email):
    """An active staff account with this email. Retired customer accounts can't
    sign in, so they get no reset codes either."""
    user = User.query.filter(db.func.lower(User.email) == email.lower(), User.is_active == True).first()
    return None if user is None or is_customer_account(user) else user

@app.route('/api/auth/recover', methods=['POST'])
def recover_account():
    """Forgot password, step 1: email a 6-digit code to a registered, active account."""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    if not email:
        return jsonify({'status': 'error', 'message': 'Email is required'}), 400
    if not EMAIL_PATTERN.match(email):
        return jsonify({'status': 'error', 'message': 'Please enter a valid email address.'}), 400

    # The same answer whether or not an account uses this email (and whether or
    # not a code was actually sent), so nobody can use this form to find out
    # which emails have accounts
    generic = jsonify({'status': 'success', 'message': 'If an account uses this email, a 6-digit code has been sent '
                                                       'to it. Please check your inbox and spam folder.'})
    user = _active_user_by_email(email)
    if not user:
        return generic

    now = datetime.utcnow()
    PasswordResetCode.query.filter(PasswordResetCode.created_at < now - timedelta(days=1)).delete(synchronize_session=False)
    recent = (PasswordResetCode.query
              .filter(PasswordResetCode.user_id == user.id,
                      PasswordResetCode.created_at > now - timedelta(hours=1))
              .order_by(PasswordResetCode.created_at.desc()).all())
    db.session.commit()
    if len(recent) >= RESET_CODE_MAX_PER_HOUR:
        return generic  # limit reached: no new code is sent
    if recent and (now - recent[0].created_at).total_seconds() < RESET_CODE_RESEND_SECONDS:
        # The last code is still on its way and still valid, so carry on to the code step
        return generic

    # Only the newest code works
    PasswordResetCode.query.filter_by(user_id=user.id, used_at=None).update({'used_at': now}, synchronize_session=False)
    code = f"{secrets.randbelow(10**6):06d}"
    db.session.add(PasswordResetCode(user_id=user.id, code_hash=_reset_code_hash(user.id, code),
                                     created_at=now, expires_at=now + RESET_CODE_TTL))
    db.session.commit()
    log_action(user.id, user.full_name, 'PASSWORD_RESET_REQUESTED', 'Auth', 'Password reset code requested',
               request.remote_addr or '0.0.0.0')

    minutes = int(RESET_CODE_TTL.total_seconds() // 60)
    subject = f"{code} is your Seatmakers Avenue password reset code"
    text = (f"Hi {user.full_name},\n\nYour password reset code is: {code}\n\n"
            f"It expires in {minutes} minutes. If you did not ask to reset your password, "
            f"you can ignore this email.\n\nSeatmakers Avenue")
    html = (f"<p>Hi {escape(user.full_name)},</p>"
            f"<p>Your password reset code is:</p>"
            f"<p style=\"font-size:28px;font-weight:bold;letter-spacing:6px;color:#011c72\">{code}</p>"
            f"<p>It expires in {minutes} minutes. If you did not ask to reset your password, "
            f"you can ignore this email.</p><p>Seatmakers Avenue</p>")
    # Sent in the background so the reply doesn't wait on the email send
    threading.Thread(target=send_email, args=(user.email, user.full_name, subject, text, html), daemon=True).start()
    return generic

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    """Forgot password, step 2: check the emailed code and set the new password."""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    code = (data.get('code') or '').strip()
    new_password = data.get('newPassword') or ''
    if not email or not code or not new_password:
        return jsonify({'status': 'error', 'message': 'Email, code and new password are required'}), 400
    if len(new_password) < MIN_PASSWORD_LENGTH:
        return jsonify({'status': 'error',
                        'message': f'Password must be at least {MIN_PASSWORD_LENGTH} characters'}), 400

    invalid = jsonify({'status': 'error', 'message': 'This code is invalid or has expired. Request a new one.'}), 400
    user = _active_user_by_email(email)
    if not user:
        return invalid
    now = datetime.utcnow()
    rc = (PasswordResetCode.query
          .filter(PasswordResetCode.user_id == user.id, PasswordResetCode.used_at.is_(None),
                  PasswordResetCode.expires_at > now)
          .order_by(PasswordResetCode.created_at.desc()).first())
    if not rc:
        return invalid

    if not hmac.compare_digest(rc.code_hash, _reset_code_hash(user.id, code)):
        rc.attempts = (rc.attempts or 0) + 1
        left = RESET_CODE_MAX_ATTEMPTS - rc.attempts
        if left <= 0:
            rc.used_at = now
        db.session.commit()
        message = (f'Incorrect code. {left} attempt(s) left.' if left > 0
                   else 'Too many incorrect attempts. Request a new code.')
        return jsonify({'status': 'error', 'message': message}), 400

    rc.used_at = now
    user.password = hash_password(new_password)
    user.failed_login_attempts = 0
    user.lockout_until = None
    end_user_sessions(user.id)  # sign out anyone using the old password
    db.session.commit()
    log_action(user.id, user.full_name, 'PASSWORD_RESET', 'Auth', 'Password reset with emailed code',
               request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'message': 'Your password has been changed. You can now sign in.'})

# ============================================
# MY PROFILE (every signed-in user edits their own account)
# ============================================

USERNAME_PATTERN = re.compile(r'^[A-Za-z0-9_.-]{3,50}$')
PHONE_PATTERN = re.compile(r'^\+?[0-9][0-9 -]{6,19}$')
EMAIL_CHANGE_CODE_TTL = timedelta(minutes=10)

def refresh_cached_user(user):
    """Push a user's new details into the session cache so the change shows at once."""
    resolved, now_ts = user_to_dict(user), time.time()
    for t, (u, _, version) in list(_session_cache.items()):
        if u['id'] == user.id:
            _session_cache[t] = (resolved, now_ts, version)

def check_current_password(user, raw_password):
    """None if raw_password is the user's password, else an error response.

    Wrong guesses count toward the same lockout as the login form, so a
    signed-in session can't be used to guess the password."""
    now = datetime.utcnow()
    if user.lockout_until and user.lockout_until > now:
        minutes = int((user.lockout_until - now).total_seconds() // 60) + 1
        return jsonify({'status': 'error',
                        'message': f'Too many incorrect attempts. Try again in {minutes} minute(s).'}), 429
    if not raw_password or not verify_password(user, raw_password):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            user.lockout_until = now + timedelta(minutes=LOCKOUT_MINUTES)
        db.session.commit()
        return jsonify({'status': 'error', 'message': 'Current password is incorrect.'}), 400
    user.failed_login_attempts = 0
    return None

def _email_taken(email, exclude_user_id):
    return User.query.filter(db.func.lower(User.email) == email.lower(), User.id != exclude_user_id).first() is not None

@app.route('/api/profile', methods=['GET'])
@require_auth
def get_my_profile():
    user = User.query.get(request.current_user['id'])
    return jsonify({'status': 'success', 'data': user_to_dict(user)})

@app.route('/api/profile', methods=['PUT'])
@require_auth
def update_my_profile():
    """Update your own name, phone and username. A new username needs the current password."""
    user = User.query.get(request.current_user['id'])
    data = request.get_json(silent=True) or {}
    changes = []

    full_name = (data.get('fullName') if 'fullName' in data else user.full_name) or ''
    full_name = full_name.strip()
    if not full_name or len(full_name) > 255:
        return jsonify({'status': 'error', 'message': 'Full name is required (up to 255 characters).'}), 400

    phone = (data.get('phone') if 'phone' in data else user.phone) or ''
    phone = phone.strip()
    if phone and not PHONE_PATTERN.match(phone):
        return jsonify({'status': 'error', 'message': 'Enter a valid phone number, e.g. 09171234567.'}), 400

    username = ((data.get('username') if 'username' in data else user.username) or '').strip()
    if username != user.username:
        if not USERNAME_PATTERN.match(username):
            return jsonify({'status': 'error',
                            'message': 'Username must be 3 to 50 characters: letters, numbers, dots, dashes or underscores.'}), 400
        if User.query.filter(db.func.lower(User.username) == username.lower(), User.id != user.id).first():
            return jsonify({'status': 'error', 'message': 'That username is already taken.'}), 400
        error = check_current_password(user, data.get('currentPassword'))
        if error:
            return error
        user.username = username
        changes.append('username')

    if full_name != user.full_name:
        user.full_name = full_name
        changes.append('name')
    if (phone or None) != user.phone:
        user.phone = phone or None
        changes.append('phone')

    db.session.commit()
    if changes:
        refresh_cached_user(user)
        log_action(user.id, user.full_name, 'UPDATE', 'Profile', 'Updated own ' + ', '.join(changes),
                   request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': user_to_dict(user),
                    'message': 'Profile saved.' if changes else 'Nothing to change.'})

@app.route('/api/profile/password', methods=['POST'])
@require_auth
def change_my_password():
    """Change your own password. Other devices are signed out; this one gets a fresh token."""
    user = User.query.get(request.current_user['id'])
    data = request.get_json(silent=True) or {}
    new_password = data.get('newPassword') or ''
    if len(new_password) < MIN_PASSWORD_LENGTH:
        return jsonify({'status': 'error',
                        'message': f'New password must be at least {MIN_PASSWORD_LENGTH} characters.'}), 400
    error = check_current_password(user, data.get('currentPassword'))
    if error:
        return error
    if verify_password(user, new_password):
        return jsonify({'status': 'error', 'message': 'New password must be different from the current one.'}), 400

    user.password = hash_password(new_password)
    token = create_session(user)  # ends every other session and commits
    log_action(user.id, user.full_name, 'PASSWORD_CHANGE', 'Profile', 'Changed own password',
               request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': {'token': token},
                    'message': 'Password changed. Other devices have been signed out.'})

@app.route('/api/profile/email/request', methods=['POST'])
@require_auth
def request_email_change():
    """Changing your email, step 1: send a code to the new address to prove it's yours."""
    user = User.query.get(request.current_user['id'])
    data = request.get_json(silent=True) or {}
    new_email = (data.get('newEmail') or '').strip()
    if not EMAIL_PATTERN.match(new_email):
        return jsonify({'status': 'error', 'message': 'Please enter a valid email address.'}), 400
    if new_email.lower() == (user.email or '').lower():
        return jsonify({'status': 'error', 'message': 'That is already your email address.'}), 400
    if _email_taken(new_email, user.id):
        return jsonify({'status': 'error', 'message': 'That email is already used by another account.'}), 400
    error = check_current_password(user, data.get('currentPassword'))
    if error:
        return error

    now = datetime.utcnow()
    EmailChangeCode.query.filter(EmailChangeCode.created_at < now - timedelta(days=1)).delete(synchronize_session=False)
    recent = (EmailChangeCode.query
              .filter(EmailChangeCode.user_id == user.id, EmailChangeCode.created_at > now - timedelta(hours=1))
              .order_by(EmailChangeCode.created_at.desc()).all())
    db.session.commit()
    if len(recent) >= RESET_CODE_MAX_PER_HOUR:
        return jsonify({'status': 'error', 'message': 'Too many code requests. Please try again in an hour.'}), 429
    if (recent and recent[0].new_email.lower() == new_email.lower()
            and (now - recent[0].created_at).total_seconds() < RESET_CODE_RESEND_SECONDS):
        return jsonify({'status': 'success',
                        'message': f'A code was sent to {new_email} less than a minute ago. Please check your inbox and spam folder.'})

    # Only the newest code works
    EmailChangeCode.query.filter_by(user_id=user.id, used_at=None).update({'used_at': now}, synchronize_session=False)
    code = f"{secrets.randbelow(10**6):06d}"
    db.session.add(EmailChangeCode(user_id=user.id, new_email=new_email, code_hash=_reset_code_hash(user.id, code),
                                   created_at=now, expires_at=now + EMAIL_CHANGE_CODE_TTL))
    db.session.commit()

    minutes = int(EMAIL_CHANGE_CODE_TTL.total_seconds() // 60)
    subject = f"{code} is your Seatmakers Avenue email verification code"
    text = (f"Hi {user.full_name},\n\nUse this code to confirm your new email address: {code}\n\n"
            f"It expires in {minutes} minutes. If you did not ask for this, you can ignore this email.\n\n"
            f"Seatmakers Avenue")
    html = (f"<p>Hi {escape(user.full_name)},</p>"
            f"<p>Use this code to confirm your new email address:</p>"
            f"<p style=\"font-size:28px;font-weight:bold;letter-spacing:6px;color:#011c72\">{code}</p>"
            f"<p>It expires in {minutes} minutes. If you did not ask for this, you can ignore this email.</p>"
            f"<p>Seatmakers Avenue</p>")
    threading.Thread(target=send_email, args=(new_email, user.full_name, subject, text, html), daemon=True).start()
    return jsonify({'status': 'success', 'message': f'A 6-digit code has been sent to {new_email}.'})

@app.route('/api/profile/email/confirm', methods=['POST'])
@require_auth
def confirm_email_change():
    """Changing your email, step 2: check the code and switch the account to the new address."""
    user = User.query.get(request.current_user['id'])
    code = ((request.get_json(silent=True) or {}).get('code') or '').strip()
    now = datetime.utcnow()
    rc = (EmailChangeCode.query
          .filter(EmailChangeCode.user_id == user.id, EmailChangeCode.used_at.is_(None),
                  EmailChangeCode.expires_at > now)
          .order_by(EmailChangeCode.created_at.desc()).first())
    if not rc:
        return jsonify({'status': 'error', 'message': 'This code is invalid or has expired. Request a new one.'}), 400

    if not hmac.compare_digest(rc.code_hash, _reset_code_hash(user.id, code)):
        rc.attempts = (rc.attempts or 0) + 1
        left = RESET_CODE_MAX_ATTEMPTS - rc.attempts
        if left <= 0:
            rc.used_at = now
        db.session.commit()
        message = (f'Incorrect code. {left} attempt(s) left.' if left > 0
                   else 'Too many incorrect attempts. Request a new code.')
        return jsonify({'status': 'error', 'message': message}), 400

    rc.used_at = now
    if _email_taken(rc.new_email, user.id):
        db.session.commit()
        return jsonify({'status': 'error', 'message': 'That email is already used by another account.'}), 400
    old_email = user.email
    user.email = rc.new_email
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': 'That email is already used by another account.'}), 400
    refresh_cached_user(user)
    log_action(user.id, user.full_name, 'UPDATE', 'Profile', 'Changed own email',
               request.remote_addr or '0.0.0.0')

    # Let the old address know, in case the change wasn't made by its owner
    notice = (f"Hi {user.full_name},\n\nThe email on your Seatmakers Avenue account was changed to "
              f"{user.email}. If you did not do this, contact the shop right away.\n\nSeatmakers Avenue")
    notice_html = (f"<p>Hi {escape(user.full_name)},</p><p>The email on your Seatmakers Avenue account was "
                   f"changed to <b>{escape(user.email)}</b>. If you did not do this, contact the shop right away.</p>"
                   f"<p>Seatmakers Avenue</p>")
    threading.Thread(target=send_email, args=(old_email, user.full_name, 'Your account email was changed',
                                              notice, notice_html), daemon=True).start()
    return jsonify({'status': 'success', 'data': user_to_dict(user), 'message': 'Your email has been changed.'})

# ============================================
# DASHBOARD ROUTES
# ============================================

STAFF_ROLES = ('administrator', 'supervisor', 'sales_manager')

# Finished work: a delivered order was completed first, so it counts as earned too
EARNED_STATUSES = ('completed', 'delivered')

DASHBOARD_PERIODS = ('today', 'week', 'month', 'year', 'all')

def dashboard_period():
    """(key, start, end) for ?period=today|week|month|year|all, Philippine dates.
    'all' (the default, as before) starts from the first recorded sale."""
    key = request.args.get('period') or 'all'
    if key not in DASHBOARD_PERIODS:
        key = 'all'
    today = manila_today()
    start = {
        'today': today,
        'week': today - timedelta(days=today.weekday()),  # since Monday
        'month': today.replace(day=1),
        'year': today.replace(month=1, day=1),
        'all': date_cls(2000, 1, 1),
    }[key]
    return key, start, today

def dashboard_scope():
    """Branch the dashboard is limited to: (branch_id or None for all, error response).

    Administrators see the whole company and may pick one branch with
    ?branchId=; everyone else only ever sees their own branch."""
    user = request.current_user
    if all_branches(user):
        raw = request.args.get('branchId')
        if not raw:
            return None, None
        try:
            branch = Branch.query.get(int(raw))
        except ValueError:
            branch = None
        if not branch:
            return None, (jsonify({'status': 'error', 'message': 'Unknown branch'}), 400)
        return branch.id, None
    # A non-admin with no branch sees nothing rather than everything
    return (user_branch_id(user) or -1), None


@app.route('/api/dashboard/stats', methods=['GET'])
@require_auth
@require_permission('dashboard.view')
def get_dashboard_stats():
    user = request.current_user
    bid, err = dashboard_scope()
    if err:
        return err

    def scoped(query, column):
        return query.filter(column == bid) if bid is not None else query

    # Orders that were voided or cancelled are excluded from totals and revenue —
    # they represent work that never happened — and drafts aren't real orders yet.
    DEAD_STATUSES = ('voided', 'cancelled', 'draft')
    live_orders = scoped(JobOrder.query.filter(~JobOrder.status.in_(DEAD_STATUSES)), JobOrder.branch_id)

    total_job_orders = live_orders.count()
    pending_orders = live_orders.filter(JobOrder.status == 'pending').count()
    in_progress_orders = live_orders.filter(JobOrder.status == 'in_progress').count()

    # Sales for the chosen period: finished job orders and completed premade
    # sales, without VAT, with their cost of goods -- the same figures as the
    # Owner P&L (owner_financials)
    period_key, period_start, period_end = dashboard_period()
    f = owner_financials(period_start, period_end, bid)
    total_revenue = float(f['sales'])
    total_cost = float(f['cogs']['total'])
    profit = float(f['grossProfit'])
    completed_orders = f['orderCounts']['jobOrders']

    low_stock_count = scoped(InventoryMaterial.query.filter(
        InventoryMaterial.is_archived.is_(False),
        low_stock_condition(global_low_stock_threshold()),
    ), InventoryMaterial.branch_id).count()

    deliveries_q = Delivery.query.filter(Delivery.status.in_(('scheduled', 'in_transit')))
    if bid is not None:
        deliveries_q = deliveries_q.filter(db.or_(Delivery.from_branch_id == bid, Delivery.to_branch_id == bid))

    scope_branch = Branch.query.get(bid) if bid not in (None, -1) else None
    stats = {
        'totalJobOrders': total_job_orders,
        'pendingOrders': pending_orders,
        'inProgressOrders': in_progress_orders,
        'completedOrders': completed_orders,
        'totalRevenue': total_revenue,
        'jobOrderRevenue': float(f['jobSales']),
        'premadeRevenue': float(f['premadeSales']),
        'completedPremadeOrders': f['orderCounts']['premadeOrders'],
        'totalCost': total_cost,
        'profit': profit,
        'period': {'key': period_key, 'startDate': period_start.isoformat(), 'endDate': period_end.isoformat()},
        'profitMargin': round((profit / total_revenue * 100), 2) if total_revenue > 0 else 0,
        'lowStockItems': low_stock_count,
        'pendingDeliveries': deliveries_q.count(),
        'totalRawMaterials': scoped(InventoryMaterial.query.filter_by(is_archived=False), InventoryMaterial.branch_id).count(),
        'totalFinishedGoods': scoped(PremadeProduct.query.filter_by(is_archived=False), PremadeProduct.branch_id).count(),
        # Which branch these figures cover (None = whole company)
        'scopeBranchId': scope_branch.id if scope_branch else None,
        'scopeBranchName': scope_branch.name if scope_branch else None,
    }

    if all_branches(user):
        stats['totalUsers'] = User.query.filter_by(is_active=True).count()
        stats['totalBranches'] = Branch.query.filter_by(is_active=True).count()

    return jsonify({'status': 'success', 'data': stats})

@app.route('/api/dashboard/recent-activity', methods=['GET'])
@require_auth
@require_permission('dashboard.view')
def get_recent_activity():
    bid, err = dashboard_scope()
    if err:
        return err
    activities = []

    orders_q = JobOrder.query.filter(JobOrder.status != 'draft')
    if bid is not None:
        orders_q = orders_q.filter(JobOrder.branch_id == bid)
    # `id` and `reference` let the dashboard link each row to its own record.
    for jo in orders_q.order_by(JobOrder.updated_at.desc()).limit(5).all():
        activities.append({
            'type': 'job_order',
            'id': jo.id,
            'reference': jo.job_order_id,
            'title': f"Job Order {jo.job_order_id}",
            'description': f"{jo.customer_name} - {(jo.status or '').replace('_', ' ').title()}",
            'timestamp': fmt_dt(jo.updated_at) or '',
            'status': jo.status,
        })

    deliveries_q = Delivery.query
    if bid is not None:
        deliveries_q = deliveries_q.filter(db.or_(Delivery.from_branch_id == bid, Delivery.to_branch_id == bid))
    for d in deliveries_q.order_by(Delivery.created_at.desc()).limit(5).all():
        activities.append({
            'type': 'delivery',
            'id': d.id,
            'reference': d.delivery_number,
            'title': f"Delivery {d.delivery_number}",
            'description': f"To {(d.to_branch.name if d.to_branch else None) or d.customer_name} - {(d.status or '').replace('_', ' ').title()}",
            'timestamp': fmt_dt(d.created_at) or '',
            'status': d.status,
        })

    activities.sort(key=lambda x: x['timestamp'], reverse=True)

    return jsonify({'status': 'success', 'data': activities[:10]})

@app.route('/api/dashboard/alerts', methods=['GET'])
@require_auth
@require_permission('dashboard.view')
def get_alerts():
    bid, err = dashboard_scope()
    if err:
        return err
    alerts = []

    global_threshold = global_low_stock_threshold()
    low_stock_q = InventoryMaterial.query.filter(
        InventoryMaterial.is_archived.is_(False),
        low_stock_condition(global_threshold),
    )
    if bid is not None:
        low_stock_q = low_stock_q.filter(InventoryMaterial.branch_id == bid)
    for material in low_stock_q.order_by(InventoryMaterial.stock_quantity.asc()).limit(20).all():
        name = ' '.join(filter(None, [material.material_type, material.color])).strip()
        threshold = effective_reorder_level(material, global_threshold)
        alerts.append({
            'type': 'low_stock',
            'severity': 'warning' if (material.stock_quantity or 0) > 0 else 'critical',
            'title': f"Low Stock: {name}",
            'description': f"Current: {float(material.stock_quantity or 0)} (Reorder at: {threshold})",
            'itemId': material.id,
            # Lets the dashboard deep-link straight to this material in inventory.
            'itemName': material.material_type or name,
        })

    today_str = datetime.now().strftime('%Y-%m-%d')
    due_q = Delivery.query.filter(Delivery.status == 'scheduled', Delivery.scheduled_date <= today_str)
    if bid is not None:
        due_q = due_q.filter(db.or_(Delivery.from_branch_id == bid, Delivery.to_branch_id == bid))
    for d in due_q.all():
        alerts.append({
            'type': 'delivery_due',
            'severity': 'info',
            'title': f"Delivery Due: {d.delivery_number}",
            'description': f"Scheduled for {d.scheduled_date}",
            'itemId': d.id,
        })

    # Finished, dead and draft orders can't be overdue
    overdue_q = JobOrder.query.filter(
        ~JobOrder.status.in_(('completed', 'delivered', 'cancelled', 'voided', 'draft')),
        JobOrder.estimated_completion < datetime.now().date())
    if bid is not None:
        overdue_q = overdue_q.filter(JobOrder.branch_id == bid)
    for jo in overdue_q.order_by(JobOrder.estimated_completion.asc()).limit(20).all():
        alerts.append({
            'type': 'overdue_order',
            'severity': 'warning',
            'title': f"Overdue: {jo.job_order_id}",
            'description': f"Was due on {jo.estimated_completion}",
            'itemId': jo.id,
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
        'branchName': material.branch.name if material.branch else None,
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

def global_low_stock_threshold():
    """The reorder level set in Settings, used for materials without their own."""
    setting = SystemSetting.query.filter_by(key='inventory_low_stock_threshold').first()
    try:
        return max(float(setting.value), 0.0) if setting and setting.value else 0.0
    except ValueError:
        return 0.0

def low_stock_state(material, global_threshold):
    """'out' (nothing left), 'low' (at or below its reorder level: its own, else
    the one in Settings) or None. The one definition every screen uses."""
    stock = float(material.stock_quantity or 0)
    if stock <= 0:
        return 'out'
    threshold = float(material.low_stock_threshold or 0) or global_threshold
    return 'low' if threshold > 0 and stock <= threshold else None

def effective_reorder_level(material, global_threshold):
    return float(material.low_stock_threshold or 0) or global_threshold

def low_stock_condition(global_threshold):
    """low_stock_state as a database filter (out or low)."""
    own = db.func.coalesce(InventoryMaterial.low_stock_threshold, 0)
    cond = db.or_(InventoryMaterial.stock_quantity <= 0,
                  db.and_(own > 0, InventoryMaterial.stock_quantity <= own))
    if global_threshold > 0:
        cond = db.or_(cond, db.and_(own <= 0, InventoryMaterial.stock_quantity <= global_threshold))
    return cond

# ── Who sees which branch's inventory ─────────────────────────────────────────
# Administrators, owners, supervisors and warehouse accounts see every branch;
# everyone else only their own (plus the warehouse's raw materials, which their
# job orders draw from). Changing stock stays limited by inventory_branch_error.

def sees_all_inventory(user):
    return all_inventory_branches(user) or user.get('role') == 'supervisor'

def inventory_read_branches(user, requested=None, include_warehouse=False):
    """Branch ids a list may show: None = every branch. Returns (ids, error)."""
    try:
        requested = int(requested) if requested not in (None, '') else None
    except (TypeError, ValueError):
        return None, (jsonify({'status': 'error', 'message': 'Invalid branch'}), 400)
    warehouse = get_warehouse_branch()
    if sees_all_inventory(user):
        if requested is None:
            return None, None
        ids = {requested}
        if include_warehouse and warehouse:
            ids.add(warehouse.id)
        return ids, None
    own = user_branch_id(user)
    allowed = {own} if own else set()
    if include_warehouse and warehouse and own:
        allowed.add(warehouse.id)
    if requested is not None:
        if requested not in allowed:
            return None, (jsonify({'status': 'error', 'message': "You can only view your own branch's inventory"}), 403)
        ids = {requested}
        if include_warehouse and warehouse:
            ids.add(warehouse.id)
        return ids & allowed, None
    return allowed, None

def get_warehouse_branch():
    """The branch that holds produced stock before it is handed to a shop."""
    return Branch.query.filter_by(is_warehouse=True, is_active=True).first() \
        or Branch.query.filter_by(is_warehouse=True).first()

def premade_pending_outgoing(product_id):
    """Quantity of this row already promised to branches but not yet received."""
    total = db.session.query(
        db.func.coalesce(db.func.sum(PremadeStockTransfer.quantity), 0.0)
    ).filter(
        PremadeStockTransfer.product_id == product_id,
        PremadeStockTransfer.status == 'pending',
    ).scalar()
    return float(total or 0)

def premade_available_quantity(product):
    """What this row can still promise: on hand minus everything pending.

    Pending transfers don't deduct stock until they're confirmed, so without
    this the same units could be handed to several branches at once.
    """
    return float(product.quantity or 0) - premade_pending_outgoing(product.id)

def premade_product_to_dict(product):
    pending = premade_pending_outgoing(product.id)
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
        'isWarehouse': bool(product.branch.is_warehouse) if product.branch else False,
        # Units already promised to branches, and what is left to give out.
        'pendingOutgoing': pending,
        'availableQuantity': float(product.quantity or 0) - pending,
        'isArchived': product.is_archived,
        'lastUpdated': product.updated_at.strftime('%Y-%m-%d') if product.updated_at else None
    }

def premade_transfer_to_dict(transfer):
    product = transfer.product
    return {
        'id': transfer.id,
        'productId': transfer.product_id,
        'productName': product.name if product else None,
        'sku': product.sku if product else None,
        'unit': product.unit if product else 'pcs',
        'sourceBranchId': transfer.source_branch_id,
        'sourceBranchName': transfer.source_branch.name if transfer.source_branch else None,
        'destinationBranchId': transfer.destination_branch_id,
        'destinationBranchName': transfer.destination_branch.name if transfer.destination_branch else None,
        'quantity': float(transfer.quantity),
        'status': transfer.status,
        'batchId': transfer.batch_id,
        'notes': transfer.notes or '',
        'createdById': transfer.created_by_id,
        'createdByName': transfer.created_by.full_name if transfer.created_by else None,
        'createdAt': fmt_dt(transfer.created_at),
        'resolvedById': transfer.resolved_by_id,
        'resolvedByName': transfer.resolved_by.full_name if transfer.resolved_by else None,
        'resolvedAt': fmt_dt(transfer.resolved_at),
    }

def can_resolve_premade_transfer(user, transfer):
    """Anyone who sees every branch or distributes premade stock may act on any
    delivery; others only on deliveries addressed to their own branch."""
    if has_perm(user, 'branches.all', 'premade.distribute'):
        return True
    return has_perm(user, 'premade.receive') and user.get('branchId') == transfer.destination_branch_id

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

# ============================================
# VEHICLE REFERENCE DATA (makes / models)
# ============================================
# Served entirely from the local vehicle_makes / vehicle_models tables, which
# are populated once by seed_vehicles.py. This keeps the make/model dropdowns
# fast and independent of any external car-data API at runtime.

@app.route('/api/vehicles/makes', methods=['GET'])
@require_auth
def get_vehicle_makes():
    makes = (VehicleMake.query
             .filter_by(is_active=True)
             .order_by(VehicleMake.name.asc())
             .all())
    return jsonify({'status': 'success', 'data': [m.name for m in makes]})


@app.route('/api/vehicles/models', methods=['GET'])
@require_auth
def get_vehicle_models():
    make_name = (request.args.get('make') or '').strip()
    if not make_name:
        return jsonify({'status': 'success', 'data': []})

    make = VehicleMake.query.filter(
        db.func.lower(VehicleMake.name) == make_name.lower()
    ).first()
    if not make:
        return jsonify({'status': 'success', 'data': []})

    models = (VehicleModel.query
              .filter_by(make_id=make.id, is_active=True)
              .order_by(VehicleModel.name.asc())
              .all())
    return jsonify({'status': 'success', 'data': [m.name for m in models]})


@app.route('/api/inventory/raw-materials', methods=['GET'])
@require_auth
@require_permission('inventory.view', 'sales.add', 'sales.edit', 'purchase_orders.add')
def get_raw_materials():
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'
    branch_id = request.args.get('branchId')
    include_warehouse = request.args.get('includeWarehouse', 'false').lower() == 'true'
    category = request.args.get('category')

    from sqlalchemy.orm import joinedload
    # Eager-load branch + supplier so the serializer doesn't fire an extra query
    # per row (N+1) — one JOIN instead of ~2×N round-trips to the database.
    query = InventoryMaterial.query.options(
        joinedload(InventoryMaterial.branch),
        joinedload(InventoryMaterial.supplier),
    )
    if not include_archived:
        query = query.filter_by(is_archived=False)
    branch_ids, error = inventory_read_branches(request.current_user, branch_id, include_warehouse)
    if error:
        return error
    if branch_ids is not None:
        query = query.filter(InventoryMaterial.branch_id.in_(branch_ids or [-1]))
    if category:
        query = query.filter_by(category=category)

    items = query.order_by(InventoryMaterial.material_type.asc()).all()
    return jsonify({'status': 'success', 'data': [material_to_dict(m) for m in items]})

@app.route('/api/inventory/raw-materials/summary', methods=['GET'])
@require_auth
@require_permission('inventory.view')
def get_raw_materials_summary():
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'
    include_components = request.args.get('includeComponents', 'false').lower() == 'true'
    branch_id = request.args.get('branchId')
    category = request.args.get('category')

    query = InventoryMaterial.query
    if not include_archived:
        query = query.filter_by(is_archived=False)
    branch_ids, error = inventory_read_branches(request.current_user, branch_id)
    if error:
        return error
    if branch_ids is not None:
        query = query.filter(InventoryMaterial.branch_id.in_(branch_ids or [-1]))
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
@require_permission('inventory.view')
def get_raw_material_group_detail():
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'
    branch_id = request.args.get('branchId')
    group_key = request.args.get('key')

    if not group_key:
        return jsonify({'status': 'error', 'message': 'Group key is required'}), 400

    query = InventoryMaterial.query
    if not include_archived:
        query = query.filter_by(is_archived=False)
    branch_ids, error = inventory_read_branches(request.current_user, branch_id)
    if error:
        return error
    if branch_ids is not None:
        query = query.filter(InventoryMaterial.branch_id.in_(branch_ids or [-1]))

    items = query.order_by(InventoryMaterial.material_type.asc(), InventoryMaterial.created_at.asc()).all()
    group_items = [m for m in items if build_raw_material_group_key(m) == group_key]

    if not group_items:
        return jsonify({'status': 'error', 'message': 'Material group not found'}), 404

    return jsonify({'status': 'success', 'data': raw_material_group_to_dict(group_items, include_components=True)})

@app.route('/api/inventory/raw-materials/<int:material_id>', methods=['GET'])
@require_auth
@require_permission('inventory.view', 'sales.add', 'sales.edit', 'purchase_orders.add')
def get_raw_material(material_id):
    material = InventoryMaterial.query.get(material_id)
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404
    branch_ids, _ = inventory_read_branches(request.current_user, None, include_warehouse=True)
    if branch_ids is not None and material.branch_id not in branch_ids:
        return jsonify({'status': 'error', 'message': "You can only view your own branch's inventory"}), 403
    return jsonify({'status': 'success', 'data': material_to_dict(material)})

@app.route('/api/inventory/raw-materials', methods=['POST'])
@require_auth
@require_permission('inventory.add')
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
    error = inventory_branch_error(request.current_user, branch.id)
    if error:
        return error

    custom_item_id = data.get('itemId', '').strip() if data.get('itemId') else None
    if custom_item_id:
        existing = InventoryMaterial.query.filter_by(item_id=custom_item_id).first()
        if existing:
            return jsonify({'status': 'error', 'message': f'Item ID "{custom_item_id}" already exists'}), 400

    source_job_order_id = data.get('sourceJobOrderId', '').strip() or None
    material_status = data.get('status', 'available').strip()
    if material_status not in ('available', 'needed'):
        material_status = 'available'

    try:
        supplier_id = int(data['supplierId']) if data.get('supplierId') else None
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'Invalid supplier'}), 400

    cost_per_unit = finite_number(data.get('costPerUnit'), 0.0)
    markup_percent = finite_number(data.get('markupPercent'), 25.0)
    stock_quantity = finite_number(data.get('stockQuantity'))
    low_stock_threshold = finite_number(data.get('lowStockThreshold'), 0.0)
    # If a selling price is supplied use it; otherwise derive it from cost + markup
    unit_price = finite_number(data.get('unitPrice'))
    if data.get('unitPrice') not in (None, '') and (unit_price is None or unit_price < 0):
        return jsonify({'status': 'error', 'message': 'Selling price must be a number of zero or more'}), 400
    if cost_per_unit is None or cost_per_unit < 0:
        return jsonify({'status': 'error', 'message': 'Cost must be a number of zero or more'}), 400
    if markup_percent is None or markup_percent < 0:
        return jsonify({'status': 'error', 'message': 'Markup must be a number of zero or more'}), 400
    if stock_quantity is None or stock_quantity < 0:
        return jsonify({'status': 'error', 'message': 'Stock quantity must be a number of zero or more'}), 400
    if low_stock_threshold is None or low_stock_threshold < 0:
        return jsonify({'status': 'error', 'message': 'Reorder level must be a number of zero or more'}), 400
    if unit_price is None:
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
        stock_quantity=stock_quantity,
        low_stock_threshold=low_stock_threshold,
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
@require_permission('inventory.edit')
def update_raw_material(material_id):
    material = InventoryMaterial.query.get(material_id)
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404
    error = inventory_branch_error(request.current_user, material.branch_id)
    if error:
        return error

    data = request.get_json() or {}

    for key, label in (('costPerUnit', 'Cost'), ('markupPercent', 'Markup'), ('unitPrice', 'Selling price'),
                       ('lowStockThreshold', 'Reorder level')):
        if data.get(key) not in (None, ''):
            value = finite_number(data[key])
            if value is None or value < 0:
                return jsonify({'status': 'error', 'message': f'{label} must be a number of zero or more'}), 400

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
        try:
            new_stock = float(data['stockQuantity'])
        except (TypeError, ValueError):
            return jsonify({'status': 'error', 'message': 'Stock quantity must be a number'}), 400
        if not new_stock >= 0:
            return jsonify({'status': 'error', 'message': 'Stock quantity cannot be negative'}), 400
        material.stock_quantity = new_stock
    if 'lowStockThreshold' in data:
        material.low_stock_threshold = float(data['lowStockThreshold'] or 0)
    if 'supplierId' in data:
        material.supplier_id = int(data['supplierId']) if data['supplierId'] else None
    if 'branchId' in data:
        branch = Branch.query.get(data['branchId'])
        if not branch or not branch.is_active:
            return jsonify({'status': 'error', 'message': 'Invalid or inactive branch'}), 400
        error = inventory_branch_error(request.current_user, branch.id)
        if error:
            return error
        material.branch_id = int(data['branchId'])

    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Inventory', f"Updated inventory item: {material.material_type}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': material_to_dict(material)})

@app.route('/api/inventory/raw-materials/<int:material_id>/archive', methods=['POST'])
@require_auth
@require_permission('inventory.delete')
def archive_raw_material(material_id):
    material = InventoryMaterial.query.get(material_id)
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404
    error = inventory_branch_error(request.current_user, material.branch_id)
    if error:
        return error

    material.is_archived = True
    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'ARCHIVE', 'Inventory', f"Archived inventory item: {material.material_type}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'message': 'Material archived'})

@app.route('/api/inventory/raw-materials/<int:material_id>/restore', methods=['POST'])
@require_auth
@require_permission('inventory.delete')
def restore_raw_material(material_id):
    material = InventoryMaterial.query.get(material_id)
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404
    error = inventory_branch_error(request.current_user, material.branch_id)
    if error:
        return error

    material.is_archived = False
    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'RESTORE', 'Inventory', f"Restored inventory item: {material.material_type}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'message': 'Material restored'})

# ============================================
# INVENTORY ROUTES - FINISHED GOODS
# ============================================

@app.route('/api/inventory/finished-goods', methods=['GET'])
@require_auth
@require_permission('premade.view', 'premade.receive', 'sales.add')
def get_finished_goods():
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'
    branch_id = request.args.get('branchId')

    from sqlalchemy.orm import joinedload
    query = PremadeProduct.query.options(joinedload(PremadeProduct.branch))
    if not include_archived:
        query = query.filter_by(is_archived=False)
    branch_ids, error = inventory_read_branches(request.current_user, branch_id)
    if error:
        return error
    if branch_ids is not None:
        query = query.filter(PremadeProduct.branch_id.in_(branch_ids or [-1]))

    # Newest first so stock that was just added is at the top of the list.
    # id is the tie-breaker because rows created in the same second share a timestamp.
    items = query.order_by(
        PremadeProduct.created_at.desc(), PremadeProduct.id.desc()
    ).all()

    return jsonify({'status': 'success', 'data': [premade_product_to_dict(i) for i in items]})

def premade_cost_per_piece(entered, materials_cost, pieces):
    """Production cost of one piece: the materials used for the batch divided by
    the pieces made. A positive cost entered by hand wins; a blank or zero one
    (the inventory screen used to always send 0) does not erase the real cost."""
    try:
        entered = float(entered)
    except (TypeError, ValueError):
        entered = 0.0
    if entered > 0:
        return money(entered)
    return money(materials_cost / pieces) if pieces > 0 else 0.0

@app.route('/api/inventory/finished-goods', methods=['POST'])
@require_auth
@require_permission('premade.add')
def create_finished_good():
    data = request.get_json()

    required = ['name', 'quantity', 'category', 'price', 'branchId', 'materialsUsed']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400

    if not isinstance(data.get('materialsUsed'), list) or len(data.get('materialsUsed')) == 0:
        return jsonify({'status': 'error', 'message': 'Please provide materials used for this premade product'}), 400

    try:
        made_qty, price = float(data['quantity']), float(data['price'])
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'Quantity and price must be numbers'}), 400
    if not made_qty > 0 or not price >= 0:
        return jsonify({'status': 'error', 'message': 'Quantity must be above zero and price cannot be negative'}), 400

    branch = Branch.query.get(data['branchId'])
    if not branch or not branch.is_active:
        return jsonify({'status': 'error', 'message': 'Invalid or inactive branch'}), 400
    error = inventory_branch_error(request.current_user, branch.id)
    if error:
        return error

    # Premade stock is always produced at the warehouse. Choosing a shop branch
    # does not put stock there directly — it raises a delivery that branch must
    # confirm, so nothing appears in a branch's stock unconfirmed.
    warehouse = get_warehouse_branch()
    if not warehouse:
        return jsonify({'status': 'error',
                        'message': 'No warehouse branch is configured. Add one in Settings first.'}), 400

    # Production uses warehouse materials, so only warehouse accounts and
    # administrators add premade stock
    error = inventory_branch_error(request.current_user, warehouse.id)
    if error:
        return error

    production_branch = warehouse
    deliver_to = None if branch.id == warehouse.id else branch

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

        # Materials may be drawn from the warehouse (where production happens)
        # or from the branch the stock is destined for.
        allowed_branch_ids = {warehouse.id, branch.id}
        material = InventoryMaterial.query.filter(
            InventoryMaterial.id == material_id,
            InventoryMaterial.branch_id.in_(allowed_branch_ids),
            InventoryMaterial.is_archived.is_(False)
        ).first()
        if not material:
            return jsonify({'status': 'error', 'message': f'Material not found or unavailable at row {idx + 1}'}), 400

        # The same material on several rows is checked against its stock in total
        needed = quantity_used + sum(e['quantityUsed'] for e in usage_entries if e['material'].id == material.id)
        if float(material.stock_quantity) < needed:
            return jsonify({'status': 'error', 'message': f'Insufficient stock for {material.material_type}. Available: {float(material.stock_quantity)}'}), 400

        usage_entries.append({'material': material, 'quantityUsed': quantity_used})
        # What the materials cost us (not their selling price); materials with no
        # recorded cost fall back to their price
        computed_cost += (float(material.cost_per_unit or 0) or float(material.unit_price or 0)) * quantity_used

    next_id = (db.session.query(db.func.max(PremadeProduct.id)).scalar() or 0) + 1
    product = PremadeProduct(
        name=data['name'].strip(),
        sku=data.get('sku') or f"FG-{next_id:03d}",
        quantity=float(data['quantity']),
        unit='pcs',
        category=data['category'],
        price=float(data['price']),
        cost=premade_cost_per_piece(data.get('cost'), computed_cost, made_qty),
        branch_id=production_branch.id,
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

    # A shop branch was chosen, so hand the stock over as a pending delivery
    # rather than placing it in that branch directly.
    pending_transfer = None
    if deliver_to:
        transfers, error = create_premade_transfers(
            product,
            [{'branchId': deliver_to.id, 'quantity': float(product.quantity)}],
            request.current_user,
            notes=f'Raised automatically when {product.name} was added for {deliver_to.name}.',
        )
        if error:
            payload, code = error
            db.session.rollback()
            return jsonify(payload), code
        pending_transfer = transfers[0]

    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Inventory',
               f"Created finished good: {product.name} at {production_branch.name}"
               + (f" — delivery raised for {deliver_to.name}" if deliver_to else ''),
               request.remote_addr or '0.0.0.0')

    return jsonify({
        'status': 'success',
        'data': premade_product_to_dict(product),
        'pendingTransfer': premade_transfer_to_dict(pending_transfer) if pending_transfer else None,
        'message': (
            f'Added to {production_branch.name}. {float(product.quantity):g} '
            f'{product.unit or "pcs"} awaiting confirmation at {deliver_to.name}.'
            if deliver_to else f'Added to {production_branch.name}.'
        ),
    }), 201

@app.route('/api/inventory/finished-goods/<int:item_id>', methods=['PUT'])
@require_auth
@require_permission('premade.edit')
def update_finished_good(item_id):
    product = PremadeProduct.query.get(item_id)
    if not product:
        return jsonify({'status': 'error', 'message': 'Premade product not found'}), 404
    error = inventory_branch_error(request.current_user, product.branch_id)
    if error:
        return error

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
        # Moving stock to another branch needs access to that branch too
        if branch.id != product.branch_id and inventory_branch_error(request.current_user, branch.id):
            db.session.rollback()
            return jsonify({'status': 'error', 'message': 'You can only keep stock in your own branch. '
                            'Send it to another branch as a delivery instead.'}), 403
        product.branch_id = branch.id

    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Inventory', f"Updated finished good: {product.name}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': premade_product_to_dict(product)})

def resolve_destination_premade_row(source_product, destination_branch):
    """Find (or create) the branch's own row for this product.

    premade_products.sku is globally unique, so a branch cannot reuse the
    warehouse's SKU — the branch code is appended to keep it distinct.
    """
    existing = PremadeProduct.query.filter(
        PremadeProduct.branch_id == destination_branch.id,
        db.func.lower(PremadeProduct.name) == (source_product.name or '').strip().lower(),
        PremadeProduct.is_archived.is_(False),
    ).first()
    if existing:
        return existing

    base_sku = (source_product.sku or f'FG-{source_product.id:03d}').strip()
    code = (destination_branch.code or str(destination_branch.id)).strip()
    candidate = f'{base_sku}-{code}'
    suffix = 2
    while PremadeProduct.query.filter_by(sku=candidate).first():
        candidate = f'{base_sku}-{code}-{suffix}'
        suffix += 1

    row = PremadeProduct(
        name=source_product.name,
        sku=candidate,
        quantity=0,
        unit=source_product.unit or 'pcs',
        category=source_product.category,
        price=float(source_product.price or 0),
        cost=float(source_product.cost or 0),
        branch_id=destination_branch.id,
        is_archived=False,
    )
    db.session.add(row)
    db.session.flush()
    return row

def create_premade_transfers(product, allocations, actor, notes='', batch_id=None):
    """Raise pending transfers for {branchId: quantity} allocations.

    Returns (transfers, None) or (None, (payload, status)). No stock moves here;
    that happens when each transfer is confirmed.
    """
    if not allocations:
        return None, ({'status': 'error', 'message': 'Select at least one branch to give stock to'}, 400)

    available = premade_available_quantity(product)
    requested_total = 0.0
    resolved = []

    for entry in allocations:
        try:
            quantity = float(entry.get('quantity', 0) or 0)
        except (TypeError, ValueError):
            return None, ({'status': 'error', 'message': 'Quantity must be a number'}, 400)
        if quantity <= 0:
            continue

        branch = Branch.query.get(entry.get('branchId'))
        if not branch or not branch.is_active:
            return None, ({'status': 'error', 'message': 'Invalid or inactive destination branch'}, 400)
        if branch.id == product.branch_id:
            return None, ({'status': 'error',
                           'message': f'{branch.name} already holds this stock'}, 400)

        requested_total += quantity
        resolved.append((branch, quantity))

    if not resolved:
        return None, ({'status': 'error', 'message': 'Enter a quantity greater than zero'}, 400)

    # The whole allocation is rejected rather than partially filled, so the
    # warehouse is never left over-promised.
    if requested_total > available:
        return None, ({
            'status': 'error',
            'message': f'Not enough stock. {available:g} {product.unit or "pcs"} available '
                       f'to give out (you asked for {requested_total:g}).',
            'available': available,
            'requested': requested_total,
        }, 400)

    transfers = []
    for branch, quantity in resolved:
        transfer = PremadeStockTransfer(
            product_id=product.id,
            source_branch_id=product.branch_id,
            destination_branch_id=branch.id,
            quantity=quantity,
            status='pending',
            batch_id=batch_id,
            notes=notes or '',
            created_by_id=actor['id'],
        )
        db.session.add(transfer)
        transfers.append(transfer)

        notify_branch_users(
            branch.id,
            'premade_delivery',
            f'Incoming Stock — {product.name}',
            f'{quantity:g} {product.unit or "pcs"} on the way from '
            f'{product.branch.name if product.branch else "the warehouse"}. '
            f'Confirm receipt to add it to your stock.',
            {'productName': product.name, 'quantity': quantity},
        )

    return transfers, None

@app.route('/api/inventory/finished-goods/<int:item_id>/distribute', methods=['POST'])
@require_auth
@require_permission('premade.distribute')
def distribute_finished_good(item_id):
    """Give warehouse stock to one or more branches as pending deliveries.

    Body: {allocations: [{branchId, quantity}], notes?}
       or {toAllBranches: true, quantityPerBranch: N, notes?}
    """
    product = PremadeProduct.query.get(item_id)
    if not product:
        return jsonify({'status': 'error', 'message': 'Premade product not found'}), 404
    error = inventory_branch_error(request.current_user, product.branch_id)
    if error:
        return error
    if product.is_archived:
        return jsonify({'status': 'error', 'message': 'This product is archived'}), 400

    data = request.get_json() or {}
    notes = (data.get('notes') or '').strip()

    if data.get('toAllBranches'):
        try:
            per_branch = float(data.get('quantityPerBranch', 0) or 0)
        except (TypeError, ValueError):
            return jsonify({'status': 'error', 'message': 'Quantity per branch must be a number'}), 400
        if per_branch <= 0:
            return jsonify({'status': 'error', 'message': 'Enter a quantity per branch'}), 400

        targets = Branch.query.filter(
            Branch.is_active.is_(True),
            Branch.is_warehouse.is_(False),
            Branch.id != product.branch_id,
        ).order_by(Branch.name.asc()).all()
        if not targets:
            return jsonify({'status': 'error', 'message': 'There are no active branches to give stock to'}), 400

        allocations = [{'branchId': b.id, 'quantity': per_branch} for b in targets]
    else:
        allocations = data.get('allocations') or []

    batch_id = str(uuid.uuid4()) if len(allocations) > 1 else None
    transfers, error = create_premade_transfers(
        product, allocations, request.current_user, notes=notes, batch_id=batch_id)
    if error:
        payload, code = error
        return jsonify(payload), code

    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Inventory',
               f"Raised {len(transfers)} premade delivery(s) for {product.name}",
               request.remote_addr or '0.0.0.0')

    return jsonify({
        'status': 'success',
        'message': f'{len(transfers)} delivery(s) awaiting confirmation.',
        'data': [premade_transfer_to_dict(t) for t in transfers],
    }), 201

@app.route('/api/inventory/premade-transfers', methods=['GET'])
@require_auth
@require_permission('premade.view', 'premade.receive')
def get_premade_transfers():
    """Premade deliveries. Sales managers only see their own branch."""
    status = request.args.get('status')
    user = request.current_user

    query = PremadeStockTransfer.query
    if status:
        query = query.filter(PremadeStockTransfer.status == status)
    if not has_perm(user, 'branches.all', 'premade.distribute'):
        if not user.get('branchId'):
            return jsonify({'status': 'success', 'data': []})
        query = query.filter(PremadeStockTransfer.destination_branch_id == user['branchId'])

    transfers = query.order_by(PremadeStockTransfer.created_at.desc()).limit(200).all()
    return jsonify({'status': 'success', 'data': [premade_transfer_to_dict(t) for t in transfers]})

@app.route('/api/inventory/premade-transfers/<int:transfer_id>/confirm', methods=['POST'])
@require_auth
@require_permission('premade.receive')
def confirm_premade_transfer(transfer_id):
    """Accept a delivery: only now does stock leave the warehouse and appear
    in the destination branch's own row."""
    # Row lock: a second confirm waits, then sees it already received
    transfer = PremadeStockTransfer.query.filter_by(id=transfer_id).with_for_update().first()
    if not transfer:
        return jsonify({'status': 'error', 'message': 'Delivery not found'}), 404
    if transfer.status != 'pending':
        return jsonify({'status': 'error',
                        'message': f'This delivery was already {transfer.status}'}), 400
    if not can_resolve_premade_transfer(request.current_user, transfer):
        return jsonify({'status': 'error',
                        'message': 'You can only confirm deliveries addressed to your branch'}), 403

    source = transfer.product
    if not source:
        return jsonify({'status': 'error', 'message': 'The source product no longer exists'}), 400

    quantity = float(transfer.quantity)
    # Re-check at confirm time: the warehouse may have sold or used stock since.
    if float(source.quantity or 0) < quantity:
        return jsonify({
            'status': 'error',
            'message': f'The warehouse only has {float(source.quantity or 0):g} '
                       f'{source.unit or "pcs"} left — not enough for this delivery.',
        }), 409

    destination_branch = transfer.destination_branch
    if not destination_branch or not destination_branch.is_active:
        return jsonify({'status': 'error', 'message': 'The destination branch is no longer active'}), 400

    destination_row = resolve_destination_premade_row(source, destination_branch)

    source.quantity = float(source.quantity or 0) - quantity
    source.updated_at = datetime.utcnow()
    destination_row.quantity = float(destination_row.quantity or 0) + quantity
    destination_row.updated_at = datetime.utcnow()

    transfer.status = 'received'
    transfer.resolved_by_id = request.current_user['id']
    transfer.resolved_at = datetime.utcnow()

    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Inventory',
               f"Confirmed {quantity:g} x {source.name} into {destination_branch.name}",
               request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': premade_transfer_to_dict(transfer)})

@app.route('/api/inventory/premade-transfers/<int:transfer_id>/cancel', methods=['POST'])
@require_auth
@require_permission('premade.receive')
def cancel_premade_transfer(transfer_id):
    """Reject a delivery. Nothing moved, so the warehouse simply keeps the stock."""
    transfer = PremadeStockTransfer.query.filter_by(id=transfer_id).with_for_update().first()
    if not transfer:
        return jsonify({'status': 'error', 'message': 'Delivery not found'}), 404
    if transfer.status != 'pending':
        return jsonify({'status': 'error',
                        'message': f'This delivery was already {transfer.status}'}), 400
    if not can_resolve_premade_transfer(request.current_user, transfer):
        return jsonify({'status': 'error',
                        'message': 'You can only act on deliveries addressed to your branch'}), 403

    transfer.status = 'cancelled'
    transfer.resolved_by_id = request.current_user['id']
    transfer.resolved_at = datetime.utcnow()
    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Inventory',
               f"Cancelled premade delivery #{transfer.id}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': premade_transfer_to_dict(transfer)})

@app.route('/api/inventory/material-usage', methods=['GET'])
@require_auth
@require_permission('inventory.view')
def get_material_usage_logs():
    branch_id = request.args.get('branchId')
    material_id = request.args.get('materialId')

    query = MaterialUsageLog.query
    branch_ids, error = inventory_read_branches(request.current_user, branch_id)
    if error:
        return error
    if branch_ids is not None:
        query = query.filter(MaterialUsageLog.branch_id.in_(branch_ids or [-1]))
    if material_id:
        query = query.filter_by(material_id=int(material_id))

    logs = query.order_by(MaterialUsageLog.created_at.desc()).limit(300).all()
    return jsonify({'status': 'success', 'data': [material_usage_to_dict(log) for log in logs]})

@app.route('/api/inventory/categories', methods=['GET'])
@require_auth
@require_staff
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
@require_permission('inventory.view')
def get_low_stock_items():
    branch_ids, error = inventory_read_branches(request.current_user, request.args.get('branchId'))
    if error:
        return error
    query = InventoryMaterial.query.filter(
        InventoryMaterial.is_archived.is_(False),
        low_stock_condition(global_low_stock_threshold()),
    )
    if branch_ids is not None:
        query = query.filter(InventoryMaterial.branch_id.in_(branch_ids or [-1]))
    low_stock = query.order_by(InventoryMaterial.stock_quantity.asc()).all()

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
@require_permission('suppliers.view', 'purchase_orders.add')
def get_suppliers():
    include_inactive = request.args.get('includeInactive', 'false').lower() == 'true'
    query = Supplier.query
    if not include_inactive:
        query = query.filter_by(is_active=True)
    suppliers = query.order_by(Supplier.name.asc()).all()
    return jsonify({'status': 'success', 'data': [supplier_to_dict(s) for s in suppliers]})

@app.route('/api/inventory/suppliers', methods=['POST'])
@require_auth
@require_permission('suppliers.add')
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
@require_permission('suppliers.edit')
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
        'jobOrderId': log.job_order_id,
        'jobOrderNumber': log.job_order.job_order_id if log.job_order else None,
        'workerId': log.managed_worker_id,
        'workerName': log.worker.name if log.worker else None,
        'unitCost': waste_unit_cost(log),
        'value': money(float(log.quantity or 0) * waste_unit_cost(log)),
    }

def waste_unit_cost(log, material=None):
    """Cost per unit of a waste entry: the one saved when it was logged, or for
    entries from before that was saved, the material's current cost."""
    if log.unit_cost is not None:
        return float(log.unit_cost)
    m = material or log.material
    return float((m.cost_per_unit or m.unit_price or 0) if m else 0)

# Job order statuses during which extra material can be issued for it
EXTRA_MATERIAL_STATUSES = ('in_progress', 'completed')

def record_waste(material_id, quantity, reason, notes=None, job_order=None, worker_id=None):
    """Take wasted (or extra) material out of stock and log it.
    Returns (log, None) or (None, error response). The caller commits."""
    try:
        material_id = int(material_id)
    except (TypeError, ValueError):
        return None, (jsonify({'status': 'error', 'message': 'Please choose a material'}), 400)
    try:
        qty = round(float(quantity), 4)
    except (TypeError, ValueError):
        return None, (jsonify({'status': 'error', 'message': 'Quantity must be a number'}), 400)
    if not qty > 0 or qty != qty or qty == float('inf'):
        return None, (jsonify({'status': 'error', 'message': 'Quantity must be more than zero'}), 400)
    reason = (reason or '').strip()
    if not reason:
        return None, (jsonify({'status': 'error', 'message': 'Please give a reason'}), 400)
    # Row lock: two people logging at once can't both take the same stock
    material = InventoryMaterial.query.filter_by(id=material_id).with_for_update().first()
    if not material:
        return None, (jsonify({'status': 'error', 'message': 'Material not found'}), 404)
    error = inventory_branch_error(request.current_user, material.branch_id)
    if error:
        return None, error
    worker = None
    if worker_id not in (None, ''):
        try:
            worker = ManagedWorker.query.get(int(worker_id))
        except (TypeError, ValueError):
            worker = None
        if not worker:
            return None, (jsonify({'status': 'error', 'message': 'Worker not found'}), 404)
    on_hand = float(material.stock_quantity or 0)
    if qty > on_hand:
        return None, (jsonify({'status': 'error',
                               'message': f'Only {on_hand:g} in stock; you cannot take more than what is on hand'}), 400)
    material.stock_quantity = round(on_hand - qty, 4)
    material.updated_at = datetime.now()
    log = MaterialWasteLog(
        material_id=material.id,
        quantity=qty,
        reason=reason[:255],
        notes=(notes or '').strip() or None,
        branch_id=material.branch_id,  # where the stock was, not what the request says
        logged_by=request.current_user['id'],
        job_order_id=job_order.id if job_order else None,
        managed_worker_id=worker.id if worker else None,
        unit_cost=float(material.cost_per_unit or material.unit_price or 0),
    )
    db.session.add(log)
    return log, None

@app.route('/api/inventory/waste-logs', methods=['GET'])
@require_auth
@require_permission('inventory.view')
def get_waste_logs():
    branch_id = request.args.get('branchId')
    query = MaterialWasteLog.query
    branch_ids, error = inventory_read_branches(request.current_user, branch_id)
    if error:
        return error
    if branch_ids is not None:
        query = query.filter(MaterialWasteLog.branch_id.in_(branch_ids or [-1]))
    if request.args.get('jobOrderId'):
        try:
            query = query.filter(MaterialWasteLog.job_order_id == int(request.args['jobOrderId']))
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid job order'}), 400
    logs = query.order_by(MaterialWasteLog.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [waste_log_to_dict(l) for l in logs]})

@app.route('/api/inventory/waste-logs', methods=['POST'])
@require_auth
@require_permission('inventory.log_waste')
def create_waste_log():
    """Waste not tied to a job order (damaged stock and the like). Extra material
    for a job order goes through /api/sales/job-orders/<id>/extra-materials."""
    data = request.get_json(silent=True) or {}
    if not data.get('materialId'):
        return jsonify({'status': 'error', 'message': 'materialId, quantity, and reason are required'}), 400
    log, error = record_waste(data.get('materialId'), data.get('quantity'), data.get('reason'), data.get('notes'))
    if error:
        db.session.rollback()
        return error
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Inventory',
               f"Logged waste: {log.quantity:g} of {log.material.material_type}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': waste_log_to_dict(log)}), 201


@app.route('/api/inventory/waste-logs/<int:log_id>', methods=['DELETE'])
@require_auth
@require_permission('inventory.log_waste')
def undo_waste_log(log_id):
    """Undo a waste entry made by mistake: the quantity goes back into stock (and,
    for extra material on a job order, comes off that job's cost)."""
    log = MaterialWasteLog.query.get(log_id)
    if not log:
        return jsonify({'status': 'error', 'message': 'That waste entry was not found'}), 404
    order = JobOrder.query.filter_by(id=log.job_order_id).with_for_update().first() if log.job_order_id else None
    if order:
        error = branch_access_error(request.current_user, order.branch_id)
        if error:
            return error
    material = InventoryMaterial.query.filter_by(id=log.material_id).with_for_update().first()
    error = inventory_branch_error(request.current_user, material.branch_id if material else log.branch_id)
    if error:
        return error
    if material:
        material.stock_quantity = round(float(material.stock_quantity or 0) + float(log.quantity or 0), 4)
        material.updated_at = datetime.now()
    summary = f"{float(log.quantity):g} of {material.material_type if material else 'a removed material'}"
    db.session.delete(log)
    db.session.flush()
    if order:
        order.actual_cost = job_order_actual_cost(order)
        order.updated_at = datetime.utcnow()
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'DELETE', 'Inventory',
               f"Undid waste entry: {summary}, returned to stock{f' (job order {order.job_order_id})' if order else ''}",
               request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'message': 'Returned to stock'})

@app.route('/api/sales/job-orders/<int:order_id>/extra-materials', methods=['GET'])
@require_auth
# Internal cost, so only for those who see job costs
@require_permission('costing.view', 'inventory.log_waste', 'sales.edit_unpaid')
def get_job_order_extra_materials(order_id):
    order = JobOrder.query.get(order_id)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    error = branch_access_error(request.current_user, order.branch_id)
    if error:
        return error
    return jsonify({'status': 'success', 'data': [waste_log_to_dict(l) for l in job_order_extras(order)]})


@app.route('/api/sales/job-orders/<int:order_id>/extra-materials', methods=['POST'])
@require_auth
@require_permission('inventory.log_waste')
def issue_job_order_extra_materials(order_id):
    """Extra material issued for a job order beyond what it planned -- a recut
    after a mistake, defective material, rework. It leaves stock now, counts in
    the job's actual material cost, and doesn't change the customer's price."""
    # Lock the order so a status change can't slip in between the check and the log
    order = JobOrder.query.filter_by(id=order_id).with_for_update().first()
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    error = branch_access_error(request.current_user, order.branch_id)
    if error:
        return error
    # A worker may have started on it while the order itself still says Pending
    work_started = order.status == 'pending' and any(a.status == 'in_progress' for a in _assignments_for_order(order))
    if order.status not in EXTRA_MATERIAL_STATUSES and not work_started:
        return jsonify({'status': 'error', 'message': 'Extra materials can only be issued once work on the job '
                                                      'order has started.'}), 400
    data = request.get_json(silent=True) or {}
    log, error = record_waste(data.get('materialId'), data.get('quantity'), data.get('reason'), data.get('notes'),
                              job_order=order, worker_id=data.get('workerId'))
    if error:
        db.session.rollback()
        return error
    db.session.flush()
    order.actual_cost = job_order_actual_cost(order)
    order.updated_at = datetime.utcnow()
    db.session.commit()
    who = f" (worker: {log.worker.name})" if log.worker else ''
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Sales',
               f"Issued extra material for {order.job_order_id}: {log.quantity:g} of {log.material.material_type}, "
               f"reason: {log.reason}{who}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': waste_log_to_dict(log)}), 201

@app.route('/api/sales/job-orders/<int:order_id>/extra-materials/<int:log_id>', methods=['DELETE'])
@require_auth
@require_permission('inventory.log_waste')
def undo_job_order_extra_material(order_id, log_id):
    """Undo extra material recorded by mistake: the quantity goes back into stock
    and comes off the job's actual cost."""
    order = JobOrder.query.filter_by(id=order_id).with_for_update().first()
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    error = branch_access_error(request.current_user, order.branch_id)
    if error:
        return error
    log = MaterialWasteLog.query.filter_by(id=log_id, job_order_id=order.id).first()
    if not log:
        return jsonify({'status': 'error', 'message': 'That extra material entry was not found'}), 404
    material = InventoryMaterial.query.filter_by(id=log.material_id).with_for_update().first()
    if material:
        error = inventory_branch_error(request.current_user, material.branch_id)
        if error:
            return error
        material.stock_quantity = round(float(material.stock_quantity or 0) + float(log.quantity or 0), 4)
        material.updated_at = datetime.now()
    summary = (f"{float(log.quantity):g} of {material.material_type if material else 'a removed material'}"
               f"{f' (worker: {log.worker.name})' if log.worker else ''}")
    db.session.delete(log)
    db.session.flush()
    order.actual_cost = job_order_actual_cost(order)
    order.updated_at = datetime.utcnow()
    db.session.commit()
    reason = ((request.get_json(silent=True) or {}).get('reason') or '').strip()
    log_action(request.current_user['id'], request.current_user['fullName'], 'DELETE', 'Sales',
               f"Undid extra material for {order.job_order_id}: {summary}, returned to stock"
               f"{f'. Reason: {reason}' if reason else ''}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'message': 'Returned to stock'})

@app.route('/api/worker-extra-materials', methods=['GET'])
@require_auth
@require_permission('workers.view')
def get_worker_extra_materials():
    """Extra material issued under a worker's name, newest first. Filter by
    workerId and/or jobOrderId; with neither, every entry that names a worker."""
    query = MaterialWasteLog.query.filter(MaterialWasteLog.managed_worker_id.isnot(None))
    if request.args.get('workerId'):
        query = query.filter(MaterialWasteLog.managed_worker_id == request.args.get('workerId', type=int))
    if request.args.get('jobOrderId'):
        query = query.filter(MaterialWasteLog.job_order_id == request.args.get('jobOrderId', type=int))
    logs = query.order_by(MaterialWasteLog.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [waste_log_to_dict(l) for l in logs]})

# ============================================
# PAYMENTS
# ============================================

def refresh_job_order_balance(order):
    """Balance and payment status from what the order costs and what has been
    paid (down_payment holds the total paid)."""
    total = float(order.total_price or 0)
    paid = float(order.down_payment or 0)
    order.balance = money(max(total - paid, 0))
    if paid > 0 and paid >= total:
        order.payment_status = 'paid'
    elif paid > 0:
        order.payment_status = 'partial'
    else:
        order.payment_status = 'unpaid'

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
@require_permission('payments.view', 'sales.view')
def get_payments():
    user = request.current_user
    job_order_id = request.args.get('jobOrderId')
    query = PaymentRecord.query
    if job_order_id:
        query = query.filter_by(job_order_id=int(job_order_id))
    elif not all_job_order_branches(user):
        # Non-admins: only show payments for their branch's job orders
        branch_id = user.get('branchId')
        if branch_id:
            branch_order_ids = [jo.id for jo in JobOrder.query.filter_by(branch_id=branch_id).all()]
            query = query.filter(PaymentRecord.job_order_id.in_(branch_order_ids))
    payments = query.order_by(PaymentRecord.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [payment_record_to_dict(p) for p in payments]})

@app.route('/api/payments', methods=['POST'])
@require_auth
@require_permission('payments.add')
def create_payment():
    data = request.get_json()
    if not data.get('jobOrderId') or not data.get('amount'):
        return jsonify({'status': 'error', 'message': 'jobOrderId and amount are required'}), 400
    try:
        # Row lock: payments for one order are added one at a time
        job_order = JobOrder.query.filter_by(id=int(data['jobOrderId'])).with_for_update().first()
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'jobOrderId and amount must be numbers'}), 400
    amount = finite_number(data.get('amount'))
    if amount is None:
        return jsonify({'status': 'error', 'message': 'jobOrderId and amount must be numbers'}), 400
    if not job_order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    error = branch_access_error(request.current_user, job_order.branch_id)
    if error:
        return error
    if job_order.status in ('draft', 'cancelled', 'voided'):
        return jsonify({'status': 'error', 'message': f'A {job_order.status} job order cannot take payments'}), 400
    if amount <= 0:
        return jsonify({'status': 'error', 'message': 'Amount must be positive'}), 400
    amount = money(amount)
    remaining = money(max(float(job_order.total_price or 0) - float(job_order.down_payment or 0), 0))
    method = data.get('paymentMethod', 'cash')
    reference = (data.get('referenceNumber') or '').strip() or None
    notes = (data.get('notes') or '').strip() or None
    excess = None
    if amount > remaining:
        if remaining <= 0:
            return jsonify({'status': 'error', 'message': 'This order is already fully paid'}), 400
        # Cash over the balance is change, handed back on the spot. Money sent
        # online can't be, so the extra is kept on record until it is returned.
        if method == 'cash' or not data.get('recordExcess'):
            return jsonify({'status': 'error',
                            'message': f'Payment can\'t be more than the remaining balance of ₱{remaining:,.2f}'}), 400
        excess = ExcessPayment(
            job_order_id=job_order.id, customer_id=job_order.customer_id,
            amount=money(amount - remaining), payment_method=method, reference_number=reference,
            notes=notes, received_by=request.current_user['id'],
        )
        db.session.add(excess)
        amount = remaining
    payment = PaymentRecord(
        job_order_id=job_order.id,
        amount=amount,
        payment_method=method,
        reference_number=reference,
        notes=notes,
        recorded_by=request.current_user['id'],
    )
    db.session.add(payment)
    db.session.flush()
    # Total paid = every payment record, the new one included (it is already in
    # the session, so adding `amount` on top would count it twice)
    job_order.down_payment = money(db.session.query(db.func.coalesce(db.func.sum(PaymentRecord.amount), 0))
                                   .filter(PaymentRecord.job_order_id == job_order.id).scalar())
    refresh_job_order_balance(job_order)
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Payment', f"Recorded payment of {amount} for {job_order.job_order_id}", request.remote_addr or '0.0.0.0')
    if excess:
        log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Payment',
                   f"Recorded excess of {excess.amount} on {job_order.job_order_id}, to be returned to the customer",
                   request.remote_addr or '0.0.0.0')
    result = payment_record_to_dict(payment)
    result['excess'] = excess_payment_to_dict(excess) if excess else None
    return jsonify({'status': 'success', 'data': result}), 201

# ── Excess payments: money received beyond a job order's balance ─────────────

def excess_payment_to_dict(e):
    return {
        'id': e.id,
        'jobOrderId': e.job_order_id,
        'jobOrderRef': e.job_order.job_order_id if e.job_order else None,
        'customerId': e.customer_id,
        'customerName': e.job_order.customer_name if e.job_order else None,
        'amount': float(e.amount),
        'paymentMethod': e.payment_method,
        'referenceNumber': e.reference_number,
        'notes': e.notes,
        'status': e.status,
        'receivedByName': e.receiver.full_name if e.receiver else None,
        'createdAt': fmt_dt(e.created_at),
        'resolvedByName': e.resolver.full_name if e.resolver else None,
        'resolvedAt': fmt_dt(e.resolved_at) if e.resolved_at else None,
        'refundMethod': e.refund_method,
        'refundReference': e.refund_reference,
        'resolutionNotes': e.resolution_notes,
        'appliedJobOrderId': e.applied_job_order_id,
        'appliedJobOrderRef': e.applied_job_order.job_order_id if e.applied_job_order else None,
    }

def open_excess_by_customer(customer_ids):
    """{customer id: total excess still to be returned}"""
    if not customer_ids:
        return {}
    rows = (db.session.query(ExcessPayment.customer_id, db.func.sum(ExcessPayment.amount))
            .filter(ExcessPayment.customer_id.in_(customer_ids), ExcessPayment.status == 'open')
            .group_by(ExcessPayment.customer_id))
    return {cid: money(total or 0) for cid, total in rows}

@app.route('/api/excess-payments', methods=['GET'])
@require_auth
@require_permission('payments.view', 'sales.view', 'customers.view')
def get_excess_payments():
    user = request.current_user
    query = ExcessPayment.query
    if request.args.get('jobOrderId'):
        query = query.filter(db.or_(ExcessPayment.job_order_id == request.args.get('jobOrderId', type=int),
                                    ExcessPayment.applied_job_order_id == request.args.get('jobOrderId', type=int)))
    if request.args.get('customerId'):
        query = query.filter_by(customer_id=request.args.get('customerId', type=int))
    if request.args.get('status'):
        query = query.filter_by(status=request.args['status'])
    rows = query.order_by(ExcessPayment.created_at.desc()).all()
    if not all_job_order_branches(user):
        rows = [e for e in rows if e.job_order and e.job_order.branch_id == user.get('branchId')]
    return jsonify({'status': 'success', 'data': [excess_payment_to_dict(e) for e in rows]})

def open_excess_or_error(excess_id):
    """(the open excess row, locked, or None, error response)"""
    excess = ExcessPayment.query.filter_by(id=excess_id).with_for_update().first()
    if not excess:
        return None, (jsonify({'status': 'error', 'message': 'Excess payment not found'}), 404)
    error = branch_access_error(request.current_user, excess.job_order.branch_id)
    if error:
        return None, error
    if excess.status != 'open':
        return None, (jsonify({'status': 'error', 'message': f'This excess was already {excess.status}'}), 400)
    return excess, None

@app.route('/api/excess-payments/<int:excess_id>/refund', methods=['POST'])
@require_auth
@require_permission('payments.add')
def refund_excess_payment(excess_id):
    """The excess was sent back to the customer."""
    excess, error = open_excess_or_error(excess_id)
    if error:
        return error
    data = request.get_json() or {}
    method = data.get('refundMethod')
    if method not in PAYMENT_METHODS:
        return jsonify({'status': 'error', 'message': 'Choose how the money was returned'}), 400
    excess.status = 'refunded'
    excess.refund_method = method
    excess.refund_reference = (data.get('referenceNumber') or '').strip() or None
    excess.resolution_notes = (data.get('notes') or '').strip() or None
    excess.resolved_by = request.current_user['id']
    excess.resolved_at = datetime.utcnow()
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Payment',
               f"Refunded excess of {excess.amount} from {excess.job_order.job_order_id} via {method}",
               request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': excess_payment_to_dict(excess)})

@app.route('/api/excess-payments/<int:excess_id>/apply', methods=['POST'])
@require_auth
@require_permission('payments.add')
def apply_excess_payment(excess_id):
    """Use the excess as payment on another of the same customer's orders. If it is
    more than that order's balance, the rest stays open."""
    excess, error = open_excess_or_error(excess_id)
    if error:
        return error
    data = request.get_json() or {}
    target = JobOrder.query.filter_by(id=data.get('jobOrderId')).with_for_update().first() \
        if isinstance(data.get('jobOrderId'), int) else None
    if not target:
        return jsonify({'status': 'error', 'message': 'Choose the order to apply it to'}), 400
    error = branch_access_error(request.current_user, target.branch_id)
    if error:
        return error
    if not excess.customer_id or target.customer_id != excess.customer_id:
        return jsonify({'status': 'error', 'message': 'It can only be applied to an order of the same customer'}), 400
    if target.id == excess.job_order_id:
        return jsonify({'status': 'error', 'message': 'Choose a different order'}), 400
    if target.status in ('draft', 'cancelled', 'voided'):
        return jsonify({'status': 'error', 'message': f'A {target.status} job order cannot take payments'}), 400
    remaining = money(max(float(target.total_price or 0) - float(target.down_payment or 0), 0))
    if remaining <= 0:
        return jsonify({'status': 'error', 'message': f'{target.job_order_id} is already fully paid'}), 400

    applied = min(money(excess.amount), remaining)
    now = datetime.utcnow()
    source_ref = excess.job_order.job_order_id
    db.session.add(PaymentRecord(
        job_order_id=target.id, amount=applied, payment_method=excess.payment_method,
        reference_number=excess.reference_number, notes=f'Excess payment from {source_ref}',
        recorded_by=request.current_user['id'],
    ))
    if applied < excess.amount:
        # Split: the applied part is recorded as its own settled row, the rest stays open
        settled = ExcessPayment(
            job_order_id=excess.job_order_id, customer_id=excess.customer_id, amount=applied,
            payment_method=excess.payment_method, reference_number=excess.reference_number,
            notes=excess.notes, received_by=excess.received_by, created_at=excess.created_at,
        )
        db.session.add(settled)
        excess.amount = money(excess.amount - applied)
    else:
        settled = excess
    settled.status = 'applied'
    settled.applied_job_order_id = target.id
    settled.resolved_by = request.current_user['id']
    settled.resolved_at = now
    db.session.flush()
    target.down_payment = money(db.session.query(db.func.coalesce(db.func.sum(PaymentRecord.amount), 0))
                                .filter(PaymentRecord.job_order_id == target.id).scalar())
    refresh_job_order_balance(target)
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Payment',
               f"Applied {applied} excess from {source_ref} to {target.job_order_id}",
               request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': excess_payment_to_dict(settled)})

@app.route('/api/payments/summary', methods=['GET'])
@require_auth
@require_permission('payments.view')
def get_payment_summary():
    user = request.current_user
    jo_query = JobOrder.query
    # Non-admins only ever see their own branch (no branch on the account = nothing)
    if not all_job_order_branches(user):
        jo_query = jo_query.filter_by(branch_id=user_branch_id(user) or -1)
    orders = jo_query.all()
    total_revenue = sum(float(o.total_price or 0) for o in orders if o.status not in ('voided', 'cancelled', 'draft'))
    total_collected = sum(float(o.down_payment or 0) for o in orders if o.status not in ('voided', 'cancelled', 'draft'))
    total_balance = sum(float(o.balance or 0) for o in orders if o.status not in ('voided', 'cancelled', 'draft'))
    unpaid_count = sum(1 for o in orders if o.payment_status == 'unpaid' and o.status not in ('voided', 'cancelled', 'draft'))
    partial_count = sum(1 for o in orders if o.payment_status == 'partial' and o.status not in ('voided', 'cancelled', 'draft'))
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
# PAYMENT OVERRIDE REQUESTS (supervisor override -> admin approval)
# ============================================

def payment_override_to_dict(r):
    return {
        'id': r.id,
        'jobOrderId': r.job_order_id,
        'jobOrderRef': r.job_order.job_order_id if r.job_order else None,
        'customerName': r.job_order.customer_name if r.job_order else None,
        'currentPaymentStatus': r.job_order.payment_status if r.job_order else None,
        'currentBalance': float(r.job_order.balance or 0) if r.job_order else None,
        'newPaymentStatus': r.new_payment_status,
        'newBalance': r.new_balance,
        'newDownPayment': r.new_down_payment,
        'reason': r.reason,
        'status': r.status,
        'requestedBy': r.requested_by,
        'requestedByName': r.requester.full_name if r.requester else None,
        'reviewedByName': r.reviewer.full_name if r.reviewer else None,
        'reviewNotes': r.review_notes,
        'createdAt': fmt_dt(r.created_at),
        'reviewedAt': fmt_dt(r.reviewed_at) if r.reviewed_at else None,
    }

@app.route('/api/payment-overrides', methods=['POST'])
@require_auth
@require_permission('payments.request_override')
def create_payment_override():
    """Supervisor submits a payment override for admin approval. Nothing is
    applied to the job order until an administrator approves it."""
    data = request.get_json() or {}
    try:
        job_order = JobOrder.query.get(int(data.get('jobOrderId', 0)))
    except (TypeError, ValueError):
        job_order = None
    if not job_order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    error = branch_access_error(request.current_user, job_order.branch_id)
    if error:
        return error
    new_status = data.get('paymentStatus')
    if new_status and new_status not in ('unpaid', 'partial', 'paid'):
        return jsonify({'status': 'error', 'message': 'Invalid payment status'}), 400
    if not new_status and data.get('balance') is None and data.get('downPayment') is None:
        return jsonify({'status': 'error', 'message': 'Provide a new payment status or balance to override'}), 400
    new_balance = finite_number(data.get('balance'))
    new_down_payment = finite_number(data.get('downPayment'))
    if (data.get('balance') not in (None, '') and (new_balance is None or new_balance < 0)) or \
            (data.get('downPayment') not in (None, '') and (new_down_payment is None or new_down_payment < 0)):
        return jsonify({'status': 'error', 'message': 'Amounts must be numbers of zero or more'}), 400
    req = PaymentOverrideRequest(
        job_order_id=job_order.id,
        requested_by=request.current_user['id'],
        new_payment_status=new_status,
        new_balance=new_balance,
        new_down_payment=new_down_payment,
        reason=(data.get('reason') or '').strip() or None,
        status='pending',
    )
    db.session.add(req)
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Payment', f"Requested payment override for {job_order.job_order_id}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': payment_override_to_dict(req)}), 201

@app.route('/api/payment-overrides', methods=['GET'])
@require_auth
@require_permission('payments.view')
def list_payment_overrides():
    """Admins see all requests; supervisors see the ones they submitted."""
    user = request.current_user
    status = request.args.get('status')
    job_order_id = request.args.get('jobOrderId')
    query = PaymentOverrideRequest.query
    if not has_perm(user, 'payments.approve_override'):
        query = query.filter_by(requested_by=user['id'])
    if status:
        query = query.filter_by(status=status)
    if job_order_id:
        query = query.filter_by(job_order_id=int(job_order_id))
    reqs = query.order_by(PaymentOverrideRequest.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [payment_override_to_dict(r) for r in reqs]})

@app.route('/api/payment-overrides/<int:req_id>/approve', methods=['POST'])
@require_auth
@require_permission('payments.approve_override')
def approve_payment_override(req_id):
    req = PaymentOverrideRequest.query.get(req_id)
    if not req:
        return jsonify({'status': 'error', 'message': 'Override request not found'}), 404
    if req.status != 'pending':
        return jsonify({'status': 'error', 'message': 'This request has already been reviewed'}), 400
    job_order = req.job_order
    if not job_order:
        return jsonify({'status': 'error', 'message': 'Job order no longer exists'}), 404
    error = branch_access_error(request.current_user, job_order.branch_id)
    if error:
        return error
    # What the order should count as paid after the override
    total = float(job_order.total_price or 0)
    if req.new_down_payment is not None:
        target_paid = float(req.new_down_payment)
    elif req.new_balance is not None:
        target_paid = total - float(req.new_balance)
    elif req.new_payment_status == 'paid':
        target_paid = total
    elif req.new_payment_status == 'unpaid':
        target_paid = 0.0
    else:
        target_paid = None  # 'partial' alone names no amount
    if target_paid is not None:
        target_paid = money(target_paid)
        if target_paid < 0 or target_paid > money(total):
            return jsonify({'status': 'error',
                            'message': f'The override would make the amount paid ₱{target_paid:,.2f}, outside ₱0 to '
                                       f'the order total of ₱{total:,.2f}. Reject it and ask for a corrected one.'}), 400
        # Paid is always the sum of the payment records, so the override is saved
        # as an adjustment record; a later payment then adds to it instead of
        # recalculating it away
        recorded = money(db.session.query(db.func.coalesce(db.func.sum(PaymentRecord.amount), 0))
                         .filter(PaymentRecord.job_order_id == job_order.id).scalar())
        adjustment = money(target_paid - recorded)
        if adjustment:
            db.session.add(PaymentRecord(
                job_order_id=job_order.id, amount=adjustment, payment_method='adjustment',
                notes=f"Payment override #{req.id} approved" + (f": {req.reason}" if req.reason else ''),
                recorded_by=request.current_user['id']))
        job_order.down_payment = target_paid
        refresh_job_order_balance(job_order)
    elif req.new_payment_status:
        job_order.payment_status = req.new_payment_status
    req.status = 'approved'
    req.reviewed_by = request.current_user['id']
    req.review_notes = ((request.get_json(silent=True) or {}).get('notes') or '').strip() or None
    req.reviewed_at = datetime.utcnow()
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Payment', f"Approved payment override for {job_order.job_order_id}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': payment_override_to_dict(req)})

@app.route('/api/payment-overrides/<int:req_id>/reject', methods=['POST'])
@require_auth
@require_permission('payments.approve_override')
def reject_payment_override(req_id):
    req = PaymentOverrideRequest.query.get(req_id)
    if not req:
        return jsonify({'status': 'error', 'message': 'Override request not found'}), 404
    if req.status != 'pending':
        return jsonify({'status': 'error', 'message': 'This request has already been reviewed'}), 400
    if req.job_order:
        error = branch_access_error(request.current_user, req.job_order.branch_id)
        if error:
            return error
    req.status = 'rejected'
    req.reviewed_by = request.current_user['id']
    req.review_notes = ((request.get_json(silent=True) or {}).get('notes') or '').strip() or None
    req.reviewed_at = datetime.utcnow()
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Payment', f"Rejected payment override #{req.id}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': payment_override_to_dict(req)})

# ============================================
# SALES MODULE - JOB ORDERS
# ============================================

# ── Job order line items ─────────────────────────────────────────────────────
# Items are JSON dicts. 'category' is material | labor | expense; older orders
# don't store it, so it is inferred (a line with only labor cost is labor).
# Labor lines with a worker carry 'assignmentId' linking them to that worker's
# WorkerAssignment, and 'actualLaborCost' (whole-line pay) once the work is done.

def item_category(item):
    cat = item.get('category')
    if cat in ('material', 'labor', 'expense'):
        return cat
    if float(item.get('laborCost') or 0) > 0 and float(item.get('materialCost') or 0) == 0:
        return 'labor'
    return 'material'


def material_quantities(items):
    """{material key: total quantity} over an order's material lines, to tell
    whether an edit changes what the order takes from stock."""
    totals = {}
    for it in items or []:
        if item_category(it) != 'material':
            continue
        key = f"id:{it['materialId']}" if it.get('materialId') else f"name:{(it.get('name') or '').strip().lower()}"
        totals[key] = round(totals.get(key, 0) + float(it.get('quantity') or 0), 4)
    return {k: v for k, v in totals.items() if v}

def _material_ids(items):
    ids = set()
    for it in items or []:
        if item_category(it) == 'material' and it.get('materialId'):
            try:
                ids.add(int(it['materialId']))
            except (TypeError, ValueError):
                pass
    return ids

def material_branch_error(items, branch_id, previous_items=()):
    """Why a job order at branch_id can't use these materials, or None. An order
    takes stock from its own branch or the warehouse only, so it can't empty
    another branch's shelves. Lines already on the order are left alone, so
    older orders can still be edited."""
    new_ids = _material_ids(items) - _material_ids(previous_items)
    if not new_ids:
        return None
    allowed = {branch_id} | {b.id for b in Branch.query.filter_by(is_warehouse=True).all()}
    other = (InventoryMaterial.query.filter(InventoryMaterial.id.in_(new_ids),
                                            ~InventoryMaterial.branch_id.in_(allowed)).first())
    if other:
        return (f"{other.material_type} is stock of another branch. Use materials from this "
                f"order's branch or the warehouse.")
    return None

def job_order_extras(order):
    """Extra material issued for this order, oldest first."""
    if not order or not order.id:
        return []
    return MaterialWasteLog.query.filter(MaterialWasteLog.job_order_id == order.id) \
        .order_by(MaterialWasteLog.created_at.asc(), MaterialWasteLog.id.asc()).all()

def extras_by_order(order_ids):
    """{job order id: [extra material logs]} for many orders in one query."""
    out = {}
    ids = [i for i in order_ids if i]
    if not ids:
        return out
    for log in MaterialWasteLog.query.filter(MaterialWasteLog.job_order_id.in_(ids)).all():
        out.setdefault(log.job_order_id, []).append(log)
    return out

def extras_cost(logs):
    return sum(float(l.quantity or 0) * waste_unit_cost(l) for l in logs or [])

def job_order_actual_cost(order, items=None):
    """Stored actual cost: the order's lines plus any extra material issued for it."""
    base = job_order_cost(order.items if items is None else items)
    return round(base + extras_cost(job_order_extras(order)), 2)

def job_order_cost(items):
    """What the job costs us: materials + other expenses + labor, where a labor
    line's actual pay replaces its estimate once the worker has finished."""
    total = 0.0
    for it in items or []:
        qty = float(it.get('quantity') or 0)
        if item_category(it) == 'labor':
            actual = it.get('actualLaborCost')
            total += float(actual) if actual is not None else qty * float(it.get('laborCost') or 0)
        else:
            total += qty * float(it.get('materialCost') or 0)
    return round(total, 2)


# Shown with labor lines but owned by the worker assignment, so never stored on the order
TRANSIENT_ITEM_KEYS = ('assignmentStatus', 'scheduledDate')


def items_with_assignment_status(order):
    """The order's items, with each labor line's live assignment status attached."""
    items = [dict(it) for it in (order.items or [])]
    ids = [it['assignmentId'] for it in items if it.get('assignmentId')]
    if ids:
        by_id = {a.id: a for a in WorkerAssignment.query.filter(WorkerAssignment.id.in_(ids)).all()}
        for it in items:
            a = by_id.get(it.get('assignmentId'))
            if a:
                it['assignmentStatus'] = a.status
                it['scheduledDate'] = a.scheduled_date.isoformat() if a.scheduled_date else None
    return items


def _assignments_for_order(order):
    return WorkerAssignment.query.filter(
        db.or_(WorkerAssignment.job_order_db_id == order.id,
               WorkerAssignment.job_order_ref == order.job_order_id),
        WorkerAssignment.assignment_type != 'special_task',
    ).all()


def sync_labor_assignments(order, previous_items):
    """Keep exactly one worker assignment per labor line that names a worker.

    The line remembers its assignment id, so re-saving the order updates that
    assignment rather than creating another; renaming the task or switching the
    worker on a not-yet-started line moves the same assignment; removing a line
    deletes its assignment if work hasn't started (started work is kept as a
    record). Actual pay is always read back from the assignment, so a save made
    from a stale page can't wipe it."""
    items = [dict(it) for it in (order.items or [])]
    existing = _assignments_for_order(order)
    by_id = {a.id: a for a in existing}
    linked_ids = {it.get('assignmentId') for it in items if it.get('assignmentId')}
    claimed = set()

    for it in items:
        if item_category(it) != 'labor':
            continue
        it['category'] = 'labor'
        worker = ManagedWorker.query.get(int(it['workerId'])) if it.get('workerId') else None
        if not worker:
            it.pop('assignmentId', None)
            it.pop('actualLaborCost', None)
            continue

        desc = (it.get('name') or '').strip()
        a = by_id.get(it.get('assignmentId'))
        if a and a.status != 'pending' and a.worker_id != worker.id:
            # Work already started under another worker: leave that record alone
            # and give the newly chosen worker their own assignment.
            a = None
        if a is None:
            # Adopt an assignment made before lines were linked (older orders) so
            # re-saving them doesn't create a duplicate.
            a = next((c for c in existing
                      if c.id not in claimed and c.id not in linked_ids
                      and c.worker_id == worker.id and (c.description or '').strip() == desc), None)
        if a is None:
            a = WorkerAssignment(worker_id=worker.id, job_order_ref=order.job_order_id,
                                 job_order_db_id=order.id, description=desc,
                                 status='pending', assignment_type='job_order')
            db.session.add(a)
            db.session.flush()
        elif a.status == 'pending':
            a.worker_id = worker.id
            a.description = desc
            a.job_order_db_id = order.id
        if a.status == 'pending' and (worker.pay_mode or 'per_hour') == 'per_hour':
            a.expected_hours = float(it.get('quantity') or 0) or None

        claimed.add(a.id)
        it['assignmentId'] = a.id
        it['workerName'] = worker.name
        if a.status == 'completed' and a.pay is not None:
            it['actualLaborCost'] = round(float(a.pay), 2)
        else:
            it.pop('actualLaborCost', None)

    for prev in previous_items or []:
        a = by_id.get(prev.get('assignmentId'))
        if a and a.id not in claimed and a.status == 'pending':
            db.session.delete(a)

    order.items = items


def release_pending_assignments(order):
    """Free the workers booked on an order that will no longer be worked on:
    delete the assignments that never started and unlink their labor lines, so
    a line can't point at an id the database later gives another assignment."""
    released = set()
    for a in _assignments_for_order(order):
        if a.status == 'pending':
            released.add(a.id)
            db.session.delete(a)
    if released:
        order.items = [{k: v for k, v in it.items() if k != 'assignmentId'}
                       if it.get('assignmentId') in released else it
                       for it in (order.items or [])]


def add_labor_line_for_assignment(order, assignment):
    """Give an assignment made in Worker Management its labor line on the job
    order (or link an existing unlinked line for the same worker and task), so
    the job order and Worker Management always show the same workers."""
    items = [dict(it) for it in (order.items or [])]
    if any(it.get('assignmentId') == assignment.id for it in items):
        return
    worker = assignment.worker or ManagedWorker.query.get(assignment.worker_id)
    desc = (assignment.description or '').strip()
    line = next((it for it in items
                 if item_category(it) == 'labor' and not it.get('assignmentId')
                 and int(it.get('workerId') or 0) == assignment.worker_id
                 and (it.get('name') or '').strip() == desc), None)
    if line is None:
        per_hour = (worker.pay_mode if worker else 'per_hour') in (None, 'per_hour')
        line = {
            'category': 'labor',
            'name': desc or (worker.work_type.replace('_', ' ').title() if worker else 'Labor'),
            # Estimate: expected hours for hourly workers, otherwise one day / piece to start with
            'quantity': float(assignment.expected_hours or 1) if per_hour else 1,
            'unitPrice': 0, 'materialCost': 0,
            'laborCost': float(worker.rate_per_hour or 0) if worker else 0,
            'workerId': assignment.worker_id,
            'workerName': worker.name if worker else '',
        }
        items.append(line)
    line['assignmentId'] = assignment.id
    order.items = items
    order.actual_cost = job_order_actual_cost(order, items)


def record_assignment_pay(assignment):
    """Copy a finished assignment's pay onto its job order's labor line so the
    order's labor cost and profit reflect what was actually paid. If the
    assignment is no longer completed, its line goes back to the estimate."""
    if assignment.assignment_type == 'special_task':
        return
    order = (JobOrder.query.get(assignment.job_order_db_id) if assignment.job_order_db_id
             else JobOrder.query.filter_by(job_order_id=assignment.job_order_ref).first())
    if not order:
        return
    items = [dict(it) for it in (order.items or [])]
    if assignment.status != 'completed' or assignment.pay is None:
        linked = [it for it in items if it.get('assignmentId') == assignment.id and 'actualLaborCost' in it]
        if linked:
            for it in linked:
                it.pop('actualLaborCost', None)
            order.items = items
            order.actual_cost = job_order_actual_cost(order, items)
        return
    line = next((it for it in items if it.get('assignmentId') == assignment.id), None)
    if line is None:
        line = next((it for it in items
                     if item_category(it) == 'labor' and not it.get('assignmentId')
                     and int(it.get('workerId') or 0) == assignment.worker_id
                     and (it.get('name') or '').strip() == (assignment.description or '').strip()), None)
    worker = assignment.worker
    if line is None:
        # Work assigned straight from the worker dashboard still costs the job.
        line = {
            'category': 'labor',
            'name': assignment.description or (worker.work_type.replace('_', ' ').title() if worker else 'Labor'),
            'quantity': 1, 'unitPrice': 0, 'materialCost': 0,
            'laborCost': round(float(assignment.pay), 2),
            'workerId': assignment.worker_id,
            'workerName': worker.name if worker else '',
        }
        items.append(line)
    line['category'] = 'labor'
    line['assignmentId'] = assignment.id
    line['actualLaborCost'] = round(float(assignment.pay), 2)
    order.items = items
    order.actual_cost = job_order_actual_cost(order, items)


@app.route('/api/sales/job-orders', methods=['GET'])
@require_auth
@require_permission('sales.view', 'item_trail.add', 'workers.assign')
def get_job_orders():
    user = request.current_user
    status = request.args.get('status')
    
    # Branch-level access control with database
    query = JobOrder.query
    
    if all_job_order_branches(user):
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
    
    # Filter by status if provided; otherwise hide drafts (they live in /api/sales/drafts)
    if status:
        query = query.filter_by(status=status)
    else:
        query = query.filter(JobOrder.status != 'draft')

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
            'items': jo.items if sees_labor_cost(user) else without_labor_cost(jo.items),
            'slipData': jo.slip_data,
            'estimatedCost': jo.estimated_cost,
            'actualCost': jo.actual_cost,
            'totalPrice': jo.total_price,
            'discountPercent': jo.discount_percent,
            'vatPercent': jo.vat_percent,
            'vatInclusive': bool(jo.vat_inclusive),
            # VAT already inside the total, worked out here so every screen agrees
            'vatAmount': vat_breakdown(jo.total_price, jo.vat_percent)['vat'],
            'status': jo.status,
            'priority': jo.priority or 'normal',
            'paymentStatus': jo.payment_status,
            'downPayment': jo.down_payment,
            'balance': jo.balance,
            'estimatedCompletion': jo.estimated_completion.strftime('%Y-%m-%d') if jo.estimated_completion else '',
            'completedAt': jo.completed_at.strftime('%Y-%m-%d') if jo.completed_at else None,
            'createdAt': jo.created_at.strftime('%Y-%m-%d'),
            'createdBy': jo.created_by,
            'updatedAt': jo.updated_at.strftime('%Y-%m-%d'),
        }

    return jsonify({'status': 'success', 'data': [job_order_to_dict(jo) for jo in orders]})

@app.route('/api/sales/job-orders/<int:order_id>', methods=['GET'])
@require_auth
@require_permission('sales.view', 'item_trail.add', 'workers.assign')
def get_job_order(order_id):
    user = request.current_user
    order = JobOrder.query.get(order_id)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    
    # Branch-level access control
    if not all_job_order_branches(user):
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
        'items': items_with_assignment_status(order) if sees_labor_cost(user)
                 else without_labor_cost(items_with_assignment_status(order)),
        'slipData': order.slip_data,
        'estimatedCost': order.estimated_cost,
        'actualCost': order.actual_cost,
        'totalPrice': order.total_price,
        'discountPercent': order.discount_percent,
        'vatPercent': order.vat_percent,
        'vatInclusive': bool(order.vat_inclusive),
        # VAT already inside the total, worked out here so every screen agrees
        'vatAmount': vat_breakdown(order.total_price, order.vat_percent)['vat'],
        'status': order.status,
        'priority': order.priority or 'normal',
        'paymentStatus': order.payment_status,
        'downPayment': order.down_payment,
        'balance': order.balance,
        'estimatedCompletion': order.estimated_completion.strftime('%Y-%m-%d') if order.estimated_completion else '',
        'completedAt': order.completed_at.strftime('%Y-%m-%d') if order.completed_at else None,
        'createdAt': order.created_at.strftime('%Y-%m-%d'),
        'createdBy': order.created_by,
        'updatedAt': order.updated_at.strftime('%Y-%m-%d'),
    }
    # Extra material is an internal cost: only for those who see costs
    if has_perm(user, 'costing.view') or has_perm(user, 'inventory.log_waste') or has_perm(user, 'sales.edit_unpaid'):
        extras = job_order_extras(order)
        order_dict['extraMaterials'] = [waste_log_to_dict(l) for l in extras]
        order_dict['extraMaterialsCost'] = money(extras_cost(extras))

    return jsonify({'status': 'success', 'data': order_dict})

# The price for the work (VAT included, before discount) is at most 8 digits
MAX_JOB_ORDER_PRICE = 99_999_999.99
PRICING_KEYS = ('priceForWork', 'discountPercent', 'vatIncluded', 'totalPrice', 'vatPercent')
JOB_ORDER_PRIORITIES = ('low', 'normal', 'high', 'urgent')

def job_order_entered_price(order):
    """The VAT-inclusive price before discount that gives this order's stored total."""
    d = float(order.discount_percent or 0)
    total = float(order.total_price or 0)
    return money(total / (1 - d / 100)) if d < 100 else total

def job_order_pricing(data, order=None):
    """Work out a job order's price on the server. Returns (fields, error).

    What is entered is the price for the work with VAT already included, a
    discount % and whether VAT applies. The final price is that price less the
    discount -- VAT is never added on top; its share is taken out of the final
    price when shown (vat_breakdown). A total or VAT rate sent by the browser is
    not trusted: the rate comes from Settings, or stays the one the order was
    priced at. Older browsers that still send totalPrice have it read as the
    final, VAT-inclusive price."""
    try:
        # No discount may come as null (the job order page sends that), which means 0
        d = float((data['discountPercent'] if 'discountPercent' in data else
                   (order.discount_percent if order else None)) or 0)
        if 'priceForWork' in data:
            price = float(data['priceForWork'] or 0)
        elif 'totalPrice' in data and data['totalPrice'] is not None:
            price = float(data['totalPrice']) / (1 - d / 100) if d < 100 else float(data['totalPrice'])
        elif order is not None:
            price = job_order_entered_price(order)
        else:
            price = sum(float(it.get('quantity', 0) or 0) * float(it.get('unitPrice', 0) or 0)
                        for it in (data.get('items') or []))
    except (TypeError, ValueError):
        return None, 'Invalid price'
    if not (0 <= d <= 100):
        return None, 'Discount must be between 0 and 100%'
    if price < 0:
        return None, 'Price cannot be negative'
    price = money(price)
    if price > MAX_JOB_ORDER_PRICE:
        return None, 'Price for the work must be less than ₱100,000,000 (up to 8 digits)'

    if 'vatIncluded' in data:
        vat_applies = bool(data['vatIncluded'])
    elif 'vatPercent' in data:  # older browsers
        vat_applies = bool(data['vatPercent'])
    else:
        vat_applies = bool(order.vat_percent) if order is not None else True
    if not vat_applies:
        rate = None
    elif order is not None and order.vat_percent:
        rate = order.vat_percent  # keep the rate the order was priced at
    else:
        rate = current_vat_percent() or None

    return {
        'total_price': money(price * (1 - d / 100)),
        'discount_percent': d or None,
        'vat_percent': rate,
        'vat_inclusive': True,
    }, None

@app.route('/api/sales/job-orders', methods=['POST'])
@require_auth
@require_permission('sales.add')
def create_job_order():
    data = request.get_json()
    is_draft = bool(data.get('isDraft'))

    # The customer's phone is optional: not every customer gives one
    required = ['customerName', 'branchId', 'description', 'items', 'estimatedCompletion']
    if not is_draft and (not all(f in data for f in required) or not str(data.get('customerName') or '').strip()):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    # A draft may be incomplete, but still needs a customer name and a branch to be saved.
    if is_draft and not (data.get('customerName') or '').strip():
        return jsonify({'status': 'error', 'message': 'Customer name is required to save a draft'}), 400
    if is_draft and not data.get('branchId'):
        return jsonify({'status': 'error', 'message': 'Branch is required to save a draft'}), 400

    # Look up branch from database
    branch_db = Branch.query.get(data['branchId'])
    if not branch_db:
        return jsonify({'status': 'error', 'message': 'Invalid branch'}), 400
    
    error = branch_access_error(request.current_user, branch_db.id, 'branch')
    if error:
        return error

    lock_branch_numbering(branch_db.id)
    job_order_id = generate_job_order_id(branch_db.code)
    
    items = data.get('items') or []
    material_error = material_branch_error(items, branch_db.id)
    if material_error:
        return jsonify({'status': 'error', 'message': material_error}), 400

    # Price, worked out here from what was entered (see job_order_pricing)
    pricing, price_error = job_order_pricing(data)
    if price_error:
        return jsonify({'status': 'error', 'message': price_error}), 400
    total_price = pricing['total_price']
    computed_cost = sum(item.get('quantity', 0) * (item.get('materialCost', 0) + item.get('laborCost', 0)) for item in items)
    estimated_cost = data.get('estimatedCost') if data.get('estimatedCost') is not None else computed_cost
    try:
        down_payment = 0 if is_draft else money(float(data.get('downPayment') or 0))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'Down payment must be a number'}), 400
    if down_payment < 0 or down_payment > total_price:
        return jsonify({'status': 'error', 'message': 'Down payment must be between ₱0 and the order total'}), 400
    if down_payment > 0 and not has_perm(request.current_user, 'payments.add'):
        return jsonify({'status': 'error', 'message': 'You do not have permission to record payments'}), 403
    balance = max(total_price - down_payment, 0) if total_price > 0 else 0
    
    # Determine payment status
    if total_price > 0 and down_payment >= total_price:
        payment_status = 'paid'
    elif down_payment > 0:
        payment_status = 'partial'
    else:
        payment_status = 'unpaid'
    
    # Parse date (default to today for drafts that haven't picked one yet)
    from datetime import datetime as dt
    ec_raw = data.get('estimatedCompletion')
    try:
        estimated_completion = dt.strptime(str(ec_raw)[:10], '%Y-%m-%d').date() if ec_raw else manila_today()
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid estimated completion date'}), 400
    if ec_raw and estimated_completion < manila_today():
        return jsonify({'status': 'error', 'message': 'Estimated completion date cannot be in the past'}), 400

    # Find or create customer account
    resolved_customer_id = data.get('customerId')
    if resolved_customer_id and not Customer.query.get(resolved_customer_id):
        resolved_customer_id = None
    if not resolved_customer_id:
        phone = str(data.get('customerPhone') or '').strip()
        email = str(data.get('customerEmail') or '').strip()
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
        customer_name=str(data['customerName']).strip(),
        customer_phone=str(data.get('customerPhone') or '').strip(),
        customer_email=data.get('customerEmail', ''),
        branch_id=data['branchId'],
        description=data.get('description', '') or '',
        vehicle_info=data.get('vehicleInfo'),
        items=items,
        # The cutter and sewer on the slip are set by those who manage labor
        slip_data=data.get('slipData') if sees_labor_cost(request.current_user) or not data.get('slipData')
                  else {k: v for k, v in data['slipData'].items() if k not in ('cutterName', 'sewerName')},
        estimated_cost=estimated_cost,
        actual_cost=0,
        total_price=total_price,
        status='draft' if is_draft else 'pending',
        priority=data.get('priority') if data.get('priority') in JOB_ORDER_PRIORITIES else 'normal',
        payment_status=payment_status,
        down_payment=down_payment,
        balance=balance,
        discount_percent=pricing['discount_percent'],
        vat_percent=pricing['vat_percent'],
        vat_inclusive=pricing['vat_inclusive'],
        estimated_completion=estimated_completion,
        created_by=request.current_user['id'],
    )

    db.session.add(new_order)
    try:
        db.session.flush()  # get new_order.id before commit
    except IntegrityError:
        # Two saves picked the same number (only possible without row locks)
        db.session.rollback()
        return jsonify({'status': 'error', 'message': NUMBER_CLASH_MESSAGE}), 409
    if not is_draft:
        sync_labor_assignments(new_order, [])
    new_order.actual_cost = job_order_cost(new_order.items)

    # Materials typed in on the order form are added to inventory as "needed"
    # just before the order is created; record which order needs them.
    needed_ids = [int(it['materialId']) for it in items if it.get('materialId')]
    if needed_ids:
        for material in InventoryMaterial.query.filter(
                InventoryMaterial.id.in_(needed_ids),
                InventoryMaterial.status == 'needed',
                InventoryMaterial.source_job_order_id.is_(None)).all():
            material.source_job_order_id = job_order_id

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

    try:
        db.session.commit()
    except IntegrityError:
        # Two saves picked the same number (only possible without row locks)
        db.session.rollback()
        return jsonify({'status': 'error', 'message': NUMBER_CLASH_MESSAGE}), 409

    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Sales', f"Created job order: {job_order_id}", request.remote_addr or '0.0.0.0')

    # Return the created order
    return jsonify({
        'status': 'success',
        'data': {
            'id': new_order.id,
            'jobOrderId': new_order.job_order_id,
            'branchName': branch_db.name,
            'totalPrice': total_price,
            'discountPercent': new_order.discount_percent,
            'vatPercent': new_order.vat_percent,
            'vatInclusive': True,
            'vatAmount': vat_breakdown(total_price, new_order.vat_percent)['vat'],
            'status': 'draft' if is_draft else 'pending',
        }
    }), 201

# Status changes the job order page offers. Delivered is set by Deliveries and
# voided by the void action; cancelled, delivered and voided orders are final.
JOB_ORDER_TRANSITIONS = {
    'draft': {'pending', 'cancelled'},
    'pending': {'in_progress', 'cancelled'},
    'in_progress': {'pending', 'completed', 'cancelled'},
    # A completed order's materials have been used, so it can't be cancelled
    'completed': {'in_progress'},
}

def job_order_materials_taken(order):
    """True if an earlier completion took this order's materials from stock and
    they haven't all been given back (reverting to In Progress keeps them out)."""
    rows = db.session.query(MaterialUsageLog.material_id, db.func.sum(MaterialUsageLog.quantity_used)).filter(
        MaterialUsageLog.used_in_type == 'job_order',
        MaterialUsageLog.used_in_reference == order.job_order_id,
        MaterialUsageLog.used_by.isnot(None),
    ).group_by(MaterialUsageLog.material_id).all()
    return any(float(total or 0) > 0 for _, total in rows)

@app.route('/api/sales/job-orders/<int:order_id>', methods=['PUT'])
@require_auth
@require_permission('sales.edit')
def update_job_order(order_id):
    # Row lock: concurrent edits of one order (e.g. two "Complete" clicks) run one
    # after the other, so the second sees the first's stock deduction
    order = JobOrder.query.filter_by(id=order_id).with_for_update().first()
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404

    user = request.current_user
    error = branch_access_error(user, order.branch_id)
    if error:
        return error
    is_draft = order.status == 'draft'
    # A confirmed order needs a down payment before it can be edited, unless the
    # user may edit unpaid orders (by default administrators and supervisors).
    # Drafts are unpaid by definition, so they are never held back by this.
    if not is_draft and (order.down_payment or 0) <= 0 and not has_perm(user, 'sales.edit_unpaid'):
        return jsonify({'status': 'error', 'message': 'A down payment is required before you can edit this job order'}), 403

    data = request.get_json() or {}
    # Money received goes through Payments (and overrides through their approval);
    # the cost is worked out from the order's lines
    locked_fields = [f for f in ('downPayment', 'balance', 'paymentStatus', 'actualCost') if f in data]
    if locked_fields:
        return jsonify({'status': 'error', 'message': f"{', '.join(locked_fields)} can't be set here. Record payments "
                                                      f"on the Payments panel or request a payment override."}), 400

    # Other roles never received the labor rates, so their copy of the labor lines
    # can't be saved back: keep the order's own labor lines as they are
    if 'items' in data and not sees_labor_cost(user):
        data['items'] = [it for it in (data['items'] or []) if it.get('category') != 'labor'] + \
                        [it for it in (order.items or []) if it.get('category') == 'labor']

    # Capture previous status and branch BEFORE any updates
    prev_status = order.status
    prev_branch_id = order.branch_id
    # A finished order's materials have left stock; changing them here would make
    # stock and costing disagree. Revert it to In Progress first (completing it
    # again then takes or returns the difference).
    if prev_status in ('completed', 'delivered') and 'items' in data and \
            material_quantities(data['items'] or []) != material_quantities(order.items or []):
        return jsonify({'status': 'error', 'message': 'This order is finished, so its materials have already left stock. '
                                                      'Revert it to In Progress to change them.'}), 400
    if 'status' in data and data['status'] != prev_status:
        allowed = JOB_ORDER_TRANSITIONS.get(prev_status, set())
        if data['status'] not in allowed:
            if data['status'] == 'cancelled' and prev_status in ('completed', 'delivered'):
                return jsonify({'status': 'error', 'message': "A completed job order can't be cancelled: "
                                                              "its materials have already been used."}), 400
            return jsonify({'status': 'error',
                            'message': f"A {prev_status.replace('_', ' ')} job order can't be changed to "
                                       f"{str(data['status']).replace('_', ' ')}"}), 400
        if data['status'] == 'cancelled' and job_order_materials_taken(order):
            return jsonify({'status': 'error', 'message': "This job order was completed before and its materials "
                                                          "were used, so it can't be cancelled."}), 400
        if data['status'] == 'cancelled' and job_order_extras(order):
            return jsonify({'status': 'error', 'message': "Extra materials were already issued for this job order, "
                                                          "so it can't be cancelled."}), 400

    # While still a draft the whole order is editable — customer details and
    # branch included. Once confirmed these are locked and only the fields
    # further down may change.
    if is_draft:
        if 'customerName' in data:
            name = (data.get('customerName') or '').strip()
            if not name:
                return jsonify({'status': 'error', 'message': 'Customer name cannot be empty'}), 400
            order.customer_name = name
        if 'customerPhone' in data:
            order.customer_phone = (data.get('customerPhone') or '').strip()
        if 'customerEmail' in data:
            order.customer_email = (data.get('customerEmail') or '').strip()
        if 'description' in data:
            order.description = (data.get('description') or '').strip()
        if 'vehicleInfo' in data:
            order.vehicle_info = data['vehicleInfo']
        if 'branchId' in data and data['branchId']:
            branch = Branch.query.get(data['branchId'])
            if not branch:
                return jsonify({'status': 'error', 'message': 'Invalid branch'}), 400
            # Moving the order is as restricted as creating it there
            error = branch_access_error(user, branch.id, 'branch')
            if error:
                return error
            order.branch_id = branch.id
        if 'estimatedCompletion' in data and data['estimatedCompletion']:
            try:
                new_completion = datetime.strptime(
                    str(data['estimatedCompletion'])[:10], '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'status': 'error', 'message': 'Invalid estimated completion date'}), 400
            # Only a changed date is checked, so an old draft can still be saved as-is
            if new_completion != order.estimated_completion and new_completion < manila_today():
                return jsonify({'status': 'error', 'message': 'Estimated completion date cannot be in the past'}), 400
            order.estimated_completion = new_completion

    pricing = None
    if any(k in data for k in PRICING_KEYS):
        pricing, price_error = job_order_pricing(data, order)
        if price_error:
            return jsonify({'status': 'error', 'message': price_error}), 400

    # New material lines (or every line, if a draft moved branch) must come from
    # the order's branch or the warehouse
    if 'items' in data or order.branch_id != prev_branch_id:
        material_error = material_branch_error(
            data['items'] if 'items' in data else order.items, order.branch_id,
            order.items if order.branch_id == prev_branch_id else ())
        if material_error:
            return jsonify({'status': 'error', 'message': material_error}), 400

    # Update allowed fields
    if 'priority' in data:
        if data['priority'] not in JOB_ORDER_PRIORITIES:
            return jsonify({'status': 'error', 'message': 'Priority must be low, normal, high or urgent'}), 400
        order.priority = data['priority']
    if 'status' in data:
        order.status = data['status']
    if pricing:
        order.total_price = pricing['total_price']
        order.discount_percent = pricing['discount_percent']
        order.vat_percent = pricing['vat_percent']
        order.vat_inclusive = pricing['vat_inclusive']
    if 'items' in data:
        previous_items = list(order.items or [])
        order.items = [{k: v for k, v in it.items() if k not in TRANSIENT_ITEM_KEYS} for it in (data['items'] or [])]
        order.estimated_cost = sum(
            item.get('quantity', 0) * (item.get('materialCost', 0) + item.get('laborCost', 0))
            for item in data['items']
        )
        # Drafts aren't real work yet, so their workers aren't booked until confirmed;
        # cancelled/voided orders no longer need anyone.
        if order.status not in ('draft', 'cancelled', 'voided'):
            sync_labor_assignments(order, previous_items)
        order.actual_cost = job_order_actual_cost(order)
    elif prev_status == 'draft' and order.status not in ('draft', 'cancelled', 'voided'):
        # Confirming a draft books the workers named on its labor lines.
        sync_labor_assignments(order, [])
        order.actual_cost = job_order_actual_cost(order)

    if order.status in ('cancelled', 'voided') and prev_status != order.status:
        # Free up workers who were booked on this order but never started
        release_pending_assignments(order)
    if 'slipData' in data:
        slip = dict(data['slipData'] or {})
        # The cutter and sewer on the slip are set by those who manage labor
        if not sees_labor_cost(user):
            for key in ('cutterName', 'sewerName'):
                slip.pop(key, None)
                if (order.slip_data or {}).get(key):
                    slip[key] = order.slip_data[key]
        order.slip_data = slip

    # A new price changes what is still owed
    if pricing:
        refresh_job_order_balance(order)

    if data.get('status') == 'completed' and prev_status != 'completed':
        order.completed_at = datetime.now()

    order.updated_at = datetime.now()

    # ── Deduct inventory when a job order is completed ──────────────────────
    if data.get('status') == 'completed' and prev_status != 'completed':
        # Total each material across lines first, then take (or give back) only
        # the difference from what earlier completions took — an order reverted
        # to in-progress and completed again must not take its stock twice, and
        # one whose materials were lowered meanwhile returns the difference.
        to_use = {}  # inventory material id -> [material, qty]
        for item in (order.items or []):
            qty = float(item.get('quantity', 0))
            if qty <= 0:
                continue

            # Labor and other-expense lines aren't stock
            if item_category(item) != 'material':
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
                entry = to_use.setdefault(inv_material.id, [inv_material, 0.0])
                entry[1] += qty

        # Credit the worker who did the job when there was exactly one
        done = [a for a in _assignments_for_order(order) if a.status == 'completed']
        worker_ids = {a.worker_id for a in done}
        sole_worker_id = next(iter(worker_ids)) if len(worker_ids) == 1 else None
        worker_names = ', '.join(sorted({a.worker.name for a in done if a.worker}))

        # Materials an earlier completion took that are no longer on the order
        taken_ids = [mid for (mid,) in db.session.query(MaterialUsageLog.material_id).filter(
            MaterialUsageLog.used_in_type == 'job_order',
            MaterialUsageLog.used_in_reference == order.job_order_id,
            MaterialUsageLog.used_by.isnot(None)).distinct()]
        for mid in taken_ids:
            if mid not in to_use:
                gone = InventoryMaterial.query.get(mid)
                if gone:
                    to_use[mid] = [gone, 0.0]

        for inv_material, qty in to_use.values():
            # Logs with used_by set are the ones written here (and that took stock)
            already = db.session.query(db.func.coalesce(db.func.sum(MaterialUsageLog.quantity_used), 0)).filter(
                MaterialUsageLog.material_id == inv_material.id,
                MaterialUsageLog.used_in_type == 'job_order',
                MaterialUsageLog.used_in_reference == order.job_order_id,
                MaterialUsageLog.used_by.isnot(None),
            ).scalar()
            qty = round(qty - float(already or 0), 4)
            if qty == 0:
                continue

            # A negative qty gives back what the order no longer uses
            inv_material.stock_quantity = float(inv_material.stock_quantity) - qty
            if qty > 0:
                inv_material.status = 'available'   # clear 'needed' flag
            inv_material.updated_at = datetime.now()

            notes = (f"Used in job order {order.job_order_id} — {order.customer_name}" if qty > 0 else
                     f"Returned from job order {order.job_order_id} — materials lowered")
            if worker_names and qty > 0:
                notes += f" (by {worker_names})"
            db.session.add(MaterialUsageLog(
                material_id=inv_material.id,
                quantity_used=qty,
                used_in_type='job_order',
                used_in_reference=order.job_order_id,
                branch_id=order.branch_id,
                used_by=request.current_user['id'],
                managed_worker_id=sole_worker_id,
                notes=notes,
            ))

    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Sales', f"Updated job order: {order.job_order_id}", request.remote_addr or '0.0.0.0')
    
    return jsonify({
        'status': 'success', 
        'data': {
            'id': order.id,
            'jobOrderId': order.job_order_id,
            'status': order.status,
            'priority': order.priority or 'normal',
            'paymentStatus': order.payment_status,
            'downPayment': order.down_payment,
            'balance': order.balance,
            'actualCost': order.actual_cost,
            'totalPrice': order.total_price,
            'discountPercent': order.discount_percent,
            'vatPercent': order.vat_percent,
            'vatInclusive': bool(order.vat_inclusive),
            # VAT already inside the total, worked out here so every screen agrees
            'vatAmount': vat_breakdown(order.total_price, order.vat_percent)['vat'],
            'items': items_with_assignment_status(order) if sees_labor_cost(user)
                     else without_labor_cost(items_with_assignment_status(order)),
            'completedAt': order.completed_at.strftime('%Y-%m-%d') if order.completed_at else None,
            'updatedAt': order.updated_at.strftime('%Y-%m-%d')
        }
    })

@app.route('/api/sales/job-orders/<int:order_id>/void', methods=['POST'])
@require_auth
@require_permission('sales.void')
def void_job_order(order_id):
    user = request.current_user
    order = JobOrder.query.get(order_id)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    if not all_job_order_branches(user) and order.branch_id != user_branch_id(user):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    if order.status in ('voided', 'cancelled', 'draft'):
        return jsonify({'status': 'error', 'message': f'A {order.status} order cannot be voided'}), 400

    # Only orders left unclaimed for 60 days may be voided
    if order.created_at and (datetime.utcnow() - order.created_at).days < 60:
        return jsonify({'status': 'error', 'message': 'Job order can only be voided after 60 days'}), 400

    order.status = 'voided'
    order.voided_at = datetime.now().date()
    order.updated_at = datetime.utcnow()
    # Free up workers who were booked but never started
    release_pending_assignments(order)
    db.session.commit()

    log_action(user['id'], user['fullName'], 'VOID', 'Sales', f"Voided job order: {order.job_order_id} (unclaimed after 60 days)", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'message': 'Job order voided'})

@app.route('/api/sales/drafts', methods=['GET'])
@require_auth
@require_permission('sales.view')
def get_draft_job_orders():
    """Draft job orders — saved but not yet confirmed. Kept out of all normal
    order lists and sales/pending counts until confirmed."""
    user = request.current_user
    query = JobOrder.query.filter(JobOrder.status == 'draft')
    if not all_job_order_branches(user):
        if user.get('branchId'):
            query = query.filter(JobOrder.branch_id == user['branchId'])
        elif user.get('branch'):
            b = Branch.query.filter_by(name=user['branch']).first()
            query = query.filter(JobOrder.branch_id == b.id) if b else query.filter(False)
        else:
            query = query.filter(False)
    drafts = query.order_by(JobOrder.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [{
        'id': d.id,
        'kind': 'custom',
        'jobOrderId': d.job_order_id,
        'customerName': d.customer_name,
        'customerPhone': d.customer_phone,
        'branchId': d.branch_id,
        'branchName': d.branch.name if d.branch else '',
        'description': d.description,
        'totalPrice': d.total_price,
        'itemCount': len(d.items or []),
        'status': d.status,
        'createdAt': d.created_at.strftime('%Y-%m-%d'),
        'updatedAt': fmt_dt(d.updated_at),
    } for d in drafts]})


@app.route('/api/sales/job-orders/<int:order_id>', methods=['DELETE'])
@require_auth
@require_permission('sales.delete')
def delete_job_order(order_id):
    """Delete a job order. Only drafts may be deleted; confirmed orders must be
    voided instead so their history is preserved."""
    order = JobOrder.query.get(order_id)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    error = branch_access_error(request.current_user, order.branch_id)
    if error:
        return error
    if order.status != 'draft':
        return jsonify({'status': 'error', 'message': 'Only draft orders can be deleted. Void confirmed orders instead.'}), 400
    label = order.job_order_id
    db.session.delete(order)
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'DELETE', 'Sales', f"Deleted draft job order: {label}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'message': 'Draft deleted'})


@app.route('/api/sales/all-orders', methods=['GET'])
@require_auth
@require_permission('sales.view')
def get_all_orders():
    """Get both job orders and customer orders - filtered by branch for non-admin users"""
    user = request.current_user

    from sqlalchemy.orm import joinedload
    # Eager-load branch so the serializers don't fire a query per row (N+1)
    jo_base = JobOrder.query.options(joinedload(JobOrder.branch))
    co_base = CustomerOrder.query.options(joinedload(CustomerOrder.branch))

    # Get job orders from database
    if all_job_order_branches(user):
        # Administrators can see all orders (drafts are excluded — they live in /api/sales/drafts)
        job_orders_db = jo_base.filter(JobOrder.status != 'draft').order_by(JobOrder.created_at.desc()).all()
        customer_orders_db = co_base.order_by(CustomerOrder.created_at.desc()).all()
    else:
        # Other users can only see orders from their branch
        # Use branch_id directly from user if available, otherwise look up by name
        if user.get('branchId'):
            job_orders_db = jo_base.filter_by(branch_id=user['branchId']).filter(JobOrder.status != 'draft').order_by(JobOrder.created_at.desc()).all()
            customer_orders_db = co_base.filter_by(branch_id=user['branchId']).order_by(CustomerOrder.created_at.desc()).all()
        elif user.get('branch'):
            user_branch = Branch.query.filter_by(name=user['branch']).first()
            if user_branch:
                job_orders_db = jo_base.filter_by(branch_id=user_branch.id).filter(JobOrder.status != 'draft').order_by(JobOrder.created_at.desc()).all()
                customer_orders_db = co_base.filter_by(branch_id=user_branch.id).order_by(CustomerOrder.created_at.desc()).all()
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
            'items': jo.items if sees_labor_cost(user) else without_labor_cost(jo.items),
            'slipData': jo.slip_data,
            'estimatedCost': jo.estimated_cost,
            'actualCost': jo.actual_cost,
            'totalPrice': jo.total_price,
            'discountPercent': jo.discount_percent,
            'vatPercent': jo.vat_percent,
            'vatInclusive': bool(jo.vat_inclusive),
            # VAT already inside the total, worked out here so every screen agrees
            'vatAmount': vat_breakdown(jo.total_price, jo.vat_percent)['vat'],
            'status': jo.status,
            'priority': jo.priority or 'normal',
            'paymentStatus': jo.payment_status,
            'downPayment': jo.down_payment,
            'balance': jo.balance,
            'estimatedCompletion': jo.estimated_completion.strftime('%Y-%m-%d') if jo.estimated_completion else '',
            'completedAt': jo.completed_at.strftime('%Y-%m-%d') if jo.completed_at else None,
            'createdAt': jo.created_at.strftime('%Y-%m-%d'),
            'createdBy': jo.created_by,
            'updatedAt': jo.updated_at.strftime('%Y-%m-%d'),
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

def lineup_slip_to_dict(slip):
    day = lambda dt: dt.strftime('%Y-%m-%d') if dt else None
    return {
        'id': slip.id,
        'slipNumber': slip.slip_number,
        'jobOrderId': slip.job_order_id,
        'jobOrderNumber': slip.job_order.job_order_id if slip.job_order else '',
        'customerName': slip.job_order.customer_name if slip.job_order else '',
        'branchId': slip.branch_id,
        'items': slip.items or [],
        'priority': slip.priority,
        'assignedTo': slip.assigned_to or '',
        'notes': slip.notes or '',
        'createdAt': day(slip.created_at),
        'updatedAt': day(slip.updated_at),
    }


def can_use_lineup_slip(user, branch_id):
    return all_job_order_branches(user) or (branch_id is not None and branch_id == user_branch_id(user))


@app.route('/api/sales/lineup-slips', methods=['GET'])
@require_auth
@require_permission('sales.view')
def get_lineup_slips():
    user = request.current_user
    query = LineupSlip.query
    if not all_job_order_branches(user):
        query = query.filter(LineupSlip.branch_id == (user_branch_id(user) or -1))
    slips = query.order_by(LineupSlip.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [lineup_slip_to_dict(s) for s in slips]})

@app.route('/api/sales/lineup-slips', methods=['POST'])
@require_auth
@require_permission('sales.add')
def create_lineup_slip():
    user = request.current_user
    data = request.get_json() or {}

    job_order = JobOrder.query.get(data.get('jobOrderId')) if data.get('jobOrderId') else None
    if not job_order or job_order.status == 'draft':
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 400
    if not can_use_lineup_slip(user, job_order.branch_id):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    branch_code = job_order.branch.code if job_order.branch else 'XX'
    slip = LineupSlip(
        slip_number=generate_lineup_slip_number(branch_code),
        job_order_id=job_order.id,
        branch_id=job_order.branch_id,
        # Default tasks: the order's material and labor lines
        items=data.get('items') or [{'description': it.get('name', ''), 'status': 'pending'}
                                    for it in (job_order.items or [])
                                    if item_category(it) != 'expense' and it.get('name')],
        priority=data.get('priority', 'normal'),
        assigned_to=data.get('assignedTo', ''),
        notes=data.get('notes', ''),
    )
    db.session.add(slip)
    db.session.commit()

    log_action(user['id'], user['fullName'], 'CREATE', 'Sales', f"Created lineup slip: {slip.slip_number}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': lineup_slip_to_dict(slip)}), 201

@app.route('/api/sales/lineup-slips/<int:slip_id>', methods=['PUT'])
@require_auth
@require_permission('sales.edit')
def update_lineup_slip(slip_id):
    user = request.current_user
    slip = LineupSlip.query.get(slip_id)
    if not slip:
        return jsonify({'status': 'error', 'message': 'Lineup slip not found'}), 404
    if not can_use_lineup_slip(user, slip.branch_id):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    data = request.get_json() or {}
    if 'items' in data:
        slip.items = data['items']
    if 'priority' in data:
        slip.priority = data['priority']
    if 'assignedTo' in data:
        slip.assigned_to = data['assignedTo']
    if 'notes' in data:
        slip.notes = data['notes']
    slip.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'status': 'success', 'data': lineup_slip_to_dict(slip)})

# ============================================
# JOB ORDER COSTING MODULE
# ============================================

def user_branch_id(user):
    """Branch a non-admin user is limited to (None if it can't be determined)."""
    if user.get('branchId'):
        return user['branchId']
    if user.get('branch'):
        b = Branch.query.filter_by(name=user['branch']).first()
        return b.id if b else None
    return None

def branch_access_error(user, branch_id, what='job order'):
    """403 response if the user is limited to their own branch and branch_id is
    another one, else None. Always pass the branch stored on the record, never
    one taken from the request."""
    if all_job_order_branches(user) or (branch_id is not None and branch_id == user_branch_id(user)):
        return None
    return jsonify({'status': 'error', 'message': f'This {what} belongs to another branch'}), 403


def costed_job_orders(user):
    """Job orders the user may see for costing: real orders, not drafts or dead ones."""
    query = JobOrder.query.filter(~JobOrder.status.in_(('draft', 'voided', 'cancelled')))
    if not all_branches(user):
        query = query.filter(JobOrder.branch_id == (user_branch_id(user) or -1))
    return query


def revenue_ex_vat(order):
    """What the order earns us: its total less any VAT collected for the government."""
    return vat_breakdown(order.total_price, order.vat_percent)['net']


def job_order_costing(order, extras=None):
    """Estimated and actual cost of one job order, split into materials, labor
    and overhead (the order's other-expense lines).
      materials: estimated = the planned material lines; actual = those plus any
                 extra material issued for the job (recuts, defects, rework)
      labor:     estimated = the labor lines' rates; actual = the workers' actual
                 pay once they have finished
      overhead:  the same on both sides
    Pass extras (that order's extra material logs) when costing many orders."""
    if extras is None:
        extras = job_order_extras(order)
    materials = labor = expenses = estimated_labor = 0.0
    for it in order.items or []:
        qty = float(it.get('quantity') or 0)
        cat = item_category(it)
        if cat == 'labor':
            est = qty * float(it.get('laborCost') or 0)
            estimated_labor += est
            labor += float(it['actualLaborCost']) if it.get('actualLaborCost') is not None else est
        elif cat == 'expense':
            expenses += qty * float(it.get('materialCost') or 0)
        else:
            materials += qty * float(it.get('materialCost') or 0)
    extra = extras_cost(extras)
    estimated_materials = materials
    materials += extra
    total_cost = materials + labor + expenses
    estimated_cost = estimated_materials + estimated_labor + expenses
    revenue = revenue_ex_vat(order)
    profit = revenue - total_cost
    return {
        'materials': round(materials, 2), 'labor': round(labor, 2), 'expenses': round(expenses, 2),
        'estimatedMaterials': round(estimated_materials, 2), 'estimatedLabor': round(estimated_labor, 2),
        'estimatedExpenses': round(expenses, 2), 'extraMaterials': round(extra, 2),
        'totalCost': round(total_cost, 2), 'estimatedCost': round(estimated_cost, 2),
        'revenue': revenue, 'grossProfit': round(profit, 2),
        'profitMargin': round(profit / revenue * 100, 2) if revenue > 0 else 0,
    }


@app.route('/api/costing/all', methods=['GET'])
@require_auth
@require_permission('costing.view')
def get_all_costings():
    orders = costed_job_orders(request.current_user).order_by(JobOrder.created_at.desc()).all()
    extras = extras_by_order([o.id for o in orders])
    result = []
    for order in orders:
        c = job_order_costing(order, extras.get(order.id, []))
        result.append({
            'id': order.id,
            'jobOrderNumber': order.job_order_id,
            'customerName': order.customer_name,
            'materialsCost': c['materials'],
            'laborCost': c['labor'],
            'overheadCost': c['expenses'],
            'extraMaterialsCost': c['extraMaterials'],
            'estimatedCost': c['estimatedCost'],
            'actualCost': c['totalCost'],
            'variance': round(c['totalCost'] - c['estimatedCost'], 2),
            # Revenue before VAT, so profit and margin on the page are real
            'totalAmount': c['revenue'],
            'status': order.status,
        })
    return jsonify({'status': 'success', 'data': result})

@app.route('/api/costing/job-order/<int:order_id>', methods=['GET'])
@require_auth
@require_permission('costing.view')
def get_job_order_costing(order_id):
    order = costed_job_orders(request.current_user).filter(JobOrder.id == order_id).first()
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404

    extras = job_order_extras(order)
    c = job_order_costing(order, extras)

    def component(est, act):
        return {'estimated': money(est), 'actual': money(act), 'variance': money(act - est)}

    # Each line with what it costs us (not its selling price)
    lines = []
    for it in order.items or []:
        cat = item_category(it)
        qty = float(it.get('quantity') or 0)
        if cat == 'labor':
            est = qty * float(it.get('laborCost') or 0)
            act = float(it['actualLaborCost']) if it.get('actualLaborCost') is not None else est
            unit = float(it.get('laborCost') or 0)
        else:
            est = act = qty * float(it.get('materialCost') or 0)
            unit = float(it.get('materialCost') or 0)
        lines.append({'name': it.get('name') or it.get('materialName') or '', 'category': cat, 'quantity': qty,
                      'unitCost': unit, 'estimatedCost': money(est), 'actualCost': money(act),
                      'workerName': it.get('workerName') or None})
    return jsonify({'status': 'success', 'data': {
        'id': order.id,
        'jobOrderId': order.job_order_id,
        'customerName': order.customer_name,
        'status': order.status,
        'items': order.items,
        'lines': lines,
        'components': {
            'materials': component(c['estimatedMaterials'], c['materials']),
            'labor': component(c['estimatedLabor'], c['labor']),
            'overhead': component(c['estimatedExpenses'], c['expenses']),
            'total': component(c['estimatedCost'], c['totalCost']),
        },
        'extraMaterials': [waste_log_to_dict(l) for l in extras],
        'extraMaterialsCost': c['extraMaterials'],
        'estimatedCost': c['estimatedCost'],
        'actualCost': c['totalCost'],
        'materialCost': c['materials'],
        'laborCost': c['labor'],
        'overheadCost': c['expenses'],
        'totalCost': c['totalCost'],
        'totalPrice': c['revenue'],
        'grossProfit': c['grossProfit'],
        'profitMargin': c['profitMargin'],
        'variance': round(c['totalCost'] - c['estimatedCost'], 2),
    }})

@app.route('/api/costing/job-order/<int:order_id>/actual', methods=['PUT'])
@require_auth
@require_permission('costing.edit')
def update_actual_cost(order_id):
    # Actual cost is now worked out from the order's lines and its workers'
    # pay, so it can't be typed in; edit the order's parts instead.
    return jsonify({'status': 'error',
                    'message': "Actual cost is calculated automatically. Edit the job order's parts and labor instead."}), 410

@app.route('/api/costing/variance-report', methods=['GET'])
@require_auth
@require_permission('costing.view')
def get_variance_report():
    orders = costed_job_orders(request.current_user).filter(JobOrder.status.in_(EARNED_STATUSES)).all()
    extras = extras_by_order([o.id for o in orders])
    report = []
    for order in orders:
        c = job_order_costing(order, extras.get(order.id, []))
        if c['totalCost'] <= 0:
            continue
        variance = c['totalCost'] - c['estimatedCost']
        report.append({
            'id': order.id,
            'jobOrderId': order.job_order_id,
            'customerName': order.customer_name,
            'estimatedCost': c['estimatedCost'],
            'actualCost': c['totalCost'],
            'variance': round(variance, 2),
            'materialVariance': round(c['materials'] - c['estimatedMaterials'], 2),
            'laborVariance': round(c['labor'] - c['estimatedLabor'], 2),
            'variancePercent': round(variance / c['estimatedCost'] * 100, 2) if c['estimatedCost'] > 0 else 0,
            'status': 'over' if variance > 0 else 'under' if variance < 0 else 'on_target'
        })
    return jsonify({'status': 'success', 'data': report})

@app.route('/api/costing/receipt/<int:order_id>', methods=['GET'])
@require_auth
@require_permission('sales.view', 'costing.view')
def generate_receipt(order_id):
    user = request.current_user
    order = JobOrder.query.get(order_id)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    if not all_job_order_branches(user) and order.branch_id != user_branch_id(user):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    receipt = {
        'receiptNumber': f"RCP-{order.job_order_id}",
        'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'customer': {
            'name': order.customer_name,
            'phone': order.customer_phone,
            'email': order.customer_email or ''
        },
        'jobOrder': order.job_order_id,
        'branch': order.branch.name if order.branch else '',
        # Customer-facing: materials only, no internal labor or expense lines
        'items': [
            {
                'description': item.get('name', ''),
                'quantity': item.get('quantity', 0),
                'unitPrice': item.get('unitPrice', 0),
                'total': float(item.get('quantity') or 0) * float(item.get('unitPrice') or 0)
            }
            for item in (order.items or []) if item_category(item) == 'material'
        ],
        'subtotal': order.total_price,
        # The total already includes VAT; these show its share
        'total': order.total_price,
        'vatPercent': order.vat_percent,
        'vatAmount': vat_breakdown(order.total_price, order.vat_percent)['vat'],
        'netOfVat': vat_breakdown(order.total_price, order.vat_percent)['net'],
        'downPayment': order.down_payment,
        'balance': order.balance,
        'paymentStatus': order.payment_status
    }
    return jsonify({'status': 'success', 'data': receipt})

# ============================================
# PURCHASE ORDERS
# ============================================

@app.route('/api/purchase-orders', methods=['GET'])
@require_auth
@require_permission('purchase_orders.view')
def get_purchase_orders():
    status = request.args.get('status')
    query = PurchaseOrder.query
    if status:
        query = query.filter_by(status=status)
    pos = query.order_by(PurchaseOrder.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [purchase_order_to_dict(po) for po in pos]})


def purchase_order_to_dict(po):
    day = lambda dt: dt.strftime('%Y-%m-%d') if dt else None
    return {
        'id': po.id,
        'poNumber': po.po_number,
        'supplierId': po.supplier_id,
        'supplierName': po.supplier_name,
        'items': [{**it, 'totalPrice': round(float(it.get('quantity') or 0) * float(it.get('unitPrice') or 0), 2)}
                  for it in (po.items or [])],
        'totalAmount': po.total_amount,
        'status': po.status,
        'expectedDelivery': po.expected_delivery,
        'createdAt': day(po.created_at),
        'createdBy': po.created_by,
        'approvedAt': day(po.approved_at),
        'approvedBy': po.approved_by,
        'receivedAt': day(po.received_at),
    }

@app.route('/api/purchase-orders/<int:po_id>', methods=['GET'])
@require_auth
@require_permission('purchase_orders.view')
def get_purchase_order(po_id):
    po = PurchaseOrder.query.get(po_id)
    if not po:
        return jsonify({'status': 'error', 'message': 'Purchase order not found'}), 404
    return jsonify({'status': 'success', 'data': purchase_order_to_dict(po)})

@app.route('/api/purchase-orders', methods=['POST'])
@require_auth
@require_permission('purchase_orders.add')
def create_purchase_order():
    data = request.get_json() or {}

    required = ['supplierName', 'items', 'expectedDelivery']
    if not all(data.get(f) for f in required):
        return jsonify({'status': 'error', 'message': 'Supplier, at least one item and an expected delivery date are required'}), 400

    if not isinstance(data['items'], list) or not all(isinstance(it, dict) for it in data['items']):
        return jsonify({'status': 'error', 'message': 'Items are not in the right format'}), 400
    items = [{
        'materialId': it.get('materialId'),
        'name': it.get('name', ''),
        'quantity': finite_number(it.get('quantity'), 0.0),
        'unit': it.get('unit', ''),
        'unitPrice': finite_number(it.get('unitPrice'), 0.0),
    } for it in data['items']]
    if any(it['quantity'] is None or it['unitPrice'] is None for it in items):
        return jsonify({'status': 'error', 'message': 'Quantities and unit prices must be numbers'}), 400
    if any(it['quantity'] <= 0 for it in items):
        return jsonify({'status': 'error', 'message': 'Every item needs a quantity above zero'}), 400
    if any(it['unitPrice'] < 0 for it in items):
        return jsonify({'status': 'error', 'message': 'Unit prices cannot be negative'}), 400

    supplier_id = data.get('supplierId')
    if supplier_id and not Supplier.query.get(supplier_id):
        supplier_id = None

    po = PurchaseOrder(
        po_number=generate_po_number(),
        supplier_id=supplier_id,
        supplier_name=data['supplierName'],
        items=items,
        total_amount=round(sum(it['quantity'] * it['unitPrice'] for it in items), 2),
        status='pending',
        expected_delivery=str(data['expectedDelivery'])[:10],
        created_by=request.current_user['id'],
    )
    db.session.add(po)
    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Purchase Orders', f"Created PO: {po.po_number}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': purchase_order_to_dict(po)}), 201

@app.route('/api/purchase-orders/<int:po_id>/approve', methods=['POST'])
@require_auth
@require_permission('purchase_orders.approve')
def approve_purchase_order(po_id):
    po = PurchaseOrder.query.get(po_id)
    if not po:
        return jsonify({'status': 'error', 'message': 'Purchase order not found'}), 404
    if po.status != 'pending':
        return jsonify({'status': 'error', 'message': f'This PO is already {po.status}'}), 400

    po.status = 'approved'
    po.approved_at = datetime.utcnow()
    po.approved_by = request.current_user['id']
    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'APPROVE', 'Purchase Orders', f"Approved PO: {po.po_number}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': purchase_order_to_dict(po)})

@app.route('/api/purchase-orders/<int:po_id>/receive', methods=['POST'])
@require_auth
@require_permission('purchase_orders.receive')
def receive_purchase_order(po_id):
    # Row lock: a second "Receive" waits and then sees the PO already received
    po = PurchaseOrder.query.filter_by(id=po_id).with_for_update().first()
    if not po:
        return jsonify({'status': 'error', 'message': 'Purchase order not found'}), 404

    if po.status != 'approved':
        return jsonify({'status': 'error', 'message': 'PO must be approved first'}), 400

    # Update inventory
    for item in po.items or []:
        material = InventoryMaterial.query.get(item.get('materialId')) if item.get('materialId') else None
        if material:
            material.stock_quantity = float(material.stock_quantity) + float(item['quantity'])
            material.status = 'available'
            material.updated_at = datetime.utcnow()

    po.status = 'received'
    po.received_at = datetime.utcnow()
    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'RECEIVE', 'Purchase Orders', f"Received PO: {po.po_number}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': purchase_order_to_dict(po)})

# Delivery status changes; delivered and cancelled deliveries are final
DELIVERY_TRANSITIONS = {
    'scheduled': {'in_transit', 'delivered', 'cancelled'},
    'in_transit': {'scheduled', 'delivered', 'cancelled'},
}

# Statuses a worker assignment can have (cancelled work is deleted, not kept)
ASSIGNMENT_STATUSES = ('pending', 'in_progress', 'completed')

# ============================================
# DELIVERY MODULE
# ============================================

@app.route('/api/deliveries', methods=['GET'])
@require_auth
@require_permission('item_trail.view')
def get_deliveries():
    user = request.current_user
    query = Delivery.query
    if not all_branches(user):
        bid = user_branch_id(user) or -1
        query = query.filter(db.or_(Delivery.from_branch_id == bid, Delivery.to_branch_id == bid))
    if request.args.get('status'):
        query = query.filter(Delivery.status == request.args['status'])
    if request.args.get('type'):
        query = query.filter(Delivery.type == request.args['type'])
    deliveries_ = query.order_by(Delivery.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [delivery_to_dict(d) for d in deliveries_]})

@app.route('/api/deliveries/<int:delivery_id>', methods=['GET'])
@require_auth
@require_permission('item_trail.view')
def get_delivery(delivery_id):
    d = Delivery.query.get(delivery_id)
    if not d:
        return jsonify({'status': 'error', 'message': 'Delivery not found'}), 404
    if not can_see_delivery(request.current_user, d):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    return jsonify({'status': 'success', 'data': delivery_to_dict(d)})

@app.route('/api/deliveries', methods=['POST'])
@require_auth
@require_permission('item_trail.add')
def create_delivery():
    data = request.get_json() or {}
    if not data.get('type') or not data.get('scheduledDate'):
        return jsonify({'status': 'error', 'message': 'Delivery type and date are required'}), 400

    job_order = JobOrder.query.get(data['jobOrderId']) if data.get('jobOrderId') else None
    if job_order:
        error = branch_access_error(request.current_user, job_order.branch_id)
        if error:
            return error
    # Deliver from the branch that did the job, unless one is given
    from_branch_id = data.get('fromBranchId') or (job_order.branch_id if job_order else None) \
        or user_branch_id(request.current_user)
    if from_branch_id and not Branch.query.get(from_branch_id):
        return jsonify({'status': 'error', 'message': 'Invalid branch'}), 400
    to_branch_id = data.get('toBranchId')
    if to_branch_id and not Branch.query.get(to_branch_id):
        return jsonify({'status': 'error', 'message': 'Invalid destination branch'}), 400

    d = Delivery(
        delivery_number=generate_delivery_number(),
        type=data['type'],
        from_branch_id=from_branch_id,
        to_branch_id=to_branch_id,
        customer_name=data.get('customerName'),
        customer_address=data.get('customerAddress'),
        customer_phone=data.get('customerPhone'),
        job_order_id=job_order.id if job_order else None,
        items=data.get('items') or [],
        status='scheduled',
        scheduled_date=str(data['scheduledDate'])[:10],
        time_slot=data.get('timeSlot'),
        estimated_arrival=data.get('estimatedArrival'),
        driver_name=data.get('driverName', ''),
        driver_contact=data.get('driverContact', ''),
        vehicle_plate=data.get('vehiclePlate', ''),
        notes=data.get('notes', ''),
        created_by=request.current_user['id'],
    )
    db.session.add(d)
    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Delivery', f"Created delivery: {d.delivery_number}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': delivery_to_dict(d)}), 201

@app.route('/api/deliveries/<int:delivery_id>/status', methods=['PUT'])
@require_auth
@require_permission('item_trail.update_status')
def update_delivery_status(delivery_id):
    user = request.current_user
    d = Delivery.query.get(delivery_id)
    if not d:
        return jsonify({'status': 'error', 'message': 'Delivery not found'}), 404
    if not can_see_delivery(user, d):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    new_status = (request.get_json(silent=True) or {}).get('status')
    if new_status not in ['scheduled', 'in_transit', 'delivered', 'cancelled']:
        return jsonify({'status': 'error', 'message': 'Invalid status'}), 400
    if new_status == d.status:
        return jsonify({'status': 'success', 'data': delivery_to_dict(d)})
    if new_status not in DELIVERY_TRANSITIONS.get(d.status, set()):
        return jsonify({'status': 'error', 'message': f"A {(d.status or '').replace('_', ' ')} delivery can't be changed to "
                                                      f"{new_status.replace('_', ' ')}"}), 400
    d.status = new_status
    if new_status == 'delivered':
        d.delivered_at = datetime.utcnow()
        # The job order it carried has now reached the customer
        if d.job_order and d.job_order.status == 'completed':
            d.job_order.status = 'delivered'
            d.job_order.updated_at = datetime.utcnow()
    db.session.commit()

    log_action(user['id'], user['fullName'], 'UPDATE', 'Delivery', f"Updated delivery status: {d.delivery_number} to {new_status}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': delivery_to_dict(d)})

@app.route('/api/deliveries/<int:delivery_id>/receipt', methods=['GET'])
@require_auth
@require_permission('item_trail.view')
def generate_delivery_receipt(delivery_id):
    d = Delivery.query.get(delivery_id)
    if not d:
        return jsonify({'status': 'error', 'message': 'Delivery not found'}), 404
    if not can_see_delivery(request.current_user, d):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    receipt = {
        'receiptNumber': f"DR-{d.delivery_number}",
        'date': datetime.now().strftime('%Y-%m-%d'),
        'deliveryNumber': d.delivery_number,
        'type': d.type,
        'from': d.from_branch.name if d.from_branch else '',
        'to': (d.to_branch.name if d.to_branch else None) or d.customer_name,
        'address': d.customer_address or (d.to_branch.address if d.to_branch else ''),
        'items': d.items or [],
        'driver': d.driver_name or '',
        'vehicle': d.vehicle_plate or '',
        'status': d.status,
        'deliveredAt': delivery_to_dict(d)['deliveredAt'],
    }

    return jsonify({'status': 'success', 'data': receipt})

# ============================================
# SPAM / ABUSE PROTECTION ADMIN ENDPOINTS
# ============================================

@app.route('/api/admin/product-orders/<int:order_id>/flag-spam', methods=['POST'])
@require_auth
@require_permission('product_orders.flag_spam')
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
@require_permission('blacklist.manage')
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
@require_permission('blacklist.manage')
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
@require_permission('blacklist.manage')
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

# Premade sale numbers: PS-0001, ... (PS = premade sale). Older sales were
# numbered PO-0001, ...; they keep those numbers. Supplier purchase orders use
# PO-<year>-<seq>, so the two can no longer be mistaken for each other.
PREMADE_SALE_PREFIX = 'PS-'

def generate_product_order_number():
    """Generate a unique PS-XXXX premade sale number that won't collide."""
    max_id = db.session.query(db.func.max(ProductOrder.id)).scalar() or 0
    candidate = f"{PREMADE_SALE_PREFIX}{max_id + 1:04d}"
    # If somehow it already exists, keep incrementing
    offset = 1
    while ProductOrder.query.filter_by(order_number=candidate).first():
        offset += 1
        candidate = f"{PREMADE_SALE_PREFIX}{max_id + offset:04d}"
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


# Who receives each staff notification: holders of this permission who work at
# the branch concerned, or who have access to every branch
NOTIFICATION_PERMISSIONS = {
    'premade_delivery': 'premade.view',
    'transfer_request': 'product_orders.transfer',
    'transfer_dispatched': 'product_orders.transfer',
    'order_ready': 'product_orders.view',
    'sale_completed': 'product_orders.view',
    'order_cancelled': 'product_orders.view',
}

def notify_branch_users(branch_id, notif_type, title, message, data=None):
    """Push an in-app notification to the staff who handle this kind of event
    at the branch (see NOTIFICATION_PERMISSIONS)."""
    if branch_id is None:
        return
    needed = NOTIFICATION_PERMISSIONS[notif_type]
    staff = (User.query.join(Role, User.role_id == Role.id)
             .filter(Role.key != 'customer', User.is_active == True).all())
    overrides = {}
    for o in UserPermissionOverride.query.filter(
            UserPermissionOverride.user_id.in_([u.id for u in staff] or [-1])).all():
        overrides.setdefault(o.user_id, []).append(o)
    for u in staff:
        perms = effective_permissions(u.id, u.role.key, overrides.get(u.id, []))
        if needed in perms and ('branches.all' in perms or u.branch_id == branch_id):
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
        # Older orders didn't record a rate; their receipts always used the standard 12%
        'vatPercent': order.vat_percent if order.vat_percent is not None else DEFAULT_VAT_PERCENT,
        'vatAmount': vat_breakdown(order.total_amount, order.vat_percent if order.vat_percent is not None
                                   else DEFAULT_VAT_PERCENT)['vat'],
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
    if all_branches(user):
        return True
    user_branch_id = user.get('branchId')
    if not user_branch_id:
        return False
    # Staff at the source or the pickup branch can manage it
    return order.branch_id == user_branch_id or order.pickup_branch_id == user_branch_id

def build_product_order_timeline(order):
    """Build timeline events for a product order using order fields and audit logs."""
    events = []

    if order.created_at:
        events.append({
            'type': 'created',
            'title': 'Order Recorded',
            'description': f"Order {order.order_number} recorded for {order.customer_name or 'the customer'}",
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
        audit_log_to_dict(l) for l in AuditLog.query.filter(
            AuditLog.module == 'Product Orders',
            AuditLog.details.contains(order.order_number),
        ).all()
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

def order_quantity(raw):
    """A whole number of units above zero, or None."""
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value != value or value <= 0 or value != int(value) or value > 1_000_000:
        return None
    return int(value)

def stock_taken_at_placement(item):
    """Orders recorded since stock was reserved on placement (create_product_order,
    and online checkout orders from before it was retired) took each item's stock
    when placed and record the branch it came from; older walk-in orders take it
    when the order is completed."""
    return 'sourceBranchId' in item

def return_placement_stock(order):
    """Put back the stock an order took when it was placed, when the order
    is cancelled. Items whose transfer already arrived stay at the pickup branch.
    Returns an error message if items are still in transit, else None."""
    transfers = {t.source_branch_id: t for t in (order.transfers or []) if t.status != 'cancelled'}
    if any(t.status == 'transferred' for t in transfers.values()):
        return 'Some items are on their way to the pickup branch. Receive them first, then cancel.'
    for item in order.items or []:
        if not stock_taken_at_placement(item):
            continue
        source = item.get('sourceBranchId')
        transfer = transfers.get(source) if source != order.branch_id else None
        if transfer is not None and transfer.status == 'received':
            continue
        product = PremadeProduct.query.filter_by(id=item.get('productId')).with_for_update().first()
        if product:
            product.quantity = float(product.quantity or 0) + float(item.get('quantity') or 0)
    for transfer in transfers.values():
        if transfer.status == 'pending':
            transfer.status = 'cancelled'
    return None

@app.route('/api/product-orders/group/<group_id>', methods=['GET'])
@require_auth
@require_permission('product_orders.view')
@require_permission('branches.all')
def get_product_order_group(group_id):
    """Get all orders belonging to the same multi-branch group (spans branches,
    so it needs cross-branch access)."""
    orders = ProductOrder.query.filter_by(group_id=group_id).order_by(ProductOrder.created_at.asc()).all()
    if not orders:
        return jsonify({'status': 'error', 'message': 'Group not found'}), 404
    return jsonify({'status': 'success', 'data': [product_order_to_dict(o) for o in orders]})


@app.route('/api/product-orders/my-transfer-requests', methods=['GET'])
@require_auth
@require_permission('product_orders.view')
def get_my_transfer_requests():
    """Source branch supervisors see transfer requests assigned to their branch."""
    user = request.current_user
    if not all_branches(user):
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
@require_permission('product_orders.view')
def get_pickup_queue():
    """Orders where this branch is the pickup location and items come from other branches."""
    user = request.current_user
    if not all_branches(user):
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
@require_permission('product_orders.view')
def get_direct_sales():
    """Single-branch premade orders where this branch is both the supplier and pickup.
    These don't generate transfers — they're direct sales from the branch's own stock."""
    user = request.current_user
    if not all_branches(user):
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
@require_permission('product_orders.transfer')
def mark_transfer_sent(transfer_id):
    """Source branch marks their items as sent to the pickup branch."""
    transfer = ProductOrderTransfer.query.filter_by(id=transfer_id).with_for_update().first()
    if not transfer:
        return jsonify({'status': 'error', 'message': 'Transfer request not found'}), 404

    user = request.current_user
    if not all_branches(user) and user.get('branchId') != transfer.source_branch_id:
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

    is_override = all_branches(user) and user.get('branchId') != transfer.source_branch_id
    log_action(user['id'], user['fullName'], 'TRANSFER', 'Product Orders',
        f"{'[ADMIN OVERRIDE] ' if is_override else ''}Transfer {transfer_id} for order {transfer.order.order_number if transfer.order else '?'} dispatched from {transfer.source_branch.name if transfer.source_branch else 'N/A'} to {transfer.order.branch.name if (transfer.order and transfer.order.branch) else 'N/A'}.",
        request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': transfer_to_dict(transfer)})


@app.route('/api/product-order-transfers/<int:transfer_id>/confirm-receipt', methods=['POST'])
@require_auth
@require_permission('product_orders.transfer')
def confirm_transfer_receipt(transfer_id):
    """Pickup branch confirms they received the transferred items; adds to their inventory."""
    # Row lock: a second confirm waits, then sees it already received
    transfer = ProductOrderTransfer.query.filter_by(id=transfer_id).with_for_update().first()
    if not transfer:
        return jsonify({'status': 'error', 'message': 'Transfer request not found'}), 404

    user = request.current_user
    order = transfer.order
    if not all_branches(user) and user.get('branchId') != (order.branch_id if order else None):
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

    is_override = all_branches(user) and user.get('branchId') != (order.branch_id if order else None)
    log_action(user['id'], user['fullName'], 'RECEIVE', 'Product Orders',
        f"{'[ADMIN OVERRIDE] ' if is_override else ''}Transfer {transfer_id} received at {pickup_branch.name if pickup_branch else 'N/A'}. Items added to inventory.",
        request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'data': transfer_to_dict(transfer)})


def build_premade_sale(staff, data):
    """Check a premade sale and add it to the session: the order, and the stock
    it takes off the shelf. Does not commit, so a caller can save other changes
    in the same transaction. Returns (order, branch, None) or
    (None, None, (payload, status))."""
    def fail(message, code=400):
        return None, None, ({'status': 'error', 'message': message}, code)

    # The customer's phone is optional: not every customer gives one
    required = ['customerName', 'items', 'branchId']
    if not all(f in data for f in required) or not str(data['customerName'] or '').strip():
        return fail('Customer name, branch and items are required')
    if not data['items']:
        return fail('At least one item is required')

    try:
        branch_id = int(data['branchId'])
    except (TypeError, ValueError):
        return fail('Invalid branch')
    branch = Branch.query.get(branch_id)
    if not branch or not branch.is_active:
        return fail('Invalid or inactive branch')
    # Staff sell from their own branch's stock unless they work across branches
    if inventory_branch_error(staff, branch.id):
        return fail('You can only record sales for your own branch', 403)

    total_amount = 0
    validated_items = []
    requested_by_product = {}
    stock_deductions = []
    for item in data['items']:
        product_id = item.get('productId')
        quantity = order_quantity(item.get('quantity', 1))
        if quantity is None:
            return fail('Each quantity must be a whole number above zero')

        # Row lock: two orders for the last units can't both take them
        product = PremadeProduct.query.filter_by(id=product_id, is_archived=False).with_for_update().first()
        if not product:
            return fail(f"{item.get('name') or f'Product {product_id}'} is no longer available")

        requested_by_product[product.id] = requested_by_product.get(product.id, 0) + quantity
        if float(product.quantity) < requested_by_product[product.id]:
            return fail(f'Insufficient stock for {product.name}: {float(product.quantity):g} available')

        # Every product comes from the selling branch's own stock
        if int(product.branch_id) != branch_id:
            return fail(f'{product.name} is not available in the selected branch')

        item_total = float(product.price) * quantity
        total_amount += item_total
        validated_items.append({
            'productId': product.id,
            'name': product.name,
            'sku': product.sku,
            'quantity': quantity,
            'unitPrice': float(product.price),
            'total': item_total,
            # Production cost per piece at the time of the sale, so the cost of
            # goods sold doesn't change if the product's cost is edited later
            'unitCost': float(product.cost or 0),
            # Taken from this branch's stock now (stock_taken_at_placement)
            'sourceBranchId': int(product.branch_id),
        })
        stock_deductions.append((product, quantity))

    payment_amount = finite_number(data.get('paymentAmount'), 0.0)
    if payment_amount is None:
        return fail('Payment amount must be a number')
    payment_amount = money(payment_amount)
    # Money taken at the counter is recorded by staff who may take payments,
    # and can't be more than the order costs
    if payment_amount > 0 and not has_perm(staff, 'product_orders.payment'):
        return fail('You do not have permission to record payments', 403)
    if payment_amount < 0 or payment_amount > money(total_amount):
        return fail(f'Payment must be between ₱0 and the order total of ₱{total_amount:,.2f}')
    if payment_amount >= total_amount and total_amount > 0:
        initial_payment_status = 'paid'
    elif payment_amount > 0:
        initial_payment_status = 'partial'
    else:
        initial_payment_status = 'unpaid'

    lock_product_order_numbering()
    order = ProductOrder(
        order_number=generate_product_order_number(),
        customer_name=str(data['customerName']).strip(),
        customer_phone=str(data.get('customerPhone') or '').strip(),
        customer_email=data.get('customerEmail') or '',
        customer_address=data.get('customerAddress') or '',
        items=validated_items,
        total_amount=total_amount,
        vat_percent=current_vat_percent(),  # product prices include VAT
        branch_id=branch_id,
        status='pending',
        payment_status=initial_payment_status,
        amount_paid=payment_amount,
        user_id=staff['id'],
        notes=data.get('notes') or ''
    )
    db.session.add(order)
    # The units are taken off the shelf now, so another order can't promise them
    for product, qty in stock_deductions:
        product.quantity = float(product.quantity) - qty
    return order, branch, None

@app.route('/api/product-orders', methods=['POST'])
@require_auth
@require_permission('sales.add')
def create_product_order():
    """Record a premade product sale made at a branch (walk-in, phone or
    message). Staff only: customers no longer order online."""
    staff = request.current_user
    order, branch, error = build_premade_sale(staff, request.get_json(silent=True) or {})
    if error:
        db.session.rollback()
        payload, code = error
        return jsonify(payload), code
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': NUMBER_CLASH_MESSAGE}), 409

    log_action(staff['id'], staff['fullName'], 'CREATE', 'Product Orders',
               f"Recorded product order {order.order_number} for {order.customer_name} at {branch.name}",
               request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': product_order_to_dict(order)}), 201

# ============================================
# PREMADE JOB ORDER DRAFTS
# ============================================

def generate_premade_draft_number(branch_code):
    """Next draft number for this branch and year (PD-BA-2026-0001, ...)"""
    prefix = f'PD-{branch_code}-{datetime.now().year}-'
    numbers = [int(n[len(prefix):]) for (n,) in
               db.session.query(PremadeDraft.draft_number).filter(PremadeDraft.draft_number.like(f'{prefix}%')).all()
               if n[len(prefix):].isdigit()]
    return f'{prefix}{(max(numbers) + 1 if numbers else 1):04d}'

def premade_draft_availability(draft):
    """Each line checked against stock as it is now. Nothing is taken off or
    dropped: a line whose product sold out stays, flagged, so staff can lower
    it, remove it or wait for stock. Returns (rows, all_ok)."""
    lines = draft.items or []
    ids = [it.get('productId') for it in lines if it.get('productId')]
    products = {p.id: p for p in PremadeProduct.query.filter(PremadeProduct.id.in_(ids or [-1])).all()}
    requested = {}
    for it in lines:
        requested[it.get('productId')] = requested.get(it.get('productId'), 0) + int(it.get('quantity') or 0)
    rows, all_ok = [], bool(lines)
    for it in lines:
        pid = it.get('productId')
        product = products.get(pid)
        qty = int(it.get('quantity') or 0)
        name = (product.name if product else None) or it.get('name') or f'Product {pid}'
        sellable = product is not None and not product.is_archived and product.branch_id == draft.branch_id
        available = float(product.quantity or 0) if sellable else 0.0
        if not sellable:
            issue, message = 'unavailable', f'{name} is no longer sold at this branch.'
        elif available <= 0:
            issue, message = 'out_of_stock', f'{name} is out of stock.'
        elif available < requested[pid]:
            issue, message = 'insufficient', f'Only {available:g} of {name} in stock; the draft needs {requested[pid]}.'
        else:
            issue, message = None, ''
        all_ok = all_ok and issue is None
        price = float(product.price or 0) if product else float(it.get('unitPrice') or 0)
        rows.append({
            'productId': pid, 'name': name, 'sku': product.sku if product else it.get('sku'),
            'quantity': qty, 'available': available,
            'unitPrice': price, 'savedUnitPrice': float(it.get('unitPrice') or 0), 'total': round(price * qty, 2),
            'issue': issue, 'message': message,
        })
    return rows, all_ok

def premade_draft_to_dict(draft):
    rows, all_ok = premade_draft_availability(draft)
    return {
        'id': draft.id,
        'draftNumber': draft.draft_number,
        'status': draft.status,
        'branchId': draft.branch_id,
        'branchName': draft.branch.name if draft.branch else None,
        'customerId': draft.customer_id,
        'customerName': draft.customer_name,
        'customerPhone': draft.customer_phone or '',
        'customerEmail': draft.customer_email or '',
        'customerAddress': draft.customer_address or '',
        'notes': draft.notes or '',
        'paymentMethod': draft.payment_method or 'cash',
        'items': rows,
        'itemCount': sum(r['quantity'] for r in rows),
        # At current prices: what the sale would come to if confirmed now
        'totalAmount': round(sum(r['total'] for r in rows), 2),
        'isAvailable': all_ok,
        'productOrderId': draft.product_order_id,
        'productOrderNumber': draft.product_order.order_number if draft.product_order else None,
        'createdByName': draft.creator.full_name if draft.creator else None,
        'updatedByName': draft.updater.full_name if draft.updater else None,
        'createdAt': fmt_dt(draft.created_at),
        'updatedAt': fmt_dt(draft.updated_at),
        'confirmedAt': fmt_dt(draft.confirmed_at),
    }

def premade_draft_access_error(user, draft):
    """Staff see their own branch's drafts; cross-branch staff see every branch's."""
    if all_job_order_branches(user) or draft.branch_id == user_branch_id(user):
        return None
    return jsonify({'status': 'error', 'message': 'This draft belongs to another branch'}), 403

def apply_premade_draft_fields(draft, data, staff):
    """Copy what was entered onto the draft. Products must be sold at the
    draft's branch, but stock is not checked: a draft may ask for more than is
    on the shelf (the line is flagged, and confirming is refused until it fits).
    Returns an error message, or None."""
    if 'customerName' in data:
        name = (data.get('customerName') or '').strip()
        if not name:
            return 'Customer name is required to save a draft'
        draft.customer_name = name[:255]
    for key, attr, size in (('customerPhone', 'customer_phone', 50), ('customerEmail', 'customer_email', 255),
                            ('customerAddress', 'customer_address', 255), ('paymentMethod', 'payment_method', 30)):
        if key in data:
            setattr(draft, attr, (str(data.get(key) or '').strip()[:size]) or None)
    if 'notes' in data:
        draft.notes = str(data.get('notes') or '').strip() or None
    if 'customerId' in data:
        cid = data.get('customerId')
        draft.customer_id = cid if cid and Customer.query.get(cid) else None
    if 'items' in data:
        raw = data.get('items') or []
        if not isinstance(raw, list):
            return 'Items must be a list'
        previous_ids = {it.get('productId') for it in (draft.items or [])}
        items, by_product = [], {}
        for entry in raw:
            if not isinstance(entry, dict) or not entry.get('productId'):
                continue  # an empty row on the form
            quantity = order_quantity(entry.get('quantity', 1))
            if quantity is None:
                return 'Each quantity must be a whole number above zero'
            product = PremadeProduct.query.get(entry.get('productId'))
            # A product already on the draft may stay even if it was archived since
            if not product or product.branch_id != draft.branch_id or \
                    (product.is_archived and product.id not in previous_ids):
                return f"That product is not sold at {draft.branch.name if draft.branch else 'this branch'}"
            if product.id in by_product:  # the same product twice becomes one line
                by_product[product.id]['quantity'] += quantity
                continue
            line = {'productId': product.id, 'name': product.name, 'sku': product.sku,
                    'quantity': quantity, 'unitPrice': float(product.price or 0)}
            by_product[product.id] = line
            items.append(line)
        draft.items = items
    draft.updated_by = staff['id']
    draft.updated_at = datetime.utcnow()
    return None

def drafts_for(user):
    query = PremadeDraft.query.filter(PremadeDraft.status == 'draft')
    if not all_job_order_branches(user):
        query = query.filter(PremadeDraft.branch_id == (user_branch_id(user) or -1))
    return query

@app.route('/api/premade-drafts', methods=['GET'])
@require_auth
@require_permission('sales.view')
def list_premade_drafts():
    drafts = drafts_for(request.current_user).order_by(PremadeDraft.updated_at.desc()).all()
    return jsonify({'status': 'success', 'data': [premade_draft_to_dict(d) for d in drafts]})

@app.route('/api/premade-drafts/<int:draft_id>', methods=['GET'])
@require_auth
@require_permission('sales.view')
def get_premade_draft(draft_id):
    draft = PremadeDraft.query.get(draft_id)
    if not draft:
        return jsonify({'status': 'error', 'message': 'Draft not found'}), 404
    error = premade_draft_access_error(request.current_user, draft)
    if error:
        return error
    return jsonify({'status': 'success', 'data': premade_draft_to_dict(draft)})

@app.route('/api/premade-drafts', methods=['POST'])
@require_auth
@require_permission('sales.add')
def create_premade_draft():
    staff = request.current_user
    data = request.get_json(silent=True) or {}
    try:
        branch = Branch.query.get(int(data.get('branchId')))
    except (TypeError, ValueError):
        branch = None
    if not branch or not branch.is_active:
        return jsonify({'status': 'error', 'message': 'Choose the branch the products are sold from'}), 400
    if inventory_branch_error(staff, branch.id):
        return jsonify({'status': 'error', 'message': 'You can only prepare drafts for your own branch'}), 403
    if not (data.get('customerName') or '').strip():
        return jsonify({'status': 'error', 'message': 'Customer name is required to save a draft'}), 400

    # Two drafts saved at the same moment can pick the same number; the loser retries
    for attempt in range(3):
        draft = PremadeDraft(branch_id=branch.id, branch=branch, customer_name='', items=[], status='draft',
                             created_by=staff['id'])
        error = apply_premade_draft_fields(draft, data, staff)
        if error:
            db.session.rollback()
            return jsonify({'status': 'error', 'message': error}), 400
        draft.draft_number = generate_premade_draft_number(branch.code)
        db.session.add(draft)
        try:
            db.session.commit()
            break
        except IntegrityError:
            db.session.rollback()
    else:
        return jsonify({'status': 'error', 'message': 'Could not number the draft. Please try again.'}), 409

    log_action(staff['id'], staff['fullName'], 'CREATE', 'Sales',
               f"Saved premade draft {draft.draft_number} for {draft.customer_name}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': premade_draft_to_dict(draft)}), 201

def _locked_open_draft(draft_id):
    """The draft, row-locked so a double-click can't save or confirm it twice,
    or an error response if it can't be changed."""
    draft = PremadeDraft.query.filter_by(id=draft_id).with_for_update().first()
    if not draft:
        return None, (jsonify({'status': 'error', 'message': 'Draft not found'}), 404)
    error = premade_draft_access_error(request.current_user, draft)
    if error:
        return None, error
    if draft.status != 'draft':
        number = draft.product_order.order_number if draft.product_order else 'an order'
        return None, (jsonify({'status': 'error', 'message': f'This draft was already recorded as {number}.'}), 400)
    return draft, None

@app.route('/api/premade-drafts/<int:draft_id>', methods=['PUT'])
@require_auth
@require_permission('sales.add', 'sales.edit')
def update_premade_draft(draft_id):
    draft, error = _locked_open_draft(draft_id)
    if error:
        return error
    error = apply_premade_draft_fields(draft, request.get_json(silent=True) or {}, request.current_user)
    if error:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': error}), 400
    db.session.commit()
    return jsonify({'status': 'success', 'data': premade_draft_to_dict(draft)})

@app.route('/api/premade-drafts/<int:draft_id>', methods=['DELETE'])
@require_auth
@require_permission('sales.delete')
def delete_premade_draft(draft_id):
    draft, error = _locked_open_draft(draft_id)
    if error:
        return error
    number = draft.draft_number
    db.session.delete(draft)
    db.session.commit()
    staff = request.current_user
    log_action(staff['id'], staff['fullName'], 'DELETE', 'Sales', f"Deleted premade draft {number}",
               request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'message': 'Draft deleted'})

@app.route('/api/premade-drafts/<int:draft_id>/confirm', methods=['POST'])
@require_auth
@require_permission('sales.add')
def confirm_premade_draft(draft_id):
    """Record the draft as a real premade order. Stock is checked again here,
    with the product rows locked, whatever the page showed: if anything is short
    nothing is recorded and the draft comes back with its stock flags."""
    staff = request.current_user
    draft, error = _locked_open_draft(draft_id)
    if error:
        return error
    data = request.get_json(silent=True) or {}

    rows, all_ok = premade_draft_availability(draft)
    if not all_ok:
        payload = premade_draft_to_dict(draft)
        db.session.rollback()
        message = ('Some items are out of stock or short. Edit the draft or wait for stock.'
                   if rows else 'Add at least one product before confirming.')
        return jsonify({'status': 'error', 'message': message, 'data': payload}), 409
    payment_method = str(data.get('paymentMethod') or draft.payment_method or 'cash')[:30]
    notes = [draft.notes or '', f'Recorded from draft {draft.draft_number}', f'Payment Method: {payment_method}']
    order, _branch, sale_error = build_premade_sale(staff, {
        'customerName': draft.customer_name, 'customerPhone': draft.customer_phone or '',
        'customerEmail': draft.customer_email, 'customerAddress': draft.customer_address,
        'branchId': draft.branch_id, 'paymentAmount': data.get('paymentAmount') or 0,
        'items': [{'productId': it['productId'], 'quantity': it['quantity'], 'name': it.get('name')}
                  for it in draft.items or []],
        'notes': '\n'.join(n for n in notes if n),
    })
    if sale_error:
        # Stock moved between the check above and the locked re-check: nothing is saved
        db.session.rollback()
        payload, code = sale_error
        return jsonify(payload), code
    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': NUMBER_CLASH_MESSAGE}), 409
    draft.status = 'confirmed'
    draft.product_order_id = order.id
    draft.payment_method = payment_method
    draft.confirmed_at = datetime.utcnow()
    draft.updated_by = staff['id']
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': NUMBER_CLASH_MESSAGE}), 409

    log_action(staff['id'], staff['fullName'], 'CREATE', 'Product Orders',
               f"Recorded product order {order.order_number} for {order.customer_name} from draft {draft.draft_number}",
               request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': product_order_to_dict(order)}), 201

@app.route('/api/product-orders', methods=['GET'])
@require_auth
@require_permission('product_orders.view')
def get_product_orders():
    """Get all product orders - staff endpoint"""
    user = request.current_user
    status = request.args.get('status')
    
    query = ProductOrder.query
    
    if status:
        query = query.filter_by(status=status)
    
    # Supervisors only see orders assigned to their branch.
    if not all_branches(user):
        if not user.get('branchId'):
            return jsonify({'status': 'error', 'message': 'Your account has no assigned branch'}), 400
        query = query.filter_by(branch_id=user['branchId'])
    
    orders = query.order_by(ProductOrder.created_at.desc()).all()
    
    return jsonify({'status': 'success', 'data': [product_order_to_dict(o) for o in orders]})

@app.route('/api/product-orders/<int:order_id>', methods=['PUT'])
@require_auth
@require_permission('product_orders.edit', 'product_orders.payment')
def update_product_order(order_id):
    """Update a product order status"""
    # Row lock: a double-clicked status change can't take or return stock twice
    order = ProductOrder.query.filter_by(id=order_id).with_for_update().first()
    if not order:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404
    
    user = request.current_user
    if not can_manage_product_order(user, order):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    data = request.get_json()
    if ('status' in data or 'notes' in data) and not has_perm(user, 'product_orders.edit'):
        return jsonify({'status': 'error', 'message': 'You do not have permission to edit product orders'}), 403
    if ('addPayment' in data or 'paymentStatus' in data) and not has_perm(user, 'product_orders.payment'):
        return jsonify({'status': 'error', 'message': 'You do not have permission to record payments'}), 403

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
        placed_stock = any(stock_taken_at_placement(it) for it in (order.items or []))
        if previous_status == 'completed' and incoming_status != 'completed':
            return jsonify({'status': 'error', 'message': "A completed order is final and can't be reopened"}), 400
        if previous_status == 'cancelled' and incoming_status != 'cancelled' and placed_stock:
            return jsonify({'status': 'error', 'message': "This order's items went back to stock when it was "
                                                          "cancelled. Place a new order instead."}), 400
        if incoming_status == 'cancelled' and previous_status != 'cancelled':
            error = return_placement_stock(order)
            if error:
                return jsonify({'status': 'error', 'message': error}), 400
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

                if source_branch_id == order.branch_id and stock_taken_at_placement(item):
                    # Checkout order: this item's stock was taken when it was placed
                    continue
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
        paid, total = float(order.amount_paid or 0), float(order.total_amount or 0)
        # Status and amount paid must agree: "paid" records the rest as received;
        # the others only describe what is already recorded
        if data['paymentStatus'] == 'paid':
            order.amount_paid = money(total)
        elif data['paymentStatus'] == 'unpaid' and paid > 0:
            return jsonify({'status': 'error', 'message': f'₱{paid:,.2f} is already recorded as paid on this order'}), 400
        elif data['paymentStatus'] == 'partial' and not (0 < paid < total):
            return jsonify({'status': 'error', 'message': 'Add the amount received to mark this order partly paid'}), 400
        if order.payment_status != data['paymentStatus']:
            updated_fields.append(f"payment: {order.payment_status} -> {data['paymentStatus']}")
        order.payment_status = data['paymentStatus']
    
    if 'addPayment' in data:
        add_amount = finite_number(data.get('addPayment'), 0.0)
        if add_amount is None:
            return jsonify({'status': 'error', 'message': 'Payment amount must be a number'}), 400
        add_amount = money(add_amount)
        remaining = money(max(float(order.total_amount or 0) - float(order.amount_paid or 0), 0))
        if add_amount < 0:
            return jsonify({'status': 'error', 'message': 'Payment amount must be positive'}), 400
        if add_amount > remaining:
            return jsonify({'status': 'error',
                            'message': f"Payment can't be more than the remaining balance of ₱{remaining:,.2f}"
                                       if remaining > 0 else 'This order is already fully paid'}), 400
        if add_amount > 0:
            current_paid = order.amount_paid or 0.0
            order.amount_paid = money(current_paid + add_amount)
            if order.amount_paid >= order.total_amount:
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
@require_permission('product_orders.view')
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
@require_permission('product_orders.view')
def get_product_order_timeline(order_id):
    """Get timeline events for a product order."""
    order = ProductOrder.query.get(order_id)
    if not order:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404

    user = request.current_user
    if not can_manage_product_order(user, order):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    return jsonify({'status': 'success', 'data': build_product_order_timeline(order)})

# ============================================
# NOTIFICATIONS
# ============================================

def my_notifications_query(archived=False):
    """The signed-in user's notifications in the bell (or the archive)."""
    user = request.current_user
    q = Notification.query.filter(Notification.user_id == user['id'])
    return q.filter(Notification.is_archived == True) if archived else q.filter(Notification.is_archived.isnot(True))

@app.route('/api/notifications', methods=['GET'])
@require_auth
def get_notifications():
    limit = min(int(request.args.get('limit', 30)), 100)
    archived = request.args.get('archived') in ('1', 'true')
    notifs = (my_notifications_query(archived)
              .order_by(Notification.created_at.desc())
              .limit(limit).all())
    unread = my_notifications_query().filter(Notification.is_read == False).count()
    return jsonify({
        'status': 'success',
        'data': [{
            'id': n.id, 'type': n.type, 'title': n.title,
            'message': n.message, 'data': n.data,
            'isRead': n.is_read,
            'isArchived': bool(n.is_archived),
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

def _my_notification(notif_id):
    return Notification.query.filter_by(id=notif_id, user_id=request.current_user['id']).first()

@app.route('/api/notifications/<int:notif_id>/read', methods=['POST'])
@require_auth
def mark_notification_read(notif_id):
    n = _my_notification(notif_id)
    if n:
        n.is_read = True
        db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/notifications/<int:notif_id>/archive', methods=['POST'])
@require_auth
def archive_notification(notif_id):
    """Move a notification to the archive (or back with {"archived": false})."""
    n = _my_notification(notif_id)
    if not n:
        return jsonify({'status': 'error', 'message': 'Notification not found'}), 404
    n.is_archived = (request.get_json(silent=True) or {}).get('archived', True) is not False
    if n.is_archived:
        n.is_read = True
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/notifications/<int:notif_id>', methods=['DELETE'])
@require_auth
def delete_notification(notif_id):
    n = _my_notification(notif_id)
    if not n:
        return jsonify({'status': 'error', 'message': 'Notification not found'}), 404
    db.session.delete(n)
    db.session.commit()
    return jsonify({'status': 'success'})

# ============================================
# TRANSFER DASHBOARD + BULK ACTIONS
# ============================================

@app.route('/api/product-orders/transfer-dashboard', methods=['GET'])
@require_auth
@require_permission('product_orders.view')
def get_transfer_dashboard():
    user = request.current_user
    now = datetime.utcnow()
    status_filter = request.args.get('status')

    if not all_branches(user):
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
@require_permission('product_orders.transfer')
def bulk_transfer_action():
    user = request.current_user
    data = request.get_json()
    action = data.get('action')          # 'mark-sent' | 'confirm-receipt'
    transfer_ids = data.get('transferIds', [])
    if not action or not transfer_ids:
        return jsonify({'status': 'error', 'message': 'action and transferIds required'}), 400

    ok, failed = [], []
    for tid in transfer_ids:
        transfer = ProductOrderTransfer.query.filter_by(id=int(tid)).with_for_update().first()
        if not transfer:
            failed.append({'id': tid, 'reason': 'Not found'}); continue

        if action == 'mark-sent':
            if not all_branches(user) and user.get('branchId') != transfer.source_branch_id:
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
            if not all_branches(user) and user.get('branchId') != (order.branch_id if order else None):
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

@app.route('/api/customer-orders', methods=['GET'])
@require_auth
@require_permission('custom_requests.view')
def get_customer_orders():
    """Get customer orders - filtered by branch for non-admin users"""
    user = request.current_user
    
    # Administrators can see all orders
    if all_branches(user):
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
@require_permission('custom_requests.view')
def get_customer_order(order_id):
    """Get a specific customer order"""
    user = request.current_user
    order = CustomerOrder.query.get(order_id)
    if order is None:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404
    
    # Branch-level access control
    if not all_branches(user):
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
@require_permission('custom_requests.edit')
def update_customer_order_status(order_id):
    """Update customer order status"""
    user = request.current_user
    order = CustomerOrder.query.get(order_id)
    if order is None:
        return jsonify({'status': 'error', 'message': 'Order not found'}), 404
    
    # Branch-level access control
    if not all_branches(user):
        if not user_branch_id(user) or order.branch_id != user_branch_id(user):
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

# ============================================
# FORECASTING MODULE
# ============================================

@app.route('/api/forecasting/inventory', methods=['GET'])
@require_auth
@require_permission('forecasting.view')
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

def forecast_branch_id():
    """Admins forecast the whole company (or ?branchId=); supervisors their own branch."""
    user = request.current_user
    if all_branches(user):
        return request.args.get('branchId', type=int)
    return user_branch_id(user) or -1


@app.route('/api/forecasting/demand', methods=['GET'])
@require_auth
@require_permission('forecasting.view')
def get_demand_forecast():
    """Next six months of job orders, projected from the last six months of real
    orders: the average of the latest three months, nudged by the recent trend."""
    bid = forecast_branch_id()
    today = datetime.now().date().replace(day=1)

    def add_months(d, n):
        y, m = divmod(d.month - 1 + n, 12)
        return d.replace(year=d.year + y, month=m + 1)

    history_start = add_months(today, -6)
    q = JobOrder.query.filter(~JobOrder.status.in_(('draft', 'cancelled', 'voided')),
                              JobOrder.created_at >= datetime.combine(history_start, datetime.min.time()))
    if bid is not None:
        q = q.filter(JobOrder.branch_id == bid)

    counts = {add_months(history_start, i): [0, 0.0] for i in range(6)}
    for jo in q.all():
        key = jo.created_at.date().replace(day=1)
        if key in counts:
            counts[key][0] += 1
            counts[key][1] += revenue_ex_vat(jo)

    monthly = [counts[k] for k in sorted(counts)]
    recent = monthly[-3:]
    avg_orders = sum(m[0] for m in recent) / 3
    avg_value = (sum(m[1] for m in monthly) / sum(m[0] for m in monthly)) if any(m[0] for m in monthly) else 0
    # Monthly change between the older and newer three-month halves
    trend = (avg_orders - sum(m[0] for m in monthly[:3]) / 3) / 3
    months_with_data = sum(1 for m in monthly if m[0] > 0)

    forecast = []
    for i in range(1, 7):
        orders = max(round(avg_orders + trend * i), 0)
        forecast.append({
            'month': add_months(today, i).strftime('%b %Y'),
            'forecastedOrders': orders,
            'forecastedRevenue': round(orders * avg_value, 2),
            # Less history and further ahead both mean less confidence
            'confidence': round(max(40 + months_with_data * 8 - i * 4, 10), 1),
        })
    return jsonify({'status': 'success', 'data': forecast})

@app.route('/api/forecasting/materials', methods=['GET'])
@require_auth
@require_permission('forecasting.view')
def get_material_forecast():
    """When each material will hit its reorder point, from the last 30 days of real usage."""
    bid = forecast_branch_id()
    since = datetime.utcnow() - timedelta(days=30)

    usage_q = db.session.query(MaterialUsageLog.material_id, db.func.sum(MaterialUsageLog.quantity_used)) \
        .filter(MaterialUsageLog.created_at >= since, MaterialUsageLog.material_id.isnot(None))
    usage = {mid: float(total or 0) for mid, total in usage_q.group_by(MaterialUsageLog.material_id).all()}

    mat_q = InventoryMaterial.query.filter(InventoryMaterial.is_archived.is_(False))
    if bid is not None:
        mat_q = mat_q.filter(InventoryMaterial.branch_id == bid)

    forecasts = []
    for material in mat_q.all():
        stock = float(material.stock_quantity or 0)
        reorder_point = float(material.low_stock_threshold or 0)
        daily_usage = usage.get(material.id, 0) / 30
        days_until_reorder = int((stock - reorder_point) / daily_usage) if daily_usage > 0 else 999
        forecasts.append({
            'materialId': material.id,
            'name': ' '.join(filter(None, [material.material_type, material.color])).strip(),
            'currentStock': stock,
            'reorderPoint': reorder_point,
            'dailyUsage': round(daily_usage, 2),
            'daysUntilReorder': max(days_until_reorder, 0),
            'recommendedOrderQty': round(max(daily_usage * 30, reorder_point), 2),  # about a month's supply
            'urgency': 'high' if days_until_reorder <= 7 else 'medium' if days_until_reorder <= 14 else 'low'
        })

    urgency_order = {'high': 0, 'medium': 1, 'low': 2}
    forecasts.sort(key=lambda x: (urgency_order[x['urgency']], x['daysUntilReorder']))
    return jsonify({'status': 'success', 'data': forecasts})

# ============================================
# REPORTING MODULE
# ============================================

def ph_report_period():
    """The report period from ?startDate=&endDate= (YYYY-MM-DD, Philippine
    calendar days; default the last 30 days), plus the UTC times that bound it,
    since stored times are UTC. A day runs 00:00-24:00 Philippine time, i.e.
    16:00 UTC the day before. Returns (start, end, start_utc, end_utc, error)."""
    today = manila_today()
    start_date = request.args.get('startDate') or (today - timedelta(days=30)).isoformat()
    end_date = request.args.get('endDate') or today.isoformat()
    try:
        start_utc = datetime.strptime(start_date, '%Y-%m-%d') - PH_OFFSET
        end_utc = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1) - PH_OFFSET - timedelta(microseconds=1)
    except ValueError:
        return None, None, None, None, (jsonify({'status': 'error', 'message': 'Invalid date format'}), 400)
    return start_date, end_date, start_utc, end_utc, None

@app.route('/api/reports/extra-materials', methods=['GET'])
@require_auth
@require_permission('reports.inventory')
def get_extra_materials_report():
    """Extra material issued for job orders in the period (recuts, defects,
    rework): totals by worker and by reason, plus each entry."""
    start_date, end_date, start_dt, end_dt, error = ph_report_period()
    if error:
        return error
    branch_ids, error = inventory_read_branches(request.current_user, request.args.get('branchId'))
    if error:
        return error
    query = MaterialWasteLog.query.filter(MaterialWasteLog.job_order_id.isnot(None),
                                          MaterialWasteLog.created_at >= start_dt,
                                          MaterialWasteLog.created_at <= end_dt)
    if branch_ids is not None:
        query = query.filter(MaterialWasteLog.branch_id.in_(branch_ids or [-1]))
    logs = query.order_by(MaterialWasteLog.created_at.desc()).all()
    entries = [waste_log_to_dict(l) for l in logs]

    def group(key, label):
        out = {}
        for e in entries:
            row = out.setdefault(key(e), {'key': key(e), 'label': label(e), 'count': 0, 'value': 0.0})
            row['count'] += 1
            row['value'] += e['value']
        return sorted(({**r, 'value': money(r['value'])} for r in out.values()), key=lambda r: -r['value'])

    return jsonify({'status': 'success', 'data': {
        'period': {'startDate': start_date, 'endDate': end_date},
        'summary': {
            'count': len(entries),
            'totalValue': money(sum(e['value'] for e in entries)),
            'jobOrders': len({e['jobOrderId'] for e in entries}),
            'unassigned': sum(1 for e in entries if not e['workerId']),
        },
        'byWorker': group(lambda e: e['workerId'] or 0, lambda e: e['workerName'] or 'No worker named'),
        'byReason': group(lambda e: (e['reason'] or '').strip().lower(), lambda e: (e['reason'] or '').strip() or '—'),
        'entries': entries,
    }})

@app.route('/api/reports/sales', methods=['GET'])
@require_auth
@require_permission('reports.sales')
def get_sales_report():
    user = request.current_user
    start_date, end_date, start_dt, end_dt, error = ph_report_period()
    if error:
        return error
    branch_id = request.args.get('branchId')

    # ── Job Orders ── (drafts are not real sales yet, so exclude them)
    jo_query = JobOrder.query.filter(
        JobOrder.created_at >= start_dt,
        JobOrder.created_at <= end_dt,
        JobOrder.status != 'draft'
    )

    user_branch = None
    if not all_branches(user):
        user_branch = Branch.query.get(user_branch_id(user)) if user_branch_id(user) else None
        if user_branch:
            jo_query = jo_query.filter(JobOrder.branch_id == user_branch.id)
        else:
            jo_query = jo_query.filter(False)
    elif branch_id:
        jo_query = jo_query.filter(JobOrder.branch_id == int(branch_id))

    orders = jo_query.all()

    total_orders = len(orders)
    # Revenue excludes VAT (collected for the government); pending balances below stay as billed
    total_revenue = sum(revenue_ex_vat(o) for o in orders if o.status in EARNED_STATUSES)
    total_pending_revenue = sum(float(o.balance) for o in orders if o.payment_status != 'paid')

    status_breakdown = {}
    daily_sales = {}

    for o in orders:
        status = o.status
        if status not in status_breakdown:
            status_breakdown[status] = {'count': 0, 'value': 0}
        status_breakdown[status]['count'] += 1
        status_breakdown[status]['value'] += revenue_ex_vat(o)

        date = (o.created_at + PH_OFFSET).strftime('%Y-%m-%d') if o.created_at else ''
        if date:
            if date not in daily_sales:
                daily_sales[date] = {'orders': 0, 'revenue': 0}
            daily_sales[date]['orders'] += 1
            if o.status in EARNED_STATUSES:
                daily_sales[date]['revenue'] += revenue_ex_vat(o)

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
        if not all_branches(user):
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
        # Revenue excludes the VAT inside product prices, like job orders and the
        # Owner P&L (orders from before rates were saved used the standard 12%)
        rate = po.vat_percent if po.vat_percent is not None else DEFAULT_VAT_PERCENT
        attributed_net = vat_breakdown(attributed_total, rate)['net']

        premade_orders_seen.add(po.id)
        date = (po.created_at + PH_OFFSET).strftime('%Y-%m-%d') if po.created_at else ''
        if date not in premade_daily:
            premade_daily[date] = {'orders': 0, 'revenue': 0}
        premade_daily[date]['orders'] += 1

        if po.status == 'completed':
            premade_revenue += attributed_net
            if date:
                premade_daily[date]['revenue'] += attributed_net
        elif po.status not in ('cancelled',):
            # pending / processing / ready all count as pending revenue
            premade_pending += attributed_total

    report = {
        'period': {'startDate': start_date, 'endDate': end_date},
        'summary': {
            'totalOrders': total_orders,
            'completedOrders': sum(1 for o in orders if o.status in EARNED_STATUSES),
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
@require_permission('reports.inventory')
def get_inventory_report():
    user = request.current_user
    branch_id = request.args.get('branchId')

    # Branch-level access control
    if not all_branches(user):
        if not user_branch_id(user):
            return jsonify({'status': 'error', 'message': 'Your account has no branch'}), 404
        branch_id = user_branch_id(user)

    rm_query = InventoryMaterial.query.filter_by(is_archived=False)
    if branch_id:
        rm_query = rm_query.filter_by(branch_id=int(branch_id))
    rm_items = rm_query.all()

    fg_query = PremadeProduct.query.filter_by(is_archived=False)
    if branch_id:
        fg_query = fg_query.filter_by(branch_id=int(branch_id))
    fg_items = fg_query.all()

    # Stock is valued at what it cost us (its selling price when no cost is recorded),
    # the same as the owner dashboard
    unit_cost = lambda m: float(m.cost_per_unit or 0) or float(m.unit_price or 0)
    total_rm_value = sum(max(float(m.stock_quantity or 0), 0) * unit_cost(m) for m in rm_items)
    total_fg_value = sum(float(fg.quantity) * float(fg.price) for fg in fg_items)
    total_fg_cost = sum(float(fg.quantity) * float(fg.cost) for fg in fg_items)

    global_threshold = global_low_stock_threshold()
    low_stock = [m for m in rm_items if low_stock_state(m, global_threshold)]

    # Category breakdown grouped by material_type
    rm_by_category = {}
    for m in rm_items:
        cat = m.material_type or 'Unknown'
        if cat not in rm_by_category:
            rm_by_category[cat] = {'count': 0, 'value': 0}
        rm_by_category[cat]['count'] += 1
        rm_by_category[cat]['value'] += max(float(m.stock_quantity or 0), 0) * unit_cost(m)

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
                'reorderPoint': effective_reorder_level(m, global_threshold),
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
@require_permission('reports.settlement')
def get_branch_settlement():
    """Inter-branch settlement ledger.
    For every completed multi-branch order, records how much each source branch
    is owed by the pickup branch for items they supplied.
    Admins see all branches; supervisors see entries affecting their branch."""
    user = request.current_user
    start_date, end_date, start_dt, end_dt, error = ph_report_period()
    if error:
        return error

    # Only multi-branch orders (have transfers) are relevant for settlement
    orders = (ProductOrder.query
              .filter(ProductOrder.created_at >= start_dt,
                      ProductOrder.created_at <= end_dt)
              .filter(ProductOrder.shipment_status != 'not_needed')
              .all())

    user_branch_id = user.get('branchId') if not all_branches(user) else None

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


# ============================================
# EXPENSES (payables) AND OWNER DASHBOARD
# ============================================

EXPENSE_CATEGORIES = ['Rent', 'Electricity', 'Water', 'Internet & Phone', 'Salaries & Wages', 'Supplies',
                      'Transportation', 'Repairs & Maintenance', 'Marketing', 'Taxes & Permits', 'Other']
PAYMENT_METHODS = ['cash', 'gcash', 'maya', 'bank_transfer', 'credit_card', 'debit_card', 'check', 'other']

def parse_period():
    """(start, end) dates from ?startDate=&endDate= (YYYY-MM-DD); defaults to
    this year so far. Returns (None, None, error) on bad input."""
    today = manila_today()
    try:
        start = datetime.strptime(request.args['startDate'], '%Y-%m-%d').date() if request.args.get('startDate') \
            else today.replace(month=1, day=1)
        end = datetime.strptime(request.args['endDate'], '%Y-%m-%d').date() if request.args.get('endDate') else today
    except ValueError:
        return None, None, (jsonify({'status': 'error', 'message': 'Dates must be YYYY-MM-DD'}), 400)
    if start > end:
        return None, None, (jsonify({'status': 'error', 'message': 'The start date is after the end date'}), 400)
    return start, end, None

def expense_to_dict(e):
    return {
        'id': e.id,
        'date': e.expense_date.isoformat() if e.expense_date else None,
        'category': e.category,
        'particulars': e.particulars,
        'amount': float(e.amount or 0),
        'paymentMethod': e.payment_method,
        'notes': e.notes,
        'branchId': e.branch_id,
        'branchName': e.branch.name if e.branch else None,
        'createdBy': e.creator.full_name if e.creator else None,
        'createdAt': to_pht(e.created_at) if e.created_at else None,
    }

def scoped_expenses(user):
    q = Expense.query
    if not all_inventory_branches(user):
        q = q.filter(Expense.branch_id == (user_branch_id(user) or -1))
    return q

@app.route('/api/expenses', methods=['GET'])
@require_auth
@require_permission('expenses.view', 'expenses.add')
def list_expenses():
    start, end, error = parse_period()
    if error:
        return error
    q = scoped_expenses(request.current_user).filter(Expense.expense_date >= start, Expense.expense_date <= end)
    if request.args.get('category'):
        q = q.filter(Expense.category == request.args['category'])
    rows = q.order_by(Expense.expense_date.desc(), Expense.id.desc()).all()
    return jsonify({'status': 'success', 'data': {
        'expenses': [expense_to_dict(e) for e in rows],
        'total': money(sum(float(e.amount or 0) for e in rows)),
        'categories': EXPENSE_CATEGORIES,
        'paymentMethods': PAYMENT_METHODS,
    }})

@app.route('/api/expenses', methods=['POST'])
@require_auth
@require_permission('expenses.add')
def create_expense():
    user = request.current_user
    data = request.get_json(silent=True) or {}
    try:
        amount = money(float(data.get('amount')))
        expense_date = datetime.strptime(str(data.get('date') or manila_today()), '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'Enter a valid amount and date'}), 400
    particulars = (data.get('particulars') or '').strip()
    if not amount > 0:
        return jsonify({'status': 'error', 'message': 'Amount must be above zero'}), 400
    if not particulars:
        return jsonify({'status': 'error', 'message': 'Say what the money was spent on'}), 400
    if expense_date > manila_today():
        return jsonify({'status': 'error', 'message': 'The date cannot be in the future'}), 400
    if data.get('category') not in EXPENSE_CATEGORIES:
        return jsonify({'status': 'error', 'message': 'Choose a category'}), 400
    if data.get('paymentMethod') not in PAYMENT_METHODS:
        return jsonify({'status': 'error', 'message': 'Choose how it was paid'}), 400
    branch_id = data.get('branchId') or user_branch_id(user)
    if branch_id and not Branch.query.get(branch_id):
        return jsonify({'status': 'error', 'message': 'Invalid branch'}), 400
    error = inventory_branch_error(user, branch_id)
    if error:
        return jsonify({'status': 'error', 'message': 'You can only log expenses for your own branch'}), 403
    expense = Expense(expense_date=expense_date, category=data['category'], particulars=particulars[:255],
                      amount=amount, payment_method=data['paymentMethod'],
                      notes=(data.get('notes') or '').strip() or None, branch_id=branch_id, created_by=user['id'])
    db.session.add(expense)
    db.session.commit()
    log_action(user['id'], user['fullName'], 'CREATE', 'Expenses',
               f"Logged expense ₱{amount:,.2f} ({expense.category}): {particulars}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': expense_to_dict(expense)}), 201

@app.route('/api/expenses/<int:expense_id>', methods=['DELETE'])
@require_auth
@require_permission('expenses.delete')
def delete_expense(expense_id):
    user = request.current_user
    expense = scoped_expenses(user).filter(Expense.id == expense_id).first()
    if not expense:
        return jsonify({'status': 'error', 'message': 'Expense not found'}), 404
    label = f"₱{float(expense.amount):,.2f} ({expense.category}): {expense.particulars}"
    db.session.delete(expense)
    db.session.commit()
    log_action(user['id'], user['fullName'], 'DELETE', 'Expenses', f"Deleted expense {label}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'message': 'Expense deleted'})


def job_order_finished_on(order):
    """The day a job order's work was finished (older orders: the day created)."""
    if order.completed_at:
        return order.completed_at if not isinstance(order.completed_at, datetime) else order.completed_at.date()
    return (order.created_at + PH_OFFSET).date() if order.created_at else None

def premade_unit_cost(item):
    """Cost per piece saved with the sale; older sales didn't save one, so they
    use the product's current cost."""
    if item.get('unitCost') is not None:
        return float(item['unitCost'])
    product = PremadeProduct.query.get(item.get('productId')) if item.get('productId') else None
    return float(product.cost or 0) if product else 0.0

def owner_financials(start, end, branch_id=None):
    """Earned sales and their costs between two dates (inclusive), by month.

    Sales are what finished orders earned, without the VAT inside them: job
    orders when completed or delivered, premade orders when completed. Cost of
    goods sold is each job's materials, labor and other job costs (the same
    figures as Job Order Costing) plus the production cost of premade items
    sold. Operating expenses are the logged expenses plus material written off
    as waste."""
    months = {}
    def month(d):
        key = d.strftime('%Y-%m')
        return months.setdefault(key, {'month': key, 'sales': 0.0, 'cogs': 0.0, 'opex': 0.0})

    jo_q = JobOrder.query.filter(JobOrder.status.in_(EARNED_STATUSES))
    po_q = ProductOrder.query.filter(ProductOrder.status == 'completed')
    ex_q = Expense.query.filter(Expense.expense_date >= start, Expense.expense_date <= end)
    if branch_id:
        jo_q, po_q = jo_q.filter(JobOrder.branch_id == branch_id), po_q.filter(ProductOrder.branch_id == branch_id)
        ex_q = ex_q.filter(Expense.branch_id == branch_id)

    t = {'jobSales': 0.0, 'premadeSales': 0.0, 'materials': 0.0, 'labor': 0.0, 'jobOther': 0.0, 'premadeCost': 0.0,
         'vatCollected': 0.0, 'jobOrders': 0, 'premadeOrders': 0}
    earned = jo_q.all()
    extras = extras_by_order([o.id for o in earned])
    for o in earned:
        d = job_order_finished_on(o)
        if not d or not (start <= d <= end):
            continue
        c = job_order_costing(o, extras.get(o.id, []))
        t['jobSales'] += c['revenue']
        t['materials'] += c['materials']; t['labor'] += c['labor']; t['jobOther'] += c['expenses']
        t['vatCollected'] += vat_breakdown(o.total_price, o.vat_percent)['vat']
        t['jobOrders'] += 1
        m = month(d); m['sales'] += c['revenue']; m['cogs'] += c['totalCost']
    for o in po_q.all():
        d = ((o.updated_at or o.created_at) + PH_OFFSET).date()
        if not (start <= d <= end):
            continue
        rate = o.vat_percent if o.vat_percent is not None else DEFAULT_VAT_PERCENT
        split = vat_breakdown(o.total_amount, rate)
        cost = sum(premade_unit_cost(it) * float(it.get('quantity') or 0) for it in (o.items or []))
        t['premadeSales'] += split['net']; t['vatCollected'] += split['vat']; t['premadeCost'] += cost
        t['premadeOrders'] += 1
        m = month(d); m['sales'] += split['net']; m['cogs'] += cost

    by_category = {}
    for e in ex_q.all():
        by_category[e.category] = by_category.get(e.category, 0.0) + float(e.amount or 0)
        month(e.expense_date)['opex'] += float(e.amount or 0)
    waste_q = db.session.query(MaterialWasteLog, InventoryMaterial).join(
        InventoryMaterial, InventoryMaterial.id == MaterialWasteLog.material_id)
    if branch_id:
        waste_q = waste_q.filter(MaterialWasteLog.branch_id == branch_id)
    # Extra material issued for a finished job is part of that job's cost (above),
    # in the period the job finished; only the rest is written off here as waste
    finished_ids = {o.id for o in earned}
    waste = 0.0
    for w, mat in waste_q.all():
        if w.job_order_id and w.job_order_id in finished_ids:
            continue
        d = ((w.created_at or datetime.utcnow()) + PH_OFFSET).date()
        if start <= d <= end:
            value = float(w.quantity or 0) * waste_unit_cost(w, mat)
            waste += value
            month(d)['opex'] += value
    if waste:
        by_category['Material waste'] = waste

    sales = t['jobSales'] + t['premadeSales']
    cogs = t['materials'] + t['labor'] + t['jobOther'] + t['premadeCost']
    opex = sum(by_category.values())
    gross = sales - cogs
    net = gross - opex
    monthly = []
    for key in sorted(months):
        m = months[key]
        monthly.append({'month': key, 'sales': money(m['sales']), 'expenses': money(m['cogs'] + m['opex']),
                        'netIncome': money(m['sales'] - m['cogs'] - m['opex'])})
    return {
        'sales': money(sales), 'jobSales': money(t['jobSales']), 'premadeSales': money(t['premadeSales']),
        'cogs': {'materials': money(t['materials']), 'labor': money(t['labor']), 'otherJobCosts': money(t['jobOther']),
                 'premadeProducts': money(t['premadeCost']), 'total': money(cogs)},
        'grossProfit': money(gross),
        'operatingExpenses': {'byCategory': [{'category': k, 'amount': money(v)}
                                             for k, v in sorted(by_category.items(), key=lambda kv: -kv[1])],
                              'total': money(opex)},
        'totalExpenses': money(cogs + opex),
        'netIncome': money(net),
        'profitMargin': round(net / sales * 100, 1) if sales else 0.0,
        'vatCollected': money(t['vatCollected']),
        'orderCounts': {'jobOrders': t['jobOrders'], 'premadeOrders': t['premadeOrders']},
        'monthly': monthly,
    }

def money_by_method(start, end):
    """Cash actually received and spent between two dates, by mode of payment."""
    money_in, money_out = {}, {}
    for p in PaymentRecord.query.all():
        d = ((p.created_at or datetime.utcnow()) + PH_OFFSET).date()
        if start <= d <= end and p.job_order and p.job_order.status not in ('draft',):
            key = p.payment_method or 'cash'
            money_in[key] = money_in.get(key, 0.0) + float(p.amount or 0)
    for o in ProductOrder.query.filter(ProductOrder.amount_paid > 0).all():
        d = ((o.created_at or datetime.utcnow()) + PH_OFFSET).date()
        if start <= d <= end:
            # Premade orders don't record how they were paid
            money_in['not_recorded'] = money_in.get('not_recorded', 0.0) + float(o.amount_paid or 0)
    for e in Expense.query.filter(Expense.expense_date >= start, Expense.expense_date <= end).all():
        money_out[e.payment_method] = money_out.get(e.payment_method, 0.0) + float(e.amount or 0)
    as_list = lambda d: [{'method': k, 'amount': money(v)} for k, v in sorted(d.items(), key=lambda kv: -kv[1])]
    return {'in': as_list(money_in), 'out': as_list(money_out),
            'totalIn': money(sum(money_in.values())), 'totalOut': money(sum(money_out.values()))}

@app.route('/api/owner/summary', methods=['GET'])
@require_auth
@require_permission('owner.view')
def owner_summary():
    """Executive dashboard: this year so far."""
    today = manila_today()
    start = today.replace(month=1, day=1)
    f = owner_financials(start, today)
    cash = money_by_method(start, today)
    month_start = today.replace(day=1)
    this_month = owner_financials(month_start, today)
    receivable = sum(max(float(o.total_price or 0) - float(o.down_payment or 0), 0) for o in
                     JobOrder.query.filter(~JobOrder.status.in_(('draft', 'cancelled', 'voided'))).all()) + \
        sum(max(float(o.total_amount or 0) - float(o.amount_paid or 0), 0) for o in
            ProductOrder.query.filter(ProductOrder.status != 'cancelled').all())
    return jsonify({'status': 'success', 'data': {
        'period': {'startDate': start.isoformat(), 'endDate': today.isoformat()},
        'ytd': {k: f[k] for k in ('sales', 'totalExpenses', 'netIncome', 'profitMargin', 'grossProfit', 'vatCollected')},
        'thisMonth': {k: this_month[k] for k in ('sales', 'totalExpenses', 'netIncome')},
        'receivables': money(receivable),
        'monthly': f['monthly'],
        'cashflowByMethod': cash,
    }})

@app.route('/api/owner/pnl', methods=['GET'])
@require_auth
@require_permission('owner.view')
def owner_pnl():
    start, end, error = parse_period()
    if error:
        return error
    branch_id = request.args.get('branchId', type=int)
    data = owner_financials(start, end, branch_id)
    data['period'] = {'startDate': start.isoformat(), 'endDate': end.isoformat(), 'branchId': branch_id}
    return jsonify({'status': 'success', 'data': data})

@app.route('/api/owner/job-costing', methods=['GET'])
@require_auth
@require_permission('owner.view')
def owner_job_costing():
    """Every finished job order in the period with its margin, least profitable first."""
    start, end, error = parse_period()
    if error:
        return error
    rows = []
    earned = JobOrder.query.filter(JobOrder.status.in_(EARNED_STATUSES)).all()
    extras = extras_by_order([o.id for o in earned])
    for o in earned:
        d = job_order_finished_on(o)
        if not d or not (start <= d <= end):
            continue
        c = job_order_costing(o, extras.get(o.id, []))
        lines = []
        for it in o.items or []:
            cat = item_category(it)
            qty = float(it.get('quantity') or 0)
            if cat == 'labor':
                cost = float(it['actualLaborCost']) if it.get('actualLaborCost') is not None else qty * float(it.get('laborCost') or 0)
            else:
                cost = qty * float(it.get('materialCost') or 0)
            lines.append({'name': it.get('name') or '', 'category': cat, 'quantity': qty,
                          'unitCost': float(it.get('materialCost') or it.get('laborCost') or 0), 'cost': money(cost)})
        for w in extras.get(o.id, []):
            unit = waste_unit_cost(w)
            lines.append({'name': f"Extra: {w.material.material_type if w.material else 'material'} ({w.reason})",
                          'category': 'material', 'quantity': float(w.quantity or 0), 'unitCost': unit,
                          'cost': money(float(w.quantity or 0) * unit), 'extra': True})
        split = vat_breakdown(o.total_price, o.vat_percent)
        rows.append({
            'id': o.id, 'jobOrderId': o.job_order_id, 'customerName': o.customer_name,
            'description': o.description, 'branchName': o.branch.name if o.branch else None,
            'finishedOn': d.isoformat(), 'status': o.status,
            'customerPrice': split['gross'], 'vat': split['vat'], 'sellingPrice': c['revenue'],
            'materials': c['materials'], 'labor': c['labor'], 'otherCosts': c['expenses'],
            'estimatedCost': c['estimatedCost'], 'actualCost': c['totalCost'],
            'extraMaterials': c['extraMaterials'],
            'grossMargin': c['grossProfit'], 'marginPercent': c['profitMargin'], 'lines': lines,
        })
    rows.sort(key=lambda r: r['marginPercent'])
    total_sell = sum(r['sellingPrice'] for r in rows)
    total_margin = sum(r['grossMargin'] for r in rows)
    return jsonify({'status': 'success', 'data': {
        'jobs': rows,
        'totals': {'sellingPrice': money(total_sell), 'materials': money(sum(r['materials'] for r in rows)),
                   'labor': money(sum(r['labor'] for r in rows)), 'otherCosts': money(sum(r['otherCosts'] for r in rows)),
                   'grossMargin': money(total_margin),
                   'marginPercent': round(total_margin / total_sell * 100, 1) if total_sell else 0.0},
    }})

@app.route('/api/owner/receivables', methods=['GET'])
@require_auth
@require_permission('owner.view')
def owner_receivables():
    """Every customer invoice (job orders and premade orders) with what is still owed."""
    invoices = []
    for o in JobOrder.query.filter(~JobOrder.status.in_(('draft', 'cancelled', 'voided'))).all():
        total, paid = float(o.total_price or 0), float(o.down_payment or 0)
        invoices.append({
            'type': 'job_order', 'id': o.id, 'reference': o.job_order_id, 'customerName': o.customer_name,
            'branchName': o.branch.name if o.branch else None, 'orderStatus': o.status,
            'date': to_pht(o.created_at) if o.created_at else None,
            'subtotal': money(total), 'vat': vat_breakdown(total, o.vat_percent)['vat'],
            'totalPaid': money(paid), 'balance': money(max(total - paid, 0)),
            'paymentStatus': 'paid' if total > 0 and paid >= total else 'partial' if paid > 0 else 'unpaid',
            'payments': [{'date': to_pht(p.created_at) if p.created_at else None, 'amount': float(p.amount),
                          'method': p.payment_method, 'reference': p.reference_number,
                          'recordedBy': p.recorder.full_name if p.recorder else None}
                         for p in sorted(o.payment_records, key=lambda p: p.created_at or datetime.min)],
        })
    for o in ProductOrder.query.filter(ProductOrder.status != 'cancelled').all():
        total, paid = float(o.total_amount or 0), float(o.amount_paid or 0)
        rate = o.vat_percent if o.vat_percent is not None else DEFAULT_VAT_PERCENT
        invoices.append({
            'type': 'product_order', 'id': o.id, 'reference': o.order_number, 'customerName': o.customer_name,
            'branchName': o.branch.name if o.branch else None, 'orderStatus': o.status,
            'date': to_pht(o.created_at) if o.created_at else None,
            'subtotal': money(total), 'vat': vat_breakdown(total, rate)['vat'],
            'totalPaid': money(paid), 'balance': money(max(total - paid, 0)),
            'paymentStatus': 'paid' if total > 0 and paid >= total else 'partial' if paid > 0 else 'unpaid',
            # Premade orders keep a running total, not individual payments
            'payments': [{'date': None, 'amount': money(paid), 'method': 'not_recorded', 'reference': None,
                          'recordedBy': None}] if paid > 0 else [],
        })
    invoices.sort(key=lambda i: i['date'] or '', reverse=True)
    status = request.args.get('status')
    if status in ('paid', 'partial', 'unpaid'):
        invoices = [i for i in invoices if i['paymentStatus'] == status]
    return jsonify({'status': 'success', 'data': {
        'invoices': invoices,
        'totals': {'subtotal': money(sum(i['subtotal'] for i in invoices)),
                   'totalPaid': money(sum(i['totalPaid'] for i in invoices)),
                   'balance': money(sum(i['balance'] for i in invoices))},
    }})

@app.route('/api/owner/inventory', methods=['GET'])
@require_auth
@require_permission('owner.view')
def owner_inventory():
    """Where capital sits in stock, what was used up, and what needs restocking."""
    today = manila_today()
    global_threshold = global_low_stock_threshold()
    materials = InventoryMaterial.query.filter(InventoryMaterial.is_archived.is_(False)).all()
    restock, materials_value = [], 0.0
    for m in materials:
        unit_cost = float(m.cost_per_unit or 0) or float(m.unit_price or 0)
        stock = float(m.stock_quantity or 0)
        materials_value += max(stock, 0) * unit_cost
        threshold = effective_reorder_level(m, global_threshold)
        state = low_stock_state(m, global_threshold)
        if state:
            restock.append({'id': m.id, 'name': m.material_type, 'color': m.color, 'branchName': m.branch.name if m.branch else None,
                            'stock': stock, 'threshold': threshold, 'status': state})
    premade = PremadeProduct.query.filter(PremadeProduct.is_archived.is_(False)).all()
    premade_value = sum(max(float(p.quantity or 0), 0) * float(p.cost or 0) for p in premade)

    movements = []
    for log in MaterialUsageLog.query.order_by(MaterialUsageLog.created_at.desc()).limit(40).all():
        movements.append({'date': to_pht(log.created_at) if log.created_at else None, 'direction': 'out' if log.quantity_used >= 0 else 'in',
                          'item': log.material.material_type if log.material else '', 'quantity': abs(float(log.quantity_used)),
                          'reason': log.notes or log.used_in_reference, 'branchName': log.branch.name if log.branch else None})
    for w in MaterialWasteLog.query.order_by(MaterialWasteLog.created_at.desc()).limit(20).all():
        movements.append({'date': to_pht(w.created_at) if w.created_at else None, 'direction': 'out',
                          'item': w.material.material_type if w.material else '', 'quantity': float(w.quantity),
                          'reason': f'Waste: {w.reason}', 'branchName': w.branch.name if w.branch else None})
    for po in PurchaseOrder.query.filter(PurchaseOrder.status == 'received').order_by(PurchaseOrder.received_at.desc()).limit(20).all():
        for it in po.items or []:
            movements.append({'date': to_pht(po.received_at) if po.received_at else None, 'direction': 'in',
                              'item': it.get('name') or '', 'quantity': float(it.get('quantity') or 0),
                              'reason': f'Received {po.po_number} from {po.supplier_name}', 'branchName': None})
    movements.sort(key=lambda m: m['date'] or '', reverse=True)

    cogs = owner_financials(today.replace(month=1, day=1), today)['cogs']
    restock.sort(key=lambda r: (r['status'] != 'out', r['name']))
    return jsonify({'status': 'success', 'data': {
        'materialsValue': money(materials_value), 'premadeValue': money(premade_value),
        'totalValue': money(materials_value + premade_value),
        'cogsYtd': cogs,
        'restock': restock,
        'outOfStock': sum(1 for r in restock if r['status'] == 'out'),
        'lowStock': sum(1 for r in restock if r['status'] == 'low'),
        'movements': movements[:50],
    }})

@app.route('/api/reports/audit-trail', methods=['GET'])
@require_auth
@require_permission('reports.audit_trail')
def get_audit_trail():
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    user_id = request.args.get('userId')
    module = request.args.get('module')
    
    query = AuditLog.query
    # Dates are Philippine-time calendar days; stored times are UTC
    try:
        if start_date:
            query = query.filter(AuditLog.created_at >= datetime.strptime(start_date, '%Y-%m-%d') - PH_OFFSET)
        if end_date:
            query = query.filter(AuditLog.created_at < datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1) - PH_OFFSET)
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format'}), 400
    if user_id:
        query = query.filter(AuditLog.user_id == int(user_id))
    if module:
        query = query.filter(db.func.lower(AuditLog.module) == module.lower())

    logs = query.order_by(AuditLog.created_at.desc()).limit(2000).all()
    return jsonify({'status': 'success', 'data': [audit_log_to_dict(l) for l in logs]})

# ============================================
# SETTINGS MODULE - USER MANAGEMENT
# ============================================

@app.route('/api/settings/users', methods=['GET'])
@require_auth
@require_permission('users.manage')
def get_users():
    include_inactive = request.args.get('includeInactive', 'false').lower() == 'true'
    
    # Staff accounts only: retired online customer accounts can't sign in and
    # aren't managed here (their history stays on the Customers page)
    query = User.query.join(Role, User.role_id == Role.id).filter(Role.key != 'customer')
    if not include_inactive:
        query = query.filter(User.is_active == True)

    users_list = query.all()
    return jsonify({'status': 'success', 'data': [user_to_dict(u) for u in users_list]})

@app.route('/api/settings/users', methods=['POST'])
@require_auth
@require_permission('users.manage')
def create_user():
    data = request.get_json()
    
    required = ['username', 'password', 'email', 'fullName', 'role']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    if not isinstance(data['password'], str) or len(data['password']) < MIN_PASSWORD_LENGTH:
        return jsonify({'status': 'error',
                        'message': f'Password must be at least {MIN_PASSWORD_LENGTH} characters'}), 400
    
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'status': 'error', 'message': 'Username already exists'}), 400
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'status': 'error', 'message': 'Email already exists'}), 400
    
    role = Role.query.filter_by(key=data['role']).first()
    if not role or role.key == 'customer':
        return jsonify({'status': 'error', 'message': 'Invalid role'}), 400
    error = delegation_error(request.current_user, set(), ROLE_DEFAULT_PERMISSIONS.get(role.key, ()), role.key)
    if error:
        return jsonify({'status': 'error', 'message': error}), 403

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
    worker_roles = ['seat_maker', 'sewer']
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
@require_permission('users.manage')
def update_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404
    error = target_account_error(request.current_user, user)
    if error:
        return jsonify({'status': 'error', 'message': error}), 403

    data = request.get_json()

    # Setting someone's password needs the administrator's own password. Checked
    # before anything else changes, since a wrong guess is saved (lockout count).
    resetting_password = bool(data.get('password'))
    if resetting_password:
        if len(data['password']) < MIN_PASSWORD_LENGTH:
            return jsonify({'status': 'error',
                            'message': f'New password must be at least {MIN_PASSWORD_LENGTH} characters.'}), 400
        admin = User.query.get(request.current_user['id'])
        error = check_current_password(admin, data.get('adminPassword'))
        if error:
            body, status = error
            if status == 400:
                return jsonify({'status': 'error', 'message': 'Your password is incorrect.'}), 400
            return error
    
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
        # Retired customer accounts can't be made, nor staff turned into one
        if not role or (role.key == 'customer' and old_role_key != 'customer'):
            return jsonify({'status': 'error', 'message': 'Invalid role'}), 400
        perms_after = effective_permissions(user.id, role.key)
        if role.id != user.role_id:
            error = delegation_error(request.current_user, effective_permissions(user.id, old_role_key),
                                     perms_after, role.key)
            if error:
                return jsonify({'status': 'error', 'message': error}), 403
        if user.id == request.current_user['id'] and 'users.manage' not in perms_after:
            return jsonify({'status': 'error', 'message': "You can't remove your own access to user management"}), 400
        if user.is_active and would_leave_no_user_manager(user.id, perms_after):
            return jsonify({'status': 'error', 'message': 'At least one active account must be able to manage users'}), 400
        if role.id != user.role_id:
            user.role_id = role.id
            prune_redundant_overrides(user.id, role.key)
    if resetting_password:
        user.password = hash_password(data['password'])
        user.failed_login_attempts = 0
        user.lockout_until = None
        end_user_sessions(user.id)  # sign them out everywhere
        log_action(request.current_user['id'], request.current_user['fullName'], 'PASSWORD_RESET_BY_ADMIN', 'Settings',
                   f"Changed the password of {user.username}", request.remote_addr or '0.0.0.0')
        if user.email:
            notice = (f"Hi {user.full_name},\n\nAn administrator changed the password of your Seatmakers Avenue "
                      f"account ({user.username}). Ask them for the new password, then change it on My Profile.\n\n"
                      f"If you did not expect this, contact the shop right away.\n\nSeatmakers Avenue")
            notice_html = (f"<p>Hi {escape(user.full_name)},</p><p>An administrator changed the password of your "
                           f"Seatmakers Avenue account (<b>{escape(user.username)}</b>). Ask them for the new password, "
                           f"then change it on <b>My Profile</b>.</p><p>If you did not expect this, contact the shop "
                           f"right away.</p><p>Seatmakers Avenue</p>")
            threading.Thread(target=send_email, args=(user.email, user.full_name, 'Your password was changed',
                                                      notice, notice_html), daemon=True).start()

    bump_auth_version(user)  # role or branch may have changed
    db.session.commit()

    # Handle Worker profile when role changes
    worker_roles = ['seat_maker', 'sewer']
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
@require_permission('users.manage')
def archive_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404
    
    if user.id == request.current_user['id']:
        return jsonify({'status': 'error', 'message': 'Cannot archive yourself'}), 400
    error = target_account_error(request.current_user, user)
    if error:
        return jsonify({'status': 'error', 'message': error}), 403

    # Archiving blocks login, so the last administrator must stay active.
    if user.role and user.role.key == 'administrator' and last_active_administrator(user):
        return jsonify({'status': 'error',
                        'message': 'Cannot archive the last active administrator'}), 400
    if would_leave_no_user_manager(user.id, set()):
        return jsonify({'status': 'error',
                        'message': 'Cannot archive the last account that can manage users'}), 400

    user.is_active = False
    bump_auth_version(user)  # their open sessions stop working on every worker
    db.session.commit()

    log_action(request.current_user['id'], request.current_user['fullName'], 'ARCHIVE', 'Settings', f"Archived user: {user.username}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'message': 'User archived'})

@app.route('/api/settings/users/<int:user_id>/restore', methods=['POST'])
@require_auth
@require_permission('users.manage')
def restore_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404
    error = target_account_error(request.current_user, user)
    if error:
        return jsonify({'status': 'error', 'message': error}), 403

    user.is_active = True
    bump_auth_version(user)
    db.session.commit()
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'RESTORE', 'Settings', f"Restored user: {user.username}", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'message': 'User restored'})

def user_history_blockers(user_id):
    """Business records that must keep pointing at a real author.

    A user tied to any of these is never hard-deleted — the history would be
    orphaned (or the delete would fail on a NOT NULL foreign key), so the admin
    is told to archive the account instead. Returns human-readable reasons.
    """
    worker_ids = db.session.query(Worker.id).filter_by(user_id=user_id)
    checks = [
        ('job order', JobOrder.query.filter_by(created_by=user_id)),
        ('customer order', CustomerOrder.query.filter_by(user_id=user_id)),
        ('product order', ProductOrder.query.filter_by(user_id=user_id)),
        ('premade draft', PremadeDraft.query.filter(db.or_(
            PremadeDraft.created_by == user_id, PremadeDraft.updated_by == user_id))),
        ('appointment', Appointment.query.filter(db.or_(
            Appointment.user_id == user_id, Appointment.confirmed_by == user_id))),
        ('payment record', PaymentRecord.query.filter_by(recorded_by=user_id)),
        ('payment override request', PaymentOverrideRequest.query.filter(db.or_(
            PaymentOverrideRequest.requested_by == user_id,
            PaymentOverrideRequest.reviewed_by == user_id))),
        ('material usage log', MaterialUsageLog.query.filter_by(used_by=user_id)),
        ('material waste log', MaterialWasteLog.query.filter_by(logged_by=user_id)),
        ('stock transfer', ProductOrderTransfer.query.filter(db.or_(
            ProductOrderTransfer.transferred_by_id == user_id,
            ProductOrderTransfer.received_by_id == user_id))),
        ('chat message', ChatMessage.query.filter_by(sender_id=user_id)),
        ('premade delivery', PremadeStockTransfer.query.filter(db.or_(
            PremadeStockTransfer.created_by_id == user_id,
            PremadeStockTransfer.resolved_by_id == user_id))),
        ('work task', WorkTask.query.filter(WorkTask.worker_id.in_(worker_ids))),
    ]
    blockers = []
    for label, query in checks:
        count = query.count()
        if count:
            blockers.append(f'{count} {label}{"s" if count != 1 else ""}')
    return blockers

@app.route('/api/settings/users/<int:user_id>/delete-check', methods=['GET'])
@require_auth
@require_permission('users.manage')
def check_user_deletable(user_id):
    """Tell the UI whether this account can be permanently deleted, and why not.

    Lets the confirmation dialog warn up front instead of failing on submit.
    """
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    if user.id == request.current_user['id']:
        return jsonify({'status': 'success', 'data': {
            'canDelete': False, 'reason': 'You cannot delete your own account.', 'blockers': []}})
    error = target_account_error(request.current_user, user)
    if error:
        return jsonify({'status': 'success', 'data': {'canDelete': False, 'reason': error, 'blockers': []}})

    if user.role and user.role.key == 'administrator' and last_active_administrator(user):
        return jsonify({'status': 'success', 'data': {
            'canDelete': False,
            'reason': 'This is the last active administrator — deleting it would lock everyone out.',
            'blockers': []}})

    blockers = user_history_blockers(user.id)
    if blockers:
        return jsonify({'status': 'success', 'data': {
            'canDelete': False,
            'reason': 'This account is attached to records that must keep their author. Archive it instead.',
            'blockers': blockers}})

    return jsonify({'status': 'success', 'data': {'canDelete': True, 'reason': '', 'blockers': []}})

def would_leave_no_user_manager(user_id, perms_after):
    """True if user_id ending up with perms_after would leave no active account
    able to manage users (nobody could then fix permissions again)."""
    if 'users.manage' in perms_after:
        return False
    others = (User.query.join(Role, User.role_id == Role.id)
              .filter(User.is_active == True, User.id != user_id, Role.key != 'customer').all())
    return not any('users.manage' in effective_permissions(u.id, u.role.key) for u in others)

def prune_redundant_overrides(user_id, role_key):
    """After a role change, drop grants the new role already has and revokes of
    things it doesn't have, so the overrides list stays meaningful."""
    defaults = ROLE_DEFAULT_PERMISSIONS.get(role_key, frozenset())
    for o in UserPermissionOverride.query.filter_by(user_id=user_id).all():
        if role_key == 'customer' or (o.effect == 'grant') == (o.permission in defaults):
            db.session.delete(o)

def permissions_version(role_key, overrides):
    """Fingerprint of a user's role and overrides. The permissions dialog sends
    back the one it loaded, so a save made from a stale copy is refused instead
    of silently replacing someone else's changes."""
    state = json.dumps([role_key, sorted((o.permission, o.effect) for o in overrides)])
    return hashlib.sha256(state.encode()).hexdigest()[:16]

def user_permissions_payload(user, actor):
    role_key = user.role.key if user.role else None
    overrides = UserPermissionOverride.query.filter_by(user_id=user.id).all()
    # Customer accounts are self-service only
    read_only_reason = ('Customer accounts can\'t be given staff permissions.' if role_key == 'customer'
                        else target_account_error(actor, user))
    return {
        'userId': user.id,
        'role': role_key,
        'roleDefaults': sorted(ROLE_DEFAULT_PERMISSIONS.get(role_key, ())),
        'grants': sorted(o.permission for o in overrides if o.effect == 'grant'),
        'revokes': sorted(o.permission for o in overrides if o.effect == 'revoke'),
        'effective': sorted(effective_permissions(user.id, role_key, overrides)),
        'version': permissions_version(role_key, overrides),
        'editable': read_only_reason is None,
        'readOnlyReason': read_only_reason,
        # Permissions this actor may not hand out or take away (see delegation_error)
        'locked': [] if is_administrator(actor) else sorted(
            PRIVILEGED_PERMISSIONS | (set(PERMISSIONS) - set(actor.get('permissions') or ()))),
    }

@app.route('/api/permissions', methods=['GET'])
@require_auth
@require_permission('users.manage')
def get_permission_catalogue():
    """Every permission grouped by module, plus each role's defaults."""
    modules = [{
        'key': module,
        'label': label,
        'permissions': [{'key': f'{module}.{action}', 'action': action, 'label': action_label}
                        for action, action_label in actions],
    } for module, label, actions in PERMISSION_MODULES]
    return jsonify({'status': 'success', 'data': {
        'modules': modules,
        'roleDefaults': {role: sorted(perms) for role, perms in ROLE_DEFAULT_PERMISSIONS.items()},
    }})

@app.route('/api/users/<int:user_id>/permissions', methods=['GET'])
@require_auth
@require_permission('users.manage')
def get_user_permissions(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404
    return jsonify({'status': 'success', 'data': user_permissions_payload(user, request.current_user)})

@app.route('/api/users/<int:user_id>/permissions', methods=['PUT'])
@require_auth
@require_permission('users.manage')
def set_user_permissions(user_id):
    """Replace a user's overrides. Body: {grants: [...], revokes: [...], version};
    empty lists reset them to their role's defaults. `version` is the one the
    caller loaded; if the permissions changed since, the save is refused (409)."""
    # Row lock: two saves for the same user run one after the other, so the
    # second one sees the first one's version and is refused
    user = User.query.filter_by(id=user_id).with_for_update().first()
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404
    me = request.current_user
    role_key = user.role.key if user.role else None
    if role_key == 'customer':
        return jsonify({'status': 'error', 'message': 'Customer accounts cannot be given staff permissions'}), 400
    error = target_account_error(me, user)
    if error:
        return jsonify({'status': 'error', 'message': error}), 403

    data = request.get_json(silent=True) or {}
    current = UserPermissionOverride.query.filter_by(user_id=user.id).all()
    if not data.get('version'):
        return jsonify({'status': 'error', 'message': 'Reload the permissions and try again.'}), 400
    if data['version'] != permissions_version(role_key, current):
        return jsonify({'status': 'error', 'code': 'stale',
                        'message': "Someone else changed this user's permissions while you were editing. "
                                   "Reload to see the latest, then make your changes again."}), 409
    grants, revokes = data.get('grants') or [], data.get('revokes') or []
    if not isinstance(grants, list) or not isinstance(revokes, list):
        return jsonify({'status': 'error', 'message': 'grants and revokes must be lists'}), 400
    grants, revokes = {str(g) for g in grants}, {str(r) for r in revokes}
    unknown = (grants | revokes) - set(PERMISSIONS)
    if unknown:
        return jsonify({'status': 'error', 'message': f"Unknown permission(s): {', '.join(sorted(unknown))}"}), 400
    if grants & revokes:
        return jsonify({'status': 'error', 'message': 'A permission cannot be both granted and revoked'}), 400

    defaults = ROLE_DEFAULT_PERMISSIONS.get(role_key, frozenset())
    # Granting what the role already has, or revoking what it lacks, changes nothing
    grants -= defaults
    revokes &= defaults
    perms_after = (set(defaults) | grants) - revokes
    error = delegation_error(me, effective_permissions(user.id, role_key, current), perms_after)
    if error:
        return jsonify({'status': 'error', 'message': error}), 403

    if user.id == me['id'] and 'users.manage' not in perms_after:
        return jsonify({'status': 'error', 'message': "You can't remove your own access to user management"}), 400
    if user.is_active and would_leave_no_user_manager(user.id, perms_after):
        return jsonify({'status': 'error', 'message': 'At least one active account must be able to manage users'}), 400

    UserPermissionOverride.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    for perm in grants:
        db.session.add(UserPermissionOverride(user_id=user.id, permission=perm, effect='grant', created_by=me['id']))
    for perm in revokes:
        db.session.add(UserPermissionOverride(user_id=user.id, permission=perm, effect='revoke', created_by=me['id']))
    bump_auth_version(user)
    db.session.commit()

    summary = []
    if grants:
        summary.append(f"granted {', '.join(sorted(grants))}")
    if revokes:
        summary.append(f"revoked {', '.join(sorted(revokes))}")
    log_action(me['id'], me['fullName'], 'PERMISSIONS', 'Settings',
               f"Set permissions of {user.username}: {'; '.join(summary) or 'reset to role defaults'}",
               request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': user_permissions_payload(user, me)})

def last_active_administrator(user):
    """True if removing/deactivating `user` would leave no active administrator."""
    return User.query.join(Role).filter(
        Role.key == 'administrator',
        User.is_active.is_(True),
        User.id != user.id,
    ).count() == 0

@app.route('/api/settings/users/<int:user_id>', methods=['DELETE'])
@require_auth
@require_permission('users.manage')
def delete_user(user_id):
    """Permanently delete a user account.

    Only allowed for accounts with no business history (e.g. one created by
    mistake). Anything else must be archived so its records keep an author.
    """
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    if user.id == request.current_user['id']:
        return jsonify({'status': 'error', 'message': 'You cannot delete your own account'}), 400
    error = target_account_error(request.current_user, user)
    if error:
        return jsonify({'status': 'error', 'message': error}), 403

    if user.role and user.role.key == 'administrator' and last_active_administrator(user):
        return jsonify({'status': 'error',
                        'message': 'Cannot delete the last active administrator'}), 400
    if user.is_active and would_leave_no_user_manager(user.id, set()):
        return jsonify({'status': 'error',
                        'message': 'Cannot delete the last account that can manage users'}), 400

    blockers = user_history_blockers(user.id)
    if blockers:
        return jsonify({
            'status': 'error',
            'message': 'This user has existing records (' + ', '.join(blockers) +
                       ') and cannot be deleted. Archive the account instead.',
            'blockers': blockers,
        }), 409

    username = user.username
    full_name = user.full_name
    try:
        # These rows belong to the account itself and carry no history worth keeping.
        Notification.query.filter_by(user_id=user.id).delete(synchronize_session=False)
        Worker.query.filter_by(user_id=user.id).delete(synchronize_session=False)
        UserSession.query.filter_by(user_id=user.id).delete(synchronize_session=False)
        PasswordResetCode.query.filter_by(user_id=user.id).delete(synchronize_session=False)
        EmailChangeCode.query.filter_by(user_id=user.id).delete(synchronize_session=False)
        # Their own permission changes go with the account; changes they made to
        # other users stay in force, just without the author
        UserPermissionOverride.query.filter_by(user_id=user.id).delete(synchronize_session=False)
        UserPermissionOverride.query.filter_by(created_by=user.id).update(
            {'created_by': None}, synchronize_session=False)
        # The customer record (and its job orders) stays, just without the online account
        Customer.query.filter_by(user_id=user.id).update({'user_id': None}, synchronize_session=False)
        # Announcements outlive their author — keep the post, drop the byline.
        Expense.query.filter_by(created_by=user.id).update({'created_by': None}, synchronize_session=False)
        Announcement.query.filter_by(created_by_id=user.id).update(
            {'created_by_id': None}, synchronize_session=False)

        db.session.delete(user)
        db.session.commit()
    except IntegrityError:
        # A foreign key we don't check above still points at this user — most
        # likely a table left over from an older migration. Never leave the
        # session dirty, and tell the admin to archive instead of failing blind.
        db.session.rollback()
        return jsonify({
            'status': 'error',
            'message': 'This user is still linked to other records and cannot be deleted. '
                       'Archive the account instead.',
            'blockers': [],
        }), 409

    log_action(request.current_user['id'], request.current_user['fullName'], 'DELETE', 'Settings',
               f"Permanently deleted user: {username} ({full_name})", request.remote_addr or '0.0.0.0')

    return jsonify({'status': 'success', 'message': 'User permanently deleted'})

@app.route('/api/settings/roles', methods=['GET'])
@require_auth
@require_permission('users.manage')
def get_roles():
    roles = Role.query.filter(Role.key != 'customer').all()
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
@require_staff
def get_branches():
    """Get all branches from database"""
    include_inactive = request.args.get('includeInactive', 'false').lower() == 'true'
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'

    # Deleted branches never come back; archived ones only when asked for
    query = Branch.query.filter(Branch.deleted_at.is_(None))
    if not include_inactive:
        query = query.filter_by(is_active=True)
    elif not include_archived:
        query = query.filter(Branch.archived_at.is_(None))
    branches_list = query.all()
    
    return jsonify({'status': 'success', 'data': [branch_to_dict(b) for b in branches_list]})

@app.route('/api/settings/branches/public', methods=['GET'])
def get_branches_public():
    """The active retail branches, for the website's Branches section and for
    choosing the branch on a job order. Only what a visitor may see: no
    warehouse, nothing internal."""
    branches_list = (Branch.query.filter_by(is_active=True, is_warehouse=False)
                     .order_by(Branch.name).all())
    return jsonify({'status': 'success', 'data': [{
        'id': b.id, 'name': b.name, 'code': b.code, 'address': b.address, 'phone': b.phone,
        'isWarehouse': False, 'isActive': True,
    } for b in branches_list]})

@app.route('/api/settings/branches', methods=['POST'])
@require_auth
@require_permission('branches.manage')
def create_branch():
    """Create a new branch"""
    data = request.get_json()
    
    required = ['name', 'code', 'address']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    # Check if code already exists
    existing = Branch.query.filter_by(code=data['code']).first()
    if existing:
        message = ('Branch code already exists' if existing.deleted_at is None
                   else 'This code belonged to a deleted branch. Choose another code.')
        return jsonify({'status': 'error', 'message': message}), 400
    
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
@require_permission('branches.manage')
def update_branch(branch_id):
    """Update a branch"""
    branch = Branch.query.get(branch_id)
    if not branch or branch.deleted_at is not None:
        return jsonify({'status': 'error', 'message': 'Branch not found'}), 404
    
    data = request.get_json()
    
    if 'name' in data:
        branch.name = data['name']
    if 'code' in data:
        new_code = str(data['code'] or '').strip().upper()
        if not new_code:
            return jsonify({'status': 'error', 'message': 'Branch code is required'}), 400
        # Check if new code conflicts with another branch (deleted ones keep theirs)
        existing = Branch.query.filter_by(code=new_code).first()
        if existing and existing.id != branch_id:
            message = ('Branch code already exists' if existing.deleted_at is None
                       else 'This code belonged to a deleted branch. Choose another code.')
            return jsonify({'status': 'error', 'message': message}), 400
        if new_code != branch.code:
            rename_branch_sku_suffixes(branch, branch.code, new_code)
            branch.code = new_code
    if 'address' in data:
        branch.address = data['address']
    if 'isWarehouse' in data:
        branch.is_warehouse = data['isWarehouse']
    if 'isActive' in data and bool(data['isActive']) != bool(branch.is_active):
        branch.is_active = bool(data['isActive'])
        if branch.is_active:
            # Reactivating restarts the lifecycle (and the 30-day delete clock)
            branch.deactivated_at = None
            branch.archived_at = None
        else:
            branch.deactivated_at = datetime.utcnow()
    if 'phone' in data:
        branch.phone = data['phone'] or None

    db.session.commit()
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Settings', f"Updated branch: {branch.name}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': branch_to_dict(branch)})

def rename_branch_sku_suffixes(branch, old_code, new_code):
    """Stock received at a branch gets a SKU ending in the branch code
    (e.g. FG-001-BA, or FG-001-BA-2), and lookups rebuild that SKU from the
    current code. Carry the branch's SKUs over to the new code so items already
    received are still found. A SKU whose new form is taken is left as is."""
    pattern = re.compile(rf'-{re.escape(old_code)}(-\d+)?$')
    for product in PremadeProduct.query.filter_by(branch_id=branch.id).all():
        match = pattern.search(product.sku or '')
        if not match:
            continue
        new_sku = product.sku[:match.start()] + f'-{new_code}' + (match.group(1) or '')
        if not PremadeProduct.query.filter(PremadeProduct.sku == new_sku, PremadeProduct.id != product.id).first():
            product.sku = new_sku

BRANCH_DELETE_WAIT_DAYS = 30

def branch_record_blockers(branch):
    """Every record that points at this branch, as human-readable counts.

    Found from the foreign keys themselves, so a new table that references
    branches is covered without updating a list here."""
    blockers = []
    for table in db.metadata.sorted_tables:
        if table.name == 'branches':
            continue
        cols = [c for c in table.columns
                if any(fk.target_fullname == 'branches.id' for fk in c.foreign_keys)]
        if not cols:
            continue
        count = db.session.execute(
            db.select(db.func.count()).select_from(table)
            .where(db.or_(*[c == branch.id for c in cols]))
        ).scalar()
        if count:
            blockers.append(f"{count} {table.name.replace('_', ' ')}")
    return blockers

def branch_delete_check(branch):
    """(can_delete, reason, blockers) for deleting this branch."""
    if branch.is_warehouse and Branch.query.filter(
            Branch.is_warehouse.is_(True), Branch.deleted_at.is_(None), Branch.id != branch.id).count() == 0:
        return False, 'This is the only warehouse. Stock flows depend on it, so it cannot be deleted.', []

    active_users = User.query.filter(
        User.is_active.is_(True),
        db.or_(User.branch_id == branch.id, User.branch == branch.name)).count()
    if active_users:
        return (False,
                f"{active_users} active user account{'s are' if active_users != 1 else ' is'} assigned to this branch. "
                'Move them to another branch or deactivate them first.', [])

    blockers = branch_record_blockers(branch)
    if not blockers:
        return True, '', []

    if branch.is_active or branch.deactivated_at is None:
        return (False,
                f'This branch has existing records. Deactivate it first; it can be deleted '
                f'{BRANCH_DELETE_WAIT_DAYS} days after deactivation.', blockers)
    eligible_at = branch.deactivated_at + timedelta(days=BRANCH_DELETE_WAIT_DAYS)
    now = datetime.utcnow()
    if now < eligible_at:
        days_left = (eligible_at - now).days + 1
        return (False,
                f'This branch has existing records, so it must stay deactivated for '
                f'{BRANCH_DELETE_WAIT_DAYS} days before it can be deleted. '
                f"{days_left} day{'s' if days_left != 1 else ''} left.", blockers)
    return True, '', blockers

@app.route('/api/settings/branches/<int:branch_id>/archive', methods=['POST'])
@require_auth
@require_permission('branches.manage')
def archive_branch(branch_id):
    """Archive a branch: deactivated and hidden from the branch list."""
    branch = Branch.query.get(branch_id)
    if not branch or branch.deleted_at is not None:
        return jsonify({'status': 'error', 'message': 'Branch not found'}), 404
    now = datetime.utcnow()
    if branch.is_active:
        branch.is_active = False
        branch.deactivated_at = now
    branch.archived_at = branch.archived_at or now
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Settings', f"Archived branch: {branch.name}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': branch_to_dict(branch)})

@app.route('/api/settings/branches/<int:branch_id>/unarchive', methods=['POST'])
@require_auth
@require_permission('branches.manage')
def unarchive_branch(branch_id):
    """Bring an archived branch back to the list. It stays deactivated."""
    branch = Branch.query.get(branch_id)
    if not branch or branch.deleted_at is not None:
        return jsonify({'status': 'error', 'message': 'Branch not found'}), 404
    branch.archived_at = None
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Settings', f"Restored archived branch: {branch.name}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': branch_to_dict(branch)})

@app.route('/api/settings/branches/<int:branch_id>/delete-check', methods=['GET'])
@require_auth
@require_permission('branches.manage')
def check_branch_deletable(branch_id):
    """Lets the confirmation dialog say up front whether the delete will go through."""
    branch = Branch.query.get(branch_id)
    if not branch or branch.deleted_at is not None:
        return jsonify({'status': 'error', 'message': 'Branch not found'}), 404
    can_delete, reason, blockers = branch_delete_check(branch)
    return jsonify({'status': 'success', 'data': {
        'canDelete': can_delete, 'reason': reason, 'blockers': blockers}})

@app.route('/api/settings/branches/<int:branch_id>', methods=['DELETE'])
@require_auth
@require_permission('branches.manage')
def delete_branch(branch_id):
    """Delete a branch. The row is kept (marked deleted) so the records that
    point at it keep their branch; it no longer appears anywhere."""
    branch = Branch.query.get(branch_id)
    if not branch or branch.deleted_at is not None:
        return jsonify({'status': 'error', 'message': 'Branch not found'}), 404
    can_delete, reason, _ = branch_delete_check(branch)
    if not can_delete:
        return jsonify({'status': 'error', 'message': reason}), 400
    now = datetime.utcnow()
    branch.is_active = False
    branch.deactivated_at = branch.deactivated_at or now
    branch.deleted_at = now
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'DELETE', 'Settings', f"Deleted branch: {branch.name}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'data': None})

@app.route('/api/settings/system', methods=['GET'])
@require_auth
@require_staff
def get_system_settings():
    settings = SystemSetting.query.filter(~SystemSetting.key.startswith('_')).all()
    return jsonify({'status': 'success', 'data': {s.key: s.value for s in settings}})

@app.route('/api/settings/system/<key>', methods=['PUT'])
@require_auth
@require_permission('settings.edit')
def update_system_setting(key):
    if key.startswith('_'):  # internal rows (e.g. numbering locks), not settings
        return jsonify({'status': 'error', 'message': 'Unknown setting'}), 400
    data = request.get_json() or {}
    value = str(data.get('value', '')).strip()
    if key == 'vat_percent':
        error = vat_percent_error(value)
        if error:
            return jsonify({'status': 'error', 'message': error}), 400
        value = str(Decimal(value).normalize() if Decimal(value) != 0 else 0)  # '12.00' -> '12'
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
# MANAGED WORKERS & ASSIGNMENTS
# ============================================

# Login roles a Worker Management worker can be linked to
WORKER_ACCOUNT_ROLES = ('seat_maker', 'sewer')

def managed_worker_to_dict(w):
    return {
        'id': w.id,
        'name': w.name,
        'workType': w.work_type,
        # Pay rates are payroll: only for those who see labor cost
        'ratePerHour': w.rate_per_hour if sees_labor_cost(request.current_user) else None,
        'payMode': w.pay_mode or 'per_hour',
        'isActive': w.is_active,
        'createdAt': fmt_dt(w.created_at),
        'userId': w.user_id,
        'userName': (w.user.full_name or w.user.username) if w.user else None,
    }

@app.route('/api/managed-workers', methods=['GET'])
@require_auth
@require_permission('workers.view', 'sales.edit')
def list_managed_workers():
    workers = ManagedWorker.query.order_by(ManagedWorker.name).all()
    return jsonify({'status': 'success', 'data': {'workers': [managed_worker_to_dict(w) for w in workers]}})

@app.route('/api/managed-workers/linkable-accounts', methods=['GET'])
@require_auth
@require_permission('workers.edit')
def list_linkable_worker_accounts():
    """Seat maker and sewer logins, with the worker each is linked to (if any)."""
    linked = dict(db.session.query(ManagedWorker.user_id, ManagedWorker.id).filter(ManagedWorker.user_id.isnot(None)))
    users = (User.query.join(Role, Role.id == User.role_id)
             .filter(Role.key.in_(WORKER_ACCOUNT_ROLES), User.is_active.is_(True))
             .order_by(User.full_name).all())
    return jsonify({'status': 'success', 'data': [
        {'id': u.id, 'fullName': u.full_name, 'username': u.username, 'linkedWorkerId': linked.get(u.id)}
        for u in users
    ]})

@app.route('/api/managed-workers', methods=['POST'])
@require_auth
@require_permission('workers.add')
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
    db.session.flush()
    error = link_worker_account(worker, data)
    if error:
        db.session.rollback()
        return error
    db.session.commit()
    return jsonify({'status': 'success', 'data': {'worker': managed_worker_to_dict(worker)}}), 201

def link_worker_account(worker, data):
    """Set or clear the worker's login from data['userId'] (if given). Error response or None."""
    if 'userId' not in data:
        return None
    if not data['userId']:
        worker.user_id = None
        return None
    try:
        account = User.query.get(int(data['userId']))
    except (TypeError, ValueError):
        account = None
    if not account or not account.role or account.role.key not in WORKER_ACCOUNT_ROLES:
        return jsonify({'status': 'error', 'message': 'Choose a seat maker or sewer account'}), 400
    other = ManagedWorker.query.filter(ManagedWorker.user_id == account.id, ManagedWorker.id != worker.id).first()
    if other:
        return jsonify({'status': 'error', 'message': f'That account is already linked to {other.name}'}), 400
    worker.user_id = account.id
    return None

@app.route('/api/managed-workers/<int:worker_id>', methods=['PUT'])
@require_auth
@require_permission('workers.edit')
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
    error = link_worker_account(worker, data)
    if error:
        db.session.rollback()
        return error
    db.session.commit()
    return jsonify({'status': 'success', 'data': {'worker': managed_worker_to_dict(worker)}})

@app.route('/api/my-work', methods=['GET'])
@require_auth
def get_my_work():
    """A worker's own assignments, for the seat maker / sewer dashboard."""
    worker = ManagedWorker.query.filter_by(user_id=request.current_user['id']).first()
    if not worker:
        return jsonify({'status': 'success', 'data': {'linked': False}})
    rows = WorkerAssignment.query.filter_by(worker_id=worker.id).order_by(WorkerAssignment.created_at.desc()).all()
    order_ids = {a.job_order_db_id for a in rows if a.job_order_db_id}
    orders = {o.id: o for o in JobOrder.query.filter(JobOrder.id.in_(order_ids))} if order_ids else {}
    return jsonify({'status': 'success', 'data': {
        'linked': True,
        'worker': {'name': worker.name, 'workType': worker.work_type, 'payMode': worker.pay_mode or 'per_hour'},
        'assignments': [{
            'id': a.id,
            'jobOrderRef': a.job_order_ref,
            'title': a.special_task_title if a.assignment_type == 'special_task' else a.job_order_ref,
            'description': a.description,
            'customerName': orders[a.job_order_db_id].customer_name if a.job_order_db_id in orders else None,
            'vehicle': orders[a.job_order_db_id].vehicle_info if a.job_order_db_id in orders else None,
            'priority': (orders[a.job_order_db_id].priority if a.job_order_db_id in orders else None) or 'normal',
            'scheduledDate': a.scheduled_date.isoformat() if a.scheduled_date else None,
            'status': a.status,
            'hoursWorked': a.hours_worked,
            'pay': a.pay if a.status == 'completed' else None,
            'endTime': fmt_dt(a.end_time),
        } for a in rows],
    }})

@app.route('/api/managed-workers/<int:worker_id>', methods=['DELETE'])
@require_auth
@require_permission('workers.delete')
def deactivate_managed_worker(worker_id):
    worker = ManagedWorker.query.get(worker_id)
    if not worker:
        return jsonify({'error': 'Worker not found'}), 404
    worker.is_active = False
    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Worker deactivated'})

@app.route('/api/worker-assignments', methods=['GET'])
@require_auth
@require_permission('workers.view')
def list_worker_assignments():
    worker_id = request.args.get('workerId', type=int)
    query = WorkerAssignment.query
    if worker_id:
        query = query.filter_by(worker_id=worker_id)
    assignments = query.order_by(WorkerAssignment.created_at.desc()).all()
    order_ids = {a.job_order_db_id for a in assignments if a.job_order_db_id}
    priorities = dict(db.session.query(JobOrder.id, JobOrder.priority).filter(JobOrder.id.in_(order_ids))) \
        if order_ids else {}
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
            'jobOrderPriority': priorities.get(a.job_order_db_id) or 'normal',
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
@require_permission('workers.assign')
def create_worker_assignment():
    data = request.get_json()
    worker_id = data.get('workerId')
    job_order_ref = (data.get('jobOrderRef') or '').strip()
    if not worker_id or not job_order_ref:
        return jsonify({'error': 'workerId and jobOrderRef are required'}), 400
    worker = ManagedWorker.query.get(worker_id)
    if not worker:
        return jsonify({'error': 'Worker not found'}), 404
    description = (data.get('description', '') or '').strip()
    assignment_type = data.get('assignmentType', 'job_order')
    if assignment_type not in ('job_order', 'special_task'):
        assignment_type = 'job_order'

    order = None
    if assignment_type == 'job_order':
        order = (JobOrder.query.get(data['jobOrderDbId']) if data.get('jobOrderDbId')
                 else JobOrder.query.filter_by(job_order_id=job_order_ref).first())
        if not order:
            return jsonify({'error': 'Job order not found'}), 404
        if branch_access_error(request.current_user, order.branch_id):
            return jsonify({'error': 'This job order belongs to another branch'}), 403
        if order.status in ('draft', 'cancelled', 'voided'):
            return jsonify({'error': f'Workers cannot be assigned to a {order.status} job order'}), 400
        if not description:
            # Name the task after the worker's trade so the job order's labor line reads sensibly
            description = worker.work_type.replace('_', ' ').title()

    # Prevent exact duplicates (same worker + job order + task). Special tasks all
    # share one reference, so their title is part of what makes them different.
    existing = None
    if assignment_type == 'job_order':
        existing = WorkerAssignment.query.filter_by(
            worker_id=worker_id, job_order_db_id=order.id, description=description,
        ).first()
    scheduled_date = None
    if data.get('scheduledDate'):
        try:
            from datetime import date as _date
            scheduled_date = _date.fromisoformat(data['scheduledDate'])
        except Exception:
            pass
    if existing:
        # Assigning it again with a date (dropped on the calendar) schedules the
        # existing assignment for that day instead of being silently ignored
        if scheduled_date and existing.status != 'completed' and existing.scheduled_date != scheduled_date:
            existing.scheduled_date = scheduled_date
            existing.updated_at = datetime.utcnow()
            db.session.commit()
        return jsonify({
            'status': 'success',
            'data': {
                'assignment': {
                    'id': existing.id,
                    'workerId': existing.worker_id,
                    'workerName': worker.name,
                    'jobOrderRef': existing.job_order_ref,
                    'description': existing.description,
                    'scheduledDate': existing.scheduled_date.isoformat() if existing.scheduled_date else None,
                    'status': existing.status,
                }
            }
        })
    special_task_title = (data.get('specialTaskTitle') or '').strip() or None
    assignment = WorkerAssignment(
        worker_id=worker_id,
        job_order_ref=order.job_order_id if order else job_order_ref,
        job_order_db_id=order.id if order else None,
        description=description,
        expected_hours=data.get('expectedHours'),
        assignment_type=assignment_type,
        special_task_title=special_task_title,
        scheduled_date=scheduled_date,
        status='pending',
        notes=data.get('notes', ''),
    )
    db.session.add(assignment)
    db.session.flush()
    if order:
        add_labor_line_for_assignment(order, assignment)
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
@require_permission('workers.assign')
def update_worker_assignment(assignment_id):
    assignment = WorkerAssignment.query.get(assignment_id)
    if not assignment:
        return jsonify({'error': 'Assignment not found'}), 404
    # Finishing an assignment writes its pay onto the job order
    order = (JobOrder.query.get(assignment.job_order_db_id) if assignment.job_order_db_id
             else JobOrder.query.filter_by(job_order_id=assignment.job_order_ref).first())
    if order and branch_access_error(request.current_user, order.branch_id):
        return jsonify({'error': 'This job order belongs to another branch'}), 403
    data = request.get_json(silent=True) or {}
    new_status = data.get('status')
    if new_status and new_status not in ASSIGNMENT_STATUSES:
        msg = 'Status must be pending, in progress or completed'
        return jsonify({'status': 'error', 'error': msg, 'message': msg}), 400

    # Move a task that hasn't started to another worker
    if data.get('workerId') and finite_number(data['workerId']) and int(data['workerId']) != assignment.worker_id:
        if assignment.status != 'pending':
            msg = 'Only a task that has not started can move to another worker'
            return jsonify({'status': 'error', 'error': msg, 'message': msg}), 400
        new_worker = ManagedWorker.query.get(int(data['workerId']))
        if not new_worker or not new_worker.is_active:
            msg = 'Worker not found'
            return jsonify({'status': 'error', 'error': msg, 'message': msg}), 404
        if order and WorkerAssignment.query.filter(
                WorkerAssignment.worker_id == new_worker.id, WorkerAssignment.job_order_db_id == order.id,
                WorkerAssignment.description == assignment.description, WorkerAssignment.id != assignment.id).first():
            msg = f'{new_worker.name} already has this task on {order.job_order_id}'
            return jsonify({'status': 'error', 'error': msg, 'message': msg}), 400
        old_worker = assignment.worker
        assignment.worker_id = new_worker.id
        if order:
            # The job order's labor line follows: new name, and their rate unless a custom one was set
            items = [dict(it) for it in (order.items or [])]
            for it in items:
                if it.get('assignmentId') == assignment.id:
                    it['workerId'] = new_worker.id
                    it['workerName'] = new_worker.name
                    if old_worker and float(it.get('laborCost') or 0) == float(old_worker.rate_per_hour or 0):
                        it['laborCost'] = float(new_worker.rate_per_hour or 0)
            order.items = items
            order.actual_cost = job_order_actual_cost(order, items)
        log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Workers',
                   f"Moved {assignment.job_order_ref} ({assignment.description or 'task'}) from "
                   f"{old_worker.name if old_worker else 'a worker'} to {new_worker.name}",
                   request.remote_addr or '0.0.0.0')

    # Reopening a finished task: its recorded time and pay no longer stand
    if new_status and assignment.status == 'completed' and new_status != 'completed':
        assignment.end_time = None
        assignment.hours_worked = None
        assignment.pay = None
        assignment.pay_override = None
        assignment.materials_used = None
        if new_status == 'pending':
            assignment.start_time = None
        log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Workers',
                   f"Reopened {assignment.job_order_ref} ({assignment.description or 'task'}) for "
                   f"{assignment.worker.name if assignment.worker else 'a worker'}; its pay was cleared",
                   request.remote_addr or '0.0.0.0')
    for key in ('hoursWorked', 'payOverride', 'unitsWorked', 'expectedHours'):
        if data.get(key) not in (None, ''):
            value = finite_number(data[key])
            if value is None or value < 0:
                msg = 'Hours, units and pay must be numbers of zero or more'
                return jsonify({'status': 'error', 'error': msg, 'message': msg}), 400
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
            # Materials snapshot. Stock usage itself is logged once, when the job
            # order is completed — logging the order's whole material list here
            # too counted it again for every worker on the job.
            if data.get('materialsUsed') is not None:
                assignment.materials_used = data['materialsUsed']
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
    record_assignment_pay(assignment)
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
@require_permission('workers.view')
def get_assignments_calendar():
    """Scheduled assignments in a month, keyed by date: one worker's, or every
    worker's when no workerId is given (the team view)."""
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
    order_ids = {a.job_order_db_id for a in items if a.job_order_db_id}
    priorities = dict(db.session.query(JobOrder.id, JobOrder.priority).filter(JobOrder.id.in_(order_ids)))         if order_ids else {}
    rank = {'urgent': 0, 'high': 1, 'normal': 2, 'low': 3}
    result = {}
    for a in items:
        d = a.scheduled_date.isoformat()
        result.setdefault(d, []).append({
            'id': a.id,
            'workerId': a.worker_id,
            'jobOrderRef': a.job_order_ref,
            'jobOrderDbId': a.job_order_db_id,
            'jobOrderPriority': priorities.get(a.job_order_db_id) or 'normal',
            'assignmentType': a.assignment_type or 'job_order',
            'specialTaskTitle': a.special_task_title,
            'workerName': a.worker.name if a.worker else '',
            'status': a.status,
            'description': a.description,
            'scheduledDate': d,
        })
    # Most urgent first within each day
    for day in result.values():
        day.sort(key=lambda x: rank.get(x['jobOrderPriority'], 2))
    return jsonify({'status': 'success', 'data': result})

@app.route('/api/worker-assignments/<int:assignment_id>', methods=['DELETE'])
@require_auth
@require_permission('workers.delete_assignment')
def delete_worker_assignment(assignment_id):
    assignment = WorkerAssignment.query.get(assignment_id)
    if not assignment:
        return jsonify({'error': 'Assignment not found'}), 404
    # Its labor line goes with it, so both screens keep showing the same workers
    order = (JobOrder.query.get(assignment.job_order_db_id) if assignment.job_order_db_id
             else JobOrder.query.filter_by(job_order_id=assignment.job_order_ref).first())
    if order and branch_access_error(request.current_user, order.branch_id):
        return jsonify({'error': 'This job order belongs to another branch'}), 403
    if order and any(it.get('assignmentId') == assignment.id for it in (order.items or [])):
        items = [dict(it) for it in order.items if it.get('assignmentId') != assignment.id]
        order.items = items
        order.actual_cost = job_order_actual_cost(order, items)
    db.session.delete(assignment)
    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Assignment deleted'})

# ============================================
# WORKER AVAILABILITY CALENDAR
# ============================================

@app.route('/api/worker-availability', methods=['GET'])
@require_auth
@require_permission('workers.view')
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
@require_permission('workers.assign')
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

# ============================================
# PUBLIC ORDER TRACKING (no account needed)
# ============================================
# A customer enters the number on their receipt and sees only where the order
# is: no names, prices, items, materials, contact or staff details. Wrong
# numbers count toward a per-visitor limit, to slow down guessing.

TRACK_MAX_FAILURES = 10                 # wrong lookups allowed per visitor...
TRACK_WINDOW_SECONDS = 15 * 60          # ...in this many seconds
_track_failures = {}                    # visitor -> [failure timestamps] (per worker)

TRACK_NOT_FOUND = ("We couldn't find an order with that number. "
                   "Check your receipt, or contact the branch that took your order.")

JOB_ORDER_TRACK_STATUS = {
    'pending': ('received', 'Order received'),
    'in_progress': ('in_progress', 'Being worked on'),
    'completed': ('ready', 'Completed - ready for pickup'),
    'delivered': ('done', 'Delivered'),
    'cancelled': ('cancelled', 'Cancelled'),
    'voided': ('cancelled', 'Cancelled'),
}
PRODUCT_ORDER_TRACK_STATUS = {
    'pending': ('received', 'Order received'),
    'processing': ('in_progress', 'Being prepared'),
    'ready': ('ready', 'Ready for pickup'),
    'completed': ('done', 'Picked up / completed'),
    'cancelled': ('cancelled', 'Cancelled'),
}
PAYMENT_TRACK_LABELS = {'paid': 'Fully paid', 'partial': 'Partly paid', 'unpaid': 'Not yet paid'}

def _visitor_key():
    """The visitor's address. Behind Render's proxy remote_addr is the proxy, so
    the first X-Forwarded-For entry (the client) is used when present."""
    forwarded = request.headers.get('X-Forwarded-For', '')
    return (forwarded.split(',')[0].strip() if forwarded else '') or request.remote_addr or 'unknown'

def _recent_track_failures(key, now):
    recent = [t for t in _track_failures.get(key, []) if now - t < TRACK_WINDOW_SECONDS]
    if recent:
        _track_failures[key] = recent
    else:
        _track_failures.pop(key, None)
    if len(_track_failures) > 5000:  # keep the table small
        for k in [k for k, v in _track_failures.items() if not v or now - v[-1] >= TRACK_WINDOW_SECONDS]:
            _track_failures.pop(k, None)
    return recent

@app.route('/api/track-order', methods=['POST'])
def track_order():
    now = time.time()
    key = _visitor_key()
    if len(_recent_track_failures(key, now)) >= TRACK_MAX_FAILURES:
        return jsonify({'status': 'error',
                        'message': 'Too many attempts. Please wait 15 minutes, or contact the branch.'}), 429

    data = request.get_json(silent=True) or {}
    reference = str(data.get('reference') or '').strip().upper()
    if not reference or len(reference) > 50:
        return jsonify({'status': 'error', 'message': 'Enter your order number.'}), 400

    result = None
    job = JobOrder.query.filter(db.func.upper(JobOrder.job_order_id) == reference).first()
    # Drafts are not orders yet, so they can't be tracked
    if job and job.status != 'draft':
        key_status, label = JOB_ORDER_TRACK_STATUS.get(job.status, ('received', job.status.replace('_', ' ').title()))
        result = {
            'reference': job.job_order_id, 'kind': 'job_order', 'kindLabel': 'Job order',
            'description': job.description or '',
            'status': key_status, 'statusLabel': label,
            'branchName': job.branch.name if job.branch else None,
            'branchPhone': job.branch.phone if job.branch else None,
            'recordedOn': (job.created_at + PH_OFFSET).strftime('%Y-%m-%d') if job.created_at else None,
            'estimatedCompletion': job.estimated_completion.isoformat() if job.estimated_completion else None,
            'completedOn': job.completed_at.isoformat() if job.completed_at else None,
            'paymentStatus': PAYMENT_TRACK_LABELS.get(job.payment_status, job.payment_status),
        }
    if result is None:
        order = ProductOrder.query.filter(db.func.upper(ProductOrder.order_number) == reference).first()
        if order:
            key_status, label = PRODUCT_ORDER_TRACK_STATUS.get(order.status, ('received', order.status.title()))
            count = sum(int(it.get('quantity') or 0) for it in (order.items or []))
            result = {
                'reference': order.order_number, 'kind': 'product_order', 'kindLabel': 'Premade order',
                'description': f"{count} premade item{'s' if count != 1 else ''}",
                'status': key_status, 'statusLabel': label,
                'branchName': order.branch.name if order.branch else None,
                'branchPhone': order.branch.phone if order.branch else None,
                'recordedOn': (order.created_at + PH_OFFSET).strftime('%Y-%m-%d') if order.created_at else None,
                'estimatedCompletion': None,
                'completedOn': None,
                'paymentStatus': PAYMENT_TRACK_LABELS.get(order.payment_status, order.payment_status),
            }

    if result is None:
        _track_failures.setdefault(key, []).append(now)
        return jsonify({'status': 'error', 'message': TRACK_NOT_FOUND}), 404
    return jsonify({'status': 'success', 'data': result})

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'success',
        'message': 'Seatmakers Avenue API is running!',
        'version': '1.0.0',
        'timestamp': fmt_dt(datetime.utcnow())
    })

# ============================================================
# CATALOG ROUTES
# ============================================================

# Filters on the public catalog, in display order. 'Promotions' items are shown
# in the website's Promotions section instead of the gallery.
CATALOG_CATEGORIES = ('Automotive', 'Sofas', 'Chairs', 'Commercial', 'Custom Projects', 'Promotions')

def catalog_item_dict(i):
    return {'id': i.id, 'title': i.title, 'description': i.description, 'tag': i.tag,
            'category': i.category or 'Automotive', 'imageUrl': i.image_url, 'sortOrder': i.sort_order}

def _catalog_category(value):
    """The category if it is one of ours, else None."""
    value = (value or '').strip()
    return value if value in CATALOG_CATEGORIES else None

@app.route('/api/catalog', methods=['GET'])
def get_catalog():
    items = CatalogItem.query.filter_by(is_active=True).order_by(CatalogItem.sort_order, CatalogItem.id).all()
    return jsonify({'status': 'success', 'data': [catalog_item_dict(i) for i in items],
                    'categories': list(CATALOG_CATEGORIES)})

@app.route('/api/catalog', methods=['POST'])
@require_auth
@require_permission('catalog.manage')
def create_catalog_item():
    data = request.get_json()
    if not data or not data.get('title', '').strip():
        return jsonify({'status': 'error', 'message': 'Title is required'}), 400
    category = _catalog_category(data.get('category', 'Automotive'))
    if not category:
        return jsonify({'status': 'error', 'message': 'Invalid category'}), 400
    max_order = db.session.query(db.func.max(CatalogItem.sort_order)).scalar() or 0
    item = CatalogItem(
        title=data['title'].strip(),
        description=data.get('description', '').strip(),
        tag=data.get('tag', '').strip(),
        category=category,
        image_url=data.get('imageUrl', ''),
        sort_order=max_order + 1,
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({'status': 'success', 'data': catalog_item_dict(item)}), 201

@app.route('/api/catalog/<int:item_id>', methods=['PUT'])
@require_auth
@require_permission('catalog.manage')
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
    if 'category' in data:
        category = _catalog_category(data['category'])
        if not category:
            return jsonify({'status': 'error', 'message': 'Invalid category'}), 400
        item.category = category
    if 'sortOrder' in data:
        item.sort_order = int(data['sortOrder'])
    item.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'status': 'success', 'data': catalog_item_dict(item)})

@app.route('/api/catalog/<int:item_id>', methods=['DELETE'])
@require_auth
@require_permission('catalog.manage')
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
@require_permission('catalog.manage')
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
@require_permission('forecasting.manage')
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
@require_permission('forecasting.view', 'inventory.view')
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
@require_permission('forecasting.manage')
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
        'userId': c.user_id,
        'hasAccount': c.user_id is not None,
    }

def customer_order_counts(customers):
    """{customer id: number of orders}: job orders (not drafts) plus, for customers
    with an online account, their premade product orders and custom requests."""
    ids = [c.id for c in customers]
    user_to_customer = {c.user_id: c.id for c in customers if c.user_id}
    counts = dict.fromkeys(ids, 0)
    if ids:
        for cid, n in (db.session.query(JobOrder.customer_id, db.func.count(JobOrder.id))
                       .filter(JobOrder.customer_id.in_(ids), JobOrder.status != 'draft')
                       .group_by(JobOrder.customer_id)):
            counts[cid] += n
    if user_to_customer:
        for model in (ProductOrder, CustomerOrder):
            for uid, n in (db.session.query(model.user_id, db.func.count(model.id))
                           .filter(model.user_id.in_(list(user_to_customer)))
                           .group_by(model.user_id)):
                counts[user_to_customer[uid]] += n
    return counts

UNBILLED_JOB_STATUSES = ('draft', 'cancelled', 'voided')

def customer_unpaid_totals(customers):
    """{customer id: what they still owe}: balances on their job orders plus, for
    customers with an online account, unpaid product orders."""
    ids = [c.id for c in customers]
    user_to_customer = {c.user_id: c.id for c in customers if c.user_id}
    owed = dict.fromkeys(ids, 0.0)
    if ids:
        for cid, total in (db.session.query(JobOrder.customer_id, db.func.sum(JobOrder.balance))
                           .filter(JobOrder.customer_id.in_(ids), JobOrder.balance > 0,
                                   JobOrder.status.notin_(UNBILLED_JOB_STATUSES))
                           .group_by(JobOrder.customer_id)):
            owed[cid] += float(total or 0)
    if user_to_customer:
        for uid, total, paid in (db.session.query(ProductOrder.user_id, db.func.sum(ProductOrder.total_amount),
                                                  db.func.sum(db.func.coalesce(ProductOrder.amount_paid, 0)))
                                 .filter(ProductOrder.user_id.in_(list(user_to_customer)),
                                         ProductOrder.status != 'cancelled')
                                 .group_by(ProductOrder.user_id)):
            owed[user_to_customer[uid]] += max(float(total or 0) - float(paid or 0), 0)
    return {cid: money(v) for cid, v in owed.items()}

@app.route('/api/customers/search', methods=['GET'])
@require_auth
@require_permission('customers.view')
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
@require_permission('customers.view')
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
    counts = customer_order_counts(customers)
    unpaid = customer_unpaid_totals(customers)
    excess = open_excess_by_customer([c.id for c in customers])
    usernames = dict(db.session.query(User.id, User.username)
                     .filter(User.id.in_([c.user_id for c in customers if c.user_id])))
    data = []
    for c in customers:
        row = customer_to_dict(c)
        row['orderCount'] = counts.get(c.id, 0)
        row['unpaidTotal'] = unpaid.get(c.id, 0)
        row['excessTotal'] = excess.get(c.id, 0)
        row['username'] = usernames.get(c.user_id)
        data.append(row)
    return jsonify({'status': 'success', 'data': data})

@app.route('/api/customers', methods=['POST'])
@require_auth
@require_permission('customers.add')
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
@require_permission('customers.view')
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

    # Orders placed through the customer's online account
    online = []
    account = User.query.get(customer.user_id) if customer.user_id else None
    if account:
        result['username'] = account.username
        result['accountActive'] = account.is_active
        for o in ProductOrder.query.filter_by(user_id=account.id).all():
            online.append({'id': o.id, 'type': 'product', 'orderNumber': o.order_number,
                           'status': o.status, 'totalPrice': o.total_amount or 0,
                           'createdAt': o.created_at.strftime('%Y-%m-%d') if o.created_at else None})
        for o in CustomerOrder.query.filter_by(user_id=account.id).all():
            online.append({'id': o.id, 'type': 'custom', 'orderNumber': o.order_number,
                           'status': o.status, 'totalPrice': o.quotation_total or 0,
                           'createdAt': o.created_at.strftime('%Y-%m-%d') if o.created_at else None})
        online.sort(key=lambda o: o['createdAt'] or '', reverse=True)
    result['onlineOrders'] = online

    # What they owe, and what the shop holds of theirs
    result['unpaidTotal'] = customer_unpaid_totals([customer]).get(customer.id, 0)
    result['unpaidOrders'] = [o for o in order_history
                              if (o['balance'] or 0) > 0 and o['status'] not in UNBILLED_JOB_STATUSES]
    excess_rows = ExcessPayment.query.filter_by(customer_id=customer.id) \
        .order_by(ExcessPayment.created_at.desc()).all()
    result['excessPayments'] = [excess_payment_to_dict(e) for e in excess_rows]
    result['excessTotal'] = money(sum(e.amount for e in excess_rows if e.status == 'open'))
    return jsonify({'status': 'success', 'data': result})

@app.route('/api/customers/<int:customer_id>', methods=['PUT'])
@require_auth
@require_permission('customers.edit')
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
@require_permission('announcements.view')
def get_announcements():
    # Archived announcements are for those who manage the board: everyone else
    # always sees the active board, so an archived notice can never resurface.
    include_archived = (
        request.args.get('includeArchived', 'false').lower() == 'true'
        and has_perm(request.current_user, 'announcements.manage')
    )
    query = Announcement.query
    if not include_archived:
        query = query.filter_by(is_active=True)
    items = query.order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc()).all()
    return jsonify({'status': 'success', 'data': [announcement_to_dict(a) for a in items]})

@app.route('/api/announcements', methods=['POST'])
@require_auth
@require_permission('announcements.manage')
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
@require_permission('announcements.manage')
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
@require_permission('announcements.manage')
def delete_announcement(ann_id):
    a = Announcement.query.get(ann_id)
    if not a:
        return jsonify({'status': 'error', 'message': 'Announcement not found'}), 404
    db.session.delete(a)
    db.session.commit()
    log_action(request.current_user['id'], request.current_user['fullName'], 'DELETE', 'Announcements',
               f"Deleted announcement: {a.title}", request.remote_addr or '0.0.0.0')
    return jsonify({'status': 'success', 'message': 'Deleted'})

# ── Chat ─────────────────────────────────────────────────────────────────────

class ChatMessage(db.Model):
    __tablename__ = 'chat_messages'
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    sender = db.relationship('User', foreign_keys=[sender_id])

def chat_message_to_dict(m):
    return {
        'id': m.id,
        'senderId': m.sender_id,
        'senderName': m.sender.full_name if m.sender else 'Unknown',
        'senderUsername': m.sender.username if m.sender else '',
        'senderRole': m.sender.role.key if (m.sender and m.sender.role) else '',
        'content': m.content,
        'createdAt': m.created_at.strftime('%Y-%m-%dT%H:%M:%S') if m.created_at else None,
    }

@app.route('/api/chat/messages', methods=['GET'])
@require_auth
@require_permission('chat.use')
def get_chat_messages():
    since = request.args.get('since')
    query = ChatMessage.query
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace('Z', ''))
            query = query.filter(ChatMessage.created_at > since_dt)
        except ValueError:
            pass
    messages = query.order_by(ChatMessage.created_at.asc()).limit(200).all()
    return jsonify({'status': 'success', 'data': [chat_message_to_dict(m) for m in messages]})

@app.route('/api/chat/messages', methods=['POST'])
@require_auth
@require_permission('chat.use')
def send_chat_message():
    data = request.get_json()
    content = (data.get('content') or '').strip()
    if not content:
        return jsonify({'status': 'error', 'message': 'Content is required'}), 400
    msg = ChatMessage(sender_id=request.current_user['id'], content=content)
    db.session.add(msg)
    db.session.commit()
    return jsonify({'status': 'success', 'data': chat_message_to_dict(msg)}), 201

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
        print(f"Job orders count: {JobOrder.query.count()}")
        print("=" * 60)
    app.run(debug=True, port=8080)
