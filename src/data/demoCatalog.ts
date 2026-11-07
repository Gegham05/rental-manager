import type { AppLanguage } from '../services/i18n'

export interface DemoProperty {
  id: string
  name: Record<AppLanguage, string>
  city: Record<AppLanguage, string>
  area: Record<AppLanguage, string>
  description: Record<AppLanguage, string>
  address: Record<AppLanguage, string>
  pricePerNight: number
  maxGuests: number
  bedrooms: number
  rating: number
  reviewCount: number
  photoUrl: string
  amenities: string[]
  type: Record<AppLanguage, string>
  searchTerms: string[]
  unavailablePeriods: Array<{ start: string; end: string }>
}

export const demoCatalog: DemoProperty[] = [
  {
    id: 'yerevan-cascade-apartment',
    name: {
      ru: 'Светлая квартира у Каскада',
      en: 'Bright apartment by the Cascade',
      hy: 'Լուսավոր բնակարան Կասկադի մոտ',
    },
    city: { ru: 'Ереван', en: 'Yerevan', hy: 'Երևան' },
    area: { ru: 'Кентрон', en: 'Kentron', hy: 'Կենտրոն' },
    description: {
      ru: 'Уютная квартира рядом с Каскадом, кафе и музеями. Из окон видны город и гора Арарат.',
      en: 'A welcoming apartment near the Cascade, cafés, and museums, with city and Mount Ararat views.',
      hy: 'Հարմարավետ բնակարան Կասկադի, սրճարանների և թանգարանների մոտ՝ քաղաքի ու Արարատի տեսարանով։',
    },
    address: {
      ru: 'район Каскада',
      en: 'Cascade district',
      hy: 'Կասկադի թաղամաս',
    },
    pricePerNight: 32000,
    maxGuests: 3,
    bedrooms: 1,
    rating: 9.4,
    reviewCount: 128,
    photoUrl:
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
    amenities: ['wifi', 'kitchen', 'airConditioning', 'view'],
    type: {
      ru: 'Апартаменты',
      en: 'Apartment',
      hy: 'Բնակարան',
    },
    searchTerms: ['yerevan', 'Երևան', 'ереван', 'kentron', 'կենտրոն', 'центр'],
    unavailablePeriods: [],
  },
  {
    id: 'yerevan-courtyard-home',
    name: {
      ru: 'Дом с тихим внутренним двориком',
      en: 'Home with a quiet courtyard',
      hy: 'Տուն՝ խաղաղ բակով',
    },
    city: { ru: 'Ереван', en: 'Yerevan', hy: 'Երևան' },
    area: { ru: 'Арабкир', en: 'Arabkir', hy: 'Արաբկիր' },
    description: {
      ru: 'Небольшой семейный дом с собственной кухней, зелёным двориком и удобным транспортом до центра.',
      en: 'A compact family home with a private kitchen, leafy courtyard, and easy transport to downtown.',
      hy: 'Ընտանեկան փոքրիկ տուն՝ սեփական խոհանոցով, կանաչ բակով և դեպի կենտրոն հարմար տրանսպորտով։',
    },
    address: {
      ru: 'район Арабкир',
      en: 'Arabkir district',
      hy: 'Արաբկիր թաղամաս',
    },
    pricePerNight: 41000,
    maxGuests: 5,
    bedrooms: 2,
    rating: 9.1,
    reviewCount: 74,
    photoUrl:
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
    amenities: ['wifi', 'kitchen', 'parking', 'washingMachine'],
    type: {
      ru: 'Дом',
      en: 'Home',
      hy: 'Տուն',
    },
    searchTerms: ['yerevan', 'Երևան', 'ереван', 'arabkir', 'արաբկիր', 'арабкир'],
    unavailablePeriods: [{ start: '2026-11-18', end: '2026-11-21' }],
  },
  {
    id: 'dilijan-forest-cabin',
    name: {
      ru: 'Лесной домик в Дилижане',
      en: 'Forest cabin in Dilijan',
      hy: 'Անտառային տնակ Դիլիջանում',
    },
    city: { ru: 'Дилижан', en: 'Dilijan', hy: 'Դիլիջան' },
    area: { ru: 'Национальный парк', en: 'National Park', hy: 'Ազգային պարկ' },
    description: {
      ru: 'Тёплый деревянный дом среди деревьев — спокойная отправная точка для прогулок и поездок по Тавушу.',
      en: 'A warm wooden cabin among the trees and a peaceful base for walks and trips around Tavush.',
      hy: 'Ջերմ փայտե տնակ ծառերի մեջ՝ հանգիստ վայր զբոսանքների և Տավուշով ուղևորությունների համար։',
    },
    address: {
      ru: 'рядом с национальным парком',
      en: 'near the national park',
      hy: 'ազգային պարկի մոտ',
    },
    pricePerNight: 56000,
    maxGuests: 4,
    bedrooms: 2,
    rating: 9.7,
    reviewCount: 93,
    photoUrl:
      'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=80',
    amenities: ['wifi', 'kitchen', 'parking', 'view'],
    type: {
      ru: 'Коттедж',
      en: 'Cabin',
      hy: 'Քոթեջ',
    },
    searchTerms: ['dilijan', 'դիլիջան', 'дилижан', 'tavush', 'тавуш', 'տավուշ'],
    unavailablePeriods: [],
  },
  {
    id: 'sevan-lakeside-stay',
    name: {
      ru: 'Апартаменты у озера Севан',
      en: 'Lakeside stay by Lake Sevan',
      hy: 'Բնակարան Սևանա լճի մոտ',
    },
    city: { ru: 'Севан', en: 'Sevan', hy: 'Սևան' },
    area: { ru: 'Севанский берег', en: 'Sevan shoreline', hy: 'Սևանի ափ' },
    description: {
      ru: 'Просторные апартаменты для отдыха у воды, с балконом и кухней для самостоятельных поездок.',
      en: 'A spacious lakeside apartment with a balcony and kitchen for an easy-going getaway.',
      hy: 'Ընդարձակ բնակարան լճի մոտ՝ պատշգամբով և խոհանոցով՝ հանգիստ հանգստի համար։',
    },
    address: {
      ru: 'побережье озера Севан',
      en: 'Lake Sevan shore',
      hy: 'Սևանա լճի ափ',
    },
    pricePerNight: 47000,
    maxGuests: 4,
    bedrooms: 2,
    rating: 8.9,
    reviewCount: 61,
    photoUrl:
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
    amenities: ['wifi', 'kitchen', 'parking', 'view'],
    type: {
      ru: 'Апартаменты',
      en: 'Apartment',
      hy: 'Բնակարան',
    },
    searchTerms: ['sevan', 'սևան', 'севан', 'lake sevan', 'озеро севан', 'սևանա լիճ'],
    unavailablePeriods: [],
  },
  {
    id: 'tsaghkadzor-mountain-retreat',
    name: {
      ru: 'Горный отдых в Цахкадзоре',
      en: 'Mountain retreat in Tsaghkadzor',
      hy: 'Լեռնային հանգիստ Ծաղկաձորում',
    },
    city: { ru: 'Цахкадзор', en: 'Tsaghkadzor', hy: 'Ծաղկաձոր' },
    area: { ru: 'Горный курорт', en: 'Mountain resort', hy: 'Լեռնային հանգստավայր' },
    description: {
      ru: 'Современное жильё для поездки в горы: кухня, парковка и удобное расположение у подъёмников.',
      en: 'A modern mountain base with a kitchen, parking, and a convenient location near the lifts.',
      hy: 'Ժամանակակից կացարան լեռներում՝ խոհանոցով, կայանատեղիով և ճոպանուղու մոտ հարմար դիրքով։',
    },
    address: {
      ru: 'рядом с канатной дорогой',
      en: 'near the cable car',
      hy: 'ճոպանուղու մոտ',
    },
    pricePerNight: 62000,
    maxGuests: 6,
    bedrooms: 2,
    rating: 9.2,
    reviewCount: 106,
    photoUrl:
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
    amenities: ['wifi', 'kitchen', 'parking', 'washingMachine'],
    type: {
      ru: 'Апартаменты',
      en: 'Apartment',
      hy: 'Բնակարան',
    },
    searchTerms: ['tsaghkadzor', 'ծաղկաձոր', 'цахкадзор', 'kotayk', 'կոտայք'],
    unavailablePeriods: [],
  },
  {
    id: 'gyumri-old-town-flat',
    name: {
      ru: 'Квартира в старом Гюмри',
      en: 'Old Town apartment in Gyumri',
      hy: 'Բնակարան հին Գյումրիում',
    },
    city: { ru: 'Гюмри', en: 'Gyumri', hy: 'Գյումրի' },
    area: { ru: 'Старый город', en: 'Old Town', hy: 'Հին քաղաք' },
    description: {
      ru: 'Квартира в исторической части города рядом с мастерскими, музеями и местными кафе.',
      en: 'An apartment in the historic district, close to workshops, museums, and local cafés.',
      hy: 'Բնակարան քաղաքի պատմական հատվածում՝ արհեստանոցների, թանգարանների և սրճարանների մոտ։',
    },
    address: {
      ru: 'исторический центр',
      en: 'historic center',
      hy: 'պատմական կենտրոն',
    },
    pricePerNight: 28000,
    maxGuests: 3,
    bedrooms: 1,
    rating: 9.5,
    reviewCount: 82,
    photoUrl:
      'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=80',
    amenities: ['wifi', 'kitchen', 'airConditioning'],
    type: {
      ru: 'Апартаменты',
      en: 'Apartment',
      hy: 'Բնակարան',
    },
    searchTerms: ['gyumri', 'գյումրի', 'гюмри', 'shirak', 'շիրակ', 'ши рак'],
    unavailablePeriods: [],
  },
  {
    id: 'jermuk-wellness-stay',
    name: {
      ru: 'Тихий отдых в Джермуке',
      en: 'A quiet stay in Jermuk',
      hy: 'Հանգիստ հանգիստ Ջերմուկում',
    },
    city: { ru: 'Джермук', en: 'Jermuk', hy: 'Ջերմուկ' },
    area: { ru: 'Курортный район', en: 'Resort area', hy: 'Առողջարանային գոտի' },
    description: {
      ru: 'Светлая квартира для отдыха и прогулок рядом с парком и минеральными источниками.',
      en: 'A bright apartment for a relaxing break near the park and mineral springs.',
      hy: 'Լուսավոր բնակարան հանգստի և զբոսանքի համար՝ այգու ու հանքային աղբյուրների մոտ։',
    },
    address: {
      ru: 'рядом с парком и водопадом',
      en: 'near the park and waterfall',
      hy: 'այգու և ջրվեժի մոտ',
    },
    pricePerNight: 39000,
    maxGuests: 3,
    bedrooms: 1,
    rating: 9.0,
    reviewCount: 48,
    photoUrl:
      'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=80',
    amenities: ['wifi', 'kitchen', 'view'],
    type: {
      ru: 'Апартаменты',
      en: 'Apartment',
      hy: 'Բնակարան',
    },
    searchTerms: ['jermuk', 'ջերմուկ', 'джермук', 'vayots dzor', 'вайоц дзор', 'վայոց ձոր'],
    unavailablePeriods: [],
  },
]
