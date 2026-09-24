"""
E2E del panel administrativo (Plan 02, G1).

Comprueba con un navegador real lo que los tests de servicio no pueden:
que el guard funcione de punta a punta, que la sesión de tienda NO abra el
panel, que el login emita sesión de administración y que el RBAC se aplique en
la interfaz (una página sin permiso muestra el estado de error, no la tabla).

Requiere el servidor en :3000 con DATA_SOURCE=postgres, DATABASE_URL y
SESSION_SECRET, y el admin sembrado (`npm run db:seed`):

    python tests/e2e/admin.py
"""

import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
ADMIN_EMAIL = "admin@maison-lumiere.test"
ADMIN_PASSWORD = "maison-dev-admin"
SHOP_DEMO = ("demo@maisonlumiere.es", "demo1234")

results = []


def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    results.append((status, name, detail))
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not condition else ""))


def login(page, email, password):
    page.goto(f"{BASE}/admin/login", wait_until="networkidle")
    page.fill("#admin-email", email)
    page.fill("#admin-password", password)
    page.click("button[type='submit']")
    page.wait_for_timeout(1_200)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()

        # ── 1. Sin sesión, el panel redirige al login ────────────────────────
        page.goto(f"{BASE}/admin", wait_until="networkidle")
        check("1a. /admin sin sesión redirige a /admin/login", "/admin/login" in page.url, page.url)
        check("1b. el formulario de acceso está visible", page.locator("#admin-email").is_visible())

        # ── 2. Credenciales incorrectas no abren el panel ────────────────────
        login(page, ADMIN_EMAIL, "contraseña-incorrecta")
        body = page.inner_text("body")
        check("2. credenciales inválidas rechazadas", "Credenciales incorrectas" in body)

        # ── 3. Login correcto → panel con KPIs reales ────────────────────────
        login(page, ADMIN_EMAIL, ADMIN_PASSWORD)
        check("3a. login de administración entra en el panel", page.url.rstrip("/").endswith("/admin"), page.url)
        # Se espera al CONTENIDO, no a un tiempo fijo: la consulta de KPIs es
        # cliente-servidor y su latencia no es determinista.
        try:
            page.wait_for_selector("main :text('Ventas')", timeout=15_000)
            page.wait_for_selector("main :text('Ticket medio')", timeout=15_000)
            check("3b. el panel pinta los KPIs", True)
        except Exception as exc:  # noqa: BLE001
            check("3b. el panel pinta los KPIs", False, str(exc)[:160])

        # ── 4. Catálogo: la tabla de productos carga ─────────────────────────
        page.goto(f"{BASE}/admin/products", wait_until="domcontentloaded")
        try:
            page.wait_for_selector("main :text('Estado')", timeout=15_000)
            page.wait_for_selector("main table", timeout=15_000)
            check("4a. el listado de productos carga", True)
        except Exception as exc:  # noqa: BLE001
            check("4a. el listado de productos carga", False, str(exc)[:160] + " | " + page.inner_text("main")[:120])
        check("4b. hay buscador y creación", page.locator("input[name='slug']").count() == 1)

        # ── 5. Inventario: el filtro y el ajuste están disponibles ───────────
        page.goto(f"{BASE}/admin/inventory", wait_until="domcontentloaded")
        try:
            page.wait_for_selector("main :text('uds.')", timeout=15_000)
            check("5a. el inventario lista variantes", True)
        except Exception as exc:  # noqa: BLE001
            check("5a. el inventario lista variantes", False, str(exc)[:160])
        first_adjust = page.locator("button:has-text('Ajustar')").first
        check("5b. ofrece el ajuste con motivo", first_adjust.count() == 1)

        # ── 4c. Ficha de producto con gestión de variantes ───────────────────
        try:
            page.goto(f"{BASE}/admin/products", wait_until="domcontentloaded")
            # Se espera a la TABLA: las etiquetas de filtro existen antes de que
            # llegue la consulta, así que esperar por ellas no basta.
            page.wait_for_selector("main table", timeout=15_000)
            page.wait_for_timeout(600)
            open_product = page.locator("a:has-text('Abrir')").first
            if open_product.count() > 0:
                href = open_product.get_attribute("href")
                page.goto(BASE + href, wait_until="domcontentloaded")
                page.wait_for_selector("main :text('Variantes')", timeout=15_000)
                detail_text = page.inner_text("main").upper()
                check(
                    "4c. la ficha de producto gestiona variantes",
                    "VARIANTES" in detail_text and "NUEVA VARIANTE" in detail_text,
                )
            else:
                check("4c. la ficha de producto gestiona variantes", False, "sin productos")
        except Exception as exc:  # noqa: BLE001
            check("4c. la ficha de producto gestiona variantes", False, str(exc)[:140])

        # ── 4d. Categorías: listado y alta ───────────────────────────────────
        try:
            page.goto(f"{BASE}/admin/categories", wait_until="domcontentloaded")
            page.wait_for_selector("main :text('Nueva categoría')", timeout=15_000)
            check("4d. la gestión de categorías está operativa", True)
        except Exception as exc:  # noqa: BLE001
            check("4d. la gestión de categorías está operativa", False, str(exc)[:140])
        # ── 5c/5d. Pedidos: listado y detalle con transiciones ───────────────
        page.goto(f"{BASE}/admin/orders", wait_until="domcontentloaded")
        try:
            page.wait_for_selector("main", timeout=15_000)
            page.wait_for_timeout(1_200)
            orders_text = page.inner_text("main")
            check(
                "5c. el listado de pedidos carga sin error",
                "No se pudieron cargar" not in orders_text
                and ("NÚMERO" in orders_text.upper() or "NO HAY PEDIDOS" in orders_text.upper()),
                orders_text[:120],
            )
            open_link = page.locator("a:has-text('Abrir')").first
            if open_link.count() > 0:
                href = open_link.get_attribute("href")
                page.goto(BASE + href, wait_until="domcontentloaded")
                page.wait_for_selector("main", timeout=15_000)
                page.wait_for_timeout(1_500)
                detail = page.inner_text("main")
                check(
                    "5d. el detalle muestra líneas, pagos, historial y reembolso",
                    all(w in detail.upper() for w in ["LÍNEAS", "PAGOS", "HISTORIAL", "REEMBOLSO"]),
                    detail[:220],
                )
            else:
                check("5d. el detalle muestra líneas, pagos, historial y reembolso", False, "sin pedidos")
        except Exception as exc:  # noqa: BLE001
            check("5c. el listado de pedidos carga sin error", False, str(exc)[:140])

        # ── 5e. Clientes: aviso explícito sobre la PII ───────────────────────
        page.goto(f"{BASE}/admin/customers", wait_until="domcontentloaded")
        try:
            page.wait_for_selector("main :text('customers:pii')", timeout=15_000)
            check("5e. clientes explica el régimen de PII aplicado", True)
        except Exception as exc:  # noqa: BLE001
            check("5e. clientes explica el régimen de PII aplicado", False, str(exc)[:140])
        # ── 5f/5g/5h. Ajustes, contenido y usuarios ──────────────────────────
        try:
            page.goto(f"{BASE}/admin/settings", wait_until="domcontentloaded")
            page.wait_for_selector("main :text('Ajustes')", timeout=15_000)
            page.wait_for_timeout(800)
            settings_text = page.inner_text("main").upper()
            check(
                "5f. los ajustes del sitio se listan",
                "AJUSTES" in settings_text and ("CLAVE" in settings_text or "NO HAY AJUSTES" in settings_text),
                settings_text[:120],
            )
        except Exception as exc:  # noqa: BLE001
            check("5f. los ajustes del sitio se listan", False, str(exc)[:140])

        try:
            page.goto(f"{BASE}/admin/content", wait_until="domcontentloaded")
            page.wait_for_selector("main :text('Nuevo contenido')", timeout=15_000)
            check("5g. la gestión de contenido está operativa", True)
        except Exception as exc:  # noqa: BLE001
            check("5g. la gestión de contenido está operativa", False, str(exc)[:140])

        try:
            page.goto(f"{BASE}/admin/users", wait_until="domcontentloaded")
            page.wait_for_selector("main", timeout=15_000)
            page.wait_for_timeout(1_200)
            users_text = page.inner_text("main")
            # El rol `admin` NO tiene users:manage: la pantalla debe negarse.
            check(
                "5h. usuarios exige users:manage (el rol admin no lo tiene)",
                "users:manage" in users_text or "No se pudieron cargar" in users_text,
                users_text[:120],
            )
        except Exception as exc:  # noqa: BLE001
            check("5h. usuarios exige users:manage (el rol admin no lo tiene)", False, str(exc)[:140])
        # ── 6. RBAC en la interfaz: `admin` no lee auditoría ─────────────────
        page.goto(f"{BASE}/admin/audit", wait_until="networkidle")
        audit = page.inner_text("main")
        check(
            "6. el rol `admin` no puede leer auditoría (FORBIDDEN en UI)",
            "audit:read" in audit or "permiso" in audit.lower(),
            audit[:120],
        )

        # ── 7. La sesión de tienda no abre el panel ──────────────────────────
        ctx2 = browser.new_context(viewport={"width": 1280, "height": 900})
        page2 = ctx2.new_page()
        page2.goto(f"{BASE}/login", wait_until="networkidle")
        page2.fill("input[type='email']", SHOP_DEMO[0])
        page2.fill("input[type='password']", SHOP_DEMO[1])
        page2.click("button:has-text('Entrar')")
        page2.wait_for_url("**/account", timeout=8_000)
        page2.goto(f"{BASE}/admin", wait_until="networkidle")
        check(
            "7. una sesión de cliente no entra al panel",
            "/admin/login" in page2.url,
            page2.url,
        )
        ctx2.close()

        # ── 8. Salir revoca la sesión del panel ──────────────────────────────
        page.click("button:has-text('Salir')")
        page.wait_for_timeout(1_000)
        page.goto(f"{BASE}/admin", wait_until="networkidle")
        check("8. tras salir, el panel vuelve a pedir acceso", "/admin/login" in page.url, page.url)

        browser.close()

    fails = [r for r in results if r[0] == "FAIL"]
    print(f"\n{'=' * 60}\nE2E PANEL: {len(results) - len(fails)}/{len(results)} PASS, {len(fails)} FAIL")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
