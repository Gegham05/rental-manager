export interface Receipt {
  id: string
  bookingId: string
  fileName: string
  pdf: Blob
  createdAt: string
}
