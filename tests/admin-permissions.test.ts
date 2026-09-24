import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_MATRIX,
  ROLE_NAMES,
  roleGrants,
  type RoleKey,
} from '../src/server/services/admin/permissions.ts'

/**
 * Matriz de permisos del panel (Plan 02 §5). Es un test de contrato: si alguien
 * añade un permiso con una errata o concede de más a un rol, salta aquí y no en
 * producción.
 */

const ROLES = Object.keys(ROLE_MATRIX) as RoleKey[]

describe('permisos: nomenclatura', () => {
  it('todos los permisos usan `dominio:acción`', () => {
    for (const permission of ALL_PERMISSIONS) {
      assert.match(permission, /^[a-z]+:[a-z]+$/, `permiso mal formado: ${permission}`)
    }
  })

  it('no hay permisos duplicados', () => {
    assert.equal(new Set(ALL_PERMISSIONS).size, ALL_PERMISSIONS.length)
  })

  it('cada rol solo concede permisos declarados', () => {
    const declared = new Set<string>(ALL_PERMISSIONS)
    for (const role of ROLES) {
      for (const permission of ROLE_MATRIX[role]) {
        assert.ok(
          declared.has(permission),
          `el rol ${role} concede un permiso inexistente: ${permission}`,
        )
      }
      assert.equal(
        new Set(ROLE_MATRIX[role]).size,
        ROLE_MATRIX[role].length,
        `el rol ${role} repite permisos`,
      )
    }
  })

  it('los cinco roles del plan tienen nombre legible', () => {
    assert.deepEqual(ROLES.sort(), ['admin', 'editor', 'manager', 'super_admin', 'support'])
    for (const role of ROLES) assert.ok(ROLE_NAMES[role].length > 0)
  })
})

describe('permisos: la matriz dice lo que el plan dice', () => {
  it('super_admin lo puede todo', () => {
    for (const permission of ALL_PERMISSIONS) {
      assert.ok(roleGrants('super_admin', permission), `falta ${permission}`)
    }
  })

  it('admin no gestiona usuarios ni lee auditoría, pero sí el resto', () => {
    assert.equal(roleGrants('admin', PERMISSIONS.usersManage), false)
    assert.equal(roleGrants('admin', PERMISSIONS.auditRead), false)
    assert.equal(roleGrants('admin', PERMISSIONS.productsWrite), true)
    assert.equal(roleGrants('admin', PERMISSIONS.ordersRefund), true)
    // La diferencia con super_admin es exactamente esos dos permisos.
    const diff = ALL_PERMISSIONS.filter((permission) => !roleGrants('admin', permission))
    assert.deepEqual([...diff].sort(), [PERMISSIONS.auditRead, PERMISSIONS.usersManage].sort())
  })

  it('manager atiende la operación diaria pero no toca ajustes ni usuarios', () => {
    assert.equal(roleGrants('manager', PERMISSIONS.productsWrite), true)
    assert.equal(roleGrants('manager', PERMISSIONS.inventoryAdjust), true)
    assert.equal(roleGrants('manager', PERMISSIONS.ordersUpdate), true)
    assert.equal(roleGrants('manager', PERMISSIONS.reportsRead), true)
    assert.equal(roleGrants('manager', PERMISSIONS.settingsWrite), false)
    assert.equal(roleGrants('manager', PERMISSIONS.usersManage), false)
    assert.equal(roleGrants('manager', PERMISSIONS.customersPii), false)
  })

  it('editor publica catálogo y contenido, y nada más', () => {
    assert.equal(roleGrants('editor', PERMISSIONS.productsWrite), true)
    assert.equal(roleGrants('editor', PERMISSIONS.productsPublish), true)
    assert.equal(roleGrants('editor', PERMISSIONS.contentWrite), true)
    assert.equal(roleGrants('editor', PERMISSIONS.inventoryAdjust), false)
    assert.equal(roleGrants('editor', PERMISSIONS.ordersRead), false)
    assert.equal(roleGrants('editor', PERMISSIONS.reportsRead), false)
  })

  it('support solo lee pedidos y clientes, y modera reseñas', () => {
    assert.deepEqual([...ROLE_MATRIX.support].sort(), [
      PERMISSIONS.customersRead,
      PERMISSIONS.ordersRead,
      PERMISSIONS.reviewsModerate,
    ].sort())
    assert.equal(roleGrants('support', PERMISSIONS.customersPii), false)
    assert.equal(roleGrants('support', PERMISSIONS.ordersUpdate), false)
  })

  it('la PII es un permiso aparte: leer un cliente no es leer sus datos personales', () => {
    assert.equal(roleGrants('support', PERMISSIONS.customersRead), true)
    assert.equal(roleGrants('support', PERMISSIONS.customersPii), false)
    assert.notEqual(PERMISSIONS.customersRead, PERMISSIONS.customersPii)
  })
})
