// This script waits for the DOM to be fully loaded before running,
// ensuring that all HTML elements are available for selection.

document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selections ---
    // This line MUST find the element with the corresponding ID in popup.html
    const searchInput = document.getElementById('searchInput');
    const sourceSelect = document.getElementById('sourceSelector'); // Must match the <select> id
    const searchButton = document.getElementById('searchButton');
    const resultsContainer = document.getElementById('resultsContainer');

    const API_ENDPOINT = 'http://localhost:3000/search';

    // --- Main Search Function ---
    async function performSearch() {
        // This check prevents the error if an element is somehow still not found.
        if (!searchInput || !sourceSelect) {
            console.error("Could not find search input or source select elements. Check HTML IDs.");
            return;
        }

        const query = searchInput.value.trim();
        const source = sourceSelect.value; // This was the line causing the error.

        if (!query) {
            resultsContainer.innerHTML = '<div class="result-card"><p>Please enter a search term.</p></div>';
            return;
        }

        resultsContainer.innerHTML = '<div class="result-card"><p>Searching...</p></div>';

        try {
            const response = await fetch(`${API_ENDPOINT}?query=${encodeURIComponent(query)}&source=${source}`);
            
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }

            const results = await response.json();
            displayResults(results);

        } catch (error) {
            console.error('Fetch error:', error);
            resultsContainer.innerHTML = `<div class="result-card"><p>Error: Could not connect to the backend server. Is it running?</p></div>`;
        }
    }

    // --- Display Results Function ---
    function displayResults(results) {
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<div class="result-card"><p>No matching problems found.</p></div>';
            return;
        }

        resultsContainer.innerHTML = ''; // Clear previous results

        results.forEach(problem => {
            const card = document.createElement('div');
            card.className = 'result-card';

            const tagsHtml = (tags) => {
                if (!tags) return '<span>None</span>';
                return tags.split(',').map(tag => `<span class="tag">${tag.trim()}</span>`).join('');
            };
            
            const booleanFlag = (value, name) => {
                const className = value ? 'flag-true' : 'flag-false';
                return `<span class="flag ${className}">${name}</span>`;
            };

            card.innerHTML = `
                <div class="result-header">
                    ${problem.lc_title || problem.lint_title || 'Unknown Problem'}
                </div>
                <div class="result-body">
                    <div class="info-row">
                        <strong>LeetCode:</strong>
                        ${problem.lc_url ? `<a href="${problem.lc_url}" target="_blank">${problem.lc_id || ''} ${problem.lc_title} (${problem.lc_difficulty})</a>` : '<span class="none">None</span>'}
                    </div>
                    <div class="info-row">
                        <strong>LintCode:</strong>
                        ${problem.lint_url ? `<a href="${problem.lint_url}" target="_blank">${problem.lint_id || ''} ${problem.lint_title} (${problem.lint_difficulty})</a>` : '<span class="none">None</span>'}
                    </div>
                    <div class="info-row">
                        <strong>LC Tags:</strong>
                        <div class="tag-list">${tagsHtml(problem.lc_tags)}</div>
                    </div>
                    <div class="info-row">
                        <strong>On Lists:</strong>
                        <div class="boolean-flags">
                            ${booleanFlag(problem.grind75, 'Grind75')}
                            ${booleanFlag(problem.blind75, 'Blind75')}
                            ${booleanFlag(problem.neetcode150, 'NeetCode150')}
                        </div>
                    </div>
                </div>
            `;
            resultsContainer.appendChild(card);
        });
    }

    // --- Event Listeners ---
    if (searchButton) {
        searchButton.addEventListener('click', performSearch);
    }
    if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                performSearch();
            }
        });
    }
});

