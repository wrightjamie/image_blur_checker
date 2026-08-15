let currentThreshold = 100;
let blurPage = 1;
let dupPage = 1;
let ignoredPage = 1;
let ignoredType = 'blur';
let selectionMode = false;
let selectedImages = new Set();
const LIMIT = 50;
const DUP_LIMIT = 10;

const blurThresholdInput = document.getElementById('blur-threshold');
const thresholdVal = document.getElementById('threshold-val');
const blurredGrid = document.getElementById('blurred-grid');
const duplicatesContainer = document.getElementById('duplicates-container');
const ignoredGrid = document.getElementById('ignored-grid');
const blurCount = document.getElementById('blur-count');
const dupCount = document.getElementById('dup-count');
const ignoredCount = document.getElementById('ignored-count');
const ignoredBlurBtn = document.getElementById('ignored-type-blur');
const ignoredDupBtn = document.getElementById('ignored-type-dup');

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

// Modal Elements
const previewModal = document.getElementById('preview-modal');
const previewImg = document.getElementById('preview-img');
const previewPath = document.getElementById('preview-path');
const modalIgnoreBtn = document.getElementById('modal-ignore-btn');
const modalDeleteBtn = document.getElementById('modal-delete-btn');

// Pagination Buttons
const blurPrev = document.getElementById('blur-prev');
const blurNext = document.getElementById('blur-next');
const blurInfo = document.getElementById('blur-page-info');

const dupPrev = document.getElementById('dup-prev');
const dupNext = document.getElementById('dup-next');
const dupInfo = document.getElementById('dup-page-info');

const ignoredPrev = document.getElementById('ignored-prev');
const ignoredNext = document.getElementById('ignored-next');
const ignoredInfo = document.getElementById('ignored-page-info');

const toggleSelectionBtn = document.getElementById('toggle-selection-btn');
const selectionActions = document.getElementById('selection-actions');
const selectAllBtn = document.getElementById('select-all-btn');
const cancelSelectionBtn = document.getElementById('cancel-selection-btn');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const selectionCount = document.getElementById('selection-count');

if (ignoredBlurBtn && ignoredDupBtn) {
    ignoredBlurBtn.addEventListener('click', () => {
        ignoredType = 'blur';
        ignoredBlurBtn.className = 'btn primary';
        ignoredDupBtn.className = 'btn secondary';
        ignoredPage = 1;
        fetchIgnored();
    });
    ignoredDupBtn.addEventListener('click', () => {
        ignoredType = 'duplicate';
        ignoredDupBtn.className = 'btn primary';
        ignoredBlurBtn.className = 'btn secondary';
        ignoredPage = 1;
        fetchIgnored();
    });
}

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

const checkFilesBtn = document.getElementById('check-files-btn');
if (checkFilesBtn) {
    checkFilesBtn.addEventListener('click', async () => {
        try {
            checkFilesBtn.disabled = true;
            checkFilesBtn.textContent = 'Checking...';
            const res = await fetch('/api/check-files', { method: 'POST' });
            const data = await res.json();
            alert(`Database check complete. Removed ${data.removed_count} missing files.`);
            fetchBlurred();
            fetchDuplicates();
        } catch(err) {
            console.error(err);
            alert('Failed to check files');
        } finally {
            checkFilesBtn.disabled = false;
            checkFilesBtn.textContent = 'Check Files';
        }
    });
}

// Pagination listeners
blurPrev.addEventListener('click', () => { if (blurPage > 1) { blurPage--; fetchBlurred(); } });
blurNext.addEventListener('click', () => { blurPage++; fetchBlurred(); });

dupPrev.addEventListener('click', () => { if (dupPage > 1) { dupPage--; fetchDuplicates(); } });
dupNext.addEventListener('click', () => { dupPage++; fetchDuplicates(); });

if (ignoredPrev) {
    ignoredPrev.addEventListener('click', () => { if (ignoredPage > 1) { ignoredPage--; fetchIgnored(); } });
    ignoredNext.addEventListener('click', () => { ignoredPage++; fetchIgnored(); });
}

if (toggleSelectionBtn) {
    toggleSelectionBtn.addEventListener('click', () => {
        selectionMode = true;
        toggleSelectionBtn.style.display = 'none';
        selectionActions.style.display = 'flex';
        selectedImages.clear();
        updateSelectionUI();
    });
    cancelSelectionBtn.addEventListener('click', () => {
        selectionMode = false;
        toggleSelectionBtn.style.display = 'block';
        selectionActions.style.display = 'none';
        selectedImages.clear();
        document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
    });
    selectAllBtn.addEventListener('click', () => {
        document.querySelectorAll('.card-img-container').forEach(el => {
            const path = el.dataset.path;
            if (path && !selectedImages.has(path)) {
                selectedImages.add(path);
                el.closest('.card').classList.add('selected');
            }
        });
        updateSelectionUI();
    });
    deleteSelectedBtn.addEventListener('click', () => {
        if (window.deleteSelectedImages) window.deleteSelectedImages();
    });
}

function updateSelectionUI() {
    selectionCount.textContent = `${selectedImages.size} selected`;
    deleteSelectedBtn.disabled = selectedImages.size === 0;
}

async function fetchBlurred() {
    if (blurredGrid) blurredGrid.innerHTML = '<div class="loader">Loading images...</div>';
    try {
        const res = await fetch(`/api/images/blurred?page=${blurPage}&limit=${LIMIT}&threshold=${currentThreshold}`);
        const data = await res.json();
        
        blurCount.textContent = data.total;
        blurInfo.textContent = `Page ${data.page} of ${data.total_pages || 1}`;
        blurPrev.disabled = data.page <= 1;
        blurNext.disabled = data.page >= data.total_pages;
        
        blurredGrid.innerHTML = '';
        data.images.forEach(img => {
            blurredGrid.appendChild(createCard(img, 'blurred'));
        });
    } catch (err) {
        console.error(err);
    }
}

async function fetchDuplicates() {
    if (duplicatesContainer) duplicatesContainer.innerHTML = '<div class="loader">Loading duplicates...</div>';
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
            
            group.forEach(img => grid.appendChild(createCard(img, 'duplicates')));
            groupEl.appendChild(grid);
            duplicatesContainer.appendChild(groupEl);
        });
    } catch (err) {
        console.error(err);
    }
}

async function fetchIgnored() {
    if (ignoredGrid) ignoredGrid.innerHTML = '<div class="loader">Loading ignored images...</div>';
    try {
        const res = await fetch(`/api/images/ignored?page=${ignoredPage}&limit=${LIMIT}&type=${ignoredType}`);
        const data = await res.json();
        
        ignoredCount.textContent = data.total;
        if (ignoredInfo) ignoredInfo.textContent = `Page ${data.page} of ${data.total_pages || 1}`;
        if (ignoredPrev) ignoredPrev.disabled = data.page <= 1;
        if (ignoredNext) ignoredNext.disabled = data.page >= data.total_pages;
        
        if (ignoredGrid) {
            ignoredGrid.innerHTML = '';
            data.images.forEach(img => {
                ignoredGrid.appendChild(createCard(img, 'ignored'));
            });
        }
    } catch (err) {
        console.error(err);
    }
}

function createCard(img, context = 'blurred') {
    const isIgnored = context === 'ignored';
    const ignoreType = isIgnored ? ignoredType : (context === 'blurred' ? 'blur' : 'duplicate');

    const actionsHtml = isIgnored ?
        `<button class="btn secondary" onclick="unignoreImage('${img.path.replace(/'/g, "\\'")}', '${ignoreType}')">Unignore</button>
         <button class="btn danger" onclick="deleteImage('${img.path.replace(/'/g, "\\'")}', this)">Delete</button>` :
        `<button class="btn secondary" onclick="ignoreImage('${img.path.replace(/'/g, "\\'")}', '${ignoreType}')">Ignore</button>
         <button class="btn danger" onclick="deleteImage('${img.path.replace(/'/g, "\\'")}', this)">Delete</button>`;

    const div = document.createElement('div');
    div.className = 'card';
    if (selectionMode && selectedImages.has(img.path)) {
        div.classList.add('selected');
    }
    div.innerHTML = `
        <div class="card-img-container" style="cursor: pointer;" data-path="${img.path.replace(/"/g, '&quot;')}" data-encoded="${encodeURIComponent(img.path)}" onclick="handleImageClick(this, this.dataset.path, this.dataset.encoded, ${isIgnored}, '${ignoreType}')">
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
                ${actionsHtml}
            </div>
        </div>
    `;
    return div;
}

window.handleImageClick = function(element, path, encodedPath, isIgnored, ignoreType) {
    if (selectionMode) {
        const card = element.closest('.card');
        if (selectedImages.has(path)) {
            selectedImages.delete(path);
            card.classList.remove('selected');
        } else {
            selectedImages.add(path);
            card.classList.add('selected');
        }
        updateSelectionUI();
    } else {
        openPreview(path, encodedPath, isIgnored, ignoreType);
    }
}

window.openPreview = function(path, encodedPath, isIgnored, ignoreType) {
    previewImg.src = `/api/serve-image/${encodedPath}`;
    previewPath.textContent = path;
    
    modalIgnoreBtn.textContent = isIgnored ? 'Unignore' : 'Ignore';
    modalIgnoreBtn.onclick = () => { 
        if (isIgnored) unignoreImage(path, ignoreType);
        else ignoreImage(path, ignoreType); 
        previewModal.close(); 
    };
    modalDeleteBtn.onclick = () => { deleteImage(path); previewModal.close(); };
    
    previewModal.showModal();
}

previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
        previewModal.close();
    }
});

window.deleteImage = async function(path, buttonElement = null) {
    if (!confirm('Are you sure you want to permanently delete this image from your filesystem?')) return;
    
    let card = null;
    if (buttonElement) {
        card = buttonElement.closest('.card');
    } else {
        const el = document.querySelector(`.card-img-container[data-path="${path.replace(/"/g, '\\"')}"]`);
        if (el) card = el.closest('.card');
    }
    
    if (card) card.style.display = 'none';

    try {
        await fetch(`/api/images/${encodeURIComponent(path)}`, { method: 'DELETE' });
        fetchBlurred();
        fetchDuplicates();
        fetchIgnored();
    } catch(err) { 
        alert('Failed to delete image'); 
        if (card) card.style.display = ''; 
    }
}

window.deleteSelectedImages = async function() {
    if (selectedImages.size === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selectedImages.size} images?`)) return;

    const paths = Array.from(selectedImages);
    const cardsToHide = [];
    
    paths.forEach(path => {
        const el = document.querySelector(`.card-img-container[data-path="${path.replace(/"/g, '\\"')}"]`);
        if (el) {
            const card = el.closest('.card');
            if (card) {
                card.style.display = 'none';
                cardsToHide.push(card);
            }
        }
    });

    cancelSelectionBtn.click(); // Exit selection mode

    try {
        await fetch('/api/images/delete-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths: paths })
        });
        fetchBlurred();
        fetchDuplicates();
        fetchIgnored();
    } catch (err) {
        alert('Failed to delete some or all images');
        cardsToHide.forEach(c => c.style.display = '');
    }
}

window.ignoreImage = async function(path, type = 'blur') {
    try {
        await fetch(`/api/images/${encodeURIComponent(path)}/ignore?type=${type}`, { method: 'POST' });
        fetchBlurred();
        fetchDuplicates();
        fetchIgnored();
    } catch(err) { alert('Failed to ignore image'); }
}

window.unignoreImage = async function(path, type = 'blur') {
    try {
        await fetch(`/api/images/${encodeURIComponent(path)}/unignore?type=${type}`, { method: 'POST' });
        fetchBlurred();
        fetchDuplicates();
        fetchIgnored();
    } catch(err) { alert('Failed to unignore image'); }
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

async function fetchVersion() {
    try {
        const res = await fetch('/api/version');
        const data = await res.json();
        const badge = document.getElementById('app-version-badge');
        if (badge) badge.textContent = data.version;
        
        console.log(`=== Image Analyzer ${data.version} ===`);
        console.log("Latest Changes:");
        data.changelog.forEach(change => console.log(` - ${change}`));
        console.log("===============================");
    } catch(err) {}
}

// Initial fetch
fetchVersion();
fetchSettings();
fetchBlurred();
fetchDuplicates();
fetchIgnored();
pollStatus();

setInterval(pollStatus, 3000);

