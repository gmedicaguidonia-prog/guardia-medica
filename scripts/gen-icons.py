# Genera il set di icone (favicon, Android, Apple, PWA) per l'app.
# Disegno: calendario (verde/bianco) con caduceo medico di lato.
# Reso con Pillow a 1024px e ridimensionato (LANCZOS) per bordi puliti.
import os, math
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.normpath(os.path.join(HERE, '..', 'public'))
os.makedirs(OUT, exist_ok=True)

G_TOP   = (96, 143, 79)    # verde chiaro (gradiente alto)
G_BOT   = (42, 68, 37)     # verde scuro (gradiente basso)
HEADER  = (47, 101, 64)    # verde header calendario
OUTLINE = (28, 46, 25)     # verde scurissimo per i contorni
WHITE   = (255, 255, 255)
GRID    = (120, 160, 106)  # verde chiaro per le caselle

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))

def gradient(D):
    img = Image.new('RGB', (D, D), G_TOP)
    dr = ImageDraw.Draw(img)
    for y in range(D):
        dr.line([(0, y), (D, y)], fill=lerp(G_TOP, G_BOT, y/(D-1)))
    return img

def make_master(D, rounded=True, art_scale=1.0):
    base = gradient(D).convert('RGBA')
    if rounded:
        mask = Image.new('L', (D, D), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, D-1, D-1], radius=int(0.20*D), fill=255)
        base.putalpha(mask)
    d = ImageDraw.Draw(base)
    s  = art_scale * D
    ox = (0.5 - 0.5*art_scale) * D
    oy = (0.5 - 0.5*art_scale) * D
    def X(v): return ox + v*s
    def Y(v): return oy + v*s
    def L(v): return v*s
    ow = max(2, int(L(0.011)))

    # ───── Calendario ─────
    d.rounded_rectangle([X(0.09), Y(0.27), X(0.52), Y(0.83)], radius=L(0.05), fill=WHITE)
    d.rounded_rectangle([X(0.09), Y(0.27), X(0.52), Y(0.41)], radius=L(0.05), fill=HEADER)
    d.rectangle([X(0.09), Y(0.35), X(0.52), Y(0.41)], fill=HEADER)
    d.rounded_rectangle([X(0.09), Y(0.27), X(0.52), Y(0.83)], radius=L(0.05), outline=OUTLINE, width=ow)
    d.line([X(0.09), Y(0.41), X(0.52), Y(0.41)], fill=OUTLINE, width=ow)
    # anelli
    for rx in (0.19, 0.42):
        d.rounded_rectangle([X(rx-0.020), Y(0.18), X(rx+0.020), Y(0.32)], radius=L(0.02),
                            fill=WHITE, outline=OUTLINE, width=ow)
    # caselle (3x3)
    cols = [0.175, 0.305, 0.435]
    rows = [0.515, 0.625, 0.735]
    for cy in rows:
        for cxx in cols:
            d.rounded_rectangle([X(cxx-0.030), Y(cy-0.030), X(cxx+0.030), Y(cy+0.030)],
                                radius=L(0.012), fill=GRID)

    # ───── Caduceo (di lato, a destra) ─────
    cx = 0.715
    # asta
    d.rounded_rectangle([X(cx-0.022), Y(0.215), X(cx+0.022), Y(0.855)], radius=L(0.022),
                        fill=WHITE, outline=OUTLINE, width=ow)
    # serpenti: underlay scuro + bianco sopra
    def snake(sign):
        pts = []
        N = 64
        for i in range(N+1):
            t = i/N
            y = 0.32 + 0.50*t
            x = cx + sign*0.078*math.cos(2*math.pi*1.75*t)
            pts.append((X(x), Y(y)))
        return pts
    for sign in (1, -1):
        d.line(snake(sign), fill=OUTLINE, width=int(L(0.052)), joint='curve')
    for sign in (1, -1):
        d.line(snake(sign), fill=WHITE,   width=int(L(0.034)), joint='curve')
    # teste dei serpenti (in alto)
    for sign in (1, -1):
        hx, hy = cx + sign*0.078, 0.32
        d.ellipse([X(hx-0.034), Y(hy-0.030), X(hx+0.034), Y(hy+0.030)],
                  fill=WHITE, outline=OUTLINE, width=ow)
    # pomello in cima
    d.ellipse([X(cx-0.046), Y(0.155), X(cx+0.046), Y(0.247)], fill=WHITE, outline=OUTLINE, width=ow)
    # ali
    def wing(sign):
        return [(X(cx+sign*0.012), Y(0.255)), (X(cx+sign*0.135), Y(0.205)),
                (X(cx+sign*0.150), Y(0.250)), (X(cx+sign*0.095), Y(0.285)),
                (X(cx+sign*0.030), Y(0.280))]
    for sign in (1, -1):
        d.polygon(wing(sign), fill=WHITE, outline=OUTLINE)
    return base

master_r    = make_master(1024, rounded=True,  art_scale=1.0)
master_sq   = make_master(1024, rounded=False, art_scale=1.0)
master_mask = make_master(1024, rounded=False, art_scale=0.66)

def out(name): return os.path.join(OUT, name)
def save(img, size, name, flatten=False):
    im = img.resize((size, size), Image.LANCZOS)
    if flatten:
        flat = Image.new('RGB', (size, size), G_BOT)
        flat.paste(im, (0, 0), im)
        flat.save(out(name))
    else:
        im.save(out(name))

save(master_r, 16,  'favicon-16.png')
save(master_r, 32,  'favicon-32.png')
save(master_r, 192, 'icon-192.png')
save(master_r, 512, 'icon-512.png')
save(master_sq,   180, 'apple-touch-icon.png',   flatten=True)
save(master_mask, 512, 'icon-512-maskable.png',  flatten=True)

ico = master_r.resize((128, 128), Image.LANCZOS)
ico.save(out('favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])

print('Icone generate in', OUT)
for f in sorted(os.listdir(OUT)):
    print(' ', f)
