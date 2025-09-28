// This script is injected into every webpage.
(function() {
    // Avoid duplicate injections in iframes.
    if (window.self !== window.top) {
        return;
    }

    // 1. Create the trigger icon.
    const trigger = document.createElement('div');
    trigger.id = 'upf-trigger';
    trigger.title = 'Open Unified Problem Finder';
    trigger.innerHTML = '💡'; // You can use any emoji or SVG icon.
    document.body.appendChild(trigger);

    // 2. Create the iframe container for the search UI.
    const container = document.createElement('div');
    container.id = 'upf-container';
    container.style.display = 'none'; // Hidden by default.

    // 3. Create the iframe and load our popup.html.
    const iframe = document.createElement('iframe');
    iframe.id = 'upf-iframe';
    iframe.src = chrome.runtime.getURL('popup.html');
    container.appendChild(iframe);
    document.body.appendChild(container);

    // 4. Add a click event to the trigger to show/hide the search window.
    trigger.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent the event from bubbling up to the document.
        const isVisible = container.style.display === 'block';
        container.style.display = isVisible ? 'none' : 'block';
    });

    // 5. Close the search window if the user clicks anywhere else on the page.
    document.addEventListener('click', () => {
        if (container.style.display === 'block') {
            container.style.display = 'none';
        }
    });
    
    // 6. Don't close the container if it's clicked directly.
    container.addEventListener('click', (e) => e.stopPropagation());
})();

