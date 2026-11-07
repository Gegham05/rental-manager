import './style.css'
import { getBookingConflicts } from './services/bookingService'
import { demoCatalog, type DemoProperty } from './data/demoCatalog'
import {
  formatGuestCapacity,
  formatStayDuration,
  getLanguageLocale,
  translateMessage,
  translateText,
  type AppLanguage,
} from './services/i18n'
import { convertReceiptImageToPdf } from './services/receiptPdfService'
import type { Booking } from './models/Booking'
import type { GuestBookingRequest } from './models/GuestBookingRequest'
import type { HouseProfile } from './models/HouseProfile'
import type { Receipt } from './models/Receipt'
import {
  addReceipt,
  createBooking,
  createGuestBookingRequest,
  getAllGuestBookingRequests,
  getGuestBookingRequest,
  acceptGuestBookingRequest,
  rejectGuestBookingRequest,
  deleteGuestBookingRequest,
  deleteExpiredRejectedGuestBookingRequests,
  deleteReceipt,
  expireCompletedTentativeBookings,
  getAllHouseProfiles,
  getAllBookings,
  getAllReceipts,
  getReceiptsForBooking,
  updateBooking,
  deleteBooking,
  replaceAllBookings,
  getHouseCount,
  getAppLanguage,
  getHouseNames,
  getHouseProfile,
  setHouseCount,
  setAppLanguage,
  setHouseName,
  saveHouseProfile,
  removeHouseAndBookings,
} from './storage/bookingRepository'

let configuredHouseCount = 0
let configuredHouseNames: Record<number, string> = {}
let selectedLanguage: AppLanguage = 'ru'
let appReady = false
let pendingBusinessSetup = false

type ToastType = 'error' | 'success' | 'warning'

let toastTimeout: number | undefined

function showToast(message: string, type: ToastType = 'error') {
  let toast = document.querySelector<HTMLDivElement>('#appToast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'appToast'
    toast.className = 'app-toast'
    toast.setAttribute('aria-atomic', 'true')
    document.body.append(toast)
  }

  toast.textContent = translateMessage(message, selectedLanguage)
  toast.className = `app-toast app-toast--${type} is-visible`
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status')
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite')

  if (toastTimeout !== undefined) {
    window.clearTimeout(toastTimeout)
  }
  toastTimeout = window.setTimeout(() => {
    toast?.classList.remove('is-visible')
  }, 5000)
}

const alert = (message: string) => showToast(message, 'error')
const confirm = (message: string) =>
  window.confirm(translateMessage(message, selectedLanguage))
const prompt = (message: string, defaultValue?: string) =>
  window.prompt(
    translateMessage(message, selectedLanguage),
    defaultValue,
  )

function getHouseIds(): number[] {
  return Array.from(
    { length: configuredHouseCount },
    (_, index) => index + 1,
  )
}

function getHouseName(houseId: number): string {
  return (
    configuredHouseNames[houseId]?.trim() ||
    `${translateText('Дом', selectedLanguage)} ${houseId}`
  )
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]
  })
}

function isHouseProfile(value: unknown): value is HouseProfile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const profile = value as Record<string, unknown>
  return (
    Number.isSafeInteger(profile.houseId) &&
    typeof profile.city === 'string' &&
    typeof profile.address === 'string' &&
    typeof profile.description === 'string' &&
    Number.isSafeInteger(profile.maxGuests) &&
    Number(profile.maxGuests) > 0 &&
    (profile.pricePerNight === null ||
      (typeof profile.pricePerNight === 'number' &&
        Number.isFinite(profile.pricePerNight) &&
        profile.pricePerNight >= 0)) &&
    Array.isArray(profile.amenities) &&
    profile.amenities.every((amenity) => typeof amenity === 'string') &&
    (profile.photoDataUrl === null ||
      (typeof profile.photoDataUrl === 'string' &&
        profile.photoDataUrl.startsWith('data:image/'))) &&
    typeof profile.isPublished === 'boolean'
  )
}

function isGuestBookingRequest(value: unknown): value is GuestBookingRequest {
  if (!value || typeof value !== 'object') {
    return false
  }
  const request = value as Record<string, unknown>
  return (
    typeof request.id === 'string' &&
    request.source === 'local' &&
    Number.isSafeInteger(request.houseId) &&
    Number(request.houseId) > 0 &&
    typeof request.propertyName === 'string' &&
    typeof request.city === 'string' &&
    typeof request.checkIn === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(request.checkIn) &&
    typeof request.checkOut === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(request.checkOut) &&
    typeof request.guestName === 'string' &&
    typeof request.guestPhone === 'string' &&
    Number.isSafeInteger(request.guestCount) &&
    Number(request.guestCount) > 0 &&
    typeof request.totalPrice === 'number' &&
    Number.isFinite(request.totalPrice) &&
    request.totalPrice >= 0 &&
    (request.status === 'pending' ||
      request.status === 'accepted' ||
      request.status === 'rejected' ||
      request.status === 'cancelled') &&
    typeof request.createdAt === 'string' &&
    !Number.isNaN(Date.parse(request.createdAt)) &&
    typeof request.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(request.updatedAt)) &&
    (request.bookingId === undefined || typeof request.bookingId === 'string')
  )
}

function normalizeBackupBooking(value: unknown): Booking | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const booking = value as Record<string, unknown>
  const status =
    booking.status === undefined ? 'confirmed' : booking.status
  const startAt =
    typeof booking.startAt === 'string' ? Date.parse(booking.startAt) : NaN
  const endAt =
    typeof booking.endAt === 'string' ? Date.parse(booking.endAt) : NaN

  if (
    typeof booking.id !== 'string' ||
    !booking.id ||
    !Number.isSafeInteger(booking.houseId) ||
    Number(booking.houseId) < 1 ||
    (booking.rentalType !== 'overnight' && booking.rentalType !== 'day') ||
    (status !== 'pending' &&
      status !== 'confirmed' &&
      status !== 'expired') ||
    !Number.isFinite(startAt) ||
    !Number.isFinite(endAt) ||
    endAt <= startAt ||
    typeof booking.guestName !== 'string' ||
    typeof booking.guestPhone !== 'string' ||
    !Number.isSafeInteger(booking.guestCount) ||
    Number(booking.guestCount) < 1 ||
    typeof booking.totalPrice !== 'number' ||
    !Number.isFinite(booking.totalPrice) ||
    booking.totalPrice < 0 ||
    typeof booking.paidAmount !== 'number' ||
    !Number.isFinite(booking.paidAmount) ||
    booking.paidAmount < 0 ||
    booking.paidAmount > booking.totalPrice ||
    typeof booking.comment !== 'string' ||
    typeof booking.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(booking.createdAt)) ||
    typeof booking.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(booking.updatedAt)) ||
    (booking.guestRequestId !== undefined &&
      typeof booking.guestRequestId !== 'string')
  ) {
    return null
  }

  return {
    ...booking,
    status,
  } as Booking
}

function renderContactPhoneButton(phone: string): string {
  const escapedPhone = escapeHtml(phone)
  return `
    <button
      type="button"
      class="contact-phone-button"
      data-contact-phone="${escapedPhone}"
      aria-label="${translateText('Выбрать способ связи:', selectedLanguage)} ${escapedPhone}"
    >
      ☎ ${escapedPhone}
    </button>
  `
}

function renderReceiptButton(booking: Booking): string {
  if ((booking.status ?? 'confirmed') !== 'confirmed') {
    return ''
  }

  return `
    <button
      type="button"
      class="receipt-icon-button"
      data-receipts-booking-id="${booking.id}"
      aria-label="Квитанции по брони"
      title="Фото квитанций"
    >
      🧾
    </button>
  `
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return `data:${blob.type};base64,${btoa(binary)}`
}

function pdfDataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/)
  if (!match) {
    throw new Error('В резервной копии найдена некорректная квитанция.')
  }

  const binary = atob(match[1])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw new Error('Файл квитанции в резервной копии повреждён.')
  }
  return new Blob([bytes], { type: 'application/pdf' })
}

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="app role-selection-page" id="roleSelectionPage">
    <header class="role-selection-header">
      <div>
        <p class="date">Rental Manager</p>
        <h1>Как вы хотите использовать приложение?</h1>
      </div>
      <button
        type="button"
        class="language-button language-switcher language-toggle"
        id="roleLanguageToggle"
        aria-label="Сменить язык"
        title="Сменить язык"
      ></button>
    </header>
    <div class="role-selection-options">
      <button type="button" class="role-option role-option--business" id="businessRoleButton" disabled>
        <span class="role-option-icon" aria-hidden="true">⌂</span>
        <span class="role-option-title">Предприниматель</span>
        <span class="role-option-description">Управлять домами и бронированиями</span>
      </button>
      <button type="button" class="role-option" id="clientRoleButton" disabled>
        <span class="role-option-icon" aria-hidden="true">⌕</span>
        <span class="role-option-title">Клиент</span>
        <span class="role-option-description">Найти жильё и оформить бронирование</span>
      </button>
    </div>
  </main>
  <main class="app hidden-page client-mode-page" id="clientModePage">
    <header class="client-mode-header">
      <div>
        <p class="date">Rental Manager</p>
        <h1>Найдите жильё для поездки</h1>
      </div>
      <button
        type="button"
        class="language-button language-switcher language-toggle"
        id="clientLanguageToggle"
        aria-label="Сменить язык"
        title="Сменить язык"
      ></button>
    </header>
    <p class="client-mode-intro">Укажите место, даты и количество гостей, чтобы найти подходящее жильё.</p>
    <p class="client-demo-notice">Демонстрационный макет: примеры жилья и заявки не связаны с реальными владельцами.</p>
    <nav class="client-view-nav" aria-label="Разделы клиента">
      <button type="button" class="client-view-tab active" data-client-view="search">Поиск</button>
      <button type="button" class="client-view-tab" data-client-view="trips">Мои поездки</button>
      <button type="button" class="client-view-tab" data-client-view="favorites">Избранное</button>
    </nav>
    <form class="client-search-form" id="clientSearchForm">
      <label class="client-search-destination">
        Куда хотите поехать?
        <input
          type="text"
          id="clientDestination"
          name="destination"
          placeholder="Город или место"
          list="armenianDestinations"
          autocomplete="off"
          required
        >
      </label>
      <datalist id="armenianDestinations"></datalist>
      <div class="client-search-dates">
        <label>
          Заезд
          <input type="date" id="clientCheckIn" name="checkIn" required>
        </label>
        <label>
          Выезд
          <input type="date" id="clientCheckOut" name="checkOut" required>
        </label>
        <label>
          Гости
          <input type="number" id="clientGuestCount" name="guests" min="1" value="2" required>
        </label>
      </div>
      <button class="client-search-button" type="submit">
        <span aria-hidden="true">⌕</span>
        Найти жильё
      </button>
    </form>
    <div class="client-search-filters" id="clientSearchFilters">
      <label>Максимальная цена за ночь (֏)
        <input type="number" id="clientMaxPrice" min="0" step="1000" inputmode="numeric" placeholder="Без ограничения">
      </label>
      <label>Удобство
        <select id="clientAmenityFilter">
          <option value="">Любые удобства</option>
          <option value="wifi">Wi-Fi</option>
          <option value="kitchen">Кухня</option>
          <option value="parking">Парковка</option>
          <option value="pool">Бассейн</option>
          <option value="airConditioning">Кондиционер</option>
          <option value="washingMachine">Стиральная машина</option>
          <option value="view">Вид</option>
        </select>
      </label>
      <button type="button" class="client-filters-clear" id="clearClientFilters">Сбросить фильтры</button>
    </div>
    <section class="client-destinations" aria-labelledby="clientDestinationsTitle">
      <h2 id="clientDestinationsTitle">Популярные направления Армении</h2>
      <div class="client-destination-chips">
        <button type="button" data-client-destination="yerevan">Ереван</button>
        <button type="button" data-client-destination="dilijan">Дилижан</button>
        <button type="button" data-client-destination="sevan">Севан</button>
        <button type="button" data-client-destination="tsaghkadzor">Цахкадзор</button>
        <button type="button" data-client-destination="gyumri">Гюмри</button>
        <button type="button" data-client-destination="jermuk">Джермук</button>
      </div>
    </section>
    <section class="client-search-results hidden-page" id="clientSearchResults" aria-live="polite"></section>
    <section class="client-property-details hidden-page" id="clientPropertyDetails" aria-live="polite"></section>
    <button type="button" class="client-back-button" id="clientBackButton">Назад к выбору роли</button>
  </main>
  <main class="app hidden-page" id="todayPage">
    <header class="header">
      <div>
        <p class="date" id="todayDate"></p>
        <h1>Сегодня</h1>
      </div>

      <div class="header-actions">
        <button class="add-button" id="addBooking">
          + Новая бронь
        </button>
        <button
          type="button"
          class="add-button quick-pending-button"
          id="addQuickPendingBooking"
        >
          + Предварительная
        </button>
      </div>
    </header>

    <section class="guest-request-inbox" id="guestRequestInbox"></section>
    <section class="today-summary" id="todaySummary"></section>
    <h2 class="section-title">Дома сегодня</h2>
    <section class="houses" id="houses"></section>
    <section class="upcoming-section">
  <div class="booking-tabs">
    <button
      type="button"
      class="booking-tab active"
      id="upcomingBookingsTab"
    >
      Ближайшие брони
    </button>

    <button
      type="button"
      class="booking-tab"
      id="recentBookingsTab"
    >
      Последние брони
    </button>

  </div>

  <div
    class="upcoming-bookings"
    id="upcomingBookings"
  ></div>
</section>
      </main>
    <main class="app hidden-page" id="calendarPage">
<div class="calendar-header">
  <div>
    <p class="date">Занятость домов</p>
    <h1>Календарь</h1>
  </div>
</div>

<div class="calendar-controls">
  <button type="button" id="calendarPrev" aria-label="Предыдущий период">←</button>
  <button type="button" id="calendarViewToggle" aria-label="Изменить вид календаря">Месяц</button>
  <strong id="calendarMonthLabel"></strong>
  <button type="button" id="calendarNext" aria-label="Следующий период">→</button>
</div>

<div id="calendar"></div>
  </main>
  <div class="modal hidden" id="selectedDayModal">
<div class="modal-backdrop" id="selectedDayBackdrop"></div>
<div class="modal-content day-details-content">
  <div class="modal-header">
    <h2 id="selectedDayTitle">Брони на дату</h2>
    <button type="button" class="close-button" id="closeSelectedDay">×</button>
  </div>
  <div id="selectedDayBookings" class="selected-day-bookings"></div>
</div>
  </div>
  <main class="app hidden-page" id="searchPage">
  <div class="search-header">
    <p class="date">Бронирования</p>
    <h1>Поиск</h1>
  </div>

  <input
    type="search"
    id="bookingSearch"
    class="search-input"
    placeholder="Введите имя, номер телефона или дату"
    autocomplete="off"
  />

  <div class="search-filters">
    <label>
      Дом
      <select id="searchHouseFilter">
        <option value="all">Все дома</option>
      </select>
    </label>
    <label>
      Статус
      <select id="searchStatusFilter">
        <option value="all">Все статусы</option>
        <option value="confirmed">Подтверждённые</option>
        <option value="pending">Предварительные</option>
        <option value="expired">Истёкшие</option>
      </select>
    </label>
    <label>
      С даты
      <input type="date" id="searchDateFrom">
    </label>
    <label>
      По дату
      <input type="date" id="searchDateTo">
    </label>
    <button type="button" class="search-clear-button" id="clearSearchFilters">
      Сбросить фильтры
    </button>
  </div>
  <div id="searchResults" class="search-results"></div>
</main>
  <main class="app hidden-page" id="settingsPage">
  <div class="settings-page-header">
    <div class="search-header">
      <p class="date">Приложение</p>
      <div class="settings-title-row">
        <h1>Настройки</h1>
        <button
          type="button"
          class="language-button language-switcher language-toggle"
          id="languageToggle"
          aria-label="Сменить язык"
          title="Сменить язык"
        ><svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" rx="2" fill="#fff"/><path fill="#0039a6" d="M0 6.67h30v6.66H0z"/><path fill="#d52b1e" d="M0 13.33h30v6.67H0z"/></svg></button>
      </div>
    </div>
  </div>
  <section class="backup-section">
    <h2>Резервная копия</h2>
    <p>
      Сохраните копию бронирований, заявок и настроек на устройство.
    </p>
    <p class="backup-status" id="backupStatus">
      Последняя копия: —
    </p>
    <button class="backup-button" id="exportBackup">
      Экспортировать данные
    </button>
    <button class="backup-button secondary" id="importBackup">
      Импортировать данные
    </button>
    <input
      type="file"
      id="backupFile"
      accept=".json,application/json"
      hidden
    />
  </section>
  <section class="backup-section">
    <h2>Режим</h2>
  <p>Сейчас вы используете приложение как предприниматель.</p>
  <button class="backup-button secondary" id="businessModeChangeButton">
    Сменить режим
  </button>
</section>
  <section class="backup-section">
  <h2>Дома</h2>
  <p id="houseCountSetting">Количество домов: —</p>
  <div class="house-settings-actions">
    <button class="backup-button" id="addHouse">
      Добавить дом
    </button>
    <div class="house-removal-controls">
      <label for="houseToRemove">Какой дом удалить?</label>
      <select id="houseToRemove"></select>
      <button class="backup-button secondary" id="removeHouse">
        Удалить выбранный дом
      </button>
    </div>
  </div>
  <div class="house-name-controls">
    <label for="houseToRename">Какой дом переименовать?</label>
    <select id="houseToRename"></select>
    <label for="houseNameInput">Название дома</label>
    <input id="houseNameInput" type="text" maxlength="60" autocomplete="off">
    <button class="backup-button secondary" id="saveHouseName">
      Сохранить название
    </button>
  </div>
  <section class="property-profile-editor">
    <h3>Информация для клиентов</h3>
    <label for="profileHouseSelect">Объект</label>
    <select id="profileHouseSelect"></select>
    <form id="propertyProfileForm">
      <label>
        Город или район
        <input type="text" name="city" maxlength="100" autocomplete="address-level2">
      </label>
      <label>
        Адрес
        <input type="text" name="address" maxlength="200" autocomplete="street-address">
      </label>
      <label>
        Описание
        <textarea name="description" rows="4" maxlength="2000"></textarea>
      </label>
      <div class="property-profile-numbers">
        <label>
          Максимум гостей
          <input type="number" name="maxGuests" min="1" max="100" step="1" value="2" required>
        </label>
        <label>
          Цена за ночь (֏)
          <input type="number" name="pricePerNight" min="0" step="1">
        </label>
      </div>
      <fieldset class="property-amenities">
        <legend>Удобства</legend>
        <label><input type="checkbox" name="amenities" value="wifi"> Wi-Fi</label>
        <label><input type="checkbox" name="amenities" value="kitchen"> Кухня</label>
        <label><input type="checkbox" name="amenities" value="parking"> Парковка</label>
        <label><input type="checkbox" name="amenities" value="pool"> Бассейн</label>
        <label><input type="checkbox" name="amenities" value="airConditioning"> Кондиционер</label>
        <label><input type="checkbox" name="amenities" value="washingMachine"> Стиральная машина</label>
        <label><input type="checkbox" name="amenities" value="view"> Вид</label>
      </fieldset>
      <label class="property-photo-label">
        Фото жилья
        <input type="file" id="propertyPhotoInput" accept="image/*">
      </label>
      <div class="property-photo-preview hidden-page" id="propertyPhotoPreview">
        <img id="propertyPhotoImage" alt="Фото жилья">
        <button type="button" class="backup-button secondary" id="removePropertyPhoto">Удалить фото</button>
      </div>
      <label class="property-publish-toggle">
        <input type="checkbox" name="isPublished">
        Показывать объект в клиентском поиске на этом устройстве
      </label>
      <p class="property-local-note">
        Пока данные доступны только в этом браузере. Для публикации клиентам с других устройств понадобится общий сервер.
      </p>
      <button class="backup-button" type="submit">Сохранить карточку жилья</button>
    </form>
  </section>
</section>
</main>
  <nav class="bottom-nav hidden-page">
  <button class="nav-button active" id="todayNav">
    <span>⌂</span>
    Сегодня
  </button>

  <button class="nav-button" id="calendarNav">
    <span>▦</span>
    Календарь
  </button>

  <button class="nav-button" id="searchNav">
    <span>⌕</span>
    Поиск
  </button>

  <button class="nav-button" id="settingsNav">
    <span>⚙</span>
    Настройки
  </button>
</nav>
  <div class="modal hidden" id="houseSetupModal">
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h2>Настройка домов</h2>
      </div>
      <form id="houseSetupForm">
        <label>
          Сколько домов добавить?
          <input
            type="number"
            name="houseCount"
            min="1"
            step="1"
            value="1"
            required
          >
        </label>
        <button type="submit" class="submit-button">
          Продолжить
        </button>
      </form>
    </div>
  </div>
  <div class="modal hidden" id="bookingModal">
    <div class="modal-backdrop" id="modalBackdrop"></div>

    <div class="modal-content">
      <div class="modal-header">
        <h2>Новая бронь</h2>
        <button class="close-button" id="closeModal">×</button>
      </div>

      <form id="bookingForm">

        <label>
          Дом
          <select name="house"></select>
        </label>

        <div class="rental-types">
          <label class="radio-option">
            <input
              type="radio"
              name="rentalType"
              value="overnight"
              checked
            >
            С ночёвкой
          </label>

          <label class="radio-option">
            <input
              type="radio"
              name="rentalType"
              value="day"
            >
            Без ночёвки
          </label>
        </div>

        <div class="two-columns">
          <label>
            Цена
            <input
              type="number"
              name="price"
              min="0"
              placeholder="80000"
              required
            >
          </label>

          <label>
            Предоплата
            <input
              type="number"
              name="paid"
              min="0"
              value="0"
            >
          </label>
        </div>

        <div class="remaining">
          Осталось:
          <strong id="remainingAmount">0 ֏</strong>
        </div>

        <div class="two-columns">
          <label>
            Заезд
            <span class="date-time-inputs">
              <input type="date" data-date-for="start">
              <input
                type="text"
                data-time-for="start"
                inputmode="numeric"
                maxlength="5"
                placeholder="14:00"
                aria-label="Время заезда"
              >
            </span>
            <input type="hidden" name="start">
          </label>

          <label>
            Выезд
            <span class="date-time-inputs">
              <input type="date" data-date-for="end">
              <input
                type="text"
                data-time-for="end"
                inputmode="numeric"
                maxlength="5"
                placeholder="11:00"
                aria-label="Время выезда"
              >
            </span>
            <input type="hidden" name="end">
          </label>
        </div>

        <label>
          Имя клиента
          <input
            type="text"
            name="guestName"
            placeholder="Например, Арман"
          >
        </label>

        <label>
          Телефон
          <input
            type="tel"
            name="phone"
            placeholder="+374"
          >
        </label>

        <label>
          Количество гостей
          <input
            type="number"
            name="guestCount"
            value="1"
            min="1"
          >
        </label>

        <label>
          Комментарий
          <textarea
            name="comment"
            rows="3"
          ></textarea>
        </label>

        <div class="booking-actions">
  <button
    type="submit"
    class="pending-booking-button"
    id="savePendingButton"
  >
    Предварительно
  </button>

  <button
    type="submit"
    class="submit-button"
    id="saveBookingButton"
  >
    Забронировать
  </button>
</div>

      </form>
    </div>
  </div>
  <div class="modal hidden" id="quickPendingModal">
    <div class="modal-backdrop" id="quickPendingBackdrop"></div>

    <div class="modal-content">
      <div class="modal-header">
        <h2>Предварительная бронь</h2>
        <button
          type="button"
          class="close-button"
          id="closeQuickPendingModal"
        >×</button>
      </div>

      <form id="quickPendingForm">
        <label>
          Номер дома, заезд, выезд, цена
          <input
            type="text"
            name="bookingLine"
            placeholder="1 25.12 27.12 80000"
            inputmode="text"
            autocomplete="off"
            required
          >
          <span class="quick-pending-hint">
            Вводите через пробел. В первом поле укажите номер дома; год в датах можно не указывать.
          </span>
        </label>

        <label>
          Комментарий
          <textarea
            name="comment"
            rows="3"
          ></textarea>
        </label>

        <button type="submit" class="submit-button">
          Сохранить предварительную бронь
        </button>
      </form>
    </div>
  </div>
  <div class="modal hidden" id="detailsModal">
  <div class="modal-backdrop" id="detailsBackdrop"></div>

  <div class="modal-content">
    <div class="modal-header">
      <h2 id="detailsHouse">Бронь</h2>

      <button class="close-button" id="closeDetails">
        ×
      </button>
    </div>

    <div id="bookingDetails"></div>
  </div>
</div>
  <div class="modal hidden" id="contactOptionsModal">
    <div class="modal-backdrop" id="contactOptionsBackdrop"></div>
    <div class="modal-content contact-options-content">
      <div class="modal-header">
        <h2>Связаться</h2>
        <button
          type="button"
          class="close-button"
          id="closeContactOptions"
        >×</button>
      </div>
      <p class="contact-options-phone" id="contactOptionsPhone"></p>
      <div class="contact-options-list">
        <a id="contactWhatsApp" class="contact-option" target="_blank" rel="noopener noreferrer">
          Написать в WhatsApp
        </a>
        <a id="contactTelegram" class="contact-option" target="_blank" rel="noopener noreferrer">
          Написать в Telegram
        </a>
        <a id="contactCall" class="contact-option">
          Позвонить
        </a>
      </div>
    </div>
  </div>
  <div class="modal hidden" id="receiptModal">
    <div class="modal-backdrop" id="receiptBackdrop"></div>
    <div class="modal-content receipt-modal-content">
      <div class="modal-header">
        <h2 id="receiptModalTitle">Квитанции</h2>
        <button type="button" class="close-button" id="closeReceiptModal">×</button>
      </div>
      <button type="button" class="backup-button" id="addReceiptButton">
        Добавить фото квитанции
      </button>
      <input
        type="file"
        id="receiptFileInput"
        accept="image/*"
        multiple
        hidden
      >
      <div id="receiptList" class="receipt-list"></div>
    </div>
  </div>
`

const languageToggles =
  document.querySelectorAll<HTMLButtonElement>('.language-toggle')
const originalTextByNode =
  new WeakMap<Text, { original: string; translated: string }>()
const originalAttributesByElement =
  new WeakMap<Element, Map<string, { original: string; translated: string }>>()

function translateTextNode(node: Text, allowPhraseTranslation = false) {
  const current = node.data
  let record = originalTextByNode.get(node)
  if (!record || current !== record.translated) {
    record = { original: current, translated: current }
    originalTextByNode.set(node, record)
  }

  const original = record.original
  const trimmed = original.trim()
  const translated = allowPhraseTranslation
    ? translateMessage(trimmed, selectedLanguage)
    : translateText(trimmed, selectedLanguage)

  if (trimmed.length === 0) {
    return
  }

  if (translated !== trimmed) {
    const leadingWhitespace = original.match(/^\s*/)?.[0] ?? ''
    const trailingWhitespace = original.match(/\s*$/)?.[0] ?? ''
    record.translated = `${leadingWhitespace}${translated}${trailingWhitespace}`
    if (node.data !== record.translated) {
      node.data = record.translated
    }
  } else if (node.data !== original) {
    record.translated = original
    node.data = original
  } else {
    record.translated = original
  }
}

function translateElement(element: Element) {
  const attributes = ['alt', 'placeholder', 'title', 'aria-label']
  let originals = originalAttributesByElement.get(element)
  if (!originals) {
    originals = new Map<
      string,
      { original: string; translated: string }
    >()
    originalAttributesByElement.set(element, originals)
  }

  for (const attribute of attributes) {
    if (!element.hasAttribute(attribute)) {
      continue
    }

    const current = element.getAttribute(attribute)!
    let record = originals.get(attribute)
    if (!record || current !== record.translated) {
      record = { original: current, translated: current }
      originals.set(attribute, record)
    }
    const translated = translateText(record.original, selectedLanguage)
    record.translated = translated

    if (translated !== current) {
      element.setAttribute(attribute, translated)
    }
  }
}

function translateDom(root: Node = app) {
  if (root instanceof Text) {
    if (
      root.parentElement &&
      !root.parentElement.closest(
        '.guest-name, .booking-guest, .house-name, .contact-options-phone, .contact-phone-button, textarea, input',
      )
    ) {
      translateTextNode(
        root,
        root.parentElement.closest(
          '.booking-time, .guest-count, .booking-payment, .payment-due, .backup-status, .booking-dates, .day-booking-summary',
        ) !== null,
      )
    }
    return
  }

  if (!(root instanceof Element || root instanceof DocumentFragment)) {
    return
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let textNode = walker.nextNode()
  while (textNode) {
    const parent = textNode.parentElement
    if (
      parent &&
      !parent.closest(
        '.guest-name, .booking-guest, .house-name, .contact-options-phone, .contact-phone-button, textarea, input',
      )
    ) {
      translateTextNode(
        textNode as Text,
        parent.closest(
          '.booking-time, .guest-count, .booking-payment, .payment-due, .backup-status, .booking-dates, .day-booking-summary',
        ) !== null,
      )
    }
    textNode = walker.nextNode()
  }

  if (root instanceof Element) {
    translateElement(root)
    root.querySelectorAll('*').forEach(translateElement)
  }
}

translateDom()

function updateLanguageButtons() {
  const languageOptions: Record<AppLanguage, { flag: string; name: string }> = {
    hy: {
      flag: '<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" rx="2" fill="#f2a800"/><path fill="#0033a0" d="M0 0h30v13.33H0z"/><path fill="#d90012" d="M0 0h30v6.67H0z"/></svg>',
      name: 'Հայերեն',
    },
    ru: {
      flag: '<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" rx="2" fill="#fff"/><path fill="#0039a6" d="M0 6.67h30v6.66H0z"/><path fill="#d52b1e" d="M0 13.33h30v6.67H0z"/></svg>',
      name: 'Русский',
    },
    en: {
      flag: '<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" rx="2" fill="#fff"/><path stroke="#b22234" stroke-width="1.54" d="M0 .77h30M0 3.85h30M0 6.92h30M0 10h30M0 13.08h30M0 16.15h30M0 19.23h30"/><path fill="#3c3b6e" d="M0 0h13v10H0z"/><path fill="#fff" d="m2 1 .45 1.1 1.2.08-.92.77.3 1.17L2 3.47l-1.03.65.3-1.17-.92-.77 1.2-.08zM6.5 1l.45 1.1 1.2.08-.92.77.3 1.17-1.03-.65-1.03.65.3-1.17-.92-.77 1.2-.08zM11 1l.45 1.1 1.2.08-.92.77.3 1.17L11 3.47l-1.03.65.3-1.17-.92-.77 1.2-.08zM4.25 5l.45 1.1 1.2.08-.92.77.3 1.17-1.03-.65-1.03.65.3-1.17-.92-.77 1.2-.08zM8.75 5l.45 1.1 1.2.08-.92.77.3 1.17-1.03-.65-1.03.65.3-1.17-.92-.77 1.2-.08z"/></svg>',
      name: 'English',
    },
  }
  const current = languageOptions[selectedLanguage]
  const nextLanguage: AppLanguage =
    selectedLanguage === 'hy' ? 'ru' : selectedLanguage === 'ru' ? 'en' : 'hy'
  const next = languageOptions[nextLanguage]

  languageToggles.forEach((button) => {
    button.innerHTML = current.flag
    button.setAttribute(
      'aria-label',
      `${current.name}. ${translateText('Переключить на', selectedLanguage)} ${next.name}`,
    )
    button.title =
      `${current.name} · ${translateText('Переключить на', selectedLanguage)} ${next.name}`
  })
}

async function changeLanguage(language: string) {
  if (language !== 'hy' && language !== 'ru' && language !== 'en') {
    throw new Error(`Unsupported interface language: ${language}`)
  }

  const previousLanguage = selectedLanguage
  selectedLanguage = language
  await setAppLanguage(language)
  updateLanguageButtons()
  translateDom()
  renderTodayDate()
  updateHouseSettings()
  renderSearchHouseOptions()
  updateClientDestinationOptions()
  const selectedDestination = clientDestinations.find(
    (destination) =>
      destination.names[previousLanguage] === clientDestination.value,
  )
  if (selectedDestination) {
    clientDestination.value = selectedDestination.names[language]
  }
  await refreshPropertyProfileEditor()
  await refreshBookingViews()
  const activeDetailId = currentClientDetailId
  if (!clientModePage.classList.contains('hidden-page')) {
    if (currentClientView === 'trips') {
      await renderClientTrips()
    } else if (currentClientView === 'favorites') {
      await renderClientFavorites()
    } else {
      await renderClientSearchResults()
    }
    if (activeDetailId) await renderClientPropertyDetails(activeDetailId)
  }
}

languageToggles.forEach((button) => {
  button.addEventListener('click', () => {
    const nextLanguage: AppLanguage =
      selectedLanguage === 'hy'
        ? 'ru'
        : selectedLanguage === 'ru'
          ? 'en'
          : 'hy'
    void changeLanguage(nextLanguage)
  })
})

updateLanguageButtons()

  const contactOptionsModal =
    document.querySelector<HTMLDivElement>('#contactOptionsModal')!
  const contactOptionsPhone =
    document.querySelector<HTMLElement>('#contactOptionsPhone')!
  const contactWhatsApp =
    document.querySelector<HTMLAnchorElement>('#contactWhatsApp')!
  const contactTelegram =
    document.querySelector<HTMLAnchorElement>('#contactTelegram')!
  const contactCall =
    document.querySelector<HTMLAnchorElement>('#contactCall')!

  function openContactOptions(phone: string) {
    const digits = phone.replace(/\D/g, '')
    if (!digits) {
      alert('В номере телефона нет цифр.')
      return
    }

    const hasInternationalPrefix = phone.trim().startsWith('+')
    const hasInternationalDialPrefix = digits.startsWith('00')
    const hasArmenianLocalPrefix = digits.startsWith('0')
    let internationalDigits = digits

    if (hasInternationalDialPrefix) {
      internationalDigits = digits.slice(2)
    } else if (hasArmenianLocalPrefix && !hasInternationalPrefix) {
      internationalDigits = `374${digits.slice(1)}`
    }

    const callNumber =
      hasInternationalPrefix ||
      hasInternationalDialPrefix ||
      hasArmenianLocalPrefix
        ? `+${internationalDigits}`
        : digits

    contactOptionsPhone.textContent = phone
    contactWhatsApp.href = `https://wa.me/${internationalDigits}`
    contactTelegram.href = `https://t.me/+${internationalDigits}`
    contactCall.href = `tel:${callNumber}`
    contactOptionsModal.classList.remove('hidden')
  }

  function closeContactOptions() {
    contactOptionsModal.classList.add('hidden')
  }

  document
    .querySelector<HTMLButtonElement>('#closeContactOptions')!
    .addEventListener('click', closeContactOptions)
  document
    .querySelector<HTMLDivElement>('#contactOptionsBackdrop')!
    .addEventListener('click', closeContactOptions)

  for (const link of [contactWhatsApp, contactTelegram, contactCall]) {
    link.addEventListener('click', closeContactOptions)
  }

  const receiptModal =
    document.querySelector<HTMLDivElement>('#receiptModal')!
  const receiptModalTitle =
    document.querySelector<HTMLHeadingElement>('#receiptModalTitle')!
  const receiptList =
    document.querySelector<HTMLDivElement>('#receiptList')!
  const receiptFileInput =
    document.querySelector<HTMLInputElement>('#receiptFileInput')!
  let activeReceiptBookingId: string | null = null
  let receiptObjectUrls: string[] = []

  function clearReceiptObjectUrls() {
    for (const url of receiptObjectUrls) {
      URL.revokeObjectURL(url)
    }
    receiptObjectUrls = []
  }

  async function renderReceiptList() {
    if (!activeReceiptBookingId) {
      return
    }

    clearReceiptObjectUrls()
    const receipts = await getReceiptsForBooking(activeReceiptBookingId)
    if (receipts.length === 0) {
      receiptList.innerHTML =
        '<p class="receipt-list-empty">Квитанций пока нет.</p>'
      translateDom(receiptList)
      return
    }

    receiptList.innerHTML = receipts
      .map((receipt) => {
        const url = URL.createObjectURL(receipt.pdf)
        receiptObjectUrls.push(url)
        return `
          <div class="receipt-item">
            <a
              class="receipt-file-link"
              href="${url}"
              target="_blank"
              rel="noopener noreferrer"
              download="${escapeHtml(receipt.fileName)}"
            >
              ${escapeHtml(receipt.fileName)}
              <span>${new Date(receipt.createdAt).toLocaleDateString(getLanguageLocale(selectedLanguage))}</span>
            </a>
            <button
              type="button"
              class="receipt-delete-button"
              data-delete-receipt="${receipt.id}"
              aria-label="Удалить квитанцию"
            >
              Удалить
            </button>
          </div>
        `
      })
      .join('')
    translateDom(receiptList)
  }

  async function openReceiptManager(bookingId: string) {
    const bookings = await getAllBookings()
    const booking = bookings.find((item) => item.id === bookingId)
    if (!booking) {
      alert('Бронь не найдена.')
      return
    }
    if ((booking.status ?? 'confirmed') !== 'confirmed') {
      alert('Квитанции можно прикреплять только к подтверждённой брони.')
      return
    }

    activeReceiptBookingId = bookingId
    receiptModalTitle.textContent =
      `${translateText('Квитанции', selectedLanguage)} · ${getHouseName(booking.houseId)}`
    await renderReceiptList()
    receiptModal.classList.remove('hidden')
  }

  function closeReceiptManager() {
    receiptModal.classList.add('hidden')
    activeReceiptBookingId = null
    receiptFileInput.value = ''
    clearReceiptObjectUrls()
  }

  document
    .querySelector<HTMLButtonElement>('#closeReceiptModal')!
    .addEventListener('click', closeReceiptManager)
  document
    .querySelector<HTMLDivElement>('#receiptBackdrop')!
    .addEventListener('click', closeReceiptManager)

  document
    .querySelector<HTMLButtonElement>('#addReceiptButton')!
    .addEventListener('click', () => receiptFileInput.click())

  receiptFileInput.addEventListener('change', async () => {
    const bookingId = activeReceiptBookingId
    const files = Array.from(receiptFileInput.files ?? [])
    receiptFileInput.value = ''
    if (!bookingId || files.length === 0) {
      return
    }

    const errors: string[] = []
    for (const file of files) {
      try {
        const pdf = await convertReceiptImageToPdf(file)
        const baseName =
          file.name.replace(/\.[^.]+$/, '').trim() || 'receipt'
        const receipt: Receipt = {
          id: crypto.randomUUID(),
          bookingId,
          fileName: `${baseName}.pdf`,
          pdf,
          createdAt: new Date().toISOString(),
        }
        await addReceipt(receipt)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Неизвестная ошибка'
        errors.push(`${file.name}: ${message}`)
      }
    }

    await renderReceiptList()
    if (errors.length > 0) {
      showToast(
        `Не удалось добавить некоторые фотографии:\n\n${errors.join('\n')}`,
        'warning',
      )
    }
  })

  receiptList.addEventListener('click', async (event) => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }
    const deleteButton =
      target.closest<HTMLButtonElement>('[data-delete-receipt]')
    const receiptId = deleteButton?.dataset.deleteReceipt
    if (!receiptId) {
      return
    }

    if (!confirm('Удалить эту квитанцию?')) {
      return
    }
    await deleteReceipt(receiptId)
    await renderReceiptList()
  })

  app.addEventListener(
    'click',
    (event) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const receiptButton =
        target.closest<HTMLButtonElement>('[data-receipts-booking-id]')
      const receiptBookingId = receiptButton?.dataset.receiptsBookingId
      if (receiptBookingId) {
        event.preventDefault()
        event.stopPropagation()
        void openReceiptManager(receiptBookingId)
        return
      }

      const phoneButton =
        target.closest<HTMLButtonElement>('[data-contact-phone]')
      if (!phoneButton) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      openContactOptions(phoneButton.dataset.contactPhone ?? '')
    },
    true,
  )

  const todayPage =
    document.querySelector<HTMLElement>('#todayPage')!
const roleSelectionPage =
  document.querySelector<HTMLElement>('#roleSelectionPage')!
const clientModePage =
  document.querySelector<HTMLElement>('#clientModePage')!
const bottomNav =
  document.querySelector<HTMLElement>('.bottom-nav')!

const calendarPage =
  document.querySelector<HTMLElement>('#calendarPage')!

const todayNav =
  document.querySelector<HTMLButtonElement>('#todayNav')!

const calendarNav =
  document.querySelector<HTMLButtonElement>('#calendarNav')!

const searchPage =
  document.querySelector<HTMLElement>('#searchPage')!

const settingsPage =
  document.querySelector<HTMLElement>('#settingsPage')!

const searchNav =
  document.querySelector<HTMLButtonElement>('#searchNav')!

const settingsNav =
  document.querySelector<HTMLButtonElement>('#settingsNav')!

const todayDate =
  document.querySelector<HTMLElement>('#todayDate')!

function renderTodayDate() {
  const now = new Date()

  todayDate.textContent = now.toLocaleDateString(getLanguageLocale(selectedLanguage), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

renderTodayDate()

function showTodayPage() {
  roleSelectionPage.classList.add('hidden-page')
  clientModePage.classList.add('hidden-page')
  todayPage.classList.remove('hidden-page')
  calendarPage.classList.add('hidden-page')
  searchPage.classList.add('hidden-page')
  settingsPage.classList.add('hidden-page')
  bottomNav.classList.remove('hidden-page')

  todayNav.classList.add('active')
  calendarNav.classList.remove('active')
  searchNav.classList.remove('active')
  settingsNav.classList.remove('active')
}

function showCalendarPage() {
  roleSelectionPage.classList.add('hidden-page')
  clientModePage.classList.add('hidden-page')
  todayPage.classList.add('hidden-page')
  calendarPage.classList.remove('hidden-page')
  searchPage.classList.add('hidden-page')
  settingsPage.classList.add('hidden-page')
  bottomNav.classList.remove('hidden-page')

  todayNav.classList.remove('active')
  calendarNav.classList.add('active')
  searchNav.classList.remove('active')
  settingsNav.classList.remove('active')

  renderCalendar()
}

function showSearchPage() {
  roleSelectionPage.classList.add('hidden-page')
  clientModePage.classList.add('hidden-page')
  todayPage.classList.add('hidden-page')
  calendarPage.classList.add('hidden-page')
  searchPage.classList.remove('hidden-page')
  settingsPage.classList.add('hidden-page')
  bottomNav.classList.remove('hidden-page')

  todayNav.classList.remove('active')
  calendarNav.classList.remove('active')
  searchNav.classList.add('active')
  settingsNav.classList.remove('active')
}

function showSettingsPage() {
  roleSelectionPage.classList.add('hidden-page')
  clientModePage.classList.add('hidden-page')
  todayPage.classList.add('hidden-page')
  calendarPage.classList.add('hidden-page')
  searchPage.classList.add('hidden-page')
  settingsPage.classList.remove('hidden-page')
  bottomNav.classList.remove('hidden-page')

  todayNav.classList.remove('active')
  calendarNav.classList.remove('active')
  searchNav.classList.remove('active')
  settingsNav.classList.add('active')
}

function showRoleSelection() {
  roleSelectionPage.classList.remove('hidden-page')
  clientModePage.classList.add('hidden-page')
  todayPage.classList.add('hidden-page')
  calendarPage.classList.add('hidden-page')
  searchPage.classList.add('hidden-page')
  settingsPage.classList.add('hidden-page')
  bottomNav.classList.add('hidden-page')
}

function showClientMode() {
  roleSelectionPage.classList.add('hidden-page')
  clientModePage.classList.remove('hidden-page')
  todayPage.classList.add('hidden-page')
  calendarPage.classList.add('hidden-page')
  searchPage.classList.add('hidden-page')
  settingsPage.classList.add('hidden-page')
  bottomNav.classList.add('hidden-page')
  clientPropertyDetails.classList.add('hidden-page')
  currentClientDetailId = null
  const today = new Date()
  const localToday = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
  clientCheckIn.min = localToday
  if (!clientCheckIn.value || clientCheckIn.value < localToday) {
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    clientCheckIn.value = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0'),
    ].join('-')
  }
  clientCheckOut.min = clientCheckIn.value
  if (!clientCheckOut.value || clientCheckOut.value <= clientCheckIn.value) {
    const checkOut = new Date(`${clientCheckIn.value}T00:00:00`)
    checkOut.setDate(checkOut.getDate() + 1)
    clientCheckOut.value = [
      checkOut.getFullYear(),
      String(checkOut.getMonth() + 1).padStart(2, '0'),
      String(checkOut.getDate()).padStart(2, '0'),
    ].join('-')
  }
  showClientView('search')
}

document
  .querySelector<HTMLButtonElement>('#clientRoleButton')!
  .addEventListener('click', showClientMode)
document
  .querySelector<HTMLButtonElement>('#clientBackButton')!
  .addEventListener('click', showRoleSelection)

document
  .querySelectorAll<HTMLButtonElement>('[data-client-view]')
  .forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.clientView
      if (view === 'search' || view === 'trips' || view === 'favorites') {
        showClientView(view)
      }
    })
  })

const clientSearchForm =
  document.querySelector<HTMLFormElement>('#clientSearchForm')!
const clientDestination =
  document.querySelector<HTMLInputElement>('#clientDestination')!
const clientCheckIn =
  document.querySelector<HTMLInputElement>('#clientCheckIn')!
const clientCheckOut =
  document.querySelector<HTMLInputElement>('#clientCheckOut')!
const clientSearchResults =
  document.querySelector<HTMLElement>('#clientSearchResults')!
const clientMaxPriceInput =
  document.querySelector<HTMLInputElement>('#clientMaxPrice')!
const clientAmenityFilter =
  document.querySelector<HTMLSelectElement>('#clientAmenityFilter')!

const clientGuestCount =
  document.querySelector<HTMLInputElement>('#clientGuestCount')!
const clientPropertyDetails =
  document.querySelector<HTMLElement>('#clientPropertyDetails')!
const clientDestinations = [
  { key: 'yerevan', names: { ru: 'Ереван', en: 'Yerevan', hy: 'Երևան' } },
  { key: 'dilijan', names: { ru: 'Дилижан', en: 'Dilijan', hy: 'Դիլիջան' } },
  { key: 'sevan', names: { ru: 'Севан', en: 'Sevan', hy: 'Սևան' } },
  { key: 'tsaghkadzor', names: { ru: 'Цахкадзор', en: 'Tsaghkadzor', hy: 'Ծաղկաձոր' } },
  { key: 'gyumri', names: { ru: 'Гюмри', en: 'Gyumri', hy: 'Գյումրի' } },
  { key: 'jermuk', names: { ru: 'Джермук', en: 'Jermuk', hy: 'Ջերմուկ' } },
]

interface ClientListing {
  id: string
  source: 'demo' | 'local'
  title: string
  city: string
  area: string
  address: string
  description: string
  pricePerNight: number
  maxGuests: number
  bedrooms: number | null
  rating: number | null
  reviewCount: number
  photoUrl: string | null
  amenities: string[]
  propertyType: string
  hostName: string | null
  searchTerms: string[]
  unavailablePeriods: Array<{ start: string; end: string }>
}

const amenityLabels: Record<string, string> = {
  wifi: 'Wi-Fi',
  kitchen: 'Кухня',
  parking: 'Парковка',
  pool: 'Бассейн',
  airConditioning: 'Кондиционер',
  washingMachine: 'Стиральная машина',
  view: 'Вид',
}

function showClientView(view: 'search' | 'trips' | 'favorites') {
  currentClientView = view
  const searchForm = document.querySelector<HTMLElement>('#clientSearchForm')!
  const searchFilters = document.querySelector<HTMLElement>('#clientSearchFilters')!
  const destinations = document.querySelector<HTMLElement>('.client-destinations')!
  searchForm.classList.toggle('hidden-page', view !== 'search')
  searchFilters.classList.toggle('hidden-page', view !== 'search')
  destinations.classList.toggle('hidden-page', view !== 'search')
  document
    .querySelectorAll<HTMLButtonElement>('[data-client-view]')
    .forEach((button) => {
      const active = button.dataset.clientView === view
      button.classList.toggle('active', active)
      button.setAttribute('aria-pressed', String(active))
    })
  currentClientDetailId = null
  clientPropertyDetails.classList.add('hidden-page')
  clientSearchResults.classList.remove('hidden-page')
  if (view === 'trips') {
    void renderClientTrips()
  } else if (view === 'favorites') {
    void renderClientFavorites()
  } else {
    void renderClientSearchResults()
  }
}

let currentClientListings: ClientListing[] = []
let currentClientDetailId: string | null = null
let clientStayNights = 1
let clientSortOrder: 'recommended' | 'price-low' | 'rating' = 'recommended'
let clientMaxPrice = ''
let clientSelectedAmenity = ''
let currentClientView: 'search' | 'trips' | 'favorites' = 'search'
let clientInquiryDraft = { guestName: '', guestPhone: '', feedbackShown: false }
const CLIENT_FAVORITES_STORAGE_KEY = 'clientFavoriteListingIds'

function getClientFavoriteIds(): string[] {
  const savedFavorites = localStorage.getItem(CLIENT_FAVORITES_STORAGE_KEY)
  if (!savedFavorites) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(savedFavorites)
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
      throw new Error('Invalid saved favorites data')
    }
    return [...new Set(parsed)]
  } catch (error) {
    localStorage.removeItem(CLIENT_FAVORITES_STORAGE_KEY)
    showToast('Не удалось прочитать список избранного.', 'error')
    console.error('Failed to read saved client favorites:', error)
    return []
  }
}

function saveClientFavoriteIds(favorites: string[]) {
  localStorage.setItem(CLIENT_FAVORITES_STORAGE_KEY, JSON.stringify(favorites))
}

function isClientFavorite(listingId: string): boolean {
  return getClientFavoriteIds().includes(listingId)
}

function toggleClientFavorite(listingId: string): boolean {
  const favorites = getClientFavoriteIds()
  const alreadyFavorite = favorites.includes(listingId)
  saveClientFavoriteIds(
    alreadyFavorite
      ? favorites.filter((id) => id !== listingId)
      : [...favorites, listingId],
  )
  return !alreadyFavorite
}

function updateClientDestinationOptions() {
  const datalist =
    document.querySelector<HTMLDataListElement>('#armenianDestinations')
  if (!datalist) {
    return
  }
  datalist.innerHTML = clientDestinations
    .map(
      (destination) =>
        `<option value="${destination.names[selectedLanguage]}"></option>`,
    )
    .join('')
  document
    .querySelectorAll<HTMLButtonElement>('[data-client-destination]')
    .forEach((button) => {
      const destination = clientDestinations.find(
        (item) => item.key === button.dataset.clientDestination,
      )
      if (destination) {
        button.textContent = destination.names[selectedLanguage]
      }
    })
}

function getDemoListing(property: DemoProperty): ClientListing {
  return {
    id: property.id,
    source: 'demo',
    title: property.name[selectedLanguage],
    city: property.city[selectedLanguage],
    area: property.area[selectedLanguage],
    address: property.address[selectedLanguage],
    description: property.description[selectedLanguage],
    pricePerNight: property.pricePerNight,
    maxGuests: property.maxGuests,
    bedrooms: property.bedrooms,
    rating: property.rating,
    reviewCount: property.reviewCount,
    photoUrl: property.photoUrl,
    amenities: property.amenities,
    propertyType: property.type[selectedLanguage],
    hostName: null,
    searchTerms: property.searchTerms,
    unavailablePeriods: property.unavailablePeriods,
  }
}

function getLocalListing(profile: HouseProfile): ClientListing | null {
  if (!profile.isPublished || profile.pricePerNight === null) {
    return null
  }
  const houseName = getHouseName(profile.houseId)
  return {
    id: `local-${profile.houseId}`,
    source: 'local',
    title: houseName,
    city: profile.city,
    area: '',
    address: profile.address,
    description: profile.description,
    pricePerNight: profile.pricePerNight,
    maxGuests: profile.maxGuests,
    bedrooms: null,
    rating: null,
    reviewCount: 0,
    photoUrl: profile.photoDataUrl?.startsWith('data:image/')
      ? profile.photoDataUrl
      : null,
    amenities: profile.amenities,
    propertyType: translateText('Ваш объект', selectedLanguage),
    hostName: null,
    searchTerms: [profile.city, profile.address],
    unavailablePeriods: [],
  }
}

async function getAllClientListings(): Promise<ClientListing[]> {
  const profiles = await getAllHouseProfiles()
  return [
    ...demoCatalog.map(getDemoListing),
    ...profiles
      .map(getLocalListing)
      .filter((listing): listing is ClientListing => listing !== null),
  ]
}

function isListingAvailableForDates(
  listing: ClientListing,
  checkIn: string,
  checkOut: string,
): boolean {
  return !listing.unavailablePeriods.some(
    (period) => checkIn < period.end && checkOut > period.start,
  )
}

function renderClientListingCard(
  listing: ClientListing,
  nights: number,
): string {
  const totalPrice = listing.pricePerNight * nights
  const location = [listing.area, listing.city].filter(Boolean).join(', ')
  const amenities = listing.amenities
    .filter((amenity) => amenity in amenityLabels)
    .slice(0, 4)
    .map(
      (amenity) =>
        `<span class="client-property-chip">${translateText(amenityLabels[amenity], selectedLanguage)}</span>`,
    )
    .join('')
  const rating = listing.rating === null
    ? `<span class="client-rating-new">${translateText('Новый объект', selectedLanguage)}</span>`
    : `<span class="client-rating-score">${listing.rating.toFixed(1)}</span><span class="client-rating-reviews">${listing.reviewCount} ${translateText('отзывов', selectedLanguage)}</span>`
  const isFavorite = isClientFavorite(listing.id)

  return `
    <article class="client-property-card">
      ${
        listing.photoUrl
          ? `<img class="client-property-photo" src="${escapeHtml(listing.photoUrl)}" alt="${escapeHtml(listing.title)}" loading="lazy">`
          : '<div class="client-property-photo client-property-photo--empty" aria-hidden="true">⌂</div>'
      }
      <div class="client-property-content">
        <div class="client-property-heading">
          <div>
            <span class="client-property-type">${escapeHtml(listing.propertyType)}</span>
            <h3>${escapeHtml(listing.title)}</h3>
            <p class="client-property-location">${escapeHtml(location)}${listing.address ? ` · ${escapeHtml(listing.address)}` : ''}</p>
          </div>
          <div class="client-property-rating">
            ${rating}
            <button type="button" class="client-favorite-button${isFavorite ? ' is-favorite' : ''}" data-favorite-listing="${escapeHtml(listing.id)}" aria-label="${translateText(isFavorite ? 'Убрать из избранного' : 'Добавить в избранное', selectedLanguage)}" aria-pressed="${isFavorite}">${isFavorite ? '♥' : '♡'}</button>
          </div>
        </div>
        <p class="client-property-description">${escapeHtml(listing.description)}</p>
        <div class="client-property-meta">
          <span class="client-property-chip">${formatGuestCapacity(listing.maxGuests, selectedLanguage)}</span>
          ${listing.bedrooms === null ? '' : `<span class="client-property-chip">${translateText('Спальни', selectedLanguage)}: ${listing.bedrooms}</span>`}
          ${amenities}
        </div>
        <div class="client-property-card-footer">
          <div>
            <strong class="client-property-price">${totalPrice.toLocaleString(getLanguageLocale(selectedLanguage))} ֏</strong>
            <span class="client-property-price-note">${translateText('за весь период', selectedLanguage)} · ${formatStayDuration(nights, selectedLanguage)}</span>
          </div>
          <button class="client-property-open" type="button" data-client-property="${escapeHtml(listing.id)}">${translateText('Посмотреть жильё', selectedLanguage)}</button>
        </div>
      </div>
    </article>
  `
}

async function renderClientTrips() {
  await deleteExpiredRejectedGuestBookingRequests()
  const requests = (await getAllGuestBookingRequests())
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )

  if (requests.length === 0) {
    clientSearchResults.innerHTML = `
      <div class="client-library-header">
        <h2>${translateText('Мои поездки', selectedLanguage)}</h2>
        <p>${translateText('Здесь будут ваши заявки и их решения.', selectedLanguage)}</p>
      </div>
      <div class="client-search-empty">${translateText('У вас пока нет поездок и заявок.', selectedLanguage)}</div>
    `
  } else {
    clientSearchResults.innerHTML = `
      <div class="client-library-header">
        <h2>${translateText('Мои поездки', selectedLanguage)}</h2>
        <p>${translateText('Здесь будут ваши заявки и их решения.', selectedLanguage)}</p>
      </div>
      <div class="client-trip-list">
        ${requests.map((request) => {
          const statusMessage = request.status === 'accepted'
            ? 'Заявка принята, бронь добавлена в календарь предпринимателя.'
            : request.status === 'rejected'
              ? 'Предприниматель отклонил заявку.'
              : request.status === 'cancelled'
                ? 'Предприниматель удалил подтверждённую бронь.'
                : 'Заявка отправлена. Ожидайте ответа предпринимателя.'
          const statusClass = request.status === 'accepted'
            ? 'accepted'
            : request.status === 'rejected'
              ? 'rejected'
              : request.status === 'cancelled'
                ? 'cancelled'
                : 'pending'
          return `
            <article class="client-trip-card">
              <div class="client-trip-heading">
                <div>
                  <span class="client-property-type">${escapeHtml(request.city)}</span>
                  <h3>${escapeHtml(request.propertyName)}</h3>
                </div>
                <span class="client-trip-status client-trip-status--${statusClass}">${translateText(statusMessage, selectedLanguage)}</span>
              </div>
              <div class="client-trip-details">
                <span>${new Date(`${request.checkIn}T00:00:00`).toLocaleDateString(getLanguageLocale(selectedLanguage))} – ${new Date(`${request.checkOut}T00:00:00`).toLocaleDateString(getLanguageLocale(selectedLanguage))}</span>
                <span>${formatGuestCapacity(request.guestCount, selectedLanguage)}</span>
                <strong>${request.totalPrice.toLocaleString(getLanguageLocale(selectedLanguage))} ֏</strong>
              </div>
            </article>
          `
        }).join('')}
      </div>
    `
  }
  translateDom(clientSearchResults)
}

async function renderClientFavorites() {
  const favoriteIds = new Set(getClientFavoriteIds())
  const listings = (await getAllClientListings())
    .filter((listing) => favoriteIds.has(listing.id))
  currentClientListings = listings

  clientSearchResults.innerHTML = listings.length === 0
    ? `
      <div class="client-library-header">
        <h2>${translateText('Избранное', selectedLanguage)}</h2>
        <p>${translateText('Сохраняйте понравившиеся варианты, чтобы быстро вернуться к ним.', selectedLanguage)}</p>
      </div>
      <div class="client-search-empty">${translateText('Пока нет избранных объектов. Добавьте их нажатием на сердечко.', selectedLanguage)}</div>
    `
    : `
      <div class="client-library-header">
        <h2>${translateText('Избранное', selectedLanguage)}</h2>
        <p>${translateText('Сохраняйте понравившиеся варианты, чтобы быстро вернуться к ним.', selectedLanguage)}</p>
      </div>
      <div class="client-property-results">
        ${listings.map((listing) => renderClientListingCard(listing, Math.max(1, clientStayNights))).join('')}
      </div>
    `
  translateDom(clientSearchResults)
}

async function renderClientSearchResults() {
  const destination = clientDestination.value.trim().toLocaleLowerCase()
  if (!destination) {
    clientSearchResults.innerHTML = `
      <div class="client-search-empty">
        ${translateText('Укажите город или место поездки.', selectedLanguage)}
      </div>
    `
    clientPropertyDetails.classList.add('hidden-page')
    clientSearchResults.classList.remove('hidden-page')
    translateDom(clientSearchResults)
    return
  }
  const bookings = await getAllBookings()
  const checkIn = clientCheckIn.value
  const checkOut = clientCheckOut.value
  const guestCount = Number(clientGuestCount.value)
  const maxPrice = Number(clientMaxPriceInput.value)
  clientMaxPrice = clientMaxPriceInput.value
  clientSelectedAmenity = clientAmenityFilter.value
  clientStayNights = Math.round(
    (new Date(`${checkOut}T00:00:00`).getTime() -
      new Date(`${checkIn}T00:00:00`).getTime()) /
      (24 * 60 * 60 * 1000),
  )
  const allListings = await getAllClientListings()
  currentClientListings = allListings
  const matchingListings = allListings.filter((listing) => {
    const searchableText = [
      listing.city,
      listing.area,
      listing.address,
      ...listing.searchTerms,
    ].join(' ').toLocaleLowerCase()
    if (
      !searchableText.includes(destination) ||
      listing.maxGuests < guestCount ||
      (clientMaxPrice !== '' && listing.pricePerNight > maxPrice) ||
      (clientSelectedAmenity !== '' &&
        !listing.amenities.includes(clientSelectedAmenity)) ||
      !isListingAvailableForDates(listing, checkIn, checkOut)
    ) {
      return false
    }

    if (listing.source === 'local') {
      const houseId = Number(listing.id.slice('local-'.length))
      return !bookings.some((booking) => {
        if (
          booking.houseId !== houseId ||
          (booking.status ?? 'confirmed') !== 'confirmed'
        ) {
          return false
        }
        return (
          new Date(`${checkIn}T00:00:00`) < new Date(booking.endAt) &&
          new Date(`${checkOut}T00:00:00`) > new Date(booking.startAt)
        )
      })
    }
    return true
  })

  const sortedListings = [...matchingListings].sort((left, right) => {
    if (clientSortOrder === 'price-low') {
      return left.pricePerNight - right.pricePerNight
    }
    if (clientSortOrder === 'rating') {
      return (right.rating ?? 0) - (left.rating ?? 0)
    }
    return (right.rating ?? 0) - (left.rating ?? 0)
  })

  if (sortedListings.length === 0) {
    clientSearchResults.innerHTML = `
      <div class="client-results-toolbar">
        <h2 class="client-results-heading">${translateText('Найдены варианты', selectedLanguage)}: 0</h2>
        <label class="client-sort-label">${translateText('Сортировка', selectedLanguage)}
          <select id="clientSort">
            <option value="recommended">${translateText('Сначала рекомендуемые', selectedLanguage)}</option>
            <option value="price-low">${translateText('Сначала дешевле', selectedLanguage)}</option>
            <option value="rating">${translateText('Сначала с высоким рейтингом', selectedLanguage)}</option>
          </select>
        </label>
      </div>
      <div class="client-search-empty">
        ${translateText('На эти даты нет доступных объектов с указанной вместимостью.', selectedLanguage)}
      </div>
    `
  } else {
    const demoResults = sortedListings.filter((listing) => listing.source === 'demo')
    const localResults = sortedListings.filter((listing) => listing.source === 'local')
    clientSearchResults.innerHTML = `
      <div class="client-results-toolbar">
        <div>
          <h2 class="client-results-heading">${translateText('Найдены варианты', selectedLanguage)}: ${sortedListings.length}</h2>
          <p>${translateText('Даты поездки', selectedLanguage)}: ${new Date(`${checkIn}T00:00:00`).toLocaleDateString(getLanguageLocale(selectedLanguage))} – ${new Date(`${checkOut}T00:00:00`).toLocaleDateString(getLanguageLocale(selectedLanguage))} · ${formatGuestCapacity(guestCount, selectedLanguage)}</p>
        </div>
        <label class="client-sort-label">${translateText('Сортировка', selectedLanguage)}
          <select id="clientSort">
            <option value="recommended">${translateText('Сначала рекомендуемые', selectedLanguage)}</option>
            <option value="price-low">${translateText('Сначала дешевле', selectedLanguage)}</option>
            <option value="rating">${translateText('Сначала с высоким рейтингом', selectedLanguage)}</option>
          </select>
        </label>
      </div>
      ${
        demoResults.length
          ? `<section class="client-result-group"><div class="client-result-group-heading"><h3>${translateText('Демонстрационный каталог', selectedLanguage)}</h3><span>${translateText('Примеры для макета', selectedLanguage)}</span></div><div class="client-property-results">${demoResults.map((listing) => renderClientListingCard(listing, clientStayNights)).join('')}</div></section>`
          : ''
      }
      ${
        localResults.length
          ? `<section class="client-result-group"><div class="client-result-group-heading"><h3>${translateText('Ваши локальные объекты', selectedLanguage)}</h3><span>${translateText('Сохранены только в этом браузере', selectedLanguage)}</span></div><div class="client-property-results">${localResults.map((listing) => renderClientListingCard(listing, clientStayNights)).join('')}</div></section>`
          : ''
      }
    `
  }

  const sortSelect =
    clientSearchResults.querySelector<HTMLSelectElement>('#clientSort')
  if (sortSelect) {
    sortSelect.value = clientSortOrder
    sortSelect.addEventListener('change', () => {
      if (
        sortSelect.value === 'recommended' ||
        sortSelect.value === 'price-low' ||
        sortSelect.value === 'rating'
      ) {
        clientSortOrder = sortSelect.value
        void renderClientSearchResults()
      }
    })
  }

  clientPropertyDetails.classList.add('hidden-page')
  clientSearchResults.classList.remove('hidden-page')
  translateDom(clientSearchResults)
}

async function renderClientPropertyDetails(listingId: string) {
  const listing = currentClientListings.find((item) => item.id === listingId)
  if (!listing) {
    return
  }
  if (currentClientDetailId !== listingId) {
    clientInquiryDraft = { guestName: '', guestPhone: '', feedbackShown: false }
  }
  currentClientDetailId = listingId
  const location = [listing.area, listing.city].filter(Boolean).join(', ')
  const totalPrice = listing.pricePerNight * clientStayNights
  const isFavorite = isClientFavorite(listing.id)
  const amenities = listing.amenities
    .filter((amenity) => amenity in amenityLabels)
    .map(
      (amenity) =>
        `<span class="client-property-chip">${translateText(amenityLabels[amenity], selectedLanguage)}</span>`,
    )
    .join('')
  const houseId = listing.source === 'local'
    ? Number(listing.id.slice('local-'.length))
    : null
  const savedRequestId = localStorage.getItem('lastGuestBookingRequestId')
  const savedRequest = houseId !== null && savedRequestId
    ? await getGuestBookingRequest(savedRequestId)
    : undefined
  const matchingRequest =
    savedRequest?.houseId === houseId &&
    savedRequest.checkIn === clientCheckIn.value &&
    savedRequest.checkOut === clientCheckOut.value
      ? savedRequest
      : undefined
  const requestState = matchingRequest
    ? translateText(
        matchingRequest.status === 'accepted'
          ? 'Заявка принята, бронь добавлена в календарь предпринимателя.'
          : matchingRequest.status === 'rejected'
            ? 'Предприниматель отклонил заявку.'
            : matchingRequest.status === 'cancelled'
              ? 'Предприниматель удалил подтверждённую бронь.'
              : 'Заявка отправлена. Ожидайте ответа предпринимателя.',
        selectedLanguage,
      )
    : ''
  const requestForm = listing.source === 'local'
    ? matchingRequest &&
      matchingRequest.status !== 'rejected' &&
      matchingRequest.status !== 'cancelled'
      ? `<p class="client-request-state client-request-state--${matchingRequest.status}">${requestState}</p>`
      : `
        ${
          matchingRequest?.status === 'cancelled'
            ? `<p class="client-request-state client-request-state--cancelled">${requestState}</p>`
            : ''
        }
        <form id="clientInquiryForm" class="client-inquiry-form">
          <label>${translateText('Ваше имя', selectedLanguage)}<input name="guestName" autocomplete="name" required></label>
          <label>${translateText('Телефон для связи', selectedLanguage)}<input name="guestPhone" type="tel" autocomplete="tel" required></label>
          <button type="submit">${translateText('Отправить заявку', selectedLanguage)}</button>
          <p class="client-panel-disclaimer">${translateText('Заявка сохранится только в этом браузере и будет видна предпринимателю на этом устройстве.', selectedLanguage)}</p>
        </form>
      `
    : `<p class="client-panel-disclaimer">${translateText('Демонстрационный объект: у него нет реального владельца, поэтому заявку отправить нельзя.', selectedLanguage)}</p>`

  clientSearchResults.classList.add('hidden-page')
  clientPropertyDetails.innerHTML = `
    <button class="client-detail-back" type="button" id="clientDetailBack">← ${translateText('Назад к вариантам', selectedLanguage)}</button>
    <div class="client-detail-layout">
      <div class="client-detail-main">
        <div class="client-detail-cover">
          ${
            listing.photoUrl
              ? `<img class="client-detail-photo" src="${escapeHtml(listing.photoUrl)}" alt="${escapeHtml(listing.title)}">`
              : '<div class="client-detail-photo client-property-photo--empty" aria-hidden="true">⌂</div>'
          }
          <span class="client-detail-source">${translateText(listing.source === 'demo' ? 'Демонстрационный пример' : 'Ваш локальный объект', selectedLanguage)}</span>
        </div>
        <div class="client-detail-heading">
          <div>
            <span class="client-property-type">${escapeHtml(listing.propertyType)}</span>
            <h2>${escapeHtml(listing.title)}</h2>
            <p>${escapeHtml(location)}${listing.address ? ` · ${escapeHtml(listing.address)}` : ''}</p>
          </div>
          ${
            listing.rating === null
              ? `<span class="client-rating-new">${translateText('Пока без отзывов', selectedLanguage)}</span>`
              : `<div class="client-property-rating"><span class="client-rating-score">${listing.rating.toFixed(1)}</span><span>${listing.reviewCount} ${translateText('отзывов', selectedLanguage)}</span></div>`
          }
          <button type="button" class="client-favorite-button client-detail-favorite${isFavorite ? ' is-favorite' : ''}" id="clientDetailFavorite" aria-label="${translateText(isFavorite ? 'Убрать из избранного' : 'Добавить в избранное', selectedLanguage)}" aria-pressed="${isFavorite}">${isFavorite ? '♥' : '♡'}</button>
        </div>
        <section class="client-detail-section">
          <h3>${translateText('Об этом жилье', selectedLanguage)}</h3>
          <p>${escapeHtml(listing.description)}</p>
        </section>
        <section class="client-detail-section client-reviews-section">
          <h3>${translateText('Отзывы', selectedLanguage)}</h3>
          ${
            listing.rating === null
              ? `<p>${translateText('Пока нет отзывов о жилье. Отзывы появятся после завершённых поездок.', selectedLanguage)}</p>`
              : `<div class="client-review-summary"><strong>${listing.rating.toFixed(1)}</strong><span>${listing.reviewCount} ${translateText('отзывов', selectedLanguage)}</span></div><p>${translateText('Оценки в каталоге демонстрационные. Реальные отзывы появятся после завершённых бронирований.', selectedLanguage)}</p>`
          }
        </section>
        <section class="client-detail-section">
          <h3>${translateText('Удобства', selectedLanguage)}</h3>
          <div class="client-property-meta">${amenities || `<span>${translateText('Информация об удобствах не добавлена', selectedLanguage)}</span>`}</div>
        </section>
        <section class="client-detail-section client-detail-facts">
          <span>${formatGuestCapacity(listing.maxGuests, selectedLanguage)}</span>
          ${listing.bedrooms === null ? '' : `<span>${translateText('Спальни', selectedLanguage)}: ${listing.bedrooms}</span>`}
          <span>${translateText('Условия отмены нужно уточнить до бронирования', selectedLanguage)}</span>
        </section>
      </div>
      <aside class="client-booking-panel">
        <p class="client-panel-caption">${translateText('План поездки', selectedLanguage)}</p>
        <p>${new Date(`${clientCheckIn.value}T00:00:00`).toLocaleDateString(getLanguageLocale(selectedLanguage))} – ${new Date(`${clientCheckOut.value}T00:00:00`).toLocaleDateString(getLanguageLocale(selectedLanguage))}</p>
        <p>${formatGuestCapacity(Number(clientGuestCount.value), selectedLanguage)}</p>
        <div class="client-panel-price"><strong>${totalPrice.toLocaleString(getLanguageLocale(selectedLanguage))} ֏</strong><span>${translateText('за весь период', selectedLanguage)}</span></div>
        ${requestForm}
      </aside>
    </div>
  `
  const guestNameInput =
    clientPropertyDetails.querySelector<HTMLInputElement>('[name="guestName"]')
  const guestPhoneInput =
    clientPropertyDetails.querySelector<HTMLInputElement>('[name="guestPhone"]')
  if (guestNameInput) {
    guestNameInput.value = clientInquiryDraft.guestName
    guestNameInput.addEventListener('input', () => {
      clientInquiryDraft.guestName = guestNameInput.value
    })
  }
  if (guestPhoneInput) {
    guestPhoneInput.value = clientInquiryDraft.guestPhone
    guestPhoneInput.addEventListener('input', () => {
      clientInquiryDraft.guestPhone = guestPhoneInput.value
    })
  }
  clientPropertyDetails.classList.remove('hidden-page')
  clientPropertyDetails
    .querySelector<HTMLButtonElement>('#clientDetailBack')
    ?.addEventListener('click', () => {
      currentClientDetailId = null
      clientPropertyDetails.classList.add('hidden-page')
      clientSearchResults.classList.remove('hidden-page')
      clientSearchResults.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  clientPropertyDetails
    .querySelector<HTMLFormElement>('#clientInquiryForm')
    ?.addEventListener('submit', async (event) => {
      event.preventDefault()
      const form = event.currentTarget
      if (!(form instanceof HTMLFormElement) || !form.reportValidity()) {
        return
      }
      if (houseId === null) {
        return
      }
      const formData = new FormData(form)
      const guestName = String(formData.get('guestName') ?? '').trim()
      const guestPhone = String(formData.get('guestPhone') ?? '').trim()
      if (!guestName || !guestPhone) {
        return
      }

      const request: GuestBookingRequest = {
        id: crypto.randomUUID(),
        source: 'local',
        houseId,
        propertyName: listing.title,
        city: listing.city,
        checkIn: clientCheckIn.value,
        checkOut: clientCheckOut.value,
        guestName,
        guestPhone,
        guestCount: Number(clientGuestCount.value),
        totalPrice,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await createGuestBookingRequest(request)
      localStorage.setItem('lastGuestBookingRequestId', request.id)
      clientInquiryDraft = { guestName, guestPhone, feedbackShown: false }
      showToast('Заявка сохранена и отправлена предпринимателю.', 'success')
      await renderClientPropertyDetails(listingId)
    })
  translateDom(clientPropertyDetails)
}

clientSearchResults.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) {
    return
  }
  const favoriteButton =
    target.closest<HTMLButtonElement>('[data-favorite-listing]')
  const favoriteListingId = favoriteButton?.dataset.favoriteListing
  if (favoriteListingId) {
    const isFavorite = toggleClientFavorite(favoriteListingId)
    showToast(
      isFavorite
        ? 'Объект добавлен в избранное.'
        : 'Объект удалён из избранного.',
      'success',
    )
    if (currentClientView === 'favorites') {
      void renderClientFavorites()
    } else {
      void renderClientSearchResults()
    }
    return
  }
  const propertyButton =
    target.closest<HTMLButtonElement>('[data-client-property]')
  const listingId = propertyButton?.dataset.clientProperty
  if (listingId) {
    void renderClientPropertyDetails(listingId)
    clientPropertyDetails.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})

clientPropertyDetails.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) {
    return
  }
  const favoriteButton =
    target.closest<HTMLButtonElement>('#clientDetailFavorite')
  if (!favoriteButton || !currentClientDetailId) {
    return
  }
  const isFavorite = toggleClientFavorite(currentClientDetailId)
  showToast(
    isFavorite
      ? 'Объект добавлен в избранное.'
      : 'Объект удалён из избранного.',
    'success',
  )
  if (!isFavorite && currentClientView === 'favorites') {
    currentClientDetailId = null
    clientPropertyDetails.classList.add('hidden-page')
    clientSearchResults.classList.remove('hidden-page')
    void renderClientFavorites()
    return
  }
  void renderClientPropertyDetails(currentClientDetailId)
})

async function refreshClientRequestStatus() {
  if (clientModePage.classList.contains('hidden-page')) {
    return
  }
  if (currentClientView === 'trips') {
    await renderClientTrips()
  } else if (currentClientView === 'favorites') {
    await renderClientFavorites()
  }
  if (!currentClientDetailId) return
  const requestId = localStorage.getItem('lastGuestBookingRequestId')
  if (!requestId) {
    return
  }
  const request = await getGuestBookingRequest(requestId)
  if (request && request.status !== 'pending') {
    await renderClientPropertyDetails(currentClientDetailId)
  }
}

window.addEventListener('focus', () => {
  void refreshClientRequestStatus()
})

document
  .querySelectorAll<HTMLButtonElement>('[data-client-destination]')
  .forEach((button) => {
    button.addEventListener('click', () => {
      const destination = clientDestinations.find(
        (item) => item.key === button.dataset.clientDestination,
      )
      if (!destination) {
        return
      }
      clientDestination.value = destination.names[selectedLanguage]
      clientDestination.focus()
      clientDestination.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  })

clientCheckIn.addEventListener('change', () => {
  clientCheckOut.min = clientCheckIn.value || clientCheckIn.min
  if (clientCheckOut.value && clientCheckOut.value <= clientCheckIn.value) {
    clientCheckOut.value = ''
  }
  scheduleClientSearch()
})

let clientFilterDebounce: number | undefined
function scheduleClientSearch() {
  window.clearTimeout(clientFilterDebounce)
  clientFilterDebounce = window.setTimeout(() => {
    if (
      currentClientView === 'search' &&
      clientDestination.value.trim() &&
      clientSearchForm.checkValidity()
    ) {
      void renderClientSearchResults()
    }
  }, 250)
}

for (const input of [
  clientDestination,
  clientCheckIn,
  clientCheckOut,
  clientGuestCount,
]) {
  input.addEventListener('input', scheduleClientSearch)
}

clientMaxPriceInput.addEventListener('input', () => {
  clientMaxPrice = clientMaxPriceInput.value
  scheduleClientSearch()
})

clientAmenityFilter.addEventListener('change', () => {
  clientSelectedAmenity = clientAmenityFilter.value
  if (
    currentClientView === 'search' &&
    clientDestination.value.trim() &&
    clientSearchForm.checkValidity()
  ) {
    void renderClientSearchResults()
  }
})

document
  .querySelector<HTMLButtonElement>('#clearClientFilters')!
  .addEventListener('click', () => {
    clientMaxPriceInput.value = ''
    clientAmenityFilter.value = ''
    clientMaxPrice = ''
    clientSelectedAmenity = ''
    if (clientDestination.value.trim() && clientSearchForm.checkValidity()) {
      void renderClientSearchResults()
    }
  })

clientSearchForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!clientSearchForm.reportValidity()) {
    return
  }
  if (!clientDestination.value.trim()) {
    clientDestination.focus()
    showToast('Укажите город или место поездки.')
    return
  }
  if (clientCheckOut.value <= clientCheckIn.value) {
    showToast('Дата выезда должна быть позже даты заезда.')
    clientCheckOut.focus()
    return
  }
  currentClientDetailId = null
  await renderClientSearchResults()
  clientSearchResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
})

todayNav.addEventListener('click', showTodayPage)
calendarNav.addEventListener('click', showCalendarPage)
searchNav.addEventListener('click', showSearchPage)
settingsNav.addEventListener('click', showSettingsPage)

const modal = document.querySelector<HTMLDivElement>('#bookingModal')!
const addButton = document.querySelector<HTMLButtonElement>('#addBooking')!
const closeButton = document.querySelector<HTMLButtonElement>('#closeModal')!
const backdrop = document.querySelector<HTMLDivElement>('#modalBackdrop')!

function closeModal() {
  modal.classList.add('hidden')
  editingBookingId = null
  saveBookingButton.textContent = 'Забронировать'
}

closeButton.addEventListener('click', closeModal)
backdrop.addEventListener('click', closeModal)

const form = document.querySelector<HTMLFormElement>('#bookingForm')!
const houseSelect =
  form.elements.namedItem('house') as HTMLSelectElement

const startInput =
  form.elements.namedItem('start') as HTMLInputElement

const endInput =
  form.elements.namedItem('end') as HTMLInputElement

const startDateInput =
  form.querySelector<HTMLInputElement>('[data-date-for="start"]')!
const endDateInput =
  form.querySelector<HTMLInputElement>('[data-date-for="end"]')!
const startTimeInput =
  form.querySelector<HTMLInputElement>('[data-time-for="start"]')!
const endTimeInput =
  form.querySelector<HTMLInputElement>('[data-time-for="end"]')!

let editingBookingId: string | null = null

const saveBookingButton =
  document.querySelector<HTMLButtonElement>('#saveBookingButton')!

//const savePendingButton =
// document.querySelector<HTMLButtonElement>('#savePendingButton')!

const priceInput =
  form.elements.namedItem('price') as HTMLInputElement

const paidInput =
  form.elements.namedItem('paid') as HTMLInputElement

const remainingAmount =
  document.querySelector<HTMLElement>('#remainingAmount')!

function renderHouseOptions(selectedHouseId = 1) {
  houseSelect.innerHTML = getHouseIds()
    .map(
      (houseId) =>
        `<option value="${houseId}">${escapeHtml(getHouseName(houseId))}</option>`,
    )
    .join('')

  houseSelect.value = String(
    Math.min(Math.max(selectedHouseId, 1), configuredHouseCount),
  )
}

function updateHouseSettings() {
  const countLabel =
    document.querySelector<HTMLElement>('#houseCountSetting')!
  const houseToRemoveSelect =
    document.querySelector<HTMLSelectElement>('#houseToRemove')!
  const houseToRenameSelect =
    document.querySelector<HTMLSelectElement>('#houseToRename')!
  const houseNameInput =
    document.querySelector<HTMLInputElement>('#houseNameInput')!
  const removeHouseButton =
    document.querySelector<HTMLButtonElement>('#removeHouse')!
  const selectedRemoveHouseId = Number(houseToRemoveSelect.value) || 1
  const selectedRenameHouseId = Number(houseToRenameSelect.value) || 1

  countLabel.textContent =
    `${translateText('Количество домов:', selectedLanguage)} ${configuredHouseCount}`
  const houseOptions = getHouseIds()
    .map(
      (houseId) =>
        `<option value="${houseId}">${escapeHtml(getHouseName(houseId))}</option>`,
    )
    .join('')
  houseToRemoveSelect.innerHTML = houseOptions
  houseToRenameSelect.innerHTML = houseOptions
  houseToRemoveSelect.value = String(
    Math.min(selectedRemoveHouseId, configuredHouseCount),
  )
  houseToRenameSelect.value = String(
    Math.min(selectedRenameHouseId, configuredHouseCount),
  )
  houseNameInput.value = getHouseName(Number(houseToRenameSelect.value))
  houseToRemoveSelect.disabled = configuredHouseCount <= 1
  removeHouseButton.disabled = configuredHouseCount <= 1
  translateDom(countLabel)
  translateDom(houseToRemoveSelect)
  translateDom(houseToRenameSelect)
}

function updateRemaining() {
  const price = Number(priceInput.value) || 0
  const paid = Number(paidInput.value) || 0

  const remaining = Math.max(0, price - paid)

  remainingAmount.textContent =
    `${remaining.toLocaleString(getLanguageLocale(selectedLanguage))} ֏`
}

function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function normalizeTime(value: string): string | null {
  const digits = value.replace(/\D/g, '').slice(0, 4)

  if (digits.length === 0) {
    return null
  }

  const paddedDigits =
    digits.length === 3
      ? `${digits.slice(0, 2)}${digits.slice(2).padStart(2, '0')}`
      : digits.padStart(2, '0').padEnd(4, '0')
  const hours = Number(paddedDigits.slice(0, 2))
  const minutes = Number(paddedDigits.slice(2, 4))

  if (hours > 23 || minutes > 59) {
    return null
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function setVisibleDateTimeValues() {
  for (const [valueInput, dateInput, timeInput] of [
    [startInput, startDateInput, startTimeInput],
    [endInput, endDateInput, endTimeInput],
  ]) {
    const [date, time] = valueInput.value.split('T')
    dateInput.value = date ?? ''
    timeInput.value = time ?? ''
  }
}

function updateHiddenDateTime(
  valueInput: HTMLInputElement,
  dateInput: HTMLInputElement,
  timeInput: HTMLInputElement,
): boolean {
  const normalizedTime = normalizeTime(timeInput.value)

  if (!dateInput.value || !normalizedTime) {
    return false
  }

  timeInput.value = normalizedTime
  valueInput.value = `${dateInput.value}T${normalizedTime}`
  return true
}

function parseQuickBookingDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/)

  if (!match) {
    return null
  }

  const day = Number(match[1])
  const month = Number(match[2])
  const year = match[3] ? Number(match[3]) : new Date().getFullYear()
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

function isPastCalendarDate(date: Date): boolean {
  const selectedDate = new Date(date)
  selectedDate.setHours(0, 0, 0, 0)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return selectedDate < today
}

function updateOvernightDates() {
  const rentalType =
    form.querySelector<HTMLInputElement>(
      'input[name="rentalType"]:checked',
    )

  if (rentalType?.value !== 'overnight') {
    return
  }

  endDateInput.removeAttribute('min')
  endDateInput.removeAttribute('max')

  if (!startInput.value) {
    return
  }

  const start = new Date(startInput.value)
  start.setHours(14, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  end.setHours(11, 0, 0, 0)

  startInput.value = formatDateTimeLocal(start)
  endInput.value = formatDateTimeLocal(end)
  setVisibleDateTimeValues()
}

function updateDayRentalEnd() {
  if (!startInput.value) {
    return
  }

  const start = new Date(startInput.value)
  const defaultEnd = new Date(start)
  defaultEnd.setHours(23, 0, 0, 0)

  endInput.value = formatDateTimeLocal(defaultEnd)
  endDateInput.value = startInput.value.slice(0, 10)
  endDateInput.min = endDateInput.value
  endDateInput.max = endDateInput.value
  endTimeInput.value = '23:00'
}

function constrainDayRentalEndDate() {
  if (!startInput.value || !endInput.value) {
    return
  }

  const startDate = startInput.value.slice(0, 10)
  const endTime = normalizeTime(endTimeInput.value) ?? '23:00'

  endInput.value = `${startDate}T${endTime}`
  endDateInput.value = startDate
  endDateInput.min = startDate
  endDateInput.max = startDate
}

function openModal(
  selectedStartDate?: Date,
  selectedHouseId?: number,
) {
  editingBookingId = null

  form.reset()
  updateRemaining()

  const start = selectedStartDate
    ? new Date(selectedStartDate)
    : new Date()
  start.setHours(14, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  end.setHours(11, 0, 0, 0)

  startInput.value = formatDateTimeLocal(start)
  endInput.value = formatDateTimeLocal(end)
  setVisibleDateTimeValues()
  endDateInput.removeAttribute('min')
  endDateInput.removeAttribute('max')
  startDateInput.min = formatDateTimeLocal(new Date()).slice(0, 10)

  if (selectedHouseId) {
    const houseInput =
      form.elements.namedItem('house') as HTMLSelectElement
    houseInput.value = String(selectedHouseId)
  }

  saveBookingButton.textContent = 'Забронировать'

  modal.classList.remove('hidden')
}

addButton.addEventListener('click', () => openModal())

startDateInput.addEventListener('change', () => {
  const rentalType = form.querySelector<HTMLInputElement>(
    'input[name="rentalType"]:checked',
  )

  if (!updateHiddenDateTime(startInput, startDateInput, startTimeInput)) {
    return
  }

  if (rentalType?.value === 'day') {
    updateDayRentalEnd()
  } else {
    updateOvernightDates()
  }
})

endDateInput.addEventListener('change', () => {
  const rentalType = form.querySelector<HTMLInputElement>(
    'input[name="rentalType"]:checked',
  )

  if (rentalType?.value === 'day') {
    constrainDayRentalEndDate()
  } else {
    updateHiddenDateTime(endInput, endDateInput, endTimeInput)
  }
})

for (const [valueInput, dateInput, timeInput] of [
  [startInput, startDateInput, startTimeInput],
  [endInput, endDateInput, endTimeInput],
]) {
  timeInput.addEventListener('focus', () => {
    timeInput.select()
  })

  timeInput.addEventListener('input', () => {
    const digits = timeInput.value.replace(/\D/g, '').slice(0, 4)
    timeInput.value =
      digits.length > 2
        ? `${digits.slice(0, 2)}:${digits.slice(2)}`
        : digits

    if (digits.length === 4) {
      updateHiddenDateTime(valueInput, dateInput, timeInput)
    }
  })

  timeInput.addEventListener('blur', () => {
    if (!timeInput.value.trim()) {
      return
    }

    const normalizedTime = normalizeTime(timeInput.value)

    if (!normalizedTime) {
      alert('Введите время четырьмя цифрами, например 1730.')
      timeInput.value = valueInput.value.split('T')[1] ?? ''
      return
    }

    timeInput.value = normalizedTime
    updateHiddenDateTime(valueInput, dateInput, timeInput)

    if (valueInput === endInput) {
      const rentalType = form.querySelector<HTMLInputElement>(
        'input[name="rentalType"]:checked',
      )

      if (rentalType?.value === 'day') {
        constrainDayRentalEndDate()
      }
    }
  })
}

form
  .querySelectorAll<HTMLInputElement>('input[name="rentalType"]')
  .forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) {
        return
      }

      if (radio.value === 'day') {
        updateDayRentalEnd()
      } else {
        updateOvernightDates()
      }
    })
  })

const quickPendingModal =
  document.querySelector<HTMLDivElement>('#quickPendingModal')!
const quickPendingForm =
  document.querySelector<HTMLFormElement>('#quickPendingForm')!
const addQuickPendingButton =
  document.querySelector<HTMLButtonElement>('#addQuickPendingBooking')!
const closeQuickPendingButton =
  document.querySelector<HTMLButtonElement>('#closeQuickPendingModal')!
const quickPendingBackdrop =
  document.querySelector<HTMLDivElement>('#quickPendingBackdrop')!

function closeQuickPendingModal() {
  quickPendingModal.classList.add('hidden')
  quickPendingForm.reset()
}

addQuickPendingButton.addEventListener('click', () => {
  quickPendingModal.classList.remove('hidden')
})
closeQuickPendingButton.addEventListener('click', closeQuickPendingModal)
quickPendingBackdrop.addEventListener('click', closeQuickPendingModal)

quickPendingForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const formData = new FormData(quickPendingForm)
  const bookingParts = String(formData.get('bookingLine'))
    .trim()
    .split(/\s+/)

  if (bookingParts.length !== 4) {
    alert(
      'Введите четыре значения через пробел: дом заезд выезд цена. Например: 1 25.12 27.12 80000.',
    )
    return
  }

  const [housePart, startPart, endPart, pricePart] = bookingParts
  const houseId = Number(housePart)
  const startDate = parseQuickBookingDate(startPart)
  const endDate = parseQuickBookingDate(endPart)
  const totalPrice = Number(pricePart)

  if (
    !Number.isSafeInteger(houseId) ||
    houseId < 1 ||
    houseId > configuredHouseCount
  ) {
    alert(`Номер дома должен быть от 1 до ${configuredHouseCount}.`)
    return
  }

  if (!startDate || !endDate) {
    alert('Введите даты в формате дд.мм или дд.мм.гггг.')
    return
  }

  if (isPastCalendarDate(startDate)) {
    alert('Нельзя создать предварительную бронь на прошедшую дату.')
    return
  }

  if (!Number.isFinite(totalPrice) || totalPrice < 0) {
    alert('Введите корректную цену.')
    return
  }

  startDate.setHours(14, 0, 0, 0)
  endDate.setHours(11, 0, 0, 0)

  if (endDate <= startDate) {
    alert('Дата выезда должна быть позже даты заезда.')
    return
  }

  const now = new Date().toISOString()
  const booking: Booking = {
    id: crypto.randomUUID(),
    houseId,
    rentalType: 'overnight',
    status: 'pending',
    startAt: formatDateTimeLocal(startDate),
    endAt: formatDateTimeLocal(endDate),
    guestName: 'Предварительная бронь',
    guestPhone: '',
    guestCount: 1,
    totalPrice,
    paidAmount: 0,
    comment: String(formData.get('comment')),
    createdAt: now,
    updatedAt: now,
  }

  await createBooking(booking)
  await refreshBookingViews()
  closeQuickPendingModal()
  showToast('Предварительная бронь сохранена.', 'success')
})

form
  .querySelectorAll<HTMLInputElement>(
    'input[name="rentalType"]',
  )
  .forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked && radio.value === 'overnight') {
        updateOvernightDates()
      }
    })
  })

priceInput.addEventListener('input', updateRemaining)
paidInput.addEventListener('input', updateRemaining)

async function renderHouses() {
  const housesContainer =
    document.querySelector<HTMLDivElement>('#houses')!

  const bookings = await getAllBookings()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  housesContainer.innerHTML = ''

  for (const houseId of getHouseIds()) {
    const todaysBookings = bookings
      .filter(
        (booking) =>
          booking.houseId === houseId &&
          (booking.status ?? 'confirmed') !== 'expired' &&
          new Date(booking.startAt) < tomorrow &&
          new Date(booking.endAt) >= today,
      )
      .sort((a, b) => {
        const aConfirmed = (a.status ?? 'confirmed') === 'confirmed'
        const bConfirmed = (b.status ?? 'confirmed') === 'confirmed'

        if (aConfirmed !== bConfirmed) {
          return aConfirmed ? -1 : 1
        }

        return new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      })
    const currentBooking = todaysBookings[0]
    const isConfirmed =
      currentBooking && (currentBooking.status ?? 'confirmed') === 'confirmed'

    const house = document.createElement('article')
    house.className = 'house'
    house.dataset.houseId = String(houseId)
    house.tabIndex = 0
    house.setAttribute('role', 'button')
    const houseName = getHouseName(houseId)

    if (!currentBooking) {
      house.setAttribute(
        'aria-label',
        translateMessage(
          `${houseName} свободен. Создать бронь`,
          selectedLanguage,
        ),
      )
      house.innerHTML = `
        <div class="house-top">
          <span class="house-name">${escapeHtml(houseName)}</span>
          <span class="status free">● Свободен сегодня</span>
        </div>
      `
    } else {
      const remaining =
        currentBooking.totalPrice - currentBooking.paidAmount

      const end = new Date(currentBooking.endAt)

      house.classList.add('occupied')
      house.dataset.bookingId = currentBooking.id
      house.setAttribute(
        'aria-label',
        translateMessage(
          isConfirmed
            ? `${houseName} занят сегодня. Открыть бронь: ${currentBooking.guestName}`
            : `${houseName}: предварительная бронь сегодня. Можно добавить бронь`,
          selectedLanguage,
        ),
      )

      house.innerHTML = `
        <div class="booking-info">

          <div class="house-top">
            <span class="house-name">
              ${escapeHtml(houseName)}
            </span>

            <span class="status ${isConfirmed ? 'busy' : 'pending'}">
              ● ${isConfirmed ? 'Занят сегодня' : 'Предварительная бронь сегодня'}
            </span>
          </div>

          <strong class="guest-name">
            ${escapeHtml(currentBooking.guestName)}
          </strong>

          <span class="booking-time">
            ${new Date(currentBooking.startAt).toLocaleDateString(getLanguageLocale(selectedLanguage), {
              day: 'numeric',
              month: 'long',
            })},
            ${new Date(currentBooking.startAt).toLocaleTimeString(getLanguageLocale(selectedLanguage), {
              hour: '2-digit',
              minute: '2-digit',
            })} — ${end.toLocaleDateString(getLanguageLocale(selectedLanguage), {
              day: 'numeric',
              month: 'long',
            })},
            ${end.toLocaleTimeString(getLanguageLocale(selectedLanguage), {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>

          <span class="guest-count">
            👥 ${currentBooking.guestCount}
            ${currentBooking.guestCount === 1 ? 'гость' : 'гостей'}
          </span>

          <div class="money">
            <span>
              ${currentBooking.totalPrice.toLocaleString(getLanguageLocale(selectedLanguage))} ֏
            </span>

            <span>
              Осталось:
              <strong>
                ${remaining.toLocaleString(getLanguageLocale(selectedLanguage))} ֏
              </strong>
            </span>
          </div>

          ${
            isConfirmed
              ? ''
              : `<button type="button" class="day-add-booking house-add-booking" data-add-today="${houseId}">+ Добавить бронь</button>`
          }

        </div>
      `
    }

    translateDom(house)
    housesContainer.appendChild(house)
  }
}

function isSameCalendarDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

async function renderTodaySummary() {
  const container =
    document.querySelector<HTMLDivElement>('#todaySummary')!
  const bookings = await getAllBookings()
  const today = new Date()
  const activeBookings = bookings.filter(
    (booking) => (booking.status ?? 'confirmed') !== 'expired',
  )
  const arrivals = activeBookings
    .filter((booking) => isSameCalendarDay(new Date(booking.startAt), today))
    .sort(
      (first, second) =>
        new Date(first.startAt).getTime() -
        new Date(second.startAt).getTime(),
    )
  const departures = activeBookings
    .filter((booking) => isSameCalendarDay(new Date(booking.endAt), today))
    .sort(
      (first, second) =>
        new Date(first.endAt).getTime() -
        new Date(second.endAt).getTime(),
    )
  const startOfToday = new Date(today)
  startOfToday.setHours(0, 0, 0, 0)
  const pendingBookings = activeBookings
    .filter(
      (booking) =>
        booking.status === 'pending' &&
        new Date(booking.endAt) >= startOfToday,
    )
    .sort(
      (first, second) =>
        new Date(first.startAt).getTime() -
        new Date(second.startAt).getTime(),
    )

  const renderList = (
    items: Booking[],
    emptyMessage: string,
    timeField: 'startAt' | 'endAt',
  ) =>
    items.length === 0
      ? `<p class="today-summary-empty">${emptyMessage}</p>`
      : items
          .map((booking) => {
            const time = new Date(booking[timeField]).toLocaleTimeString(
              getLanguageLocale(selectedLanguage),
              { hour: '2-digit', minute: '2-digit' },
            )
            return `
              <button
                type="button"
                class="today-summary-booking"
                data-booking-id="${escapeHtml(booking.id)}"
              >
                <span class="today-summary-booking-main">
                  <strong>${escapeHtml(getHouseName(booking.houseId))}</strong>
                  <span>${escapeHtml(booking.guestName)}</span>
                </span>
                <span class="today-summary-time">${time}</span>
              </button>
            `
          })
          .join('')

  container.innerHTML = `
    <div class="today-summary-columns">
      <section class="today-summary-panel">
        <h2>Заезды</h2>
        ${renderList(arrivals, 'Заездов сегодня нет', 'startAt')}
      </section>
      <section class="today-summary-panel">
        <h2>Выезды</h2>
        ${renderList(departures, 'Выездов сегодня нет', 'endAt')}
      </section>
    </div>
    <section class="today-summary-panel today-pending-panel">
      <h2>Предварительные брони</h2>
      ${renderList(pendingBookings, 'Предварительных броней нет', 'startAt')}
    </section>
  `
  translateDom(container)
}

const housesContainer =
  document.querySelector<HTMLDivElement>('#houses')!

document
  .querySelector<HTMLDivElement>('#todaySummary')!
  .addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }
    const bookingId = target.closest<HTMLButtonElement>(
      '[data-booking-id]',
    )?.dataset.bookingId
    if (bookingId) {
      void openBookingDetails(bookingId)
    }
  })

function handleHouseActivation(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return
  }

  if (target.closest('[data-add-today]')) {
    return
  }

  const house = target.closest<HTMLElement>('.house[data-house-id]')
  const houseId = Number(house?.dataset.houseId)

  if (
    !house ||
    !Number.isSafeInteger(houseId) ||
    houseId < 1 ||
    houseId > configuredHouseCount
  ) {
    return
  }

  const bookingId = house.dataset.bookingId
  if (bookingId) {
    void openBookingDetails(bookingId)
  } else {
    openModal(undefined, houseId)
  }
}

housesContainer.addEventListener('click', (event) => {
  if (!(event.target instanceof HTMLElement)) {
    return
  }

  const addButton = event.target.closest<HTMLButtonElement>('[data-add-today]')
  if (addButton) {
    event.stopPropagation()
    openModal(new Date(), Number(addButton.dataset.addToday))
    return
  }

  handleHouseActivation(event.target)
})

housesContainer.addEventListener('keydown', (event) => {
  if (
    event instanceof KeyboardEvent &&
    (event.key === 'Enter' || event.key === ' ')
  ) {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest('[data-add-today]')
    ) {
      return
    }

    event.preventDefault()
    handleHouseActivation(event.target)
  }
})

let bookingListMode: 'upcoming' | 'recent' = 'upcoming'

async function renderUpcomingBookings(
  mode: 'upcoming' | 'recent' = bookingListMode,
) {
  bookingListMode = mode

  const container =
    document.querySelector<HTMLDivElement>('#upcomingBookings')!

  const bookings = await getAllBookings()

  const now = new Date()

  const upcomingBookings = bookings
  .filter((booking) => {
    if (mode === 'recent') {
      return true
    }

    return new Date(booking.endAt) > now
  })
  .sort((a, b) => {
    if (mode === 'recent') {
      return (
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
      )
    }

    const sameStay =
      a.houseId === b.houseId &&
      a.startAt.slice(0, 10) === b.startAt.slice(0, 10)

    if (sameStay) {
      const statusOrder =
        Number((b.status ?? 'confirmed') === 'confirmed') -
        Number((a.status ?? 'confirmed') === 'confirmed')

      if (statusOrder !== 0) {
        return statusOrder
      }
    }

    return new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  })

  if (upcomingBookings.length === 0) {
    const emptyText =
      mode === 'recent'
        ? 'Последних броней пока нет'
        : 'Ближайших броней пока нет'

    container.innerHTML = `
      <div class="empty-bookings">
        ${emptyText}
      </div>
    `

    translateDom(container)
    return
  }

  container.innerHTML = upcomingBookings
    .map((booking) => {
      const start = new Date(booking.startAt)
      const end = new Date(booking.endAt)

      const remaining =
        booking.totalPrice - booking.paidAmount

      const startDate = start.toLocaleDateString(getLanguageLocale(selectedLanguage), {
        day: 'numeric',
        month: 'long',
      })

      const startTime = start.toLocaleTimeString(getLanguageLocale(selectedLanguage), {
        hour: '2-digit',
        minute: '2-digit',
      })

      const endDate = end.toLocaleDateString(getLanguageLocale(selectedLanguage), {
        day: 'numeric',
        month: 'short',
      })

      const endTime = end.toLocaleTimeString(getLanguageLocale(selectedLanguage), {
        hour: '2-digit',
        minute: '2-digit',
      })

      return `
        <article
          class="booking-card"
          data-booking-id="${booking.id}"
        >
          <div class="booking-card-top">
            <span class="booking-house">
              ${escapeHtml(getHouseName(booking.houseId))}
            </span>

            <div class="booking-card-actions">
              <span class="booking-type">
                ${
                  booking.rentalType === 'overnight'
                    ? 'С ночёвкой'
                    : 'Без ночёвки'
                }
              </span>
              ${renderReceiptButton(booking)}
            </div>
          </div>

          <strong class="booking-guest">
            ${booking.guestName}
          </strong>

          <div class="booking-dates">
            ${startDate}, ${startTime}
            →
            ${endDate}, ${endTime}
          </div>

          <div class="booking-meta">
            <span>👥 ${booking.guestCount}</span>

            ${
              booking.guestPhone
                ? renderContactPhoneButton(booking.guestPhone)
                : ''
            }
          </div>

          <div class="booking-payment">
            <span>
              ${booking.totalPrice.toLocaleString(getLanguageLocale(selectedLanguage))} ֏
            </span>

            ${
              remaining > 0
                ? `
                  <span class="payment-due">
                    Осталось ${remaining.toLocaleString(getLanguageLocale(selectedLanguage))} ֏
                  </span>
                `
                : `
                  <span class="payment-complete">
                    Оплачено
                  </span>
                `
            }
          </div>
        </article>
      `
    })
    .join('')
  translateDom(container)
}

const upcomingBookingsTab =
  document.querySelector<HTMLButtonElement>('#upcomingBookingsTab')!

const recentBookingsTab =
  document.querySelector<HTMLButtonElement>('#recentBookingsTab')!

upcomingBookingsTab.addEventListener('click', async () => {
  upcomingBookingsTab.classList.add('active')
  recentBookingsTab.classList.remove('active')

  await renderUpcomingBookings('upcoming')
})

recentBookingsTab.addEventListener('click', async () => {
  recentBookingsTab.classList.add('active')
  upcomingBookingsTab.classList.remove('active')

  await renderUpcomingBookings('recent')
})

async function renderSearchResults(query: string) {
  const container =
    document.querySelector<HTMLDivElement>('#searchResults')!

  const normalizedQuery = query.trim().toLowerCase()
  const selectedHouseId = searchHouseFilter.value
  const selectedStatus = searchStatusFilter.value
  const dateFromValue = searchDateFrom.value
  const dateToValue = searchDateTo.value
  const hasFilters =
    normalizedQuery.length > 0 ||
    selectedHouseId !== 'all' ||
    selectedStatus !== 'all' ||
    dateFromValue.length > 0 ||
    dateToValue.length > 0

  if (!hasFilters) {
    container.innerHTML = `
      <div class="empty-bookings">
        Введите запрос или выберите фильтр
      </div>
    `
    translateDom(container)
    return
  }

  const bookings = await getAllBookings()
  const rangeStart = dateFromValue
    ? new Date(`${dateFromValue}T00:00:00`)
    : undefined
  const rangeEnd = dateToValue
    ? new Date(`${dateToValue}T23:59:59.999`)
    : undefined

  if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
    container.innerHTML = `
      <div class="empty-bookings">
        Дата окончания не может быть раньше даты начала
      </div>
    `
    translateDom(container)
    return
  }

  const results = bookings
    .filter((booking) => {
      if (
        selectedHouseId !== 'all' &&
        booking.houseId !== Number(selectedHouseId)
      ) {
        return false
      }

      if (
        selectedStatus !== 'all' &&
        (booking.status ?? 'confirmed') !== selectedStatus
      ) {
        return false
      }

      const bookingStart = new Date(booking.startAt)
      const bookingEnd = new Date(booking.endAt)
      if (rangeStart && bookingEnd < rangeStart) {
        return false
      }
      if (rangeEnd && bookingStart > rangeEnd) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      const name = booking.guestName.toLowerCase()
      const phone = booking.guestPhone.toLowerCase()
      const start = new Date(booking.startAt)
      const end = new Date(booking.endAt)

      const dateKeys = [start, end].map((date) => {
        const day = String(date.getDate()).padStart(2, '0')
        const month = String(date.getMonth() + 1).padStart(2, '0')
        return {
          day,
          date: `${day}.${month}`,
        }
      })
      const normalizedDateQuery = normalizedQuery
        .replace('/', '.')
        .split('.')
        .map((part) => part.padStart(2, '0'))
        .join('.')
      const matchesDate = dateKeys.some(
        ({ day, date }) =>
          normalizedQuery === String(Number(day)) ||
          normalizedQuery === day ||
          date === normalizedDateQuery,
      )

      return (
        name.includes(normalizedQuery) ||
        phone.includes(normalizedQuery) ||
        matchesDate
      )
    })
    .sort(
      (a, b) =>
        new Date(b.startAt).getTime() -
        new Date(a.startAt).getTime(),
    )

  if (results.length === 0) {
    container.innerHTML = `
      <div class="empty-bookings">
        Ничего не найдено
      </div>
    `
    translateDom(container)
    return
  }

  container.innerHTML = results
    .map((booking) => {
      const start = new Date(booking.startAt)
      const remaining =
        booking.totalPrice - booking.paidAmount

      return `
        <article
          class="search-booking-card"
          data-booking-id="${booking.id}"
        >
          <div class="booking-card-top">
            <span class="booking-house">
              ${escapeHtml(getHouseName(booking.houseId))}
            </span>

            <div class="booking-card-actions">
              <span class="booking-status ${
                booking.status === 'pending'
                  ? 'pending'
                  : booking.status === 'expired'
                    ? 'expired'
                    : 'confirmed'
              }">
                ${translateText(
                  booking.status === 'pending'
                    ? 'Предварительная'
                    : booking.status === 'expired'
                      ? 'Истёкшая'
                      : 'Подтверждённая',
                  selectedLanguage,
                )}
              </span>
              <span class="booking-type">
                ${booking.rentalType === 'overnight'
                  ? 'С ночёвкой'
                  : 'Без ночёвки'}
              </span>
              ${renderReceiptButton(booking)}
            </div>
          </div>

          <strong class="booking-guest">
            ${escapeHtml(booking.guestName)}
          </strong>

          <div class="booking-dates">
            ${start.toLocaleString(getLanguageLocale(selectedLanguage), {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>

          ${
            booking.guestPhone
              ? `<div class="booking-meta">${renderContactPhoneButton(booking.guestPhone)}</div>`
              : ''
          }

          <div class="booking-payment">
            <span>
              ${booking.totalPrice.toLocaleString(getLanguageLocale(selectedLanguage))} ֏
            </span>

            <span>
              ${
                remaining > 0
                  ? `Осталось ${remaining.toLocaleString(getLanguageLocale(selectedLanguage))} ֏`
                  : 'Оплачено'
              }
            </span>
          </div>
        </article>
      `
    })
    .join('')
  translateDom(container)
}

const bookingSearch =
  document.querySelector<HTMLInputElement>('#bookingSearch')!

const searchHouseFilter =
  document.querySelector<HTMLSelectElement>('#searchHouseFilter')!
const searchStatusFilter =
  document.querySelector<HTMLSelectElement>('#searchStatusFilter')!
const searchDateFrom =
  document.querySelector<HTMLInputElement>('#searchDateFrom')!
const searchDateTo =
  document.querySelector<HTMLInputElement>('#searchDateTo')!
const clearSearchFiltersButton =
  document.querySelector<HTMLButtonElement>('#clearSearchFilters')!

function renderSearchHouseOptions() {
  const selectedHouseId = searchHouseFilter.value
  searchHouseFilter.innerHTML = `
    <option value="all">${translateText('Все дома', selectedLanguage)}</option>
    ${getHouseIds()
      .map(
        (houseId) =>
          `<option value="${houseId}">${escapeHtml(getHouseName(houseId))}</option>`,
      )
      .join('')}
  `

  if (
    selectedHouseId === 'all' ||
    getHouseIds().includes(Number(selectedHouseId))
  ) {
    searchHouseFilter.value = selectedHouseId || 'all'
  } else {
    searchHouseFilter.value = 'all'
  }
}

bookingSearch.addEventListener('input', () => {
  renderSearchResults(bookingSearch.value)
})

for (const filter of [
  searchHouseFilter,
  searchStatusFilter,
  searchDateFrom,
  searchDateTo,
]) {
  filter.addEventListener('change', () => {
    if (filter === searchDateFrom) {
      if (searchDateFrom.value) {
        searchDateTo.min = searchDateFrom.value
      } else {
        searchDateTo.removeAttribute('min')
      }
    }
    if (filter === searchDateTo) {
      if (searchDateTo.value) {
        searchDateFrom.max = searchDateTo.value
      } else {
        searchDateFrom.removeAttribute('max')
      }
    }
    renderSearchResults(bookingSearch.value)
  })
}

clearSearchFiltersButton.addEventListener('click', () => {
  bookingSearch.value = ''
  searchHouseFilter.value = 'all'
  searchStatusFilter.value = 'all'
  searchDateFrom.value = ''
  searchDateTo.value = ''
  searchDateFrom.removeAttribute('max')
  searchDateTo.removeAttribute('min')
  renderSearchResults('')
})

async function renderGuestRequestInbox() {
  const inbox =
    document.querySelector<HTMLElement>('#guestRequestInbox')!
  await deleteExpiredRejectedGuestBookingRequests()
  const requests = await getAllGuestBookingRequests()
  const pendingRequests = requests
    .filter((request) => request.status === 'pending')
    .sort((left, right) =>
      new Date(left.createdAt).getTime() -
      new Date(right.createdAt).getTime(),
    )
  const rejectedRequests = requests
    .filter((request) => request.status === 'rejected')
    .sort((left, right) =>
      new Date(left.checkIn).getTime() -
      new Date(right.checkIn).getTime(),
    )

  if (pendingRequests.length === 0 && rejectedRequests.length === 0) {
    inbox.innerHTML = ''
    return
  }

  const renderRequestCard = (
    request: GuestBookingRequest,
    status: 'pending' | 'rejected',
  ) => `
    <article class="guest-request-card${status === 'rejected' ? ' guest-request-card--rejected' : ''}" data-guest-request="${escapeHtml(request.id)}">
      <div class="guest-request-card-heading">
        <div>
          <span class="guest-request-property">${escapeHtml(request.propertyName)} · ${escapeHtml(getHouseName(request.houseId))}</span>
          <h3>${escapeHtml(request.guestName)}</h3>
        </div>
        <span class="guest-request-status">${translateText(status === 'pending' ? 'Ожидает решения' : 'Отклонена', selectedLanguage)}</span>
      </div>
      <div class="guest-request-meta">
        <span>${new Date(`${request.checkIn}T00:00:00`).toLocaleDateString(getLanguageLocale(selectedLanguage))} – ${new Date(`${request.checkOut}T00:00:00`).toLocaleDateString(getLanguageLocale(selectedLanguage))}</span>
        <span>${formatGuestCapacity(request.guestCount, selectedLanguage)}</span>
        <span>${request.totalPrice.toLocaleString(getLanguageLocale(selectedLanguage))} ֏</span>
        ${renderContactPhoneButton(request.guestPhone)}
      </div>
      <div class="guest-request-actions">
        ${
          status === 'pending'
            ? `<button type="button" class="guest-request-accept" data-accept-request="${escapeHtml(request.id)}">${translateText('Принять и добавить бронь', selectedLanguage)}</button>
               <button type="button" class="guest-request-reject" data-reject-request="${escapeHtml(request.id)}">${translateText('Отклонить', selectedLanguage)}</button>`
            : `<button type="button" class="guest-request-delete" data-delete-rejected-request="${escapeHtml(request.id)}">${translateText('Удалить заявку', selectedLanguage)}</button>`
        }
      </div>
    </article>
  `

  inbox.innerHTML = `
    ${
      pendingRequests.length > 0
        ? `<section class="guest-request-group">
            <div class="guest-request-inbox-header">
              <div>
                <h2>${translateText('Заявки от клиентов', selectedLanguage)}</h2>
                <p>${translateText('Новые заявки на объекты, сохранённые в этом браузере.', selectedLanguage)}</p>
              </div>
              <span class="guest-request-count">${pendingRequests.length}</span>
            </div>
            <div class="guest-request-list">
              ${pendingRequests.map((request) => renderRequestCard(request, 'pending')).join('')}
            </div>
          </section>`
        : ''
    }
    ${
      rejectedRequests.length > 0
        ? `<section class="guest-request-group guest-request-group--rejected">
            <div class="guest-request-inbox-header">
              <div>
                <h2>${translateText('Отклонённые заявки', selectedLanguage)}</h2>
                <p>${translateText('Отклонённые заявки хранятся до времени заезда и удаляются автоматически. Вы можете удалить их раньше.', selectedLanguage)}</p>
              </div>
              <span class="guest-request-count">${rejectedRequests.length}</span>
            </div>
            <div class="guest-request-list">
              ${rejectedRequests.map((request) => renderRequestCard(request, 'rejected')).join('')}
            </div>
          </section>`
        : ''
    }
  `
  translateDom(inbox)
}

document
  .querySelector<HTMLElement>('#guestRequestInbox')!
  .addEventListener('click', async (event) => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    const acceptButton =
      target.closest<HTMLButtonElement>('[data-accept-request]')
    const requestId = acceptButton?.dataset.acceptRequest
    if (requestId) {
      const result = await acceptGuestBookingRequest(
        requestId,
        new Date().toISOString(),
      )
      if (result.status === 'conflict') {
        const conflictDetails = result.conflicts
          .map((booking) => {
            const start = new Date(booking.startAt).toLocaleDateString(
              getLanguageLocale(selectedLanguage),
            )
            const end = new Date(booking.endAt).toLocaleDateString(
              getLanguageLocale(selectedLanguage),
            )
            return `${getHouseName(booking.houseId)}: ${start} – ${end} (${booking.guestName})`
          })
          .join('\n')
        showToast(
          `${translateText('Нельзя принять заявку: даты пересекаются с другой бронью.', selectedLanguage)}\n${conflictDetails}`,
          'warning',
        )
        return
      }
      if (result.status !== 'accepted') {
        showToast('Эта заявка уже обработана или удалена.')
        await renderGuestRequestInbox()
        return
      }
      await refreshBookingViews()
      showToast('Заявка принята, бронь добавлена в календарь.', 'success')
      return
    }

    const deleteButton =
      target.closest<HTMLButtonElement>('[data-delete-rejected-request]')
    const requestIdToDelete = deleteButton?.dataset.deleteRejectedRequest
    if (requestIdToDelete) {
      if (!confirm('Удалить отклонённую заявку?')) {
        return
      }
      const deleted = await deleteGuestBookingRequest(requestIdToDelete)
      if (!deleted) {
        showToast('Эта заявка уже обработана или удалена.')
      } else {
        showToast('Отклонённая заявка удалена.', 'success')
      }
      await renderGuestRequestInbox()
      return
    }

    const rejectButton =
      target.closest<HTMLButtonElement>('[data-reject-request]')
    const rejectedRequestId = rejectButton?.dataset.rejectRequest
    if (!rejectedRequestId) {
      return
    }
    const rejected = await rejectGuestBookingRequest(
      rejectedRequestId,
      new Date().toISOString(),
    )
    if (!rejected) {
      showToast('Эта заявка уже обработана или удалена.')
    } else {
      showToast('Заявка отклонена.', 'success')
    }
    await renderGuestRequestInbox()
  })

async function refreshBookingViews() {
  await expireCompletedTentativeBookings()
  await Promise.all([
    renderGuestRequestInbox(),
    renderTodaySummary(),
    renderHouses(),
    renderUpcomingBookings(),
    renderCalendar(),
    renderSearchResults(bookingSearch.value),
  ])

  if (!selectedDayModal.classList.contains('hidden')) {
    await renderSelectedDayBookings()
  }
}

document
  .querySelector('#searchResults')
  ?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement

    const card =
      target.closest<HTMLElement>('.search-booking-card')

    if (!card) {
      return
    }

    const bookingId = card.dataset.bookingId

    if (!bookingId) {
      return
    }

    openBookingDetails(bookingId)
  })

const exportBackupButton =
  document.querySelector<HTMLButtonElement>('#exportBackup')!

const backupStatus =
  document.querySelector<HTMLElement>('#backupStatus')!

function renderBackupStatus() {
  const lastBackupAt =
    localStorage.getItem('lastBackupAt')

  if (!lastBackupAt) {
    backupStatus.textContent =
      'Последняя копия: ещё не создавалась'
    translateDom(backupStatus)
    return
  }

  const backupDate = new Date(lastBackupAt)
  const now = new Date()

  backupStatus.classList.remove('backup-warning')

  const diffMs = now.getTime() - backupDate.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (days === 0) {
    backupStatus.textContent = 'Последняя копия: сегодня'
  } else if (days === 1) {
    backupStatus.textContent = 'Последняя копия: вчера'
  } else {
  backupStatus.textContent =
    `Последняя копия: ${days} дн. назад`

  if (days >= 7) {
    backupStatus.classList.add('backup-warning')
  } else {
    backupStatus.classList.remove('backup-warning')
  }
}
translateDom(backupStatus)
}

renderBackupStatus()

exportBackupButton.addEventListener('click', async () => {
  try {
    const bookings = await getAllBookings()
    const receipts = await getAllReceipts()
    const houseProfiles = await getAllHouseProfiles()
    const guestRequests = await getAllGuestBookingRequests()

    const backup = {
      version: 4,
      createdAt: new Date().toISOString(),
      houseCount: configuredHouseCount,
      houseNames: configuredHouseNames,
      language: selectedLanguage,
      bookings,
      houseProfiles,
      guestRequests,
      receipts: await Promise.all(
        receipts.map(async (receipt) => ({
          id: receipt.id,
          bookingId: receipt.bookingId,
          fileName: receipt.fileName,
          createdAt: receipt.createdAt,
          dataUrl: await blobToDataUrl(receipt.pdf),
        })),
      ),
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `rental-manager-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`

    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)

    localStorage.setItem('lastBackupAt', new Date().toISOString())
    renderBackupStatus()
  } catch (error) {
    console.error('Не удалось создать резервную копию:', error)
    showToast(
      error instanceof Error
        ? `Не удалось создать резервную копию: ${error.message}`
        : 'Не удалось создать резервную копию.',
    )
  }
})

const importBackupButton =
  document.querySelector<HTMLButtonElement>('#importBackup')!

const backupFileInput =
  document.querySelector<HTMLInputElement>('#backupFile')!

importBackupButton.addEventListener('click', () => {
  backupFileInput.value = ''
  backupFileInput.click()
})

backupFileInput.addEventListener('change', async () => {
  const file = backupFileInput.files?.[0]

  if (!file) {
    return
  }

  try {
    const text = await file.text()
    const parsed: unknown = JSON.parse(text)

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Файл резервной копии должен содержать объект.')
    }
    const backup = parsed as Record<string, unknown>

    if (
      ![1, 2, 3, 4].includes(Number(backup.version)) ||
      !Array.isArray(backup.bookings)
    ) {
      throw new Error('Это некорректный файл резервной копии.')
    }

    const importedBookings = backup.bookings.map(normalizeBackupBooking)
    if (importedBookings.some((booking) => booking === null)) {
      throw new Error('В резервной копии найдена некорректная бронь.')
    }
    const bookings = importedBookings.filter(
      (booking): booking is Booking => booking !== null,
    )
    const bookingIds = new Set(bookings.map((booking) => booking.id))
    const importedReceipts: Receipt[] = []
    if (backup.receipts !== undefined && !Array.isArray(backup.receipts)) {
      throw new Error('Некорректный список квитанций в резервной копии.')
    }
    for (const receipt of backup.receipts ?? []) {
      if (
        !receipt ||
        typeof receipt.id !== 'string' ||
        typeof receipt.bookingId !== 'string' ||
        typeof receipt.fileName !== 'string' ||
        typeof receipt.createdAt !== 'string' ||
        typeof receipt.dataUrl !== 'string' ||
        !bookingIds.has(receipt.bookingId)
      ) {
        throw new Error('Некорректная квитанция в резервной копии.')
      }

      importedReceipts.push({
        id: receipt.id,
        bookingId: receipt.bookingId,
        fileName: receipt.fileName,
        createdAt: receipt.createdAt,
        pdf: pdfDataUrlToBlob(receipt.dataUrl),
      })
    }

    let importedHouseProfiles: HouseProfile[] = []
    if (backup.houseProfiles !== undefined) {
      if (!Array.isArray(backup.houseProfiles)) {
        throw new Error('Некорректный список объектов в резервной копии.')
      }
      if (!backup.houseProfiles.every(isHouseProfile)) {
        throw new Error('Некорректный объект в резервной копии.')
      }
      importedHouseProfiles = backup.houseProfiles
    }

    let importedGuestRequests: GuestBookingRequest[] = []
    if (backup.guestRequests !== undefined) {
      if (!Array.isArray(backup.guestRequests)) {
        throw new Error('Некорректный список заявок в резервной копии.')
      }
      if (!backup.guestRequests.every(isGuestBookingRequest)) {
        throw new Error('Некорректная заявка в резервной копии.')
      }
      importedGuestRequests = backup.guestRequests
    }

    const maxReferencedHouseId = Math.max(
      1,
      ...bookings.map((booking) => booking.houseId),
      ...importedHouseProfiles.map((profile) => profile.houseId),
      ...importedGuestRequests.map((request) => request.houseId),
    )
    let restoredHouseCount = Math.max(configuredHouseCount, maxReferencedHouseId)
    let restoredHouseNames = Object.fromEntries(
      Object.entries(configuredHouseNames).filter(
        ([houseId]) => Number(houseId) <= restoredHouseCount,
      ),
    ) as Record<number, string>
    let restoredLanguage = selectedLanguage

    if (backup.version === 4) {
      if (
        !Number.isSafeInteger(backup.houseCount) ||
        Number(backup.houseCount) < maxReferencedHouseId ||
        !backup.houseNames ||
        typeof backup.houseNames !== 'object' ||
        Array.isArray(backup.houseNames) ||
        (backup.language !== 'hy' &&
          backup.language !== 'ru' &&
          backup.language !== 'en')
      ) {
        throw new Error('Некорректные настройки в резервной копии.')
      }

      const houseNames: Record<number, string> = {}
      for (const [houseId, name] of Object.entries(backup.houseNames)) {
        const numericHouseId = Number(houseId)
        if (
          !Number.isSafeInteger(numericHouseId) ||
          numericHouseId < 1 ||
          numericHouseId > Number(backup.houseCount) ||
          typeof name !== 'string'
        ) {
          throw new Error('Некорректное название дома в резервной копии.')
        }
        houseNames[numericHouseId] = name
      }
      restoredHouseCount = Number(backup.houseCount)
      restoredHouseNames = houseNames
      restoredLanguage = backup.language
    }

    const confirmed = confirm(
      `Найдено бронирований: ${bookings.length}.\n` +
      `Квитанций: ${importedReceipts.length}.\n\n` +
      'Текущие данные будут заменены данными из резервной копии.\n\n' +
      'Продолжить?',
    )

    if (!confirmed) {
      return
    }

    await replaceAllBookings(
      bookings,
      importedReceipts,
      importedHouseProfiles,
      importedGuestRequests,
      {
        houseCount: restoredHouseCount,
        houseNames: restoredHouseNames,
        language: restoredLanguage,
      },
    )

    configuredHouseCount = restoredHouseCount
    configuredHouseNames = restoredHouseNames
    selectedLanguage = restoredLanguage
    updateLanguageButtons()
    translateDom()
    renderHouseOptions()
    renderSearchHouseOptions()
    updateHouseSettings()
    renderTodayDate()

    await refreshBookingViews()
    await refreshPropertyProfileEditor()

    showToast('Резервная копия успешно восстановлена.', 'success')
  } catch (error) {
    console.error('Не удалось восстановить резервную копию:', error)
    showToast(
      error instanceof Error
        ? `Не удалось восстановить резервную копию: ${error.message}`
        : 'Не удалось прочитать файл резервной копии.',
    )
  } finally {
    backupFileInput.value = ''
  }
})

type CalendarView = 'month' | 'week' | 'day'

let calendarView: CalendarView = 'month'
let calendarDate = new Date()
calendarDate.setHours(0, 0, 0, 0)

function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function bookingOccupiesCalendarDay(
  booking: Booking,
  dayStart: Date,
  nextDay: Date,
): boolean {
  const start = new Date(booking.startAt)
  const end = new Date(booking.endAt)
  const checkoutMinutes = end.getHours() * 60 + end.getMinutes()
  const occupiedUntil = new Date(end)

  occupiedUntil.setHours(0, 0, 0, 0)
  if (checkoutMinutes > 11 * 60) {
    occupiedUntil.setDate(occupiedUntil.getDate() + 1)
  }

  return start < nextDay && occupiedUntil > dayStart
}

async function renderCalendar() {
  const calendar =
    document.querySelector<HTMLElement>('#calendar')!
  const monthLabel =
    document.querySelector<HTMLElement>('#calendarMonthLabel')!
  const viewToggle =
    document.querySelector<HTMLButtonElement>('#calendarViewToggle')!

  const bookings = await getAllBookings()
  const year = calendarDate.getFullYear()
  const month = calendarDate.getMonth()
  const viewNames: Record<CalendarView, string> = {
    month: 'Месяц',
    week: 'Неделя',
    day: 'День',
  }
  const viewOrder: CalendarView[] = ['month', 'week', 'day']
  const currentViewIndex = viewOrder.indexOf(calendarView)
  const nextView = viewOrder[(currentViewIndex + 1) % viewOrder.length]
  viewToggle.textContent = viewNames[calendarView]
  viewToggle.setAttribute(
    'aria-label',
    translateMessage(
      `Текущий вид: ${viewNames[calendarView]}. Переключить на ${viewNames[nextView]}`,
      selectedLanguage,
    ),
  )

  const firstOfMonth = new Date(year, month, 1)
  const firstGridDate = new Date(firstOfMonth)
  firstGridDate.setDate(
    firstGridDate.getDate() - ((firstGridDate.getDay() + 6) % 7),
  )
  const lastOfMonth = new Date(year, month + 1, 0)
  const lastGridDate = new Date(lastOfMonth)
  lastGridDate.setDate(
    lastGridDate.getDate() + ((7 - lastGridDate.getDay()) % 7),
  )

  const weekStart = new Date(calendarDate)
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  let firstVisibleDate: Date
  let lastVisibleDate: Date
  if (calendarView === 'month') {
    firstVisibleDate = firstGridDate
    lastVisibleDate = lastGridDate
    monthLabel.textContent = firstOfMonth.toLocaleDateString(getLanguageLocale(selectedLanguage), {
      month: 'long',
      year: 'numeric',
    })
  } else if (calendarView === 'week') {
    firstVisibleDate = weekStart
    lastVisibleDate = weekEnd
    monthLabel.textContent =
      `${weekStart.toLocaleDateString(getLanguageLocale(selectedLanguage), { day: 'numeric', month: 'short' })} — ` +
      weekEnd.toLocaleDateString(getLanguageLocale(selectedLanguage), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
  } else {
    firstVisibleDate = new Date(calendarDate)
    lastVisibleDate = new Date(calendarDate)
    monthLabel.textContent = calendarDate.toLocaleDateString(getLanguageLocale(selectedLanguage), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const weekdays = calendarView === 'month'
    ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
        .map((weekday) => `<span class="month-weekday">${weekday}</span>`)
        .join('')
    : ''

  let daysHtml = ''
  for (
    const date = new Date(firstVisibleDate);
    date <= lastVisibleDate;
    date.setDate(date.getDate() + 1)
  ) {
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    const nextDay = new Date(dayStart)
    nextDay.setDate(nextDay.getDate() + 1)

    const dayBookings = bookings.filter(
      (booking) => bookingOccupiesCalendarDay(booking, dayStart, nextDay),
    )

    const houseIndicators = getHouseIds()
      .map((houseId) => {
        const houseBookings = dayBookings.filter(
          (booking) => booking.houseId === houseId,
        )

        if (houseBookings.length === 0) {
          return `<span class="month-house free">${escapeHtml(getHouseName(houseId))} ${translateText('Свободен', selectedLanguage)}</span>`
        }

        const hasConfirmed = houseBookings.some(
          (booking) => (booking.status ?? 'confirmed') === 'confirmed',
        )
        const statusClass = hasConfirmed ? 'busy' : 'pending'
        const countLabel =
          houseBookings.length === 1
            ? '1 бронь'
            : `${houseBookings.length} бр.`

        return `
          <span class="month-house ${statusClass}">
            ${escapeHtml(getHouseName(houseId))} ${countLabel}
          </span>
        `
      })
      .join('')

    const isCurrentMonth = date.getMonth() === month
    const isToday = dateKey(date) === dateKey(new Date())
    const dateTitle = date.toLocaleDateString(getLanguageLocale(selectedLanguage), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const weekdayLabel = date.toLocaleDateString(getLanguageLocale(selectedLanguage), {
      weekday: 'short',
    })
    const isSelectedDate = dateKey(date) === dateKey(calendarDate)

    daysHtml += `
      <button
        type="button"
        class="month-day${calendarView === 'week' ? ' week-day' : ''}${calendarView === 'day' ? ' single-day' : ''}${calendarView === 'month' && !isCurrentMonth ? ' outside-month' : ''}${isToday ? ' today' : ''}${isSelectedDate ? ' selected-calendar-day' : ''}"
        data-calendar-date="${dateKey(date)}"
        aria-label="${dateTitle}, ${translateText('броней:', selectedLanguage)} ${dayBookings.length}"
      >
        ${calendarView === 'month' ? '' : `<span class="calendar-weekday-label">${weekdayLabel}</span>`}
        <span class="month-day-number">${calendarView === 'month' ? date.getDate() : dateTitle}</span>
        <span class="month-day-houses">${houseIndicators}</span>
      </button>
    `
  }

  calendar.innerHTML = `
    <div class="month-grid${calendarView === 'week' ? ' week-grid' : ''}${calendarView === 'day' ? ' day-grid' : ''}">
      ${weekdays}
      ${daysHtml}
    </div>
  `
  translateDom(calendar)
  translateDom(viewToggle)
}

let selectedCalendarDate: Date | null = null

const selectedDayModal =
  document.querySelector<HTMLDivElement>('#selectedDayModal')!
const selectedDayTitle =
  document.querySelector<HTMLHeadingElement>('#selectedDayTitle')!
const selectedDayBookings =
  document.querySelector<HTMLDivElement>('#selectedDayBookings')!

function closeSelectedDay() {
  selectedDayModal.classList.add('hidden')
}

document
  .querySelector<HTMLButtonElement>('#closeSelectedDay')!
  .addEventListener('click', closeSelectedDay)
document
  .querySelector<HTMLDivElement>('#selectedDayBackdrop')!
  .addEventListener('click', closeSelectedDay)

async function openSelectedDay(date: Date) {
  selectedCalendarDate = new Date(date)
  selectedCalendarDate.setHours(0, 0, 0, 0)
  await renderSelectedDayBookings()
  selectedDayModal.classList.remove('hidden')
}

async function renderSelectedDayBookings() {
  if (!selectedCalendarDate) {
    return
  }

  const bookings = await getAllBookings()
  const dayStart = new Date(selectedCalendarDate)
  dayStart.setHours(0, 0, 0, 0)
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)

  selectedDayTitle.textContent = dayStart.toLocaleDateString(getLanguageLocale(selectedLanguage), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  selectedDayBookings.innerHTML = getHouseIds()
    .map((houseId) => {
      const houseBookings = bookings
        .filter(
          (booking) =>
            booking.houseId === houseId &&
            bookingOccupiesCalendarDay(booking, dayStart, nextDay),
        )
        .sort((a, b) => {
          const aConfirmed = (a.status ?? 'confirmed') === 'confirmed'
          const bConfirmed = (b.status ?? 'confirmed') === 'confirmed'
          if (aConfirmed !== bConfirmed) {
            return aConfirmed ? -1 : 1
          }

          if (!aConfirmed) {
            return b.totalPrice - a.totalPrice
          }
          return new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        })

      const bookingCards =
        houseBookings.length === 0
          ? '<p class="day-house-free">Свободен</p>'
          : houseBookings
              .map((booking) => {
                const status =
                  (booking.status ?? 'confirmed') === 'pending'
                    ? 'Предварительная'
                    : 'Подтверждённая'
                const start = new Date(booking.startAt)
                const end = new Date(booking.endAt)
                const remaining =
                  booking.totalPrice - booking.paidAmount

                return `
                  <article
                    class="day-booking-card ${(booking.status ?? 'confirmed') === 'pending' ? 'pending' : 'confirmed'}"
                    data-booking-id="${booking.id}"
                    role="button"
                    tabindex="0"
                  >
                    <strong>${booking.guestName}</strong>
                    <span>${translateText(status, selectedLanguage)} · ${booking.totalPrice.toLocaleString(getLanguageLocale(selectedLanguage))} ֏</span>
                    <span>${booking.rentalType === 'overnight' ? 'С ночёвкой' : 'Без ночёвки'}</span>
                    <span>${start.toLocaleString(getLanguageLocale(selectedLanguage))} — ${end.toLocaleString(getLanguageLocale(selectedLanguage))}</span>
                    <span class="day-booking-summary">Гостей: ${booking.guestCount} · Оплачено: ${booking.paidAmount.toLocaleString(getLanguageLocale(selectedLanguage))} ֏ · Осталось: ${remaining.toLocaleString(getLanguageLocale(selectedLanguage))} ֏</span>
                    ${booking.guestPhone ? renderContactPhoneButton(booking.guestPhone) : ''}
                    ${renderReceiptButton(booking)}
                    ${booking.comment ? `<span>${translateText('Комментарий', selectedLanguage)}: ${booking.comment}</span>` : ''}
                  </article>
                `
              })
              .join('')

      return `
        <section class="day-house-section">
          <div class="day-house-heading">
            <h3>${escapeHtml(getHouseName(houseId))}</h3>
            <button
              type="button"
              class="day-add-booking"
              data-add-house="${houseId}"
            >
              + Добавить бронь
            </button>
          </div>
          <div class="day-house-cards">${bookingCards}</div>
        </section>
      `
    })
    .join('')
  translateDom(selectedDayBookings)
}

document
  .querySelector('#calendar')
  ?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const dayButton =
      target.closest<HTMLButtonElement>('[data-calendar-date]')
    const dateKeyValue = dayButton?.dataset.calendarDate

    if (!dateKeyValue) {
      return
    }

    calendarDate = parseDateKey(dateKeyValue)
    void renderCalendar()
    void openSelectedDay(calendarDate)
  })

const calendarPrev =
  document.querySelector<HTMLButtonElement>('#calendarPrev')!
const calendarViewToggle =
  document.querySelector<HTMLButtonElement>('#calendarViewToggle')!
const calendarNext =
  document.querySelector<HTMLButtonElement>('#calendarNext')!

calendarPrev.addEventListener('click', () => {
  if (calendarView === 'month') {
    const dayOfMonth = calendarDate.getDate()
    calendarDate.setDate(1)
    calendarDate.setMonth(calendarDate.getMonth() - 1)
    calendarDate.setDate(
      Math.min(dayOfMonth, new Date(
        calendarDate.getFullYear(),
        calendarDate.getMonth() + 1,
        0,
      ).getDate()),
    )
  } else {
    calendarDate.setDate(
      calendarDate.getDate() - (calendarView === 'week' ? 7 : 1),
    )
  }
  renderCalendar()
})

calendarViewToggle.addEventListener('click', () => {
  const viewOrder: CalendarView[] = ['month', 'week', 'day']
  calendarView =
    viewOrder[(viewOrder.indexOf(calendarView) + 1) % viewOrder.length]
  renderCalendar()
})

calendarNext.addEventListener('click', () => {
  if (calendarView === 'month') {
    const dayOfMonth = calendarDate.getDate()
    calendarDate.setDate(1)
    calendarDate.setMonth(calendarDate.getMonth() + 1)
    calendarDate.setDate(
      Math.min(dayOfMonth, new Date(
        calendarDate.getFullYear(),
        calendarDate.getMonth() + 1,
        0,
      ).getDate()),
    )
  } else {
    calendarDate.setDate(
      calendarDate.getDate() + (calendarView === 'week' ? 7 : 1),
    )
  }
  renderCalendar()
})

selectedDayBookings.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const addButton = target.closest<HTMLButtonElement>('[data-add-house]')

  if (addButton && selectedCalendarDate) {
    const houseId = Number(addButton.dataset.addHouse)
    openModal(selectedCalendarDate, houseId)
    return
  }

  const bookingCard =
    target.closest<HTMLElement>('[data-booking-id]')
  const bookingId = bookingCard?.dataset.bookingId

  if (bookingId) {
    closeSelectedDay()
    void openBookingDetails(bookingId)
  }
})

selectedDayBookings.addEventListener('keydown', (event) => {
  if (
    !(event instanceof KeyboardEvent) ||
    !['Enter', ' '].includes(event.key)
  ) {
    return
  }

  const target = event.target
  if (!(target instanceof Element) || target.closest('[data-contact-phone]')) {
    return
  }

  const bookingCard = target.closest<HTMLElement>('[data-booking-id]')
  if (!bookingCard?.dataset.bookingId) {
    return
  }

  event.preventDefault()
  closeSelectedDay()
  void openBookingDetails(bookingCard.dataset.bookingId)
})

const houseSetupModal =
  document.querySelector<HTMLDivElement>('#houseSetupModal')!
const houseSetupForm =
  document.querySelector<HTMLFormElement>('#houseSetupForm')!
const addHouseButton =
  document.querySelector<HTMLButtonElement>('#addHouse')!
const removeHouseButton =
  document.querySelector<HTMLButtonElement>('#removeHouse')!
const houseToRenameSelect =
  document.querySelector<HTMLSelectElement>('#houseToRename')!
const houseNameInput =
  document.querySelector<HTMLInputElement>('#houseNameInput')!
const saveHouseNameButton =
  document.querySelector<HTMLButtonElement>('#saveHouseName')!
const profileHouseSelect =
  document.querySelector<HTMLSelectElement>('#profileHouseSelect')!
const propertyProfileForm =
  document.querySelector<HTMLFormElement>('#propertyProfileForm')!
const propertyPhotoInput =
  document.querySelector<HTMLInputElement>('#propertyPhotoInput')!
const propertyPhotoPreview =
  document.querySelector<HTMLDivElement>('#propertyPhotoPreview')!
const propertyPhotoImage =
  document.querySelector<HTMLImageElement>('#propertyPhotoImage')!
const removePropertyPhotoButton =
  document.querySelector<HTMLButtonElement>('#removePropertyPhoto')!
let propertyPhotoDataUrl: string | null = null
const businessRoleButton =
  document.querySelector<HTMLButtonElement>('#businessRoleButton')!
const clientRoleButton =
  document.querySelector<HTMLButtonElement>('#clientRoleButton')!
const businessModeChangeButton =
  document.querySelector<HTMLButtonElement>('#businessModeChangeButton')!

async function enterBusinessMode() {
  if (!appReady) {
    return
  }
  if (configuredHouseCount === 0) {
    pendingBusinessSetup = true
    houseSetupModal.classList.remove('hidden')
    return
  }
  showTodayPage()
  await refreshBookingViews()
}

businessRoleButton.addEventListener('click', enterBusinessMode)
businessModeChangeButton.addEventListener('click', showRoleSelection)

async function refreshPropertyProfileEditor() {
  const selectedHouseId = Number(profileHouseSelect.value) || 1
  const options = getHouseIds()
    .map(
      (houseId) =>
        `<option value="${houseId}">${escapeHtml(getHouseName(houseId))}</option>`,
    )
    .join('')
  profileHouseSelect.innerHTML = options
  if (configuredHouseCount > 0) {
    profileHouseSelect.value = String(
      Math.min(selectedHouseId, configuredHouseCount),
    )
  }

  await loadPropertyProfile(Number(profileHouseSelect.value))
}

async function loadPropertyProfile(houseId: number) {
  const profile = await getHouseProfile(houseId)
  const setFieldValue = (name: string, value: string) => {
    const input = propertyProfileForm.elements.namedItem(name)
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.value = value
    }
  }
  setFieldValue('city', profile?.city ?? '')
  setFieldValue('address', profile?.address ?? '')
  setFieldValue('description', profile?.description ?? '')
  setFieldValue('maxGuests', String(profile?.maxGuests ?? 2))
  setFieldValue(
    'pricePerNight',
    profile?.pricePerNight === null || profile?.pricePerNight === undefined
      ? ''
      : String(profile.pricePerNight),
  )

  const amenities = new Set(profile?.amenities ?? [])
  propertyProfileForm
    .querySelectorAll<HTMLInputElement>('input[name="amenities"]')
    .forEach((input) => {
      input.checked = amenities.has(input.value)
    })
  const publishInput =
    propertyProfileForm.querySelector<HTMLInputElement>(
      'input[name="isPublished"]',
    )!
  publishInput.checked = profile?.isPublished ?? false
  propertyPhotoDataUrl = profile?.photoDataUrl ?? null
  updatePropertyPhotoPreview()
}

function updatePropertyPhotoPreview() {
  if (!propertyPhotoDataUrl) {
    propertyPhotoPreview.classList.add('hidden-page')
    propertyPhotoImage.removeAttribute('src')
    return
  }
  propertyPhotoImage.src = propertyPhotoDataUrl
  propertyPhotoPreview.classList.remove('hidden-page')
}

profileHouseSelect.addEventListener('change', async () => {
  await loadPropertyProfile(Number(profileHouseSelect.value))
})

propertyPhotoInput.addEventListener('change', async () => {
  const file = propertyPhotoInput.files?.[0]
  propertyPhotoInput.value = ''
  if (!file) {
    return
  }
  if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
    showToast('Выберите фото размером до 8 МБ.')
    return
  }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Could not prepare image canvas.')
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    propertyPhotoDataUrl = canvas.toDataURL('image/jpeg', 0.82)
    updatePropertyPhotoPreview()
  } catch (error) {
    console.error('Unable to process property photo.', error)
    showToast('Не удалось обработать фото.')
  }
})

removePropertyPhotoButton.addEventListener('click', () => {
  propertyPhotoDataUrl = null
  updatePropertyPhotoPreview()
})

propertyProfileForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const houseId = Number(profileHouseSelect.value)
  const formData = new FormData(propertyProfileForm)
  const maxGuests = Number(formData.get('maxGuests'))
  const priceValue = String(formData.get('pricePerNight') ?? '').trim()
  const pricePerNight = priceValue ? Number(priceValue) : null
  const isPublished = formData.get('isPublished') === 'on'

  if (
    !Number.isSafeInteger(houseId) ||
    houseId < 1 ||
    houseId > configuredHouseCount ||
    !Number.isSafeInteger(maxGuests) ||
    maxGuests < 1 ||
    maxGuests > 100 ||
    (pricePerNight !== null &&
      (!Number.isFinite(pricePerNight) || pricePerNight < 0))
  ) {
    showToast('Проверьте вместимость и цену объекта.')
    return
  }

  const city = String(formData.get('city') ?? '').trim()
  if (isPublished && (!city || pricePerNight === null)) {
    showToast('Для публикации укажите город и цену за ночь.')
    return
  }

  const profile: HouseProfile = {
    houseId,
    city,
    address: String(formData.get('address') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim(),
    maxGuests,
    pricePerNight,
    amenities: formData.getAll('amenities').map(String),
    photoDataUrl: propertyPhotoDataUrl,
    isPublished,
  }
  await saveHouseProfile(profile)
  showToast('Объект сохранён.', 'success')
})

houseToRenameSelect.addEventListener('change', () => {
  houseNameInput.value = getHouseName(Number(houseToRenameSelect.value))
})

saveHouseNameButton.addEventListener('click', async () => {
  const houseId = Number(houseToRenameSelect.value)
  const name = houseNameInput.value.trim()

  if (
    !Number.isSafeInteger(houseId) ||
    houseId < 1 ||
    houseId > configuredHouseCount
  ) {
    throw new Error(
      `Invalid house selected for renaming: ${houseToRenameSelect.value}`,
    )
  }
  if (!name) {
    alert('Введите название дома.')
    houseNameInput.focus()
    return
  }

  await setHouseName(houseId, name)
  configuredHouseNames[houseId] = name
  updateHouseSettings()
  renderHouseOptions(Number(houseSelect.value))
  renderSearchHouseOptions()
  await refreshPropertyProfileEditor()
  await refreshBookingViews()
})

houseSetupForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const formData = new FormData(houseSetupForm)
  const houseCount = Number(formData.get('houseCount'))

  if (!Number.isSafeInteger(houseCount) || houseCount < 1) {
    alert('Введите целое положительное число домов.')
    return
  }

  await setHouseCount(houseCount)
  configuredHouseCount = houseCount
  renderHouseOptions()
  renderSearchHouseOptions()
  updateHouseSettings()
  await refreshPropertyProfileEditor()
  houseSetupModal.classList.add('hidden')
  await refreshBookingViews()
  if (pendingBusinessSetup) {
    pendingBusinessSetup = false
    showTodayPage()
  }
})

addHouseButton.addEventListener('click', async () => {
  if (!Number.isSafeInteger(configuredHouseCount + 1)) {
    alert('Нельзя добавить больше домов: достигнут предел числового значения.')
    return
  }

  const newHouseCount = configuredHouseCount + 1
  await setHouseCount(newHouseCount)
  configuredHouseCount = newHouseCount
  renderHouseOptions(configuredHouseCount)
  renderSearchHouseOptions()
  updateHouseSettings()
  await refreshPropertyProfileEditor()
  await refreshBookingViews()
})

removeHouseButton.addEventListener('click', async () => {
  if (configuredHouseCount <= 1) {
    alert('В приложении должен остаться хотя бы один дом.')
    return
  }

  const houseToRemoveSelect =
    document.querySelector<HTMLSelectElement>('#houseToRemove')!
  const houseId = Number(houseToRemoveSelect.value)
  if (
    !Number.isSafeInteger(houseId) ||
    houseId < 1 ||
    houseId > configuredHouseCount
  ) {
    throw new Error(
      `Invalid house selected for removal: ${houseToRemoveSelect.value}`,
    )
  }

  const bookings = await getAllBookings()
  const houseBookings = bookings.filter(
    (booking) => booking.houseId === houseId,
  )

  const message =
    houseBookings.length > 0
      ? `В «${getHouseName(houseId)}» есть брони (${houseBookings.length}). Удалить этот дом и все его брони?`
      : `Удалить дом «${getHouseName(houseId)}»?`

  if (!confirm(message)) {
    return
  }

  const newHouseCount = configuredHouseCount - 1
  await removeHouseAndBookings(houseId, newHouseCount)
  configuredHouseCount = newHouseCount
  configuredHouseNames = await getHouseNames()
  renderHouseOptions()
  renderSearchHouseOptions()
  updateHouseSettings()
  await refreshPropertyProfileEditor()
  await refreshBookingViews()
})

async function initializeHouseConfiguration() {
  const savedLanguage = await getAppLanguage()
  if (savedLanguage) {
    selectedLanguage = savedLanguage
  }
  updateLanguageButtons()
  translateDom()
  updateClientDestinationOptions()
  renderTodayDate()

  const savedHouseCount = await getHouseCount()
  configuredHouseNames = await getHouseNames()

  if (savedHouseCount === undefined) {
    const [bookings, houseProfiles] = await Promise.all([
      getAllBookings(),
      getAllHouseProfiles(),
    ])
    const maxExistingBookingHouseId = bookings.reduce(
      (maxHouseId, booking) =>
        Math.max(
          maxHouseId,
          Number.isSafeInteger(booking.houseId) ? booking.houseId : 0,
        ),
      0,
    )
    const maxProfileHouseId = houseProfiles.reduce(
      (maxHouseId, profile) =>
        Math.max(maxHouseId, profile.houseId),
      0,
    )
    const maxExistingHouseId = Math.max(
      maxExistingBookingHouseId,
      maxProfileHouseId,
    )

    if (bookings.length > 0 || houseProfiles.length > 0) {
      configuredHouseCount = Math.max(3, maxExistingHouseId)
      await setHouseCount(configuredHouseCount)
    } else {
      appReady = true
      businessRoleButton.disabled = false
      clientRoleButton.disabled = false
      return
    }
  } else if (
    !Number.isSafeInteger(savedHouseCount) ||
    savedHouseCount < 1
  ) {
    throw new Error(`Invalid saved house count: ${savedHouseCount}`)
  } else {
    configuredHouseCount = savedHouseCount
  }

  renderHouseOptions()
  renderSearchHouseOptions()
  updateHouseSettings()
  await refreshPropertyProfileEditor()
  await refreshBookingViews()
  appReady = true
  businessRoleButton.disabled = false
  clientRoleButton.disabled = false
}

void initializeHouseConfiguration()

function refreshHouseOccupancyWhenVisible() {
  if (
    document.visibilityState === 'visible' &&
    configuredHouseCount > 0
  ) {
    void expireCompletedTentativeBookings()
      .then(async (expired) => {
        if (expired) {
          await refreshBookingViews()
        }
      })
      .catch((error: unknown) => {
        console.error('Не удалось проверить сроки предварительных броней:', error)
        showToast('Не удалось обновить статусы предварительных броней.')
      })
  }
}

window.setInterval(refreshHouseOccupancyWhenVisible, 30_000)
window.addEventListener('focus', refreshHouseOccupancyWhenVisible)
window.addEventListener('pageshow', refreshHouseOccupancyWhenVisible)
document.addEventListener(
  'visibilitychange',
  refreshHouseOccupancyWhenVisible,
)

document
  .querySelector('#upcomingBookings')
  ?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement

    const card = target.closest<HTMLElement>(
      '.booking-card',
    )

    if (!card) {
      return
    }

    const bookingId = card.dataset.bookingId

    if (!bookingId) {
      return
    }

    openBookingDetails(bookingId)
  })
const detailsModal =
  document.querySelector<HTMLDivElement>('#detailsModal')!

const closeDetails =
  document.querySelector<HTMLButtonElement>('#closeDetails')!

const detailsBackdrop =
  document.querySelector<HTMLDivElement>('#detailsBackdrop')!

const bookingDetails =
  document.querySelector<HTMLDivElement>('#bookingDetails')!

bookingDetails.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement

  const editButton =
  target.closest<HTMLButtonElement>('[data-edit-id]')

  if (editButton) {
    const bookingId = editButton.dataset.editId

    if (!bookingId) {
      return
    }

    const bookings = await getAllBookings()

    const booking = bookings.find(
      (item) => item.id === bookingId,
    )

    if (!booking) {
      alert('Бронь не найдена.')
      return
    }

    editingBookingId = booking.id
    saveBookingButton.textContent = 'Сохранить изменения'
    startDateInput.removeAttribute('min')

    const houseInput =
      form.elements.namedItem('house') as HTMLSelectElement

    const guestNameInput =
      form.elements.namedItem('guestName') as HTMLInputElement

    const phoneInput =
      form.elements.namedItem('phone') as HTMLInputElement

    const guestCountInput =
      form.elements.namedItem('guestCount') as HTMLInputElement

    const commentInput =
      form.elements.namedItem('comment') as HTMLTextAreaElement

    houseInput.value = String(booking.houseId)
    startInput.value = booking.startAt.slice(0, 16)
    endInput.value = booking.endAt.slice(0, 16)
    setVisibleDateTimeValues()
    guestNameInput.value = booking.guestName
    phoneInput.value = booking.guestPhone
    guestCountInput.value = String(booking.guestCount)
    priceInput.value = String(booking.totalPrice)
    paidInput.value = String(booking.paidAmount)
    commentInput.value = booking.comment

    const rentalTypeInput =
      form.querySelector<HTMLInputElement>(
        `input[name="rentalType"][value="${booking.rentalType}"]`,
      )

    if (rentalTypeInput) {
      rentalTypeInput.checked = true
    }

    if (booking.rentalType === 'day') {
      constrainDayRentalEndDate()
    } else {
      endDateInput.removeAttribute('min')
      endDateInput.removeAttribute('max')
    }

    updateRemaining()
    closeBookingDetails()
    modal.classList.remove('hidden')

    return
    }

  const deleteButton =
  target.closest<HTMLButtonElement>('[data-delete-id]')

  if (deleteButton) {
    const bookingId = deleteButton.dataset.deleteId

  if (!bookingId) {
    return
  }

  const bookings = await getAllBookings()

  const booking = bookings.find(
    (item) => item.id === bookingId,
  )

  if (!booking) {
    alert('Бронь не найдена.')
    return
  }

  const confirmed = confirm(
    `Удалить бронь?\n\n${getHouseName(booking.houseId)}\n${booking.guestName}`,
  )

  if (!confirmed) {
    return
  }

  await deleteBooking(bookingId)

  closeBookingDetails()

  await refreshBookingViews()

  return
}

  const paymentButton =
    target.closest<HTMLButtonElement>('[data-payment-id]')

  if (!paymentButton) {
    return
  }

  const bookingId = paymentButton.dataset.paymentId

  if (!bookingId) {
    return
  }

  const bookings = await getAllBookings()

  const booking = bookings.find(
    (item) => item.id === bookingId,
  )

  if (!booking) {
    alert('Бронь не найдена.')
    return
  }

  const remaining =
    booking.totalPrice - booking.paidAmount

  if (remaining <= 0) {
    alert('Бронь уже полностью оплачена.')
    return
  }

  const input = prompt(
    `Осталось: ${remaining.toLocaleString(getLanguageLocale(selectedLanguage))} ֏\nВведите сумму оплаты:`,
  )

  if (input === null) {
    return
  }

  const amount = Number(input.trim())

  if (!Number.isFinite(amount) || amount <= 0) {
    alert('Введите корректную сумму.')
    return
  }

  if (amount > remaining) {
    alert('Сумма оплаты не может быть больше остатка.')
    return
  }

  booking.paidAmount += amount
  if (
    (booking.status ?? 'confirmed') === 'pending' &&
    booking.paidAmount > 0
  ) {
  booking.status = 'confirmed'
}

  booking.updatedAt = new Date().toISOString()

  await updateBooking(booking)

  await refreshBookingViews()
  await openBookingDetails(booking.id)
})

function closeBookingDetails() {
  detailsModal.classList.add('hidden')
}

closeDetails.addEventListener(
  'click',
  closeBookingDetails,
)

detailsBackdrop.addEventListener(
  'click',
  closeBookingDetails,
)

  async function openBookingDetails(bookingId: string) {
  const bookings = await getAllBookings()

  const booking = bookings.find(
    (booking) => booking.id === bookingId,
  )

  if (!booking) {
    return
  }

  const modal =
    document.querySelector<HTMLDivElement>('#detailsModal')!

  const houseTitle =
    document.querySelector<HTMLHeadingElement>('#detailsHouse')!

  const details =
    document.querySelector<HTMLDivElement>('#bookingDetails')!

  const start = new Date(booking.startAt)
  const end = new Date(booking.endAt)

  const remaining =
    booking.totalPrice - booking.paidAmount

  houseTitle.textContent = getHouseName(booking.houseId)

  details.innerHTML = `
    <div class="details">

      <div class="details-client">
        <strong>${booking.guestName}</strong>

        ${
          booking.guestPhone
            ? renderContactPhoneButton(booking.guestPhone)
            : ''
        }
      </div>

      <div class="details-row">
        <span>Тип</span>
        <strong>
          ${
            booking.rentalType === 'overnight'
              ? 'С ночёвкой'
              : 'Без ночёвки'
          }
        </strong>
      </div>

      <div class="details-row">
        <span>Заезд</span>
        <strong>
          ${start.toLocaleString(getLanguageLocale(selectedLanguage))}
        </strong>
      </div>

      <div class="details-row">
        <span>Выезд</span>
        <strong>
          ${end.toLocaleString(getLanguageLocale(selectedLanguage))}
        </strong>
      </div>

      <div class="details-row">
        <span>Гостей</span>
        <strong>${booking.guestCount}</strong>
      </div>

      <div class="details-payment">
        <div class="details-row">
          <span>Цена</span>
          <strong>
            ${booking.totalPrice.toLocaleString(getLanguageLocale(selectedLanguage))} ֏
          </strong>
        </div>

        <div class="details-row">
          <span>Предоплата</span>
          <strong>
            ${booking.paidAmount.toLocaleString(getLanguageLocale(selectedLanguage))} ֏
          </strong>
        </div>

        <div class="details-row remaining-row">
          <span>Осталось</span>
          <strong>
            ${remaining.toLocaleString(getLanguageLocale(selectedLanguage))} ֏
          </strong>
        </div>
      </div>

      ${
        booking.comment
          ? `
            <div class="details-comment">
              <span>Комментарий</span>
              <p>${booking.comment}</p>
            </div>
          `
          : ''
      }

      <div class="details-actions">
        ${
          (booking.status ?? 'confirmed') === 'confirmed'
            ? `
              <button
                class="details-receipts-button"
                data-receipts-booking-id="${booking.id}"
              >
                🧾 Квитанции
              </button>
            `
            : ''
        }

        <button
          class="details-edit-button"
          data-edit-id="${booking.id}"
        >
          Изменить бронь
        </button>

        <button
          class="details-payment-button"
          data-payment-id="${booking.id}"
        >
          Внести оплату
        </button>

        <button
          class="details-delete-button"
          data-delete-id="${booking.id}"
        >
          Удалить бронь
        </button>
      </div>

    </div>
  `

  translateDom(details)
  modal.classList.remove('hidden')
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()

  if (!startDateInput.value) {
    startDateInput.value = startInput.value.slice(0, 10)
  }
  if (!startTimeInput.value) {
    startTimeInput.value = startInput.value.split('T')[1] ?? ''
  }
  if (!endDateInput.value) {
    endDateInput.value = endInput.value.slice(0, 10)
  }
  if (!endTimeInput.value) {
    endTimeInput.value = endInput.value.split('T')[1] ?? ''
  }

  if (
    !updateHiddenDateTime(startInput, startDateInput, startTimeInput) ||
    !updateHiddenDateTime(endInput, endDateInput, endTimeInput)
  ) {
    alert('Введите время четырьмя цифрами, например 1730.')
    return
  }

  const submitEvent = event as SubmitEvent

  const submitter =
    submitEvent.submitter as HTMLButtonElement | null

  const bookingStatus =
    submitter?.id === 'savePendingButton'
      ? 'pending'
      : 'confirmed'

  const formData = new FormData(form)
  const priceValue = String(formData.get('price') ?? '').trim()
  const totalPrice = Number(priceValue)

  if (!priceValue || !Number.isFinite(totalPrice) || totalPrice < 0) {
    alert('Укажите корректную цену бронирования.')
    return
  }

  const now = new Date().toISOString()

  const booking: Booking = {
    id: crypto.randomUUID(),

    houseId: Number(formData.get('house')),
    rentalType: formData.get('rentalType') as 'overnight' | 'day',
    status: bookingStatus,

    startAt: String(formData.get('start')),
    endAt: String(formData.get('end')),

    guestName: String(formData.get('guestName') ?? '').trim() || 'Без имени',
    guestPhone: String(formData.get('phone')),
    guestCount: Number(formData.get('guestCount')),

    totalPrice,
    paidAmount: Number(formData.get('paid')),

    comment: String(formData.get('comment')),

    createdAt: now,
    updatedAt: now,
  }

  if (
    !Number.isSafeInteger(booking.houseId) ||
    booking.houseId < 1 ||
    booking.houseId > configuredHouseCount
  ) {
    alert('Выберите существующий дом.')
    return
  }

  if (
    !Number.isSafeInteger(booking.guestCount) ||
    booking.guestCount < 1
  ) {
    alert('Укажите корректное количество гостей.')
    return
  }

  if (
    !Number.isFinite(booking.paidAmount) ||
    booking.paidAmount < 0 ||
    booking.paidAmount > booking.totalPrice
  ) {
    alert('Предоплата должна быть от 0 до полной стоимости бронирования.')
    return
  }

  if (
    booking.rentalType === 'day' &&
    booking.startAt.slice(0, 10) !== booking.endAt.slice(0, 10)
  ) {
    alert('Для аренды без ночёвки дата заезда и выезда должна совпадать.')
    return
  }

  let existingBooking: Booking | undefined
  if (editingBookingId) {
    const bookings = await getAllBookings()
    existingBooking = bookings.find(
      (item) => item.id === editingBookingId,
    )

    if (!existingBooking) {
      alert('Бронь не найдена.')
      return
    }

    if (
      (existingBooking.status ?? 'confirmed') === 'pending' &&
      booking.paidAmount === 0
    ) {
      booking.status = 'pending'
    }
  } else if (isPastCalendarDate(new Date(booking.startAt))) {
    alert('Нельзя создать бронь на прошедшую дату.')
    return
  }

  if (new Date(booking.endAt) <= new Date(booking.startAt)) {
    alert('Время выезда должно быть позже времени заезда.')
    return
  }

  if (booking.status === 'confirmed') {
    const conflicts = await getBookingConflicts(
      booking.houseId,
      booking.startAt,
      booking.endAt,
      editingBookingId ?? undefined,
    )
    const confirmedConflicts = conflicts.filter(
      (conflict) => (conflict.status ?? 'confirmed') === 'confirmed',
    )
    const formatConflictDetails = (bookings: Booking[]) =>
      bookings
        .map((conflict) => {
          const start = new Date(conflict.startAt).toLocaleDateString(
            getLanguageLocale(selectedLanguage),
          )
          const end = new Date(conflict.endAt).toLocaleDateString(
            getLanguageLocale(selectedLanguage),
          )
          return `• ${conflict.guestName} — ${start}–${end}`
        })
        .join('\n')

    if (confirmedConflicts.length > 0) {
      alert(
        `На выбранное время уже есть подтверждённая бронь:\n${formatConflictDetails(confirmedConflicts)}`,
      )
      return
    }

    const pendingConflicts = conflicts.filter(
      (conflict) => conflict.status === 'pending',
    )
    if (pendingConflicts.length > 0) {
      const shouldKeepBoth = confirm(
        `Найдены пересекающиеся предварительные брони:\n${formatConflictDetails(pendingConflicts)}\n\n` +
          'Создать подтверждённую бронь и оставить обе брони?',
      )
      if (!shouldKeepBoth) {
        return
      }
    }
  }

  if (existingBooking) {
    booking.id = existingBooking.id
    booking.createdAt = existingBooking.createdAt
    booking.updatedAt = new Date().toISOString()

    await updateBooking(booking)

    editingBookingId = null
  } else {
    await createBooking(booking)
  }
    await refreshBookingViews()

    console.log('Бронь сохранена:', booking)

    const bookings = await getAllBookings()

    console.log('Все бронирования:', bookings)

    form.reset()
    updateRemaining()
    closeModal()
    saveBookingButton.textContent = 'Забронировать'

    showToast('Бронь сохранена!', 'success')
})
