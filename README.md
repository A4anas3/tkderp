# tkderp

> **Thakurdwara ERP** — Fullstack Coaching Institute Management & Fee Accounting System

An enterprise-grade ERP designed specifically for coaching institutes and tuition centers. Handles student admissions, multi-subject batch combinations, proportional fee allocation, installment billing, fee coverage cycles ("when to when"), date-to-date financial reporting, cash flow tracking, student/batch revocations, fee refunds, and strict role-based access control.

---

## 🏗️ Architecture

```
thakurdwara-erp/
├── backend/                  # FastAPI 100% Async Backend
│   ├── app/
│   │   ├── common/           # Proportional fee calculations & pagination
│   │   ├── core/             # Security, JWT, RBAC dependencies, config
│   │   ├── database/         # SQLAlchemy 2.0 Async PostgreSQL engine & base models
│   │   ├── modules/          # Feature-first modular architecture
│   │   │   ├── admissions/   # Course purchase invoices & multi-batch admissions
│   │   │   ├── audit/        # Audit logging for revocations, refunds & edits
│   │   │   ├── auth/         # Login, JWT issuing, current user claims
│   │   │   ├── batches/      # Batches, hall room assignments, faculty snapshot
│   │   │   ├── dashboard/    # Role-based dashboards (Admin, Cashier, Teacher)
│   │   │   ├── enquiries/    # Lead enquiry management & demo tracking
│   │   │   ├── expenses/     # Daily operational expenses & staff salary payouts
│   │   │   ├── green_card/   # All-Access Green Card passes
│   │   │   ├── payments/     # Installment collections, refunds, date-to-date tracking
│   │   │   ├── reports/      # Subject-wise & batch revenue, cash movement analytics
│   │   │   ├── students/     # Student master, photo upload (<20KB), Kanban view
│   │   │   ├── subjects/     # Subject catalog & default fees
│   │   │   ├── teachers/     # Faculty profiles & payroll
│   │   │   └── users/        # Staff accounts & credentials
│   │   └── storage/          # Local, Cloudinary, Oracle Object Storage abstractions
│   ├── migrations/           # Alembic async database migrations
│   ├── tests/                # 29 Pytest test suite covering RBAC & calculations
│   ├── requirements.txt      # Python dependencies
│   └── .env.example          # Backend environment template
│
├── frontend/                 # Vite + React Modern Light-Theme UI
│   ├── src/
│   │   ├── components/       # Reusable UI components, tables, modals, receipts
│   │   ├── context/          # AuthContext & ToastContext
│   │   ├── pages/            # Admissions, Batches, Dashboard, Payments, Reports, etc.
│   │   ├── routes/           # Protected routes with role guards
│   │   ├── services/         # Axios API clients
│   │   └── utils/            # Image compressor (<= 20 KB)
│   ├── package.json          # Node dependencies
│   ├── tailwind.config.js    # Modern Tailwind configuration
│   └── .env.example          # Frontend environment template
│
├── .gitignore                # Git ignore rules (protects secret .env files)
└── README.md
```

---

## ⚙️ Environment Configuration

Both backend and frontend have dedicated environment templates.

### 1. Backend (`/backend/.env`)

Copy `backend/.env.example` to `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Key variables in `backend/.env`:

| Variable | Description | Default Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL async connection string | `postgresql+asyncpg://user:pass@localhost:5432/thakurdwara_erp` |
| `REDIS_URL` | Redis URL for caching & rate limiting | `redis://localhost:6379/0` |
| `SECRET_KEY` | Secret key for signing JWT tokens | `<strong-random-key>` |
| `ALGORITHM` | JWT signing algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime | `10080` (7 days) |
| `BACKEND_CORS_ORIGINS` | Permitted CORS origins | `["http://localhost:5173", "*"]` |
| `UPLOAD_DIR` | Local uploads directory path | `uploads` |
| `MAX_UPLOAD_SIZE_MB` | Max upload size limit | `10` |

### 2. Frontend (`/frontend/.env`)

Copy `frontend/.env.example` to `frontend/.env`:

```bash
cp frontend/.env.example frontend/.env
```

Key variables in `frontend/.env`:

| Variable | Description | Default Example |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Backend API prefix | `/api` |

---

## 🚀 Getting Started

### Backend Setup

```bash
cd backend

# 1. Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Apply database migrations
alembic -c alembic.ini upgrade head

# 4. Start backend server
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

Backend API Docs available at `http://localhost:8080/docs`.

### Frontend Setup

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Run development server
npm run dev
```

Frontend runs at `http://localhost:5173`.

### Running Tests

```bash
PYTHONPATH=backend ./backend/venv/bin/pytest backend/tests
```

---

## 🔒 Role-Based Access Control (RBAC)

The backend enforces strict role validation (`require_admin`, `require_cashier_or_admin`, `require_staff`):

- **ADMIN**:
  - Full institute oversight and analytics
  - Subject-wise and Batch revenue reports & cash movement
  - Student status revocation and restoration
  - Batch / course purchase revocation and restoration
  - Student fee refund disbursement
  - Past fee receipt edits
  - Staff user management & salary payout
- **CASHIER**:
  - Student admission & registration
  - Quick payment & fee collection
  - Fee receipt generation
  - Enquiries and demo management
  - Daily operational expense entries
- **TEACHER**:
  - Teacher dashboard & schedule
  - Read-only student and batch rosters

---

## 📄 License
Internal proprietary software for Thakurdwara Coaching Institute.
