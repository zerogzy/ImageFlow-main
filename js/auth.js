// ImageFlow - Auth utilities
const API = {
    getKey() { return localStorage.getItem('if_key') || ''; },
    setKey(key, role) { localStorage.setItem('if_key', key); localStorage.setItem('if_role', role); },
    getRole() { return localStorage.getItem('if_role'); },
    removeKey() { localStorage.removeItem('if_key'); localStorage.removeItem('if_role'); },
    isAdmin() { return this.getRole() === 'admin'; },
    async upload(url, files, onProgress) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            for (const file of files) formData.append('images[]', file);
            const xhr = new XMLHttpRequest();
            xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
            xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error('Upload failed'));
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.open('POST', url);
            xhr.setRequestHeader('Authorization', `Bearer ${this.getKey()}`);
            xhr.send(formData);
        });
    }
};

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-indigo-500' };
    const toast = document.createElement('div');
    toast.className = `${colors[type]} text-white px-4 py-3 rounded-xl shadow-lg text-sm`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function initTheme() {
    const saved = localStorage.getItem('theme');
    const dark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.onclick = () => { document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); };
}

function checkAuth(requiredRole, onAuth) {
    const role = API.getRole();
    if (!role || (requiredRole === 'admin' && role !== 'admin')) {
        document.getElementById('auth-modal').classList.remove('hidden');
        document.getElementById('auth-form').onsubmit = async (e) => {
            e.preventDefault();
            const key = document.getElementById('auth-key-input').value.trim();
            if (!key) return;
            const btn = document.getElementById('auth-submit');
            btn.disabled = true; btn.textContent = '验证中...';
            try {
                const res = await fetch('/api/validate-api-key', { method: 'POST', headers: { 'Authorization': `Bearer ${key}` } });
                const data = await res.json();
                if (data.valid && data.role === 'admin') {
                    API.setKey(key, 'admin');
                    document.getElementById('auth-modal').classList.add('hidden');
                    showToast('管理员验证成功', 'success');
                    if (onAuth) onAuth();
                } else {
                    document.getElementById('auth-error').textContent = '密钥无效或权限不足';
                    document.getElementById('auth-error').classList.remove('hidden');
                }
            } catch { document.getElementById('auth-error').textContent = '验证失败'; document.getElementById('auth-error').classList.remove('hidden'); }
            finally { btn.disabled = false; btn.textContent = '验证'; }
        };
    } else {
        if (onAuth) onAuth();
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = () => { API.removeKey(); location.reload(); };
    const authBtn = document.getElementById('auth-btn');
    if (authBtn) authBtn.onclick = () => document.getElementById('auth-modal').classList.remove('hidden');
}
