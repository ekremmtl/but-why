export const AUDIO_LEVELS = {
  winterVolume: 8,
  stepVolume: 0.2,
  titleFallVolume: 0.05
};

export const audioState = {
  audioStarted: false,
  musicStarted: false,
  audioUnlocked: false
};

let narrationAudio;
let musicAudio;
let winterAudio;
let stepAudio;
let titleFallAudio;

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function getNarrationAudio() {
  return narrationAudio;
}

export async function tryStartWinterAudio() {
  if (!winterAudio) return false;

  winterAudio.volume = clamp01(AUDIO_LEVELS.winterVolume);

  try {
    await winterAudio.play();
    return true;
  } catch {
    return false;
  }
}

export function showAudioUnlockOverlay() {
  const overlay = document.getElementById('audio-unlock');
  setTimeout(() => {
    if (overlay) overlay.classList.add('show');
  }, 1000);
}

export function playStepSound() {
  if (!stepAudio) return;

  const a = stepAudio.cloneNode(true);
  a.volume = clamp01(AUDIO_LEVELS.stepVolume);
  a.play().catch(() => {
    // Autoplay blocked; ignore.
  });
}

export function playTitleFallSound() {
  if (!titleFallAudio) return;

  const a = titleFallAudio.cloneNode(true);
  a.volume = clamp01(AUDIO_LEVELS.titleFallVolume);
  a.play().catch(() => {
    // Autoplay blocked; ignore.
  });
}

export function startAudioIfNeeded({ introPlaying, setToggleText }) {
  if (audioState.audioStarted) return;
  if (!narrationAudio) return;

  narrationAudio
    .play()
    .then(() => {
      audioState.audioStarted = true;
      if (typeof setToggleText === 'function') setToggleText('🔊 Music');
    })
    .catch((e) => {
      console.log('Audio play failed:', e);
    });
}

export function initAudioControls({ t, applyI18n, resetGame, hideLoadingScreen }) {
  narrationAudio = document.getElementById('narration-audio');
  musicAudio = document.getElementById('music-audio');
  winterAudio = document.getElementById('winter-audio');
  stepAudio = document.getElementById('step-audio');
  titleFallAudio = document.getElementById('title-fall-audio');

  const volumeSlider = document.getElementById('volume-slider');

  if (typeof applyI18n === 'function') applyI18n();

  if (narrationAudio) narrationAudio.volume = clamp01(0.1);
  if (musicAudio) {
    musicAudio.volume = clamp01(0.1);
    musicAudio.loop = true;
  }
  if (winterAudio) winterAudio.volume = clamp01(AUDIO_LEVELS.winterVolume);
  if (stepAudio) stepAudio.volume = clamp01(AUDIO_LEVELS.stepVolume);
  if (titleFallAudio) titleFallAudio.volume = clamp01(AUDIO_LEVELS.titleFallVolume);
  if (volumeSlider) volumeSlider.value = 10;

  const unlockButton = document.getElementById('audio-unlock-button');
  if (unlockButton) {
    unlockButton.addEventListener('click', async () => {
      audioState.audioUnlocked = true;
      const ok = await tryStartWinterAudio();
      if (!ok) {
        audioState.audioUnlocked = false;
        return;
      }

      if (typeof hideLoadingScreen === 'function') hideLoadingScreen();
    });
  }

  if (volumeSlider && narrationAudio) {
    volumeSlider.addEventListener('input', (e) => {
      const volume = clamp01(e.target.value / 100);
      narrationAudio.volume = volume;
      if (musicAudio) musicAudio.volume = volume;
    });
  }

  const endingResetButton = document.getElementById('ending-reset-button');
  if (endingResetButton) {
    endingResetButton.addEventListener('click', () => {
      if (typeof resetGame === 'function') resetGame();
    });
  }
}

export function tryStartMusicIfNeeded() {
  if (!musicAudio) return;
  if (audioState.musicStarted) return;

  musicAudio
    .play()
    .then(() => {
      audioState.musicStarted = true;
    })
    .catch(() => {
      // Autoplay blocked; ignore.
    });
}
