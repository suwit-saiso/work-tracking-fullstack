# Office Work Tracking Kanban

Simple internal LAN work-order tracking system.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite (better-sqlite3)
- Excel export: ExcelJS

## Requirements
- Node.js 20+ recommended
- Windows/Linux/macOS

## Run development

```bash
npm install
npm run install:all
npm run dev
```

Frontend: http://localhost:5173  
Backend: http://localhost:3000

## Production / Office LAN

```bash
npm install
npm run install:all
npm run build
npm start
```

Then open:

```text
http://<OFFICE-LAPTOP-IP>:3000
```

Example:

```text
http://192.168.1.50:3000
```

The backend listens on `0.0.0.0`.

## Database
SQLite database is created automatically at:

`backend/data/worktracking.db`

## Excel
Use **Export Excel** from the UI. The file contains:
- Work Orders
- Work Logs

## API
- GET `/api/work-orders`
- GET `/api/work-orders/:id`
- POST `/api/work-orders`
- PUT `/api/work-orders/:id`
- DELETE `/api/work-orders/:id`
- POST `/api/work-orders/:id/logs`
- GET `/api/export/excel`
- GET `/api/health`
