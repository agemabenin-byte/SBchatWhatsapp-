// Test des fonctions de connexion
console.log('Chargement du script de test...');

// Fonctions de connexion de base
function togglePass(id, icon) {
    console.log('togglePass appelé avec:', id, icon);
    const f = document.getElementById(id);
    if (f) {
        f.type = (f.type === "password") ? "text" : "password";
        icon.innerText = (f.type === "password") ? "👁️" : "🔒";
    }
}

function toggleAuthMode(isRegister) {
    console.log('toggleAuthMode appelé avec:', isRegister);
    const loginFields = document.getElementById('login-fields');
    const registerFields = document.getElementById('register-fields');
    const authTitle = document.getElementById('auth-title');
    
    if (loginFields) loginFields.style.display = isRegister ? 'none' : 'block';
    if (registerFields) registerFields.style.display = isRegister ? 'block' : 'none';
    if (authTitle) authTitle.innerText = isRegister ? 'S\'inscrire' : 'Connexion';
}

async function handleLoginAction() {
    console.log('handleLoginAction appelé');
    alert('Fonction de connexion de test appelée!');
}

// Test de chargement
window.addEventListener('load', function() {
    console.log('Script de test chargé avec succès');
    console.log('togglePass disponible:', typeof togglePass);
    console.log('toggleAuthMode disponible:', typeof toggleAuthMode);
    console.log('handleLoginAction disponible:', typeof handleLoginAction);
});
