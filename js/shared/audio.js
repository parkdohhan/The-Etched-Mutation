// /js/shared/audio.js
// 오디오 재생 유틸리티

let audioContext = null;
let currentAudio = null;

export function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

export function playSound(src, options = {}) {
  const { loop = false, volume = 1.0 } = options;
  
  // 이전 오디오 정지
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  
  const audio = new Audio(src);
  audio.loop = loop;
  audio.volume = volume;
  audio.play().catch(err => console.warn('Audio play failed:', err));
  
  currentAudio = audio;
  return audio;
}

export function stopSound() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

export function setVolume(volume) {
  if (currentAudio) {
    currentAudio.volume = Math.max(0, Math.min(1, volume));
  }
}

// 사운드 파일 경로
export const SOUNDS = {
  drone: 'sounds/Base_Void.mp3',
  ambience: 'sounds/Base_white.mp3',
  tension: 'sounds/ambient-opening.mp3',
  seal: 'sounds/ambient-opening.mp3',
  uiInput: 'sounds/footstep.mp3',
  uiSeal: 'sounds/footstep.mp3',
  opening: 'sounds/ambient-opening.mp3',
  rain: 'sounds/Rain_indoor.mp3'
};

