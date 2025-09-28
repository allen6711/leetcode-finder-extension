document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const sourceSelect = document.getElementById('sourceSelect');
    const searchButton = document.getElementById('searchButton');
    const resultsContainer = document.getElementById('results');

    // The API endpoint for our backend server, which we will build later.
    const API_ENDPOINT = 'http://localhost:3000/search';

    const performSearch = async () => {
        const query = searchInput.value.trim();
        const source = sourceSelect.value;
        if (!query) {
            resultsContainer.innerHTML = `<div class="status-msg">Please enter a search query.</div>`;
            return;
        }

        resultsContainer.innerHTML = `<div class="status-msg">Searching...</div>`;

        try {
            // Send request to the backend API
            const response = await fetch(`${API_ENDPOINT}?query=${encodeURIComponent(query)}&source=${source}`);
            if (!response.ok) {
                throw new Error(`Network or server error (Status: ${response.status})`);
            }
            const results = await response.json();
            displayResults(results);
        } catch (error) {
            console.error('An error occurred during search:', error);
            resultsContainer.innerHTML = `<div class="status-msg">Failed to fetch results.<br>Please ensure the backend server is running.</div>`;
        }
    };

    const displayResults = (results) => {
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = `<div class="status-msg">No problems found.</div>`;
            return;
        }

        resultsContainer.innerHTML = ''; // Clear previous results or status messages

        results.forEach(p => {
            const item = document.createElement('div');
            item.className = 'result-item';
            const title = p.lc_title || p.lint_title || 'Unknown Problem';

            // A helper function to render each detail line
            const renderDetail = (label, value, isLink = false) => {
                let displayValue;
                if (value && value !== 'false') {
                    if (isLink) {
                        displayValue = `<a href="${value}" target="_blank">View Problem</a>`;
                    } else {
                        displayValue = (value === 'true' ? '✔️ Yes' : value);
                    }
                } else {
                    displayValue = `<span class="none">None</span>`;
                }
                return `<div class="label">${label}:</div><div class="value">${displayValue}</div>`;
            };

            item.innerHTML = `
                <h4>${title} (#${p.unified_id})</h4>
                <div class="details">
                    ${renderDetail('LeetCode ID', p.lc_id)}
                    ${renderDetail('LeetCode URL', p.lc_url, true)}
                    ${renderDetail('LintCode ID', p.lint_id)}
                    ${renderDetail('LintCode URL', p.lint_url, true)}
                    ${renderDetail('Grind75', String(p.grind75))}
                    ${renderDetail('Blind75', String(p.blind75))}
                    ${renderDetail('NeetCode150', String(p.neetcode150))}
                </div>`;
            resultsContainer.appendChild(item);
        });
    };

    // Bind events
    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
});

