export interface HouseProfile {
  houseId: number
  city: string
  address: string
  description: string
  maxGuests: number
  pricePerNight: number | null
  amenities: string[]
  photoDataUrl: string | null
  isPublished: boolean
}
