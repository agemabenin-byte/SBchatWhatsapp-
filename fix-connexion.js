// Script de correction pour les fonctions de connexion
// À ajouter dans le HTML après le script.js principal

// Assurer que les fonctions de connexion sont disponibles globalement
window.togglePass = function(id, icon) {
    console.log('togglePass appelé');
    const f = document.getElementById(id);
    if (f) {
        f.type = (f.type === "password") ? "text" : "password";
        if (icon) {
            icon.innerText = (f.type === "password") ? "👁️" : "🔒";
        }
    }
};

window.toggleAuthMode = function(isRegister) {
    console.log('toggleAuthMode appelé avec:', isRegister);
    const loginFields = document.getElementById('login-fields');
    const registerFields = document.getElementById('register-fields');
    const authTitle = document.getElementById('auth-title');
    
    if (loginFields) loginFields.style.display = isRegister ? 'none' : 'block';
    if (registerFields) registerFields.style.display = isRegister ? 'block' : 'none';
    if (authTitle) authTitle.innerText = isRegister ? 'S\'inscrire' : 'Connexion';
};

window.handleLoginAction = async function() {
    console.log('handleLoginAction appelé');
    
    // Vérifier si supabase est disponible
    if (typeof supabase === 'undefined') {
        alert('Erreur: Supabase non chargé');
        return;
    }
    
    let input = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    if(!input || !password) {
        alert("Veuillez remplir tous les champs !");
        return;
    }

    let loginEmail = input;

    // Si c'est un numéro, on récupère le mail pour Supabase
    if (!input.includes("@")) {
        try {
            const { data } = await _supabase
                .from('profiles')
                .select('email')
                .eq('phone', input)
                .single();
            
            if (!data) {
                alert("Numéro inconnu.");
                return;
            }
            loginEmail = data.email;
        } catch (err) {
            console.error('Erreur recherche profil:', err);
            alert("Erreur lors de la recherche du numéro");
            return;
        }
    }

    try {
        const { error } = await _supabase.auth.signInWithPassword({ 
            email: loginEmail, 
            password: password 
        });

        if (error) {
            alert("Connexion échouée : " + error.message);
            return;
        }
        
        // Connexion réussie
        console.log('Connexion réussie');
        if (typeof checkSession === 'function') {
            checkSession();
        }
        
    } catch (err) {
        console.error('Erreur connexion:', err);
        alert("Erreur lors de la connexion");
    }
};

window.handleRegisterAction = async function() {
    console.log('handleRegisterAction appelé');
    
    const phone = document.getElementById('auth-phone').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    
    if (!phone || !email || !password) {
        alert("Veuillez remplir tous les champs !");
        return;
    }
    
    try {
        const { data, error } = await _supabase.auth.signUp({ 
            email, 
            password, 
            options: { data: { phone: phone } } 
        });
        
        if (error) {
            alert(error.message);
            return;
        }
        
        if(data.user) {
            await _supabase.from('profiles').insert([{ 
                id: data.user.id, 
                phone: phone, 
                email: email 
            }]);
            alert("Vérifiez vos emails !");
            toggleAuthMode(false); 
        }
        
    } catch (err) {
        console.error('Erreur inscription:', err);
        alert("Erreur lors de l'inscription");
    }
};

console.log('Script de correction de connexion chargé');
