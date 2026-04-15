const SUPABASE_URL = 'https://jukfjoljkaoeicopjuwo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zvBTaDrffaATEPI7Wbu4OQ_w8ZR6chX'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMINS_PHONES = ["002290140804495", "002290140804494", "002290196479181", "002290167648919", "002290195618690"];
let currentUser = null, currentProfile = null, replyToId = null, viewHistory = ['page-login'];

// --- NAVIGATION (CORRIGÉE) ---
function showView(viewId) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    const target = document.getElementById(viewId);
    if(target) target.style.display = 'flex';

    // AJOUTE CETTE LIGNE : Elle enregistre la page dans l'historique
    if(viewId !== viewHistory[viewHistory.length - 1]) {
        viewHistory.push(viewId);
    }
    
    if(viewId === 'page-members') loadMembers();
    if(viewId === 'page-inbox') loadInbox();
}

// --- SESSION ---
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

// --- ENVOI CHAT (AVEC CLOUDINARY) ---
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
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', "chat_preset");
            const response = await fetch(`https://api.cloudinary.com/v1_1/dtkssnhub/image/upload`, {
                method: 'POST', body: formData
            });
            const data = await response.json();
            if(data.secure_url) url = data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
        } catch (err) { console.error(err); return alert("Erreur image."); }
    }

    await _supabase.from('messages').insert([{
        sender_id: currentUser.id, 
        sender_phone: currentProfile.phone,
        content: content, 
        image_url: url, 
        reply_to_id: replyToId,
        time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
    }]);

    input.value = ""; fileInput.value = ""; cancelReply();
}

function goBack() {
    if(viewHistory.length > 1) {
        viewHistory.pop();
        const prev = viewHistory[viewHistory.length - 1];
        document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
        document.getElementById(prev).style.display = 'flex';
    }
}

// --- EXCEL (RÉPARÉ) ---
async function exporterContacts() {
    try {
        const { data, error } = await _supabase.from('profiles').select('phone, email');
        if (error) throw error;
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Membres");
        XLSX.writeFile(wb, "Membres_SuccesBonheur.xlsx");
    } catch (err) {
        alert("Erreur Excel : " + err.message);
    }
}

// --- MESSAGES PRIVÉS (INBOX) - RÉPARÉ ---
function openPrivate(destId, destPhone) {
    document.getElementById('dest-display').innerText = destPhone;
    window.currentDestId = destId; 
    showView('page-editor');
}

async function executeSendPrivate() {
    const content = document.getElementById('edit-msg').value;
    if(!content || !window.currentDestId) return alert("Message vide !");

    // On inclut maintenant le sender_phone puisque la colonne existe
    const { error } = await _supabase.from('inbox').insert([{
        from_id: currentUser.id,
        to_id: window.currentDestId,
        content: content,
        sender_phone: currentProfile.phone, // Ton numéro stocké dans currentProfile
        time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
    }]);

    if(error) {
        alert("Erreur d'envoi : " + error.message);
    } else {
        alert("Message privé envoyé !");
        document.getElementById('edit-msg').value = "";
        goBack();
    }
}

async function loadInbox() {
    const box = document.getElementById('inbox-list');
    if(!box) return;
    box.innerHTML = "Chargement...";

    const { data, error } = await _supabase
        .from('inbox')
        .select('*')
        .eq('to_id', currentUser.id)
        .order('id', {ascending: false});
    
    if(error) return box.innerHTML = "Erreur de chargement.";
    box.innerHTML = "";

    if(data && data.length > 0) {
        data.forEach(msg => {
            const div = document.createElement('div');
            div.style = "background:white; margin:10px; padding:10px; border-radius:8px; border-left:5px solid #25D366; box-shadow: 0 2px 4px rgba(0,0,0,0.1);";
            // On utilise directement msg.sender_phone qui est maintenant stocké
            div.innerHTML = `<b>De: ${msg.sender_phone || 'Inconnu'}</b><p style="margin:5px 0;">${msg.content}</p><small>${msg.time}</small>`;
            box.appendChild(div);
        });
    } else { 
        box.innerHTML = "<p style='text-align:center;'>Aucun message reçu.</p>"; 
    }
}

// --- DIFFUSION (BROADCAST) - RÉPARÉ ---
async function executeBroadcast() {
    const content = document.getElementById('broadcast-msg').value;
    if(!content) return alert("Entrez un message !");

    const { data: allMembers, error: errMem } = await _supabase.from('profiles').select('id');
    if(errMem) return alert("Erreur membres: " + errMem.message);
    
    // Préparation de l'envoi groupé avec ton numéro
    const messages = allMembers.map(member => ({
        from_id: currentUser.id,
        to_id: member.id,
        content: content,
        sender_phone: currentProfile.phone, // On identifie l'admin par son numéro
        time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
    }));

    const { error } = await _supabase.from('inbox').insert(messages);

    if(error) {
        alert("Erreur diffusion : " + error.message);
    } else {
        alert("Message diffusé avec succès !");
        document.getElementById('broadcast-msg').value = "";
        goBack();
    }
}


// --- LISTE DES MEMBRES ---
async function loadMembers() {
    const list = document.getElementById('members-list');
    list.innerHTML = "Chargement...";
    const { data } = await _supabase.from('profiles').select('*');
    list.innerHTML = "";
    data.forEach(m => {
        const div = document.createElement('div');
        div.className = 'member-row';
        div.style = "background:white; margin:10px; padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;";
        div.innerHTML = `<div><b>${m.phone}</b><br><small>${m.email || ''}</small></div>
                         <button onclick="openPrivate('${m.id}', '${m.phone}')" style="background:#25D366; color:white; border:none; padding:8px 12px; border-radius:8px;">✉️</button>`;
        list.appendChild(div);
    });
}

// Action de CONNEXION pure
async function handleLoginAction() {
    let input = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    if(!input || !password) return alert("Veuillez remplir tous les champs !");

    let loginEmail = input;

    // Si c'est un numéro, on récupère le mail pour Supabase
    if (!input.includes("@")) {
        const { data } = await _supabase
            .from('profiles')
            .select('email')
            .eq('phone', input)
            .single();
        
        if (!data) return alert("Numéro inconnu.");
        loginEmail = data.email;
    }

    const { error } = await _supabase.auth.signInWithPassword({ 
        email: loginEmail, 
        password: password 
    });

    if (error) return alert("Connexion échouée : " + error.message);
    
    checkSession();
}



async function handleRegisterAction() {
    const phone = document.getElementById('auth-phone').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const { data, error } = await _supabase.auth.signUp({ email, password, options: { data: { phone: phone } } });
    if (error) return alert(error.message);
    if(data.user) {
        await _supabase.from('profiles').insert([{ id: data.user.id, phone: phone, email: email }]);
        alert("Vérifiez vos emails !");
        toggleAuthMode(false); 
    }
}

function toggleAuthMode(isRegister) {
    document.getElementById('login-fields').style.display = isRegister ? 'none' : 'block';
    document.getElementById('register-fields').style.display = isRegister ? 'block' : 'none';
    document.getElementById('auth-title').innerText = isRegister ? 'S\'inscrire' : 'Connexion';
}

function toggleMenu() {
    const d = document.getElementById('adminDropdown');
    d.style.display = (d.style.display === "block") ? "none" : "block";
}
function autoResize(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
function togglePass(id, icon) {
    const f = document.getElementById(id); f.type = (f.type === "password") ? "text" : "password";
    icon.innerText = (f.type === "password") ? "👁️" : "🔒";
}
function cancelReply() { replyToId = null; document.getElementById('reply-preview').style.display = 'none'; }
async function handleLogout() { await _supabase.auth.signOut(); location.reload(); }

// --- CHAT RENDER ---
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
    div.innerHTML = `<small><b>${m.sender_phone}</b></small>
                     ${m.image_url ? `<img src="${m.image_url}" class="chat-img" style="max-width:100%; border-radius:8px;">` : ''}
                     <p>${m.content || ''}</p>
                     <small style="font-size:10px; display:block; text-align:right;">${m.time}</small>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function listenRealtime() {
    _supabase.channel('public:messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => renderMsg(p.new)).subscribe();
}

async function handleForgotPassword() {
    let input = document.getElementById('auth-email').value.trim();
    if (!input) return alert("Veuillez saisir votre numéro ou votre email.");

    let emailToSend = input;
    if (!input.includes("@")) {
        const { data } = await _supabase.from('profiles').select('email').eq('phone', input).single();
        if (!data) return alert("Numéro inconnu.");
        emailToSend = data.email;
    }

    // ON DÉFINIT ICI L'URL DE REDIRECTION VERS TON NOUVEAU FICHIER
    const { error } = await _supabase.auth.resetPasswordForEmail(emailToSend, {
        redirectTo: 'https://sbchatmessage.netlify.app/reset.html', 
    });

    if (error) alert("Erreur : " + error.message);
    else alert("Lien envoyé ! Vérifiez votre boîte mail.");
}

// 3. LE DÉCLENCHEUR AUTOMATIQUE (À mettre tout en bas du fichier)
// C'est cette ligne qui empêche le retour forcé au login lors d'un rafraîchissement !
window.onload = checkSession;
