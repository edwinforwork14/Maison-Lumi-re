// Tipos del dominio del e-commerce.
// Cuando se conecte una API real, estas interfaces siguen siendo el contrato.

export interface Product {
  id: string
  name: string
  slug: string
  description: string
  price: number
  compareAtPrice?: number
  category: CategoryId
  collection: CollectionId
  colors: string[]
  materials: string[]
  images: string[]
  stock: number
  featured: boolean
  bestseller: boolean
  isNew: boolean
}

export type CategoryId = 'eyewear' | 'bags' | 'shoes' | 'accessories'

export type CollectionId = 'atelier' | 'lumiere' | 'nocturne'

export interface Category {
  id: CategoryId
  name: string
  slug: string
  description: string
  editorial: string
}

export interface Collection {
  id: CollectionId
  name: string
  slug: string
  description: string
}

export interface CartItem {
  productId: string
  color: string
  quantity: number
}

export interface CartLine {
  product: Product
  color: string
  quantity: number
  lineTotal: number
}

export interface CartTotals {
  lines: CartLine[]
  subtotal: number
  shipping: number
  total: number
}

export interface Order {
  number: string
  createdAt: string
  items: CartLine[]
  totals: Pick<CartTotals, 'subtotal' | 'shipping' | 'total'>
  customer: OrderCustomer
  shippingMethod: ShippingMethodId
}

export interface OrderCustomer {
  firstName: string
  lastName: string
  email: string
  address: string
  city: string
  postalCode: string
  country: string
}

export type ShippingMethodId = 'standard' | 'express'

export interface ShippingMethod {
  id: ShippingMethodId
  name: string
  description: string
  price: number
}

export interface UserAccount {
  firstName: string
  lastName: string
  email: string
}
