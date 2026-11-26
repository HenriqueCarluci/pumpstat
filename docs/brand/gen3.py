import math
exec(open('gen.py').read().split('def layered')[0])  # halftone
DEFS = ('<linearGradient id="ab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d2ff7a"/><stop offset=".5" stop-color="#8cff3a"/><stop offset="1" stop-color="#2fb866"/></linearGradient>'
        '<linearGradient id="pill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d6eaff"/></linearGradient>'
        '<clipPath id="clip"><rect width="512" height="512" rx="112"/></clipPath>'
        '<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="9" flood-color="#8cff3a" flood-opacity=".45"/></filter>')

def pts(p): return ' '.join(f'{x:.1f},{y:.1f}' for x, y in p)
def chevron(c, L, t):  # aponta para cima-esquerda, quina em (c,c), pontas cortadas a 45°
    return [(c, c), (c+L, c), (c+L-t, c+t), (c+t, c+t), (c+t, c+L-t), (c, c+L)]
def shaft(a, b, hw):
    n = (hw/math.sqrt(2), -hw/math.sqrt(2))
    return [(a+n[0], a+n[1]), (b+n[0], b+n[1]), (b-n[0], b-n[1]), (a-n[0], a-n[1])]

def arrow(scale=1.0):
    shapes = [chevron(92, 262, 60), chevron(184, 160, 48), shaft(250, 404, 38)]
    poly = lambda attrs: ''.join(f'<polygon points="{pts(s)}" {attrs}/>' for s in shapes)
    return ('<g filter="url(#glow)" transform="rotate(270 256 256)">' +
            poly('fill="#e2ffc0" stroke="#e2ffc0" stroke-width="30" stroke-linejoin="miter"') +
            poly('fill="#05070d" stroke="#05070d" stroke-width="15" stroke-linejoin="miter"') +
            f'<polygon points="{pts(shapes[2])}" fill="url(#ab)"/>' +
            ''.join(f'<polygon points="{pts(s)}" fill="url(#ab)" stroke="#05070d" stroke-width="10" stroke-linejoin="miter" paint-order="stroke"/>' for s in shapes[:2]) +
            # filete claro interno (bisel) nas divisas; a haste vem por cima
            ''.join(f'<polygon points="{pts(s)}" fill="none" stroke="#f2ffe0" stroke-opacity=".55" stroke-width="3" transform="translate(256 256) scale(.93) translate(-256 -256)"/>' for s in shapes[:2]) +
            '</g>')

def panel():
    return ('<rect width="512" height="512" rx="112" fill="#0e0f12"/>'
            f'<g clip-path="url(#clip)">{halftone(512, 512, step=15, cx=180, cy=-140, maxr=5.6, fade=560, color="#3f9a3a", op=.5)}</g>'
            '<rect x="5" y="5" width="502" height="502" rx="107" fill="none" stroke="#2a3a24" stroke-width="4"/>')

def pill(text, fs, length, cx, cy, ang=-45):
    h = fs * 1.3
    return (f'<g transform="translate({cx} {cy}) rotate({ang})">'
            f'<rect x="{-length/2}" y="{-h/2}" width="{length}" height="{h}" rx="{h/2}" fill="url(#pill)" stroke="#05070d" stroke-width="9"/>'
            f'<rect x="{-length/2+8}" y="{-h/2+8}" width="{length-16}" height="{h-16}" rx="{h/2-8}" fill="none" stroke="#1f74ff" stroke-width="5"/>'
            f'<text x="0" y="{fs*.36}" text-anchor="middle" font-family="Montserrat" font-weight="800" font-style="italic" font-size="{fs}" letter-spacing="-1" fill="#0b2a7a">{text}</text>'
            '</g>')

def svg(body, w=512, h=512):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><defs>{DEFS}</defs>{body}</svg>'

N = svg(panel() + arrow() + pill('PIU STATS', 52, 300, 278, 234))
O = svg(panel() + arrow())
P = svg(panel() + arrow() +
        '<g transform="translate(270 300)">'
        '<text x="0" y="-6" text-anchor="middle" font-family="Montserrat" font-weight="800" font-style="italic" font-size="124" letter-spacing="-4" fill="#ffffff" stroke="#05070d" stroke-width="18" paint-order="stroke" stroke-linejoin="round">PIU</text>'
        '<text x="0" y="86" text-anchor="middle" font-family="Montserrat" font-weight="800" font-style="italic" font-size="92" letter-spacing="-2" fill="#c8ff8a" stroke="#05070d" stroke-width="15" paint-order="stroke" stroke-linejoin="round">STATS</text></g>')
for k, v in {'N': N, 'O': O, 'P': P}.items():
    open(f'{k}.svg', 'w').write(v)
