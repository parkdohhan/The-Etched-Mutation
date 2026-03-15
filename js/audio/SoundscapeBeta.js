// ═══════════════════════════════════════════════════
// SoundscapeBeta.js — background음악 크 스페 드 시스템
// ═══════════════════════════════════════════════════

(function() {
  'use strict';

  let _currentAudio = null;
  let _nextAudio = null;
  let _currentBucket = 'IDLE';
  let _soundMap = null;
  let _volume = 0.35;
  let _isMuted = false;
  let _fadeInterval = null;

  const BUCKET_SOUNDS = {
    HIGH: 'HIGH',
    MID: 'MID',
    LOW: 'LOW',
    FIXATED: 'FIXATED',
    IDLE: 'IDLE'
  };

  /**
 * init
   * @param {Object} config - { soundMap, volume }
   */
  function init(config) {
    config = config || {};
    _soundMap = config.soundMap || null;
    _volume = config.volume !== undefined ? config.volume : 0.35;
    _currentBucket = 'IDLE';
    console.log('[Soundscape] 초기화:', { soundMap: _soundMap, volume: _volume });
  }

  /**
 * sound start
   */
  function start() {
    if (_isMuted) return;
    setBucket(_currentBucket || 'IDLE');
    console.log('[Soundscape] 시작');
  }

  /**
 * sound 중지
   */
  function stop() {
    if (_currentAudio) {
      _currentAudio.pause();
      _currentAudio = null;
    }
    if (_nextAudio) {
      _nextAudio.pause();
      _nextAudio = null;
    }
    if (_fadeInterval) {
      clearInterval(_fadeInterval);
      _fadeInterval = null;
    }
    console.log('[Soundscape] 중지');
  }

  /**
 * bucket 변경
   * @param {string} bucket - HIGH, MID, LOW, FIXATED, IDLE
   */
  function setBucket(bucket) {
    if (!bucket || bucket === _currentBucket) return;
    
    const soundKey = _soundMap && _soundMap[bucket] 
      ? _soundMap[bucket] 
      : null;
    
    if (!soundKey) {
      console.log('[Soundscape] 버킷 변경:', bucket, '(사운드 맵 없음)');
      _currentBucket = bucket;
      return;
    }

    console.log('[Soundscape] 버킷 변경:', bucket, '→', soundKey);
    _currentBucket = bucket;

 // 크 스페 드
    if (_currentAudio) {
      _nextAudio = new Audio(soundKey);
      _nextAudio.volume = 0;
      _nextAudio.loop = true;
      _nextAudio.play().catch(e => console.warn('[Soundscape] 재생 실패:', e));

      let fadeTime = 0;
      const fadeDuration = 2000; // 2초
      _fadeInterval = setInterval(() => {
        fadeTime += 50;
        const progress = fadeTime / fadeDuration;
        
        if (progress >= 1) {
          _currentAudio.pause();
          _currentAudio = _nextAudio;
          _nextAudio = null;
          _currentAudio.volume = _isMuted ? 0 : _volume;
          clearInterval(_fadeInterval);
          _fadeInterval = null;
        } else {
          _currentAudio.volume = _isMuted ? 0 : _volume * (1 - progress);
          _nextAudio.volume = _isMuted ? 0 : _volume * progress;
        }
      }, 50);
    } else {
      _currentAudio = new Audio(soundKey);
      _currentAudio.volume = _isMuted ? 0 : _volume;
      _currentAudio.loop = true;
      _currentAudio.play().catch(e => console.warn('[Soundscape] 재생 실패:', e));
    }
  }

  /**
 * scene switch (volume 딥)
   */
  function onSceneTransition() {
    if (!_currentAudio) return;
    
    const originalVolume = _currentAudio.volume;
    _currentAudio.volume = Math.max(0, originalVolume * 0.3);
    
    setTimeout(() => {
      if (_currentAudio) {
        _currentAudio.volume = _isMuted ? 0 : originalVolume;
      }
    }, 800);
  }

  /**
 * Void crack sound
   */
  function onVoidCrack() {
 // void crack 효 음 play (선택사항)
    console.log('[Soundscape] Void crack');
  }

  /**
 * 음소거 토글
 * @returns {boolean} 현재 음소거 state
   */
  function toggleMute() {
    _isMuted = !_isMuted;
    
    if (_currentAudio) {
      _currentAudio.volume = _isMuted ? 0 : _volume;
    }
    if (_nextAudio) {
      _nextAudio.volume = _isMuted ? 0 : _volume;
    }
    
    console.log('[Soundscape] 음소거:', _isMuted);
    return _isMuted;
  }

 // global 노출
  window.soundscape = {
    init: init,
    start: start,
    stop: stop,
    setBucket: setBucket,
    onSceneTransition: onSceneTransition,
    onVoidCrack: onVoidCrack,
    toggleMute: toggleMute
  };

  console.log('[Soundscape] 모듈 로드 완료');
})();


