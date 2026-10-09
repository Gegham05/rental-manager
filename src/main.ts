import './style.css'
import { hasBookingConflict } from './services/bookingService'
import { convertReceiptImageToPdf } from './services/receiptPdfService'
import type { Booking } from './models/Booking'
import type { Receipt } from './models/Receipt'
import {
  addReceipt,
  createBooking,
  deleteReceipt,
  getAllBookings,
  getAllReceipts,
  getReceiptsForBooking,
  updateBooking,
  deleteBooking,
  replaceAllBookings,
  getHouseCount,
  getHouseNames,
  setHouseCount,
  setHouseName,
  removeHouseAndBookings,
} from './storage/bookingRepository'

let configuredHouseCount = 0
let configuredHouseNames: Record<number, string> = {}

function getHouseIds(): number[] {
  return Array.from(
    { length: configuredHouseCount },
    (_, index) => index + 1,
  )
}

function getHouseName(houseId: number): string {
  return configuredHouseNames[houseId]?.trim() || `Дом ${houseId}`
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

function renderContactPhoneButton(phone: string): string {
  const escapedPhone = escapeHtml(phone)
  return `
    <button
      type="button"
      class="contact-phone-button"
      data-contact-phone="${escapedPhone}"
      aria-label="Выбрать способ связи: ${escapedPhone}"
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
  <main class="app" id="todayPage">
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
  <button type="button" id="calendarPrev" aria-label="Предыдущий месяц">←</button>
  <button type="button" id="calendarToday">Сегодня</button>
  <strong id="calendarMonthLabel"></strong>
  <button type="button" id="calendarNext" aria-label="Следующий месяц">→</button>
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

  <div id="searchResults" class="search-results">
    <div class="empty-bookings">
      Введите имя, номер телефона или дату
    </div>
  </div>
  <section class="backup-section">
  <h2>Резервная копия</h2>
  <p>
    Сохраните копию всех бронирований на устройство.
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
</main>
  <main class="app hidden-page" id="settingsPage">
  <div class="search-header">
    <p class="date">Приложение</p>
    <h1>Настройки</h1>
  </div>
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
</section>
</main>
  <nav class="bottom-nav">
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
          <select name="house" required></select>
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
            Заезд
            <span class="date-time-inputs">
              <input type="date" data-date-for="start" required>
              <input
                type="text"
                data-time-for="start"
                inputmode="numeric"
                maxlength="5"
                placeholder="14:00"
                aria-label="Время заезда"
                required
              >
            </span>
            <input type="hidden" name="start">
          </label>

          <label>
            Выезд
            <span class="date-time-inputs">
              <input type="date" data-date-for="end" required>
              <input
                type="text"
                data-time-for="end"
                inputmode="numeric"
                maxlength="5"
                placeholder="11:00"
                aria-label="Время выезда"
                required
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
            required
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
            required
          >
        </label>

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
              required
            >
          </label>
        </div>

        <div class="remaining">
          Осталось:
          <strong id="remainingAmount">0 ֏</strong>
        </div>

        <label>
          Комментарий
          <textarea
            name="comment"
            rows="3"
            placeholder="Необязательно"
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
            placeholder="Необязательно"
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
              <span>${new Date(receipt.createdAt).toLocaleDateString('ru-RU')}</span>
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
      `Квитанции · ${getHouseName(booking.houseId)}`
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
      alert(`Не удалось добавить некоторые фотографии:\n\n${errors.join('\n')}`)
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

  todayDate.textContent = now.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

renderTodayDate()

function showTodayPage() {
  todayPage.classList.remove('hidden-page')
  calendarPage.classList.add('hidden-page')
  searchPage.classList.add('hidden-page')
  settingsPage.classList.add('hidden-page')

  todayNav.classList.add('active')
  calendarNav.classList.remove('active')
  searchNav.classList.remove('active')
  settingsNav.classList.remove('active')
}

function showCalendarPage() {
  todayPage.classList.add('hidden-page')
  calendarPage.classList.remove('hidden-page')
  searchPage.classList.add('hidden-page')
  settingsPage.classList.add('hidden-page')

  todayNav.classList.remove('active')
  calendarNav.classList.add('active')
  searchNav.classList.remove('active')
  settingsNav.classList.remove('active')

  renderCalendar()
}

function showSearchPage() {
  todayPage.classList.add('hidden-page')
  calendarPage.classList.add('hidden-page')
  searchPage.classList.remove('hidden-page')
  settingsPage.classList.add('hidden-page')

  todayNav.classList.remove('active')
  calendarNav.classList.remove('active')
  searchNav.classList.add('active')
  settingsNav.classList.remove('active')
}

function showSettingsPage() {
  todayPage.classList.add('hidden-page')
  calendarPage.classList.add('hidden-page')
  searchPage.classList.add('hidden-page')
  settingsPage.classList.remove('hidden-page')

  todayNav.classList.remove('active')
  calendarNav.classList.remove('active')
  searchNav.classList.remove('active')
  settingsNav.classList.add('active')
}

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

  countLabel.textContent = `Количество домов: ${configuredHouseCount}`
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
}

function updateRemaining() {
  const price = Number(priceInput.value) || 0
  const paid = Number(paidInput.value) || 0

  const remaining = Math.max(0, price - paid)

  remainingAmount.textContent =
    `${remaining.toLocaleString('ru-RU')} ֏`
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
  alert('Предварительная бронь сохранена.')
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

  const now = new Date()

  housesContainer.innerHTML = ''

  for (const houseId of getHouseIds()) {
    const currentBooking = bookings.find((booking) => {
      if (booking.houseId !== houseId) {
        return false
      }

      const start = new Date(booking.startAt)
      const end = new Date(booking.endAt)

      return start <= now && end > now
    })

    const house = document.createElement('article')
    house.className = 'house'
    house.dataset.houseId = String(houseId)
    house.tabIndex = 0
    house.setAttribute('role', 'button')
    const houseName = getHouseName(houseId)

    if (!currentBooking) {
      house.setAttribute(
        'aria-label',
        `${houseName} свободен. Создать бронь`,
      )
      house.innerHTML = `
        <div>
          <span class="house-name">${escapeHtml(houseName)}</span>
          <span class="status free">● Свободен</span>
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
        `${houseName} занят. Открыть бронь: ${currentBooking.guestName}`,
      )

      house.innerHTML = `
        <div class="booking-info">

          <div class="house-top">
            <span class="house-name">
              ${escapeHtml(houseName)}
            </span>

            <span class="status busy">
              ● Занят
            </span>
          </div>

          <strong class="guest-name">
            ${currentBooking.guestName}
          </strong>

          <span class="booking-time">
            до ${end.toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
            })},
            ${end.toLocaleTimeString('ru-RU', {
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
              ${currentBooking.totalPrice.toLocaleString('ru-RU')} ֏
            </span>

            <span>
              Осталось:
              <strong>
                ${remaining.toLocaleString('ru-RU')} ֏
              </strong>
            </span>
          </div>

        </div>
      `
    }

    housesContainer.appendChild(house)
  }
}

const housesContainer =
  document.querySelector<HTMLDivElement>('#houses')!

function handleHouseActivation(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
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
  handleHouseActivation(event.target)
})

housesContainer.addEventListener('keydown', (event) => {
  if (
    event instanceof KeyboardEvent &&
    (event.key === 'Enter' || event.key === ' ')
  ) {
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

    return (
      new Date(a.startAt).getTime() -
      new Date(b.startAt).getTime()
    )
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

    return
  }

  container.innerHTML = upcomingBookings
    .map((booking) => {
      const start = new Date(booking.startAt)
      const end = new Date(booking.endAt)

      const remaining =
        booking.totalPrice - booking.paidAmount

      const startDate = start.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
      })

      const startTime = start.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })

      const endDate = end.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
      })

      const endTime = end.toLocaleTimeString('ru-RU', {
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
              ${booking.totalPrice.toLocaleString('ru-RU')} ֏
            </span>

            ${
              remaining > 0
                ? `
                  <span class="payment-due">
                    Осталось ${remaining.toLocaleString('ru-RU')} ֏
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

  if (!normalizedQuery) {
    container.innerHTML = `
      <div class="empty-bookings">
        Введите имя или номер телефона
      </div>
    `
    return
  }

  const bookings = await getAllBookings()

  const results = bookings
  .filter((booking) => {
  const name = booking.guestName.toLowerCase()
  const phone = booking.guestPhone.toLowerCase()

  const start = new Date(booking.startAt)

  const day = String(start.getDate()).padStart(2, '0')
  const month = String(start.getMonth() + 1).padStart(2, '0')

  const bookingDate = `${day}.${month}`

  const normalizedDateQuery = normalizedQuery
    .replace('/', '.')
    .split('.')
    .map((part) => part.padStart(2, '0'))
    .join('.')

  const matchesDate =
    normalizedQuery === String(start.getDate()) ||
    normalizedQuery === day ||
    bookingDate === normalizedDateQuery

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
              <span class="booking-type">
                ${booking.rentalType === 'overnight'
                  ? 'С ночёвкой'
                  : 'Без ночёвки'}
              </span>
              ${renderReceiptButton(booking)}
            </div>
          </div>

          <strong class="booking-guest">
            ${booking.guestName}
          </strong>

          <div class="booking-dates">
            ${start.toLocaleString('ru-RU', {
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
              ${booking.totalPrice.toLocaleString('ru-RU')} ֏
            </span>

            <span>
              ${
                remaining > 0
                  ? `Осталось ${remaining.toLocaleString('ru-RU')} ֏`
                  : 'Оплачено'
              }
            </span>
          </div>
        </article>
      `
    })
    .join('')
}

const bookingSearch =
  document.querySelector<HTMLInputElement>('#bookingSearch')!

bookingSearch.addEventListener('input', () => {
  renderSearchResults(bookingSearch.value)
})

async function refreshBookingViews() {
  await Promise.all([
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
}

renderBackupStatus()

exportBackupButton.addEventListener('click', async () => {
  const bookings = await getAllBookings()
  const receipts = await getAllReceipts()

  const backup = {
    version: 1,
    createdAt: new Date().toISOString(),
    bookings,
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

  const json = JSON.stringify(backup, null, 2)

  const blob = new Blob([json], {
    type: 'application/json',
  })

  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url

  const date = new Date()
    .toISOString()
    .slice(0, 10)

  link.download = `rental-manager-backup-${date}.json`

  document.body.appendChild(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(url)

  localStorage.setItem(
  'lastBackupAt',
  new Date().toISOString(),
)
  renderBackupStatus()
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
    const backup = JSON.parse(text)

    if (
      backup.version !== 1 ||
      !Array.isArray(backup.bookings)
    ) {
      alert('Это некорректный файл резервной копии.')
      return
    }

    const confirmed = confirm(
      `Найдено бронирований: ${backup.bookings.length}.\n` +
      `Квитанций: ${Array.isArray(backup.receipts) ? backup.receipts.length : 0}.\n\n` +
      'Текущие данные будут заменены данными из резервной копии.\n\n' +
      'Продолжить?',
    )

    if (!confirmed) {
      return
    }

    const bookingIds = new Set(
      backup.bookings.map((booking: Booking) => booking.id),
    )
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

    await replaceAllBookings(backup.bookings, importedReceipts)

    const importedHouseCount = backup.bookings.reduce(
      (maxHouseId: number, booking: Booking) =>
        Number.isSafeInteger(booking.houseId) && booking.houseId > maxHouseId
          ? booking.houseId
          : maxHouseId,
      configuredHouseCount,
    )

    if (importedHouseCount !== configuredHouseCount) {
      configuredHouseCount = importedHouseCount
      await setHouseCount(configuredHouseCount)
      renderHouseOptions()
      updateHouseSettings()
    }

    await refreshBookingViews()

    alert('Резервная копия успешно восстановлена.')
  } catch {
    alert('Не удалось прочитать файл резервной копии.')
  }
})

let calendarMonth = new Date()
calendarMonth.setDate(1)

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

  const bookings = await getAllBookings()
  const year = calendarMonth.getFullYear()
  const month = calendarMonth.getMonth()
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

  monthLabel.textContent = firstOfMonth.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  })

  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
    .map((weekday) => `<span class="month-weekday">${weekday}</span>`)
    .join('')

  let daysHtml = ''
  for (
    const date = new Date(firstGridDate);
    date <= lastGridDate;
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
          return `<span class="month-house free">${escapeHtml(getHouseName(houseId))} свободен</span>`
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
    const dateTitle = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    daysHtml += `
      <button
        type="button"
        class="month-day${isCurrentMonth ? '' : ' outside-month'}${isToday ? ' today' : ''}"
        data-calendar-date="${dateKey(date)}"
        aria-label="${dateTitle}, броней: ${dayBookings.length}"
      >
        <span class="month-day-number">${date.getDate()}</span>
        <span class="month-day-houses">${houseIndicators}</span>
      </button>
    `
  }

  calendar.innerHTML = `
    <div class="month-grid">
      ${weekdays}
      ${daysHtml}
    </div>
  `
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

  selectedDayTitle.textContent = dayStart.toLocaleDateString('ru-RU', {
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
          const aPending = (a.status ?? 'confirmed') === 'pending'
          const bPending = (b.status ?? 'confirmed') === 'pending'
          if (aPending !== bPending) {
            return aPending ? -1 : 1
          }
          if (aPending) {
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
                    <span>${status} · ${booking.totalPrice.toLocaleString('ru-RU')} ֏</span>
                    <span>${booking.rentalType === 'overnight' ? 'С ночёвкой' : 'Без ночёвки'}</span>
                    <span>${start.toLocaleString('ru-RU')} — ${end.toLocaleString('ru-RU')}</span>
                    <span>Гостей: ${booking.guestCount} · Оплачено: ${booking.paidAmount.toLocaleString('ru-RU')} ֏ · Осталось: ${remaining.toLocaleString('ru-RU')} ֏</span>
                    ${booking.guestPhone ? renderContactPhoneButton(booking.guestPhone) : ''}
                    ${renderReceiptButton(booking)}
                    ${booking.comment ? `<span>Комментарий: ${booking.comment}</span>` : ''}
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

    void openSelectedDay(parseDateKey(dateKeyValue))
  })

const calendarPrev =
  document.querySelector<HTMLButtonElement>('#calendarPrev')!
const calendarToday =
  document.querySelector<HTMLButtonElement>('#calendarToday')!
const calendarNext =
  document.querySelector<HTMLButtonElement>('#calendarNext')!

calendarPrev.addEventListener('click', () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1)
  renderCalendar()
})

calendarToday.addEventListener('click', () => {
  calendarMonth = new Date()
  calendarMonth.setDate(1)
  renderCalendar()
})

calendarNext.addEventListener('click', () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1)
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
  updateHouseSettings()
  houseSetupModal.classList.add('hidden')
  await refreshBookingViews()
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
  updateHouseSettings()
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
  updateHouseSettings()
  await refreshBookingViews()
})

async function initializeHouseConfiguration() {
  const savedHouseCount = await getHouseCount()
  configuredHouseNames = await getHouseNames()

  if (savedHouseCount === undefined) {
    const bookings = await getAllBookings()
    const maxExistingHouseId = bookings.reduce(
      (maxHouseId, booking) =>
        Number.isSafeInteger(booking.houseId) && booking.houseId > maxHouseId
          ? booking.houseId
          : maxHouseId,
      0,
    )

    if (bookings.length > 0) {
      configuredHouseCount = Math.max(3, maxExistingHouseId)
      await setHouseCount(configuredHouseCount)
    } else {
      houseSetupModal.classList.remove('hidden')
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
  updateHouseSettings()
  await refreshBookingViews()
}

void initializeHouseConfiguration()

function refreshHouseOccupancyWhenVisible() {
  if (
    document.visibilityState === 'visible' &&
    configuredHouseCount > 0
  ) {
    void renderHouses()

    if (bookingListMode === 'upcoming') {
      void renderUpcomingBookings('upcoming')
    }
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
    `Осталось: ${remaining.toLocaleString('ru-RU')} ֏\nВведите сумму оплаты:`,
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
          ${start.toLocaleString('ru-RU')}
        </strong>
      </div>

      <div class="details-row">
        <span>Выезд</span>
        <strong>
          ${end.toLocaleString('ru-RU')}
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
            ${booking.totalPrice.toLocaleString('ru-RU')} ֏
          </strong>
        </div>

        <div class="details-row">
          <span>Предоплата</span>
          <strong>
            ${booking.paidAmount.toLocaleString('ru-RU')} ֏
          </strong>
        </div>

        <div class="details-row remaining-row">
          <span>Осталось</span>
          <strong>
            ${remaining.toLocaleString('ru-RU')} ֏
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

  modal.classList.remove('hidden')
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()

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

  const now = new Date().toISOString()

  const booking: Booking = {
    id: crypto.randomUUID(),

    houseId: Number(formData.get('house')),
    rentalType: formData.get('rentalType') as 'overnight' | 'day',
    status: bookingStatus,

    startAt: String(formData.get('start')),
    endAt: String(formData.get('end')),

    guestName: String(formData.get('guestName')),
    guestPhone: String(formData.get('phone')),
    guestCount: Number(formData.get('guestCount')),

    totalPrice: Number(formData.get('price')),
    paidAmount: Number(formData.get('paid')),

    comment: String(formData.get('comment')),

    createdAt: now,
    updatedAt: now,
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
  const hasConflict = await hasBookingConflict(
    booking.houseId,
    booking.startAt,
    booking.endAt,
    booking.status,
    editingBookingId ?? undefined,
  )

  if (hasConflict) {
    alert(
      `${getHouseName(booking.houseId)} уже забронирован на выбранное время.`,
    )
    return
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

    alert('Бронь сохранена!')
})
