# Flask Backend

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
```

2. Activate the virtual environment:
- Windows: `venv\Scripts\activate`
- Mac/Linux: `source venv/bin/activate`

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the server:
```bash
python app.py
```

The backend will run on `http://localhost:5000`

## API Endpoints

- `GET /api/health` - Health check endpoint
- `GET /api/data` - Get sample data
- `POST /api/data` - Create new data

## CORS Configuration

CORS is enabled for `http://localhost:3000` to allow the Next.js frontend to communicate with the backend.
