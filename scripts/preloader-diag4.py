"""Verifica la nueva salida escalonada del preloader: fondo -> imagen -> letras."""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})

    # Carga limpia y captura durante el hold: imagen ARRIBA, letras DEBAJO.
    page.goto(BASE, wait_until='commit')
    page.wait_for_timeout(350)
    page.screenshot(path='/tmp/pre4-1-hold.png')
    layout = page.evaluate("""() => {
        const img = document.querySelector('.preloader-image-half-left img')
        const logo = document.querySelector('.preloader-logo-half-left img')
        const r = (el) => el ? el.getBoundingClientRect() : null
        const ir = r(img), lr = r(logo)
        return {
            imageExists: !!img,
            imageCy: ir ? ir.top + ir.height / 2 : null,
            logoCy: lr ? lr.top + lr.height / 2 : null,
            imageAboveLogo: ir && lr ? (ir.top + ir.height / 2) < (lr.top + lr.height / 2) : null,
            imageVisible: getComputedStyle(document.querySelector('.preloader-image')).opacity,
        }
    }""")
    print('HOLD layout:', layout)

    # Espera a que arranque la salida y muestrea el orden de las capas.
    page.wait_for_function("() => document.getElementById('preloader')?.classList.contains('preloader-exiting')", timeout=10000)
    print('exit detectado')

    def sample(label):
        return page.evaluate("""() => {
            const pick = (sel) => {
                const el = document.querySelector(sel)
                if (!el) return null
                const s = getComputedStyle(el)
                return { anim: s.animationName, delay: s.animationDelay, dur: s.animationDuration, tx: s.transform }
            }
            return {
                bg: pick('.preloader-half-left'),
                image: pick('.preloader-image-half-left'),
                letters: pick('.preloader-logo-half-left'),
            }
        }""")

    # t=0.3s: fondo moviéndose, imagen y letras aún enteras.
    page.wait_for_timeout(300)
    page.screenshot(path='/tmp/pre4-2-bg.png')
    print('t=0.3s', sample('bg'))
    # t≈1.2s: imagen moviéndose, letras aún enteras.
    page.wait_for_timeout(900)
    page.screenshot(path='/tmp/pre4-3-image.png')
    print('t~1.2s', sample('image'))
    # t≈2.2s: letras moviéndose.
    page.wait_for_timeout(1000)
    page.screenshot(path='/tmp/pre4-4-letters.png')
    print('t~2.2s', sample('letters'))

    page.wait_for_selector('#preloader', state='detached', timeout=10000)
    print('preloader retirado OK')
    browser.close()
