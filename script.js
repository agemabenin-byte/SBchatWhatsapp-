const SUPABASE_URL = 'https://jukfjoljkaoeicopjuwo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zvBTaDrffaATEPI7Wbu4OQ_w8ZR6chX'; // Remets TA clé ici
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMINS_PHONES = ["002290140804495", "002290140804494", "002290196479181", "002290167648919", "002290195618690"];
let currentUser = null, currentProfile = null, replyToId = null, viewHistory = ['page-login'];

// --- NAVIGATION & RETOUR ANDROID (Point 5) ---
function showView(viewId) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.getElementById(viewId).style.display = 'flex';
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

// Intercepter bouton retour téléphone
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
    if (data.session) {
        currentUser = data.session.user;
        const { data: prof } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        currentProfile = prof;
        document.getElementById('welcomeText').innerText = `Salut ${prof.phone}`; // Point 7
        showView('page-chat');
        loadChat();
        listenRealtime();
    } else {
        showView('page-login');
    }
}

// --- RETOUR À LA LIGNE (Point 6) ---
document.getElementById('msgInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

// --- ENVOI PHOTO AVEC LÉGENDE (Point 10) ---
async function handleFileSelect() {
    const file = document.getElementById('file-input').files[0];
    if(file && confirm("Envoyer cette image avec votre texte ?")) {
        handleSend(); 
    }
}

async function handleSend() {
    if(currentProfile.is_banned) return alert("Banni !");
    const input = document.getElementById('msgInput');
    const content = input.value;
    const file = document.getElementById('file-input').files[0];
    let url = null;

    if(file) {
        const name = `${Date.now()}.jpg`;
        const blob = await compressImg(file); // Utilise ta fonction compressImg existante
        await _supabase.storage.from('chat-media').upload(name, blob);
        url = _supabase.storage.from('chat-media').getPublicUrl(name).data.publicUrl;
    }

    if(!content && !url) return;

    await _supabase.from('messages').insert([{
        sender_id: currentUser.id, sender_phone: currentProfile.phone,
        content, image_url: url, reply_to_id: replyToId,
        time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
    }]);

    input.value = ""; input.style.height = 'auto';
    document.getElementById('file-input').value = "";
    cancelReply();
}

// --- RÉPONDRE (GLISSER/CLIC) (Point 11) ---
function setReply(id, phone) {
    replyToId = id;
    document.getElementById('reply-preview').style.display = 'flex';
    document.getElementById('reply-user').innerText = phone;
    document.getElementById('reply-text').innerText = "Répondre à ce message...";
    document.getElementById('msgInput').focus();
}

function cancelReply() {
    replyToId = null;
    document.getElementById('reply-preview').style.display = 'none';
}

// --- EXPORT EXCEL (Point 4) ---
async function exporterContacts() {
    const {data} = await _supabase.from('profiles').select('phone, email');
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Membres");
    XLSX.writeFile(wb, "Membres_SuccesBonheur.xlsx");
}

// --- GESTION MENU ---
function toggleMenu() {
    const d = document.getElementById('adminDropdown');
    d.style.display = (d.style.display === "block") ? "none" : "block";
}
// --- CHARGEMENT DU CHAT ---
async function loadChat() {
    const { data, error } = await _supabase.from('messages').select('*').order('id', {ascending: true});
    if (error) console.log(error);
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
        ${m.image_url ? `<img src="${m.image_url}" class="chat-img">` : ''}
        <p style="margin:5px 0;">${m.content || ''}</p>
        <small style="font-size:10px; color:gray; display:block; text-align:right;">${m.time}</small>
    `;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// --- ÉCOUTE DES NOUVEAUX MESSAGES ---
function listenRealtime() {
    _supabase.channel('public:messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        renderMsg(payload.new);
    }).subscribe();
}

// --- COMPRESSION PHOTO (INDISPENSABLE) ---
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

// Fonction pour basculer entre Connexion et Inscription
function toggleAuthMode(isRegister) {
    document.getElementById('login-fields').style.display = isRegister ? 'none' : 'block';
    document.getElementById('register-fields').style.display = isRegister ? 'block' : 'none';
    document.getElementById('auth-title').innerText = isRegister ? 'S\'inscrire' : 'Connexion';
}

// Action de CONNEXION pure
async function handleLoginAction() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    if(!email || !password) return alert("Veuillez remplir les champs !");

    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) return alert("Erreur : " + error.message);
    
    checkSession();
}

// Action d'INSCRIPTION pure
async function handleRegisterAction() {
    const phone = document.getElementById('auth-phone').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    if(!phone || !email || !password) return alert("Remplissez tout pour l'inscription !");

    const { data, error } = await _supabase.auth.signUp({ 
        email, 
        password, 
        options: { data: { phone: phone } } 
    });

    if (error) return alert(error.message);

    // Création du profil dans ta table 'profiles'
    if(data.user) {
        await _supabase.from('profiles').insert([{ id: data.user.id, phone: phone }]);
        alert("Inscription réussie ! Un mail de confirmation vous a été envoyé. Validez-le puis connectez-vous.");
        toggleAuthMode(false); // On renvoie l'utilisateur vers la page de connexion
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    location.reload();
}

// --- CHARGER LA LISTE DES MEMBRES ---
async function loadMembers() {
    const list = document.getElementById('members-list');
    if (!list) return; // Sécurité pour éviter les bugs
    
    list.innerHTML = "<p style='text-align:center;'>Chargement des membres...</p>";

    // Récupération des données depuis Supabase
    const { data, error } = await _supabase.from('profiles').select('*');

    if (error) {
        list.innerHTML = "<p style='color:red; text-align:center;'>Erreur de chargement.</p>";
        console.error(error);
        return;
    }

    list.innerHTML = ""; // On vide le message de chargement

    data.forEach(member => {
        const div = document.createElement('div');
        div.className = 'member-row';
        div.style = "background:white; margin:10px; padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);";
        
        // Correction ici : On utilise des ` au lieu de ' pour éviter le bug de "d'email"
        div.innerHTML = `
            <div>
                <b style="color:#075E54;">${member.phone}</b><br>
                <small style="color:gray;">${member.email || "Pas d'email"}</small>
            </div>
            <button onclick="openPrivate('${member.id}', '${member.phone}')" style="background:#25D366; color:white; border:none; padding:8px 12px; border-radius:8px; cursor:pointer;">✉️</button>
        `;
        list.appendChild(div);
    });
}

// --- FONCTIONS POUR LE PRIVÉ ---
function openPrivate(destId, destPhone) {
    document.getElementById('dest-display').innerText = destPhone;
    window.currentDestId = destId; 
    showView('page-editor');
}

async function executeSendPrivate() {
    const content = document.getElementById('edit-msg').value;
    if(!content) return;

    // Ici tu peux ajouter la logique d'envoi à une table "private_messages" si tu l'as créée
    alert("Message privé envoyé à " + document.getElementById('dest-display').innerText);
    document.getElementById('edit-msg').value = "";
    goBack();
}
    
}
function togglePass(fieldId, icon) {
    const field = document.getElementById(fieldId);
    if (field.type === "password") {
        field.type = "text";
        icon.innerText = "🔒"; // Change l'icône quand c'est visible
    } else {
        field.type = "password";
        icon.innerText = "👁️";
    }
}

checkSession();
