import { openDB } from 'idb'
import type { AppLanguage } from '../services/i18n'
import type { Booking } from '../models/Booking'
import type { GuestBookingRequest } from '../models/GuestBookingRequest'
import type { HouseProfile } from '../models/HouseProfile'
import type { Receipt } from '../models/Receipt'
import type { BookingPayment } from '../models/BookingPayment'
import type { BusinessExpense } from '../models/BusinessExpense'

const DB_NAME = 'rental-manager'
const DB_VERSION = 6
const BOOKING_STORE = 'bookings'
const SETTINGS_STORE = 'settings'
const RECEIPT_STORE = 'receipts'
const HOUSE_STORE = 'houses'
const GUEST_REQUEST_STORE = 'guestRequests'
const PAYMENT_STORE = 'payments'
const EXPENSE_STORE = 'expenses'

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion, _newVersion, transaction) {
    if (!db.objectStoreNames.contains(BOOKING_STORE)) {
      db.createObjectStore(BOOKING_STORE, {
        keyPath: 'id',
      })
    }
    if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
      db.createObjectStore(SETTINGS_STORE, {
        keyPath: 'key',
      })
    }

    if (!db.objectStoreNames.contains(RECEIPT_STORE)) {
      const receiptStore = db.createObjectStore(RECEIPT_STORE, {
        keyPath: 'id',
      })
      receiptStore.createIndex('bookingId', 'bookingId')
    }

    if (!db.objectStoreNames.contains(HOUSE_STORE)) {
      db.createObjectStore(HOUSE_STORE, {
        keyPath: 'houseId',
      })
    }

    if (!db.objectStoreNames.contains(GUEST_REQUEST_STORE)) {
      const requestStore = db.createObjectStore(GUEST_REQUEST_STORE, {
        keyPath: 'id',
      })
      requestStore.createIndex('houseId', 'houseId')
      requestStore.createIndex('status', 'status')
    }

    if (!db.objectStoreNames.contains(PAYMENT_STORE)) {
      const paymentStore = db.createObjectStore(PAYMENT_STORE, {
        keyPath: 'id',
      })
      paymentStore.createIndex('bookingId', 'bookingId')
      paymentStore.createIndex('paidAt', 'paidAt')
    }

    if (!db.objectStoreNames.contains(EXPENSE_STORE)) {
      const expenseStore = db.createObjectStore(EXPENSE_STORE, {
        keyPath: 'id',
      })
      expenseStore.createIndex('date', 'date')
    }

    if (oldVersion === 1) {
      transaction.objectStore(SETTINGS_STORE).put({
        key: 'houseCount',
        value: 3,
      })
    }
  },
})

export async function getHouseCount(): Promise<number | undefined> {
  const db = await dbPromise
  const setting = await db.get(SETTINGS_STORE, 'houseCount') as
    | { key: string; value: number }
    | undefined

  return setting?.value
}

export async function setHouseCount(count: number): Promise<void> {
  const db = await dbPromise
  await db.put(SETTINGS_STORE, {
    key: 'houseCount',
    value: count,
  })
}

export async function getAppLanguage(): Promise<AppLanguage | undefined> {
  const db = await dbPromise
  const setting = await db.get(SETTINGS_STORE, 'language') as
    | { key: string; value: unknown }
    | undefined

  return setting?.value === 'hy' ||
    setting?.value === 'ru' ||
    setting?.value === 'en'
    ? setting.value
    : undefined
}

export async function setAppLanguage(language: AppLanguage): Promise<void> {
  const db = await dbPromise
  await db.put(SETTINGS_STORE, {
    key: 'language',
    value: language,
  })
}

export async function getHouseNames(): Promise<Record<number, string>> {
  const db = await dbPromise
  const setting = await db.get(SETTINGS_STORE, 'houseNames') as
    | { key: string; value: Record<string, string> }
    | undefined

  const houseNames: Record<number, string> = {}
  for (const [houseId, name] of Object.entries(setting?.value ?? {})) {
    const parsedHouseId = Number(houseId)
    if (Number.isSafeInteger(parsedHouseId) && typeof name === 'string') {
      houseNames[parsedHouseId] = name
    }
  }

  return houseNames
}

export async function setHouseName(
  houseId: number,
  name: string,
): Promise<void> {
  const db = await dbPromise
  const transaction = db.transaction(SETTINGS_STORE, 'readwrite')
  const settingsStore = transaction.objectStore(SETTINGS_STORE)
  const setting = await settingsStore.get('houseNames') as
    | { key: string; value: Record<string, string> }
    | undefined
  const houseNames = { ...(setting?.value ?? {}) }
  houseNames[String(houseId)] = name

  await settingsStore.put({
    key: 'houseNames',
    value: houseNames,
  })
  await transaction.done
}

export async function removeHouseAndBookings(
  houseId: number,
  newHouseCount: number,
): Promise<void> {
  const db = await dbPromise
  const transaction = db.transaction(
    [
      BOOKING_STORE,
      SETTINGS_STORE,
      RECEIPT_STORE,
      HOUSE_STORE,
      GUEST_REQUEST_STORE,
      PAYMENT_STORE,
    ],
    'readwrite',
  )
  const bookingStore = transaction.objectStore(BOOKING_STORE)
  const receiptIndex = transaction
    .objectStore(RECEIPT_STORE)
    .index('bookingId')
  const houseStore = transaction.objectStore(HOUSE_STORE)
  const requestStore = transaction.objectStore(GUEST_REQUEST_STORE)
  let cursor = await bookingStore.openCursor()

  while (cursor) {
    if (cursor.value.houseId === houseId) {
      const receiptIds = await receiptIndex.getAllKeys(cursor.value.id)
      for (const receiptId of receiptIds) {
        await transaction.objectStore(RECEIPT_STORE).delete(receiptId)
      }
      await cursor.delete()
    } else if (cursor.value.houseId > houseId) {
      await cursor.update({
        ...cursor.value,
        houseId: cursor.value.houseId - 1,
      })
    }
    cursor = await cursor.continue()
  }

  let houseCursor = await houseStore.openCursor()
  while (houseCursor) {
    if (houseCursor.value.houseId === houseId) {
      await houseCursor.delete()
    } else if (houseCursor.value.houseId > houseId) {
      const shiftedProfile = {
        ...houseCursor.value,
        houseId: houseCursor.value.houseId - 1,
      }
      await houseCursor.delete()
      await houseStore.put(shiftedProfile)
    }
    houseCursor = await houseCursor.continue()
  }

  let requestCursor = await requestStore.openCursor()
  while (requestCursor) {
    if (requestCursor.value.houseId === houseId) {
      await requestCursor.delete()
    } else if (requestCursor.value.houseId > houseId) {
      await requestCursor.update({
        ...requestCursor.value,
        houseId: requestCursor.value.houseId - 1,
      })
    }
    requestCursor = await requestCursor.continue()
  }

  const settingsStore = transaction.objectStore(SETTINGS_STORE)
  const namesSetting = await settingsStore.get('houseNames') as
    | { key: string; value: Record<string, string> }
    | undefined
  const houseNames: Record<string, string> = {}
  for (const [id, name] of Object.entries(namesSetting?.value ?? {})) {
    const currentHouseId = Number(id)
    if (currentHouseId < houseId) {
      houseNames[id] = name
    } else if (currentHouseId > houseId) {
      houseNames[String(currentHouseId - 1)] = name
    }
  }

  await settingsStore.put({
    key: 'houseCount',
    value: newHouseCount,
  })
  await settingsStore.put({
    key: 'houseNames',
    value: houseNames,
  })
  await transaction.done
}

export async function createBooking(booking: Booking): Promise<void> {
  const db = await dbPromise
  const transaction = db.transaction(
    [BOOKING_STORE, PAYMENT_STORE],
    'readwrite',
  )
  await transaction.objectStore(BOOKING_STORE).add(booking)
  if (booking.paidAmount > 0) {
    await transaction.objectStore(PAYMENT_STORE).add({
      id: crypto.randomUUID(),
      bookingId: booking.id,
      amount: booking.paidAmount,
      paidAt: booking.createdAt,
    } satisfies BookingPayment)
  }
  await transaction.done
}

export async function getAllBookings(): Promise<Booking[]> {
  const db = await dbPromise
  return db.getAll(BOOKING_STORE)
}

export async function expireCompletedTentativeBookings(
  now: Date = new Date(),
): Promise<boolean> {
  const db = await dbPromise
  const transaction = db.transaction(BOOKING_STORE, 'readwrite')
  const store = transaction.objectStore(BOOKING_STORE)
  let cursor = await store.openCursor()
  let expiredAny = false

  while (cursor) {
    const booking = cursor.value as Booking
    if (
      booking.status === 'pending' &&
      new Date(booking.endAt).getTime() <= now.getTime()
    ) {
      await cursor.update({
        ...booking,
        status: 'expired',
        updatedAt: now.toISOString(),
      })
      expiredAny = true
    }
    cursor = await cursor.continue()
  }

  await transaction.done
  return expiredAny
}

export async function getBooking(id: string): Promise<Booking | undefined> {
  const db = await dbPromise
  return db.get(BOOKING_STORE, id)
}

export async function updateBooking(booking: Booking): Promise<void> {
  const db = await dbPromise
  const transaction = db.transaction(
    [BOOKING_STORE, PAYMENT_STORE],
    'readwrite',
  )
  const bookingStore = transaction.objectStore(BOOKING_STORE)
  const paymentStore = transaction.objectStore(PAYMENT_STORE)
  const existing = await bookingStore.get(booking.id) as Booking | undefined
  if (!existing) {
    throw new Error(`Booking not found: ${booking.id}`)
  }
  const payments = await paymentStore
    .index('bookingId')
    .getAll(booking.id) as BookingPayment[]
  const ledgerTotal = payments.reduce((total, payment) => total + payment.amount, 0)
  const difference = booking.paidAmount - ledgerTotal
  if (difference !== 0) {
    await paymentStore.add({
      id: crypto.randomUUID(),
      bookingId: booking.id,
      amount: difference,
      paidAt: booking.updatedAt,
    } satisfies BookingPayment)
  }
  await bookingStore.put(booking)
  await transaction.done
}

export async function deleteBooking(id: string): Promise<void> {
  const db = await dbPromise
  const transaction = db.transaction(
    [BOOKING_STORE, RECEIPT_STORE, GUEST_REQUEST_STORE],
    'readwrite',
  )
  const bookingStore = transaction.objectStore(BOOKING_STORE)
  const requestStore = transaction.objectStore(GUEST_REQUEST_STORE)
  const booking = await bookingStore.get(id) as Booking | undefined
  await bookingStore.delete(id)
  if (booking?.guestRequestId) {
    const request = await requestStore.get(
      booking.guestRequestId,
    ) as GuestBookingRequest | undefined
    if (
      (request?.status === 'accepted' ||
        request?.status === 'cancellation_requested' ||
        request?.status === 'cancellation_rejected') &&
      request.bookingId === booking.id
    ) {
      await requestStore.put({
        ...request,
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
      })
    }
  }
  const receipts = await transaction
    .objectStore(RECEIPT_STORE)
    .index('bookingId')
    .getAllKeys(id)
  for (const receiptId of receipts) {
    await transaction.objectStore(RECEIPT_STORE).delete(receiptId)
  }
  await transaction.done
}

export async function getAllBookingPayments(): Promise<BookingPayment[]> {
  const db = await dbPromise
  return db.getAll(PAYMENT_STORE)
}

export async function recordBookingPayment(
  bookingId: string,
  amount: number,
  paidAt: string,
): Promise<
  | { status: 'recorded'; booking: Booking }
  | { status: 'not-found' | 'invalid-amount' | 'overpayment' | 'conflict' }
> {
  const db = await dbPromise
  const transaction = db.transaction(
    [BOOKING_STORE, PAYMENT_STORE],
    'readwrite',
  )
  const bookingStore = transaction.objectStore(BOOKING_STORE)
  const paymentStore = transaction.objectStore(PAYMENT_STORE)
  const booking = await bookingStore.get(bookingId) as Booking | undefined

  if (!booking) {
    await transaction.done
    return { status: 'not-found' }
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    await transaction.done
    return { status: 'invalid-amount' }
  }
  if (amount > booking.totalPrice - booking.paidAmount) {
    await transaction.done
    return { status: 'overpayment' }
  }

  const updatedBooking: Booking = {
    ...booking,
    paidAmount: booking.paidAmount + amount,
    updatedAt: paidAt,
    status:
      booking.status === 'pending' && amount > 0
        ? 'confirmed'
        : booking.status,
  }
  if (
    booking.status === 'pending' &&
    updatedBooking.status === 'confirmed'
  ) {
    const bookings = await bookingStore.getAll()
    const start = new Date(booking.startAt).getTime()
    const end = new Date(booking.endAt).getTime()
    const conflicts = bookings.some((other) =>
      other.id !== booking.id &&
      other.houseId === booking.houseId &&
      (other.status ?? 'confirmed') === 'confirmed' &&
      start < new Date(other.endAt).getTime() &&
      end > new Date(other.startAt).getTime(),
    )
    if (conflicts) {
      await transaction.done
      return { status: 'conflict' }
    }
  }
  await bookingStore.put(updatedBooking)
  await paymentStore.add({
    id: crypto.randomUUID(),
    bookingId,
    amount,
    paidAt,
  } satisfies BookingPayment)
  await transaction.done
  return { status: 'recorded', booking: updatedBooking }
}

export async function addBusinessExpense(
  expense: BusinessExpense,
): Promise<void> {
  const db = await dbPromise
  await db.add(EXPENSE_STORE, expense)
}

export async function getAllBusinessExpenses(): Promise<BusinessExpense[]> {
  const db = await dbPromise
  return db.getAll(EXPENSE_STORE)
}

export async function deleteBusinessExpense(id: string): Promise<void> {
  const db = await dbPromise
  await db.delete(EXPENSE_STORE, id)
}

export async function migrateLegacyBookingPayments(): Promise<void> {
  const db = await dbPromise
  const transaction = db.transaction(
    [BOOKING_STORE, PAYMENT_STORE, SETTINGS_STORE],
    'readwrite',
  )
  const settings = transaction.objectStore(SETTINGS_STORE)
  const migration = await settings.get('legacyPaymentLedgerMigrated')
  if (migration?.value === true) {
    await transaction.done
    return
  }

  const bookingStore = transaction.objectStore(BOOKING_STORE)
  const paymentStore = transaction.objectStore(PAYMENT_STORE)
  let cursor = await bookingStore.openCursor()
  while (cursor) {
    const booking = cursor.value as Booking
    const existing = await paymentStore
      .index('bookingId')
      .getAll(booking.id) as BookingPayment[]
    if (booking.paidAmount > 0 && existing.length === 0) {
      await paymentStore.add({
        id: `legacy-${booking.id}`,
        bookingId: booking.id,
        amount: booking.paidAmount,
        paidAt: booking.updatedAt || booking.createdAt,
        legacy: true,
      } satisfies BookingPayment)
    }
    cursor = await cursor.continue()
  }
  await settings.put({ key: 'legacyPaymentLedgerMigrated', value: true })
  await transaction.done
}

export async function addReceipt(receipt: Receipt): Promise<void> {
  const db = await dbPromise
  await db.add(RECEIPT_STORE, receipt)
}

export async function getReceiptsForBooking(
  bookingId: string,
): Promise<Receipt[]> {
  const db = await dbPromise
  return db.getAllFromIndex(RECEIPT_STORE, 'bookingId', bookingId)
}

export async function getAllReceipts(): Promise<Receipt[]> {
  const db = await dbPromise
  return db.getAll(RECEIPT_STORE)
}

export async function deleteReceipt(id: string): Promise<void> {
  const db = await dbPromise
  await db.delete(RECEIPT_STORE, id)
}

export async function getHouseProfile(
  houseId: number,
): Promise<HouseProfile | undefined> {
  const db = await dbPromise
  return db.get(HOUSE_STORE, houseId)
}

export async function getAllHouseProfiles(): Promise<HouseProfile[]> {
  const db = await dbPromise
  return db.getAll(HOUSE_STORE)
}

export async function createGuestBookingRequest(
  request: GuestBookingRequest,
): Promise<void> {
  const db = await dbPromise
  await db.add(GUEST_REQUEST_STORE, request)
}

export async function getGuestBookingRequest(
  id: string,
): Promise<GuestBookingRequest | undefined> {
  const db = await dbPromise
  return db.get(GUEST_REQUEST_STORE, id)
}

export async function getAllGuestBookingRequests(): Promise<GuestBookingRequest[]> {
  const db = await dbPromise
  return db.getAll(GUEST_REQUEST_STORE)
}

export async function deleteGuestBookingRequest(
  requestId: string,
): Promise<boolean> {
  const db = await dbPromise
  const transaction = db.transaction(GUEST_REQUEST_STORE, 'readwrite')
  const store = transaction.objectStore(GUEST_REQUEST_STORE)
  const request = await store.get(requestId) as GuestBookingRequest | undefined
  if (!request || request.status !== 'rejected') {
    await transaction.done
    return false
  }
  await store.delete(requestId)
  await transaction.done
  return true
}

export async function deleteExpiredRejectedGuestBookingRequests(
  now: Date = new Date(),
): Promise<void> {
  const db = await dbPromise
  const transaction = db.transaction(GUEST_REQUEST_STORE, 'readwrite')
  const store = transaction.objectStore(GUEST_REQUEST_STORE)
  let cursor = await store.openCursor()

  while (cursor) {
    const request = cursor.value as GuestBookingRequest
    if (
      request.status === 'rejected' &&
      new Date(`${request.checkIn}T14:00`).getTime() <= now.getTime()
    ) {
      await cursor.delete()
    }
    cursor = await cursor.continue()
  }
  await transaction.done
}

export async function requestGuestBookingCancellation(
  requestId: string,
  updatedAt: string,
): Promise<boolean> {
  const db = await dbPromise
  const transaction = db.transaction(GUEST_REQUEST_STORE, 'readwrite')
  const store = transaction.objectStore(GUEST_REQUEST_STORE)
  const request = await store.get(requestId) as GuestBookingRequest | undefined
  if (
    !request ||
    (request.status !== 'accepted' &&
      request.status !== 'cancellation_rejected')
  ) {
    await transaction.done
    return false
  }
  await store.put({
    ...request,
    status: 'cancellation_requested',
    updatedAt,
  })
  await transaction.done
  return true
}

export async function resolveGuestBookingCancellation(
  requestId: string,
  approve: boolean,
  updatedAt: string,
): Promise<boolean> {
  const db = await dbPromise
  const transaction = db.transaction(
    [BOOKING_STORE, RECEIPT_STORE, PAYMENT_STORE, GUEST_REQUEST_STORE],
    'readwrite',
  )
  const requestStore = transaction.objectStore(GUEST_REQUEST_STORE)
  const request = await requestStore.get(requestId) as GuestBookingRequest | undefined
  if (!request || request.status !== 'cancellation_requested') {
    await transaction.done
    return false
  }

  if (!approve) {
    await requestStore.put({
      ...request,
      status: 'cancellation_rejected',
      updatedAt,
    })
    await transaction.done
    return true
  }

  const bookingStore = transaction.objectStore(BOOKING_STORE)
  const booking = request.bookingId
    ? await bookingStore.get(request.bookingId) as Booking | undefined
    : undefined
  if (!booking || booking.guestRequestId !== request.id) {
    await transaction.done
    return false
  }

  const receiptIds = await transaction
    .objectStore(RECEIPT_STORE)
    .index('bookingId')
    .getAllKeys(booking.id)
  for (const receiptId of receiptIds) {
    await transaction.objectStore(RECEIPT_STORE).delete(receiptId)
  }
  await bookingStore.delete(booking.id)
  await requestStore.put({
    ...request,
    status: 'cancelled',
    updatedAt,
  })
  await transaction.done
  return true
}

export async function rejectGuestBookingRequest(
  requestId: string,
  updatedAt: string,
): Promise<boolean> {
  const db = await dbPromise
  const transaction = db.transaction(GUEST_REQUEST_STORE, 'readwrite')
  const store = transaction.objectStore(GUEST_REQUEST_STORE)
  const request = await store.get(requestId) as GuestBookingRequest | undefined
  if (!request || request.status !== 'pending') {
    await transaction.done
    return false
  }
  await store.put({ ...request, status: 'rejected', updatedAt })
  await transaction.done
  return true
}

export type AcceptGuestBookingRequestResult =
  | { status: 'accepted'; booking: Booking }
  | { status: 'conflict'; conflicts: Booking[] }
  | { status: 'not-found' | 'not-pending' }

export async function acceptGuestBookingRequest(
  requestId: string,
  updatedAt: string,
): Promise<AcceptGuestBookingRequestResult> {
  const db = await dbPromise
  const transaction = db.transaction(
    [BOOKING_STORE, GUEST_REQUEST_STORE],
    'readwrite',
  )
  const bookingStore = transaction.objectStore(BOOKING_STORE)
  const requestStore = transaction.objectStore(GUEST_REQUEST_STORE)
  const request = await requestStore.get(requestId) as
    | GuestBookingRequest
    | undefined

  if (!request) {
    await transaction.done
    return { status: 'not-found' }
  }
  if (request.status !== 'pending') {
    await transaction.done
    return { status: 'not-pending' }
  }

  const bookings = await bookingStore.getAll()
  const startAt = `${request.checkIn}T14:00`
  const endAt = `${request.checkOut}T11:00`
  const conflicts = bookings.filter((booking) => {
    if (
      booking.houseId !== request.houseId ||
      booking.status === 'expired' ||
      booking.id === request.bookingId
    ) {
      return false
    }
    return new Date(startAt) < new Date(booking.endAt) &&
      new Date(endAt) > new Date(booking.startAt)
  })

  if (conflicts.length > 0) {
    await transaction.done
    return { status: 'conflict', conflicts }
  }

  const booking: Booking = {
    id: crypto.randomUUID(),
    guestRequestId: request.id,
    houseId: request.houseId,
    rentalType: 'overnight',
    status: 'confirmed',
    startAt,
    endAt,
    guestName: request.guestName,
    guestPhone: request.guestPhone,
    guestCount: request.guestCount,
    totalPrice: request.totalPrice,
    paidAmount: 0,
    comment: 'Создано из заявки гостя.',
    createdAt: updatedAt,
    updatedAt,
  }

  await bookingStore.add(booking)
  await requestStore.put({
    ...request,
    status: 'accepted',
    updatedAt,
    bookingId: booking.id,
  })
  await transaction.done
  return { status: 'accepted', booking }
}

export async function saveHouseProfile(
  profile: HouseProfile,
): Promise<void> {
  const db = await dbPromise
  await db.put(HOUSE_STORE, profile)
}

export async function replaceAllBookings(
  bookings: Booking[],
  receipts: Receipt[] = [],
  houseProfiles: HouseProfile[] = [],
  guestRequests: GuestBookingRequest[] = [],
  settings?: {
    houseCount: number
    houseNames: Record<number, string>
    language: AppLanguage
  },
  payments: BookingPayment[] = [],
  expenses: BusinessExpense[] = [],
): Promise<void> {
  const db = await dbPromise

  const transaction = db.transaction(
    [
      BOOKING_STORE,
      RECEIPT_STORE,
      HOUSE_STORE,
      GUEST_REQUEST_STORE,
      SETTINGS_STORE,
      PAYMENT_STORE,
      EXPENSE_STORE,
    ],
    'readwrite',
  )

  const bookingStore = transaction.objectStore(BOOKING_STORE)
  const receiptStore = transaction.objectStore(RECEIPT_STORE)
  const houseStore = transaction.objectStore(HOUSE_STORE)
  const guestRequestStore = transaction.objectStore(GUEST_REQUEST_STORE)
  const settingsStore = transaction.objectStore(SETTINGS_STORE)
  const paymentStore = transaction.objectStore(PAYMENT_STORE)
  const expenseStore = transaction.objectStore(EXPENSE_STORE)

  await bookingStore.clear()
  await receiptStore.clear()
  await houseStore.clear()
  await guestRequestStore.clear()
  await paymentStore.clear()
  await expenseStore.clear()

  for (const booking of bookings) {
    await bookingStore.put(booking)
  }
  for (const receipt of receipts) {
    await receiptStore.put(receipt)
  }
  for (const profile of houseProfiles) {
    await houseStore.put(profile)
  }
  for (const request of guestRequests) {
    await guestRequestStore.put(request)
  }
  for (const payment of payments) {
    await paymentStore.put(payment)
  }
  for (const expense of expenses) {
    await expenseStore.put(expense)
  }
  const paymentBookingIds = new Set(
    payments.map((payment) => payment.bookingId),
  )
  for (const booking of bookings) {
    if (booking.paidAmount > 0 && !paymentBookingIds.has(booking.id)) {
      await paymentStore.put({
        id: `legacy-${booking.id}`,
        bookingId: booking.id,
        amount: booking.paidAmount,
        paidAt: booking.updatedAt || booking.createdAt,
        legacy: true,
      } satisfies BookingPayment)
    }
  }
  if (settings) {
    await settingsStore.put({
      key: 'houseCount',
      value: settings.houseCount,
    })
    await settingsStore.put({
      key: 'houseNames',
      value: settings.houseNames,
    })
    await settingsStore.put({
      key: 'language',
      value: settings.language,
    })
  }

  await transaction.done
}