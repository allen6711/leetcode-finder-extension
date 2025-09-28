-- This script will create the necessary table and import the data from the CSV file.
-- This version includes a more robust COPY command to handle complex CSV formatting.

-- Drop the table if it already exists to ensure a clean setup.
DROP TABLE IF EXISTS problems;

-- Create the table structure to match the CSV columns.
CREATE TABLE problems (
    unified_id INT PRIMARY KEY,
    lc_id INT,
    lc_slug VARCHAR(255),
    lc_title VARCHAR(255),
    lc_url TEXT,
    lc_difficulty VARCHAR(50),
    lc_tags TEXT,
    lint_id INT,
    lint_title VARCHAR(255),
    lint_url TEXT,
    lint_difficulty VARCHAR(50),
    lint_tags TEXT,
    grind75 BOOLEAN,
    blind75 BOOLEAN,
    neetcode150 BOOLEAN,
    relation VARCHAR(50)
);

-- Use the \copy command with explicit format options for robustness.
-- DELIMITER ',': Sets the comma as the column separator.
-- CSV HEADER: Specifies it's a standard CSV file with a header row.
-- QUOTE '"': Defines the double quote as the character for enclosing fields.
-- ESCAPE '"': Specifies that a double quote within a quoted field is escaped by another double quote ("").
\copy problems FROM 'coding_problems_database.csv' WITH (FORMAT CSV, HEADER, DELIMITER ',', QUOTE '"', ESCAPE '"');


-- Verify the import by counting the rows.
SELECT count(*) FROM problems;

-- Display a few sample rows to confirm the data looks correct.
SELECT * FROM problems where unified_id >= 470 limit 5;
```
