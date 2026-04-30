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
    const content = getEditorContent('msgInput').trim();
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];
    let url = null;

    if(!content && !file && !window.templateMediaUrl) return;

    // Utiliser le média du modèle si disponible, sinon uploader le fichier
    if(window.templateMediaUrl && !file) {
        url = window.templateMediaUrl;
        window.templateMediaUrl = null; // Réinitialiser après utilisation
    } else if(file) {
        try {
            if(file.type.startsWith('video/')) {
                // Vidéo → compte dédié dn3vf0mhm
                console.log('Upload vidéo détecté:', file.name, file.type);
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', "video_preset");
                console.log('Envoi vers dn3vf0mhm/video/upload avec preset video_preset');
                const response = await fetch(`https://api.cloudinary.com/v1_1/dn3vf0mhm/video/upload`, {
                    method: 'POST', body: formData
                });
                const data = await response.json();
                console.log('Réponse Cloudinary vidéo:', data);
                if(data.secure_url) {
                    url = data.secure_url;
                    console.log('URL vidéo obtenue:', url);
                } else {
                    console.error('Réponse Cloudinary sans URL:', data);
                    throw new Error("URL vidéo manquante");
                }
            } else {
                // Image → compte dtkssnhub
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', "chat_preset");
                const response = await fetch(`https://api.cloudinary.com/v1_1/dtkssnhub/image/upload`, {
                    method: 'POST', body: formData
                });
                const data = await response.json();
                if(data.secure_url) url = data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
                else throw new Error("URL image manquante");
            }
        } catch (err) { console.error(err); return alert("Erreur upload fichier."); }
    }

    // Conserver les retours à la ligne dans le contenu
    const processedContent = content;

    await _supabase.from('messages').insert([{
        sender_id: currentUser.id, 
        sender_phone: currentProfile.phone,
        content: processedContent, 
        image_url: url, 
        reply_to_id: replyToId,
        time: new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})
    }]);

    clearEditor('msgInput'); fileInput.value = ""; cancelReply();
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
    const content = getEditorContent('edit-msg');
    if(!content || !window.currentDestId) return alert("Message vide !");

    // Vérifier s'il y a un média de modèle ou un fichier uploadé
    let mediaUrl = window.templateMediaUrl || null;
    const fileInput = document.getElementById('inbox-photo-input');
    const videoInput = document.getElementById('inbox-video-input');
    const file = fileInput.files[0] || videoInput.files[0];
    
    if(!mediaUrl && file) {
        try {
            if(file.type.startsWith('video/')) {
                console.log('Upload vidéo inbox détecté:', file.name, file.type);
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', "video_preset");
                console.log('Envoi vers dn3vf0mhm/video/upload avec preset video_preset');
                const response = await fetch(`https://api.cloudinary.com/v1_1/dn3vf0mhm/video/upload`, {
                    method: 'POST', body: formData
                });
                const data = await response.json();
                if(data.secure_url) mediaUrl = data.secure_url;
                else throw new Error("URL vidéo manquante");
            } else {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', "chat_preset");
                const response = await fetch(`https://api.cloudinary.com/v1_1/dtkssnhub/image/upload`, {
                    method: 'POST', body: formData
                });
                const data = await response.json();
                if(data.secure_url) mediaUrl = data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
            }
        } catch (err) { 
            console.error(err); 
            return alert("Erreur fichier."); 
        }
    }

    // Conserver les retours à la ligne dans le contenu
    const processedContent = content;

    // On inclut maintenant le sender_phone puisque la colonne existe
    const { error } = await _supabase.from('inbox').insert([{
        from_id: currentUser.id,
        to_id: window.currentDestId,
        content: processedContent,
        sender_phone: currentProfile.phone, // Ton numéro stocké dans currentProfile
        image_url: mediaUrl,
        time: new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})
    }]);

    if(error) {
        alert("Erreur d'envoi : " + error.message);
    } else {
        alert("Message privé envoyé !");
        // NETTOYAGE
        clearEditor('edit-msg'); // Vide le texte
        document.getElementById('inbox-photo-input').value = ""; // Vide l'image sélectionnée
        document.getElementById('inbox-video-input').value = ""; // Vide le fichier sélectionné
        window.templateMediaUrl = null; // Réinitialiser le média du modèle
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
            
            // Traiter le contenu avec les médias
            let messageAffiche = processMessageContent(msg.content || "");

            // Ajouter l'image depuis image_url si elle existe
            if (msg.image_url && !messageAffiche.includes(msg.image_url)) {
                // Vérifier si c'est une vidéo
                if (msg.image_url.match(/\.(mp4|mov)$/i)) {
                    messageAffiche += `<br><video controls preload="metadata" style="max-width:100%; border-radius:8px; display:block; margin-top:5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);"><source src="${msg.image_url}" type="video/mp4"></video>`;
                } else {
                    messageAffiche += `<br><img src="${msg.image_url}" style="max-width:100%; border-radius:8px; display:block; margin-top:5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" alt="Image partagée">`;
                }
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
                // Encoder le contenu pour éviter les problèmes avec les URLs et caractères spéciaux
                const contentEncoded = encodeURIComponent(msg.content || '');
                shareIcon = `<span onclick="shareMessageInbox('${msg.id}', '${msg.sender_phone}', '${contentEncoded}', '${msg.image_url || ''}')" style="cursor:pointer; color:blue; margin-left:8px; font-size:12px;">⤴️</span>`;
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

            div.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
                                 <b>De: ${msg.sender_phone || 'Inconnu'}${senderIsAdmin ? ' ⭐' : ''}</b>
                                 <span>${deleteIcon}${shareIcon}${blockButton}</span>
                             </div>
                             <div style="margin:5px 0; word-wrap: break-word;">${messageAffiche}</div>
                             <small style="color:gray; font-size:10px; pointer-events: none; cursor: default;">${msg.time}</small>`;
            fragment.appendChild(div);
        }
        
        // Ajouter tout d'un coup
        box.appendChild(fragment);
        
    } catch (err) {
        console.error('Erreur loadInbox:', err);
        box.innerHTML = "<p style='text-align:center; color:red;'>Erreur de chargement.</p>";
    }
}

// --- NOUVELLE FONCTION DE DIFFUSION (BROADCAST) ---
// Cette version utilise la même logique d'upload que executeSendPrivate pour garantir le remplissage de image_url.
async function executeBroadcast() {
    // 1. Récupération du message depuis l'éditeur de diffusion
    const content = getEditorContent('broadcast-msg');
    
    // Vérification de sécurité : message vide ?
    if(!content) return alert("Entrez un message !");

    // 2. Récupération de tous les membres (destinataires)
    // On récupère les IDs pour savoir à qui envoyer le message.
    const { data: allMembers, error: errMem } = await _supabase.from('profiles').select('id');
    
    // Si la base de données ne répond pas, on arrête tout.
    if(errMem) return alert("Erreur membres: " + errMem.message);
    if(!allMembers || allMembers.length === 0) return alert("Aucun membre trouvé.");
    
    // 3. Gestion du média (Image ou Vidéo)
    // On vérifie s'il y a un média déjà pré-chargé via handleBroadcastMedia ou un fichier sélectionné dans les inputs HTML.
    let mediaUrl = window.templateMediaUrl || null;
    const fileInput = document.getElementById('bc-photo-input');
    const videoInput = document.getElementById('bc-video-input');
    const file = fileInput.files[0] || videoInput.files[0];
    
    // Si on a un fichier physique mais pas encore d'URL Cloudinary, on lance l'upload.
    if(!mediaUrl && file) {
        try {
            // Logique identique à executeSendPrivate pour la vidéo
            if(file.type.startsWith('video/')) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', "video_preset");
                
                const response = await fetch(`https://api.cloudinary.com/v1_1/dn3vf0mhm/video/upload`, {
                    method: 'POST', body: formData
                });
                const data = await response.json();
                
                if(data.secure_url) {
                    mediaUrl = data.secure_url; // L'URL finale pour la table inbox
                } else {
                    throw new Error("URL vidéo manquante");
                }
            } else {
                // Logique identique à executeSendPrivate pour l'image
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', "chat_preset");
                
                const response = await fetch(`https://api.cloudinary.com/v1_1/dtkssnhub/image/upload`, {
                    method: 'POST', body: formData
                });
                const data = await response.json();
                
                // Optimisation du média si l'upload a réussi
                if(data.secure_url) {
                    mediaUrl = data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
                }
            }
        } catch (err) { 
            console.error("Erreur Upload Cloudinary:", err); 
            return alert("Erreur lors de l'envoi du fichier."); 
        }
    }

    // 4. Préparation de l'envoi groupé
    // On transforme notre liste de membres en un tableau d'objets conformes à ta table 'inbox' (vue en capture d'écran).
    const processedContent = content;
    const timeFormatted = new Date().toLocaleString('fr-FR', {
        day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
    });

    const messages = allMembers.map(member => ({
        from_id: currentUser.id,
        to_id: member.id,
        content: processedContent,
        sender_phone: currentProfile.phone, // Utilise ton numéro admin
        image_url: mediaUrl,               // L'URL qu'on vient de récupérer de Cloudinary
        time: timeFormatted,
        is_read: false                     // Valeur par défaut pour la nouvelle colonne
    }));

    // 5. Insertion massive dans Supabase
    // On envoie tout le tableau d'un coup pour être efficace.
    const { error } = await _supabase.from('inbox').insert(messages);

    if(error) {
        alert("Erreur diffusion : " + error.message);
    } else {
        alert("Message diffusé avec succès à tous les membres !");
        
        // 6. Nettoyage complet de l'interface
        clearEditor('broadcast-msg');
        document.getElementById('bc-photo-input').value = "";
        document.getElementById('bc-video-input').value = "";
        window.templateMediaUrl = null; 
        
        // Retour à l'accueil ou page précédente
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
function autoResize(el) { 
    // Réinitialiser la hauteur pour mesurer correctement
    el.style.height = 'auto'; 
    
    // Obtenir le contenu textuel pour mesurer
    const textContent = el.textContent || el.innerText || '';
    
    // Si le contenu est vide ou très court, revenir à la hauteur minimale
    if (textContent.trim().length === 0 || textContent.trim().length < 20) {
        el.style.height = '20px';
    } else {
        // Sinon, ajuster la hauteur selon le contenu
        el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    }
}

// Fonction pour mettre à jour le compteur de caractères (optionnel)
function updateCharCount() {
    // Pas nécessaire pour l'instant mais peut être utile
}
function togglePass(id, icon) {
    const f = document.getElementById(id); f.type = (f.type === "password") ? "text" : "password";
    icon.innerText = (f.type === "password") ? "👁️" : "🔒";
}
function cancelReply() { 
    replyToId = null; 
    const replyPreview = document.getElementById('reply-preview');
    replyPreview.style.display = 'none';
    // Réinitialiser les styles
    replyPreview.style.position = '';
    replyPreview.style.bottom = '';
    replyPreview.style.left = '';
    replyPreview.style.right = '';
    replyPreview.style.background = '';
    replyPreview.style.border = '';
    replyPreview.style.borderRadius = '';
    replyPreview.style.padding = '';
    replyPreview.style.boxShadow = '';
    replyPreview.style.zIndex = '';
}
async function handleLogout() { await _supabase.auth.signOut(); location.reload(); }

// --- FONCTIONS D'ÉDITEUR SIMPLIFIÉES ---

// Fonction pour obtenir le contenu texte de l'éditeur
function getEditorContent(targetId) {
    const editor = document.getElementById(targetId);
    if (!editor) return '';
    
    // Récupérer le HTML et convertir les balises de saut en \n
    let html = editor.innerHTML;
    let text = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')   // Supprimer les autres balises
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    
    // Nettoyer les sauts de ligne excessifs
    return text.replace(/\n{3,}/g, '\n\n').trim();
}

// Fonction pour définir le contenu de l'éditeur
function setEditorContent(targetId, content) {
    const editor = document.getElementById(targetId);
    if (!editor) return;
    
    // Convertir les retours à la ligne en <br> pour le contenteditable
    let html = (content || '').replace(/\n/g, '<br>');
    editor.innerHTML = html;
}

// Fonction pour vider l'éditeur
function clearEditor(targetId) {
    const editor = document.getElementById(targetId);
    if (!editor) return;
    editor.innerHTML = '';
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
    if (!currentProfile || (!currentProfile.is_admin && !ADMINS_PHONES.includes(currentProfile.phone))) {
        alert("Fonction réservée aux administrateurs");
        return;
    }
    
    // Décoder le contenu s'il a été encodé
    let decodedContent = content;
    try {
        decodedContent = decodeURIComponent(content);
    } catch (e) {
        // Si le décodage échoue, utiliser le contenu original
        decodedContent = content;
    }
    
    // Stocker le message à partager
    window.messageToShare = {
        id: messageId,
        sender: senderPhone,
        content: decodedContent,
        image: imageUrl
    };
    
    // Afficher le dialogue de partage
    showShareDialog();
}

function shareMessageInbox(messageId, senderPhone, content, imageUrl) {
    // Décoder le contenu s'il a été encodé
    const decodedContent = decodeURIComponent(content);
    shareMessage(messageId, senderPhone, decodedContent, imageUrl);
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
        ${window.messageToShare.image ? `<img src="${window.messageToShare.image}" style="max-width: 50px; border-radius: 5px;">` : ''}
        <h4>Choisir le destinataire:</h4>
        <input type="text" id="share-search" placeholder="🔍 Rechercher un membre..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 10px;" oninput="filterShareMembers()">
        <div id="share-members-list" style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
            <div style="text-align: center; padding: 20px;">
                <div style="background: #25D366; color: white; padding: 5px 15px; border-radius: 8px; margin-bottom: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="shareToGroup()">
                    <div style="font-size: 16px; margin-right: 8px;">👥</div>
                    <div style="font-weight: bold; font-size: 12px;">Partager dans le groupe</div>
                </div>
                <p style="color: #666; margin: 15px 0;">OU</p>
                <p style="color: #666;">Chargement des membres...</p>
            </div>
        </div>
        <div style="margin-top: 15px; text-align: right;">
            <button onclick="this.closest('.modal-share').remove()" style="background: #ccc; border: none; padding: 8px 15px; border-radius: 5px; margin-right: 10px;">Annuler</button>
        </div>
    `;
    
    modal.className = 'modal-share';
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    
    // Charger la liste des membres
    loadMembersForShare();
    
    // Fermer en cliquant à l'extérieur
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function loadMembersForShare() {
    try {
        const { data, error } = await _supabase
            .from('profiles')
            .select('id, phone, is_admin')
            .neq('id', currentUser.id);
        
        if (error) throw error;
        
        const list = document.getElementById('share-members-list');
        if (!list) return;
        
        // Garder l'option de partage dans le groupe
        const groupOption = list.querySelector('div').innerHTML;
        
        list.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <div style="background: #25D366; color: white; padding: 15px; border-radius: 8px; margin-bottom: 10px; cursor: pointer;" onclick="shareToGroup()">
                    <div style="font-size: 24px; margin-bottom: 5px;">👥</div>
                    <div style="font-weight: bold;">Partager dans le groupe</div>
                    <div style="font-size: 12px; opacity: 0.8;">Tous les membres verront ce message</div>
                </div>
                <p style="color: #666; margin: 15px 0;">OU</p>
                <p style="color: #666; font-weight: bold;">Partager à un membre spécifique:</p>
            </div>
        `;
        
        // Trier : administrateurs en premier, puis les autres
        const sortedData = data.sort((a, b) => {
            const aIsAdmin = a.is_admin || ADMINS_PHONES.includes(a.phone);
            const bIsAdmin = b.is_admin || ADMINS_PHONES.includes(b.phone);
            
            if (aIsAdmin && !bIsAdmin) return -1;
            if (!aIsAdmin && bIsAdmin) return 1;
            return 0;
        });
        
        sortedData.forEach(member => {
            const memberDiv = document.createElement('div');
            memberDiv.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px;
                border-bottom: 1px solid #eee;
                cursor: pointer;
                transition: background-color 0.2s;
            `;
            
            memberDiv.onmouseover = () => memberDiv.style.backgroundColor = '#f5f5f5';
            memberDiv.onmouseout = () => memberDiv.style.backgroundColor = '';
            
            memberDiv.innerHTML = `
                <span style="font-weight: 500;">${member.phone}${member.is_admin ? ' ⭐' : ''}</span>
                <button onclick="shareToInbox('${member.id}', '${member.phone}')" style="background: #075E54; color: white; border: none; padding: 6px 12px; border-radius: 5px; font-size: 12px;">Partager</button>
            `;
            
            list.appendChild(memberDiv);
        });
        
    } catch (err) {
        console.error('Erreur chargement membres pour partage:', err);
        const list = document.getElementById('share-members-list');
        if (list) list.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">Erreur de chargement</p>';
    }
}

async function shareToGroup() {
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

function filterTemplates() {
    const searchTerm = document.getElementById('templates-search').value.toLowerCase();
    const templates = document.querySelectorAll('#templates-list > div');
    
    templates.forEach(template => {
        const text = template.textContent.toLowerCase();
        template.style.display = text.includes(searchTerm) ? 'block' : 'none';
    });
}

function filterShareMembers() {
    const searchTerm = document.getElementById('share-search').value.toLowerCase();
    const members = document.querySelectorAll('#share-members-list > div');
    
    members.forEach(member => {
        // Ne pas cacher le premier élément (option de partage groupe)
        if (member.querySelector('[onclick="shareToGroup()"]')) {
            return;
        }
        const text = member.textContent.toLowerCase();
        member.style.display = text.includes(searchTerm) ? 'flex' : 'none';
    });
}

function filterTemplateShareMembers() {
    const searchTerm = document.getElementById('template-share-search').value.toLowerCase();
    const members = document.querySelectorAll('#template-share-members-list > div');
    
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
    
    // 2. Gérer le formatage markdown (conservé pour compatibilité)
    // Gras : **texte** -> <b>texte</b>
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    
    // Italique : *texte* -> <i>texte</i>
    processed = processed.replace(/\*(.*?)\*/g, '<i>$1</i>');
    
    // Soulignement : __texte__ -> <u>texte</u>
    processed = processed.replace(/__(.*?)__/g, '<u>$1</u>');
    
    // 3. Gérer les couleurs : <span style="color:blue">texte</span> -> <span style="color:blue">texte</span>
    processed = processed.replace(/<span style="color:(.*?)">(.*?)<\/span>/g, '<span style="color:$1">$2</span>');
    
    // 4. Détecter et traiter les médias AVANT les URLs régulières
    // Images
    processed = processed.replace(/(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)[^\s]*)/g, 
        '<img src="$1" style="max-width:100%; border-radius:8px; display:block; margin-top:5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" alt="Image partagée" loading="lazy">');
    
    // Vidéos (sans autoplay, avec contrôles et preload)
    processed = processed.replace(/(https?:\/\/[^\s]+\.(mp4|mov)[^\s]*)/g, 
        '<video controls preload="metadata" style="max-width:100%; border-radius:8px; margin-top:5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" playsinline><source src="$1" type="video/mp4">Votre navigateur ne supporte pas la lecture vidéo.</video>');
    
    // Fichiers Cloudinary (vidéos et autres)
    processed = processed.replace(/(https?:\/\/res\.cloudinary\.com\/[^\s]*\.(mp4|mov)[^\s]*)/g, 
        '<video controls preload="metadata" style="max-width:100%; border-radius:8px; margin-top:5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" playsinline><source src="$1" type="video/mp4">Votre navigateur ne supporte pas la lecture vidéo.</video>');
    
    // Autres fichiers Cloudinary (images, documents)
    processed = processed.replace(/(https?:\/\/res\.cloudinary\.com\/[^\s]*(?!\.(mp4|mov)$)[^\s]*)/g, 
        function(match) {
            // Vérifier si c'est une image
            if (match.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                return `<img src="${match}" style="max-width:100%; border-radius:8px; display:block; margin-top:5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" alt="Image Cloudinary" loading="lazy">`;
            } else {
                return `<a href="${match}" target="_blank" style="display:inline-block; background:#f0f0f0; padding:8px; border-radius:5px; text-decoration:none; color:#075E54; font-weight:bold; margin-top:5px;">📥 Télécharger le fichier joint</a>`;
            }
        });
    
    // 5. Rendre les URLs cliquables (seulement celles qui ne sont pas des médias)
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    processed = processed.replace(urlRegex, function(url) {
        // Vérifier si c'est une URL de média déjà traitée
        if (url.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|zip|exe|pdf)$/i) || url.includes('cloudinary.com')) {
            return url; // Déjà traité ci-dessus
        }
        return `<a href="${url}" target="_blank" style="color: #25D366; text-decoration: underline; word-break: break-all;">${url}</a>`;
    });
    
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

async function renderMsg(m) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `msg ${m.sender_id === currentUser.id ? 'me' : 'other'}`;
    
    // Ajouter les données du message pour le swipe
    div.dataset.messageId = m.id;
    div.dataset.senderPhone = m.sender_phone;
    div.dataset.content = m.content || '';
    div.dataset.imageUrl = m.image_url || '';

    // Utiliser la fonction de traitement du texte (gère déjà les médias)
    let contenuFinal = processMessageContent(m.content || '');

    // Ajouter l'image/vidéo depuis image_url si elle existe et n'est pas déjà dans le contenu
    if (m.image_url && !contenuFinal.includes(m.image_url)) {
        // Vérifier si c'est une vidéo (extension ou cloudinary)
        const isVideo = m.image_url.match(/\.(mp4|mov)$/i) || 
                       m.image_url.includes('cloudinary.com') && 
                       m.image_url.match(/\.(mp4|mov)$/i);
        
        if (isVideo) {
            contenuFinal += `<br><video controls preload="metadata" style="max-width:100%; border-radius:8px; margin-top:5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" playsinline><source src="${m.image_url}" type="video/mp4">Votre navigateur ne supporte pas la lecture vidéo.</video>`;
        } else {
            contenuFinal += `<br><img src="${m.image_url}" class="chat-img" style="max-width:100%; border-radius:8px; margin-top:5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" alt="Image partagée" loading="lazy">`;
        }
    }

    // Icônes pour les admins
    const currentUserIsAdmin = currentProfile && currentProfile.is_admin;
    const deleteIcon = currentUserIsAdmin ? `<span onclick="supprimerMessageGroupe('${m.id}', '${m.image_url || ''}', '${m.media_public_id || ''}')" style="cursor:pointer; color:red; margin-left:8px; font-size:12px;">🗑️</span>` : "";
    const contentEncoded = encodeURIComponent(m.content || '');
    const shareIcon = currentUserIsAdmin ? `<span onclick="shareMessage('${m.id}', '${m.sender_phone}', '${contentEncoded}', '${m.image_url || ''}')" style="cursor:pointer; color:blue; margin-left:8px; font-size:12px;">⤴️</span>` : "";

    // Ajouter l'aperçu de réponse si c'est une réponse
    let replyPreview = "";
    if (m.reply_to_id) {
        try {
            const { data: repliedMessage } = await _supabase
                .from('messages')
                .select('content, sender_phone, image_url')
                .eq('id', m.reply_to_id)
                .single();
            
            if (repliedMessage) {
                const repliedContent = (repliedMessage.content || '').substring(0, 50) + (repliedMessage.content && repliedMessage.content.length > 50 ? '...' : '');
                replyPreview = `
                    <div style="background: rgba(37, 211, 102, 0.1); border-left: 3px solid #25D366; padding: 5px 8px; margin: 5px 0; border-radius: 3px; font-size: 11px;">
                        <div style="font-weight: bold; color: #075E54;">En réponse à ${repliedMessage.sender_phone}:</div>
                        <div style="color: #666;">${repliedContent}</div>
                    </div>
                `;
            }
        } catch (err) {
            console.error('Erreur chargement message de réponse:', err);
        }
    }

    div.innerHTML = `<small><b>${m.sender_phone}</b>${deleteIcon}${shareIcon}</small>
                     ${replyPreview}
                     <div style="word-wrap: break-word;">${contenuFinal}</div>
                     <small style="font-size:10px; display:block; text-align:right; pointer-events: none; cursor: default;">${m.time}</small>`;
    
    // Ajouter les événements de swipe
    addSwipeToReply(div, m);
    
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function listenRealtime() {
    _supabase.channel('public:messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (p) => {
        await renderMsg(p.new);
    }).subscribe();
}

// --- FONCTION DE SWIPE POUR RÉPONDRE ---
function addSwipeToReply(element, message) {
    let touchStartX = 0;
    let touchEndX = 0;
    let isSwiping = false;
    let selectionStart = -1;
    let selectionEnd = -1;
    
    element.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        isSwiping = true;
        element.style.transition = 'transform 0.2s ease-out';
    }, { passive: true });
    
    element.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        
        const touchCurrentX = e.changedTouches[0].screenX;
        const diffX = touchCurrentX - touchStartX;
        
        // Limiter le déplacement pour l'effet visuel
        if (diffX > 0 && diffX < 100) {
            element.style.transform = `translateX(${diffX}px)`;
        }
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
            // Permettre de répondre à tous les messages, y compris les siens
            replyToMessage(message);
        }
    }, { passive: true });
    
    // Support pour la souris (desktop) - amélioré pour éviter les conflits avec la sélection
    let mouseStartX = 0;
    let isMouseDown = false;
    let hasMoved = false;
    
    element.addEventListener('mousedown', (e) => {
        // Vérifier si l'utilisateur a déjà une sélection de texte
        const selection = window.getSelection();
        if (selection.toString().length > 0) {
            return; // Ne pas intercepter si du texte est déjà sélectionné
        }
        
        mouseStartX = e.clientX;
        isMouseDown = true;
        hasMoved = false;
        element.style.transition = 'transform 0.2s ease-out';
        
        // Ne pas empêcher le comportement par défaut pour permettre la sélection
    });
    
    element.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        
        const diffX = e.clientX - mouseStartX;
        
        // Marquer que l'utilisateur a déplacé la souris
        if (Math.abs(diffX) > 5) {
            hasMoved = true;
        }
        
        // Vérifier si du texte est sélectionné
        const selection = window.getSelection();
        if (selection.toString().length > 0) {
            return; // Annuler le swipe si du texte est sélectionné
        }
        
        // Limiter le déplacement pour l'effet visuel (uniquement vers la droite)
        if (diffX > 0 && diffX < 100) {
            element.style.transform = `translateX(${diffX}px)`;
            element.style.cursor = 'grabbing';
        }
    });
    
    element.addEventListener('mouseup', (e) => {
        if (!isMouseDown) return;
        isMouseDown = false;
        element.style.cursor = '';
        
        // Vérifier si du texte est sélectionné
        const selection = window.getSelection();
        if (selection.toString().length > 0) {
            element.style.transform = ''; // Réinitialiser la position
            return; // Ne pas répondre si du texte est sélectionné
        }
        
        const diffX = e.clientX - mouseStartX;
        
        // Réinitialiser la position
        element.style.transform = '';
        
        // Si le swipe est suffisant vers la droite (au moins 80px pour être plus sûr)
        if (diffX > 80 && hasMoved) {
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
    
    // Limiter le texte de l'aperçu et traiter le formatage
    let previewText = message.content || '';
    if (previewText.length > 50) {
        previewText = previewText.substring(0, 50) + '...';
    }
    
    // Traiter le texte pour afficher le formatage (gras, italique, etc.)
    replyText.innerHTML = processMessageContent(previewText);
    
    replyPreview.style.display = 'flex';
    replyPreview.style.position = 'fixed';
    replyPreview.style.bottom = '80px'; // Juste au-dessus de la zone de saisie
    replyPreview.style.left = '10px';
    replyPreview.style.right = '10px';
    replyPreview.style.background = 'rgba(255, 255, 255, 0.95)';
    replyPreview.style.border = '1px solid #ddd';
    replyPreview.style.borderRadius = '8px';
    replyPreview.style.padding = '10px';
    replyPreview.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    replyPreview.style.zIndex = '1000';
    
    // Focus sur le champ de saisie
    document.getElementById('msgInput').focus();
    
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
    if (!list) return;
    list.innerHTML = '<div style="text-align:center; padding:20px;">⏳ Chargement des modèles...</div>';
    
    try {
        // Vérifier si la table existe et est accessible
        const { data: testData, error: testError } = await _supabase
            .from('message_templates')
            .select('id')
            .limit(1);
            
        if (testError) {
            console.error('Erreur accès table message_templates:', testError);
            list.innerHTML = '<div style="text-align:center; padding:20px; color:red;">Erreur: La table message_templates n\'est pas accessible. Vérifiez que vous avez bien exécuté le script SQL.</div>';
            return;
        }
        
        const { data, error } = await _supabase
            .from('message_templates')
            .select('*')
            .eq('created_by', currentUser.id)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
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
            
            // Afficher le média (image ou vidéo)
            let mediaDisplay = '';
            if (template.image_url) {
                if (template.media_type === 'video') {
                    mediaDisplay = `<video src="${template.image_url}" style="max-width: 100px; border-radius: 5px; margin-bottom: 10px;" controls></video>`;
                } else {
                    mediaDisplay = `<img src="${template.image_url}" style="max-width: 100px; border-radius: 5px; margin-bottom: 10px;">`;
                }
            }
            
            templateDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <h4 style="margin: 0; color: #25D366;">${template.title}</h4>
                    <div>
                        <button onclick="editTemplate('${template.id}')" style="background: #007bff; color: white; border: none; padding: 4px 8px; border-radius: 3px; margin-right: 5px; font-size: 12px;">✏️</button>
                        <button onclick="deleteTemplate('${template.id}')" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 3px; font-size: 12px;">🗑️</button>
                    </div>
                </div>
                <div style="color: #666; font-size: 14px; margin-bottom: 10px; line-height: 1.4;">${preview}</div>
                ${mediaDisplay}
                <div style="display: flex; gap: 10px;">
                    <button onclick="showTemplateShareDialog('${template.id}')" style="background: #ffc107; color: black; border: none; padding: 6px 12px; border-radius: 5px; font-size: 12px;">Partager</button>
                </div>
            `;
            
            list.appendChild(templateDiv);
        });
        
    } catch (err) {
        console.error('Erreur chargement modèles:', err);
        list.innerHTML = '<div style="text-align:center; padding:20px; color:red;">Erreur de chargement: ' + err.message + '</div>';
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
        <div style="margin-bottom: 10px;">
            <label for="template-video" style="display: block; margin-bottom: 5px;">Vidéo (optionnel):</label>
            <input type="file" id="template-video" accept="video/*" style="width: 100%;">
            <div id="template-video-preview" style="margin-top: 10px;"></div>
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
    
    // Prévisualisation de la vidéo
    document.getElementById('template-video').addEventListener('change', (e) => {
        const file = e.target.files[0];
        const preview = document.getElementById('template-video-preview');
        
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `<video src="${e.target.result}" style="max-width: 200px; border-radius: 5px;" controls></video>`;
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
    const videoFile = document.getElementById('template-video').files[0];
    
    if (!title || !content) {
        alert('Veuillez remplir le titre et le contenu');
        return;
    }
    
    if (imageFile && videoFile) {
        alert('Veuillez choisir soit une image soit une vidéo, pas les deux');
        return;
    }
    
    try {
        let mediaUrl = null;
        
        if (imageFile) {
            const formData = new FormData();
            formData.append('file', imageFile);
            formData.append('upload_preset', "chat_preset");
            const response = await fetch(`https://api.cloudinary.com/v1_1/dtkssnhub/image/upload`, {
                method: 'POST', body: formData
            });
            const data = await response.json();
            if (data.secure_url) mediaUrl = data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
        } else if (videoFile) {
            console.log('Upload vidéo template détecté:', videoFile.name, videoFile.type);
            const formData = new FormData();
            formData.append('file', videoFile);
            formData.append('upload_preset', "video_preset");
            console.log('Envoi vers dn3vf0mhm/video/upload avec preset video_preset');
            const response = await fetch(`https://api.cloudinary.com/v1_1/dn3vf0mhm/video/upload`, {
                method: 'POST', body: formData
            });
            const data = await response.json();
            if(data.secure_url) mediaUrl = data.secure_url;
            else throw new Error("URL vidéo manquante");
        }
        
        const { error } = await _supabase.from('message_templates').insert([{
            title: title,
            content: content,
            image_url: mediaUrl,
            media_type: videoFile ? 'video' : 'image',
            created_by: currentUser.id,
            created_at: new Date().toISOString()
        }]);
        
        if (error) throw error;
        
        alert('Modèle créé avec succès!');
        document.querySelector('.modal-template').remove();
        loadMessageTemplates();
        
    } catch (err) {
        console.error('Erreur création modèle:', err);
        alert('Erreur lors de la création: ' + err.message);
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
        
        // Remplir le champ de saisie du groupe avec le contenu
        setEditorContent('msgInput', data.content);
        
        // Stocker l'URL du média pour l'utiliser lors de l'envoi
        window.templateMediaUrl = data.image_url;
        
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
        const { data, error: templateError } = await _supabase
            .from('message_templates')
            .select('*')
            .eq('id', templateId)
            .single();
        
        if (templateError) throw templateError;
        
        // Remplir le champ de diffusion avec le contenu
        setEditorContent('broadcast-msg', data.content);
        
        // Stocker l'URL du média pour l'utiliser lors de l'envoi
        window.templateMediaUrl = data.image_url;
        
        // Retourner à la page de diffusion
        goBack();
        
        // Focus sur le champ de saisie
        document.getElementById('broadcast-msg').focus();
        
    } catch (err) {
        console.error('Erreur utilisation modèle diffusion:', err);
        alert('Erreur lors du chargement du modèle');
    }
}

async function useTemplateInInbox(templateId, destId, destPhone) {
    try {
        const { data, error: templateError } = await _supabase
            .from('message_templates')
            .select('*')
            .eq('id', templateId)
            .single();
        
        if (templateError) throw templateError;
        
        // Remplir le champ de message privé avec le contenu
        setEditorContent('edit-msg', data.content);
        
        // Stocker l'URL du média pour l'utiliser lors de l'envoi
        window.templateMediaUrl = data.image_url;
        
        // Configurer la destination
        document.getElementById('dest-display').innerText = destPhone;
        window.currentDestId = destId;
        
        // Retourner à la page d'édition
        goBack();
        
        // Focus sur le champ de saisie
        document.getElementById('edit-msg').focus();
        
    } catch (err) {
        console.error('Erreur utilisation modèle inbox:', err);
        alert('Erreur lors du chargement du modèle');
    }
}

async function editTemplate(templateId) {
    try {
        const { data, error } = await _supabase
            .from('message_templates')
            .select('*')
            .eq('id', templateId)
            .single();
        
        if (error) throw error;
        
        // Créer le dialogue d'édition
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
            <h3 style="margin-top: 0; color: #25D366;">Modifier le modèle</h3>
            <input type="text" id="edit-template-title" value="${data.title}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 10px;">
            <textarea id="edit-template-content" style="width: 100%; height: 150px; padding: 10px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 10px; resize: vertical;">${data.content}</textarea>
            <div style="text-align: right;">
                <button onclick="this.closest('.modal-template').remove()" style="background: #ccc; border: none; padding: 8px 15px; border-radius: 5px; margin-right: 10px;">Annuler</button>
                <button onclick="updateTemplate('${templateId}')" style="background: #25D366; color: white; border: none; padding: 8px 15px; border-radius: 5px;">Enregistrer</button>
            </div>
        `;
        
        modal.className = 'modal-template';
        modal.appendChild(dialog);
        document.body.appendChild(modal);
        
        // Fermer en cliquant à l'extérieur
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
    } catch (err) {
        console.error('Erreur édition modèle:', err);
        alert('Erreur lors du chargement du modèle');
    }
}

async function updateTemplate(templateId) {
    const title = document.getElementById('edit-template-title').value.trim();
    const content = document.getElementById('edit-template-content').value.trim();
    
    if (!title || !content) {
        alert('Veuillez remplir le titre et le contenu');
        return;
    }
    
    try {
        const { error } = await _supabase
            .from('message_templates')
            .update({
                title: title,
                content: content,
                updated_at: new Date().toISOString()
            })
            .eq('id', templateId);
        
        if (error) throw error;
        
        alert('Modèle mis à jour avec succès!');
        document.querySelector('.modal-template').remove();
        loadMessageTemplates();
        
    } catch (err) {
        console.error('Erreur mise à jour modèle:', err);
        alert('Erreur lors de la mise à jour: ' + err.message);
    }
}

async function showTemplateShareDialog(templateId) {
    try {
        const { data, error } = await _supabase
            .from('message_templates')
            .select('*')
            .eq('id', templateId)
            .single();
        
        if (error) throw error;
        
        // Créer une fenêtre de partage spécifique pour les modèles
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
        
        // Préparer le contenu avec média
        let mediaPreview = '';
        if (data.image_url) {
            if (data.image_url.match(/\.(mp4|mov)$/i)) {
                mediaPreview = `<video src="${data.image_url}" style="max-width: 100px; border-radius: 5px;" controls></video>`;
            } else {
                mediaPreview = `<img src="${data.image_url}" style="max-width: 100px; border-radius: 5px;" alt="Image du modèle">`;
            }
        }
        
        dialog.innerHTML = `
            <h3 style="margin-top: 0; color: #25D366;">Partager le modèle : ${data.title}</h3>
            <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 10px 0; max-height: 100px; overflow-y: auto;">
                ${data.content}
            </div>
            ${mediaPreview ? `<div style="margin: 10px 0;">${mediaPreview}</div>` : ''}
            <h4>Choisir la destination:</h4>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button onclick="shareTemplateToGroup('${templateId}')" style="background: #25D366; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">👥 Partager dans le groupe</button>
                <button onclick="shareTemplateToBroadcast('${templateId}')" style="background: #075E54; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">📢 Diffuser à tous</button>
                <button onclick="showTemplateMemberSelection('${templateId}')" style="background: #ffc107; color: black; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">👤 Partager à un membre</button>
            </div>
            <div style="margin-top: 15px; text-align: right;">
                <button onclick="this.closest('.modal-template-share').remove()" style="background: #ccc; border: none; padding: 8px 15px; border-radius: 5px; margin-right: 10px;">Annuler</button>
            </div>
        `;
        
        modal.className = 'modal-template-share';
        modal.appendChild(dialog);
        document.body.appendChild(modal);
        
        // Fermer en cliquant à l'extérieur
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
    } catch (err) {
        console.error('Erreur partage modèle:', err);
        alert('Erreur lors du partage du modèle');
    }
}

async function shareTemplateToGroup(templateId) {
    try {
        const { data, error } = await _supabase
            .from('message_templates')
            .select('*')
            .eq('id', templateId)
            .single();
        
        if (error) throw error;
        
        const messageData = {
            sender_id: currentUser.id,
            sender_phone: currentProfile.phone,
            content: `*✨: ${data.title}*\n\n${data.content}`,
            image_url: data.image_url,
            time: new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})
        };
        
        const { error: insertError } = await _supabase.from('messages').insert([messageData]);
        
        if (insertError) throw insertError;
        
        alert('Modèle partagé dans le groupe avec succès!');
        document.querySelector('.modal-template-share').remove();
        
    } catch (err) {
        console.error('Erreur partage modèle groupe:', err);
        alert('Erreur lors du partage dans le groupe');
    }
}

async function shareTemplateToBroadcast(templateId) {
    try {
        const { data, error } = await _supabase
            .from('message_templates')
            .select('*')
            .eq('id', templateId)
            .single();
        
        if (error) throw error;
        
        const { data: allMembers, error: errMem } = await _supabase.from('profiles').select('id');
        if(errMem) throw errMem;
        
        const messages = allMembers.map(member => ({
            from_id: currentUser.id,
            to_id: member.id,
            content: `*✨: ${data.title}*\n\n${data.content}`,
            sender_phone: currentProfile.phone,
            image_url: data.image_url,
            time: new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})
        }));

        const { error: broadcastError } = await _supabase.from('inbox').insert(messages);

        if(broadcastError) throw broadcastError;
        
        alert('Modèle diffusé avec succès à tous les membres!');
        document.querySelector('.modal-template-share').remove();
        
    } catch (err) {
        console.error('Erreur diffusion modèle:', err);
        alert('Erreur lors de la diffusion du modèle');
    }
}

async function showTemplateMemberSelection(templateId) {
    try {
        const { data: members, error } = await _supabase
            .from('profiles')
            .select('id, phone, is_admin')
            .neq('id', currentUser.id);
        
        if (error) throw error;
        
        const modal = document.querySelector('.modal-template-share');
        const dialog = modal.querySelector('div');
        
        // Mettre à jour le dialogue pour la sélection des membres
        dialog.innerHTML = `
            <h3 style="margin-top: 0; color: #25D366;">Partager à un membre</h3>
            <input type="text" id="template-share-search" placeholder="🔍 Rechercher un membre..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 10px;" oninput="filterTemplateShareMembers()">
            <div id="template-share-members-list" style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
                ${members.map(member => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;" onmouseover="this.style.backgroundColor='#f5f5f5'" onmouseout="this.style.backgroundColor=''">
                        <span>${member.phone}${member.is_admin ? ' ⭐' : ''}</span>
                        <button onclick="shareTemplateToInbox('${templateId}', '${member.id}', '${member.phone}')" style="background: #075E54; color: white; border: none; padding: 6px 12px; border-radius: 5px; font-size: 12px;">Partager</button>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top: 15px; text-align: right;">
                <button onclick="this.closest('.modal-template-share').remove()" style="background: #ccc; border: none; padding: 8px 15px; border-radius: 5px; margin-right: 10px;">Annuler</button>
            </div>
        `;
        
    } catch (err) {
        console.error('Erreur sélection membres:', err);
        alert('Erreur lors du chargement des membres');
    }
}

async function shareTemplateToInbox(templateId, memberId, memberPhone) {
    try {
        const { data, error } = await _supabase
            .from('message_templates')
            .select('*')
            .eq('id', templateId)
            .single();
        
        if (error) throw error;
        
        const messageData = {
            from_id: currentUser.id,
            to_id: memberId,
            content: `*✨: ${data.title}*\n\n${data.content}`,
            sender_phone: currentProfile.phone,
            image_url: data.image_url,
            time: new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})
        };
        
        const { error: insertError } = await _supabase.from('inbox').insert([messageData]);
        
        if (insertError) throw insertError;
        
        alert(`Modèle partagé à ${memberPhone} avec succès!`);
        document.querySelector('.modal-template-share').remove();
        
    } catch (err) {
        console.error('Erreur partage modèle inbox:', err);
        alert('Erreur lors du partage en privé');
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

// Définition de la fonction de gestion des médias pour la diffusion (appelée dès qu'on choisit un fichier).
// Nouvelle version harmonisée pour la diffusion
async function handleBroadcastMedia(type) {
    // 1. Sélection de l'input selon le type (image ou vidéo)
    const inputId = type === 'image' ? 'bc-photo-input' : 'bc-video-input';
    const file = document.getElementById(inputId).files[0];
    if (!file) return;

    // 2. Préparation visuelle de la barre de progression
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    
    progressContainer.style.display = 'flex';
    progressBar.style.width = '0%';
    progressText.innerText = '0%';

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    // 3. Suivi de la progression de l'upload
    xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percent + '%';
            progressText.innerText = `Téléchargement : ${percent}%`;
        }
    });

    // 4. Une fois l'upload terminé sur Cloudinary
    xhr.addEventListener("load", async () => {
        progressContainer.style.display = 'none';
        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            if (data.secure_url) {
                // --- ACTION CRUCIALE ---
                // On stocke l'URL optimisée dans une variable globale que executeBroadcast pourra lire
                const optimizedUrl = type === 'image' ? 
                    data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/') : 
                    data.secure_url;
                window.templateMediaUrl = optimizedUrl;
                
                // Optionnel : On affiche un petit indicateur visuel ou on met l'URL dans le texte
                const broadcastInput = document.getElementById('broadcast-msg');
                broadcastInput.innerText += "\nFichier joint"; 
                
                console.log("Média prêt pour la diffusion :", window.templateMediaUrl);
            }
        } else {
            alert("Erreur lors du chargement du média.");
        }
    });

    // 5. Choix du compte Cloudinary (dtkssnhub pour images, dn3vf0mhm pour vidéos)
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

// Définition de la fonction asynchrone qui gère l'envoi de médias pour la messagerie privée (Inbox).
// Le paramètre 'type' permet de savoir si l'utilisateur envoie une photo ou une vidéo.
async function handleInboxMedia(type) {
    
    // Cette ligne utilise une condition "ternaire" pour choisir le bon ID HTML à cibler.
    // Si type est 'image', on prend l'ID de l'input photo, sinon on prend l'ID de l'input vidéo.
    const inputId = type === 'image' ? 'inbox-photo-input' : 'inbox-video-input';
    
    // On accède à l'élément HTML choisi et on récupère le premier fichier (index 0) de sa liste.
    // C'est le fichier que l'utilisateur vient de sélectionner sur son téléphone ou PC.
    const file = document.getElementById(inputId).files[0];
    
    // Sécurité : si l'utilisateur a ouvert le sélecteur de fichiers puis a cliqué sur "Annuler" 
    // sans rien choisir, 'file' sera vide. Dans ce cas, on arrête tout avec 'return'.
    if (!file) return;

    // --- PRÉPARATION DU VISUEL DE CHARGEMENT ---
    // On récupère les trois éléments qui composent ta barre de progression.
    // Le conteneur (la boîte), la barre (la partie colorée) et le texte (le chiffre %).
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    
    // Par défaut, ta barre de progression est cachée (display:none).
    // Cette ligne change le style pour la rendre visible à l'écran dès que l'upload commence.
    progressContainer.style.display = 'flex';

    // On crée un objet XMLHttpRequest (XHR). C'est l'outil "classique" en JavaScript pour 
    // envoyer des données vers un serveur web en arrière-plan sans recharger la page.
    const xhr = new XMLHttpRequest();
    
    // On crée un objet FormData. C'est comme un "enveloppe virtuelle" qui permet de 
    // transporter des fichiers binaires (images, vidéos) comme si c'était un formulaire papier.
    const formData = new FormData();
    
    // On place notre fichier physique à l'intérieur de l'enveloppe sous le nom 'file'.
    // C'est ce nom que Cloudinary attend pour traiter l'image.
    formData.append('file', file);

    // --- SURVEILLANCE DU TRANSFERT (PROGRESSION) ---
    // On ajoute un "écouteur" sur l'upload. Il va se déclencher plusieurs fois par seconde 
    // pendant que les octets du fichier montent vers internet.
    xhr.upload.addEventListener("progress", (e) => {
        // Vérifie si le navigateur est capable de calculer la taille totale (pour éviter les erreurs).
        if (e.lengthComputable) {
            // Calcul mathématique : (octets déjà envoyés / octets totaux du fichier) x 100.
            // On arrondit avec Math.round pour ne pas avoir de chiffres après la virgule.
            const percent = Math.round((e.loaded / e.total) * 100);
            
            // On ajuste la largeur CSS de la barre verte en fonction du pourcentage calculé.
            progressBar.style.width = percent + '%';
            
            // On met à jour le texte à l'intérieur de la barre pour rassurer l'utilisateur (ex: "85%").
            progressText.innerText = percent + '%';
        }
    });

    // --- RÉCEPTION DE LA RÉPONSE (FIN DE L'UPLOAD) ---
    // Cet écouteur se déclenche quand le serveur Cloudinary a fini de recevoir le fichier.
    xhr.addEventListener("load", async () => {
        // Le transfert est fini, on cache immédiatement la barre de progression.
        progressContainer.style.display = 'none';
        
        // Le code de statut "200" signifie que tout s'est passé parfaitement sur le serveur.
        if (xhr.status === 200) {
            // La réponse de Cloudinary est une longue chaîne de caractères.
            // On la transforme en objet JavaScript facile à lire avec JSON.parse.
            const data = JSON.parse(xhr.responseText);
            
            // Si l'objet 'data' contient bien une 'secure_url' (l'adresse web finale du fichier).
            if (data.secure_url) {
                // On récupère l'élément HTML de la zone de saisie du message (ton éditeur de texte).
                const input = document.getElementById('edit-msg');
                
                // On ajoute l'URL de l'image à la suite du texte déjà écrit.
                // (input.value ? ... : "") vérifie s'il y a déjà du texte pour savoir s'il faut 
                // ajouter un retour à la ligne (\n) avant l'URL pour que ce soit propre.
                input.value = (input.value ? input.value + "\n" : "") + data.secure_url;
                
                // Note pour Gis : À ce stade, l'URL est écrite dans le texte du message.
                // L'utilisateur doit encore cliquer sur "Envoyer" pour que ce soit enregistré en base de données.
            }
        }
    });

    // --- CONFIGURATION DE LA DESTINATION ---
    // On choisit vers quel compte Cloudinary envoyer le fichier.
    if (type === 'image') {
        // Si c'est une image : on ajoute le 'preset' des images et on vise ton premier compte.
        formData.append('upload_preset', "chat_preset");
        xhr.open("POST", `https://api.cloudinary.com/v1_1/dtkssnhub/image/upload`);
    } else {
        // Si c'est une vidéo ou un fichier (.zip, .exe, .pdf) : on ajoute le preset vidéo.
        formData.append('upload_preset', "video_preset");
        
        // On vérifie le type de fichier pour dire à Cloudinary si c'est "video" ou "raw" (brut).
        // C'est important car Cloudinary range les fichiers différemment selon ce type.
        const resourceType = file.type.startsWith('video/') ? "video" : "raw";
        xhr.open("POST", `https://api.cloudinary.com/v1_1/dn3vf0mhm/${resourceType}/upload`);
    }
    
    // Cette ligne est le "bouton de départ" : elle envoie réellement l'enveloppe (formData) vers Cloudinary.
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

// --- FONCTIONNALITÉS PARAMÈTRES ---

// Variable globale pour l'état de verrouillage du groupe (sera synchronisée avec Supabase)
let isGroupLocked = false;

// Fonction pour afficher/masquer les menus administrateurs selon le rôle
function gererAffichageAdmin(phone) {
    const isAdmin = ADMINS_PHONES.includes(phone);
    
    // Afficher/masquer tous les menus admin
    const settingsBtn = document.getElementById('settings-btn');
    const broadcastBtn = document.getElementById('broadcast-btn');
    const exportBtn = document.getElementById('export-btn');
    const templatesBtn = document.getElementById('templates-btn');
    
    if (isAdmin) {
        if (settingsBtn) settingsBtn.style.display = 'block';
        if (broadcastBtn) broadcastBtn.style.display = 'block';
        if (exportBtn) exportBtn.style.display = 'block';
        if (templatesBtn) templatesBtn.style.display = 'block';
    } else {
        if (settingsBtn) settingsBtn.style.display = 'none';
        if (broadcastBtn) broadcastBtn.style.display = 'none';
        if (exportBtn) exportBtn.style.display = 'none';
        if (templatesBtn) templatesBtn.style.display = 'none';
    }
}

// Fonction pour vérifier l'état de verrouillage depuis Supabase
async function checkGroupLockStatus() {
    try {
        // On utilise une table settings ou on stocke dans profiles
        const { data, error } = await _supabase
            .from('app_settings')
            .select('is_group_locked')
            .eq('id', 1)
            .single();
            
        if (error) {
            // Si la table n'existe pas encore, on la crée
            if (error.code === 'PGRST116') {
                await _supabase.from('app_settings').insert([{
                    id: 1,
                    is_group_locked: false
                }]);
                return false;
            }
            console.error('Erreur vérification verrouillage:', error);
            return false;
        }
        
        return data ? data.is_group_locked : false;
    } catch (err) {
        console.error('Erreur checkGroupLockStatus:', err);
        return false;
    }
}

// Fonction pour synchroniser l'interface avec l'état réel du serveur
async function syncLockButtonUI() {
    try {
        const realStatus = await checkGroupLockStatus();
        const btn = document.getElementById('lockGroupBtn');
        
        if (btn) {
            if (realStatus) {
                btn.innerHTML = "🔓 Déverrouiller le groupe";
                btn.style.background = "#dc3545";
            } else {
                btn.innerHTML = "🔒 Vérouiller le groupe";
                btn.style.background = "#25D366";
            }
        }
        
        // Synchroniser la variable globale
        isGroupLocked = realStatus;
        
    } catch (err) {
        console.error('Erreur synchronisation UI:', err);
    }
}

// Fonction pour basculer le verrouillage du groupe (sécurisée côté serveur)
async function toggleGroupLock() {
    // Vérifier si l'utilisateur est admin
    if (!currentProfile || !currentProfile.is_admin && !ADMINS_PHONES.includes(currentProfile.phone)) {
        alert("Seuls les administrateurs peuvent verrouiller le groupe.");
        return;
    }
    
    try {
        // Récupérer l'état actuel depuis Supabase (toujours depuis le serveur)
        const currentStatus = await checkGroupLockStatus();
        const newStatus = !currentStatus;
        
        if (newStatus) {
            if (!confirm("Voulez-vous vraiment verrouiller le groupe ? Les membres non-admins ne pourront plus envoyer de messages.")) {
                return;
            }
        } else {
            if (!confirm("Voulez-vous vraiment déverrouiller le groupe ?")) {
                return;
            }
        }
        
        // Mettre à jour dans Supabase
        const { error } = await _supabase
            .from('app_settings')
            .update({ is_group_locked: newStatus })
            .eq('id', 1);
            
        if (error) {
            alert("Erreur lors de la mise à jour: " + error.message);
            // Resynchroniser l'interface en cas d'erreur
            await syncLockButtonUI();
            return;
        }
        
        // Synchroniser l'interface avec le nouvel état
        await syncLockButtonUI();
        
        // Afficher le message de confirmation
        if (newStatus) {
            alert("Le groupe est maintenant verrouillé.");
        } else {
            alert("Le groupe est maintenant déverrouillé.");
        }
        
    } catch (err) {
        console.error('Erreur toggleGroupLock:', err);
        alert("Erreur lors du changement de statut du groupe.");
        // Resynchroniser l'interface en cas d'erreur
        await syncLockButtonUI();
    }
}

// Fonction pour afficher le popup de groupe verrouillé
function showLockPopup() {
    document.getElementById('lockPopup').style.display = 'flex';
}

// Fonction pour fermer le popup de groupe verrouillé
function closeLockPopup() {
    document.getElementById('lockPopup').style.display = 'none';
}

// Fonctions pour changer les arrière-plans
function changeGroupBackground() {
    document.getElementById('group-bg-input').click();
}

function changeInboxBackground() {
    document.getElementById('inbox-bg-input').click();
}

function changeMembersBackground() {
    document.getElementById('members-bg-input').click();
}

// Fonctions pour gérer le changement d'arrière-plan
function handleGroupBackgroundChange() {
    const file = document.getElementById('group-bg-input').files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const chatBox = document.getElementById('chat-box');
            chatBox.style.backgroundImage = `url(${e.target.result})`;
            chatBox.style.backgroundSize = 'cover';
            chatBox.style.backgroundPosition = 'center';
            chatBox.style.backgroundRepeat = 'no-repeat';
            
            // Sauvegarder dans localStorage
            localStorage.setItem('groupBackground', e.target.result);
            
            alert("Arrière-plan du groupe changé avec succès !");
        };
        reader.readAsDataURL(file);
    }
}

function handleInboxBackgroundChange() {
    const file = document.getElementById('inbox-bg-input').files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const inboxList = document.getElementById('inbox-list');
            inboxList.style.backgroundImage = `url(${e.target.result})`;
            inboxList.style.backgroundSize = 'cover';
            inboxList.style.backgroundPosition = 'center';
            inboxList.style.backgroundRepeat = 'no-repeat';
            
            // Sauvegarder dans localStorage
            localStorage.setItem('inboxBackground', e.target.result);
            
            alert("Arrière-plan de la page inbox changé avec succès !");
        };
        reader.readAsDataURL(file);
    }
}

function handleMembersBackgroundChange() {
    const file = document.getElementById('members-bg-input').files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const membersList = document.getElementById('members-list');
            membersList.style.backgroundImage = `url(${e.target.result})`;
            membersList.style.backgroundSize = 'cover';
            membersList.style.backgroundPosition = 'center';
            membersList.style.backgroundRepeat = 'no-repeat';
            
            // Sauvegarder dans localStorage
            localStorage.setItem('membersBackground', e.target.result);
            
            alert("Arrière-plan de la page liste des membres changé avec succès !");
        };
        reader.readAsDataURL(file);
    }
}

// Fonction pour restaurer les arrière-plans et synchroniser le verrouillage au chargement
async function restoreBackgrounds() {
    // Restaurer l'arrière-plan du groupe
    const groupBg = localStorage.getItem('groupBackground');
    if (groupBg) {
        const chatBox = document.getElementById('chat-box');
        if (chatBox) {
            chatBox.style.backgroundImage = `url(${groupBg})`;
            chatBox.style.backgroundSize = 'cover';
            chatBox.style.backgroundPosition = 'center';
            chatBox.style.backgroundRepeat = 'no-repeat';
        }
    }
    
    // Restaurer l'arrière-plan de l'inbox
    const inboxBg = localStorage.getItem('inboxBackground');
    if (inboxBg) {
        const inboxList = document.getElementById('inbox-list');
        if (inboxList) {
            inboxList.style.backgroundImage = `url(${inboxBg})`;
            inboxList.style.backgroundSize = 'cover';
            inboxList.style.backgroundPosition = 'center';
            inboxList.style.backgroundRepeat = 'no-repeat';
        }
    }
    
    // Restaurer l'arrière-plan des membres
    const membersBg = localStorage.getItem('membersBackground');
    if (membersBg) {
        const membersList = document.getElementById('members-list');
        if (membersList) {
            membersList.style.backgroundImage = `url(${membersBg})`;
            membersList.style.backgroundSize = 'cover';
            membersList.style.backgroundPosition = 'center';
            membersList.style.backgroundRepeat = 'no-repeat';
        }
    }
    
    // Synchroniser l'état de verrouillage du groupe depuis Supabase (sécurisé)
    await syncLockButtonUI();
}

// Fonction pour synchroniser périodiquement l'état du verrouillage (toutes les 30 secondes)
function startPeriodicSync() {
    setInterval(async () => {
        try {
            await syncLockButtonUI();
            console.log('🔄 Synchronisation périodique du verrouillage effectuée');
        } catch (err) {
            console.error('Erreur synchronisation périodique:', err);
        }
    }, 30000); // 30 secondes
}

// Modifier la fonction handleSend pour vérifier le verrouillage côté serveur
const originalHandleSend = handleSend;
handleSend = async function() {
    // Vérifier si l'utilisateur est admin
    const isAdmin = currentProfile && (currentProfile.is_admin || ADMINS_PHONES.includes(currentProfile.phone));
    
    // Si ce n'est pas un admin, vérifier le verrouillage côté serveur
    if (!isAdmin) {
        try {
            const isLocked = await checkGroupLockStatus();
            if (isLocked) {
                showLockPopup();
                return;
            }
        } catch (err) {
            console.error('Erreur vérification verrouillage:', err);
            // En cas d'erreur, on bloque par sécurité
            showLockPopup();
            return;
        }
    }
    
    // Appeler la fonction originale
    return originalHandleSend.apply(this, arguments);
};

// Modifier la fonction handleFileSelect pour vérifier le verrouillage côté serveur
const originalHandleFileSelect = handleFileSelect;
handleFileSelect = async function() {
    // Vérifier si l'utilisateur est admin
    const isAdmin = currentProfile && (currentProfile.is_admin || ADMINS_PHONES.includes(currentProfile.phone));
    
    // Si ce n'est pas un admin, vérifier le verrouillage côté serveur
    if (!isAdmin) {
        try {
            const isLocked = await checkGroupLockStatus();
            if (isLocked) {
                showLockPopup();
                return;
            }
        } catch (err) {
            console.error('Erreur vérification verrouillage:', err);
            // En cas d'erreur, on bloque par sécurité
            showLockPopup();
            return;
        }
    }
    
    // Appeler la fonction originale
    return originalHandleFileSelect.apply(this, arguments);
};

// 3. LE DÉCLENCHEUR AUTOMATIQUE (À mettre tout en bas du fichier)
// C'est cette ligne qui empêche le retour forcé au login lors d'un rafraîchissement !
window.onload = function() {
    console.log('=== DIAGNOSTIC DE CHARGEMENT ===');
    console.log('togglePass disponible:', typeof togglePass);
    console.log('toggleAuthMode disponible:', typeof toggleAuthMode);
    console.log('handleLoginAction disponible:', typeof handleLoginAction);
    console.log('handleRegisterAction disponible:', typeof handleRegisterAction);
    console.log('=== FIN DIAGNOSTIC ===');
    
    checkSession();
    
    // Restaurer les arrière-plans après le chargement
    setTimeout(restoreBackgrounds, 1000);
    
    // Démarrer la synchronisation périodique pour éviter les conflits client/serveur
    setTimeout(startPeriodicSync, 2000);
};
