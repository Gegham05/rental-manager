import './style.css'
import { hasBookingConflict } from './services/bookingService'
import type { Booking } from './models/Booking'
import {
  createBooking,
  getAllBookings,
  updateBooking,
  deleteBooking,
  replaceAllBookings,
} from './storage/bookingRepository'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="app" id="todayPage">
    <header class="header">
      <div>
        <p class="date" id="todayDate"></p>
        <h1>Сегодня</h1>
      </div>

      <button class="add-button" id="addBooking">
        + Новая бронь
      </button>
    </header>

    <section class="houses" id="houses"></section>
    <section class="upcoming-section">
  <div class="section-header">
    <h2>Ближайшие брони</h2>
  </div>

    <div class="upcoming-bookings" id="upcomingBookings"></div>
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
      <button id="calendarPrev">←</button>
      <button id="calendarToday">Сегодня</button>
      <button id="calendarNext">→</button>
    </div>

    <div id="calendar"></div>
  </main>
  <main class="app hidden-page" id="searchPage">
  <div class="search-header">
    <p class="date">Бронирования</p>
    <h1>Поиск</h1>
  </div>

  <input
    type="search"
    id="bookingSearch"
    class="search-input"
    placeholder="Имя или телефон"
    autocomplete="off"
  />

  <div id="searchResults" class="search-results">
    <div class="empty-bookings">
      Введите имя или номер телефона
    </div>
  </div>
  <section class="backup-section">
  <h2>Резервная копия</h2>
  <p>
    Сохраните копию всех бронирований на устройство.
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
</nav>
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
          <select name="house" required>
            <option value="1">Дом 1</option>
            <option value="2">Дом 2</option>
            <option value="3">Дом 3</option>
          </select>
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
            <input type="datetime-local" name="start" required>
          </label>

          <label>
            Выезд
            <input type="datetime-local" name="end" required>
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

        <button type="submit" class="save-button" id="saveBookingButton">
          Забронировать
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
`

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

const searchNav =
  document.querySelector<HTMLButtonElement>('#searchNav')!

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

  todayNav.classList.add('active')
  calendarNav.classList.remove('active')
  searchNav.classList.remove('active')
}

function showCalendarPage() {
  todayPage.classList.add('hidden-page')
  calendarPage.classList.remove('hidden-page')
  searchPage.classList.add('hidden-page')

  todayNav.classList.remove('active')
  calendarNav.classList.add('active')
  searchNav.classList.remove('active')

  renderCalendar()
}

function showSearchPage() {
  todayPage.classList.add('hidden-page')
  calendarPage.classList.add('hidden-page')
  searchPage.classList.remove('hidden-page')

  todayNav.classList.remove('active')
  calendarNav.classList.remove('active')
  searchNav.classList.add('active')
}

todayNav.addEventListener('click', showTodayPage)
calendarNav.addEventListener('click', showCalendarPage)
searchNav.addEventListener('click', showSearchPage)

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

const startInput =
  form.elements.namedItem('start') as HTMLInputElement

const endInput =
  form.elements.namedItem('end') as HTMLInputElement

let editingBookingId: string | null = null

const saveBookingButton =
  document.querySelector<HTMLButtonElement>('#saveBookingButton')!

const priceInput =
  form.elements.namedItem('price') as HTMLInputElement

const paidInput =
  form.elements.namedItem('paid') as HTMLInputElement

const remainingAmount =
  document.querySelector<HTMLElement>('#remainingAmount')!

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

function updateOvernightDates() {
  const rentalType =
    form.querySelector<HTMLInputElement>(
      'input[name="rentalType"]:checked',
    )

  if (rentalType?.value !== 'overnight') {
    return
  }

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
}

function openModal() {
  editingBookingId = null

  form.reset()
  updateRemaining()

  const start = new Date()
  start.setHours(14, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  end.setHours(11, 0, 0, 0)

  startInput.value = formatDateTimeLocal(start)
  endInput.value = formatDateTimeLocal(end)

  saveBookingButton.textContent = 'Забронировать'

  modal.classList.remove('hidden')
}

addButton.addEventListener('click', openModal)
startInput.addEventListener('change', updateOvernightDates)

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

  for (const houseId of [1, 2, 3] as const) {
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

    if (!currentBooking) {
      house.innerHTML = `
        <div>
          <span class="house-name">Дом ${houseId}</span>
          <span class="status free">● Свободен</span>
        </div>
      `
    } else {
      const remaining =
        currentBooking.totalPrice - currentBooking.paidAmount

      const end = new Date(currentBooking.endAt)

      house.classList.add('occupied')

      house.innerHTML = `
        <div class="booking-info">

          <div class="house-top">
            <span class="house-name">
              Дом ${houseId}
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

async function renderUpcomingBookings() {
  const container =
    document.querySelector<HTMLDivElement>('#upcomingBookings')!

  const bookings = await getAllBookings()

  const now = new Date()

  const upcomingBookings = bookings
    .filter((booking) => {
      return new Date(booking.endAt) > now
    })
    .sort((a, b) => {
      return (
        new Date(a.startAt).getTime() -
        new Date(b.startAt).getTime()
      )
    })

  if (upcomingBookings.length === 0) {
    container.innerHTML = `
      <div class="empty-bookings">
        Ближайших броней пока нет
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
              Дом ${booking.houseId}
            </span>

            <span class="booking-type">
              ${
                booking.rentalType === 'overnight'
                  ? 'С ночёвкой'
                  : 'Без ночёвки'
              }
            </span>
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
                ? `<span>☎ ${booking.guestPhone}</span>`
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

      return (
        name.includes(normalizedQuery) ||
        phone.includes(normalizedQuery)
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
              Дом ${booking.houseId}
            </span>

            <span class="booking-type">
              ${booking.rentalType === 'overnight'
                ? 'С ночёвкой'
                : 'Без ночёвки'}
            </span>
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
              ? `
                <div class="booking-meta">
                  ☎ ${booking.guestPhone}
                </div>
              `
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

exportBackupButton.addEventListener('click', async () => {
  const bookings = await getAllBookings()

  const backup = {
    version: 1,
    createdAt: new Date().toISOString(),
    bookings,
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
      `Найдено бронирований: ${backup.bookings.length}.\n\n` +
      'Текущие данные будут заменены данными из резервной копии.\n\n' +
      'Продолжить?',
    )

    if (!confirmed) {
      return
    }

    await replaceAllBookings(backup.bookings)

    await renderHouses()
    await renderUpcomingBookings()
    await renderCalendar()

    renderSearchResults(bookingSearch.value)

    alert('Резервная копия успешно восстановлена.')
  } catch {
    alert('Не удалось прочитать файл резервной копии.')
  }
})

let calendarOffset = 0
async function renderCalendar() {
  const calendar =
    document.querySelector<HTMLDivElement>('#calendar')!

  const bookings = await getAllBookings()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  today.setDate(today.getDate() + calendarOffset)

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() + index)
    return date
  })

  calendar.innerHTML = ''

  for (const date of days) {
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)

    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    const dayElement = document.createElement('section')
    dayElement.className = 'calendar-day'

    const dateText = date.toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })

    let housesHtml = ''

    for (const houseId of [1, 2, 3] as const) {
      const booking = bookings.find((booking) => {
        if (booking.houseId !== houseId) {
          return false
        }

        const start = new Date(booking.startAt)
        const end = new Date(booking.endAt)

        return start <= dayEnd && end > dayStart
      })

      if (booking) {
        housesHtml += `
          <div
            class="calendar-house busy"
            data-booking-id="${booking.id}"
          >
            <strong>Дом ${houseId}</strong>
            <span>${booking.guestName}</span>
          </div>
        `
      } else {
        housesHtml += `
          <div class="calendar-house free">
            <strong>Дом ${houseId}</strong>
            <span>Свободен</span>
          </div>
        `
      }
    }

    dayElement.innerHTML = `
      <div class="calendar-date">
        ${dateText}
      </div>

      <div class="calendar-houses">
        ${housesHtml}
      </div>
    `

    calendar.appendChild(dayElement)
  }
}

document
  .querySelector('#calendar')
  ?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement

    const bookingCard =
      target.closest<HTMLElement>('.calendar-house.busy')

    if (!bookingCard) {
      return
    }

    const bookingId = bookingCard.dataset.bookingId

    if (!bookingId) {
      return
    }

    openBookingDetails(bookingId)
  })

const calendarPrev =
  document.querySelector<HTMLButtonElement>('#calendarPrev')!

const calendarToday =
  document.querySelector<HTMLButtonElement>('#calendarToday')!

const calendarNext =
  document.querySelector<HTMLButtonElement>('#calendarNext')!

calendarPrev.addEventListener('click', () => {
  calendarOffset -= 7
  renderCalendar()
})

calendarToday.addEventListener('click', () => {
  calendarOffset = 0
  renderCalendar()
})

calendarNext.addEventListener('click', () => {
  calendarOffset += 7
  renderCalendar()
})

renderHouses()
renderUpcomingBookings()
renderCalendar()

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

    updateRemaining()
    closeBookingDetails()
    modal.classList.remove('hidden')

    return
    }

    startInput.addEventListener('change', updateOvernightDates)

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
    `Удалить бронь?\n\nДом ${booking.houseId}\n${booking.guestName}`,
  )

  if (!confirmed) {
    return
  }

  await deleteBooking(bookingId)

  closeBookingDetails()

  await renderHouses()
  await renderUpcomingBookings()

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
  booking.updatedAt = new Date().toISOString()

  await updateBooking(booking)

  await renderHouses()
  await renderUpcomingBookings()
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

  houseTitle.textContent = `Дом ${booking.houseId}`

  details.innerHTML = `
    <div class="details">

      <div class="details-client">
        <strong>${booking.guestName}</strong>

        ${
          booking.guestPhone
            ? `<a href="tel:${booking.guestPhone}">
                 ${booking.guestPhone}
               </a>`
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

  const formData = new FormData(form)

  const now = new Date().toISOString()

  const booking: Booking = {
    id: crypto.randomUUID(),

    houseId: Number(formData.get('house')) as 1 | 2 | 3,
    rentalType: formData.get('rentalType') as 'overnight' | 'day',

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
  
  if (new Date(booking.endAt) <= new Date(booking.startAt)) {
  alert('Время выезда должно быть позже времени заезда.')
  return
}

const hasConflict = await hasBookingConflict(
  booking.houseId,
  booking.startAt,
  booking.endAt,
  editingBookingId ?? undefined,
)

if (hasConflict) {
  alert(
    `Дом ${booking.houseId} уже забронирован на выбранное время.`,
  )

  return
}

  if (editingBookingId) {
    const bookings = await getAllBookings()

    const existingBooking = bookings.find(
      (item) => item.id === editingBookingId,
    )

    if (!existingBooking) {
      alert('Бронь не найдена.')
      return
    }

    booking.id = existingBooking.id
    booking.createdAt = existingBooking.createdAt
    booking.updatedAt = new Date().toISOString()

    await updateBooking(booking)

    editingBookingId = null
  } else {
    await createBooking(booking)
  }
    await renderHouses()
    await renderUpcomingBookings()

    console.log('Бронь сохранена:', booking)

    const bookings = await getAllBookings()

    console.log('Все бронирования:', bookings)

    form.reset()
    updateRemaining()
    closeModal()
    saveBookingButton.textContent = 'Забронировать'

    alert('Бронь сохранена!')
})
