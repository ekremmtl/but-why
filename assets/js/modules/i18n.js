export const I18N = {
  en: {
    infoMove: 'Use W/S or the Up/Down Arrow to move.',
    musicOn: '🔊 Music',
    musicOff: '🔇 Music',
    restart: '⏮ Restart',
    volume: 'Volume:',
    documentary: 'Documentary',
    tryAgain: 'Try Again',
    audioStart: 'Start',
    headingWin: 'You won',
    headingLose: 'Game over',
    endingWin:
      "...Because he had a purpose. He never stopped until he reached it. Even if there chance of death, you can't give up trying for your dreams. Never give up!",
    endingLose:
      "Even if you have to walk a long and difficult road to achieve your dreams, you shouldn't stop trying. If you don't even try, you're going to fail anyway. So.. Never give up!"
  },
  tr: {
    infoMove: 'W/S veya Yukarı/Aşağı ok tuşlarıyla hareket et.',
    musicOn: '🔊 Müzik',
    musicOff: '🔇 Müzik',
    restart: '⏮ Baştan',
    volume: 'Ses:',
    documentary: 'Belgesel',
    tryAgain: 'Tekrar Dene',
    audioStart: 'Başlat',
    headingWin: 'Başardın',
    headingLose: 'Bitti',
    endingWin:
      '...Çünkü bir amacı vardı. Vazgeçmedi ve sonunda ulaştı. Ölüm ihtimali olsa bile hayallerin için denemekten vazgeçemezsin. Asla vazgeçme!',
    endingLose:
      'Hayallerine ulaşmak için uzun ve zor bir yol yürümen gerekse bile denemeyi bırakmamalısın. Denemezsen zaten kaybedersin. Yani... Asla vazgeçme!'
  }
};

export const SUBTITLES_BY_LANG = {
  en: [
    { start: 0, end: 4, text: 'But one of them caught our eye, the one in the center.' },
    { start: 5.5, end: 10, text: 'He would neither go towards the feeding grounds at the edge of the ice' },
    { start: 10, end: 13, text: 'nor return to the colony.' },
    {
      start: 14,
      end: 22,
      text: 'Shortly afterwards, we saw him heading straight towards the mountains some 70 kilometers away.'
    },
    {
      start: 24,
      end: 30,
      text: 'Dr. explained that even if he caught him and brought him back to the colony,'
    },
    { start: 30, end: 33, text: 'he would immediately head right back for the mountains.' },
    { start: 36, end: 38, text: 'But why?' }
  ],
  tr: [
    { start: 0, end: 4, text: 'Ama içlerinden biri dikkatimizi çekti, ortadaki.' },
    { start: 5.5, end: 10, text: 'Ne buzun kenarındaki beslenme alanlarına gidiyordu' },
    { start: 10, end: 13, text: 'ne de koloniye geri dönüyordu.' },
    {
      start: 14,
      end: 22,
      text: 'Kısa bir süre sonra onu 70 kilometre uzaktaki dağlara doğru yürürken gördük.'
    },
    {
      start: 24,
      end: 30,
      text: 'Doktor, yakalayıp koloniye geri getirse bile,'
    },
    { start: 30, end: 33, text: 'hemen tekrar dağlara doğru yürümeye başlayacağını söyledi.' },
    { start: 36, end: 38, text: 'Ama neden?' }
  ]
};

export function detectInitialLanguage() {
  const saved = window.localStorage ? window.localStorage.getItem('lang') : null;
  if (saved === 'tr' || saved === 'en') return saved;

  const navLang = (navigator.language || '').toLowerCase();
  if (navLang.startsWith('tr')) return 'tr';

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === 'Europe/Istanbul') return 'tr';
  } catch {
    // ignore
  }

  return 'en';
}

export function t(lang, key) {
  const dict = I18N[lang] || I18N.en;
  return dict[key] ?? I18N.en[key] ?? key;
}
