exec(open('final.py').read().split("open('icon-rounded.svg'")[0])
dots = halftone(1024, 500, step=16, cx=120, cy=-120, maxr=6, fade=820, color="#3f9a3a", op=.45)
F = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500"><defs>{DEFS}</defs>'
     '<rect width="1024" height="500" fill="#0e0f12"/>' + dots +
     f'<g transform="translate(40 34) scale(.84)">{panel()}{art}</g>'
     '<text x="512" y="200" font-family="Montserrat" font-weight="800" font-style="italic" font-size="104" letter-spacing="-3" fill="#ffffff">PIU <tspan fill="#8cff3a">Stats</tspan></text>'
     '<text x="516" y="262" font-family="Inter" font-weight="700" font-size="32" fill="#e8ead0">Seus recordes de Pump</text>'
     '<text x="516" y="302" font-family="Inter" font-weight="700" font-size="32" fill="#e8ead0">e a galera num lugar só.</text>'
     '<text x="516" y="372" font-family="Inter" font-weight="700" font-size="21" letter-spacing="1" fill="#8fe36a">PUMBILITY · TIER · FILA · DESAFIOS</text>'
     '</svg>')
open('feature.svg','w').write(F)
