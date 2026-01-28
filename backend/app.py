from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timedelta
from functools import wraps
import random
import hashlib
import secrets
import uuid

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"], supports_credentials=True)

# ============================================
# IN-MEMORY DATABASE (Replace with real DB in production)
# ============================================

# Users Database
users = [
    {'id': 1, 'username': 'admin', 'password': hashlib.sha256('admin123'.encode()).hexdigest(), 'email': 'admin@seatmakers.com', 'fullName': 'System Administrator', 'role': 'administrator', 'branch': 'Main', 'isActive': True, 'createdAt': '2026-01-01'},
    {'id': 2, 'username': 'supervisor', 'password': hashlib.sha256('super123'.encode()).hexdigest(), 'email': 'supervisor@seatmakers.com', 'fullName': 'John Supervisor', 'role': 'supervisor', 'branch': 'Main', 'isActive': True, 'createdAt': '2026-01-05'},
    {'id': 3, 'username': 'salesmanager', 'password': hashlib.sha256('sales123'.encode()).hexdigest(), 'email': 'sales@seatmakers.com', 'fullName': 'Jane Sales', 'role': 'sales_manager', 'branch': 'Branch A', 'isActive': True, 'createdAt': '2026-01-10'},
    {'id': 4, 'username': 'staff1', 'password': hashlib.sha256('staff123'.encode()).hexdigest(), 'email': 'staff1@seatmakers.com', 'fullName': 'Mike Staff', 'role': 'staff', 'branch': 'Branch B', 'isActive': True, 'createdAt': '2026-01-12'},
]

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
raw_materials = [
    {'id': 1, 'name': 'Leather - Black', 'sku': 'RM-LTH-001', 'quantity': 500, 'unit': 'sqft', 'category': 'Leather', 'price': 15.00, 'reorderPoint': 100, 'supplier': 'LeatherCo', 'branchId': 1, 'isArchived': False, 'lastUpdated': '2026-01-20'},
    {'id': 2, 'name': 'Leather - Brown', 'sku': 'RM-LTH-002', 'quantity': 350, 'unit': 'sqft', 'category': 'Leather', 'price': 15.00, 'reorderPoint': 100, 'supplier': 'LeatherCo', 'branchId': 1, 'isArchived': False, 'lastUpdated': '2026-01-20'},
    {'id': 3, 'name': 'Foam Padding - High Density', 'sku': 'RM-FOM-001', 'quantity': 200, 'unit': 'sheets', 'category': 'Foam', 'price': 25.00, 'reorderPoint': 50, 'supplier': 'FoamWorld', 'branchId': 1, 'isArchived': False, 'lastUpdated': '2026-01-19'},
    {'id': 4, 'name': 'Foam Padding - Low Density', 'sku': 'RM-FOM-002', 'quantity': 150, 'unit': 'sheets', 'category': 'Foam', 'price': 18.00, 'reorderPoint': 40, 'supplier': 'FoamWorld', 'branchId': 1, 'isArchived': False, 'lastUpdated': '2026-01-18'},
    {'id': 5, 'name': 'Thread - Black', 'sku': 'RM-THR-001', 'quantity': 1000, 'unit': 'spools', 'category': 'Thread', 'price': 3.50, 'reorderPoint': 200, 'supplier': 'ThreadMaster', 'branchId': 1, 'isArchived': False, 'lastUpdated': '2026-01-17'},
    {'id': 6, 'name': 'Thread - White', 'sku': 'RM-THR-002', 'quantity': 800, 'unit': 'spools', 'category': 'Thread', 'price': 3.50, 'reorderPoint': 200, 'supplier': 'ThreadMaster', 'branchId': 1, 'isArchived': False, 'lastUpdated': '2026-01-17'},
    {'id': 7, 'name': 'Vinyl - Gray', 'sku': 'RM-VNL-001', 'quantity': 80, 'unit': 'sqft', 'category': 'Vinyl', 'price': 12.00, 'reorderPoint': 100, 'supplier': 'VinylPro', 'branchId': 1, 'isArchived': False, 'lastUpdated': '2026-01-16'},
    {'id': 8, 'name': 'Adhesive Spray', 'sku': 'RM-ADH-001', 'quantity': 45, 'unit': 'cans', 'category': 'Adhesive', 'price': 8.50, 'reorderPoint': 50, 'supplier': 'GlueMaster', 'branchId': 1, 'isArchived': False, 'lastUpdated': '2026-01-15'},
    {'id': 9, 'name': 'Staples - Heavy Duty', 'sku': 'RM-STP-001', 'quantity': 5000, 'unit': 'pcs', 'category': 'Fasteners', 'price': 0.05, 'reorderPoint': 1000, 'supplier': 'FastenerCo', 'branchId': 1, 'isArchived': False, 'lastUpdated': '2026-01-14'},
    {'id': 10, 'name': 'Zipper - 12 inch', 'sku': 'RM-ZIP-001', 'quantity': 300, 'unit': 'pcs', 'category': 'Fasteners', 'price': 2.00, 'reorderPoint': 100, 'supplier': 'ZipperKing', 'branchId': 1, 'isArchived': False, 'lastUpdated': '2026-01-13'},
]

# Finished Goods Inventory
finished_goods = [
    {'id': 1, 'name': 'Car Seat Cover - Standard', 'sku': 'FG-CSC-001', 'quantity': 25, 'unit': 'sets', 'category': 'Seat Covers', 'price': 150.00, 'cost': 75.00, 'branchId': 2, 'isArchived': False, 'lastUpdated': '2026-01-20'},
    {'id': 2, 'name': 'Car Seat Cover - Premium', 'sku': 'FG-CSC-002', 'quantity': 15, 'unit': 'sets', 'category': 'Seat Covers', 'price': 250.00, 'cost': 120.00, 'branchId': 2, 'isArchived': False, 'lastUpdated': '2026-01-20'},
    {'id': 3, 'name': 'Motorcycle Seat - Custom', 'sku': 'FG-MCS-001', 'quantity': 10, 'unit': 'pcs', 'category': 'Motorcycle', 'price': 180.00, 'cost': 85.00, 'branchId': 3, 'isArchived': False, 'lastUpdated': '2026-01-19'},
    {'id': 4, 'name': 'Sofa Cushion Set', 'sku': 'FG-SCS-001', 'quantity': 8, 'unit': 'sets', 'category': 'Furniture', 'price': 200.00, 'cost': 95.00, 'branchId': 2, 'isArchived': False, 'lastUpdated': '2026-01-18'},
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
    'audit_log': 4
}

# ============================================
# HELPER FUNCTIONS
# ============================================

def get_user_from_token(token):
    """Get user from session token"""
    if token in sessions:
        user_id = sessions[token]['userId']
        return next((u for u in users if u['id'] == user_id), None)
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

def generate_job_order_id(branch_code):
    """Generate unique job order ID"""
    year = datetime.now().year
    count = sum(1 for jo in job_orders if jo['jobOrderId'].startswith(f'JO-{branch_code}-{year}')) + 1
    return f'JO-{branch_code}-{year}-{count:04d}'

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
    
    user = next((u for u in users if u['username'] == username and u['password'] == password and u['isActive']), None)
    
    if not user:
        return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401
    
    # Generate session token
    token = secrets.token_hex(32)
    sessions[token] = {
        'userId': user['id'],
        'createdAt': datetime.now().isoformat()
    }
    
    log_action(user['id'], user['fullName'], 'LOGIN', 'Auth', 'User logged in', request.remote_addr or '0.0.0.0')
    
    return jsonify({
        'status': 'success',
        'data': {
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'fullName': user['fullName'],
                'role': user['role'],
                'branch': user['branch']
            }
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
    
    user = next((u for u in users if u['email'] == email), None)
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
        stats['totalUsers'] = len([u for u in users if u['isActive']])
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

@app.route('/api/inventory/raw-materials', methods=['GET'])
@require_auth
def get_raw_materials():
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'
    branch_id = request.args.get('branchId')
    category = request.args.get('category')
    
    items = raw_materials
    if not include_archived:
        items = [m for m in items if not m['isArchived']]
    if branch_id:
        items = [m for m in items if m['branchId'] == int(branch_id)]
    if category:
        items = [m for m in items if m['category'] == category]
    
    return jsonify({'status': 'success', 'data': items})

@app.route('/api/inventory/raw-materials/<int:material_id>', methods=['GET'])
@require_auth
def get_raw_material(material_id):
    material = next((m for m in raw_materials if m['id'] == material_id), None)
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404
    return jsonify({'status': 'success', 'data': material})

@app.route('/api/inventory/raw-materials', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def create_raw_material():
    global counters
    data = request.get_json()
    
    required = ['name', 'quantity', 'unit', 'category', 'price', 'reorderPoint', 'supplier', 'branchId']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    new_material = {
        'id': counters['raw_material'],
        'name': data['name'],
        'sku': data.get('sku', f"RM-{counters['raw_material']:03d}"),
        'quantity': data['quantity'],
        'unit': data['unit'],
        'category': data['category'],
        'price': data['price'],
        'reorderPoint': data['reorderPoint'],
        'supplier': data['supplier'],
        'branchId': data['branchId'],
        'isArchived': False,
        'lastUpdated': datetime.now().strftime('%Y-%m-%d')
    }
    
    raw_materials.append(new_material)
    counters['raw_material'] += 1
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Inventory', f"Created raw material: {new_material['name']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': new_material}), 201

@app.route('/api/inventory/raw-materials/<int:material_id>', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor')
def update_raw_material(material_id):
    material = next((m for m in raw_materials if m['id'] == material_id), None)
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404
    
    data = request.get_json()
    for key in ['name', 'sku', 'quantity', 'unit', 'category', 'price', 'reorderPoint', 'supplier', 'branchId']:
        if key in data:
            material[key] = data[key]
    
    material['lastUpdated'] = datetime.now().strftime('%Y-%m-%d')
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Inventory', f"Updated raw material: {material['name']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': material})

@app.route('/api/inventory/raw-materials/<int:material_id>/archive', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def archive_raw_material(material_id):
    material = next((m for m in raw_materials if m['id'] == material_id), None)
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404
    
    material['isArchived'] = True
    material['lastUpdated'] = datetime.now().strftime('%Y-%m-%d')
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'ARCHIVE', 'Inventory', f"Archived raw material: {material['name']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'message': 'Material archived'})

@app.route('/api/inventory/raw-materials/<int:material_id>/restore', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def restore_raw_material(material_id):
    material = next((m for m in raw_materials if m['id'] == material_id), None)
    if not material:
        return jsonify({'status': 'error', 'message': 'Material not found'}), 404
    
    material['isArchived'] = False
    material['lastUpdated'] = datetime.now().strftime('%Y-%m-%d')
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'RESTORE', 'Inventory', f"Restored raw material: {material['name']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'message': 'Material restored'})

# ============================================
# INVENTORY ROUTES - FINISHED GOODS
# ============================================

@app.route('/api/inventory/finished-goods', methods=['GET'])
@require_auth
def get_finished_goods():
    include_archived = request.args.get('includeArchived', 'false').lower() == 'true'
    branch_id = request.args.get('branchId')
    
    items = finished_goods
    if not include_archived:
        items = [fg for fg in items if not fg['isArchived']]
    if branch_id:
        items = [fg for fg in items if fg['branchId'] == int(branch_id)]
    
    return jsonify({'status': 'success', 'data': items})

@app.route('/api/inventory/finished-goods', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor')
def create_finished_good():
    global counters
    data = request.get_json()
    
    required = ['name', 'quantity', 'unit', 'category', 'price', 'cost', 'branchId']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    new_item = {
        'id': counters['finished_good'],
        'name': data['name'],
        'sku': data.get('sku', f"FG-{counters['finished_good']:03d}"),
        'quantity': data['quantity'],
        'unit': data['unit'],
        'category': data['category'],
        'price': data['price'],
        'cost': data['cost'],
        'branchId': data['branchId'],
        'isArchived': False,
        'lastUpdated': datetime.now().strftime('%Y-%m-%d')
    }
    
    finished_goods.append(new_item)
    counters['finished_good'] += 1
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Inventory', f"Created finished good: {new_item['name']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': new_item}), 201

@app.route('/api/inventory/categories', methods=['GET'])
@require_auth
def get_categories():
    rm_categories = list(set(m['category'] for m in raw_materials if not m['isArchived']))
    fg_categories = list(set(fg['category'] for fg in finished_goods if not fg['isArchived']))
    
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
    low_stock = [m for m in raw_materials if m['quantity'] <= m['reorderPoint'] and not m['isArchived']]
    return jsonify({'status': 'success', 'data': low_stock})

# ============================================
# SALES MODULE - JOB ORDERS
# ============================================

@app.route('/api/sales/job-orders', methods=['GET'])
@require_auth
def get_job_orders():
    status = request.args.get('status')
    branch_id = request.args.get('branchId')
    
    items = job_orders
    if status:
        items = [jo for jo in items if jo['status'] == status]
    if branch_id:
        items = [jo for jo in items if jo['branchId'] == int(branch_id)]
    
    return jsonify({'status': 'success', 'data': items})

@app.route('/api/sales/job-orders/<int:order_id>', methods=['GET'])
@require_auth
def get_job_order(order_id):
    order = next((jo for jo in job_orders if jo['id'] == order_id), None)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    return jsonify({'status': 'success', 'data': order})

@app.route('/api/sales/job-orders', methods=['POST'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def create_job_order():
    global counters
    data = request.get_json()
    
    required = ['customerName', 'customerPhone', 'branchId', 'description', 'items', 'estimatedCompletion']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    branch = next((b for b in branches if b['id'] == data['branchId']), None)
    if not branch:
        return jsonify({'status': 'error', 'message': 'Invalid branch'}), 400
    
    job_order_id = generate_job_order_id(branch['code'])
    
    # Calculate costs
    total_price = sum(item['quantity'] * item['unitPrice'] for item in data['items'])
    estimated_cost = sum(item['quantity'] * (item.get('materialCost', 0) + item.get('laborCost', 0)) for item in data['items'])
    
    new_order = {
        'id': counters['job_order'],
        'jobOrderId': job_order_id,
        'customerId': data.get('customerId'),
        'customerName': data['customerName'],
        'customerPhone': data['customerPhone'],
        'customerEmail': data.get('customerEmail', ''),
        'branchId': data['branchId'],
        'branchName': branch['name'],
        'description': data['description'],
        'vehicleInfo': data.get('vehicleInfo'),
        'items': data['items'],
        'estimatedCost': estimated_cost,
        'actualCost': 0,
        'totalPrice': total_price,
        'status': 'pending',
        'paymentStatus': 'unpaid',
        'downPayment': data.get('downPayment', 0),
        'balance': total_price - data.get('downPayment', 0),
        'estimatedCompletion': data['estimatedCompletion'],
        'createdAt': datetime.now().strftime('%Y-%m-%d'),
        'createdBy': request.current_user['id'],
        'updatedAt': datetime.now().strftime('%Y-%m-%d')
    }
    
    if new_order['downPayment'] > 0:
        new_order['paymentStatus'] = 'partial'
    
    job_orders.append(new_order)
    counters['job_order'] += 1
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Sales', f"Created job order: {job_order_id}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': new_order}), 201

@app.route('/api/sales/job-orders/<int:order_id>', methods=['PUT'])
@require_auth
@require_roles('administrator', 'supervisor', 'sales_manager')
def update_job_order(order_id):
    order = next((jo for jo in job_orders if jo['id'] == order_id), None)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    
    data = request.get_json()
    
    # Update allowed fields
    for key in ['status', 'paymentStatus', 'downPayment', 'actualCost', 'notes']:
        if key in data:
            order[key] = data[key]
    
    # Recalculate balance
    if 'downPayment' in data:
        order['balance'] = order['totalPrice'] - order['downPayment']
        if order['downPayment'] >= order['totalPrice']:
            order['paymentStatus'] = 'paid'
        elif order['downPayment'] > 0:
            order['paymentStatus'] = 'partial'
    
    if data.get('status') == 'completed':
        order['completedAt'] = datetime.now().strftime('%Y-%m-%d')
    
    order['updatedAt'] = datetime.now().strftime('%Y-%m-%d')
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Sales', f"Updated job order: {order['jobOrderId']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': order})

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
    order = next((jo for jo in job_orders if jo['id'] == order_id), None)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    
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
    order = next((jo for jo in job_orders if jo['id'] == order_id), None)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    
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
    completed_orders = [jo for jo in job_orders if jo['status'] == 'completed' and jo['actualCost'] > 0]
    
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
    order = next((jo for jo in job_orders if jo['id'] == order_id), None)
    if not order:
        return jsonify({'status': 'error', 'message': 'Job order not found'}), 404
    
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
        material = next((m for m in raw_materials if m['id'] == item.get('materialId')), None)
        if material:
            material['quantity'] += item['quantity']
            material['lastUpdated'] = datetime.now().strftime('%Y-%m-%d')
    
    po['status'] = 'received'
    po['receivedAt'] = datetime.now().strftime('%Y-%m-%d')
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'RECEIVE', 'Purchase Orders', f"Received PO: {po['poNumber']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': po})

# ============================================
# DELIVERY MODULE
# ============================================

@app.route('/api/deliveries', methods=['GET'])
@require_auth
def get_deliveries():
    status = request.args.get('status')
    delivery_type = request.args.get('type')
    
    items = deliveries
    if status:
        items = [d for d in items if d['status'] == status]
    if delivery_type:
        items = [d for d in items if d['type'] == delivery_type]
    
    return jsonify({'status': 'success', 'data': items})

@app.route('/api/deliveries/<int:delivery_id>', methods=['GET'])
@require_auth
def get_delivery(delivery_id):
    delivery = next((d for d in deliveries if d['id'] == delivery_id), None)
    if not delivery:
        return jsonify({'status': 'error', 'message': 'Delivery not found'}), 404
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
    delivery = next((d for d in deliveries if d['id'] == delivery_id), None)
    if not delivery:
        return jsonify({'status': 'error', 'message': 'Delivery not found'}), 404
    
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
    delivery = next((d for d in deliveries if d['id'] == delivery_id), None)
    if not delivery:
        return jsonify({'status': 'error', 'message': 'Delivery not found'}), 404
    
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
    start_date = request.args.get('startDate', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    end_date = request.args.get('endDate', datetime.now().strftime('%Y-%m-%d'))
    branch_id = request.args.get('branchId')
    
    filtered_orders = [jo for jo in job_orders if start_date <= jo['createdAt'] <= end_date]
    if branch_id:
        filtered_orders = [jo for jo in filtered_orders if jo['branchId'] == int(branch_id)]
    
    total_orders = len(filtered_orders)
    total_revenue = sum(jo['totalPrice'] for jo in filtered_orders if jo['status'] == 'completed')
    total_pending_revenue = sum(jo['balance'] for jo in filtered_orders if jo['paymentStatus'] != 'paid')
    
    status_breakdown = {}
    for jo in filtered_orders:
        status = jo['status']
        if status not in status_breakdown:
            status_breakdown[status] = {'count': 0, 'value': 0}
        status_breakdown[status]['count'] += 1
        status_breakdown[status]['value'] += jo['totalPrice']
    
    # Daily sales for chart
    daily_sales = {}
    for jo in filtered_orders:
        date = jo['createdAt']
        if date not in daily_sales:
            daily_sales[date] = {'orders': 0, 'revenue': 0}
        daily_sales[date]['orders'] += 1
        if jo['status'] == 'completed':
            daily_sales[date]['revenue'] += jo['totalPrice']
    
    report = {
        'period': {'startDate': start_date, 'endDate': end_date},
        'summary': {
            'totalOrders': total_orders,
            'completedOrders': len([jo for jo in filtered_orders if jo['status'] == 'completed']),
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
    branch_id = request.args.get('branchId')
    
    rm_items = raw_materials if not branch_id else [m for m in raw_materials if m['branchId'] == int(branch_id)]
    fg_items = finished_goods if not branch_id else [fg for fg in finished_goods if fg['branchId'] == int(branch_id)]
    
    rm_items = [m for m in rm_items if not m['isArchived']]
    fg_items = [fg for fg in fg_items if not fg['isArchived']]
    
    total_rm_value = sum(m['quantity'] * m['price'] for m in rm_items)
    total_fg_value = sum(fg['quantity'] * fg['price'] for fg in fg_items)
    total_fg_cost = sum(fg['quantity'] * fg['cost'] for fg in fg_items)
    
    low_stock = [m for m in rm_items if m['quantity'] <= m['reorderPoint']]
    
    # Category breakdown
    rm_by_category = {}
    for m in rm_items:
        cat = m['category']
        if cat not in rm_by_category:
            rm_by_category[cat] = {'count': 0, 'value': 0}
        rm_by_category[cat]['count'] += 1
        rm_by_category[cat]['value'] += m['quantity'] * m['price']
    
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
                'id': m['id'],
                'name': m['name'],
                'currentStock': m['quantity'],
                'reorderPoint': m['reorderPoint'],
                'unit': m['unit']
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
        logs = [l for l in logs if l['module'] == module]
    
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
    
    user_list = users if include_inactive else [u for u in users if u['isActive']]
    
    # Remove password from response
    safe_users = []
    for u in user_list:
        safe_user = {k: v for k, v in u.items() if k != 'password'}
        safe_users.append(safe_user)
    
    return jsonify({'status': 'success', 'data': safe_users})

@app.route('/api/settings/users', methods=['POST'])
@require_auth
@require_roles('administrator')
def create_user():
    global counters
    data = request.get_json()
    
    required = ['username', 'password', 'email', 'fullName', 'role', 'branch']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    # Check for duplicate username
    if any(u['username'] == data['username'] for u in users):
        return jsonify({'status': 'error', 'message': 'Username already exists'}), 400
    
    valid_roles = ['administrator', 'supervisor', 'sales_manager', 'staff']
    if data['role'] not in valid_roles:
        return jsonify({'status': 'error', 'message': 'Invalid role'}), 400
    
    new_user = {
        'id': counters['user'],
        'username': data['username'],
        'password': hashlib.sha256(data['password'].encode()).hexdigest(),
        'email': data['email'],
        'fullName': data['fullName'],
        'role': data['role'],
        'branch': data['branch'],
        'isActive': True,
        'createdAt': datetime.now().strftime('%Y-%m-%d')
    }
    
    users.append(new_user)
    counters['user'] += 1
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Settings', f"Created user: {new_user['username']}", request.remote_addr or '0.0.0.0')
    
    safe_user = {k: v for k, v in new_user.items() if k != 'password'}
    return jsonify({'status': 'success', 'data': safe_user}), 201

@app.route('/api/settings/users/<int:user_id>', methods=['PUT'])
@require_auth
@require_roles('administrator')
def update_user(user_id):
    user = next((u for u in users if u['id'] == user_id), None)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404
    
    data = request.get_json()
    
    for key in ['email', 'fullName', 'role', 'branch']:
        if key in data:
            user[key] = data[key]
    
    if 'password' in data and data['password']:
        user['password'] = hashlib.sha256(data['password'].encode()).hexdigest()
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'UPDATE', 'Settings', f"Updated user: {user['username']}", request.remote_addr or '0.0.0.0')
    
    safe_user = {k: v for k, v in user.items() if k != 'password'}
    return jsonify({'status': 'success', 'data': safe_user})

@app.route('/api/settings/users/<int:user_id>/archive', methods=['POST'])
@require_auth
@require_roles('administrator')
def archive_user(user_id):
    user = next((u for u in users if u['id'] == user_id), None)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404
    
    if user['id'] == request.current_user['id']:
        return jsonify({'status': 'error', 'message': 'Cannot archive yourself'}), 400
    
    user['isActive'] = False
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'ARCHIVE', 'Settings', f"Archived user: {user['username']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'message': 'User archived'})

@app.route('/api/settings/users/<int:user_id>/restore', methods=['POST'])
@require_auth
@require_roles('administrator')
def restore_user(user_id):
    user = next((u for u in users if u['id'] == user_id), None)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404
    
    user['isActive'] = True
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'RESTORE', 'Settings', f"Restored user: {user['username']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'message': 'User restored'})

@app.route('/api/settings/roles', methods=['GET'])
@require_auth
def get_roles():
    roles = [
        {'id': 'administrator', 'name': 'Administrator', 'description': 'Full system access'},
        {'id': 'supervisor', 'name': 'Supervisor', 'description': 'Access to inventory, costing, reports, delivery, settings'},
        {'id': 'sales_manager', 'name': 'Sales Manager', 'description': 'Access to dashboard and sales module'},
        {'id': 'staff', 'name': 'Staff', 'description': 'Limited access based on assignment'}
    ]
    return jsonify({'status': 'success', 'data': roles})

@app.route('/api/settings/branches', methods=['GET'])
@require_auth
def get_branches():
    include_inactive = request.args.get('includeInactive', 'false').lower() == 'true'
    items = branches if include_inactive else [b for b in branches if b['isActive']]
    return jsonify({'status': 'success', 'data': items})

@app.route('/api/settings/branches', methods=['POST'])
@require_auth
@require_roles('administrator')
def create_branch():
    data = request.get_json()
    
    required = ['name', 'code', 'address']
    if not all(f in data for f in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    new_branch = {
        'id': len(branches) + 1,
        'name': data['name'],
        'code': data['code'],
        'address': data['address'],
        'isWarehouse': data.get('isWarehouse', False),
        'isActive': True
    }
    
    branches.append(new_branch)
    
    log_action(request.current_user['id'], request.current_user['fullName'], 'CREATE', 'Settings', f"Created branch: {new_branch['name']}", request.remote_addr or '0.0.0.0')
    
    return jsonify({'status': 'success', 'data': new_branch}), 201

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

if __name__ == '__main__':
    app.run(debug=True, port=8080)
