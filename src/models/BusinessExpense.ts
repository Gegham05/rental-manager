export type BusinessExpenseCategory =
  | 'utilities'
  | 'cleaning'
  | 'repairs'
  | 'supplies'
  | 'other'

export interface BusinessExpense {
  id: string
  amount: number
  category: BusinessExpenseCategory
  date: string
  note: string
  createdAt: string
}
