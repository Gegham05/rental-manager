import type { Booking } from '../models/Booking'
import { getAllBookings } from '../storage/bookingRepository'

export async function hasBookingConflict(
  houseId: number,
  startAt: string,
  endAt: string,
  status: 'confirmed' | 'pending',
  excludeBookingId?: string,
): Promise<boolean> {
  if (status === 'pending') {
    return false
  }

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

    // Старые брони без status считаем confirmed
    const existingStatus = booking.status ?? 'confirmed'

    // Pending и expired НИКОГДА не блокируют бронь
    if (existingStatus === 'pending') {
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