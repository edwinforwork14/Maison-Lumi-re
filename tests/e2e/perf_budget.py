"""
Presupuestos de rendimiento — plan.md §7.6 (Fase 4).

Mide el peso comprimido (gzip) de los chunks JS solicitados por cada ruta
crítica contra el presupuesto de 180 kB gzip para el catálogo.
"""
import gzip
import re
import sys
import urllib.request

BASE = "http://localhost:3000"
BUDGET_CATALOG_GZIP = 180 * 1024  # 180 kB gzip (plan §7.6)

ROUTES = ["/", "/shop", "/products/aurora-frame"]


def route_scripts(html: str):
    return re.findall(r'<script[^>]+src="([^"]+\.js)"', html)


def main():
    fails = 0
    print(f"{'Ruta':<26} {'JS total':<12} {'JS gzip':<12} {'Presupuesto':<12}")
    print("-" * 62)

    for route in ROUTES:
        html = urllib.request.urlopen(BASE + route).read().decode()
        total = 0
        gz = 0
        seen = set()
        for src in route_scripts(html):
            url = src if src.startswith("http") else BASE + src
            if url in seen:
                continue
            seen.add(url)
            try:
                raw = urllib.request.urlopen(url).read()
            except Exception:
                continue
            total += len(raw)
            gz += len(gzip.compress(raw))
        budget_ok = gz <= BUDGET_CATALOG_GZIP
        if not budget_ok:
            fails += 1
        print(f"{route:<26} {total//1024:>4} kB{'':<5} {gz//1024:>4} kB{'':<5} "
              f"{'OK' if budget_ok else 'EXCEDIDO'} (180 kB)")

    print(f"\nPRESUPUESTOS: {'OK' if fails == 0 else f'{fails} rutas excedidas'}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
