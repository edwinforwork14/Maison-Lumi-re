"""Diagnóstico del preloader: captura la secuencia completa en screenshots."""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

    # Captura temprana: durante el hold (antes de que cargue todo)
    page.goto(BASE, wait_until='commit')
    page.wait_for_timeout(300)
    page.screenshot(path='/tmp/preloader-1-hold.png')

    # Estado del DOM en el hold
    hold_state = page.evaluate("""() => {
        const pre = document.getElementById('preloader')
        if (!pre) return { exists: false }
        const halves = pre.querySelectorAll('.preloader-half-left, .preloader-half-right')
        const logo = pre.querySelector('.preloader-logo')
        const progress = pre.querySelector('.preloader-progress')
        const anim = (el) => el ? getComputedStyle(el).animationName : 'N/A'
        return {
            exists: true,
            className: pre.className,
            halves: halves.length,
            logoAnim: anim(logo),
            halfAnim: anim(halves[0]),
            progressAnim: anim(progress),
            progressBarWidth: progress ? getComputedStyle(progress, '::before').width : 'N/A',
            bodyOverflow: document.body.style.overflow,
        }
    }""")
    print('HOLD:', hold_state)

    # Espera a que desaparezca
    page.wait_for_selector('#preloader', state='detached', timeout=10000)
    page.screenshot(path='/tmp/preloader-2-after.png')
    print('Preloader retirado OK')

    # Recarga dura para ver la salida
    page.reload(wait_until='commit')
    page.wait_for_timeout(250)
    early = page.evaluate("""() => {
        const pre = document.getElementById('preloader')
        if (!pre) return { exists: false }
        return { exists: true, className: pre.className }
    }""")
    print('EARLY RELOAD:', early)

    # Poll del className hasta que aparezca preloader-exiting
    exiting_seen = False
    for _ in range(40):
        cls = page.evaluate("() => document.getElementById('preloader')?.className || 'GONE'")
        if 'preloader-exiting' in cls:
            exiting_seen = True
            page.screenshot(path='/tmp/preloader-3-exiting.png')
            anims = page.evaluate("""() => {
                const halves = document.querySelectorAll('.preloader-half-left, .preloader-half-right')
                const a = halves[0] ? getComputedStyle(halves[0]) : null
                const logoHalf = document.querySelector('.preloader-logo-half-left')
                return {
                    halfAnim: a ? a.animationName : 'N/A',
                    halfTransform: a ? a.transform : 'N/A',
                    logoAnim: logoHalf ? getComputedStyle(logoHalf).animationName : 'N/A',
                }
            }""")
            print('EXITING ANIMS:', anims)
            break
        page.wait_for_timeout(50)
    if not exiting_seen:
        print('EXITING: nunca aparecio preloader-exiting')

    print('CONSOLE ERRORS:', errors[:5])
    browser.close()
