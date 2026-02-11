// assets/js/features/notifications/notification-sound.js
// Notification Sound Player

// ============ Sound Configuration ============

const SOUNDS = {
  notification: '/assets/sounds/notification.mp3',
  message: '/assets/sounds/message.mp3',
  success: '/assets/sounds/success.mp3',
  warning: '/assets/sounds/warning.mp3',
  error: '/assets/sounds/error.mp3'
};

// Fallback beep sounds using Web Audio API
const createBeepSound = (frequency = 800, duration = 200, volume = 0.3) => {
  return new Promise((resolve) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume * 0.5, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration/1000);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration/1000);
      
      setTimeout(() => {
        audioContext.close();
        resolve();
      }, duration);
    } catch (error) {
      resolve();
    }
  });
};

const FALLBACK_SOUNDS = {
  notification: () => createBeepSound(800, 200, 0.3),
  message: () => createBeepSound(1000, 150, 0.25),
  success: async () => {
    // Two-tone success beep
    await createBeepSound(600, 100, 0.3);
    await new Promise(resolve => setTimeout(resolve, 50));
    await createBeepSound(800, 150, 0.3);
  },
  warning: () => createBeepSound(400, 400, 0.35),
  error: async () => {
    // Three short error beeps
    await createBeepSound(300, 100, 0.4);
    await new Promise(resolve => setTimeout(resolve, 50));
    await createBeepSound(300, 100, 0.4);
    await new Promise(resolve => setTimeout(resolve, 50));
    await createBeepSound(300, 100, 0.4);
  }
};

const DEFAULT_VOLUME = 0.5;
const SOUND_CACHE = {};

// ============ Settings ============

let soundEnabled = true;
let volume = DEFAULT_VOLUME;

// Load settings from localStorage
const loadSettings = () => {
  try {
    const savedEnabled = localStorage.getItem('notification_sound_enabled');
    const savedVolume = localStorage.getItem('notification_sound_volume');
    
    // Only disable if explicitly set to 'false', otherwise default to enabled
    if (savedEnabled === 'false') {
      soundEnabled = false;
    } else {
      soundEnabled = true;
    }
    
    if (savedVolume !== null) {
      volume = parseFloat(savedVolume);
    }
  } catch (error) {
    console.error('Error loading sound settings:', error);
    // Default to enabled on error
    soundEnabled = true;
  }
};

// Save settings to localStorage
const saveSettings = () => {
  try {
    localStorage.setItem('notification_sound_enabled', soundEnabled);
    localStorage.setItem('notification_sound_volume', volume);
  } catch (error) {
    console.error('Error saving sound settings:', error);
  }
};

// Initialize
loadSettings();

// ============ Sound Playback ============

/**
 * Preload a sound file
 * @param {String} soundType - Type of sound to preload
 */
const preloadSound = (soundType) => {
  if (SOUND_CACHE[soundType]) return;
  
  const soundUrl = SOUNDS[soundType];
  if (!soundUrl) return;
  
  try {
    const audio = new Audio(soundUrl);
    audio.volume = volume;
    audio.preload = 'auto';
    SOUND_CACHE[soundType] = audio;
  } catch (error) {
    // Failed to preload sound
  }
};

/**
 * Play notification sound
 * @param {String} soundType - Type of sound to play (notification, message, success, etc.)
 * @param {Object} options - Playback options
 */
const playSound = async (soundType = 'notification', options = {}) => {
  // Check if sounds are enabled
  if (!soundEnabled) {
    return;
  }
  
  const {
    volumeOverride = null,
    loop = false,
    rate = 1.0
  } = options;
  
  const soundUrl = SOUNDS[soundType];
  
  if (!soundUrl) {
    return;
  }
  
  try {
    // Get or create audio element
    let audio = SOUND_CACHE[soundType];
    
    if (!audio) {
      audio = new Audio(soundUrl);
      audio.preload = 'auto';
      SOUND_CACHE[soundType] = audio;
    }
    
    // Reset audio to beginning
    audio.currentTime = 0;
    
    // Set volume
    audio.volume = volumeOverride !== null ? volumeOverride : volume;
    
    // Set playback rate
    audio.playbackRate = rate;
    
    // Set loop
    audio.loop = loop;
    
    // Play sound
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
      await playPromise;
    }
  } catch (error) {
    // ALWAYS try fallback sound if main sound fails
    try {
      const fallbackFunction = FALLBACK_SOUNDS[soundType];
      if (fallbackFunction && typeof fallbackFunction === 'function') {
        await fallbackFunction();
      }
    } catch (fallbackError) {
      // This can happen if user hasn't interacted with the page yet
    }
  }
};

/**
 * Play notification sound
 */
const playNotificationSound = (options) => {
  return playSound('notification', options);
};

/**
 * Play message sound
 */
const playMessageSound = (options) => {
  return playSound('message', options);
};

/**
 * Play success sound
 */
const playSuccessSound = (options) => {
  return playSound('success', options);
};

/**
 * Play warning sound
 */
const playWarningSound = (options) => {
  return playSound('warning', options);
};

/**
 * Play error sound
 */
const playErrorSound = (options) => {
  return playSound('error', options);
};

// ============ Settings Management ============

/**
 * Enable notification sounds
 */
const enableSounds = () => {
  soundEnabled = true;
  saveSettings();
  return soundEnabled;
};

/**
 * Disable notification sounds
 */
const disableSounds = () => {
  soundEnabled = false;
  saveSettings();
  return soundEnabled;
};

/**
 * Toggle notification sounds
 */
const toggleSounds = () => {
  soundEnabled = !soundEnabled;
  saveSettings();
  return soundEnabled;
};

/**
 * Check if sounds are enabled
 */
const isSoundEnabled = () => {
  return soundEnabled;
};

/**
 * Set volume (0.0 to 1.0)
 * @param {Number} newVolume - Volume level
 */
const setVolume = (newVolume) => {
  volume = Math.max(0, Math.min(1, newVolume));
  saveSettings();
  
  // Update all cached audio elements
  Object.values(SOUND_CACHE).forEach(audio => {
    audio.volume = volume;
  });
};

/**
 * Get current volume
 */
const getVolume = () => {
  return volume;
};

// ============ Initialization ============

let audioUnlocked = false;

/**
 * Unlock audio playback on first user interaction
 * This bypasses browser autoplay restrictions
 */
const unlockAudio = async () => {
  if (audioUnlocked) return;
  
  try {
    // Use Web Audio API to unlock (CSP-friendly)
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Silent sound
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.001);
    
    // Also try to preload and prime the actual audio elements
    for (const [type, url] of Object.entries(SOUNDS)) {
      try {
        const audio = new Audio(url);
        audio.volume = 0.01;
        audio.preload = 'auto';
        const playPromise = audio.play();
        if (playPromise) {
          await playPromise.then(() => {
            audio.pause();
            audio.currentTime = 0;
          }).catch(() => {});
        }
      } catch (e) {
        // Ignore individual file errors
      }
    }
    
    audioUnlocked = true;
  } catch (error) {
    // Audio unlock attempt failed
  }
};

/**
 * Initialize notification sounds
 * Preload commonly used sounds
 */
const initNotificationSounds = () => {
  // Preload common sounds
  preloadSound('notification');
  preloadSound('message');
  preloadSound('success');
  
  // Multiple strategies to unlock audio
  let unlocked = false;
  
  const tryUnlock = async () => {
    if (!unlocked) {
      await unlockAudio();
      unlocked = true;
    }
  };
  
  // Strategy 1: Unlock on ANY user interaction
  const unlockEvents = ['click', 'touchstart', 'touchend', 'keydown', 'mousedown'];
  unlockEvents.forEach(event => {
    document.addEventListener(event, tryUnlock, { once: true, passive: true });
  });
  
  // Strategy 2: Try to unlock after a short delay (when page is loaded and user might be browsing)
  setTimeout(() => {
    // Waiting for user interaction to unlock audio
  }, 1000);
  
  // Strategy 3: Also add listener to common interactive elements
  setTimeout(() => {
    const buttons = document.querySelectorAll('button, a, input');
    buttons.forEach(btn => {
      btn.addEventListener('click', tryUnlock, { once: true, passive: true });
    });
  }, 100);
};

// ============ Cleanup ============

/**
 * Stop all playing sounds
 */
const stopAllSounds = () => {
  Object.values(SOUND_CACHE).forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
};

/**
 * Clear sound cache
 */
const clearCache = () => {
  stopAllSounds();
  Object.keys(SOUND_CACHE).forEach(key => {
    delete SOUND_CACHE[key];
  });
};

// ============ Fallback Beep ============

/**
 * Play system beep (fallback when audio files unavailable)
 */
const playBeep = () => {
  if (!soundEnabled) return;
  
  try {
    // Create audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Configure beep
    oscillator.frequency.value = 800; // Hz
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(volume * 0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    // Play beep
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (error) {
    // Could not play beep
  }
};

// ============ Exports ============

// Global debug helper (accessible from console)
if (typeof window !== 'undefined') {
  window.soundDebug = {
    enable: () => {
      enableSounds();
      return 'Sounds enabled. Try triggering a notification now.';
    },
    disable: () => {
      disableSounds();
      return 'Sounds disabled.';
    },
    status: () => {
      return {
        enabled: soundEnabled,
        volume: volume,
        unlocked: audioUnlocked,
        cache: Object.keys(SOUND_CACHE)
      };
    },
    test: async (type = 'success') => {
      await playSound(type);
      return `Played ${type} sound`;
    },
    clearCache: () => {
      clearCache();
      return 'Sound cache cleared';
    }
  };
}

export {
  // Initialization
  initNotificationSounds,
  
  // Play sounds
  playSound,
  playNotificationSound,
  playMessageSound,
  playSuccessSound,
  playWarningSound,
  playErrorSound,
  playBeep,
  
  // Settings
  enableSounds,
  disableSounds,
  toggleSounds,
  isSoundEnabled,
  setVolume,
  getVolume,
  
  // Cache management
  preloadSound,
  stopAllSounds,
  clearCache
};

export default {
  init: initNotificationSounds,
  play: playSound,
  playNotification: playNotificationSound,
  playMessage: playMessageSound,
  playSuccess: playSuccessSound,
  playWarning: playWarningSound,
  playError: playErrorSound,
  playBeep,
  enable: enableSounds,
  disable: disableSounds,
  toggle: toggleSounds,
  isEnabled: isSoundEnabled,
  setVolume,
  getVolume
};