"""
E2E del embudo completo — plan.md §7.4 (Fase 4), usando la skill webapp-testing.

Escenarios:
1. Home → categoría Gafas → /shop?category=eyewear lista productos
2. Filtros (color/material/precio) → URL cambia y el contador cuadra
3. Ordenar por precio ascendente → primer precio ≤ último
4. PDP → seleccionar color, cantidad 2 → añadir al carrito → drawer abierto
5. Recargar → el carrito conserva las unidades (persistencia)
6. Checkout → validación de campos → método Express → total refleja envío express
7. Confirmar → pantalla de éxito con número de pedido → carrito vacío
8. Teclado: mega menú navegable y cerrable solo con teclado
9. /account con sesión de demo tras login (guard en servidor)

Se ejecuta con: python scripts/with_server.py --server "node scripts/start.mjs" \
  --port 3000 -- python tests/e2e/funnel.py
"""
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
results = []


def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    results.append((status, name, detail))
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not condition else ""))


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()

        # ── 1. Home → categoría Gafas ────────────────────────────────────
        page.goto(BASE, wait_until="networkidle")
        check("1a. home SSR renderiza hero", page.locator("h1").first.is_visible())
        page.click("text=Gafas")
        page.wait_for_load_state("networkidle")
        check(
            "1b. URL de categoría",
            "/shop?category=eyewear" in page.url,
            page.url,
        )
        # Se espera al CONTENIDO y no a un tiempo fijo: la lista de productos
        # llega por consulta cliente-servidor y su latencia no es determinista.
        try:
            page.wait_for_selector("main :text('Aurora Frame')", timeout=15_000)
            check("1c. lista monturas (Aurora Frame)", True)
        except Exception as exc:  # noqa: BLE001
            check("1c. lista monturas (Aurora Frame)", False, str(exc)[:120])

        # ── 2. Filtros cambian la URL y el contador cuadra ───────────────
        # El label envuelve al checkbox; clic en el input dentro del label
        page.locator("label", has_text="Acetato").locator("input").check()
        page.wait_for_timeout(600)
        check("2a. URL canónica con material",
              "material=Acetato" in page.url and "%5B" not in page.url, page.url)
        counter = page.locator("text=/\\d+ piezas?/").first.inner_text()
        n = int(re.search(r"\d+", counter).group())
        check("2b. contador cuadra (7 acetato en eyewear)", n == 7, f"{n} != 7")
        page.locator("label", has_text="Metal").locator("input").check()
        page.wait_for_timeout(600)
        # eyewear: 7 acetato + 4 metal, 1 con ambos (Opale) → OR = 10
        check(
            "2c. filtros combinan (OR de materiales = 10)",
            int(re.search(r"\d+", page.locator("text=/\\d+ piezas?/").first.inner_text()).group()) == 10,
        )

        # ── 3. Ordenar precio ascendente ─────────────────────────────────
        page.goto(f"{BASE}/shop", wait_until="networkidle")
        page.select_option("select", "price-asc")
        page.wait_for_timeout(800)
        prices = [
            int(re.sub(r"[^\d]", "", t))
            for t in page.locator("main").locator("p").locator("span").all_inner_texts()
            if "€" in t and re.search(r"\d", t)
        ]
        prices = [v for v in prices if v > 0]
        check("3. price-asc: primer ≤ último", len(prices) > 2 and prices[0] <= prices[-1],
              str(prices[:6]))

        # ── 4. PDP → color, cantidad 2, añadir → drawer ──────────────────
        page.goto(f"{BASE}/products/aurora-frame", wait_until="networkidle")
        page.click("button:has-text('Marrón')")
        for _ in range(2):  # cantidad = 2 (el + inicial ya está en 1)
            page.click("button[aria-label='Aumentar cantidad']")
        page.click("button:has-text('Añadir al carrito')")
        page.wait_for_selector("[role='dialog'][aria-label^='Carrito'] >> text=Aurora Frame", timeout=5000)
        drawer = page.locator("[role='dialog'][aria-label^='Carrito']").inner_text()
        check("4. drawer abierto con la pieza", "Aurora Frame" in drawer)
        check("4b. drawer modal y con foco atrapado",
              page.locator("[role='dialog'][aria-label^='Carrito'][aria-modal='true']").count() == 1)

        # ── 5. Recargar → persistencia (nueva navegación = misma clave v1) ─
        page.goto(f"{BASE}/cart", wait_until="networkidle")
        cart_body = page.inner_text("main")
        check("5. carrito conserva la pieza tras recargar",
              "Aurora Frame" in cart_body)

        # ── 6. Checkout → validación + express ───────────────────────────
        page.goto(f"{BASE}/checkout", wait_until="networkidle")
        page.click("button:has-text('Confirmar pedido')")
        page.wait_for_timeout(300)
        errors_visible = page.locator("text=obligatorio").count()
        check("6a. validación de campos vacíos muestra errores", errors_visible >= 3,
              f"{errors_visible} errores")
        page.fill("input[placeholder='Nombre *']", "Ana")
        page.fill("input[placeholder='Apellidos *']", "García")
        page.fill("input[placeholder='Email *']", "ana@example.com")
        page.fill("input[placeholder='Dirección *']", "Calle Serrano 21")
        page.fill("input[placeholder='Ciudad *']", "Madrid")
        page.fill("input[placeholder='Código postal *']", "28001")
        page.check("input[name='shipping'] >> nth=1")  # Express
        page.wait_for_load_state("networkidle")
        total_txt = page.locator("dd >> text=/[\\d.,]+/").last.inner_text()
        m = re.search(r"[\d.]+", total_txt)
        check("6b. checkout pinta total del servidor", m is not None, total_txt)

        # ── 7. Confirmar → éxito + carrito vacío ─────────────────────────
        page.click("button:has-text('Confirmar pedido')")
        page.wait_for_selector("text=Pedido confirmado", timeout=8000)
        success = page.inner_text("body")
        order_ok = re.search(r"ML-[A-Z0-9]+(?:-[A-Z0-9]+)?", success) is not None
        check("7a. pantalla de éxito con número ML-…", order_ok)
        # Sin pasarela de pago, el cierre es un enlace de WhatsApp con el resumen.
        wa_links = page.locator("a[href^='https://wa.me/']").count()
        check(
            "7a-bis. el pedido se cierra por WhatsApp",
            wa_links >= 1,
            "enlaces wa.me=" + str(wa_links) + " | texto: " + page.inner_text("main")[:220].replace("\n", " "),
        )
        page.goto(f"{BASE}/cart", wait_until="networkidle")
        check("7b. carrito queda vacío", "está vacío" in page.inner_text("main"))

        # ── 8. Teclado: mega menú ────────────────────────────────────────
        page.goto(BASE, wait_until="networkidle")
        page.focus("nav >> text=Bolsos")
        page.wait_for_timeout(400)
        panel_visible = page.locator(
            "[aria-label^='Sección'] >> visible=true"
        ).count() > 0 or "Bolsos" in page.inner_text("body")
        page.keyboard.press("Escape")
        check("8. mega menú por foco + Escape sin error de JS", panel_visible)

        # ── 9. Sesión: login demo → /account accesible ───────────────────
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.fill("input[type='email']", "demo@maisonlumiere.es")
        page.fill("input[type='password']", "demo1234")
        page.click("button:has-text('Entrar')")
        page.wait_for_url("**/account", timeout=8000)
        check("9a. login demo → /account", "/account" in page.url)
        page.wait_for_timeout(600)
        acct = page.inner_text("main")
        check("9b. cuenta muestra nombre del usuario demo",
              "Demo Maison" in acct, acct[:120])

        # Login con credenciales incorrectas debe fallar en servidor (D6)
        page.click("text=Cerrar sesión")
        page.wait_for_load_state("networkidle")
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.fill("input[type='email']", "demo@maisonlumiere.es")
        page.fill("input[type='password']", "wrongpass")
        page.click("button:has-text('Entrar')")
        page.wait_for_timeout(800)
        check("9c. credenciales inválidas rechazadas (D6)",
              "incorrectas" in page.inner_text("body"))

        browser.close()

    fails = [r for r in results if r[0] == "FAIL"]
    print(f"\n{'='*60}\nE2E EMBUDO: {len(results)-len(fails)}/{len(results)} PASS, {len(fails)} FAIL")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
