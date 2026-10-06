export type RentalType = 'overnight' | 'day'

export interface Booking {
  id: string

  houseId: 1 | 2 | 3
  rentalType: RentalType

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