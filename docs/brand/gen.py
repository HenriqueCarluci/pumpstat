import math
def halftone(w, h, step=16, cx=0, cy=0, maxr=7.2, fade=640, color='#1f6bff', op=1):
    out = []
    for j in range(0, h + step, step):
        for i in range(0, w + step, step):
            x = i + (step / 2 if (j // step) % 2 else 0)
            d = math.hypot(x - cx, j - cy)
            r = maxr * max(0, 1 - d / fade)
            if r > .6:
                out.append(f'<circle cx="{x:.0f}" cy="{j}" r="{r:.1f}"/>')
    return f'<g fill="{color}" opacity="{op}">' + ''.join(out) + '</g>'

def layered(d, t, grad='url(#ab)'):
    # contorno azul claro, contorno preto, preenchimento azul (como as setas do pad)
    return (f'<path d="{d}" fill="none" stroke="#9ad6ff" stroke-width="{t+22}" stroke-linejoin="miter" stroke-miterlimit="10"/>'
            f'<path d="{d}" fill="none" stroke="#05070d" stroke-width="{t+10}" stroke-linejoin="miter" stroke-miterlimit="10"/>'
            f'<path d="{d}" fill="none" stroke="{grad}" stroke-width="{t}" stroke-linejoin="miter" stroke-miterlimit="10"/>')

def chev(cx, cy, L):  # divisa apontando para baixo-esquerda, quina em (cx, cy)
    return f'M{cx},{cy-L} L{cx},{cy} L{cx+L},{cy}'

DEFS = ('<linearGradient id="ab" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0b3fd6"/><stop offset=".6" stop-color="#1f7bff"/><stop offset="1" stop-color="#46a6ff"/></linearGradient>'
        '<linearGradient id="pill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9ecff"/></linearGradient>'
        '<clipPath id="clip"><rect width="512" height="512" rx="112"/></clipPath>'
        '<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#2f8bff" flood-opacity=".6"/></filter>')

def panel():
    return ('<rect width="512" height="512" rx="112" fill="#05070d"/>'
            f'<g clip-path="url(#clip)">{halftone(512, 512, cx=0, cy=0)}{halftone(512, 512, cx=512, cy=512, maxr=4, fade=380, op=.55)}</g>'
            '<rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="#1b2a4a" stroke-width="4"/>')

def arrow():
    return ('<g filter="url(#glow)">' +
            layered('M236,276 L410,102', 58) +            # haste
            layered(chev(104, 408, 236), 50) +              # divisa de fora
            layered(chev(176, 336, 132), 40) +              # divisa de dentro
            '</g>')

def pill(text, fs, length, cx=262, cy=250, ang=-45):
    h = fs * 1.25
    return (f'<g transform="translate({cx} {cy}) rotate({ang})">'
            f'<rect x="{-length/2}" y="{-h/2}" width="{length}" height="{h}" rx="{h/2}" fill="url(#pill)" stroke="#05070d" stroke-width="8"/>'
            f'<rect x="{-length/2+7}" y="{-h/2+7}" width="{length-14}" height="{h-14}" rx="{h/2-7}" fill="none" stroke="#1f7bff" stroke-width="5"/>'
            f'<text x="0" y="{fs*.36}" text-anchor="middle" font-family="Montserrat" font-weight="800" font-style="italic" font-size="{fs}" letter-spacing="-1" fill="#0b2a7a">{text}</text>'
            '</g>')

def svg(body, w=512, h=512):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><defs>{DEFS}</defs>{body}</svg>'

# K — nome numa faixa atravessando a seta (como no painel do LX)
K = svg(panel() + arrow() + pill('PIU STATES', 50, 330))
# L — ícone sem texto (para tamanhos pequenos), mesma seta
Lx = svg(panel() + arrow())
# M — nome em duas linhas sobre a seta, na horizontal
M = svg(panel() + arrow() +
        '<g transform="translate(256 262)">'
        '<text x="0" y="-8" text-anchor="middle" font-family="Montserrat" font-weight="800" font-style="italic" font-size="118" letter-spacing="-4" fill="#ffffff" stroke="#05070d" stroke-width="16" paint-order="stroke" stroke-linejoin="round">PIU</text>'
        '<text x="0" y="78" text-anchor="middle" font-family="Montserrat" font-weight="800" font-style="italic" font-size="78" letter-spacing="-2" fill="#9ad6ff" stroke="#05070d" stroke-width="14" paint-order="stroke" stroke-linejoin="round">STATES</text></g>')
for k, v in {'K': K, 'L': Lx, 'M': M}.items():
    open(f'{k}.svg', 'w').write(v)
