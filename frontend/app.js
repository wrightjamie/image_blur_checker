let currentThreshold = 100;
let blurPage = 1;
let dupPage = 1;
const LIMIT = 50;
const DUP_LIMIT = 10;

const blurThresholdInput = document.getElementById('blur-threshold');
const thresholdVal = document.getElementById('threshold-val');
const blurredGrid = document.getElementById('blurred-grid');
const duplicatesContainer = document.getElementById('duplicates-container');
const blurCount = document.getElementById('blur-count');
const dupCount = document.getElementById('dup-count');

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getThresholdFromSlider(sliderVal) {
    let ratio = sliderVal / 100;
    return Math.round(Math.pow(ratio, 3) * 2000);
}

// Initial setup from HTML value
currentThreshold = getThresholdFromSlider(parseFloat(blurThresholdInput.value));
thresholdVal.textContent = currentThreshold;

// Progress Bar
const progContainer = document.getElementById('scan-progress-container');
const progText = document.getElementById('scan-progress-text');
const progBar = document.getElementById('scan-progress-bar');
const scanBtn = document.getElementById('scan-btn');

// Pagination Buttons
const blurPrev = document.getElementById('blur-prev');
const blurNext = document.getElementById('blur-next');
const blurInfo = document.getElementById('blur-page-info');

const dupPrev = document.getElementById('dup-prev');
const dupNext = document.getElementById('dup-next');
const dupInfo = document.getElementById('dup-page-info');

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

// Setup Slider (throttle to avoid spamming API)
let sliderTimeout;
blurThresholdInput.addEventListener('input', (e) => {
    currentThreshold = getThresholdFromSlider(parseFloat(e.target.value));
    thresholdVal.textContent = currentThreshold;
    
    clearTimeout(sliderTimeout);
    sliderTimeout = setTimeout(() => {
        blurPage = 1;
        fetchBlurred();
    }, 500);
});

// Setup Scan Button
scanBtn.addEventListener('click', async () => {
    try {
        await fetch('/api/scan', { method: 'POST' });
        pollStatus();
    } catch(err) {
        console.error(err);
    }
});

// Pagination listeners
blurPrev.addEventListener('click', () => { if (blurPage > 1) { blurPage--; fetchBlurred(); } });
blurNext.addEventListener('click', () => { blurPage++; fetchBlurred(); });

dupPrev.addEventListener('click', () => { if (dupPage > 1) { dupPage--; fetchDuplicates(); } });
dupNext.addEventListener('click', () => { dupPage++; fetchDuplicates(); });

async function fetchBlurred() {
    try {
        const res = await fetch(`/api/images/blurred?page=${blurPage}&limit=${LIMIT}&threshold=${currentThreshold}`);
        const data = await res.json();
        
        blurCount.textContent = data.total;
        blurInfo.textContent = `Page ${data.page} of ${data.total_pages || 1}`;
        blurPrev.disabled = data.page <= 1;
        blurNext.disabled = data.page >= data.total_pages;
        
        blurredGrid.innerHTML = '';
        data.images.forEach(img => {
            blurredGrid.appendChild(createCard(img));
        });
    } catch (err) {
        console.error(err);
    }
}

async function fetchDuplicates() {
    try {
        const res = await fetch(`/api/images/duplicates?page=${dupPage}&limit=${DUP_LIMIT}`);
        const data = await res.json();
        
        dupCount.textContent = data.total_groups + " groups";
        dupInfo.textContent = `Page ${data.page} of ${data.total_pages || 1}`;
        dupPrev.disabled = data.page <= 1;
        dupNext.disabled = data.page >= data.total_pages;
        
        duplicatesContainer.innerHTML = '';
        data.duplicates.forEach((group, index) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'duplicate-group';
            groupEl.innerHTML = `<h3>Duplicate Group ${((data.page-1)*data.limit) + index + 1} (${group.length} items)</h3>`;
            
            const grid = document.createElement('div');
            grid.className = 'duplicate-grid';
            
            group.forEach(img => grid.appendChild(createCard(img)));
            groupEl.appendChild(grid);
            duplicatesContainer.appendChild(groupEl);
        });
    } catch (err) {
        console.error(err);
    }
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
            <div class="card-meta">
                <div title="${img.path}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.8rem; margin-bottom: 2px;">
                    Path: ${img.path}
                </div>
                <div style="font-size: 0.8rem; margin-bottom: 2px;">Size: ${formatBytes(img.filesize || 0)}</div>
                <div style="font-size: 0.8rem;">Blur Score: ${img.blur_score.toFixed(1)}</div>
            </div>
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
        fetchBlurred();
        fetchDuplicates();
    } catch(err) { alert('Failed to delete image'); }
}

window.ignoreImage = async function(path) {
    try {
        await fetch(`/api/images/${encodeURIComponent(path)}/ignore`, { method: 'POST' });
        fetchBlurred();
        fetchDuplicates();
    } catch(err) { alert('Failed to ignore image'); }
}

async function pollStatus() {
    try {
        const res = await fetch('/api/status');
        const status = await res.json();
        
        if (status.is_scanning) {
            progContainer.style.display = 'block';
            scanBtn.disabled = true;
            progText.textContent = `${status.processed_files} / ${status.total_files}`;
            const pct = status.total_files > 0 ? (status.processed_files / status.total_files) * 100 : 0;
            progBar.style.width = `${pct}%`;
        } else {
            progContainer.style.display = 'none';
            scanBtn.disabled = false;
        }
    } catch(err) {}
}

// Settings Logic
const ignorePatternsText = document.getElementById('ignore-patterns');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsStatus = document.getElementById('settings-status');

async function fetchSettings() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        ignorePatternsText.value = data.ignore_patterns.join('\n');
    } catch(err) {
        console.error("Failed to load settings", err);
    }
}

saveSettingsBtn.addEventListener('click', async () => {
    try {
        const patterns = ignorePatternsText.value.split('\n').filter(p => p.trim());
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ignore_patterns: patterns })
        });
        
        settingsStatus.style.opacity = '1';
        setTimeout(() => settingsStatus.style.opacity = '0', 2000);
        
        // Refetch grid to clear retroactively deleted ones
        fetchBlurred();
        fetchDuplicates();
    } catch(err) {
        alert("Failed to save settings");
    }
});

// Initial fetch
fetchSettings();
fetchBlurred();
fetchDuplicates();
pollStatus();

setInterval(pollStatus, 3000);

