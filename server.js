/**
 * High-Performance LeetCode Query Engine — Express API
 *
 * Queries a normalized PostgreSQL schema (5 tables) using JOINs.
 * Response format is backward-compatible with the Chrome extension.
 *
 * Index strategy (see setup_database.sql for details):
 *   - B-tree on lc_id, lint_id           → exact ID lookup
 *   - GIN trigram on lc_title, lint_title → ILIKE '%keyword%'
 *   - Partial index on grind75/blind75/neetcode150 → boolean filter
 *   - Composite index on tags(unified_id, source)  → tag aggregation
 */

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_DATABASE || "leetcode_finder",
});

// ─────────────────────────────────────────────
// Base SELECT — JOINs all normalized tables back together
// ─────────────────────────────────────────────
// Why LEFT JOIN?
//   Not every problem has both LeetCode AND LintCode data.
//   LEFT JOIN ensures we still return problems that only exist on one platform.
//
// Why subquery for tags?
//   Tags are stored as separate rows (normalized).
//   string_agg() re-aggregates them into comma-separated format
//   so the response stays backward-compatible with popup.js.
//   The composite index (unified_id, source) makes this subquery fast.
const BASE_SELECT = `
  SELECT
    p.unified_id,
    p.relation,
    l.lc_id,
    l.lc_slug,
    l.lc_title,
    l.lc_url,
    l.lc_difficulty,
    li.lint_id,
    li.lint_title,
    li.lint_url,
    li.lint_difficulty,
    c.grind75,
    c.blind75,
    c.neetcode150,
    (SELECT string_agg(t.tag_name, ',' ORDER BY t.tag_name)
       FROM tags t
      WHERE t.unified_id = p.unified_id AND t.source = 'leetcode'
    ) AS lc_tags,
    (SELECT string_agg(t.tag_name, ',' ORDER BY t.tag_name)
       FROM tags t
      WHERE t.unified_id = p.unified_id AND t.source = 'lintcode'
    ) AS lint_tags
  FROM problems p
  LEFT JOIN leetcode_info  l  ON p.unified_id = l.unified_id
  LEFT JOIN lintcode_info  li ON p.unified_id = li.unified_id
  LEFT JOIN curated_lists  c  ON p.unified_id = c.unified_id
`;

// ─────────────────────────────────────────────
// Search endpoint
// ─────────────────────────────────────────────
app.get("/search", async (req, res) => {
  const { query, source } = req.query;

  if (!query || !source) {
    return res.status(400).json({ error: "Both 'query' and 'source' are required." });
  }

  let sql;
  let params;

  try {
    switch (source) {
      // ── Exact ID match → B-tree index on lc_id / lint_id ──
      case "lc_id": {
        const id = parseInt(query, 10);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid LeetCode ID." });
        sql = `${BASE_SELECT} WHERE l.lc_id = $1`;
        params = [id];
        break;
      }

      case "lint_id": {
        const id = parseInt(query, 10);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid LintCode ID." });
        sql = `${BASE_SELECT} WHERE li.lint_id = $1`;
        params = [id];
        break;
      }

      // ── Title substring → GIN trigram index on lc_title / lint_title ──
      // ILIKE with leading wildcard ('%keyword%') normally causes a sequential scan.
      // The pg_trgm GIN index enables PostgreSQL to use an index scan instead.
      case "lc_title":
        sql = `${BASE_SELECT} WHERE l.lc_title ILIKE $1`;
        params = [`%${query}%`];
        break;

      case "lint_title":
        sql = `${BASE_SELECT} WHERE li.lint_title ILIKE $1`;
        params = [`%${query}%`];
        break;

      // ── Curated list + title search → Partial index + trigram index ──
      // Step 1: Partial index quickly finds the ~75 rows where grind75=TRUE
      // Step 2: Among those, trigram index filters by title
      case "grind75":
        sql = `${BASE_SELECT} WHERE c.grind75 = TRUE AND l.lc_title ILIKE $1`;
        params = [`%${query}%`];
        break;

      case "blind75":
        sql = `${BASE_SELECT} WHERE c.blind75 = TRUE AND l.lc_title ILIKE $1`;
        params = [`%${query}%`];
        break;

      case "neetcode150":
        sql = `${BASE_SELECT} WHERE c.neetcode150 = TRUE AND l.lc_title ILIKE $1`;
        params = [`%${query}%`];
        break;

      // ── Search across all sources ──
      // Searches both LeetCode and LintCode titles simultaneously.
      // OR condition means PostgreSQL can use either trigram index.
      case "all_sources":
        sql = `${BASE_SELECT} WHERE l.lc_title ILIKE $1 OR li.lint_title ILIKE $1`;
        params = [`%${query}%`];
        break;

      default:
        return res.status(400).json({ error: `Unknown source: '${source}'` });
    }

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("[Error]", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ─────────────────────────────────────────────
// Health check + index verification (dev only)
// ─────────────────────────────────────────────
app.get("/health", async (req, res) => {
  try {
    const counts = {};
    for (const t of ["problems", "leetcode_info", "lintcode_info", "curated_lists", "tags"]) {
      const r = await pool.query(`SELECT count(*) FROM ${t}`);
      counts[t] = parseInt(r.rows[0].count, 10);
    }
    res.json({ status: "ok", tables: counts });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend server is running at http://localhost:${PORT}`);
});