const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const ExcelJS = require("exceljs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "worktracking.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS work_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id TEXT NOT NULL UNIQUE,
    create_time TEXT NOT NULL,
    author TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending'
      CHECK(status IN ('Pending','Ongoing','Complete','Achieve')),
    priority TEXT NOT NULL DEFAULT 'Medium'
      CHECK(priority IN ('Low','Medium','High'))
  );

  CREATE TABLE IF NOT EXISTS work_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    author TEXT NOT NULL,
    description TEXT NOT NULL,
    FOREIGN KEY(work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
  CREATE INDEX IF NOT EXISTS idx_work_orders_priority ON work_orders(priority);
  CREATE INDEX IF NOT EXISTS idx_work_logs_work_order_id ON work_logs(work_order_id);
`);

app.use(express.json({ limit: "1mb" }));

function nowISO() {
  return new Date().toISOString();
}

function generateWorkOrderId() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  const row = db.prepare(`
    SELECT work_order_id
    FROM work_orders
    WHERE work_order_id LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(`WO-${yyyy}${mm}${dd}-%`);

  let seq = 1;
  if (row) {
    const match = row.work_order_id.match(/-(\d+)$/);
    if (match) seq = Number(match[1]) + 1;
  }
  return `WO-${yyyy}${mm}${dd}-${String(seq).padStart(3, "0")}`;
}

function validateWorkOrder(body) {
  const allowedStatuses = ["Pending", "Ongoing", "Complete", "Achieve"];
  const allowedPriorities = ["Low", "Medium", "High"];

  if (!body.author?.trim()) return "Author is required";
  if (!body.description?.trim()) return "Description is required";
  if (body.status && !allowedStatuses.includes(body.status)) return "Invalid status";
  if (body.priority && !allowedPriorities.includes(body.priority)) return "Invalid priority";
  return null;
}

function getWorkOrder(id) {
  return db.prepare(`
    SELECT *
    FROM work_orders
    WHERE id = ?
  `).get(id);
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: nowISO() });
});

app.get("/api/work-orders", (req, res) => {
  const { search = "", status = "", priority = "" } = req.query;

  let sql = `
    SELECT *
    FROM work_orders
    WHERE 1 = 1
  `;
  const params = {};

  if (search.trim()) {
    sql += `
      AND (
        work_order_id LIKE @search
        OR author LIKE @search
        OR description LIKE @search
      )
    `;
    params.search = `%${search.trim()}%`;
  }

  if (["Pending", "Ongoing", "Complete", "Achieve"].includes(status)) {
    sql += " AND status = @status";
    params.status = status;
  }

  if (["Low", "Medium", "High"].includes(priority)) {
    sql += " AND priority = @priority";
    params.priority = priority;
  }

  sql += " ORDER BY id DESC";

  res.json(db.prepare(sql).all(params));
});

app.get("/api/work-orders/:id", (req, res) => {
  const workOrder = getWorkOrder(req.params.id);
  if (!workOrder) return res.status(404).json({ message: "Work order not found" });

  const logs = db.prepare(`
    SELECT *
    FROM work_logs
    WHERE work_order_id = ?
    ORDER BY id DESC
  `).all(req.params.id);

  res.json({ ...workOrder, logs });
});

app.post("/api/work-orders", (req, res) => {
  const error = validateWorkOrder(req.body);
  if (error) return res.status(400).json({ message: error });

  const workOrderId = req.body.work_order_id?.trim() || generateWorkOrderId();
  const createTime = nowISO();
  const status = req.body.status || "Pending";
  const priority = req.body.priority || "Medium";

  try {
    const result = db.prepare(`
      INSERT INTO work_orders
        (work_order_id, create_time, author, description, status, priority)
      VALUES
        (@work_order_id, @create_time, @author, @description, @status, @priority)
    `).run({
      work_order_id: workOrderId,
      create_time: createTime,
      author: req.body.author.trim(),
      description: req.body.description.trim(),
      status,
      priority
    });

    res.status(201).json(getWorkOrder(result.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ message: "WorkOrderID already exists" });
    }
    console.error(err);
    res.status(500).json({ message: "Failed to create work order" });
  }
});

app.put("/api/work-orders/:id", (req, res) => {
  const existing = getWorkOrder(req.params.id);
  if (!existing) return res.status(404).json({ message: "Work order not found" });

  const body = {
    author: req.body.author ?? existing.author,
    description: req.body.description ?? existing.description,
    status: req.body.status ?? existing.status,
    priority: req.body.priority ?? existing.priority
  };

  const error = validateWorkOrder(body);
  if (error) return res.status(400).json({ message: error });

  db.prepare(`
    UPDATE work_orders
    SET author = @author,
        description = @description,
        status = @status,
        priority = @priority
    WHERE id = @id
  `).run({
    id: req.params.id,
    author: body.author.trim(),
    description: body.description.trim(),
    status: body.status,
    priority: body.priority
  });

  res.json(getWorkOrder(req.params.id));
});

app.delete("/api/work-orders/:id", (req, res) => {
  const existing = getWorkOrder(req.params.id);
  if (!existing) return res.status(404).json({ message: "Work order not found" });

  db.prepare("DELETE FROM work_orders WHERE id = ?").run(req.params.id);
  res.json({ message: "Work order deleted" });
});

app.post("/api/work-orders/:id/logs", (req, res) => {
  const existing = getWorkOrder(req.params.id);
  if (!existing) return res.status(404).json({ message: "Work order not found" });

  const author = req.body.author?.trim();
  const description = req.body.description?.trim();

  if (!author || !description) {
    return res.status(400).json({ message: "Author and progress description are required" });
  }

  const result = db.prepare(`
    INSERT INTO work_logs (work_order_id, created_at, author, description)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, nowISO(), author, description);

  res.status(201).json(
    db.prepare("SELECT * FROM work_logs WHERE id = ?").get(result.lastInsertRowid)
  );
});

app.get("/api/export/excel", async (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT *
      FROM work_orders
      ORDER BY id DESC
    `).all();

    const logs = db.prepare(`
      SELECT
        wo.work_order_id,
        wl.created_at,
        wl.author,
        wl.description
      FROM work_logs wl
      JOIN work_orders wo ON wo.id = wl.work_order_id
      ORDER BY wl.id DESC
    `).all();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Office Work Tracking";
    workbook.created = new Date();

    const orderSheet = workbook.addWorksheet("Work Orders");
    orderSheet.columns = [
      { header: "WorkOrderID", key: "work_order_id", width: 22 },
      { header: "CreateTime", key: "create_time", width: 24 },
      { header: "Author", key: "author", width: 20 },
      { header: "Description", key: "description", width: 55 },
      { header: "Status", key: "status", width: 15 },
      { header: "Priority", key: "priority", width: 12 }
    ];
    orderSheet.addRows(orders);
    orderSheet.getRow(1).font = { bold: true };
    orderSheet.views = [{ state: "frozen", ySplit: 1 }];

    const logSheet = workbook.addWorksheet("Work Logs");
    logSheet.columns = [
      { header: "WorkOrderID", key: "work_order_id", width: 22 },
      { header: "Time", key: "created_at", width: 24 },
      { header: "Author", key: "author", width: 20 },
      { header: "Progress", key: "description", width: 70 }
    ];
    logSheet.addRows(logs);
    logSheet.getRow(1).font = { bold: true };
    logSheet.views = [{ state: "frozen", ySplit: 1 }];

    const filename = `handover-list-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to export Excel" });
  }
});

// Serve built React app in production.
const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Work Tracking server running on http://${HOST}:${PORT}`);
});
