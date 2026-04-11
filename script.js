const SUPABASE_URL = 'https://jukfjoljkaoeicopjuwo.supabase.co';
const SUPABASE_KEY = 'votre_cle_ici'; // Remets TA clé ici
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

checkSession();
