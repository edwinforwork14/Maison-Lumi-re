import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
EMAIL = "admin@maison-lumiere.test"
PASSWORD = "maison-dev-admin"

suffix = str(int(time.time()))
NAME = f"Verificacion {suffix}"
SLUG = f"verificacion-{suffix}"

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # Login
    page.goto(f"{BASE}/admin/login")
    page.wait_for_load_state("networkidle")
    page.fill("#admin-email", EMAIL)
    page.fill("#admin-password", PASSWORD)
    page.click("button[type=submit]")
    page.wait_for_url("**/admin", timeout=15000)

    # Products page
    page.goto(f"{BASE}/admin/products")
    page.wait_for_load_state("networkidle")
    page.wait_for_selector("text=Nuevo producto", timeout=15000)

    form = page.locator("form").filter(has_text="Crear producto")
    if form.count() == 0:
        print("FAIL: no aparece el formulario de alta (¿sin categorías?)")
        sys.exit(1)

    form.locator("input[name=name]").fill(NAME)
    page.wait_for_timeout(150)
    filled_slug = form.locator("input[name=slug]").input_value()
    filled_sku = form.locator("input[name=sku]").input_value()
    print(f"slug sugerido: {filled_slug}")
    print(f"sku sugerido: {filled_sku}")

    form.locator("input[name=price]").fill("49.90")
    form.locator("input[name=stock]").fill("5")
    form.locator("input[name=color]").fill("Marfil")
    form.locator("input[name=size]").fill("M")
    form.locator("input[name=publish]").check()

    form.locator("button[type=submit]").click()
    page.wait_for_url("**/admin/products/**", timeout=15000)
    page.wait_for_load_state("networkidle")
    detail = page.content()
    print("URL destino:", page.url)
    assert NAME in detail, "el nombre no aparece en la ficha"
    print("OK: navega a la ficha del producto y muestra el nombre")

    # Storefront
    page.goto(f"{BASE}/shop")
    page.wait_for_load_state("networkidle")
    shop = page.content()
    if NAME in shop:
        print("OK: el producto publicado aparece en /shop")
    else:
        print("WARN: el producto no aparece en /shop (posible caché/draft categoría)")

    print("console errors:", errors[:5])
    browser.close()
    print("SLUG=" + filled_slug)
