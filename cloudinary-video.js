// Fonction pour uploader sur le compte VIDEO (dn3vf0mhm)
async function uploadToVideoCloud(file) {
    const cloudName = "dn3vf0mhm";
    const uploadPreset = "video_preset";
    
    // On détermine si c'est une vidéo ou un fichier brut (ZIP/EXE)
    const isVideo = file.type.startsWith('video/');
    const resourceType = isVideo ? "video" : "raw";

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.secure_url) {
            return data.secure_url;
        } else {
            console.error("Erreur Cloudinary:", data.error.message);
            alert("Erreur : " + data.error.message);
            return null;
        }
    } catch (err) {
        console.error("Erreur réseau:", err);
        return null;
    }
}
