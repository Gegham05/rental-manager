import type { Booking } from '../models/Booking'
import { getAllBookings } from '../storage/bookingRepository'

export async function getBookingConflicts(
  houseId: number,
  startAt: string,
  endAt: string,
  excludeBookingId?: string,
): Promise<Booking[]> {
  const bookings = await getAllBookings()

  const newStart = new Date(startAt)
  const newEnd = new Date(endAt)

  return bookings.filter((booking: Booking) => {
    if (booking.id === excludeBookingId) {
      return false
    }

    if (booking.houseId !== houseId) {
      return false
    }

    const existingStatus = booking.status ?? 'confirmed'
    if (existingStatus === 'expired') {
      return false
    }

    const existingStart = new Date(booking.startAt)
    const existingEnd = new Date(booking.endAt)

    return (
      newStart < existingEnd &&
      newEnd > existingStart
    )
  })
}