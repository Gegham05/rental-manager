import type { Booking } from '../models/Booking'
import { getAllBookings } from '../storage/bookingRepository'

export async function hasBookingConflict(
  houseId: number,
  startAt: string,
  endAt: string,
  excludeBookingId?: string,
): Promise<boolean> {
  const bookings = await getAllBookings()

  const newStart = new Date(startAt)
  const newEnd = new Date(endAt)

  return bookings.some((booking: Booking) => {
    if (booking.id === excludeBookingId) {
      return false
    }

    if (booking.houseId !== houseId) {
      return false
    }

    const existingStart = new Date(booking.startAt)
    const existingEnd = new Date(booking.endAt)

    return newStart < existingEnd && newEnd > existingStart
  })
}