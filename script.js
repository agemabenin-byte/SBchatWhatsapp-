const SUPABASE_URL = 'https://jukfjoljkaoeicopjuwo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zvBTaDrffaATEPI7Wbu4OQ_w8ZR6chX';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMINS_PHONES = ["002290140804495", "002290140804494", "002290196479181", "002290167648919", "002290195618690"];
let currentUser = null;
let currentProfile = null;
let replyToId = null;

// --- INITIALISATION ---
async function checkSession() {
    const { data } = await _supabase.auth.getSession();
    if (data.session) {
        currentUser = data.session.user;
        const { data: prof } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        currentProfile = prof;
        showView('page-chat');
        loadChat();
        listenRealtime();
        updateInboxBadge();
    } else {
        showView('page-login');
    }
}

// --- NAVIGATION (SANS POPUP) ---
function showView(viewId) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.getElementById(viewId).style.display = 'flex';
    if(viewId === 'page-members') loadMembers();
    if(viewId === 'page-inbox') loadInbox();
}

// --- AUTHENTIFICATION (Point 1) ---
async function handleAuth() {
    const phone = document.getElementById('auth-phone').value;
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    if(!phone || !email || !password) return alert("Remplissez tous les champs.");

    // Tentative de connexion
    let { data, error } = await _supabase.auth.signInWithPassword({ email, password });

    if (error) {
        // Si échec, on crée le compte
        const { data: upData, error: upError } = await _supabase.auth.signUp({
            email, password, options: { data: { phone: phone } }
        });
        if (upError) return alert(upError.message);
        
        // Créer le profil dans notre table 'profiles'
        await _supabase.from('profiles').insert([{ id: upData.user.id, phone: phone, email: email }]);
        alert("Compte créé ! Recliquez sur connexion.");
    } else {
        location.reload();
    }
}

// --- COMPRESSION PHOTO (Point 3) ---
async function compressImg(file) {
    return new Promise(res => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = e => {
            const img = new Image(); img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const max = 800; let w = img.width, h = img.height;
                if(w > max){ h *= max/w; w = max; }
                canvas.width = w; canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => res(blob), 'image/jpeg', 0.7);
            }
        }
    });
}

// --- ENVOI MESSAGE (Point 3, 9) ---
async function handleSend() {
    if(currentProfile.is_banned) return alert("Vous n'avez plus le droit d'écrire.");
    const content = document.getElementById('msgInput').value;
    const file = document.getElementById('file-input').files[0];
    let url = null;

    if(file) {
        const blob = await compressImg(file);
        const name = `${Date.now()}.jpg`;
        await _supabase.storage.from('chat-media').upload(name, blob);
        url = _supabase.storage.from('chat-media').getPublicUrl(name).data.publicUrl;
    }

    if(!content && !url) return;

    await _supabase.from('messages').insert([{
        sender_id: currentUser.id, sender_phone: currentProfile.phone,
        content, image_url: url, reply_to_id: replyToId,
        time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
    }]);

    document.getElementById('msgInput').value = "";
    document.getElementById('file-input').value = "";
    cancelReply();
}

// --- AFFICHAGE CHAT (Point 11, 9) ---
function loadChat() {
    _supabase.from('messages').select('*').order('id', {ascending: true}).then(({data}) => {
        const box = document.getElementById('chat-box');
        box.innerHTML = "";
        if(data) data.forEach(m => renderMsg(m));
        box.scrollTop = box.scrollHeight;
    });
}

function renderMsg(m) {
    const isAdmin = ADMINS_PHONES.includes(currentProfile.phone);
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `msg ${m.sender_id === currentUser.id ? 'me' : 'other'}`;
    
    div.innerHTML = `
        <div class="msg-header" onclick="setReply(${m.id}, '${m.sender_phone}')">
            <b>${m.sender_phone}</b>
            ${isAdmin ? `<span class="del-btn" onclick="deleteMsg(${m.id})">🗑️</span>` : ''}
        </div>
        ${m.reply_to_id ? `<div class="reply-tag">Réponse au message #${m.reply_to_id}</div>` : ''}
        ${m.image_url ? `<img src="${m.image_url}" class="chat-img">` : ''}
        <p>${m.content || ''}</p>
        <small>${m.time}</small>
    `;
    box.appendChild(div);
}

// --- MODÉRATION (Point 10, 11) ---
async function deleteMsg(id) {
    if(confirm("Supprimer ce message ?")) {
        await _supabase.from('messages').delete().eq('id', id);
        location.reload();
    }
}

async function toggleBan(id, status) {
    await _supabase.from('profiles').update({ is_banned: !status }).eq('id', id);
    loadMembers();
}

// --- LISTE MEMBRES & INBOX (Point 5, 7, 8) ---
async function loadMembers() {
    const {data} = await _supabase.from('profiles').select('*');
    const list = document.getElementById('members-list');
    list.innerHTML = "";
    data.forEach(m => {
        const div = document.createElement('div');
        div.className = "member-row";
        div.innerHTML = `
            <span>${m.phone} ${m.is_banned ? '🚫' : ''}</span>
            <div>
                <button onclick="openEditor('${m.id}', '${m.phone}')">✉️</button>
                ${ADMINS_PHONES.includes(currentProfile.phone) ? `<button onclick="toggleBan('${m.id}', ${m.is_banned})">🚫</button>` : ''}
            </div>
        `;
        list.appendChild(div);
    });
}

// --- GESTION DU TEMPS RÉEL ---
function listenRealtime() {
    _supabase.channel('room1').on('postgres_changes', {event:'INSERT', schema:'public', table:'messages'}, payload => {
        renderMsg(payload.new);
        const box = document.getElementById('chat-box');
        box.scrollTop = box.scrollHeight;
    }).subscribe();
}

checkSession();
