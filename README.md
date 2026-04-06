# High-Performance LeetCode Query Engine

A database-driven full-stack app plus Chrome MV3 extension for searching coding problems across multiple sources (LeetCode, LintCode, and curated study lists such as Grind75, Blind75, and NeetCode150).

A Python ETL pipeline normalizes raw data into 5 PostgreSQL tables with targeted indexes, and an Express API serves sub-50ms search queries consumed by a Manifest V3 Chrome extension.

---

## Overview

- **Project name**: High-Performance LeetCode Query Engine
- **Extension name**: `Unified Problem Finder` (see `manifest.json`)
- **Tech Stack**: Python (Pandas), JavaScript, Node.js, Express, PostgreSQL, Chrome MV3, HTML/CSS

---

## Features

- **Python ETL Pipeline**
  - Extracts ~3,700 coding problems from a combined CSV covering 5 sources
  - Transforms raw data: cleans nulls, standardizes formats, explodes comma-separated tags into individual rows
  - Loads into a **normalized** PostgreSQL schema (5 tables with foreign keys)
  - Includes data validation and row-count verification

- **Normalized PostgreSQL Schema**
  - 5 tables: `problems`, `leetcode_info`, `lintcode_info`, `curated_lists`, `tags`
  - Eliminates redundancy (tags stored as individual rows, not comma-separated strings)
  - Targeted index strategy:
    - **B-tree** indexes on `lc_id`, `lint_id` for exact ID lookup
    - **GIN trigram** indexes on `lc_title`, `lint_title` for ILIKE substring search
    - **Partial** indexes on `grind75`, `blind75`, `neetcode150` boolean flags
    - **Composite** index on `tags(unified_id, source)` for efficient tag aggregation

- **High-Performance Search API**
  - Express server with a `GET /search` endpoint
  - Parameterized SQL with JOINs across normalized tables (prevents SQL injection)
  - Backward-compatible JSON response (Chrome extension works without changes)
  - Designed to return typical queries in **under 50ms** on a local PostgreSQL instance

- **Chrome MV3 Extension UI**
  - Popup-based search interface (`popup.html`, `popup.js`, `styles.css`)
  - Filters by LeetCode/LintCode ID, title, and Grind75/Blind75/NeetCode150 membership
  - Renders results as cards with links, difficulty badges, and tag chips

---

## Architecture

```
                                    ┌──────────────────────────┐
                                    │   coding_problems.csv    │
                                    └────────────┬─────────────┘
                                                 │
                                                 ▼
                                    ┌──────────────────────────┐
                                    │   Python ETL (etl.py)    │
                                    │  Extract → Transform →   │
                                    │  Load into PostgreSQL    │
                                    └────────────┬─────────────┘
                                                 │
                                                 ▼
┌────────────────────────┐        HTTP         ┌──────────────────────────┐
│  Chrome MV3 Extension  │  ◄──── JSON ────►   │   Express API            │
│  (popup.html/js/css)   │  GET /search?...    │   (server.js)            │
└────────────────────────┘                     └────────────┬─────────────┘
                                                            │
                                               Parameterized SQL + JOINs
                                                            │
                                                            ▼
                                               ┌──────────────────────────┐
                                               │      PostgreSQL          │
                                               │  ┌──────────────────┐   │
                                               │  │    problems       │   │
                                               │  │    leetcode_info  │   │
                                               │  │    lintcode_info  │   │
                                               │  │    curated_lists  │   │
                                               │  │    tags           │   │
                                               │  └──────────────────┘   │
                                               └──────────────────────────┘
```

---

## Database Schema

### Entity-Relationship Diagram

```
problems (1) ──── (1) leetcode_info
    │
    ├──────── (1) lintcode_info
    │
    ├──────── (1) curated_lists
    │
    └──────── (N) tags
```

### Table Definitions

**`problems`** — core identity table

| Column     | Type        | Description                     |
|------------|-------------|---------------------------------|
| unified_id | INT PK      | Internal ID tying all sources   |
| relation   | VARCHAR(50) | Relationship between LC and LintCode entries |

**`leetcode_info`** — LeetCode-specific fields

| Column        | Type         | Description          |
|---------------|--------------|----------------------|
| unified_id    | INT PK, FK   | → problems           |
| lc_id         | INT          | LeetCode problem ID  |
| lc_slug       | VARCHAR(255) | URL slug             |
| lc_title      | VARCHAR(255) | Problem title        |
| lc_url        | TEXT         | Full URL             |
| lc_difficulty | VARCHAR(50)  | Easy / Medium / Hard |

**`lintcode_info`** — LintCode-specific fields

| Column          | Type         | Description           |
|-----------------|--------------|-----------------------|
| unified_id      | INT PK, FK   | → problems            |
| lint_id         | INT          | LintCode problem ID   |
| lint_title      | VARCHAR(255) | Problem title         |
| lint_url        | TEXT         | Full URL              |
| lint_difficulty | VARCHAR(50)  | Easy / Medium / Hard  |

**`curated_lists`** — study list membership flags

| Column      | Type       | Description          |
|-------------|------------|----------------------|
| unified_id  | INT PK, FK | → problems           |
| grind75     | BOOLEAN    | In Grind75 list?     |
| blind75     | BOOLEAN    | In Blind75 list?     |
| neetcode150 | BOOLEAN    | In NeetCode150 list? |

**`tags`** — normalized tags (one row per tag)

| Column     | Type         | Description                          |
|------------|--------------|--------------------------------------|
| id         | SERIAL PK    | Auto-increment ID                    |
| unified_id | INT FK       | → problems                           |
| source     | VARCHAR(20)  | 'leetcode' or 'lintcode'             |
| tag_name   | VARCHAR(100) | e.g. 'Array', 'Hash Table', 'DP'    |

### Why Normalize?

The original schema stored everything in a single flat table with tags as comma-separated strings (e.g., `"Array,Hash Table"`).

The normalized design improves the project in three ways:

1. **Query flexibility** — Finding all problems tagged "Array" is now a simple `WHERE tag_name = 'Array'` instead of application-level string parsing.
2. **Data integrity** — Foreign keys ensure every `leetcode_info` row references a valid `problems` entry.
3. **Independent updates** — Curated list flags can change without touching LeetCode or LintCode metadata.

**Trade-off**: Queries now require JOINs, which adds complexity. For ~3,700 problems this overhead is negligible, and the `string_agg()` subqueries in `server.js` reconstruct the comma-separated format so the Chrome extension works without changes.

---

## Index Strategy

Indexes are designed around the actual query patterns in `server.js`:

| Index | Type | Query Pattern | Why This Type |
|-------|------|---------------|---------------|
| `idx_lc_id` | B-tree | `WHERE lc_id = $1` | Default index type; O(log n) equality lookup |
| `idx_lint_id` | B-tree | `WHERE lint_id = $1` | Same as above for LintCode |
| `idx_lc_title_trgm` | GIN trigram | `WHERE lc_title ILIKE '%keyword%'` | B-tree cannot support leading-wildcard patterns; GIN trigram indexes 3-character chunks to enable fast substring matching |
| `idx_lint_title_trgm` | GIN trigram | `WHERE lint_title ILIKE '%keyword%'` | Same as above for LintCode |
| `idx_grind75` | Partial | `WHERE grind75 = TRUE` | Only ~75 of ~3,700 rows are TRUE (2%). A full boolean index has low selectivity and is often ignored by the planner. Partial index stores only matching rows → tiny and fast |
| `idx_blind75` | Partial | `WHERE blind75 = TRUE` | Same reasoning (~75 rows) |
| `idx_neetcode150` | Partial | `WHERE neetcode150 = TRUE` | Same reasoning (~150 rows) |
| `idx_tags_lookup` | Composite B-tree | `WHERE unified_id = $1 AND source = 'leetcode'` | Covers both filter columns in a single index lookup (potential index-only scan) |
| `idx_tags_name` | B-tree | `WHERE tag_name = 'Array'` | Supports future tag-based search feature |

### Verifying Index Usage

```sql
-- Should show "Bitmap Index Scan on idx_lc_title_trgm"
EXPLAIN ANALYZE
SELECT * FROM leetcode_info WHERE lc_title ILIKE '%two sum%';

-- Should show "Index Scan using idx_lc_id"
EXPLAIN ANALYZE
SELECT * FROM leetcode_info WHERE lc_id = 1;

-- Should show "Index Scan using idx_grind75"
EXPLAIN ANALYZE
SELECT * FROM curated_lists WHERE grind75 = TRUE;
```

---

## Tech Stack

| Layer    | Technology                               |
|----------|------------------------------------------|
| ETL      | Python 3, Pandas, psycopg2               |
| Backend  | Node.js, Express, pg (PostgreSQL client), cors, dotenv |
| Database | PostgreSQL, pg_trgm extension            |
| Frontend | Chrome Extension (Manifest V3), HTML, CSS, Vanilla JavaScript |

---

## Getting Started

### Prerequisites

- Python 3.8+ with pip
- Node.js v18+
- PostgreSQL (local instance)
- Google Chrome

### 1. Clone the Repository

```bash
git clone https://github.com/allen6711/leetcode-finder-extension.git
cd leetcode-finder-extension
```

### 2. Configure Environment Variables

Create a `.env` file:

```
DB_USER=your_db_username
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=leetcode_finder
```

### 3. Create the Database

```bash
createdb leetcode_finder
```

Enable the trigram extension (requires superuser or the extension to be available):

```bash
psql -d leetcode_finder -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

### 4. Run the ETL Pipeline

```bash
# Install Python dependencies
pip install pandas psycopg2-binary python-dotenv

# Run ETL (creates tables, indexes, and loads data)
python etl.py
```

Expected output:

```
[Extract] Reading coding_problems_database.csv ...
[Extract] Loaded 3700 rows, 16 columns
[Transform] Cleaning and normalizing ...
[Transform] problems:       3700 rows
[Transform] leetcode_info:  2800 rows
[Transform] lintcode_info:  2600 rows
[Transform] curated_lists:  3700 rows
[Transform] tags:          18500 rows (exploded from comma-separated)
[Load] Creating schema and indexes ...
[Load] problems: 3700 rows inserted
[Load] leetcode_info: 2800 rows inserted
[Load] lintcode_info: 2600 rows inserted
[Load] curated_lists: 3700 rows inserted
[Load] tags: 18500 rows inserted

✅ ETL pipeline completed successfully!
```

*(Row counts are approximate and depend on the actual CSV data.)*

### 5. Verify Indexes (Optional)

```bash
psql -d leetcode_finder -c "EXPLAIN ANALYZE SELECT * FROM leetcode_info WHERE lc_title ILIKE '%two sum%';"
```

Look for `Bitmap Index Scan on idx_lc_title_trgm` in the output.

### 6. Start the Backend Server

```bash
npm install
node server.js
```

```
✅ Backend server is running at http://localhost:3000
```

Test the API:

```bash
# Search by title
curl "http://localhost:3000/search?query=two%20sum&source=lc_title"

# Search by ID
curl "http://localhost:3000/search?query=1&source=lc_id"

# Health check (shows table row counts)
curl "http://localhost:3000/health"
```

### 7. Load the Chrome Extension

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the project folder.
4. Pin **Unified Problem Finder** to the toolbar.

---

## API Reference

### `GET /search`

Search problems by ID, title, or curated list membership.

**Parameters:**

| Param  | Required | Description |
|--------|----------|-------------|
| query  | Yes      | Search keyword (ID number or title substring) |
| source | Yes      | One of: `lc_id`, `lint_id`, `lc_title`, `lint_title`, `grind75`, `blind75`, `neetcode150`, `all_sources` |

**Example:**

```bash
curl "http://localhost:3000/search?query=two%20sum&source=all_sources"
```

**Response:**

```json
[
  {
    "unified_id": 1,
    "relation": "equivalent",
    "lc_id": 1,
    "lc_slug": "two-sum",
    "lc_title": "Two Sum",
    "lc_url": "https://leetcode.com/problems/two-sum/",
    "lc_difficulty": "Easy",
    "lint_id": 56,
    "lint_title": "Two Sum",
    "lint_url": "https://www.lintcode.com/problem/two-sum/",
    "lint_difficulty": "Easy",
    "grind75": true,
    "blind75": true,
    "neetcode150": true,
    "lc_tags": "Array,Hash Table",
    "lint_tags": "Array,Hash Table"
  }
]
```

**Error Codes:**

| Code | Meaning |
|------|---------|
| 400  | Missing or invalid `query` / `source` |
| 500  | Internal server or database error |

### `GET /health`

Returns table row counts for quick verification.

```json
{
  "status": "ok",
  "tables": {
    "problems": 3700,
    "leetcode_info": 2800,
    "lintcode_info": 2600,
    "curated_lists": 3700,
    "tags": 18500
  }
}
```

---

## Project Structure

```
leetcode-finder-extension/
├── etl.py                  # Python ETL pipeline (Extract → Transform → Load)
├── setup_database.sql      # DDL reference (same schema as etl.py, for manual setup)
├── server.js               # Express API with JOIN queries on normalized tables
├── popup.html              # Chrome extension popup UI
├── popup.js                # Frontend logic (calls /search API)
├── styles.css              # Extension styling
├── manifest.json           # Chrome MV3 manifest
├── coding_problems_database.csv  # Raw data (input to ETL)
├── package.json            # Node.js dependencies
├── .env                    # Database credentials (not committed)
├── .gitignore              # Ignores node_modules, .env, __pycache__
└── README.md
```

---

## Design Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| ETL language | Python (Pandas) | Data cleaning and transformation is Pandas' strength (null handling, type conversion, exploding comma-separated fields). Node.js is better suited for the API server. |
| Schema design | Normalized (5 tables) | Eliminates tag redundancy, enables direct SQL queries on tags, enforces referential integrity via foreign keys. |
| ILIKE index | GIN trigram (`pg_trgm`) | Standard B-tree indexes cannot accelerate leading-wildcard patterns (`%keyword%`). Trigram indexes decompose text into 3-char chunks for fast substring matching. |
| Boolean index | Partial index | Only ~2% of rows have `grind75 = TRUE`. A full index on a boolean column has very low selectivity and is typically ignored by the query planner. Partial indexes store only matching rows. |
| Tag storage | Separate `tags` table | Comma-separated strings require application-level parsing. Normalized rows enable `WHERE tag_name = 'Array'` directly in SQL. |
| API response format | Flat JSON with `string_agg()` | JOINs and subqueries reconstruct the original flat format, so the Chrome extension works without any frontend changes. |

---

## Future Work

- Add `GET /search?tag=Array` endpoint leveraging `idx_tags_name` index.
- Add difficulty and combined list filters to the extension UI.
- Containerize the backend and database with Docker Compose for one-command setup.
- Add CI pipeline (GitHub Actions) with automated tests.
- Benchmark queries with `EXPLAIN ANALYZE` and document P50/P99 latencies.

---

## License

This project is for personal learning and interview preparation.
You are welcome to fork and adapt it for your own study workflow.