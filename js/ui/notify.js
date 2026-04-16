export function showNotification(text) {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = text;
        notification.classList.add('visible');
        setTimeout(() => { notification.classList.remove('visible'); }, 3000);
    }
}

export function showNpcDialogue(text, duration = 4000, speakerLabel = null) {
    const dialogue = document.getElementById('npcDialogue');
    if (dialogue) {
        document.getElementById('npcText').textContent = text;
        const nameEl = dialogue.querySelector('.npc-name');
        if (nameEl) {
            if (speakerLabel) {
                nameEl.dataset.i18nOrig = nameEl.dataset.i18nOrig || nameEl.getAttribute('data-i18n') || '';
                nameEl.removeAttribute('data-i18n');
                nameEl.textContent = speakerLabel;
            } else if (nameEl.dataset.i18nOrig) {
                nameEl.setAttribute('data-i18n', nameEl.dataset.i18nOrig);
            }
        }
        dialogue.classList.add('visible');
        setTimeout(() => { dialogue.classList.remove('visible'); }, duration);
    }
}
