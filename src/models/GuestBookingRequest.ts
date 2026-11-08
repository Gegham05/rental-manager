export type GuestBookingRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'cancellation_requested'
  | 'cancellation_rejected'

export interface GuestBookingRequest {
  id: string
  source: 'local'
  houseId: number
  propertyName: string
  city: string
  checkIn: string
  checkOut: string
  guestName: string
  guestPhone: string
  guestCount: number
  totalPrice: number
  status: GuestBookingRequestStatus
  createdAt: string
  updatedAt: string
  bookingId?: string
}
