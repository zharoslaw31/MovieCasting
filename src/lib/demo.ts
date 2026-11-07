import { MovieDetails } from './types';

// Невеликий вбудований набір фільмів для демо-режиму (без API ключа).
type Raw = [
  id: number,
  title: string,
  originalTitle: string,
  date: string,
  rating: number,
  votes: number,
  genres: number[],
  runtime: number,
  imdb: string,
  poster: string,
  backdrop: string,
  trailer: string,
  director: string,
  overview: string,
];

const RAW: Raw[] = [
  [27205, 'Початок', 'Inception', '2010-07-15', 8.4, 37000, [28, 878, 12], 148, 'tt1375666', '/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg', '/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg', 'YoHD9XEInc0', 'Крістофер Нолан', 'Кобб — талановитий злодій, який краде секрети з підсвідомості людей під час сну. Тепер він має зробити неможливе: не викрасти ідею, а вкласти її.'],
  [157336, 'Інтерстеллар', 'Interstellar', '2014-11-05', 8.4, 35000, [12, 18, 878], 169, 'tt0816692', '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', '/xJHokMbljvjADYdit5fK5VQsXEG.jpg', 'zSWdZVtXT7E', 'Крістофер Нолан', 'Земля вмирає. Група дослідників вирушає крізь червоточину, щоб знайти людству новий дім серед зірок.'],
  [155, 'Темний лицар', 'The Dark Knight', '2008-07-16', 8.5, 33000, [18, 28, 80, 53], 152, 'tt0468569', '/qJ2tW6WMUDux911r6m7haRef0WH.jpg', '/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg', 'EXeTwQWrcwY', 'Крістофер Нолан', 'Бетмен, комісар Гордон і прокурор Дент об’єднуються проти злочинності Ґотема, але на сцену виходить Джокер.'],
  [603, 'Матриця', 'The Matrix', '1999-03-31', 8.2, 26000, [28, 878], 136, 'tt0133093', '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', '/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg', 'vKQi3bBA1y8', 'Лана та Ліллі Вачовські', 'Хакер Нео дізнається, що світ навколо — лише симуляція, і стає на бік повстанців у війні проти машин.'],
  [496243, 'Паразити', '기생충', '2019-05-30', 8.5, 18000, [35, 53, 18], 133, 'tt6751668', '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', '/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg', '5xH0HfJHsaY', 'Пон Джун Хо', 'Бідна родина Кім крок за кроком проникає в життя заможних Пак. Але в їхньому домі ховається таємниця.'],
  [693134, 'Дюна: Частина друга', 'Dune: Part Two', '2024-02-27', 8.2, 6500, [878, 12], 167, 'tt15239678', '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', '/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg', 'Way9Dexny3w', 'Дені Вільнев', 'Пол Атрід об’єднується з Чані та фременами, щоб помститися змовникам, які знищили його родину.'],
  [550, 'Бійцівський клуб', 'Fight Club', '1999-10-15', 8.4, 29000, [18, 53], 139, 'tt0137523', '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', '/hZkgoQYus5vegHoetLkCJzb17zJ.jpg', 'qtRKdVHc-cE', 'Девід Фінчер', 'Офісний працівник, що страждає від безсоння, зустрічає харизматичного Тайлера Дердена. Разом вони створюють підпільний клуб.'],
  [680, 'Кримінальне чтиво', 'Pulp Fiction', '1994-09-10', 8.5, 27000, [53, 80], 154, 'tt0110912', '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', '/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg', 's7EdQ4FqbhY', 'Квентін Тарантіно', 'Кілька кримінальних історій Лос-Анджелеса переплітаються в одну — з гангстерами, боксером і валізою, що світиться.'],
  [278, 'Втеча з Шоушенка', 'The Shawshank Redemption', '1994-09-23', 8.7, 26000, [18, 80], 142, 'tt0111161', '/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg', '/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg', '6hB3S9bIaco', 'Френк Дарабонт', 'Банкіра Енді засуджують за вбивство, якого він не скоював. За ґратами він знаходить дружбу і не втрачає надії.'],
  [238, 'Хрещений батько', 'The Godfather', '1972-03-14', 8.7, 20000, [18, 80], 175, 'tt0068646', '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', '/tmU7GeKVybMWFButWEGl2M4GeiP.jpg', 'UaVTIH8mujA', 'Френсіс Форд Коппола', 'Сага про родину Корлеоне: старіючий патріарх передає імперію своєму неохочому синові Майклу.'],
  [13, 'Форрест Гамп', 'Forrest Gump', '1994-06-23', 8.5, 27000, [35, 18, 10749], 142, 'tt0109830', '/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg', '/qdIMHd4sEfJSckfVJfKQvisL02a.jpg', 'bLvqoHBptjg', 'Роберт Земекіс', 'Простодушний Форрест мимоволі стає свідком і учасником ключових подій історії США, але думає лише про кохану Дженні.'],
  [129, 'Віднесені привидами', '千と千尋の神隠し', '2001-07-20', 8.5, 16000, [16, 10751, 14], 125, 'tt0245429', '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg', '/Ab8mkHmkYADjU7wQiOkia9BzGvS.jpg', 'ByXuk9QqQkk', 'Хаяо Міядзакі', 'Десятирічна Тихіро потрапляє у світ духів, де має працювати в лазні чарівниці, щоб урятувати батьків.'],
];

export const DEMO_MOVIES: MovieDetails[] = RAW.map((r) => ({
  id: r[0],
  title: r[1],
  originalTitle: r[2],
  releaseDate: r[3],
  rating: r[4],
  votes: r[5],
  genreIds: r[6],
  runtime: r[7],
  imdbId: r[8],
  posterPath: r[9],
  backdropPath: r[10],
  trailerKey: r[11],
  director: r[12],
  overview: r[13],
  language: r[0] === 496243 ? 'ko' : r[0] === 129 ? 'ja' : 'en',
  tagline: '',
  countries: [],
  cast: [],
  budget: 0,
  revenue: 0,
}));
