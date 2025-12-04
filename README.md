# High-Performance LeetCode Query Engine

A database-driven full-stack app plus Chrome MV3 extension for searching coding problems across multiple sources (LeetCode, LintCode, and curated study lists such as Grind75, Blind75, and NeetCode150).  

The backend exposes a fast REST API on top of PostgreSQL, and the extension provides a lightweight search UI directly inside the browser.

---

## Overview

- **Project name**: High-Performance LeetCode Query Engine  
- **Extension name**: `Unified Problem Finder` (see `manifest.json`)  
- **Tech Stack**: JavaScript, Node.js, Express, PostgreSQL, Chrome MV3, HTML/CSS  

This project was built to provide a sub-50ms search experience over ~3,700 coding problems using a normalized PostgreSQL schema and a small Express API, consumed by a Manifest V3 Chrome extension.

---

## Features

- **Unified problem catalog**
  - Integrates ~3,700 coding problems from **5 sources** into a single normalized PostgreSQL table:
    - LeetCode (IDs, titles, slugs, URLs, difficulties, tags)
    - LintCode (IDs, titles, URLs, difficulties, tags)
    - Boolean flags for curated lists: **Grind75**, **Blind75**, **NeetCode150**

- **High-performance search API**
  - Express server with a `GET /search` endpoint
  - Parameterized SQL queries (no string concatenation of user input)
  - Designed to return typical queries in **under 50ms** on a local PostgreSQL instance

- **Chrome MV3 extension UI**
  - Popup-based UI (`popup.html`, `popup.js`, `styles.css`)
  - Filters by:
    - LeetCode / LintCode ID
    - LeetCode / LintCode title
    - Grind75 / Blind75 / NeetCode150 membership
  - Renders results as cards with links, difficulty, and tag chips

- **Robust ETL / data import**
  - `setup_database.sql` defines the `problems` table
  - Uses `\copy` with explicit CSV options to load `coding_problems_database.csv`
  - CSVs include LeetCode / LintCode metadata plus curated-list flags

---

## Architecture

### High-Level Diagram

```text
+------------------------+        HTTP (JSON)        +----------------------+
|  Chrome MV3 Extension  |  <--------------------->  |   Express.js API     |
| (popup.html / js / css)|   GET /search?query=...   |   (server.js)        |
+------------------------+                           +----------+-----------+
                                                               |
                                                               | Parameterized SQL
                                                               v
                                                     +----------------------+
                                                     |   PostgreSQL DB      |
                                                     |   (problems table)   |
                                                     +----------------------+
```

## Key Components
- Frontend (extension)
  - `manifest.json` – Chrome MV3 manifest; defines `Unified Problem Finder` action
  - `popup.html` – search input, source selector, results container
  - `styles.css` – styling for the popup
  - `popup.js` – calls the backend API at `http://localhost:3000/search` and renders results

- Backend (API)
  - `server.js`
    - Uses `express`, `pg`, `cors`, `dotenv`
    - Reads DB credentials from `.env`
    - Implements `GET /search?query=<query>&source=<source>`
    - Builds parameterized SQL based on `source`
    - Returns JSON rows from the `problems` table

- Database
  - PostgreSQL database (e.g., `leetcode_finder`)
  - `setup_database.sql`:
    - Drops and recreates `problems` table
    - Imports `coding_problems_database.csv` via `\copy`
    - Includes sanity checks: `SELECT count(*)`, sample rows, etc.

--- 

## Tech Stack
- Frontend
  - Chrome Extension (Manifest V3)
  - HTML / CSS
  - Vanilla JavaScript
- Backend
  - Node.js
  - Express
  - `pg` (PostgreSQL client)
  - `cors`
  - `dotenv`

- Database
  - PostgreSQL
  - Bulk CSV import via `\copy`

---

## Getting Started
1. Prerequisites
- Node.js (v18+ recommended)
- npm
- PostgreSQL (local instance)
- `psql` CLI available on PATH
 - Google Chrome (for loading the extension)

2. Clone the repository
```bash
git clone https://github.com/your-username/leetcode-query-engine.git
cd leetcode-query-engine/leetcode-finder-extension
```

Replace `your-username` and the repo name with your actual GitHub path if needed.

3. Install backend dependencies
```bash
npm install
```
This installs `express`, `pg`, `cors`, `dotenv`, etc.

4. Set up PostgreSQL

  1. Create the database (example name: `leetcode_finder`):
```bash
createdb leetcode_finder
```

  2. Create table and import data

  From the `leetcode-finder-extension` folder, start `psql`:
```bash
psql -d leetcode_finder
```

  Then inside the `psql` shell:
```sql
\i setup_database.sql;
```
  The script will: 
  - Drop and recreate the `problems` table
  - Load `coding_problems_database.csv` with a robust `\copy`
  - Run simple validation queries

Make sure `coding_problems_database.csv` is in the same directory that `psql` is launched from, or adjust the path inside `setup_database.sql`.

5. Configure environment variables

Create a `.env` file in `leetcode-finder-extension`:
```bash
touch .env
```

Add your PostgreSQL credentials:
```env
DB_USER=your_db_username
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=leetcode_finder
```

6. Run the backend server
```bash
node server.js
```

You should see:
```text
✅ Backend server is running at http://localhost:3000
```

Test the API:
```bash
curl "http://localhost:3000/search?query=two%20sum&source=lc_title"
```
---
## Load the Chrome MV3 Extension
1. Open Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `leetcode-finder-extension` folder.
5. Pin **Unified Problem Finder** to the toolbar if you want quick access.

The popup communicates with `http://localhost:3000/search`.
If you change the backend host/port, update `API_ENDPOINT` in `popup.js`.

---

## Usage
1. Click the extension icon to open the popup.
2. Enter a query (e.g., two sum, binary tree, 1).
3. Choose a Source:
    - `All Sources`
    - `LeetCode ID` / `LeetCode Title`
    - `LintCode ID` / `LintCode Title`
    - `Grind75`
    - `Blind75`
    - `NeetCode150`
4. Click **Search** or **press** Enter.

Each result card displays:
- LeetCode and/or LintCode titles with direct links
- Difficulty (Easy / Medium / Hard)
- Tag list (e.g., `Array`, `Hash Table`)
- Flags indicating whether the problem is in Grind75 / Blind75 / NeetCode150


---

## Database Schema

Defined in `setup_database.sql`:

```sql
CREATE TABLE problems (
    unified_id      INT PRIMARY KEY,
    lc_id           INT,
    lc_slug         VARCHAR(255),
    lc_title        VARCHAR(255),
    lc_url          TEXT,
    lc_difficulty   VARCHAR(50),
    lc_tags         TEXT,
    lint_id         INT,
    lint_title      VARCHAR(255),
    lint_url        TEXT,
    lint_difficulty VARCHAR(50),
    lint_tags       TEXT,
    grind75         BOOLEAN,
    blind75         BOOLEAN,
    neetcode150     BOOLEAN,
    relation        VARCHAR(50)
);
```
- `unified_id`: internal ID tying all sources for the same logical problem
- `relation`: relationship between LeetCode and LintCode entries (e.g., equivalent/related)

## API Reference
`GET /search`

Search problems based on a query and source.

### Request
```http
GET /search?query=<query>&source=<source>
```

- `query`: user input (ID, title substring, or keyword)
- `source`: one of:
  - `lc_id`, `lint_id`
  - `lc_title`, `lint_title`
  - `grind75`, `blind75`, `neetcode150`
  - `all_sources`

### Example
```bash
curl "http://localhost:3000/search?query=two%20sum&source=all_sources"
```

### Response (example)
```json
[
  {
    "unified_id": 1,
    "lc_id": 1,
    "lc_title": "Two Sum",
    "lc_url": "https://leetcode.com/problems/two-sum/",
    "lc_difficulty": "Easy",
    "lc_tags": "Array,Hash Table",
    "lint_id": 56,
    "lint_title": "Two Sum",
    "lint_url": "https://www.lintcode.com/problem/two-sum/",
    "lint_difficulty": "Easy",
    "lint_tags": "Array,Hash Table",
    "grind75": true,
    "blind75": true,
    "neetcode150": true,
    "relation": "equivalent"
  }
]
```

Error responses are returned with appropriate HTTP status codes:
- `400` – invalid or missing `query` / `source`
- `500` – internal server or database error

---

## Development Notes & Future Work
- Add PostgreSQL indexes on lc_id, lint_id, lc_title, lint_title, and curated-list flags to keep queries fast as the dataset grows.
- Extend the schema and ETL pipeline to include more platforms or custom lists.
- Enhance the UI with:
  - Difficulty filters
  - Tag filters
  - Combined list filters (e.g., “in Grind75 and NeetCode150”)
- Containerize the backend and database with Docker for easier local setup.

--- 

## License

This project is for personal learning and interview preparation.
You are welcome to fork and adapt it for your own study workflow.