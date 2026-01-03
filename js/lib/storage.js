// localStorage 관련 유틸리티 함수들
export function getLocalStorage(key) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        console.error('localStorage get error:', e);
        return null;
    }
}

export function setLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.error('localStorage set error:', e);
        return false;
    }
}

export function removeLocalStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        console.error('localStorage remove error:', e);
        return false;
    }
}

// adminMemories 전용 함수들
const ADMIN_MEMORIES_KEY = 'adminMemories';

export function loadAdminMemories() {
    try {
        const stored = localStorage.getItem(ADMIN_MEMORIES_KEY);
        if (!stored) {
            return [];
        }
        return JSON.parse(stored);
    } catch (e) {
        console.error('loadAdminMemories error:', e);
        return [];
    }
}

export function saveAdminMemories(memories) {
    try {
        localStorage.setItem(ADMIN_MEMORIES_KEY, JSON.stringify(memories));
        return true;
    } catch (e) {
        console.error('saveAdminMemories error:', e);
        return false;
    }
}

export function exportAdminMemoriesJSON() {
    try {
        const stored = localStorage.getItem(ADMIN_MEMORIES_KEY);
        if (!stored) {
            return '[]';
        }
        return stored;
    } catch (e) {
        console.error('exportAdminMemoriesJSON error:', e);
        return '[]';
    }
}

export function importAdminMemoriesJSON(jsonString) {
    try {
        const parsed = JSON.parse(jsonString);
        if (!Array.isArray(parsed)) {
            console.error('importAdminMemoriesJSON: 파싱 결과가 배열이 아닙니다');
            return [];
        }
        saveAdminMemories(parsed);
        return parsed;
    } catch (e) {
        console.error('importAdminMemoriesJSON error:', e);
        return [];
    }
}

