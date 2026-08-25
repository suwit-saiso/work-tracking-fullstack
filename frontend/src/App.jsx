import React, { useEffect, useMemo, useState } from "react";

const STATUSES = ["Pending", "Ongoing", "Complete", "Achieve"];
const PRIORITIES = ["Low", "Medium", "High"];

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const body = await response.json();
      message = body.message || message;
    } catch {}
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function emptyForm() {
  return {
    work_order_id: "",
    author: "",
    description: "",
    status: "Pending",
    priority: "Medium"
  };
}

function WorkModal({ mode, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial || emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const result =
        mode === "create"
          ? await api("/api/work-orders", { method: "POST", body: JSON.stringify(form) })
          : await api(`/api/work-orders/${initial.id}`, {
              method: "PUT",
              body: JSON.stringify(form)
            });
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{mode === "create" ? "Create Work Order" : "Edit Work Order"}</h2>
            <p>{mode === "create" ? "Add a new task to the board." : "Update work order details."}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>×</button>
        </div>

        {error && <div className="alert">{error}</div>}

        {mode === "create" && (
          <label>
            WorkOrderID <span className="optional">optional — auto generated</span>
            <input
              value={form.work_order_id}
              onChange={(e) => update("work_order_id", e.target.value)}
              placeholder="WO-20260826-001"
            />
          </label>
        )}

        <label>
          Author
          <input required value={form.author} onChange={(e) => update("author", e.target.value)} />
        </label>

        <label>
          Description
          <textarea
            required
            rows="5"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Describe what needs to be done..."
          />
        </label>

        <div className="form-grid">
          <label>
            Status
            <select value={form.status} onChange={(e) => update("status", e.target.value)}>
              {STATUSES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select value={form.priority} onChange={(e) => update("priority", e.target.value)}>
              {PRIORITIES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving}>
            {saving ? "Saving..." : mode === "create" ? "Create Work" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DetailModal({ id, onClose, onChanged }) {
  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [log, setLog] = useState({ author: "", description: "" });
  const [addingLog, setAddingLog] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setWork(await api(`/api/work-orders/${id}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function addLog(e) {
    e.preventDefault();
    setAddingLog(true);
    try {
      await api(`/api/work-orders/${id}/logs`, {
        method: "POST",
        body: JSON.stringify(log)
      });
      setLog({ author: "", description: "" });
      await load();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingLog(false);
    }
  }

  async function changeStatus(status) {
    try {
      const updated = await api(`/api/work-orders/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status })
      });
      setWork((old) => ({ ...old, ...updated }));
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal detail-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{work?.work_order_id || "Work Order Detail"}</h2>
            <p>Work order details and progress history.</p>
          </div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>

        {loading && <div className="loading">Loading...</div>}
        {error && <div className="alert">{error}</div>}

        {work && (
          <>
            <div className="detail-grid">
              <div><span>Author</span><strong>{work.author}</strong></div>
              <div><span>Created</span><strong>{formatDate(work.create_time)}</strong></div>
              <div><span>Priority</span><strong className={`priority ${work.priority.toLowerCase()}`}>{work.priority}</strong></div>
              <div>
                <span>Status</span>
                <select value={work.status} onChange={(e) => changeStatus(e.target.value)}>
                  {STATUSES.map((x) => <option key={x}>{x}</option>)}
                </select>
              </div>
            </div>

            <section>
              <h3>Description</h3>
              <div className="description-box">{work.description}</div>
            </section>

            <section>
              <h3>Work Progress</h3>
              <form className="log-form" onSubmit={addLog}>
                <input
                  required
                  value={log.author}
                  onChange={(e) => setLog({ ...log, author: e.target.value })}
                  placeholder="Your name"
                />
                <textarea
                  required
                  rows="3"
                  value={log.description}
                  onChange={(e) => setLog({ ...log, description: e.target.value })}
                  placeholder="What did you do?"
                />
                <button className="btn primary" disabled={addingLog}>
                  {addingLog ? "Adding..." : "Add Progress"}
                </button>
              </form>

              <div className="logs">
                {work.logs?.length ? work.logs.map((item) => (
                  <div className="log-item" key={item.id}>
                    <div className="log-meta">
                      <strong>{item.author}</strong>
                      <span>{formatDate(item.created_at)}</span>
                    </div>
                    <div>{item.description}</div>
                  </div>
                )) : (
                  <div className="empty-small">No progress has been recorded yet.</div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function WorkCard({ work, onClick }) {
  return (
    <button className="work-card" onClick={onClick}>
      <div className="card-top">
        <strong>{work.work_order_id}</strong>
        <span className={`priority ${work.priority.toLowerCase()}`}>{work.priority}</span>
      </div>
      <div className="card-description">{work.description}</div>
      <div className="card-footer">
        <span>{work.author}</span>
        <span>{formatDate(work.create_time)}</span>
      </div>
    </button>
  );
}

export default function App() {
  const [works, setWorks] = useState([]);
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);

  async function loadWorks() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (priority) params.set("priority", priority);
      const data = await api(`/api/work-orders?${params.toString()}`);
      setWorks(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadWorks, 150);
    return () => clearTimeout(timer);
  }, [search, priority]);

  const grouped = useMemo(() => {
    return Object.fromEntries(
      STATUSES.map((status) => [status, works.filter((w) => w.status === status)])
    );
  }, [works]);

  function openEdit(work) {
    setEditing(work);
    setModal("edit");
  }

  async function deleteWork(work) {
    if (!confirm(`Delete ${work.work_order_id}? This will also delete its progress logs.`)) return;
    try {
      await api(`/api/work-orders/${work.id}`, { method: "DELETE" });
      setModal(null);
      await loadWorks();
    } catch (err) {
      alert(err.message);
    }
  }

  function downloadExcel() {
    window.location.href = "/api/export/excel";
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Office Work Tracking</h1>
          <p>Simple Kanban board for internal work orders</p>
        </div>
        <div className="top-actions">
          <button className="btn secondary" onClick={downloadExcel}>Export Excel</button>
          <button className="btn primary" onClick={() => setModal("create")}>+ Create Work</button>
        </div>
      </header>

      <div className="toolbar">
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search WorkOrderID, author or description..."
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All Priority</option>
          {PRIORITIES.map((x) => <option key={x}>{x}</option>)}
        </select>
        <span className="count">{works.length} work orders</span>
      </div>

      {error && <div className="alert page-alert">{error}</div>}

      {loading ? (
        <div className="loading page-loading">Loading work orders...</div>
      ) : (
        <main className="board">
          {STATUSES.map((status) => (
            <section className="column" key={status}>
              <div className="column-header">
                <div>
                  <h2>{status}</h2>
                  <span>{grouped[status].length} items</span>
                </div>
              </div>

              <div className="cards">
                {grouped[status].length ? grouped[status].map((work) => (
                  <WorkCard
                    key={work.id}
                    work={work}
                    onClick={() => setModal({ type: "detail", id: work.id })}
                  />
                )) : (
                  <div className="empty-column">No work orders</div>
                )}
              </div>
            </section>
          ))}
        </main>
      )}

      {modal === "create" && (
        <WorkModal
          mode="create"
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadWorks();
          }}
        />
      )}

      {modal === "edit" && editing && (
        <WorkModal
          mode="edit"
          initial={editing}
          onClose={() => {
            setModal(null);
            setEditing(null);
          }}
          onSaved={async () => {
            setModal(null);
            setEditing(null);
            await loadWorks();
          }}
        />
      )}

      {modal?.type === "detail" && (
        <DetailModal
          id={modal.id}
          onClose={() => setModal(null)}
          onChanged={loadWorks}
        />
      )}
    </div>
  );
}
