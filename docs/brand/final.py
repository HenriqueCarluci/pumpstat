src = open('gen3.py').read().split("N = svg(")[0]
exec(src)
TXT = ('<g transform="translate(270 300)">'
  '<text x="0" y="-6" text-anchor="middle" font-family="Montserrat" font-weight="800" font-style="italic" font-size="124" letter-spacing="-4" fill="#ffffff" stroke="#05070d" stroke-width="18" paint-order="stroke" stroke-linejoin="round">PIU</text>'
  '<text x="0" y="86" text-anchor="middle" font-family="Montserrat" font-weight="800" font-style="italic" font-size="92" letter-spacing="-2" fill="#c8ff8a" stroke="#05070d" stroke-width="15" paint-order="stroke" stroke-linejoin="round">STATS</text></g>')
def bg(rx):
    return (f'<rect width="512" height="512" rx="{rx}" fill="#0e0f12"/>'
            f'<g>{halftone(512, 512, step=15, cx=180, cy=-140, maxr=5.6, fade=560, color="#3f9a3a", op=.5)}</g>')
art = arrow() + TXT
W = lambda body: f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>{DEFS}</defs>{body}</svg>'
open('icon-rounded.svg','w').write(W(panel() + art))          # PWA/Play/site
open('icon-full.svg','w').write(W(bg(0) + art))               # quadrado cheio (iOS, maskable base)
open('icon-bg.svg','w').write(W(bg(0)))                       # fundo do ícone adaptativo
open('icon-fg.svg','w').write(W(f'<g transform="translate(256 256) scale(.86) translate(-256 -256)">{art}</g>'))  # frente, com folga
# maskable: arte a 78% sobre fundo cheio (zona segura = círculo de 80%)
open('icon-maskable.svg','w').write(W(bg(0) + f'<g transform="translate(256 256) scale(.74) translate(-256 -256)">{art}</g>'))
# marca pequena para a barra do app: só a seta, sem fundo
open('mark.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 40 432 432"><defs>{DEFS}</defs>{arrow()}</svg>')
