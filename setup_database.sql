-- ============================================================
-- High-Performance LeetCode Query Engine
-- Normalized PostgreSQL Schema + Index Strategy
-- ============================================================
-- Run:  psql -d leetcode_finder -f setup_database.sql
-- Or after ETL:  python etl.py  (this DDL is also in etl.py)
-- ============================================================

-- Enable trigram extension for ILIKE index support
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop existing tables (reverse dependency order)
DROP TABLE IF EXISTS tags           CASCADE;
DROP TABLE IF EXISTS curated_lists  CASCADE;
DROP TABLE IF EXISTS lintcode_info  CASCADE;
DROP TABLE IF EXISTS leetcode_info  CASCADE;
DROP TABLE IF EXISTS problems       CASCADE;

-- ────────────────────────────────────────────
-- 1. problems — core identity table
-- ────────────────────────────────────────────
-- Why a separate table?
--   Single source of truth for unified_id.
--   All other tables reference this via FK.
CREATE TABLE problems (
    unified_id  INT PRIMARY KEY,
    relation    VARCHAR(50) DEFAULT 'unknown'
);

-- ────────────────────────────────────────────
-- 2. leetcode_info — LeetCode-specific fields
-- ────────────────────────────────────────────
-- Why separate from problems?
--   Not every problem has LeetCode data.
--   Keeps NULL columns out of the core table.
CREATE TABLE leetcode_info (
    unified_id    INT PRIMARY KEY REFERENCES problems(unified_id),
    lc_id         INT,
    lc_slug       VARCHAR(255),
    lc_title      VARCHAR(255),
    lc_url        TEXT,
    lc_difficulty VARCHAR(50)
);

-- ────────────────────────────────────────────
-- 3. lintcode_info — LintCode-specific fields
-- ────────────────────────────────────────────
CREATE TABLE lintcode_info (
    unified_id      INT PRIMARY KEY REFERENCES problems(unified_id),
    lint_id         INT,
    lint_title      VARCHAR(255),
    lint_url        TEXT,
    lint_difficulty  VARCHAR(50)
);

-- ────────────────────────────────────────────
-- 4. curated_lists — study list membership
-- ────────────────────────────────────────────
-- Why separate?
--   Curated list flags change independently from problem metadata.
--   Easy to add new lists (just add a column) without touching other tables.
CREATE TABLE curated_lists (
    unified_id  INT PRIMARY KEY REFERENCES problems(unified_id),
    grind75     BOOLEAN DEFAULT FALSE,
    blind75     BOOLEAN DEFAULT FALSE,
    neetcode150 BOOLEAN DEFAULT FALSE
);

-- ────────────────────────────────────────────
-- 5. tags — one row per (problem, source, tag)
-- ────────────────────────────────────────────
-- Why separate?
--   Original schema stored tags as comma-separated string ("Array,Hash Table").
--   Normalized: each tag is its own row.
--   Benefit: can query "all problems with tag=Array" with a simple WHERE, no string parsing.
CREATE TABLE tags (
    id          SERIAL PRIMARY KEY,
    unified_id  INT REFERENCES problems(unified_id),
    source      VARCHAR(20) NOT NULL,   -- 'leetcode' or 'lintcode'
    tag_name    VARCHAR(100) NOT NULL
);


-- ============================================================
-- INDEX STRATEGY
-- ============================================================
-- Design principle: create indexes based on actual query patterns
-- from server.js GET /search endpoint.
-- ============================================================

-- ── Pattern 1: Search by LeetCode/LintCode ID (exact match) ──
-- Query:  WHERE lc_id = $1  /  WHERE lint_id = $1
-- Index type: B-tree (default) — perfect for equality comparison
-- Why needed: Without index, DB does sequential scan on every row.
--             With index, it's a single B-tree lookup → O(log n).
CREATE INDEX idx_lc_id   ON leetcode_info (lc_id);
CREATE INDEX idx_lint_id ON lintcode_info (lint_id);

-- ── Pattern 2: Search by title (substring/ILIKE match) ──
-- Query:  WHERE lc_title ILIKE '%two sum%'
-- Index type: GIN with pg_trgm — because B-tree CANNOT help with
--             leading-wildcard patterns like '%keyword%'.
--             Trigram index breaks text into 3-char chunks and indexes them,
--             enabling fast substring matching.
-- Trade-off: Slightly more storage + slower writes,
--            but transforms O(n) sequential scan → O(1) index scan for ILIKE.
-- When NOT worth it: If table has < 100 rows. Here we have ~3,700 → worth it.
CREATE INDEX idx_lc_title_trgm   ON leetcode_info  USING GIN (lc_title  gin_trgm_ops);
CREATE INDEX idx_lint_title_trgm ON lintcode_info   USING GIN (lint_title gin_trgm_ops);

-- ── Pattern 3: Filter by curated list (boolean filter) ──
-- Query:  WHERE grind75 = TRUE  (then JOIN + title ILIKE)
-- Index type: Partial index — only indexes rows where flag = TRUE.
-- Why partial? grind75 has ~75 TRUE out of ~3,700 rows (2%).
--             A full index on a boolean column is nearly useless
--             because selectivity is too low.
--             Partial index stores ONLY the ~75 matching rows → tiny and fast.
CREATE INDEX idx_grind75    ON curated_lists (unified_id) WHERE grind75    = TRUE;
CREATE INDEX idx_blind75    ON curated_lists (unified_id) WHERE blind75    = TRUE;
CREATE INDEX idx_neetcode150 ON curated_lists (unified_id) WHERE neetcode150 = TRUE;

-- ── Pattern 4: Fetch tags for a specific problem ──
-- Query:  WHERE unified_id = $1 AND source = 'leetcode'
-- Index type: Composite B-tree — covers both columns in one lookup.
-- Why composite? Single-column index on unified_id works, but composite
--               (unified_id, source) is an "index-only scan" for this query pattern.
CREATE INDEX idx_tags_lookup ON tags (unified_id, source);

-- ── Pattern 5: Search problems by tag name ──
-- Query:  WHERE tag_name = 'Array'
-- Index type: B-tree — exact match on tag name.
CREATE INDEX idx_tags_name ON tags (tag_name);


-- ============================================================
-- Verification queries (run after ETL)
-- ============================================================
-- SELECT count(*) FROM problems;
-- SELECT count(*) FROM leetcode_info;
-- SELECT count(*) FROM lintcode_info;
-- SELECT count(*) FROM curated_lists WHERE grind75 = TRUE;
-- SELECT count(*) FROM tags;
--
-- EXPLAIN ANALYZE
-- SELECT * FROM leetcode_info WHERE lc_title ILIKE '%two sum%';
-- (should show "Bitmap Index Scan on idx_lc_title_trgm")