const SUPABASE_URL = 'https://jukfjoljkaoeicopjuwo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zvBTaDrffaATEPI7Wbu4OQ_w8ZR6chX'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMINS_PHONES = ["002290140804495", "002290140804494", "002290196479181", "002290167648919", "002290195618690"];
let currentUser = null, currentProfile = null, replyToId = null, viewHistory = ['page-login'];

// --- NAVIGATION (CORRIGÉE) ---
function showView(viewId, isBack = false) {
    // 1. Cacher toutes les pages
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    
    // 2. Afficher la cible
    const target = document.getElementById(viewId);
    if (target) {
        target.style.display = 'flex';
    }

    // 3. Gestion de l'historique du navigateur
    if (!isBack) {
        // On ajoute l'état dans l'historique du navigateur
        history.pushState({ viewId: viewId }, "", "");
    }

    // 4. Chargements spécifiques
    if (viewId === 'page-members') loadMembers();
    if (viewId === 'page-inbox') {
        loadInbox();
        updateInboxCount(); // Mettre à jour le compteur
    }
}

// --- SESSION (MISE À JOUR) ---
async function checkSession() {
    const { data } = await _supabase.auth.getSession();
    if (data && data.session) {
        currentUser = data.session.user;
        const { data: prof } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        if (prof) {
            currentProfile = prof;
            document.getElementById('welcomeText').innerText = `Salut ${prof.phone}`;
            
            // --- AJOUT ICI : ON VÉRIFIE SI C'EST UN ADMIN ---
            gererAffichageAdmin(prof.phone);
            // -----------------------------------------------

            // Mettre à jour le compteur de messages non lus
            updateInboxCount();

            history.replaceState({ viewId: 'page-chat' }, "", "");
            showView('page-chat', true);
            loadChat();
            listenRealtime();
        } else { 
            showView('page-login', true); 
        }
    } else { 
        showView('page-login', true); 
    }
}

// --- FONCTION DE FORMATTAGE DES NOMBRES ---
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// --- COMPTEUR DE MESSAGES NON LUS ---
async function updateInboxCount() {
    try {
        const { data, error } = await _supabase
            .from('inbox')
            .select('id')
            .eq('to_id', currentUser.id);
        
        if (error) {
            console.error('Erreur compteur inbox:', error);
            return;
        }
        
        const count = data ? data.length : 0;
        const countElement = document.getElementById('inboxCount');
        if (countElement) {
            countElement.innerText = formatNumber(count);
            // Cacher le compteur si zéro
            countElement.style.display = count > 0 ? 'inline' : 'none';
        }
    } catch (err) {
        console.error('Erreur updateInboxCount:', err);
    }
}

// --- ENVOI CHAT (AVEC CLOUDINARY) ---
async function handleFileSelect() {
    const file = document.getElementById('file-input').files[0];
    if (file) await handleSend();
}

// --- SYSTÈME ANTI-SPAM ---
async function bannirUtilisateur(userId, userPhone) {
    if (!confirm(`Bannir ${userPhone} ? Il ne pourra plus envoyer de messages dans le groupe.`)) return;

    try {
        const { error } = await _supabase
            .from('profiles')
            .update({ is_banned: true })
            .eq('id', userId);

        if (error) {
            alert('Erreur lors du bannissement: ' + error.message);
        } else {
            alert(`${userPhone} a été banni du groupe.`);
            loadMembers(); // Recharger la liste des membres
        }
    } catch (err) {
        console.error('Erreur bannissement:', err);
        alert('Erreur lors du bannissement');
    }
}

async function debannirUtilisateur(userId, userPhone) {
    if (!confirm(`Débannir ${userPhone} ?`)) return;

    try {
        const { error } = await _supabase
            .from('profiles')
            .update({ is_banned: false })
            .eq('id', userId);

        if (error) {
            alert('Erreur lors du débannissement: ' + error.message);
        } else {
            alert(`${userPhone} a été débanni.`);
            loadMembers(); // Recharger la liste des membres
        }
    } catch (err) {
        console.error('Erreur débannissement:', err);
        alert('Erreur lors du débannissement');
    }
}

async function bloquerUtilisateur(senderId, senderPhone) {
    if (!confirm(`Bloquer ${senderPhone} ? Vous ne recevrez plus ses messages privés.`)) return;

    try {
        // Vérifier si l'expéditeur est admin
        const { data: senderProfile } = await _supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', senderId)
            .single();

        if (senderProfile && senderProfile.is_admin) {
            alert('Impossible de bloquer un administrateur.');
            return;
        }

        // Ajouter à la table blocked_users
        const { error } = await _supabase
            .from('blocked_users')
            .insert([{
                blocker_id: currentUser.id,
                blocked_id: senderId
            }]);

        if (error) {
            if (error.code === '23505') { // Duplicate key
                alert('Cet utilisateur est déjà bloqué.');
            } else {
                alert('Erreur lors du blocage: ' + error.message);
            }
        } else {
            alert(`${senderPhone} a été bloqué.`);
            loadInbox(); // Recharger l'inbox
        }
    } catch (err) {
        console.error('Erreur blocage:', err);
        alert('Erreur lors du blocage');
    }
}

async function debloquerUtilisateur(blockedId, blockedPhone) {
    if (!confirm(`Débloquer ${blockedPhone} ?`)) return;

    try {
        const { error } = await _supabase
            .from('blocked_users')
            .delete()
            .eq('blocker_id', currentUser.id)
            .eq('blocked_id', blockedId);

        if (error) {
            alert('Erreur lors du déblocage: ' + error.message);
        } else {
            alert(`${blockedPhone} a été débloqué.`);
            loadInbox(); // Recharger l'inbox
        }
    } catch (err) {
        console.error('Erreur déblocage:', err);
        alert('Erreur lors du déblocage');
    }
}

// Vérifier si un utilisateur est bloqué par l'utilisateur actuel
async function estUtilisateurBloque(senderId) {
    const { data } = await _supabase
        .from('blocked_users')
        .select('*')
        .eq('blocker_id', currentUser.id)
        .eq('blocked_id', senderId)
        .single();
    
    return data !== null;
}

async function handleSend() {
    if(currentProfile && currentProfile.is_banned) return alert("Vous êtes banni du groupe !");
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
        time: new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})
    }]);

    input.value = ""; fileInput.value = ""; cancelReply();
}

// Cette fonction gère tes boutons "Retour" (la flèche ⬅ dans ton HTML)
function goBack() {
    window.history.back(); // Cela va déclencher l'événement 'popstate' juste en dessous
}

// Cet écouteur surveille le bouton "Retour" du téléphone et du navigateur
window.onpopstate = function(event) {
    if (event.state && event.state.viewId) {
        // Si on a un historique, on affiche la page précédente sans ajouter de nouvel état
        showView(event.state.viewId, true);
    } else {
        // Si on revient au tout début, on affiche le login ou le chat
        showView('page-login', true);
    }
};

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
        time: new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})
    }]);

    if(error) {
        alert("Erreur d'envoi : " + error.message);
    } else {
        alert("Message privé envoyé !");
        // NETTOYAGE
    document.getElementById('edit-msg').value = ""; // Vide le texte
    document.getElementById('inbox-photo-input').value = ""; // Vide l'image sélectionnée
    document.getElementById('inbox-video-input').value = ""; // Vide le fichier sélectionné
        goBack();
    }
}

// --- MESSAGES PRIVÉS (INBOX) - MISE À JOUR AFFICHAGE ---
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
        // Récupérer tous les utilisateurs bloqués en une seule requête
        const { data: blockedUsers } = await _supabase
            .from('blocked_users')
            .select('blocked_id')
            .eq('blocker_id', currentUser.id);
        
        const blockedIds = new Set(blockedUsers?.map(b => b.blocked_id) || []);
        
        // Filtrer les messages sans requêtes asynchrones
        const filteredData = data.filter(msg => !blockedIds.has(msg.from_id));

        // Trier les messages : admin en premier, puis les autres
        const sortedData = filteredData.sort((a, b) => {
            // Vérifier si l'expéditeur est admin (utiliser le nouveau système is_admin)
            const aIsAdmin = ADMINS_PHONES.includes(a.sender_phone);
            const bIsAdmin = ADMINS_PHONES.includes(b.sender_phone);
            
            // Les messages admin en premier
            if (aIsAdmin && !bIsAdmin) return -1;
            if (!aIsAdmin && bIsAdmin) return 1;
            return 0; // Garder l'ordre original si même statut
        });

        for (const msg of sortedData) {
            const div = document.createElement('div');
            div.style = "background:white; margin:10px; padding:10px; border-radius:8px; border-left:5px solid #25D366; box-shadow: 0 2px 4px rgba(0,0,0,0.1);";
            
            let messageAffiche = msg.content || "";

            // --- DÉTECTION INTELLIGENTE DES MÉDIAS ---
            
            // 1. Détection des Images (recherche l'extension n'importe où dans le lien)
            if (messageAffiche.match(/\.(jpeg|jpg|gif|png|webp)/i)) {
                messageAffiche = messageAffiche.replace(/(https?:\/\/[^\s]+)/g, '<img src="$1" style="max-width:100%; border-radius:8px; display:block; margin-top:5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">');
            } 
            // 2. Détection des Vidéos
            else if (messageAffiche.match(/\.(mp4|mov)/i)) {
                messageAffiche = messageAffiche.replace(/(https?:\/\/[^\s]+)/g, '<video controls style="max-width:100%; border-radius:8px; margin-top:5px;"><source src="$1" type="video/mp4"></video>');
            }
            // 3. Détection des autres fichiers joints (Cloudinary mais pas image/vidéo)
            else if (messageAffiche.includes("res.cloudinary.com")) {
                messageAffiche = messageAffiche.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="display:inline-block; background:#f0f0f0; padding:8px; border-radius:5px; text-decoration:none; color:#075E54; font-weight:bold; margin-top:5px;">📥 Télécharger le fichier joint</a>');
            }

            // Vérifier si on doit afficher la poubelle
            const senderIsAdmin = ADMINS_PHONES.includes(msg.sender_phone);
            const currentUserIsAdmin = currentProfile && currentProfile.is_admin;
            let deleteIcon = "";

            // Conditions pour afficher la poubelle :
            // - Si l'expéditeur n'est PAS admin OU
            // - Si l'utilisateur actuel est admin
            if (!senderIsAdmin || currentUserIsAdmin) {
                deleteIcon = `<span onclick="supprimerMessageInbox('${msg.id}', '${msg.image_url || ''}', '${msg.media_public_id || ''}', '${msg.sender_phone}')" style="cursor:pointer; color:red; margin-left:8px; font-size:12px;">🗑️</span>`;
            }

            // Bouton de blocage (uniquement pour les non-admins)
            let blockButton = "";
            if (!senderIsAdmin) {
                blockButton = `<span onclick="bloquerUtilisateur('${msg.from_id}', '${msg.sender_phone}')" style="cursor:pointer; color:orange; margin-left:8px; font-size:12px;">🚫</span>`;
            }

            // Style spécial pour les messages admin
            if (senderIsAdmin) {
                div.style.borderLeftColor = "#FFD700"; // Or pour les messages admin
                div.style.backgroundColor = "#FFF9E6"; // Fond clair pour les messages admin
            }

            div.innerHTML = `<b>De: ${msg.sender_phone || 'Inconnu'}${senderIsAdmin ? ' ⭐' : ''}${deleteIcon}${blockButton}</b>
                             <div style="margin:5px 0; word-wrap: break-word;">${messageAffiche}</div>
                             <small style="color:gray; font-size:10px;">${msg.time}</small>`;
            box.appendChild(div);
        }
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
        time: new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})
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
    list.innerHTML = '<div style="text-align:center; padding:20px;">⏳ Chargement des membres...</div>';
    
    const { data } = await _supabase.from('profiles').select('*');
    if (!data) {
        list.innerHTML = '<div style="text-align:center; padding:20px;">❌ Erreur de chargement</div>';
        return;
    }
    
    list.innerHTML = "";
    const currentUserIsAdmin = currentProfile && currentProfile.is_admin;
    
    // Mettre à jour le compteur total de membres
    const countElement = document.getElementById('total-members-count');
    if (countElement) {
        countElement.innerText = formatNumber(data.length);
    }
    
    // Trier : administrateurs en premier, puis les autres
    const sortedData = data.sort((a, b) => {
        const aIsAdmin = a.is_admin || ADMINS_PHONES.includes(a.phone);
        const bIsAdmin = b.is_admin || ADMINS_PHONES.includes(b.phone);
        
        if (aIsAdmin && !bIsAdmin) return -1;
        if (!aIsAdmin && bIsAdmin) return 1;
        return 0; // Garder l'ordre original si même statut
    });
    
    sortedData.forEach(m => {
        const div = document.createElement('div');
        div.className = 'member-row';
        div.style = "background:white; margin:10px; padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;";
        
        let statusInfo = "";
        let actionButtons = `<button onclick="openPrivate('${m.id}', '${m.phone}')" style="background:#25D366; color:white; border:none; padding:8px 12px; border-radius:8px;">✉️</button>`;
        
        // Informations de statut
        if (m.is_admin) {
            statusInfo = '<span style="color:gold;">⭐ Admin</span>';
        } else if (m.is_banned) {
            statusInfo = '<span style="color:red;">🚫 Banni</span>';
        }
        
        // Icône de blocage pour les admins (uniquement pour les non-admins)
        let blockIcon = "";
        if (currentUserIsAdmin && !m.is_admin && !m.is_banned) {
            blockIcon = `<span onclick="bloquerUtilisateur('${m.id}', '${m.phone}')" style="cursor:pointer; color:orange; margin-right:8px; font-size:16px;">🚫</span>`;
        }
        
        // Boutons d'action pour les admins
        if (currentUserIsAdmin && !m.is_admin) {
            if (m.is_banned) {
                actionButtons += ` <button onclick="debannirUtilisateur('${m.id}', '${m.phone}')" style="background:green; color:white; border:none; padding:8px 12px; border-radius:8px; margin-left:5px;">✅ Débannir</button>`;
            } else {
                actionButtons += ` <button onclick="bannirUtilisateur('${m.id}', '${m.phone}')" style="background:red; color:white; border:none; padding:8px 12px; border-radius:8px; margin-left:5px;">🚫 Bannir</button>`;
            }
        }
        
        div.innerHTML = `<div>${blockIcon}<b>${m.phone}</b><br><small>${m.email || ''}</small><br>${statusInfo}</div>
                         <div>${actionButtons}</div>`;
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

// --- FONCTIONS DE RECHERCHE ---
function filterChatMessages() {
    const searchTerm = document.getElementById('chat-search').value.toLowerCase();
    const messages = document.querySelectorAll('#chat-box .msg');
    
    messages.forEach(msg => {
        const text = msg.textContent.toLowerCase();
        msg.style.display = text.includes(searchTerm) ? 'flex' : 'none';
    });
}

function filterInbox() {
    const searchTerm = document.getElementById('inbox-search').value.toLowerCase();
    const messages = document.querySelectorAll('#inbox-list > div');
    
    messages.forEach(msg => {
        const text = msg.textContent.toLowerCase();
        msg.style.display = text.includes(searchTerm) ? 'block' : 'none';
    });
}

function filterMembers() {
    const searchTerm = document.getElementById('members-search').value.toLowerCase();
    const members = document.querySelectorAll('#members-list .member-row');
    
    members.forEach(member => {
        const text = member.textContent.toLowerCase();
        member.style.display = text.includes(searchTerm) ? 'flex' : 'none';
    });
}

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

    let contenuFinal = m.content || '';

    // Détection Vidéo dans le texte
    if (contenuFinal.includes('.mp4') || contenuFinal.includes('.mov')) {
        contenuFinal = contenuFinal.replace(/(https?:\/\/[^\s]+(?:\.mp4|\.mov)[^\s]*)/g, 
            `<video controls style="max-width:100%; border-radius:8px; margin-top:5px;">
                <source src="$1" type="video/mp4">
             </video>`);
    } 
    // Détection Image dans le texte (si pas déjà géré par m.image_url)
    else if (contenuFinal.match(/\.(jpeg|jpg|gif|png|webp)/i)) {
        contenuFinal = contenuFinal.replace(/(https?:\/\/[^\s]+(?:\.jpg|\.png|\.jpeg|\.webp)[^\s]*)/g, 
            `<img src="$1" style="max-width:100%; border-radius:8px; margin-top:5px;">`);
    }

    // Gestion de la colonne image_url (ton système actuel pour les photos simples)
    let mediaSupplementaire = "";
    if (m.image_url && !contenuFinal.includes(m.image_url)) {
         mediaSupplementaire = `<img src="${m.image_url}" class="chat-img" style="max-width:100%; border-radius:8px;">`;
    }

    // Icône de poubelle pour suppression (uniquement pour les admins)
    const currentUserIsAdmin = currentProfile && currentProfile.is_admin;
    const deleteIcon = currentUserIsAdmin ? `<span onclick="supprimerMessageGroupe('${m.id}', '${m.image_url || ''}', '${m.media_public_id || ''}')" style="cursor:pointer; color:red; margin-left:8px; font-size:12px;">🗑️</span>` : "";

    div.innerHTML = `<small><b>${m.sender_phone}</b>${deleteIcon}</small>
                     ${mediaSupplementaire}
                     <div>${contenuFinal}</div>
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

// Pour la diffusion
async function handleBroadcastMedia(type) {
    const inputId = type === 'image' ? 'bc-photo-input' : 'bc-video-input';
    const file = document.getElementById(inputId).files[0];
    if (!file) return;

    // --- ACTIVATION BARRE DE PROGRESSION ---
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    
    progressContainer.style.display = 'flex';
    progressBar.style.width = '0%';
    progressText.innerText = '0%';

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percent + '%';
            progressText.innerText = `Préparation diffusion : ${percent}%`;
        }
    });

    xhr.addEventListener("load", async () => {
        progressContainer.style.display = 'none';
        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            if (data.secure_url) {
                // On ajoute le lien au textarea sans popup !
                const broadcastInput = document.getElementById('broadcast-msg');
                broadcastInput.value = (broadcastInput.value ? broadcastInput.value + "\n" : "") + data.secure_url;
                
                // On vide l'input file pour le prochain envoi
                document.getElementById(inputId).value = "";
            }
        } else {
            alert("Erreur lors de l'upload.");
        }
    });

    // Séparation des comptes : images vers dtkssnhub, vidéos/fichiers vers dn3vf0mhm
    if (type === 'image') {
        formData.append('upload_preset', "chat_preset");
        xhr.open("POST", `https://api.cloudinary.com/v1_1/dtkssnhub/image/upload`);
    } else {
        formData.append('upload_preset', "video_preset");
        const resourceType = file.type.startsWith('video/') ? "video" : "raw";
        xhr.open("POST", `https://api.cloudinary.com/v1_1/dn3vf0mhm/${resourceType}/upload`);
    }
    xhr.send(formData);
}

// Pour l'inbox (Privé)
async function handleInboxMedia(type) {
    const inputId = type === 'image' ? 'inbox-photo-input' : 'inbox-video-input';
    const file = document.getElementById(inputId).files[0];
    if (!file) return;

    // Affiche la barre de progression que tu as déjà créée pour le groupe
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    
    progressContainer.style.display = 'flex';

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percent + '%';
            progressText.innerText = percent + '%';
        }
    });

    xhr.addEventListener("load", async () => {
        progressContainer.style.display = 'none';
        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            if (data.secure_url) {
                // Au lieu du alert, on ajoute directement l'URL dans le champ texte
                const input = document.getElementById('edit-msg');
                input.value = (input.value ? input.value + "\n" : "") + data.secure_url;
                // Optionnel : tu peux même déclencher executeSendPrivate() automatiquement ici
            }
        }
    });

    // Séparation des comptes : images vers dtkssnhub, vidéos/fichiers vers dn3vf0mhm
    if (type === 'image') {
        formData.append('upload_preset', "chat_preset");
        xhr.open("POST", `https://api.cloudinary.com/v1_1/dtkssnhub/image/upload`);
    } else {
        formData.append('upload_preset', "video_preset");
        const resourceType = file.type.startsWith('video/') ? "video" : "raw";
        xhr.open("POST", `https://api.cloudinary.com/v1_1/dn3vf0mhm/${resourceType}/upload`);
    }
    xhr.send(formData);
}

// --- FONCTION EDGE SUPABASE POUR SUPPRESSION CLOUDINARY ---
async function supprimerMediaCloudinary(imageUrl, mediaPublicId) {
    try {
        // Extraire le public_id de l'URL si mediaPublicId n'est pas fourni
        let publicId = mediaPublicId;
        if (!publicId && imageUrl) {
            // Extraire de l'URL Cloudinary
            const urlParts = imageUrl.split('/');
            const fileName = urlParts[urlParts.length - 1];
            publicId = fileName.split('.')[0]; // Enlever l'extension
        }

        if (!publicId) return; // Pas d'ID à supprimer

        // Déterminer le compte Cloudinary (photos ou videos)
        const account = imageUrl && imageUrl.includes('dn3vf0mhm') ? 'videos' : 'photos';
        const resourceType = imageUrl && (imageUrl.includes('/video/') || imageUrl.includes('.mp4') || imageUrl.includes('.mov')) ? 'video' : 'image';

        // Appeler la fonction Edge Supabase
        const { data, error } = await _supabase.functions.invoke('delete-cloudinary-media', {
            body: {
                public_id: publicId,
                resource_type: resourceType,
                account: account
            }
        });

        if (error) {
            console.error('Erreur suppression Cloudinary:', error);
        } else {
            console.log('Média supprimé avec succès:', data);
        }
    } catch (err) {
        console.error('Erreur lors de la suppression du média:', err);
    }
}

// --- FONCTIONS SUPPRESSION MESSAGES ---
async function supprimerMessageGroupe(messageId, imageUrl, mediaPublicId) {
    if (!confirm('Voulez-vous vraiment supprimer ce message ?')) return;

    try {
        // Supprimer le média sur Cloudinary d'abord
        if (imageUrl || mediaPublicId) {
            await supprimerMediaCloudinary(imageUrl, mediaPublicId);
        }

        // Supprimer le message de la base de données
        const { error } = await _supabase
            .from('messages')
            .delete()
            .eq('id', messageId);

        if (error) {
            alert('Erreur lors de la suppression du message: ' + error.message);
        } else {
            // Recharger le chat
            loadChat();
        }
    } catch (err) {
        console.error('Erreur suppression message:', err);
        alert('Erreur lors de la suppression du message');
    }
}

async function supprimerMessageInbox(messageId, imageUrl, mediaPublicId, senderPhone) {
    if (!confirm('Voulez-vous vraiment supprimer ce message ?')) return;

    try {
        // Supprimer le média sur Cloudinary d'abord
        if (imageUrl || mediaPublicId) {
            await supprimerMediaCloudinary(imageUrl, mediaPublicId);
        }

        // Supprimer le message de l'inbox
        const { error } = await _supabase
            .from('inbox')
            .delete()
            .eq('id', messageId);

        if (error) {
            alert('Erreur lors de la suppression du message: ' + error.message);
        } else {
            // Recharger l'inbox
            loadInbox();
        }
    } catch (err) {
        console.error('Erreur suppression message inbox:', err);
        alert('Erreur lors de la suppression du message');
    }
}

function gererAffichageAdmin(userPhone) {
    // Vérifier si l'utilisateur est admin via le champ is_admin
    const isAdmin = currentProfile && currentProfile.is_admin;
    
    if (isAdmin) {
        // On affiche les trombones pour l'admin
        const attachGroup = document.getElementById('admin-attach-btn');
        const attachBC = document.getElementById('admin-bc-attach');
        const attachInbox = document.getElementById('admin-inbox-attach');
        const menuBtn = document.getElementById('adminMenuBtn');

        if (attachGroup) attachGroup.style.display = 'inline-block';
        if (attachBC) attachBC.style.display = 'inline-block';
        if (attachInbox) attachInbox.style.display = 'inline-block';
        if (menuBtn) menuBtn.style.display = 'block'; // S'assure que le menu ⋮ est visible
    } else {
        // Cacher les boutons admin pour les non-admins
        const attachGroup = document.getElementById('admin-attach-btn');
        const attachBC = document.getElementById('admin-bc-attach');
        const attachInbox = document.getElementById('admin-inbox-attach');
        const broadcastBtn = document.querySelector('button[onclick="showView(\'page-broadcast\')"]');
        const exportBtn = document.querySelector('button[onclick="exporterContacts()"]');

        if (attachGroup) attachGroup.style.display = 'none';
        if (attachBC) attachBC.style.display = 'none';
        if (attachInbox) attachInbox.style.display = 'none';
        if (broadcastBtn) broadcastBtn.style.display = 'none';
        if (exportBtn) exportBtn.style.display = 'none';
    }
}

async function handleAdminFileSelect() {
    const fileInput = document.getElementById('video-file-input');
    const file = fileInput.files[0];
    if (!file) return;

    // --- AFFICHER LA BARRE DE PROGRESSION ---
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    
    progressContainer.style.display = 'flex';
    progressBar.style.width = '0%';
    progressText.innerText = '0%';

    // --- MODIFICATION DE L'UPLOAD POUR GÉRER LA PROGRESSION ---
    // Nous devons utiliser XMLHttpRequest au lieu de fetch pour avoir la progression
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', "video_preset"); // Ton preset unsigned

    // On surveille le progrès
    xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percentComplete + '%';
            progressText.innerText = percentComplete + '%';
        }
    });

    // Une fois l'envoi terminé vers Cloudinary
    xhr.addEventListener("load", async () => {
        progressContainer.style.display = 'none'; // Cacher la barre
        fileInput.value = ""; // Vider l'input

        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            if (data.secure_url) {
                // On met l'URL dans le champ de saisie
                const input = document.getElementById('msgInput');
                input.value = (input.value ? input.value + "\n" : "") + data.secure_url;
                
                // On envoie direct dans le chat
                await handleSend(); 
                alert("Fichier lourd diffusé avec succès !");
            }
        } else {
            alert("Erreur lors de l'envoi à Cloudinary.");
            console.error(xhr.responseText);
        }
    });

    xhr.addEventListener("error", () => {
        progressContainer.style.display = 'none';
        alert("Erreur réseau lors de l'envoi.");
    });

    // On lance l'envoi vers ton compte dn3vf0mhm (vidéos/fichiers)
    const resourceType = file.type.startsWith('video/') ? "video" : "raw";
    xhr.open("POST", `https://api.cloudinary.com/v1_1/dn3vf0mhm/${resourceType}/upload`);
    xhr.send(formData);
}

// 3. LE DÉCLENCHEUR AUTOMATIQUE (À mettre tout en bas du fichier)
// C'est cette ligne qui empêche le retour forcé au login lors d'un rafraîchissement !
window.onload = checkSession;
