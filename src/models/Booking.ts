export type RentalType = 'overnight' | 'day'

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'expired'

export interface Booking {
  id: string

  houseId: 1 | 2 | 3
  rentalType: RentalType
  status: BookingStatus

  startAt: string
  endAt: string

  guestName: string
  guestPhone: string
  guestCount: number

  totalPrice: number
  paidAmount: number

  comment: string

  createdAt: string
  updatedAt: string

}