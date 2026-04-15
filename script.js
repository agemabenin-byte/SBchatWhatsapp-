const SUPABASE_URL = 'https://jukfjoljkaoeicopjuwo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zvBTaDrffaATEPI7Wbu4OQ_w8ZR6chX'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMINS_PHONES = ["002290140804495", "002290140804494", "002290196479181", "002290167648919", "002290195618690"];
let currentUser = null, currentProfile = null, replyToId = null, viewHistory = ['page-login'];

// --- NAVIGATION ---
function showView(viewId) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    const targetPage = document.getElementById(viewId);
    if (targetPage) targetPage.style.display = 'flex';
    if(viewId !== viewHistory[viewHistory.length - 1]) viewHistory.push(viewId);
    if(viewId === 'page-members') loadMembers();
}

function goBack() {
    if(viewHistory.length > 1) {
        viewHistory.pop();
        showView(viewHistory[viewHistory.length - 1]);
    }
}

// --- SESSION & AUTH ---
async function checkSession() {
    const { data } = await _supabase.auth.getSession();
    if (data && data.session) {
        currentUser = data.session.user;
        const { data: prof } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        if (prof) {
            currentProfile = prof;
            document.getElementById('welcomeText').innerText = `Salut ${prof.phone}`;
            showView('page-chat');
            loadChat();
            listenRealtime();
        } else { showView('page-login'); }
    } else { showView('page-login'); }
}

// --- GESTION DES MESSAGES ET CLOUDINARY ---
async function handleFileSelect() {
    const file = document.getElementById('file-input').files[0];
    if (file) await handleSend(); // Envoi automatique immédiat
}

async function handleSend() {
    if(currentProfile && currentProfile.is_banned) return alert("Banni !");
    
    const input = document.getElementById('msgInput');
    const fileInput = document.getElementById('file-input');
    const content = input.value.trim();
    const file = fileInput.files[0];
    let url = null;

    if(!content && !file) return;

    // --- UPLOAD VERS CLOUDINARY ---
    if(file) {
        try {
            const cloudName = "dtkssnhub"; 
            const uploadPreset = "chat_preset"; 

            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', uploadPreset);

            const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if(data.secure_url) {
                // Optimisation auto f_auto,q_auto pour économiser la data au Bénin
                url = data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
            }
        } catch (err) {
            console.error("Erreur Cloudinary:", err);
            return alert("Erreur d'envoi de l'image.");
        }
    }

    // --- ENREGISTREMENT DANS SUPABASE ---
    await _supabase.from('messages').insert([{
        sender_id: currentUser.id, 
        sender_phone: currentProfile.phone,
        content: content, 
        image_url: url, 
        reply_to_id: replyToId,
        time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
    }]);

    input.value = ""; 
    fileInput.value = ""; 
    input.style.height = 'auto';
    cancelReply();
}

// --- LOGIQUE CHAT ---
async function loadChat() {
    const { data } = await _supabase.from('messages').select('*').order('id', {ascending: true});
    const box = document.getElementById('chat-box');
    box.innerHTML = "";
    if(data) data.forEach(m => renderMsg(m));
    box.scrollTop = box.scrollHeight;
}

function renderMsg(m) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `msg ${m.sender_id === currentUser.id ? 'me' : 'other'}`;
    div.innerHTML = `
        <small style="font-weight:bold; color:#075E54;">${m.sender_phone}</small>
        ${m.image_url ? `<img src="${m.image_url}" class="chat-img" style="max-width:100%; border-radius:8px; margin-top:5px;">` : ''}
        <p style="margin:5px 0;">${m.content || ''}</p>
        <small style="font-size:10px; color:gray; display:block; text-align:right;">${m.time}</small>
    `;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function listenRealtime() {
    _supabase.channel('public:messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        renderMsg(payload.new);
    }).subscribe();
}

// --- AUTRES FONCTIONS ---
function cancelReply() { replyToId = null; document.getElementById('reply-preview').style.display = 'none'; }
async function handleLogout() { await _supabase.auth.signOut(); location.reload(); }

// --- INITIALISATION FINALE ---
window.onload = checkSession;

document.getElementById('msgInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});
