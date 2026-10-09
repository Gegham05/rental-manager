import { openDB } from 'idb'
import type { Booking } from '../models/Booking'

const DB_NAME = 'rental-manager'
const DB_VERSION = 2
const BOOKING_STORE = 'bookings'
const SETTINGS_STORE = 'settings'

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
    [BOOKING_STORE, SETTINGS_STORE],
    'readwrite',
  )
  const bookingStore = transaction.objectStore(BOOKING_STORE)
  let cursor = await bookingStore.openCursor()

  while (cursor) {
    if (cursor.value.houseId === houseId) {
      await cursor.delete()
    } else if (cursor.value.houseId > houseId) {
      await cursor.update({
        ...cursor.value,
        houseId: cursor.value.houseId - 1,
      })
    }
    cursor = await cursor.continue()
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
  await db.add(BOOKING_STORE, booking)
}

export async function getAllBookings(): Promise<Booking[]> {
  const db = await dbPromise
  return db.getAll(BOOKING_STORE)
}

export async function getBooking(id: string): Promise<Booking | undefined> {
  const db = await dbPromise
  return db.get(BOOKING_STORE, id)
}

export async function updateBooking(booking: Booking): Promise<void> {
  const db = await dbPromise
  await db.put(BOOKING_STORE, booking)
}

export async function deleteBooking(id: string): Promise<void> {
  const db = await dbPromise
  await db.delete(BOOKING_STORE, id)
}

export async function replaceAllBookings(
  bookings: Booking[],
): Promise<void> {
  const db = await dbPromise

  const transaction = db.transaction(
    BOOKING_STORE,
    'readwrite',
  )

  const store = transaction.objectStore(BOOKING_STORE)

  await store.clear()

  for (const booking of bookings) {
    await store.put(booking)
  }

  await transaction.done
}