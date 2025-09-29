// Load environment variables from the .env file to protect sensitive data
require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3000;

// Enable Cross-Origin Resource Sharing (CORS) to allow requests from the Chrome extension
app.use(cors());

// Create a PostgreSQL connection pool using credentials from the .env file
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

// Define the primary API endpoint for searching problems
app.get('/search', async (req, res) => {
  const { query, source } = req.query;

  // Basic validation for required parameters
  if (!query || !source) {
    return res.status(400).json({ error: 'The "query" and "source" parameters are required.' });
  }

  let dbQuery = '';
  let queryParams = [];

  // Use ILIKE for case-insensitive matching for string searches
  const searchQuery = `%${query}%`;

  try {
    // Build the database query based on the selected source
    switch (source) {
      case 'lc_id':
      case 'lint_id':
        if (isNaN(parseInt(query, 10))) {
             return res.status(400).json({ error: 'ID must be a number.' });
        }
        dbQuery = `SELECT * FROM problems WHERE ${source} = $1 LIMIT 20;`;
        queryParams = [parseInt(query, 10)];
        break;

      case 'lc_title':
      case 'lint_title':
        dbQuery = `SELECT * FROM problems WHERE ${source} ILIKE $1 LIMIT 20;`;
        queryParams = [searchQuery];
        break;

      case 'grind75':
      case 'blind75':
      case 'neetcode150':
        // CORRECTED: Use two separate parameters for the two ILIKE clauses
        dbQuery = `
          SELECT * FROM problems 
          WHERE ${source} = true AND (lc_title ILIKE $1 OR lint_title ILIKE $2) 
          LIMIT 20;
        `;
        queryParams = [searchQuery, searchQuery]; // Provide the parameter twice
        break;
      
      case 'all_sources':
         // CORRECTED: Use four separate parameters for the four ILIKE clauses
        dbQuery = `
          SELECT * FROM problems 
          WHERE 
            CAST(lc_id AS TEXT) ILIKE $1 OR 
            CAST(lint_id AS TEXT) ILIKE $2 OR
            lc_title ILIKE $3 OR 
            lint_title ILIKE $4
          LIMIT 20;
        `;
        queryParams = [searchQuery, searchQuery, searchQuery, searchQuery]; // Provide the parameter four times
        break;

      default:
        return res.status(400).json({ error: 'Invalid source specified.' });
    }

    // Execute the query against the database
    const { rows } = await pool.query(dbQuery, queryParams);
    res.json(rows);

  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
  // Strong Caching test
  const body = JSON.stringify(result);

  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
  res.setHeader('Timing-Allow-Origin', '*');
  res.type('json').send(body);
});

// Start the Express server and listen for incoming requests
app.listen(port, () => {
  console.log(`✅ Backend server is running at http://localhost:${port}`);
});

