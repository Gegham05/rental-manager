import { openDB } from 'idb'
import type { Booking } from '../models/Booking'

const DB_NAME = 'rental-manager'
const DB_VERSION = 1
const BOOKING_STORE = 'bookings'

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(BOOKING_STORE)) {
      db.createObjectStore(BOOKING_STORE, {
        keyPath: 'id',
      })
    }
  },
})

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