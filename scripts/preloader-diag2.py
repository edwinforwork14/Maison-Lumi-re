"""Verifica colores de screenshots y la animación real de la barra."""
from playwright.sync_api import sync_playwright
from PIL import Image

for name in ['preloader-1-hold', 'preloader-3-exiting']:
    try:
        img = Image.open(f'/tmp/{name}.png').convert('RGB')
        w, h = img.size
        center = img.getpixel((w // 2, h // 2))
        corner = img.getpixel((10, 10))
        print(f'{name}: center={center} corner={corner} size={img.size}')
    except Exception as e:
        print(f'{name}: {e}')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:3000', wait_until='commit')
    page.wait_for_timeout(400)
    state = page.evaluate("""() => {
        const pre = document.getElementById('preloader')
        if (!pre) return { exists: false }
        const bar = pre.querySelector('.preloader-progress')
        const before = bar ? getComputedStyle(bar, '::before') : null
        const logoImg = pre.querySelector('.preloader-logo img')
        const logoRect = logoImg ? logoImg.getBoundingClientRect() : null
        return {
            exists: true,
            barAnim: before ? before.animationName : 'N/A',
            barDuration: before ? before.animationDuration : 'N/A',
            barPlayState: before ? before.animationPlayState : 'N/A',
            barWidth: bar ? bar.getBoundingClientRect().width : 0,
            logoVisible: logoRect ? { w: logoRect.width, h: logoRect.height, top: logoRect.top } : null,
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        }
    }""")
    print('STATE:', state)
    browser.close()
