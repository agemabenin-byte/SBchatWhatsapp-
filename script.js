const SUPABASE_URL = 'https://jukfjoljkaoeicopjuwo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zvBTaDrffaATEPI7Wbu4OQ_w8ZR6chX'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMINS_PHONES = ["002290140804495", "002290140804494", "002290196479181", "002290167648919", "002290195618690"];
let currentUser = null, currentProfile = null, replyToId = null, viewHistory = ['page-login'];

// --- NAVIGATION & RETOUR ANDROID ---
function showView(viewId) {
    const target = document.getElementById(viewId);
    if (!target) return;
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    target.style.display = 'flex';
    if(viewId !== viewHistory[viewHistory.length - 1]) viewHistory.push(viewId);
    
    if(viewId === 'page-members') loadMembers();
    if(viewId === 'page-inbox') loadInbox();
}

function goBack() {
    if(viewHistory.length > 1) {
        viewHistory.pop();
        const prev = viewHistory[viewHistory.length - 1];
        document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
        document.getElementById(prev).style.display = 'flex';
    }
}

window.addEventListener('popstate', (e) => {
    if(viewHistory.length > 1) {
        e.preventDefault();
        goBack();
        history.pushState(null, null, window.location.pathname);
    }
});
history.pushState(null, null, window.location.pathname);

// --- INITIALISATION ---
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

// --- GESTION MESSAGES (AVEC CLOUDINARY) ---
async function handleFileSelect() {
    const file = document.getElementById('file-input').files[0];
    if (file) await handleSend();
}

async function handleSend() {
    if(currentProfile && currentProfile.is_banned) return alert("Banni !");
    
    const input = document.getElementById('msgInput');
    const fileInput = document.getElementById('file-input');
    const content = input.value.trim();
    const file = fileInput.files[0];
    let url = null;

    if(!content && !file) return;

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
                url = data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
            }
        } catch (err) {
            console.error("Erreur Cloudinary:", err);
            return alert("Erreur d'envoi de l'image.");
        }
    }

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
    const box = document.getElementById('chat-box');
    box.scrollTop = box.scrollHeight;
}

// --- AUTHENTIFICATION ---
function toggleAuthMode(isRegister) {
    document.getElementById('login-fields').style.display = isRegister ? 'none' : 'block';
    document.getElementById('register-fields').style.display = isRegister ? 'block' : 'none';
    document.getElementById('auth-title').innerText = isRegister ? 'S\'inscrire' : 'Connexion';
}

async function handleLoginAction() {
    let input = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if(!input || !password) return alert("Remplissez tout !");

    let loginEmail = input;
    if (!input.includes("@")) {
        const { data } = await _supabase.from('profiles').select('email').eq('phone', input).single();
        if (!data) return alert("Numéro inconnu.");
        loginEmail = data.email;
    }

    const { error } = await _supabase.auth.signInWithPassword({ email: loginEmail, password: password });
    if (error) return alert("Erreur : " + error.message);
    checkSession();
}

async function handleRegisterAction() {
    const phone = document.getElementById('auth-phone').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    if(!phone || !email || !password) return alert("Tout remplir !");

    const { data, error } = await _supabase.auth.signUp({ email, password, options: { data: { phone: phone } } });
    if (error) return alert(error.message);

    if(data.user) {
        await _supabase.from('profiles').insert([{ id: data.user.id, phone: phone, email: email }]);
        alert("Inscription réussie ! Validez votre email.");
        toggleAuthMode(false); 
    }
}

// --- FONCTIONS SECONDAIRES (MENU, EXPORT, ETC) ---
function toggleMenu() {
    const d = document.getElementById('adminDropdown');
    d.style.display = (d.style.display === "block") ? "none" : "block";
}

async function exporterContacts() {
    const {data} = await _supabase.from('profiles').select('phone, email');
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Membres");
    XLSX.writeFile(wb, "Membres_SuccesBonheur.xlsx");
}

function togglePass(fieldId, icon) {
    const field = document.getElementById(fieldId);
    field.type = (field.type === "password") ? "text" : "password";
    icon.innerText = (field.type === "password") ? "👁️" : "🔒";
}

async function handleLogout() {
    await _supabase.auth.signOut();
    location.reload();
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
        ${m.image_url ? `<img src="${m.image_url}" class="chat-img" style="max-width:100%; border-radius:8px;">` : ''}
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

function cancelReply() { replyToId = null; document.getElementById('reply-preview').style.display = 'none'; }

// --- INITIALISATION FINALE ---
window.onload = checkSession;

document.getElementById('msgInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});
