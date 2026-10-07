"""Emula prefers-reduced-motion: reduce para confirmar el comportamiento."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(reduced_motion='reduce', viewport={'width': 1280, 'height': 800})
    page = ctx.new_page()
    page.goto('http://localhost:3000', wait_until='commit')
    page.wait_for_timeout(400)
    state = page.evaluate("""() => {
        const pre = document.getElementById('preloader')
        const bar = pre?.querySelector('.preloader-progress')
        const before = bar ? getComputedStyle(bar, '::before') : null
        return {
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
            barAnimDuration: before ? before.animationDuration : 'N/A',
            preStyleAnimDur: pre ? getComputedStyle(pre).animationDuration : 'N/A',
        }
    }""")
    print('CON reduced-motion:', state)

    t0 = __import__('time').time()
    page.wait_for_selector('#preloader', state='detached', timeout=10000)
    print(f'Pantalla se retira en {__import__("time").time() - t0:.2f}s (sin animacion visible = "solo se quita y ya")')
    browser.close()
