export const GENRES: { id: number; name: string; emoji: string }[] = [
  { id: 28, name: 'Бойовик', emoji: '💥' },
  { id: 12, name: 'Пригоди', emoji: '🧭' },
  { id: 16, name: 'Анімація', emoji: '🎨' },
  { id: 35, name: 'Комедія', emoji: '😂' },
  { id: 80, name: 'Кримінал', emoji: '🕵️' },
  { id: 99, name: 'Документальний', emoji: '🎥' },
  { id: 18, name: 'Драма', emoji: '🎭' },
  { id: 10751, name: 'Сімейний', emoji: '👨‍👩‍👧' },
  { id: 14, name: 'Фентезі', emoji: '🐉' },
  { id: 36, name: 'Історичний', emoji: '🏛️' },
  { id: 27, name: 'Жахи', emoji: '👻' },
  { id: 10402, name: 'Музика', emoji: '🎵' },
  { id: 9648, name: 'Детектив', emoji: '🔎' },
  { id: 10749, name: 'Мелодрама', emoji: '💘' },
  { id: 878, name: 'Фантастика', emoji: '🚀' },
  { id: 53, name: 'Трилер', emoji: '🔪' },
  { id: 10752, name: 'Військовий', emoji: '🎖️' },
  { id: 37, name: 'Вестерн', emoji: '🤠' },
  { id: 10770, name: 'ТБ-фільм', emoji: '📺' },
];

const byId = new Map(GENRES.map((g) => [g.id, g]));
export const genreName = (id: number) => byId.get(id)?.name ?? '—';
export const genreEmoji = (id: number) => byId.get(id)?.emoji ?? '🎬';

export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'Англійська' },
  { code: 'uk', name: 'Українська' },
  { code: 'fr', name: 'Французька' },
  { code: 'es', name: 'Іспанська' },
  { code: 'it', name: 'Італійська' },
  { code: 'de', name: 'Німецька' },
  { code: 'ja', name: 'Японська' },
  { code: 'ko', name: 'Корейська' },
  { code: 'zh', name: 'Китайська' },
  { code: 'hi', name: 'Гінді' },
  { code: 'pl', name: 'Польська' },
  { code: 'sv', name: 'Шведська' },
  { code: 'da', name: 'Данська' },
  { code: 'tr', name: 'Турецька' },
];

export const COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: 'US', name: 'США', flag: '🇺🇸' },
  { code: 'GB', name: 'Велика Британія', flag: '🇬🇧' },
  { code: 'UA', name: 'Україна', flag: '🇺🇦' },
  { code: 'FR', name: 'Франція', flag: '🇫🇷' },
  { code: 'DE', name: 'Німеччина', flag: '🇩🇪' },
  { code: 'IT', name: 'Італія', flag: '🇮🇹' },
  { code: 'ES', name: 'Іспанія', flag: '🇪🇸' },
  { code: 'JP', name: 'Японія', flag: '🇯🇵' },
  { code: 'KR', name: 'Південна Корея', flag: '🇰🇷' },
  { code: 'IN', name: 'Індія', flag: '🇮🇳' },
  { code: 'CA', name: 'Канада', flag: '🇨🇦' },
  { code: 'AU', name: 'Австралія', flag: '🇦🇺' },
  { code: 'PL', name: 'Польща', flag: '🇵🇱' },
  { code: 'SE', name: 'Швеція', flag: '🇸🇪' },
];

export const languageName = (code: string) =>
  LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();
