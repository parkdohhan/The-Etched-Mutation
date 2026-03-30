export function showNotification(text) {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = text;
        notification.classList.add('visible');
        setTimeout(() => { notification.classList.remove('visible'); }, 3000);
    }
}

export function showNpcDialogue(text, duration = 4000) {
    const dialogue = document.getElementById('npcDialogue');
    if (dialogue) {
        document.getElementById('npcText').textContent = text;
        dialogue.classList.add('visible');
        setTimeout(() => { dialogue.classList.remove('visible'); }, duration);
    }
}
