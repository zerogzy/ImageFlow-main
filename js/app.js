// ImageFlow - Main JavaScript

const API = {
    base: '',
    
    async get(url) {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${this.getKey()}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },
    
    async post(url, data) {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.getKey()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },
    
    async upload(url, files, onProgress) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            for (const file of files) formData.append('images[]', file);
            
            const xhr = new XMLHttpRequest();
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));
            };
            xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(xhr.responseText));
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.open('POST', url);
            xhr.setRequestHeader('Authorization', `Bearer ${this.getKey()}`);
            xhr.send(formData);
        });
    },
    
    getKey() { return localStorage.getItem('if_key') || ''; },
    setKey(key, role) { localStorage.setItem('if_key', key); localStorage.setItem('if_role', role); },
    getRole() { return localStorage.getItem('if_role'); },
    removeKey() { localStorage.removeItem('if_key'); localStorage.removeItem('if_role'); },
    isAdmin() { return this.getRole() === 'admin'; },
};

// Toast
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-indigo-500' };
    const toast = document.createElement('div');
    toast.className = `${colors[type]} text-white px-4 py-3 rounded-xl shadow-lg text-sm animate-slide-in-right`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Theme
function initTheme() {
    const saved = localStorage.getItem('theme');
    const dark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    
    document.getElementById('theme-toggle').onclick = () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    };
}

// Auth
function initAuth() {
    const role = API.getRole();
    updateAuthUI(role);
    
    document.getElementById('auth-btn').onclick = () => {
        document.getElementById('auth-modal').classList.remove('hidden');
    };
    
    document.getElementById('logout-btn').onclick = () => {
        API.removeKey();
        updateAuthUI(null);
        location.reload();
    };
    
    document.getElementById('auth-form').onsubmit = async (e) => {
        e.preventDefault();
        const key = document.getElementById('auth-key-input').value.trim();
        if (!key) return;
        
        const btn = document.getElementById('auth-submit');
        btn.disabled = true;
        btn.textContent = '验证中...';
        
        try {
            const res = await fetch('/api/validate-api-key', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${key}` }
            });
            const data = await res.json();
            
            if (data.valid) {
                API.setKey(key, data.role);
                document.getElementById('auth-modal').classList.add('hidden');
                document.getElementById('auth-key-input').value = '';
                showToast(data.role === 'admin' ? '管理员验证成功' : '访客验证成功', 'success');
                updateAuthUI(data.role);
                window.location.reload();
            } else {
                document.getElementById('auth-error').textContent = '密钥无效';
                document.getElementById('auth-error').classList.remove('hidden');
            }
        } catch {
            document.getElementById('auth-error').textContent = '验证失败';
            document.getElementById('auth-error').classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = '验证';
        }
    };
}

function updateAuthUI(role) {
    const badge = document.getElementById('role-badge');
    const logoutBtn = document.getElementById('logout-btn');
    const uploadNav = document.getElementById('nav-upload');
    const manageNav = document.getElementById('nav-manage');
    const tagFilter = document.getElementById('filter-tag');
    
    if (role) {
        badge.classList.remove('hidden');
        badge.textContent = role === 'admin' ? '管理员' : '访客';
        badge.className = `px-2 py-0.5 text-xs font-medium rounded-md ${role === 'admin' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`;
        logoutBtn.classList.remove('hidden');
        
        if (role === 'admin') {
            uploadNav.classList.remove('hidden');
            manageNav.classList.remove('hidden');
            tagFilter.classList.remove('hidden');
        }
    } else {
        badge.classList.add('hidden');
        logoutBtn.classList.add('hidden');
    }
}

// Gallery
let currentPage = 1, totalPages = 1;
let currentFilter = { format: 'webp', orientation: 'all', tag: '' };

async function fetchImages(page = 1) {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('empty').classList.add('hidden');
    document.getElementById('gallery').classList.add('hidden');
    document.getElementById('pagination').classList.add('hidden');
    
    try {
        const params = new URLSearchParams({ page, limit: '12', format: currentFilter.format });
        if (currentFilter.orientation !== 'all') params.set('orientation', currentFilter.orientation);
        if (currentFilter.tag) params.set('tag', currentFilter.tag);
        
        const data = await API.get(`/api/images?${params}`);
        renderGallery(data.images || []);
        currentPage = data.page;
        totalPages = data.totalPages;
        renderPagination();
    } catch (e) {
        showToast('加载图片失败', 'error');
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

function renderGallery(images) {
    const loading = document.getElementById('loading');
    const empty = document.getElementById('empty');
    const gallery = document.getElementById('gallery');
    
    if (images.length === 0) {
        empty.classList.remove('hidden');
        gallery.classList.add('hidden');
        return;
    }
    
    gallery.classList.remove('hidden');
    
    const isMasonry = currentFilter.orientation === 'all';
    gallery.innerHTML = isMasonry
        ? `<div class="my-masonry-grid">${images.map(img => `<div class="my-masonry-grid_column">${imageCardHTML(img)}</div>`).join('')}</div>`
        : `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">${images.map(img => imageCardHTML(img)).join('')}</div>`;
    
    gallery.querySelectorAll('.image-card').forEach(card => {
        card.onclick = () => openModal(card.dataset.id);
    });
    
    gallery.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm('确定删除此图片？')) {
                try {
                    await API.post('/api/delete-image', { id: btn.dataset.id });
                    showToast('已删除', 'success');
                    fetchImages(currentPage);
                } catch { showToast('删除失败', 'error'); }
            }
        };
    });
}

function imageCardHTML(img) {
    const isAdmin = API.isAdmin();
    const url = img.urls?.webp || img.urls?.original;
    return `
        <div class="image-card relative group cursor-pointer rounded-xl overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow" data-id="${img.id}">
            <img src="${url}" alt="${img.filename}" loading="lazy" class="w-full ${img.orientation === 'portrait' ? 'aspect-[3/4]' : 'aspect-[4/3]'} object-cover">
            <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span class="px-2 py-0.5 text-xs font-medium rounded-md bg-black/50 text-white">${img.format.toUpperCase()}</span>
                ${isAdmin ? `<button class="delete-btn p-1 rounded-md bg-red-500 text-white hover:bg-red-600" data-id="${img.id}"><svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>` : ''}
            </div>
        </div>
    `;
}

function renderPagination() {
    const el = document.getElementById('pagination');
    if (totalPages <= 1) return;
    el.classList.remove('hidden');
    
    let html = `<button onclick="goPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''} class="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">上一页</button>`;
    
    const pages = Array.from({length: totalPages}, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1);
    pages.forEach((p, i) => {
        if (i > 0 && pages[i-1] !== p - 1) html += `<span class="px-1 text-gray-400">...</span>`;
        html += `<button onclick="goPage(${p})" class="w-9 h-9 text-sm font-medium rounded-xl ${p === currentPage ? 'bg-indigo-500 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}">${p}</button>`;
    });
    
    html += `<button onclick="goPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''} class="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">下一页</button>`;
    el.innerHTML = html;
}

function goPage(p) { if (p >= 1 && p <= totalPages) { currentPage = p; fetchImages(p); } }

// Modal
async function openModal(id) {
    try {
        const data = await API.get(`/api/images?page=1&limit=100&format=${currentFilter.format}`);
        const img = data.images.find(i => i.id === id);
        if (!img) return;
        
        document.getElementById('modal-image').src = img.urls?.webp || img.urls?.original;
        document.getElementById('modal-filename').textContent = img.original_filename || img.filename;
        
        document.getElementById('modal-info').innerHTML = `
            <div class="text-gray-500 dark:text-gray-400">格式</div><div class="text-gray-900 dark:text-white">${img.format}</div>
            <div class="text-gray-500 dark:text-gray-400">方向</div><div class="text-gray-900 dark:text-white">${img.orientation}</div>
            <div class="text-gray-500 dark:text-gray-400">尺寸</div><div class="text-gray-900 dark:text-white">${img.width} x ${img.height}</div>
            <div class="text-gray-500 dark:text-gray-400">大小</div><div class="text-gray-900 dark:text-white">${formatSize(img.size)}</div>
        `;
        
        document.getElementById('modal-urls').innerHTML = `
            <div class="flex items-center gap-2"><span class="text-sm text-gray-500 dark:text-gray-400 w-16">WebP</span><input value="${img.urls?.webp || ''}" readonly class="flex-1 text-sm px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"><button onclick="copyText(this.previousElementSibling.value)" class="px-2 py-1 text-xs rounded bg-indigo-500 text-white">复制</button></div>
            ${img.urls?.avif ? `<div class="flex items-center gap-2"><span class="text-sm text-gray-500 dark:text-gray-400 w-16">AVIF</span><input value="${img.urls.avif}" readonly class="flex-1 text-sm px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"><button onclick="copyText(this.previousElementSibling.value)" class="px-2 py-1 text-xs rounded bg-indigo-500 text-white">复制</button></div>` : ''}
        `;
        
        document.getElementById('modal-actions').innerHTML = API.isAdmin() ? `<button onclick="deleteImage('${id}')" class="px-4 py-2 text-sm rounded-xl bg-red-500 text-white hover:bg-red-600">删除</button>` : '';
        
        document.getElementById('image-modal').classList.remove('hidden');
    } catch {}
}

function deleteImage(id) {
    if (!confirm('确定删除？')) return;
    API.post('/api/delete-image', { id }).then(() => {
        showToast('已删除', 'success');
        document.getElementById('image-modal').classList.add('hidden');
        fetchImages(currentPage);
    }).catch(() => showToast('删除失败', 'error'));
}

function copyText(text) { navigator.clipboard.writeText(text).then(() => showToast('已复制', 'success')); }
function formatSize(bytes) { if (!bytes) return '-'; const units = ['B','KB','MB','GB']; let i = 0; let s = bytes; while (s >= 1024 && i < units.length - 1) { s /= 1024; i++; } return `${s.toFixed(1)} ${units[i]}`; }

// Filters
document.getElementById('filter-format').onchange = (e) => { currentFilter.format = e.target.value; fetchImages(1); };
document.getElementById('filter-orientation').onchange = (e) => { currentFilter.orientation = e.target.value; fetchImages(1); };
document.getElementById('filter-tag').onchange = (e) => { currentFilter.tag = e.target.value; fetchImages(1); };

document.getElementById('modal-close').onclick = () => document.getElementById('image-modal').classList.add('hidden');
document.getElementById('image-modal').onclick = (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); };

// Load tags
async function loadTags() {
    if (!API.isAdmin()) return;
    try {
        const data = await API.get('/api/tags');
        const select = document.getElementById('filter-tag');
        select.innerHTML = '<option value="">标签</option>' + (data.tags || []).map(t => `<option value="${t}">${t}</option>`).join('');
    } catch {}
}

// Init
initTheme();
initAuth();
if (API.getRole()) {
    fetchImages(1);
    loadTags();
} else {
    document.getElementById('auth-modal').classList.remove('hidden');
}
