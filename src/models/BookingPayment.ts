export interface BookingPayment {
  id: string
  bookingId: string
  amount: number
  paidAt: string
  legacy?: boolean
}
