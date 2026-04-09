const firebaseConfig = {
  apiKey: "AIzaSyBTjE8yU0YFJZe9aqOiZuZ7CmBz08yHNhA",
  authDomain: "sbagemachatgroup.firebaseapp.com",
  projectId: "sbagemachatgroup",
  storageBucket: "sbagemachatgroup.firebasestorage.app",
  messagingSenderId: "169367319493",
  appId: "1:169367319493:web:90d319eff0142d585651ac",
  databaseURL: "https://sbagemachatgroup-default-rtdb.europe-west1.firebasedatabase.app/"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const admins = ["002290140804495", "002290140804494", "002290197479181", "002290167648919", "002290195618690"];
let user = localStorage.getItem("chat_user") || "";
let currentGroup = localStorage.getItem("chat_group") || "";

function listenInbox() {
    if(!user) return;
    db.ref("inbox/" + user).on("value", (snap) => {
        let count = snap.numChildren();
        let badge = document.getElementById("inboxCount");
        if(count > 0) {
            badge.innerText = count;
            badge.style.display = "block";
        } else {
            badge.style.display = "none";
        }
    });
}

function showInbox() {
    db.ref("inbox/" + user).once("value", (snap) => {
        let msgStr = "--- VOS MESSAGES PRIVÉS ---\n\n";
        snap.forEach(child => {
            let m = child.val();
            msgStr += `De: ${m.from}\n${m.text}\n---\n`;
        });
        if(snap.numChildren() === 0) msgStr = "Aucun message privé.";
        alert(msgStr);
    });
}

function ajouterMembre() {
    let num = prompt("Numéro à ajouter :");
    let grp = prompt("Groupe ?", currentGroup);
    if(num && grp) {
        db.ref("membres/" + grp + "/" + num).set({ status: "actif", date: new Date().toLocaleDateString() });
        alert("Ajouté !");
    }
}

function listeMembres() {
    db.ref("membres/" + currentGroup).once("value", (snap) => {
        let l = "Membres (" + currentGroup + ") :\n";
        snap.forEach(c => l += "- " + c.key + "\n");
        alert(l);
    });
}

function messageUnMembre() {
    let num = prompt("Numéro destinataire :");
    let msg = prompt("Message :");
    if(num && msg) {
        db.ref("inbox/" + num).push({ from: user, text: msg, time: new Date().toLocaleTimeString() });
        alert("Envoyé !");
    }
}

function diffusionTous() {
    let msg = prompt("Message de diffusion :");
    if(msg) {
        db.ref("membres/" + currentGroup).once("value", (snap) => {
            snap.forEach(c => {
                db.ref("inbox/" + c.key).push({ from: user, text: "[DIFFUSION] " + msg });
            });
            alert("Diffusion terminée !");
        });
    }
}

function exporterContacts() {
    db.ref("membres/" + currentGroup).once("value", (snap) => {
        let d = [["Numéro", "Date"]];
        snap.forEach(c => d.push([c.key, c.val().date || "Non spécifiée"]));
        let ws = XLSX.utils.aoa_to_sheet(d);
        let wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Membres");
        XLSX.writeFile(wb, "Contacts_" + currentGroup + ".xlsx");
    });
}

function askUser() {
    if (!user) {
        let e = prompt("Numéro :");
        if (e && /^[0-9]{8,15}$/.test(e.trim())) {
            user = e.trim();
            localStorage.setItem("chat_user", user);
        } else { askUser(); return; }
    }
    setupInterface();
    listenInbox();
}

function setupInterface() {
    const welcomeDiv = document.getElementById("groupChoice");
    const isAdmin = admins.includes(user);
    if (isAdmin) document.getElementById("adminMenuBtn").style.display = "block";

    if (currentGroup && !isAdmin) {
        welcomeDiv.innerHTML = `<b>Salut ${user} !</b> <span style="color:#25D366;">${currentGroup}</span>`;
    } else {
        welcomeDiv.innerHTML = `<b>Groupe :</b> <select id="groupSelect" style="padding:5px;"></select>`;
        let s = document.getElementById("groupSelect");
        for(let i=1; i<=10; i++){
            let o = document.createElement("option"); o.value = "Groupe "+i; o.textContent = i;
            if(currentGroup === "Groupe "+i) o.selected = true;
            s.appendChild(o);
        }
        s.onchange = function(){ 
            currentGroup = this.value; 
            localStorage.setItem("chat_group", currentGroup);
            db.ref("membres/" + currentGroup + "/" + user).update({ date: new Date().toLocaleDateString() });
            location.reload(); 
        };
    }
    if(currentGroup) loadChat();
}

function sendMessage(){
    let v = document.getElementById("msgInput").value;
    if(!v.trim() || !currentGroup) return;
    db.ref("messages/" + currentGroup).push({ text: v, name: user, time: new Date().getHours() + ":" + String(new Date().getMinutes()).padStart(2,'0') });
    document.getElementById("msgInput").value = "";
}

function loadChat() {
    document.getElementById("groupTitle").innerText = "Discussion : " + currentGroup;
    db.ref("messages/" + currentGroup).on("value", (snap) => {
        let box = document.getElementById("messages"); box.innerHTML = "";
        snap.forEach(c => {
            let m = c.val();
            let d = document.createElement("div");
            d.className = "msg " + (m.name === user ? "me" : "other");
            d.innerHTML = `<div class="name">${m.name} ${admins.includes(m.name)?'⭐':''}</div><div>${m.text}</div><div class="time">${m.time}</div>`;
            box.appendChild(d);
        });
        box.scrollTop = box.scrollHeight;
    });
}

function toggleMenu() { let m = document.getElementById("adminDropdown"); m.style.display = m.style.display==="block"?"none":"block"; }
askUser();
      
