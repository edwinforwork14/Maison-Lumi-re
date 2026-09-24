/**
 * Catálogo de permisos y roles (Plan 02 §5). Es la **fuente única** de la
 * nomenclatura `dominio:acción`: los nombres están congelados en el plan y no
 * se escriben a mano en cada server function, sino que se importan de aquí.
 *
 * Regla dura: un permiso que no esté en esta lista no existe, y ningún rol
 * concede permisos por accidente. La matriz es explícita y legible a propósito.
 */

export const PERMISSIONS = {
  reportsRead: 'reports:read',

  productsRead: 'products:read',
  productsWrite: 'products:write',
  productsPublish: 'products:publish',

  inventoryRead: 'inventory:read',
  inventoryAdjust: 'inventory:adjust',

  ordersRead: 'orders:read',
  ordersUpdate: 'orders:update',
  ordersRefund: 'orders:refund',

  customersRead: 'customers:read',
  customersPii: 'customers:pii',

  couponsRead: 'coupons:read',
  couponsWrite: 'coupons:write',

  reviewsModerate: 'reviews:moderate',

  contentRead: 'content:read',
  contentWrite: 'content:write',

  settingsRead: 'settings:read',
  settingsWrite: 'settings:write',

  usersManage: 'users:manage',
  auditRead: 'audit:read',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** Todos los permisos, en orden estable (para sembrar y para super_admin). */
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS)

export type RoleKey = 'super_admin' | 'admin' | 'manager' | 'editor' | 'support'

const withoutForbidden = ALL_PERMISSIONS.filter(
  (permission) =>
    permission !== PERMISSIONS.usersManage && permission !== PERMISSIONS.auditRead,
)

/**
 * Matriz rol × permiso del Plan 02 §5. `admin` es `super_admin` sin gestión de
 * usuarios ni lectura de auditoría: separar esas dos capacidades es lo que
 * evita que quien administra la tienda pueda también borrar sus propias huellas.
 */
export const ROLE_MATRIX: Readonly<Record<RoleKey, readonly Permission[]>> = {
  super_admin: ALL_PERMISSIONS,
  admin: withoutForbidden,
  manager: [
    PERMISSIONS.productsRead,
    PERMISSIONS.productsWrite,
    PERMISSIONS.productsPublish,
    PERMISSIONS.inventoryRead,
    PERMISSIONS.inventoryAdjust,
    PERMISSIONS.ordersRead,
    PERMISSIONS.ordersUpdate,
    PERMISSIONS.couponsRead,
    PERMISSIONS.couponsWrite,
    PERMISSIONS.reportsRead,
    PERMISSIONS.reviewsModerate,
  ],
  editor: [
    PERMISSIONS.productsRead,
    PERMISSIONS.productsWrite,
    PERMISSIONS.productsPublish,
    PERMISSIONS.contentRead,
    PERMISSIONS.contentWrite,
  ],
  support: [
    PERMISSIONS.ordersRead,
    PERMISSIONS.customersRead,
    PERMISSIONS.reviewsModerate,
  ],
}

export const ROLE_NAMES: Readonly<Record<RoleKey, string>> = {
  super_admin: 'Super administrador',
  admin: 'Administrador',
  manager: 'Responsable de tienda',
  editor: 'Editor de catálogo',
  support: 'Atención al cliente',
}

/** ¿El rol concede este permiso? Útil para tests y para la UI de roles. */
export function roleGrants(role: RoleKey, permission: Permission): boolean {
  return ROLE_MATRIX[role].includes(permission)
}
