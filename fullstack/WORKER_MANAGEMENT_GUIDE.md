# Worker Management System

## Overview
The Worker Management System allows warehouse staff (seatmakers, sewers, and other workers) to:
- View their assigned tasks/orders
- Track task progress (pending → in progress → completed)
- Toggle their availability status
- See task details including priority, due dates, and estimated hours

Administrators and supervisors can:
- View all available workers
- Create and assign tasks to workers
- Track task completion and worker availability

## Database Setup

### 1. Run the Migration
Navigate to the backend folder and run the migration:

```bash
cd backend
python -m flask db upgrade
```

This will create the `workers` and `work_tasks` tables in your database.

### 2. Create Worker Users
You can create worker users through the user management interface or by running SQL:

```sql
-- Example: Create a seatmaker user
INSERT INTO users (username, password, email, full_name, role_id, branch_id, is_active, created_at)
VALUES (
  'seatmaker1',
  'hashed_password_here',  -- Use proper password hashing
  'seatmaker1@company.com',
  'John Seatmaker',
  (SELECT id FROM roles WHERE key = 'seat_maker'),
  1,  -- branch_id
  true,
  NOW()
);

-- Worker profile will be automatically created on first login
```

## User Roles

### Worker Roles:
- **seat_maker**: Seatmaking specialists
- **sewer**: Sewing specialists  
- **staff**: General warehouse staff

## Using the System

### For Workers

#### 1. Login
Workers log in with their credentials at `/login`

#### 2. Worker Dashboard
After login, workers are automatically redirected to `/worker-dashboard` where they can:

- **Toggle Availability**: Click the availability button to mark yourself as available/unavailable
- **View Tasks**: See all assigned tasks with their status
- **Filter Tasks**: Filter by status (All, Pending, In Progress, Completed)
- **Start Tasks**: Click "Start Task" to begin working on pending tasks
- **Complete Tasks**: Click "Complete" and enter actual hours spent
- **View Details**: Click on any task to see full details

#### Task Information Displayed:
- Task number and job order ID
- Title and description
- Priority level (Low, Normal, High, Urgent)
- Status (Pending, In Progress, Completed)
- Estimated vs actual hours
- Due date
- Task type (cutting, sewing, assembly, etc.)

### For Administrators/Supervisors

#### 1. View Workers
Navigate to `/task-management` to:
- See all registered workers
- Check worker availability status
- View worker types and specializations

#### 2. Create Tasks
Click "+ Create Task" and fill in:
- **Worker**: Select from available workers
- **Job Order ID**: Reference to the main job order (e.g., JO-BA-2026-0001)
- **Title**: Brief task description
- **Description**: Detailed task information
- **Task Type**: cutting, sewing, assembly, finishing, quality_check, packaging
- **Priority**: low, normal, high, urgent
- **Estimated Hours**: Expected time to complete
- **Due Date**: Task deadline

#### 3. Task Assignment Best Practices
- Assign tasks based on worker specialization
- Set realistic estimated hours
- Use priority levels appropriately
- Include clear descriptions
- Check worker availability before assigning

## API Endpoints

### Worker Endpoints:
- `GET /api/workers/profile` - Get worker profile
- `POST /api/workers/availability` - Toggle availability
- `GET /api/workers/tasks` - Get assigned tasks
- `GET /api/workers/tasks/:id` - Get task details
- `POST /api/workers/tasks/:id/status` - Update task status

### Admin Endpoints:
- `GET /api/workers/list` - Get all workers
- `POST /api/workers/tasks` - Create new task

## Task Status Flow

```
pending → in_progress → completed
                ↓
            cancelled
```

- **pending**: Task assigned but not started
- **in_progress**: Worker has started the task
- **completed**: Task finished
- **cancelled**: Task cancelled by admin

## Priority Levels

- **Low**: Non-urgent routine tasks
- **Normal**: Standard priority (default)
- **High**: Important, should be completed soon
- **Urgent**: Critical, needs immediate attention

## Task Types

- **cutting**: Cutting materials to size
- **sewing**: Sewing and stitching work
- **assembly**: Assembling components
- **finishing**: Final touches and quality work
- **quality_check**: Inspection and quality control
- **packaging**: Preparing for delivery

## Navigation Access

### Workers see:
- Worker Dashboard (main interface)

### Admins/Supervisors see:
- Dashboard
- Task Management
- All other management features

## Tips

### For Workers:
1. Toggle to "Unavailable" when taking breaks or off duty
2. Start tasks promptly when assigned
3. Enter accurate actual hours for better future estimates
4. Check your dashboard regularly for new assignments

### For Admins:
1. Create tasks immediately when job orders come in
2. Match task types to worker specializations
3. Monitor task completion rates
4. Adjust estimated hours based on actual hours data
5. Use priority levels to help workers prioritize their work

## Troubleshooting

### Worker can't see dashboard
- Verify user role is set to 'seat_maker', 'sewer', or 'staff'
- Check that worker profile was created (automatic on first login)

### Tasks not appearing
- Verify task is assigned to the correct worker_id
- Check that job_order_id is valid
- Ensure task was created successfully

### Can't toggle availability
- Verify worker profile exists
- Check authentication token is valid
- Ensure database connection is active

## Database Schema

### workers table:
- id (primary key)
- user_id (foreign key to users)
- worker_type (seat_maker, sewer, staff)
- is_available (boolean)
- specialization (text)
- branch_id (foreign key to branches)
- created_at (timestamp)

### work_tasks table:
- id (primary key)
- task_number (unique)
- job_order_id (reference to job order)
- worker_id (foreign key to workers)
- title, description
- task_type, priority, status
- estimated_hours, actual_hours
- due_date, started_at, completed_at
- created_at, notes
