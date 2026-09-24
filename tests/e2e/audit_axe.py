"""
Auditoría axe — plan.md Fase 4 (§12.2.10): las 9 rutas sin incidencias
críticas/serias, matriz de viewports 1440/1280/1024/768/390.

Se ejecuta con el servidor en marcha:
  node scripts/start.mjs &
  PYTHONIOENCODING=utf-8 python tests/e2e/audit_axe.py
"""
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from axe_playwright_python.sync_playwright import Axe
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
ROUTES = [
    "/",
    "/shop",
    "/shop?category=eyewear",
    "/products/aurora-frame",
    "/cart",
    "/checkout",
    "/login",
    "/register",
    "/wishlist",
    # Pantalla pública del panel: la auditoría cubre también la capa nueva.
    "/admin/login",
]
VIEWPORTS = [(1440, 900), (1280, 800), (1024, 768), (768, 1024), (390, 844)]
BLOCKING_IMPACTS = {"critical", "serious"}


def main():
    axe = Axe()
    total_critical = 0
    total_serious = 0
    rows = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width, height in VIEWPORTS:
            ctx = browser.new_context(viewport={"width": width, "height": height})
            page = ctx.new_page()
            for route in ROUTES:
                page.goto(BASE + route, wait_until="networkidle")
                page.wait_for_timeout(400)
                results = axe.run(page)
                by_impact = {}
                for v in results.response["violations"]:
                    impact = v.get("impact") or "minor"
                    by_impact.setdefault(impact, []).append(
                        f"{v['id']}({len(v['nodes'])})"
                    )
                critical = len(by_impact.get("critical", []))
                serious = len(by_impact.get("serious", []))
                total_critical += critical
                total_serious += serious
                blocking = by_impact.get("critical", []) + by_impact.get("serious", [])
                rows.append((f"{width}x{height}", route, critical, serious, blocking))
            ctx.close()
        browser.close()

    print(f"{'Viewport':<12} {'Ruta':<30} {'Crit':<5} {'Serio':<5} Bloqueantes")
    print("-" * 80)
    for vp, route, c, s, blocking in rows:
        flag = f"{' '.join(blocking) if blocking else ''}"
        mark = " ⚠" if (c or s) else ""
        print(f"{vp:<12} {route:<30} {c:<5} {s:<5} {flag}{mark}")

    print(
        f"\nAXE: críticos={total_critical}, serios={total_serious} "
        f"en {len(ROUTES) * len(VIEWPORTS)} combinaciones ruta×viewport"
    )
    sys.exit(1 if (total_critical or total_serious) else 0)


if __name__ == "__main__":
    main()
