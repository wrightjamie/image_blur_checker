let allImages = [];
let duplicates = [];
let currentThreshold = 100;

const blurThresholdInput = document.getElementById('blur-threshold');
const thresholdVal = document.getElementById('threshold-val');
const blurredGrid = document.getElementById('blurred-grid');
const duplicatesContainer = document.getElementById('duplicates-container');
const blurCount = document.getElementById('blur-count');
const dupCount = document.getElementById('dup-count');

// Setup Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.getElementById(`${tabId}-tab`).classList.add('active');
    });
});

// Setup Slider
blurThresholdInput.addEventListener('input', (e) => {
    currentThreshold = parseFloat(e.target.value);
    thresholdVal.textContent = currentThreshold;
    renderBlurred();
});

// Setup Scan Button
document.getElementById('scan-btn').addEventListener('click', async () => {
    const btn = document.getElementById('scan-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Scanning (check back later)...';
    btn.disabled = true;
    
    try {
        await fetch('/api/scan', { method: 'POST' });
        
        // Poll every 3 seconds for updates, or just reload after a bit.
        // For simplicity we will just tell the user scan started and fetch once after 3 seconds.
        setTimeout(async () => {
            await fetchData();
            btn.textContent = originalText;
            btn.disabled = false;
        }, 3000);
    } catch(err) {
        console.error(err);
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

async function fetchData() {
    try {
        const res = await fetch('/api/images');
        const data = await res.json();
        allImages = data.images.filter(img => !img.is_ignored);
        duplicates = data.duplicates.map(group => group.filter(img => !img.is_ignored)).filter(g => g.length > 1);
        
        renderBlurred();
        renderDuplicates();
    } catch (err) {
        console.error("Error fetching data:", err);
    }
}

function renderBlurred() {
    const blurred = allImages.filter(img => img.blur_score < currentThreshold);
    blurCount.textContent = blurred.length;
    
    blurredGrid.innerHTML = '';
    blurred.forEach(img => {
        const card = createCard(img);
        blurredGrid.appendChild(card);
    });
}

function renderDuplicates() {
    let count = 0;
    duplicatesContainer.innerHTML = '';
    duplicates.forEach((group, index) => {
        count += group.length;
        const groupEl = document.createElement('div');
        groupEl.className = 'duplicate-group';
        groupEl.innerHTML = `<h3>Duplicate Group ${index + 1} (${group.length} items)</h3>`;
        
        const grid = document.createElement('div');
        grid.className = 'duplicate-grid';
        
        group.forEach(img => {
            grid.appendChild(createCard(img));
        });
        
        groupEl.appendChild(grid);
        duplicatesContainer.appendChild(groupEl);
    });
    dupCount.textContent = count;
}

function createCard(img) {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
        <div class="card-img-container">
            <img src="/api/serve-image/${encodeURIComponent(img.path)}" alt="${img.filename}" loading="lazy">
        </div>
        <div class="card-content">
            <div class="card-title" title="${img.path}">${img.filename}</div>
            <div class="card-meta">Blur Score: ${img.blur_score.toFixed(1)}</div>
            <div class="card-actions">
                <button class="btn secondary" onclick="ignoreImage('${img.path}')">Ignore</button>
                <button class="btn danger" onclick="deleteImage('${img.path}')">Delete</button>
            </div>
        </div>
    `;
    return div;
}

window.deleteImage = async function(path) {
    if (!confirm('Are you sure you want to permanently delete this image from your filesystem?')) return;
    
    try {
        await fetch(`/api/images/${encodeURIComponent(path)}`, { method: 'DELETE' });
        fetchData();
    } catch(err) {
        alert('Failed to delete image');
    }
}

window.ignoreImage = async function(path) {
    try {
        await fetch(`/api/images/${encodeURIComponent(path)}/ignore`, { method: 'POST' });
        fetchData();
    } catch(err) {
        alert('Failed to ignore image');
    }
}

// Initial fetch
fetchData();
// Poll every 10 seconds just in case background scan finds things
setInterval(fetchData, 10000);
