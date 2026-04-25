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

// --- MESSAGES PRIVÉS (INBOX) - OPTIMISÉ ---
async function loadInbox() {
    const box = document.getElementById('inbox-list');
    if(!box) return;
    box.innerHTML = "<div style='text-align:center; padding:20px;'>⏳ Chargement des messages...</div>";

    try {
        // Optimisation : requête unique avec jointure pour éviter le N+1 problem
        const { data, error } = await _supabase
            .from('inbox')
            .select(`
                id, 
                from_id, 
                to_id, 
                content, 
                sender_phone, 
                time,
                image_url,
                media_public_id,
                profiles!inbox_from_id_fkey (
                    is_admin
                )
            `)
            .eq('to_id', currentUser.id)
            .order('id', {ascending: false})
            .limit(100); // Limiter à 100 messages pour éviter la surcharge
        
        if(error) throw error;
        
        box.innerHTML = "";

        if(!data || data.length === 0) { 
            box.innerHTML = "<p style='text-align:center;'>Aucun message reçu.</p>"; 
            return;
        }

        // Récupérer tous les utilisateurs bloqués en une seule requête
        const { data: blockedUsers } = await _supabase
            .from('blocked_users')
            .select('blocked_id')
            .eq('blocker_id', currentUser.id);
        
        const blockedIds = new Set(blockedUsers?.map(b => b.blocked_id) || []);
        
        // Filtrer les messages sans boucles asynchrones
        const filteredData = data.filter(msg => !blockedIds.has(msg.from_id));

        // Trier les messages : admin en premier, puis les autres
        const sortedData = filteredData.sort((a, b) => {
            // Utiliser la jointure profiles pour vérifier si admin
            const aIsAdmin = a.profiles?.is_admin || ADMINS_PHONES.includes(a.sender_phone);
            const bIsAdmin = b.profiles?.is_admin || ADMINS_PHONES.includes(b.sender_phone);
            
            if (aIsAdmin && !bIsAdmin) return -1;
            if (!aIsAdmin && bIsAdmin) return 1;
            return 0;
        });

        // Optimisation : utiliser DocumentFragment
        const fragment = document.createDocumentFragment();

        for (const msg of sortedData) {
            const div = document.createElement('div');
            div.style = "background:white; margin:10px; padding:10px; border-radius:8px; border-left:5px solid #25D366; box-shadow: 0 2px 4px rgba(0,0,0,0.1);";
            
            // Utiliser la nouvelle fonction de traitement du texte
            let messageAffiche = processMessageContent(msg.content || "");

            // --- DÉTECTION INTÉLLIGENTE DES MÉDIAS ---
            
            // 1. Détection des Images Cloudinary
            if (msg.image_url && msg.image_url.includes("cloudinary")) {
                messageAffiche += `<img src="${msg.image_url}" style="max-width:100%; border-radius:8px; display:block; margin-top:5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">`;
            }
            // 2. Détection des URLs d'images dans le texte
            else if (messageAffiche.match(/\.(jpeg|jpg|gif|png|webp)/i)) {
                messageAffiche = messageAffiche.replace(/(https?:\/\/[^\s]+)/g, '<img src="$1" style="max-width:100%; border-radius:8px; display:block; margin-top:5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">');
            } 
            // 3. Détection des Vidéos
            else if (messageAffiche.match(/\.(mp4|mov)/i)) {
                messageAffiche = messageAffiche.replace(/(https?:\/\/[^\s]+)/g, '<video controls style="max-width:100%; border-radius:8px; margin-top:5px;"><source src="$1" type="video/mp4"></video>');
            }
            // 4. Détection des autres fichiers joints Cloudinary
            else if (messageAffiche.includes("res.cloudinary.com")) {
                messageAffiche = messageAffiche.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="display:inline-block; background:#f0f0f0; padding:8px; border-radius:5px; text-decoration:none; color:#075E54; font-weight:bold; margin-top:5px;">📥 Télécharger le fichier joint</a>');
            }

            // Vérifier si on doit afficher la poubelle et le partage
            const senderIsAdmin = msg.profiles?.is_admin || ADMINS_PHONES.includes(msg.sender_phone);
            const currentUserIsAdmin = currentProfile && currentProfile.is_admin;
            let deleteIcon = "";
            let shareIcon = "";

            if (!senderIsAdmin || currentUserIsAdmin) {
                deleteIcon = `<span onclick="supprimerMessageInbox('${msg.id}', '${msg.image_url || ''}', '${msg.media_public_id || ''}', '${msg.sender_phone}')" style="cursor:pointer; color:red; margin-left:8px; font-size:12px;">🗑️</span>`;
            }
            
            if (currentUserIsAdmin) {
                shareIcon = `<span onclick="shareMessageInbox('${msg.id}', '${msg.sender_phone}', '${(msg.content || '').replace(/'/g, "\\'")}', '${msg.image_url || ''}')" style="cursor:pointer; color:#25D366; margin-left:8px; font-size:14px;" title="Partager le message">⤴️</span>`;
            }

            // Bouton de blocage (uniquement pour les non-admins)
            let blockButton = "";
            if (!senderIsAdmin) {
                blockButton = `<span onclick="bloquerUtilisateur('${msg.from_id}', '${msg.sender_phone}')" style="cursor:pointer; color:orange; margin-left:8px; font-size:12px;">🚫</span>`;
            }

            // Style spécial pour les messages admin
            if (senderIsAdmin) {
                div.style.borderLeftColor = "#FFD700";
                div.style.backgroundColor = "#FFF9E6";
            }

            div.innerHTML = `<b>De: ${msg.sender_phone || 'Inconnu'}${senderIsAdmin ? ' ⭐' : ''}${deleteIcon}${shareIcon}${blockButton}</b>
                             <div style="margin:5px 0; word-wrap: break-word;">${messageAffiche}</div>
                             <small style="color:gray; font-size:10px; cursor: default; pointer-events: none;">${msg.time}</small>`;
            fragment.appendChild(div);
        }
        
        // Ajouter tout d'un coup
        box.appendChild(fragment);
        
    } catch (err) {
        console.error('Erreur loadInbox:', err);
        box.innerHTML = "<p style='text-align:center; color:red;'>Erreur de chargement.</p>";
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


// --- LISTE DES MEMBRES (OPTIMISÉE) ---
async function loadMembers() {
    const list = document.getElementById('members-list');
    list.innerHTML = '<div style="text-align:center; padding:20px;">⏳ Chargement des membres...</div>';
    
    try {
        // Optimisation : sélectionner uniquement les champs nécessaires
        const { data, error } = await _supabase
            .from('profiles')
            .select('id, phone, email, is_admin, is_banned')
            .order('is_admin', { ascending: false });
            
        if (error) throw error;
        if (!data || data.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding:20px;">❌ Aucun membre trouvé</div>';
            return;
        }
        
        list.innerHTML = "";
        const currentUserIsAdmin = currentProfile && currentProfile.is_admin;
        
        // Mettre à jour le compteur total de membres
        const countElement = document.getElementById('total-members-count');
        if (countElement) {
            countElement.innerText = formatNumber(data.length);
        }
        
        // Optimisation : utiliser DocumentFragment pour éviter les reflows multiples
        const fragment = document.createDocumentFragment();
        
        // Trier : administrateurs en premier, puis les autres
        const sortedData = data.sort((a, b) => {
            const aIsAdmin = a.is_admin || ADMINS_PHONES.includes(a.phone);
            const bIsAdmin = b.is_admin || ADMINS_PHONES.includes(b.phone);
            
            if (aIsAdmin && !bIsAdmin) return -1;
            if (!aIsAdmin && bIsAdmin) return 1;
            return 0;
        });
        
        sortedData.forEach(m => {
            const div = document.createElement('div');
            div.className = 'member-row';
            div.style = "background:white; margin:5px; padding:8px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:nowrap;";
            
            let statusInfo = "";
            let actionButtons = `<button onclick="openPrivate('${m.id}', '${m.phone}')" style="background:#25D366; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:12px; white-space:nowrap;">✉️</button>`;
            
            // Informations de statut
            if (m.is_admin) {
                statusInfo = '<span style="color:gold;">⭐ Admin</span>';
            } else if (m.is_banned) {
                statusInfo = '<span style="color:red;">🚫 Banni</span>';
            }
            
            // Icône de blocage pour les admins (uniquement pour les non-admins)
            let blockIcon = "";
            if (currentUserIsAdmin && !m.is_admin && !m.is_banned) {
                blockIcon = `<span onclick="bloquerUtilisateur('${m.id}', '${m.phone}')" style="cursor:pointer; color:orange; margin-right:5px; font-size:12px;">🚫</span>`;
            }
            
            // Boutons d'action pour les admins
            if (currentUserIsAdmin && !m.is_admin) {
                if (m.is_banned) {
                    actionButtons += ` <button onclick="debannirUtilisateur('${m.id}', '${m.phone}')" style="background:green; color:white; border:none; padding:4px 6px; border-radius:4px; margin-left:3px; font-size:11px; white-space:nowrap;">✅ Débloquer</button>`;
                } else {
                    actionButtons += ` <button onclick="bannirUtilisateur('${m.id}', '${m.phone}')" style="background:red; color:white; border:none; padding:4px 6px; border-radius:4px; margin-left:3px; font-size:11px; white-space:nowrap;">🚫 Bloquer</button>`;
                }
            }
            
            div.innerHTML = `<div style="font-size:12px;">${blockIcon}<b style="font-size:13px;">${m.phone}</b><br><small style="font-size:10px;">${m.email || ''}</small><br>${statusInfo}</div>
                             <div style="display:flex; gap:3px; align-items:center; flex-shrink:0;">${actionButtons}</div>`;
            fragment.appendChild(div);
        });
        
        // Ajouter tout d'un coup pour éviter les reflows
        list.appendChild(fragment);
        
    } catch (error) {
        console.error('Erreur loadMembers:', error);
        list.innerHTML = '<div style="text-align:center; padding:20px; color:red;">❌ Erreur de chargement</div>';
    }
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

// --- FONCTIONS DE FORMATAGE DU TEXTE (WYSIWYG) ---

// Pour le groupe
function toggleFormattingToolbar() {
    const toolbar = document.getElementById('formatting-toolbar');
    toolbar.style.display = toolbar.style.display === 'none' ? 'flex' : 'none';
}

function formatText(command, value = null) {
    const textarea = document.getElementById('msgInput');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    if (!selectedText) {
        // Si aucun texte n'est sélectionné, on insère le formatage pour le texte à venir
        let placeholder = '';
        switch(command) {
            case 'bold': placeholder = '**texte en gras**'; break;
            case 'italic': placeholder = '*texte en italique*'; break;
            case 'underline': placeholder = '__texte souligné__'; break;
            case 'color': placeholder = `<span style="color:${value}">texte coloré</span>`; break;
        }
        
        textarea.value = textarea.value.substring(0, start) + placeholder + textarea.value.substring(end);
        textarea.focus();
        // Sélectionner le texte placeholder
        const newStart = start;
        const newEnd = start + placeholder.length;
        textarea.setSelectionRange(newStart, newEnd);
    } else {
        // Appliquer le formatage au texte sélectionné
        applyFormattingToText(textarea, start, end, selectedText, command, value);
    }
}

function applyFormattingToText(textarea, start, end, selectedText, command, value) {
    let formattedText = '';
    
    switch(command) {
        case 'bold':
            formattedText = `**${selectedText}**`;
            break;
        case 'italic':
            formattedText = `*${selectedText}*`;
            break;
        case 'underline':
            formattedText = `__${selectedText}__`;
            break;
        case 'color':
            formattedText = `<span style="color:${value}">${selectedText}</span>`;
            break;
    }
    
    textarea.value = textarea.value.substring(0, start) + formattedText + textarea.value.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start, start + formattedText.length);
}

// Pour la diffusion
function toggleFormattingToolbarBroadcast() {
    const toolbar = document.getElementById('broadcast-formatting-toolbar');
    toolbar.style.display = toolbar.style.display === 'none' ? 'flex' : 'none';
}

function formatTextBroadcast(command, value = null) {
    const textarea = document.getElementById('broadcast-msg');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    if (!selectedText) {
        // Si aucun texte n'est sélectionné, on insère le formatage pour le texte à venir
        let placeholder = '';
        switch(command) {
            case 'bold': placeholder = '**texte en gras**'; break;
            case 'italic': placeholder = '*texte en italique*'; break;
            case 'underline': placeholder = '__texte souligné__'; break;
            case 'color': placeholder = `<span style="color:${value}">texte coloré</span>`; break;
        }
        
        textarea.value = textarea.value.substring(0, start) + placeholder + textarea.value.substring(end);
        textarea.focus();
        // Sélectionner le texte placeholder
        const newStart = start;
        const newEnd = start + placeholder.length;
        textarea.setSelectionRange(newStart, newEnd);
    } else {
        // Appliquer le formatage au texte sélectionné
        applyFormattingToTextBroadcast(textarea, start, end, selectedText, command, value);
    }
}

function applyFormattingToTextBroadcast(textarea, start, end, selectedText, command, value) {
    let formattedText = '';
    
    switch(command) {
        case 'bold':
            formattedText = `**${selectedText}**`;
            break;
        case 'italic':
            formattedText = `*${selectedText}*`;
            break;
        case 'underline':
            formattedText = `__${selectedText}__`;
            break;
        case 'color':
            formattedText = `<span style="color:${value}">${selectedText}</span>`;
            break;
    }
    
    textarea.value = textarea.value.substring(0, start) + formattedText + textarea.value.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start, start + formattedText.length);
}

// Pour l'inbox
function toggleFormattingToolbarInbox() {
    const toolbar = document.getElementById('inbox-formatting-toolbar');
    toolbar.style.display = toolbar.style.display === 'none' ? 'flex' : 'none';
}

function formatTextInbox(command, value = null) {
    const textarea = document.getElementById('edit-msg');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    if (!selectedText) {
        // Si aucun texte n'est sélectionné, on insère le formatage pour le texte à venir
        let placeholder = '';
        switch(command) {
            case 'bold': placeholder = '**texte en gras**'; break;
            case 'italic': placeholder = '*texte en italique*'; break;
            case 'underline': placeholder = '__texte souligné__'; break;
            case 'color': placeholder = `<span style="color:${value}">texte coloré</span>`; break;
        }
        
        textarea.value = textarea.value.substring(0, start) + placeholder + textarea.value.substring(end);
        textarea.focus();
        // Sélectionner le texte placeholder
        const newStart = start;
        const newEnd = start + placeholder.length;
        textarea.setSelectionRange(newStart, newEnd);
    } else {
        // Appliquer le formatage au texte sélectionné
        applyFormattingToTextInbox(textarea, start, end, selectedText, command, value);
    }
}

function applyFormattingToTextInbox(textarea, start, end, selectedText, command, value) {
    let formattedText = '';
    
    switch(command) {
        case 'bold':
            formattedText = `**${selectedText}**`;
            break;
        case 'italic':
            formattedText = `*${selectedText}*`;
            break;
        case 'underline':
            formattedText = `__${selectedText}__`;
            break;
        case 'color':
            formattedText = `<span style="color:${value}">${selectedText}</span>`;
            break;
    }
    
    textarea.value = textarea.value.substring(0, start) + formattedText + textarea.value.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start, start + formattedText.length);
}

// --- FONCTIONS D'ÉMOTICÔNES ---

let currentEmojiTarget = 'msgInput'; // Par défaut, cible le groupe

function toggleEmojiPicker() {
    currentEmojiTarget = 'msgInput';
    const picker = document.getElementById('emoji-picker');
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
}

function toggleEmojiPickerBroadcast() {
    currentEmojiTarget = 'broadcast-msg';
    const picker = document.getElementById('emoji-picker');
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
}

function toggleEmojiPickerInbox() {
    currentEmojiTarget = 'edit-msg';
    const picker = document.getElementById('emoji-picker');
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
}

function insertEmoji(emoji) {
    const textarea = document.getElementById(currentEmojiTarget);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    textarea.value = textarea.value.substring(0, start) + emoji + textarea.value.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    
    // Fermer le picker
    document.getElementById('emoji-picker').style.display = 'none';
}

// --- FONCTIONS DE PARTAGE ---

function shareMessage(messageId, senderPhone, content, imageUrl) {
    if (!currentProfile || !currentProfile.is_admin) {
        alert("Fonction réservée aux administrateurs");
        return;
    }
    
    // Stocker le message à partager
    window.messageToShare = {
        id: messageId,
        sender: senderPhone,
        content: content,
        image: imageUrl
    };
    
    // Afficher le dialogue de partage
    showShareDialog();
}

function shareMessageInbox(messageId, senderPhone, content, imageUrl) {
    shareMessage(messageId, senderPhone, content, imageUrl);
}

function showShareDialog() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 10px;
        max-width: 90%;
        max-height: 80%;
        overflow-y: auto;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;
    
    dialog.innerHTML = `
        <h3 style="margin-top: 0; color: #25D366;">Partager ce message</h3>
        <p><strong>Message de:</strong> ${window.messageToShare.sender}</p>
        <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 10px 0; max-height: 100px; overflow-y: auto;">
            ${window.messageToShare.content}
        </div>
        ${window.messageToShare.image ? `<img src="${window.messageToShare.image}" style="max-width: 200px; border-radius: 5px;">` : ''}
        <h4>Choisir le destinataire:</h4>
        <div id="share-destinations-list" style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
            <div style="text-align: center; padding: 20px; color: #666;">⏳ Chargement des destinataires...</div>
        </div>
        <div style="margin-top: 15px; text-align: right;">
            <button onclick="this.closest('.modal-share').remove()" style="background: #ccc; border: none; padding: 8px 15px; border-radius: 5px; margin-right: 10px;">Annuler</button>
        </div>
    `;
    
    modal.className = 'modal-share';
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    
    // Charger la liste des destinataires
    loadShareDestinations();
    
    // Fermer en cliquant à l'extérieur
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function loadShareDestinations() {
    try {
        // Charger les membres
        const { data: members, error: membersError } = await _supabase
            .from('profiles')
            .select('id, phone, is_admin')
            .neq('id', currentUser.id)
            .order('is_admin', { ascending: false });
        
        if (membersError) throw membersError;
        
        const destinationsList = document.getElementById('share-destinations-list');
        
        if (!members || members.length === 0) {
            destinationsList.innerHTML = '<p style="text-align: center; color: #666;">Aucun membre disponible</p>';
            return;
        }
        
        // Créer le contenu HTML
        let html = '';
        
        // Option pour partager dans le groupe
        html += `
            <div onclick="shareToGroup()" style="background: #25D366; color: white; padding: 10px; border-radius: 5px; margin-bottom: 10px; cursor: pointer; text-align: center;">
                <strong>📢 Partager dans le groupe</strong>
                <div style="font-size: 12px; opacity: 0.9;">Tous les membres verront ce message</div>
            </div>
        `;
        
        // Options pour les membres individuels
        html += '<div style="margin-top: 10px; font-weight: bold; color: #666;">👥 Partager à un membre spécifique:</div>';
        
        members.forEach(member => {
            const isAdmin = member.is_admin || ADMINS_PHONES.includes(member.phone);
            html += `
                <div onclick="shareToMember('${member.id}', '${member.phone}')" style="background: white; border: 1px solid #ddd; padding: 8px; border-radius: 5px; margin-bottom: 5px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${member.phone}</strong>
                        ${isAdmin ? '<span style="color: gold; margin-left: 5px;">⭐</span>' : ''}
                    </div>
                    <span style="color: #25D366; font-size: 12px;">✉️ Envoyer</span>
                </div>
            `;
        });
        
        destinationsList.innerHTML = html;
        
    } catch (err) {
        console.error('Erreur chargement destinataires:', err);
        document.getElementById('share-destinations-list').innerHTML = 
            '<p style="text-align: center; color: red;">Erreur de chargement des destinataires</p>';
    }
}

async function shareToGroup() {
    try {
        const message = window.messageToShare;
        
        // Envoyer dans le groupe (table messages)
        const { error } = await _supabase.from('messages').insert([{
            sender_id: currentUser.id,
            sender_phone: currentProfile.phone,
            content: `📤 *Message partagé de ${message.sender}:*\n\n${message.content}`,
            image_url: message.image,
            time: new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})
        }]);
        
        if (error) throw error;
        
        alert('Message partagé dans le groupe avec succès!');
        document.querySelector('.modal-share').remove();
        
    } catch (err) {
        console.error('Erreur partage groupe:', err);
        alert('Erreur lors du partage dans le groupe');
    }
}

async function shareToMember(memberId, memberPhone) {
    try {
        const message = window.messageToShare;
        
        // Envoyer en message privé (table inbox)
        const { error } = await _supabase.from('inbox').insert([{
            from_id: currentUser.id,
            to_id: memberId,
            content: `📤 *Message partagé de ${message.sender}:*\n\n${message.content}`,
            sender_phone: currentProfile.phone,
            image_url: message.image,
            time: new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})
        }]);
        
        if (error) throw error;
        
        alert(`Message partagé à ${memberPhone} avec succès!`);
        document.querySelector('.modal-share').remove();
        
    } catch (err) {
        console.error('Erreur partage membre:', err);
        alert('Erreur lors du partage au membre');
    }
}
        if (error) throw error;
        
        const list = document.getElementById('share-members-list');
        if (!list) return;
        
        list.innerHTML = '';
        
        data.forEach(member => {
            const memberDiv = document.createElement('div');
            memberDiv.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px;
                border-bottom: 1px solid #eee;
                cursor: pointer;
            `;
            
            memberDiv.innerHTML = `
                <span>${member.phone}${member.is_admin ? ' ⭐' : ''}</span>
                <div>
                    <button onclick="shareToGroup('${member.id}')" style="background: #25D366; color: white; border: none; padding: 4px 8px; border-radius: 3px; margin-right: 5px;">Groupe</button>
                    <button onclick="shareToInbox('${member.id}', '${member.phone}')" style="background: #075E54; color: white; border: none; padding: 4px 8px; border-radius: 3px;">Inbox</button>
                </div>
            `;
            
            list.appendChild(memberDiv);
        });
        
    } catch (err) {
        console.error('Erreur chargement membres pour partage:', err);
        const list = document.getElementById('share-members-list');
        if (list) list.innerHTML = '<p style="color: red;">Erreur de chargement</p>';
    }
}

async function shareToGroup(memberId) {
    if (!window.messageToShare) return;
    
    try {
        const messageData = {
            sender_id: currentUser.id,
            sender_phone: currentProfile.phone,
            content: `*Message partagé de ${window.messageToShare.sender}:*\n\n${window.messageToShare.content}`,
            image_url: window.messageToShare.image,
            time: new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})
        };
        
        const { error } = await _supabase.from('messages').insert([messageData]);
        
        if (error) throw error;
        
        alert('Message partagé dans le groupe avec succès!');
        document.querySelector('.modal-share').remove();
        
    } catch (err) {
        console.error('Erreur partage groupe:', err);
        alert('Erreur lors du partage dans le groupe');
    }
}

async function shareToInbox(memberId, memberPhone) {
    if (!window.messageToShare) return;
    
    try {
        const messageData = {
            from_id: currentUser.id,
            to_id: memberId,
            content: `*Message partagé de ${window.messageToShare.sender}:*\n\n${window.messageToShare.content}`,
            sender_phone: currentProfile.phone,
            image_url: window.messageToShare.image,
            time: new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})
        };
        
        const { error } = await _supabase.from('inbox').insert([messageData]);
        
        if (error) throw error;
        
        alert(`Message partagé à ${memberPhone} avec succès!`);
        document.querySelector('.modal-share').remove();
        
    } catch (err) {
        console.error('Erreur partage inbox:', err);
        alert('Erreur lors du partage en privé');
    }
}

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

// --- FONCTION DE TRAITEMENT DU TEXTE ---
function processMessageContent(content) {
    if (!content) return '';
    
    // 1. Remplacer les retours à la ligne par <br>
    let processed = content.replace(/\n/g, '<br>');
    
    // 2. Gérer le formatage markdown
    // Gras : **texte** -> <b>texte</b>
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    
    // Italique : *texte* -> <i>texte</i>
    processed = processed.replace(/\*(.*?)\*/g, '<i>$1</i>');
    
    // Soulignement : __texte__ -> <u>texte</u>
    processed = processed.replace(/__(.*?)__/g, '<u>$1</u>');
    
    // 3. Rendre les URLs cliquables avec word-wrap
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    processed = processed.replace(urlRegex, '<a href="$1" target="_blank" style="color: #25D366; text-decoration: underline; word-break: break-all;">$1</a>');
    
    return processed;
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
    
    // Ajouter les données du message pour le swipe
    div.dataset.messageId = m.id;
    div.dataset.senderPhone = m.sender_phone;
    div.dataset.content = m.content || '';
    div.dataset.imageUrl = m.image_url || '';

    // Utiliser la nouvelle fonction de traitement du texte
    let contenuFinal = processMessageContent(m.content || '');

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

    // Icônes pour les admins
    const currentUserIsAdmin = currentProfile && currentProfile.is_admin;
    const deleteIcon = currentUserIsAdmin ? `<span onclick="supprimerMessageGroupe('${m.id}', '${m.image_url || ''}', '${m.media_public_id || ''}')" style="cursor:pointer; color:red; margin-left:8px; font-size:12px;">🗑️</span>` : "";
    const shareIcon = currentUserIsAdmin ? `<span onclick="shareMessage('${m.id}', '${m.sender_phone}', '${(m.content || '').replace(/'/g, "\\'")}', '${m.image_url || ''}')" style="cursor:pointer; color:#25D366; margin-left:8px; font-size:14px;" title="Partager le message">⤴️</span>` : "";

    div.innerHTML = `<small><b>${m.sender_phone}</b>${deleteIcon}${shareIcon}</small>
                     ${mediaSupplementaire}
                     <div style="word-wrap: break-word;">${contenuFinal}</div>
                     <small style="font-size:10px; display:block; text-align:right;">${m.time}</small>`;
    
    // Ajouter les événements de swipe
    addSwipeToReply(div, m);
    
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function listenRealtime() {
    _supabase.channel('public:messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => renderMsg(p.new)).subscribe();
}

// --- FONCTION DE SWIPE POUR RÉPONDRE ---
function addSwipeToReply(element, message) {
    let touchStartX = 0;
    let touchEndX = 0;
    let isSwiping = false;
    let selectionText = '';
    
    element.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        isSwiping = true;
        element.style.transition = 'transform 0.2s ease-out';
    }, { passive: true });
    
    element.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        
        isSwiping = false;
        
        touchEndX = e.changedTouches[0].screenX;
        const diffX = touchEndX - touchStartX;
        
        // Réinitialiser la position
        element.style.transform = '';
        
        // Si le swipe est suffisant vers la droite (au moins 50px)
        if (diffX > 50) {
            // Ne pas répondre à ses propres messages
            if (message.sender_id !== currentUser.id) {
                replyToMessage(message);
            }
        }
    });
    
    // Support pour la souris (desktop) - AMÉLIORÉ POUR ÉVITER LES CONFLITS
    let mouseStartX = 0;
    let isMouseDown = false;
    let hasMoved = false;
    let selectionStartTime = 0;
    
    element.addEventListener('mousedown', (e) => {
        // Vérifier si l'utilisateur veut sélectionner du texte
        selectionText = window.getSelection().toString();
        selectionStartTime = Date.now();
        
        mouseStartX = e.clientX;
        isMouseDown = true;
        hasMoved = false;
        element.style.transition = 'transform 0.2s ease-out';
        
        // Ne pas empêcher le comportement par défaut pour permettre la sélection
        // e.preventDefault();
    });
    
    element.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        
        const diffX = e.clientX - mouseStartX;
        
        // Si le mouvement est horizontal et significatif, c'est probablement un swipe
        if (Math.abs(diffX) > 20) {
            hasMoved = true;
            element.style.cursor = 'grabbing';
            
            // Appliquer l'effet visuel seulement si c'est un mouvement horizontal dominant
            if (diffX > 0 && diffX < 100) {
                element.style.transform = `translateX(${diffX}px)`;
            }
        }
    });
    
    element.addEventListener('mouseup', (e) => {
        if (!isMouseDown) return;
        
        isMouseDown = false;
        element.style.cursor = '';
        
        const diffX = e.clientX - mouseStartX;
        const timeDiff = Date.now() - selectionStartTime;
        const currentSelection = window.getSelection().toString();
        
        // Réinitialiser la position
        element.style.transform = '';
        
        // Conditions pour déclencher le swipe :
        // 1. Mouvement horizontal suffisant (>50px)
        // 2. Temps court (<500ms) pour éviter les sélections lentes
        // 3. Pas de texte sélectionné ou le texte sélectionné n'a pas changé
        // 4. L'utilisateur a bien déplacé la souris (pas juste un clic)
        if (diffX > 50 && timeDiff < 500 && currentSelection === selectionText && hasMoved) {
            // Ne pas répondre à ses propres messages
            if (message.sender_id !== currentUser.id) {
                replyToMessage(message);
            }
        }
    });
    
    element.addEventListener('mouseleave', () => {
        if (isMouseDown) {
            isMouseDown = false;
            element.style.transform = '';
            element.style.cursor = '';
        }
    });
}

function replyToMessage(message) {
    // Mettre en place la réponse
    replyToId = message.id;
    
    // Afficher l'aperçu de réponse
    const replyPreview = document.getElementById('reply-preview');
    const replyUser = document.getElementById('reply-user');
    const replyText = document.getElementById('reply-text');
    
    replyUser.textContent = `Réponse à ${message.sender_phone}`;
    
    // Limiter le texte de l'aperçu
    let previewText = message.content || '';
    if (previewText.length > 50) {
        previewText = previewText.substring(0, 50) + '...';
    }
    replyText.textContent = previewText;
    
    // Rendre l'aperçu visible et s'assurer qu'il reste visible
    replyPreview.style.display = 'flex';
    replyPreview.style.position = 'relative';
    replyPreview.style.zIndex = '5';
    
    // Focus sur le champ de saisie
    const msgInput = document.getElementById('msgInput');
    msgInput.focus();
    
    // S'assurer que l'aperçu reste visible même pendant la saisie
    msgInput.addEventListener('input', function keepReplyVisible() {
        if (replyToId) {
            replyPreview.style.display = 'flex';
        } else {
            msgInput.removeEventListener('input', keepReplyVisible);
        }
    });
    
    // Faire défiler jusqu'en bas
    const chatBox = document.getElementById('chat-box');
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- FONCTIONS POUR LES MODÈLES DE MESSAGES ---

function showMessageTemplates() {
    if (!currentProfile || !currentProfile.is_admin) {
        alert("Fonction réservée aux administrateurs");
        return;
    }
    showView('page-templates');
    loadMessageTemplates();
}

async function loadMessageTemplates() {
    const list = document.getElementById('templates-list');
    list.innerHTML = '<div style="text-align:center; padding:20px;">⏳ Chargement des modèles...</div>';
    
    try {
        // Créer la table si elle n'existe pas (fallback)
        const { error: createError } = await _supabase.rpc('create_templates_table_if_not_exists');
        if (createError && !createError.message.includes('already exists')) {
            console.log('Table peut déjà exister, continuation...');
        }
        
        const { data, error } = await _supabase
            .from('message_templates')
            .select('*')
            .eq('created_by', currentUser.id)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Erreur détaillée:', error);
            // Si la table n'existe pas, on crée une version locale temporaire
            if (error.code === 'PGRST116') {
                list.innerHTML = '<div style="text-align:center; padding:20px; color:orange;">⚠️ Table en cours de création. Veuillez réessayer dans quelques instants...</div>';
                // Tentative de création de table
                setTimeout(() => loadMessageTemplates(), 2000);
                return;
            }
            throw error;
        }
        
        list.innerHTML = '';
        
        if (!data || data.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Aucun modèle créé. Cliquez sur "+ Nouveau" pour commencer.</div>';
            return;
        }
        
        data.forEach(template => {
            const templateDiv = document.createElement('div');
            templateDiv.style.cssText = `
                background: white;
                margin: 10px;
                padding: 15px;
                border-radius: 10px;
                border-left: 5px solid #25D366;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;
            
            const preview = template.content.length > 100 ? template.content.substring(0, 100) + '...' : template.content;
            
            templateDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <h4 style="margin: 0; color: #25D366;">${template.title}</h4>
                    <div>
                        <button onclick="editTemplate('${template.id}')" style="background: #007bff; color: white; border: none; padding: 4px 8px; border-radius: 3px; margin-right: 5px; font-size: 12px;">✏️</button>
                        <button onclick="deleteTemplate('${template.id}')" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 3px; font-size: 12px;">🗑️</button>
                    </div>
                </div>
                <div style="color: #666; font-size: 14px; margin-bottom: 10px; line-height: 1.4;">${preview}</div>
                ${template.image_url ? `<img src="${template.image_url}" style="max-width: 100px; border-radius: 5px; margin-bottom: 10px;">` : ''}
                <div style="display: flex; gap: 10px;">
                    <button onclick="useTemplateInGroup('${template.id}')" style="background: #25D366; color: white; border: none; padding: 6px 12px; border-radius: 5px; font-size: 12px;">Groupe</button>
                    <button onclick="useTemplateInBroadcast('${template.id}')" style="background: #075E54; color: white; border: none; padding: 6px 12px; border-radius: 5px; font-size: 12px;">Diffusion</button>
                    <button onclick="showTemplateShareDialog('${template.id}')" style="background: #ffc107; color: black; border: none; padding: 6px 12px; border-radius: 5px; font-size: 12px;">Partager</button>
                </div>
            `;
            
            list.appendChild(templateDiv);
        });
        
    } catch (err) {
        console.error('Erreur chargement modèles:', err);
        list.innerHTML = '<div style="text-align:center; padding:20px; color:red;">Erreur de chargement</div>';
    }
}

function toggleCreateTemplate() {
    showCreateTemplateDialog();
}

function showCreateTemplateDialog() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 10px;
        max-width: 90%;
        max-height: 80%;
        overflow-y: auto;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;
    
    dialog.innerHTML = `
        <h3 style="margin-top: 0; color: #25D366;">Créer un modèle</h3>
        <input type="text" id="template-title" placeholder="Titre du modèle" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 10px;">
        <textarea id="template-content" placeholder="Contenu du message" style="width: 100%; height: 150px; padding: 10px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 10px; resize: vertical;"></textarea>
        <div style="margin-bottom: 10px;">
            <label for="template-image" style="display: block; margin-bottom: 5px;">Image (optionnel):</label>
            <input type="file" id="template-image" accept="image/*" style="width: 100%;">
            <div id="template-image-preview" style="margin-top: 10px;"></div>
        </div>
        <div style="text-align: right;">
            <button onclick="this.closest('.modal-template').remove()" style="background: #ccc; border: none; padding: 8px 15px; border-radius: 5px; margin-right: 10px;">Annuler</button>
            <button onclick="saveTemplate()" style="background: #25D366; color: white; border: none; padding: 8px 15px; border-radius: 5px;">Enregistrer</button>
        </div>
    `;
    
    modal.className = 'modal-template';
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    
    // Prévisualisation de l'image
    document.getElementById('template-image').addEventListener('change', (e) => {
        const file = e.target.files[0];
        const preview = document.getElementById('template-image-preview');
        
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `<img src="${e.target.result}" style="max-width: 200px; border-radius: 5px;">`;
            };
            reader.readAsDataURL(file);
        } else {
            preview.innerHTML = '';
        }
    });
    
    // Fermer en cliquant à l'extérieur
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function saveTemplate() {
    const title = document.getElementById('template-title').value.trim();
    const content = document.getElementById('template-content').value.trim();
    const imageFile = document.getElementById('template-image').files[0];
    
    if (!title || !content) {
        alert('Veuillez remplir le titre et le contenu');
        return;
    }
    
    try {
        let imageUrl = null;
        
        // Upload de l'image si présente
        if (imageFile) {
            const formData = new FormData();
            formData.append('file', imageFile);
            formData.append('upload_preset', "chat_preset");
            
            const response = await fetch(`https://api.cloudinary.com/v1_1/dtkssnhub/image/upload`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            if (data.secure_url) {
                imageUrl = data.secure_url;
            }
        }
        
        // Sauvegarder le modèle
        const { error } = await _supabase.from('message_templates').insert([{
            title: title,
            content: content,
            image_url: imageUrl,
            created_by: currentUser.id
        }]);
        
        if (error) {
            console.error('Erreur détaillée:', error);
            if (error.code === 'PGRST116') {
                alert('La table des modèles est en cours de création. Veuillez réessayer dans quelques instants.');
                return;
            }
            throw error;
        }
        
        alert('Modèle créé avec succès!');
        document.querySelector('.modal-template').remove();
        loadMessageTemplates();
        
    } catch (err) {
        console.error('Erreur création modèle:', err);
        alert('Erreur lors de la création du modèle');
    }
}

async function useTemplateInGroup(templateId) {
    try {
        const { data, error } = await _supabase
            .from('message_templates')
            .select('*')
            .eq('id', templateId)
            .single();
        
        if (error) throw error;
        
        // Remplir le champ de saisie du groupe
        document.getElementById('msgInput').value = data.content;
        
        // Retourner au groupe
        goBack();
        
        // Focus sur le champ de saisie
        document.getElementById('msgInput').focus();
        
    } catch (err) {
        console.error('Erreur utilisation modèle:', err);
        alert('Erreur lors du chargement du modèle');
    }
}

async function useTemplateInBroadcast(templateId) {
    try {
        const { data, error } = await _supabase
            .from('message_templates')
            .select('*')
            .eq('id', templateId)
            .single();
        
        if (error) throw error;
        
        // Remplir le champ de saisie de diffusion
        document.getElementById('broadcast-msg').value = data.content;
        
        // Retourner à la diffusion
        goBack();
        showView('page-broadcast');
        
        // Focus sur le champ de saisie
        document.getElementById('broadcast-msg').focus();
        
    } catch (err) {
        console.error('Erreur utilisation modèle:', err);
        alert('Erreur lors du chargement du modèle');
    }
}

async function deleteTemplate(templateId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce modèle?')) return;
    
    try {
        const { error } = await _supabase
            .from('message_templates')
            .delete()
            .eq('id', templateId);
        
        if (error) throw error;
        
        alert('Modèle supprimé avec succès!');
        loadMessageTemplates();
        
    } catch (err) {
        console.error('Erreur suppression modèle:', err);
        alert('Erreur lors de la suppression du modèle');
    }
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
        const templatesBtn = document.getElementById('templates-btn');

        if (attachGroup) attachGroup.style.display = 'inline-block';
        if (attachBC) attachBC.style.display = 'inline-block';
        if (attachInbox) attachInbox.style.display = 'inline-block';
        if (menuBtn) menuBtn.style.display = 'block'; // S'assure que le menu ⋮ est visible
        if (templatesBtn) templatesBtn.style.display = 'block'; // Afficher le bouton Modèles
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
