"""
ETL Pipeline for High-Performance LeetCode Query Engine
========================================================
Extract  : Read raw CSV containing LeetCode + LintCode + curated list data
Transform: Clean, validate, split into 5 normalized tables
Load     : Create PostgreSQL schema and bulk-insert

Usage:
    pip install pandas psycopg2-binary python-dotenv
    python etl.py
"""

import os
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()


# ─────────────────────────────────────────────
# Database connection
# ─────────────────────────────────────────────
def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_DATABASE", "leetcode_finder"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )


# ─────────────────────────────────────────────
# STEP 1 — EXTRACT
# ─────────────────────────────────────────────
def extract(csv_path: str) -> pd.DataFrame:
    """Read the combined CSV that merges data from 5 sources."""
    print(f"[Extract] Reading {csv_path} ...")
    df = pd.read_csv(csv_path)
    print(f"[Extract] Loaded {len(df)} rows, {len(df.columns)} columns")
    return df


# ─────────────────────────────────────────────
# STEP 2 — TRANSFORM
# ─────────────────────────────────────────────
def transform(df: pd.DataFrame) -> dict:
    """
    Clean raw data and split into normalized tables:
      - problems       : core identity (unified_id, relation)
      - leetcode_info  : LeetCode-specific fields
      - lintcode_info  : LintCode-specific fields
      - curated_lists  : Grind75 / Blind75 / NeetCode150 flags
      - tags           : one row per (problem, source, tag_name)

    Why normalize?
      1. Eliminates redundancy (tags were comma-separated strings)
      2. Enables direct SQL queries on tags (WHERE tag_name = 'Array')
      3. Each source's data can change independently
    """
    print("[Transform] Cleaning and normalizing ...")

    # ── Clean string columns ──
    str_cols = df.select_dtypes(include="object").columns
    df[str_cols] = df[str_cols].apply(lambda c: c.str.strip())

    # ── Clean boolean flags ──
    for flag in ["grind75", "blind75", "neetcode150"]:
        if flag in df.columns:
            df[flag] = df[flag].fillna(False).astype(bool)

    # ── Clean numeric IDs ──
    for col in ["lc_id", "lint_id"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # ── Standardize difficulty values ──
    for col in ["lc_difficulty", "lint_difficulty"]:
        if col in df.columns:
            df[col] = df[col].str.strip().str.capitalize()

    # ────────────────────────────────────────
    # Split into normalized tables
    # ────────────────────────────────────────

    # 1) problems — every row gets an entry
    problems = df[["unified_id"]].copy()
    problems["relation"] = df["relation"].fillna("unknown") if "relation" in df.columns else "unknown"

    # 2) leetcode_info — only rows that have LeetCode data
    lc_cols = ["unified_id", "lc_id", "lc_slug", "lc_title", "lc_url", "lc_difficulty"]
    leetcode_info = df[lc_cols].dropna(subset=["lc_id"]).copy()
    leetcode_info["lc_id"] = leetcode_info["lc_id"].astype(int)

    # 3) lintcode_info — only rows that have LintCode data
    lint_cols = ["unified_id", "lint_id", "lint_title", "lint_url", "lint_difficulty"]
    lintcode_info = df[lint_cols].dropna(subset=["lint_id"]).copy()
    lintcode_info["lint_id"] = lintcode_info["lint_id"].astype(int)

    # 4) curated_lists — all rows (flags default to False)
    list_cols = ["unified_id", "grind75", "blind75", "neetcode150"]
    curated_lists = df[list_cols].copy()

    # 5) tags — explode comma-separated strings into individual rows
    #    Before: "Array,Hash Table" (one cell)
    #    After:  ("Array", "leetcode"), ("Hash Table", "leetcode") (two rows)
    tag_rows = []
    for _, row in df.iterrows():
        uid = row["unified_id"]
        for col, source in [("lc_tags", "leetcode"), ("lint_tags", "lintcode")]:
            if col in df.columns and pd.notna(row.get(col)):
                for tag in str(row[col]).split(","):
                    tag = tag.strip()
                    if tag:
                        tag_rows.append((uid, source, tag))

    tags = pd.DataFrame(tag_rows, columns=["unified_id", "source", "tag_name"])
    tags = tags.drop_duplicates()

    # ── Validation ──
    assert problems["unified_id"].is_unique, "Duplicate unified_id found!"
    assert leetcode_info["unified_id"].is_unique, "Duplicate LC entries!"
    assert lintcode_info["unified_id"].is_unique, "Duplicate LintCode entries!"

    print(f"[Transform] problems:      {len(problems):>5} rows")
    print(f"[Transform] leetcode_info: {len(leetcode_info):>5} rows")
    print(f"[Transform] lintcode_info: {len(lintcode_info):>5} rows")
    print(f"[Transform] curated_lists: {len(curated_lists):>5} rows")
    print(f"[Transform] tags:          {len(tags):>5} rows (exploded from comma-separated)")

    return {
        "problems": problems,
        "leetcode_info": leetcode_info,
        "lintcode_info": lintcode_info,
        "curated_lists": curated_lists,
        "tags": tags,
    }


# ─────────────────────────────────────────────
# STEP 3 — LOAD
# ─────────────────────────────────────────────

# DDL matches setup_database.sql exactly
DDL = """
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS tags           CASCADE;
DROP TABLE IF EXISTS curated_lists  CASCADE;
DROP TABLE IF EXISTS lintcode_info  CASCADE;
DROP TABLE IF EXISTS leetcode_info  CASCADE;
DROP TABLE IF EXISTS problems       CASCADE;

CREATE TABLE problems (
    unified_id  INT PRIMARY KEY,
    relation    VARCHAR(50) DEFAULT 'unknown'
);

CREATE TABLE leetcode_info (
    unified_id    INT PRIMARY KEY REFERENCES problems(unified_id),
    lc_id         INT,
    lc_slug       VARCHAR(255),
    lc_title      VARCHAR(255),
    lc_url        TEXT,
    lc_difficulty VARCHAR(50)
);

CREATE TABLE lintcode_info (
    unified_id      INT PRIMARY KEY REFERENCES problems(unified_id),
    lint_id         INT,
    lint_title      VARCHAR(255),
    lint_url        TEXT,
    lint_difficulty  VARCHAR(50)
);

CREATE TABLE curated_lists (
    unified_id  INT PRIMARY KEY REFERENCES problems(unified_id),
    grind75     BOOLEAN DEFAULT FALSE,
    blind75     BOOLEAN DEFAULT FALSE,
    neetcode150 BOOLEAN DEFAULT FALSE
);

CREATE TABLE tags (
    id          SERIAL PRIMARY KEY,
    unified_id  INT REFERENCES problems(unified_id),
    source      VARCHAR(20)  NOT NULL,
    tag_name    VARCHAR(100) NOT NULL
);

-- B-tree indexes: exact match on IDs
CREATE INDEX idx_lc_id   ON leetcode_info (lc_id);
CREATE INDEX idx_lint_id ON lintcode_info (lint_id);

-- GIN trigram indexes: ILIKE '%keyword%' substring search
CREATE INDEX idx_lc_title_trgm   ON leetcode_info  USING GIN (lc_title  gin_trgm_ops);
CREATE INDEX idx_lint_title_trgm ON lintcode_info   USING GIN (lint_title gin_trgm_ops);

-- Partial indexes: only index the ~2% of rows where flag = TRUE
CREATE INDEX idx_grind75     ON curated_lists (unified_id) WHERE grind75     = TRUE;
CREATE INDEX idx_blind75     ON curated_lists (unified_id) WHERE blind75     = TRUE;
CREATE INDEX idx_neetcode150 ON curated_lists (unified_id) WHERE neetcode150 = TRUE;

-- Composite index: fetch tags by (problem, source) in one lookup
CREATE INDEX idx_tags_lookup ON tags (unified_id, source);
CREATE INDEX idx_tags_name   ON tags (tag_name);
"""


def load(tables: dict):
    """Create normalized tables and bulk-insert all data."""
    conn = get_connection()
    cur = conn.cursor()

    print("[Load] Creating schema and indexes ...")
    cur.execute(DDL)

    def bulk_insert(table_name: str, df: pd.DataFrame):
        if df.empty:
            return
        cols = df.columns.tolist()
        # Convert NaN/NaT to None for PostgreSQL NULL
        clean = df.where(df.notna(), other=None)
        values = [tuple(row) for row in clean.itertuples(index=False, name=None)]
        sql = f"INSERT INTO {table_name} ({', '.join(cols)}) VALUES %s"
        execute_values(cur, sql, values, page_size=500)
        print(f"[Load] {table_name}: {len(values)} rows inserted")

    bulk_insert("problems", tables["problems"])
    bulk_insert("leetcode_info", tables["leetcode_info"])
    bulk_insert("lintcode_info", tables["lintcode_info"])
    bulk_insert("curated_lists", tables["curated_lists"])
    bulk_insert("tags", tables["tags"])

    conn.commit()

    # ── Verify ──
    print("\n[Verify] Row counts:")
    for t in ["problems", "leetcode_info", "lintcode_info", "curated_lists", "tags"]:
        cur.execute(f"SELECT count(*) FROM {t}")
        print(f"  {t}: {cur.fetchone()[0]}")

    cur.close()
    conn.close()


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
if __name__ == "__main__":
    CSV_PATH = "coding_problems_database.corrected.csv"

    raw = extract(CSV_PATH)
    tables = transform(raw)
    load(tables)

    print("\n✅ ETL pipeline completed successfully!")