# System Architecture & Design Document (SADD)
## Project Name: Supply Command Base (Mobile-First Inventory Management)
### Target Environment: Cloudflare Workers, Pages & D1 (Free Tier)
### Development Environment: Antigravity IDE
### Language: Hebrew (UI/UX)

---

## 1. Executive Summary & Objectives

This document details the software architecture, database design, and user interface specifications for a mobile-first inventory management application tailored for precise operational supply tracking. 

### Core Requirements Matrix
* **Primary IDE:** Antigravity IDE.
* **Infrastructure / Deployment:** Cloudflare Ecosystem (Free Tier).
  * **Frontend & Serverless API:** Cloudflare Pages / Workers.
  * **Database:** Cloudflare D1 (Serverless SQL Database).
* **Configuration Management:** Zero hardcoded secrets; 100% environment variable driven via `.env` / Cloudflare Secrets.
* **UX Strategy:** Mobile-first, responsive, dark-green operational aesthetic based on the reference design language (`https://supply-command-base.base44.app/`).
* **Localization:** Fully localized in Hebrew (RTL alignment, localized nomenclature).
* **Data Ingestion:** Initial database seeding via Excel (`.xlsx`) upload.
* **Row-Level Security/Interactions:** Streamlined row interactions via centralized modal dialogs instead of cluttered row-level action buttons.

---

## 2. System Architecture & Tech Stack

+-------------------------------------------------------+
|                  Mobile First Client                  |
|   (React / Vue / Vanilla JS - Styled via Tailwind)    |
+---------------------------+---------------------------+
|
| HTTPS / Fetch (JSON)
v
+-------------------------------------------------------+
|                Cloudflare Pages / Worker              |
|              (Serverless Compute Engine)               |
+---------------+-----------------------+---------------+
|                       |
Read / Write |                       | Bindings
v                       v
+-----------------------+       +-----------------------+
|  Cloudflare D1 SQL    |       | Environment (.env)    |
|      (Database)       |       |  - DB Bindings        |
|                       |       |  - Access Passwords   |
+-----------------------+       +-----------------------+

### Stack Components

1. **Frontend Core:** Single Page Application (SPA) compiled optimized for low-latency delivery over Cloudflare's CDN network. Designed strictly with standard modern CSS layout principles (no heavy flex/grid wrapper anomalies that compromise headless browser parsing or mobile scaling).
2. **Backend API Routing:** Cloudflare Worker handlers managing REST endpoints (`/api/auth`, `/api/inventory`, `/api/transactions`).
3. **Database Layer:** Cloudflare D1 Serverless SQLite database instance, leveraging native D1 worker bindings for zero-overhead connectivity.
4. **Local Development Framework:** Developed inside **Antigravity IDE**, using `wrangler` CLI to emulate the Worker runtime and proxy connections directly to the production Cloudflare D1 database for consistency during localized testing.

---

## 3. Database Schema Design (Cloudflare D1 SQLite)

The database consists of two core relational entities: `inventory` (tracking current stock parameters) and `transactions` (tracking stock modifications, specifically sign-out signatures, write-offs, and replenishments).

### 3.1. `inventory` Table
This schema maps directly to the required operational columns provided in the technical brief:
* **קטגוריה** (Category)
* **מוצר** (Product)
* **כמות** (Quantity Current)
* **כמות במכולה** (Container Capacity)
* **צורך** (Required Target)
* **פער** (Gap - Dynamically Calculated or Synced)

```sql
CREATE TABLE inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,          -- קטגוריה
    product TEXT NOT NULL,           -- מוצר
    quantity INTEGER DEFAULT 0,      -- כמות
    container_capacity INTEGER,     -- כמות במכולה
    required_target INTEGER,         -- צורך
    gap INTEGER GENERATED ALWAYS AS (required_target - quantity) VIRTUAL, -- פער
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_category ON inventory(category);


3.2. transactions Table
Stores historical data capturing distribution records (החתמה), losses/write-offs (גריעה), and additions (הוספת ציוד).

CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL,
    transaction_type TEXT CHECK(transaction_type IN ('ADDITION', 'UPDATE', 'SIGN_OUT', 'DEDUCTION')) NOT NULL,
    quantity_changed INTEGER NOT NULL,
    full_name TEXT NULL,              -- שם מלא (Required for SIGN_OUT)
    phone_number TEXT NULL,           -- מספר טלפון
    unit TEXT NULL,                   -- יחידה
    destination TEXT NULL,            -- לאן
    returned_quantity INTEGER DEFAULT 0, -- כמות שחזרה
    transaction_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
);

CREATE INDEX idx_transactions_inventory ON transactions(inventory_id);

4. Environment Variables (.env Configuration)
All environment variables must be populated locally within the .env file for testing, and mirrors must be registered as secrets inside Cloudflare Wrangler configurations.

# Cloudflare Infrastructure Bindings
CLOUDFLARE_ACCOUNT_ID="your_cloudflare_account_id_here"
CLOUDFLARE_D1_DATABASE_ID="your_d1_database_uuid"

# Application Configuration
APP_ENV="production"
PORT=8787

# Security & Authentication Parameters
# המערכת דורשת סיסמה קבועה מראש ושם משתמש חופשי לצורכי תיעוד בלבד
AUTH_PASSWORD_HASH="מפלג828" 
SESSION_DURATION_HOURS=2

# Excel Seeding Settings
INITIAL_SEED_FILE="./inventory_seed.xlsx"

5. UI/UX & Interaction Design (Hebrew, Mobile-First)
5.1. Visual Style & Color Palette
Inspired by modern clean dashboards and tactical systems, the interface adopts a high-contrast light-blue canvas structure:

Background Frame: Light slate blue-gray gradient (#f8fafc to #f1f5f9) optimized for clean layout readability and daytime mobile outdoor screen reading.

Primary Text & Accents: Deep slate text (#0f172a) with high-contrast tactical blue (#2563eb) buttons/tabs and high-contrast tactical red alerts for stock gaps.

Directionality: Global CSS configuration direction: rtl; text-align: right; ensuring absolute alignment with Hebrew typography syntax.

5.2. Streamlined Table Interaction Matrix
To maintain an uncluttered layout optimized for touch targets, individual table rows do not contain independent Edit or Trash icons.

Default View: A streamlined, clean list table displaying:
[קטגוריה] | [מוצר] | [כמות] | [כמות במכולה] | [צורך] | [פער]

- **פער (Difference Formatting)**: Calculated as `quantity - required_target`:
  - **Surplus (עודף)**: If `quantity > required_target`, rendered as a positive green number (e.g. `+2`) using `--color-success`.
  - **Match (תקין)**: If `quantity === required_target`, rendered as `0` in muted gray.
  - **Shortfall (חוסר)**: If `quantity < required_target`, rendered as a negative warning number (e.g. `-3`) with an AlertTriangle icon in red.
  - **Shortfall Card Filtering**: Tapping the "סה״כ חוסר" dashboard card displays only the items with a negative difference (shortfalls).

Row Interactivity: Tapping anywhere on a specific row triggers a global overlay bottom-sheet or modal dialog blocking background interactivity.

+------------------------------------------+
|            פריט: פנס ראש טקטי             |
+------------------------------------------+
|  בחר את הפעולה לבנייה:                    |
|                                          |
|  [1] הוספת ציוד                          |
|  [2] עדכון פריט מקיף                     |
|  [3] החתמה (הספקת ציוד לחייל/איש צוות)     |
|  [4] גריעת מלאי                          |
|  [5] מחיקת פריט מהמערכת (הסרה)             |
|                                          |
|                                  [ביטול] |
+------------------------------------------+
5.3. Action Sub-Modals
הוספת ציוד (Add Inventory): Simple numerical key-input to increment quantity.

עדכון (Comprehensive Update): Full modal input forms containing fields for Category, Product Name, Quantity (כמות), Container Capacity, and Required Target.

החתמה (Sign-Out / Supply Assignment Form):
Captures distribution metrics and updates records. Decrements the absolute inventory table balance automatically upon confirmation.

Fields Included: Date & Time (Automatic server stamp), Full Name (שם מלא), Phone Number (מספר טלפון), Unit (יחידה), Destination (לאן), Distributed Quantity (כמות).

Direct Return Check-in Workflow:
- Tapping on any inventory item opens a details modal which displays the active sign-out (החתמה) records for that item.
- Admins can initiate returns by clicking the "החזר" (Return) button next to any active sign-out.
- If the return quantity matches the total items still taken:
  - The transaction record is deleted from the database.
  - The returned items are added back to the inventory balance.
- If the return quantity is less than the items taken:
  - The transaction record is updated to reduce the active `quantity_changed` value.
  - The returned items are added back to the inventory balance.

גריעה (Deduction): Numerical entry interface to deduct broken, lost, or decommissioned gear from the active inventory metrics.

מחיקה (Removal): Displays a safety confirmation prompt before deleting the product and cascading deletions of its transactions from the system permanently.

5.4. Dashboard & Interactive Filtering
Combined Header Actions: The Search Bar and the Shortfall Card ("סה״כ חוסר") are placed side-by-side inside the main inventory header. In the RTL Hebrew layout, the Search Bar is positioned on the right (taking the major flex space), and the interactive Shortfall Card is positioned on the left (fixed width of 160px).

Interactive Filtering: Clicking on this card toggles the "Shortfall Filter" state. When active, it highlights the card (blue border and glow) and filters the active inventory view to show only products with a positive gap (gap > 0). Clicking it again deactivates the filter to show all products.

6. Access Control & Security Architecture
The app enforces a minimal, highly rapid authorization pattern suited for field operational units:

Identification: User inputs any operational username. This text string is retained in the local session context to log which user authorized a specific transaction.

Authentication: Password input matching exactly against the .env value: מפלג828.

Session Lifetime Window: Enforced 2-hour timeout. The application calculates the local timestamp offset on every state transition. If current_time - login_time > 120 minutes, the UI state invalidates, destroys active memory tokens, and prompts the user with the authorization login shield.

7. Data Ingestion & Export Lifecycle (Excel Integration)
To initially construct, populate, or backup the Cloudflare D1 environment:

7.1. Excel Import (Seeding)
- **Import Security Lock**: To prevent accidental database overrides or data corruption, the Excel file upload panel is locked behind an import password prompt requiring `טלי` or `tali` / `taly` (case-insensitive). Entering the correct password unlocks the upload interface.
- **Parsing Mechanics**: An admin module runs a parsing script parsing the uploaded target .xlsx spreadsheet.
The columns are mapped strictly according to the specified dictionary, skipping any unlisted columns such as הערות:

Column A -> category (קטגוריה)
Column B -> product (מוצר)
Column C -> quantity (כמות)
Column D -> container_capacity (כמות במכולה)
Column E -> required_target (צורך)

The parser executes bulk SQL transaction generation (INSERT INTO inventory ...) feeding the operational server directly.

7.2. Excel Export
The admin module provides a direct download option that:
- Generates a client-side Excel spreadsheet (`.xlsx`) populated with all active items from the `inventory` table.
- Column structure matches the import standard with an additional calculated field for convenience:
  - Column A: קטגוריה (Category)
  - Column B: שם מוצר (Product)
  - Column C: מלאי נוכחי (Quantity)
  - Column D: תכולת מארז (Container Capacity)
  - Column E: תקן נדרש (Required Target)
  - Column F: חוסר (פער) (Gap)
- Configures the generated worksheet direction to Right-to-Left (RTL) for native Hebrew alignment.

8. Developer Operations & Setup Instructions (README Configuration)
The execution guidelines for running the environment locally while using the shared cloud database binding are defined below.

8.1. Cloudflare Ecosystem Provisioning
Sign up/Log in to the Cloudflare Dashboard.

Navigate to Workers & Pages -> D1 -> Create Database. Name the database instance (e.g., supply-db).

Copy the outputted Database Unique ID token.

Update your local environment workspace tracking configuration with the D1 Binding declarations:

[[d1_databases]]
binding = "DB"
database_name = "supply-db"
database_id = "<YOUR_DATABASE_UUID>"

8.2. Local Project Testing Sequence
To run the server interface inside your local environment using local D1 database emulation:

# 1. Install project development dependencies
npm install

# 2. Apply migrations locally to the emulated D1 database
npx wrangler d1 migrations apply supply-db --local

# 3. Fire up the local Pages Functions backend server
npm run pages:dev

# 4. In a separate terminal, fire up the Vite dev server with frontend hot reloading
npm run dev

Open `http://localhost:5173` in your browser.

8.3. Cloud Production Deployment Sequence
To deploy the application to your remote Cloudflare Pages and D1 production environment:

# 1. Apply database migrations to the remote D1 instance
npx wrangler d1 migrations apply supply-db --remote

# 2. Build the project static assets
npm run build

# 3. Publish the build to Cloudflare Pages
npx wrangler pages deploy dist

9. Progressive Web App (PWA) Specifications
To enable installability and offline support for field logistics users:

9.1. Manifest Configuration (manifest.json)
- App Name: חמ״ל אספקה - Supply Command Base
- Short Name: חמ״ל אספקה
- Theme Color: #2563eb (Tactical blue)
- Background Color: #0f172a (Slate slate-gray)
- Orientation: any
- Display Mode: standalone (hides browser interface elements when installed)

9.2. Cache Strategy & Service Worker (sw.js)
- Caching Pattern: Stale-While-Revalidate for app assets (HTML, Compiled JS, CSS, Font declarations).
- Launcher Icons: High-resolution custom tactical logistics shield icon (512x512) and maskable icon (192x192).
- API Handling: Requests directed to `/api/*` bypass the service worker cache entirely and execute network-first.
- Offline Capability: Enables loading the login UI and cached inventory data when disconnected.