const fs = require('fs');
const path = require('path');

function createSqlJsAdapter(dbFilePath) {
  const initSqlJs = require('sql.js');
  let sqliteDb = null;

  function save() {
    if (!sqliteDb || !dbFilePath) return;
    const data = sqliteDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbFilePath, buffer);
  }

  function normalizeParams(args) {
    if (args.length === 0) return [];
    if (args.length === 1) {
      const arg = args[0];
      if (arg === undefined || arg === null) return [];
      if (Array.isArray(arg)) return arg;
      if (typeof arg === 'object') {
        const obj = {};
        for (const [k, v] of Object.entries(arg)) {
          const val = v === undefined ? null : v;
          if (k.startsWith('@') || k.startsWith(':') || k.startsWith('$')) {
            obj[k] = val;
          } else {
            obj[`@${k}`] = val;
            obj[`:${k}`] = val;
            obj[`$${k}`] = val;
          }
        }
        return obj;
      }
      return [arg];
    }
    return args;
  }

  return {
    async init() {
      const SQL = await initSqlJs();
      let fileBuffer = null;
      if (fs.existsSync(dbFilePath)) {
        fileBuffer = fs.readFileSync(dbFilePath);
      }
      sqliteDb = new SQL.Database(fileBuffer);
      return this;
    },
    pragma(str) {
      if (str.includes("foreign_keys")) {
        sqliteDb.run("PRAGMA foreign_keys = ON;");
      }
    },
    exec(sql) {
      sqliteDb.exec(sql);
      save();
    },
    prepare(sql) {
      return {
        get: (...args) => {
          const params = normalizeParams(args);
          const stmt = sqliteDb.prepare(sql);
          try {
            stmt.bind(params);
            if (stmt.step()) {
              return stmt.getAsObject();
            }
            return undefined;
          } finally {
            stmt.free();
          }
        },
        all: (...args) => {
          const params = normalizeParams(args);
          const stmt = sqliteDb.prepare(sql);
          const results = [];
          try {
            stmt.bind(params);
            while (stmt.step()) {
              results.push(stmt.getAsObject());
            }
            return results;
          } finally {
            stmt.free();
          }
        },
        run: (...args) => {
          const params = normalizeParams(args);
          const stmt = sqliteDb.prepare(sql);
          try {
            stmt.run(params);
            const changes = sqliteDb.getRowsModified();
            const res = sqliteDb.exec("SELECT last_insert_rowid() as id");
            const lastInsertRowid = res.length && res[0].values.length ? res[0].values[0][0] : 0;
            save();
            return { lastInsertRowid, changes };
          } finally {
            stmt.free();
          }
        }
      };
    }
  };
}

async function getDatabase(dbFilePath) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbFilePath);
    return db;
  } catch (err) {
    console.log('[DB] better-sqlite3 unavailable, using sql.js (WASM SQLite) fallback.');
    const adapter = createSqlJsAdapter(dbFilePath);
    return await adapter.init();
  }
}

module.exports = { getDatabase };
