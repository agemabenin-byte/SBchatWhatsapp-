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
    if (viewId === 'page-inbox') loadInbox();
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
    let publicId = null; // Nouvelle variable pour le Public ID

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
            
            if(data.secure_url) {
                url = data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
                publicId = data.public_id; // On récupère l'identifiant unique ici
            }
        } catch (err) { 
            console.error(err); 
            return alert("Erreur lors de l'upload du média."); 
        }
    }

    // Insertion dans Supabase avec le media_public_id
    await _supabase.from('messages').insert([{
        sender_id: currentUser.id, 
        sender_phone: currentProfile.phone,
        content: content, 
        image_url: url, 
        media_public_id: publicId, // On enregistre l'ID pour la future suppression
        reply_to_id: replyToId,
        time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
    }]);

    input.value = ""; 
    fileInput.value = ""; 
    cancelReply();
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
        time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
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
    box.innerHTML = "<p style='text-align:center;'>Chargement...</p>";

    const { data, error } = await _supabase
        .from('inbox')
        .select('*')
        .eq('to_id', currentUser.id)
        .order('id', {ascending: false});
    
    if(error) return box.innerHTML = "<p style='text-align:center; color:red;'>Erreur de chargement.</p>";
    box.innerHTML = "";

    if(data && data.length > 0) {
        data.forEach(msg => {
            const div = document.createElement('div');
            div.style = "background:white; margin:10px; padding:10px; border-radius:8px; border-left:5px solid #25D366; box-shadow: 0 2px 4px rgba(0,0,0,0.1); position:relative;";
            
            // --- LOGIQUE ADMIN : CORBEILLE ---
            let deleteBtnInbox = "";
            // On vérifie si l'utilisateur actuel est admin
            if (currentProfile && ADMINS_PHONES.includes(currentProfile.phone)) {
                // On passe null pour mediaUrl ici pour simplifier, car le contenu est déjà traité plus bas
                deleteBtnInbox = `<span onclick="supprimerMessage('${msg.id}', 'inbox', null)" 
                                  style="cursor:pointer; color:#ff4d4d; float:right; font-size:14px; font-weight:bold;">🗑️</span>`;
            }

            let messageAffiche = msg.content || "";

            // Détection automatique des médias (Images, Vidéos, Fichiers)
            if (messageAffiche.match(/\.(jpeg|jpg|gif|png|webp)/i)) {
                messageAffiche = messageAffiche.replace(/(https?:\/\/[^\s]+)/g, '<img src="$1" style="max-width:100%; border-radius:8px; display:block; margin-top:5px;">');
            } 
            else if (messageAffiche.match(/\.(mp4|mov)/i)) {
                messageAffiche = messageAffiche.replace(/(https?:\/\/[^\s]+)/g, '<video controls style="max-width:100%; border-radius:8px; margin-top:5px;"><source src="$1" type="video/mp4"></video>');
            }
            else if (messageAffiche.includes("res.cloudinary.com")) {
                messageAffiche = messageAffiche.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="display:inline-block; background:#f0f0f0; padding:8px; border-radius:5px; text-decoration:none; color:#075E54; font-weight:bold; margin-top:5px;">📥 Télécharger le fichier</a>');
            }

            div.innerHTML = `
                <div style="margin-bottom:5px; overflow:hidden;">
                    ${deleteBtnInbox}
                    <b>De: ${msg.sender_phone || 'Inconnu'}</b>
                </div>
                <div style="margin:5px 0; word-wrap: break-word;">${messageAffiche}</div>
                <small style="color:gray; font-size:10px; display:block; margin-top:5px;">${msg.time}</small>`;
            
            box.appendChild(div);
        });
    } else { 
        box.innerHTML = "<p style='text-align:center; margin-top:20px; color:gray;'>Aucun message reçu.</p>"; 
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
    if(!box) return;

    const div = document.createElement('div');
    // On sécurise le sender_id au cas où currentUser ne serait pas encore chargé
    const myId = currentUser ? currentUser.id : null;
    div.className = `msg ${m.sender_id === myId ? 'me' : 'other'}`;
    div.style.position = "relative"; 

    // --- LOGIQUE ADMIN : CORBEILLE ---
    let deleteBtn = "";
    if (currentProfile && ADMINS_PHONES.includes(currentProfile.phone)) {
        deleteBtn = `<span onclick="supprimerMessage('${m.id}', 'messages', '${m.image_url || ''}')" 
                      style="cursor:pointer; color:#ff4d4d; font-size:14px; margin-left:10px; font-weight:bold;">🗑️</span>`;
    }

    let contenuFinal = m.content || '';

    // Détection Vidéo dans le texte
    if (contenuFinal.includes('.mp4') || contenuFinal.includes('.mov')) {
        contenuFinal = contenuFinal.replace(/(https?:\/\/[^\s]+(?:\.mp4|\.mov)[^\s]*)/g, 
            `<video controls style="max-width:100%; border-radius:8px; margin-top:5px;">
                <source src="$1" type="video/mp4">
             </video>`);
    } 
    // Détection Image dans le texte
    else if (contenuFinal.match(/\.(jpeg|jpg|gif|png|webp)/i)) {
        contenuFinal = contenuFinal.replace(/(https?:\/\/[^\s]+(?:\.jpg|\.png|\.jpeg|\.webp)[^\s]*)/g, 
            `<img src="$1" style="max-width:100%; border-radius:8px; margin-top:5px;">`);
    }

    // Gestion de la colonne image_url (si le média n'est pas déjà dans le contenu texte)
    let mediaSupplementaire = "";
    if (m.image_url && !contenuFinal.includes(m.image_url)) {
         mediaSupplementaire = `<img src="${m.image_url}" class="chat-img" style="max-width:100%; border-radius:8px; display:block; margin-bottom:5px;">`;
    }

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:3px;">
            <small><b>${m.sender_phone}</b></small>
            ${deleteBtn}
        </div>
        ${mediaSupplementaire}
        <div style="word-wrap: break-word;">${contenuFinal}</div>
        <small style="font-size:10px; display:block; text-align:right; margin-top:3px; color:gray;">${m.time}</small>`;
    
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
    formData.append('upload_preset', "video_preset"); 

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

    // On utilise ton compte vidéo pour tout (plus simple)
    const cloudName = "dn3vf0mhm";
    const resourceType = type === 'image' ? "image" : "video";
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`);
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
    formData.append('upload_preset', "video_preset"); // Utilise ton preset

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

    const cloudName = "dn3vf0mhm"; // Ton compte vidéo
    const resourceType = type === 'image' ? "image" : "video";
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`);
    xhr.send(formData);
}

function gererAffichageAdmin(userPhone) {
    if (ADMINS_PHONES.includes(userPhone)) {
        // 1. Les icônes de pièces jointes (trombonnes)
        const attachGroup = document.getElementById('admin-attach-btn');
        const attachBC = document.getElementById('admin-bc-attach');
        const attachInbox = document.getElementById('admin-inbox-attach');
        
        // 2. Les menus d'administration
        const menuBtn = document.getElementById('adminMenuBtn');
        const exportBtn = document.getElementById('admin-export-btn');
        const broadcastBtn = document.getElementById('admin-broadcast-btn');

        // Affichage
        if (attachGroup) attachGroup.style.display = 'inline-block';
        if (attachBC) attachBC.style.display = 'inline-block';
        if (attachInbox) attachInbox.style.display = 'inline-block';
        
        if (menuBtn) menuBtn.style.display = 'block';
        if (exportBtn) exportBtn.style.display = 'block';
        if (broadcastBtn) broadcastBtn.style.display = 'block';
        
        console.log("Mode Admin activé pour :", userPhone);
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

async function supprimerMessage(id, table, mediaUrl = null) {
    if (!confirm("Supprimer définitivement ce message et son média ?")) return;

    // 1. Suppression du média sur Cloudinary (si présent)
    if (mediaUrl) {
        // Note: La suppression directe via URL nécessite souvent une configuration spécifique 
        // ou l'usage du 'public_id'. Ici, on informe l'admin, mais la suppression DB est immédiate.
        console.log("Tentative de suppression média :", mediaUrl);
    }

    // 2. Suppression dans Supabase
    const { error } = await _supabase.from(table).delete().eq('id', id);

    if (error) {
        alert("Erreur suppression DB : " + error.message);
    } else {
        alert("Message supprimé !");
        if (table === 'messages') loadChat(); 
        else loadInbox();
    }
}



// 3. LE DÉCLENCHEUR AUTOMATIQUE (À mettre tout en bas du fichier)
// C'est cette ligne qui empêche le retour forcé au login lors d'un rafraîchissement !
window.onload = checkSession;
