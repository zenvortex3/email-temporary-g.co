const API_URL = 'https://api.mail.tm';
let account = null;
let refreshTimer = null;
let countdown = 5;

document.addEventListener('DOMContentLoaded', () => {
    loadOrCreateAccount();
});

async function loadOrCreateAccount() {
    setLoadingState(true);
    const savedData = localStorage.getItem('tempmail_session');
    
    if (savedData) {
        try {
            account = JSON.parse(savedData);
            const res = await fetch(`${API_URL}/me`, {
                headers: { 'Authorization': `Bearer ${account.token}` }
            });
            
            if (res.ok) {
                setupUI();
                return; 
            }
        } catch (e) {
            console.log('Sesi kedaluwarsa, membuat baru...');
        }
    }
    await generateNewAccount();
}

async function generateNewAccount() {
    setLoadingState(true);
    stopAutoRefresh();
    
    try {
        const domainRes = await fetch(`${API_URL}/domains`);
        const domainData = await domainRes.json();
        const domain = domainData['hydra:member'][0].domain;

        const username = Math.random().toString(36).substring(2, 12);
        const password = Math.random().toString(36).substring(2, 15) + '!A1';
        const address = `${username}@${domain}`;

        await fetch(`${API_URL}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });

        const tokenRes = await fetch(`${API_URL}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });
        
        const tokenData = await tokenRes.json();
        
        account = { address, password, token: tokenData.token };
        localStorage.setItem('tempmail_session', JSON.stringify(account));
        setupUI();
        
    } catch (error) {
        console.error('Gagal membuat akun:', error);
        document.getElementById('email-address').value = 'Gagal membuat email. Coba lagi.';
    }
}

function setupUI() {
    document.getElementById('email-address').value = account.address;
    document.getElementById('system-status').style.display = 'inline-flex';
    setLoadingState(false);
    
    document.getElementById('inbox-list').innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">📭</div>
            <p>Kotak masuk Anda kosong. Menunggu email masuk...</p>
        </div>`;
        
    fetchMessages();
    startAutoRefresh();
}

function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    countdown = 5;
    
    refreshTimer = setInterval(() => {
        countdown--;
        document.getElementById('countdown-text').innerText = `Otomatis refresh dalam ${countdown}d`;
        
        if (countdown <= 0) {
            fetchMessages();
            countdown = 5; 
        }
    }, 1000);
}

function stopAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    document.getElementById('countdown-text').innerText = 'Menjeda refresh...';
}

async function fetchMessages(isManual = false) {
    if (!account || !account.token) return;

    const indicator = document.getElementById('refresh-indicator');
    indicator.style.display = 'inline-block';

    try {
        const res = await fetch(`${API_URL}/messages`, {
            headers: { 'Authorization': `Bearer ${account.token}` }
        });
        const data = await res.json();
        renderInbox(data['hydra:member'] || []);
    } catch (error) {
        console.error('Error fetching messages:', error);
    } finally {
        setTimeout(() => indicator.style.display = 'none', 500);
        if (isManual) {
            countdown = 5; 
            document.getElementById('countdown-text').innerText = `Otomatis refresh dalam 5d`;
        }
    }
}

function renderInbox(messages) {
    const container = document.getElementById('inbox-list');
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>Kotak masuk Anda kosong. Menunggu email masuk...</p>
            </div>`;
        return;
    }

    container.innerHTML = '';
    messages.forEach(msg => {
        const time = new Date(msg.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        
        const item = document.createElement('div');
        item.className = 'message-item';
        item.onclick = () => readMessage(msg.id);
        item.innerHTML = `
            <div class="msg-sender">${msg.from.address}</div>
            <div class="msg-subject">${msg.subject || '(Tidak ada subjek)'}</div>
            <div class="msg-time">${time}</div>
        `;
        container.appendChild(item);
    });
}

async function readMessage(id) {
    stopAutoRefresh(); 
    
    const modal = document.getElementById('email-modal');
    const iframe = document.getElementById('email-content');
    
    document.getElementById('modal-subject').innerText = "Memuat pesan...";
    document.getElementById('modal-sender').innerText = "";
    modal.classList.add('show');

    try {
        const res = await fetch(`${API_URL}/messages/${id}`, {
            headers: { 'Authorization': `Bearer ${account.token}` }
        });
        const msg = await res.json();

        document.getElementById('modal-subject').innerText = msg.subject || '(Tidak ada subjek)';
        document.getElementById('modal-sender').innerText = msg.from.address;
        iframe.srcdoc = msg.text || "(Pesan kosong)";
    } catch (error) {
        console.error('Gagal memuat pesan:', error);
        iframe.srcdoc = "(Gagal memuat pesan)";
    }
}

function closeModal() {
    const modal = document.getElementById('email-modal');
    modal.classList.remove('show');
    startAutoRefresh();
}

function copyEmail() {
    const input = document.getElementById('email-address');
    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(input.value).then(() => {
        showToast("✅ Alamat email disalin!");
    });
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

function showConfirmModal() {
    document.getElementById('confirm-modal').classList.add('show');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.remove('show');
}

async function executeDeleteAccount() {
    if (!account || !account.token) return;
    closeConfirmModal();
    stopAutoRefresh();
    setLoadingState(true);

    try {
        await fetch(`${API_URL}/accounts/${account.address}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${account.token}` }
        });
    } catch (error) {
        console.error('Gagal menghapus akun:', error);
    } finally {
        localStorage.removeItem('tempmail_session');
        account = null;
        document.getElementById('email-address').value = 'Menginisialisasi email...';
        document.getElementById('system-status').style.display = 'none';
        setLoadingState(false);
        generateNewAccount();
    }
}

function setLoadingState(isLoading) {
    const emailInput = document.getElementById('email-address');
    if (isLoading) {
        emailInput.value = 'Memuat...';
    }
}