"""Generates the refined illustration set (inline SVG) for the diabetes course."""
import math, random

def f(x):
    return ("%.1f" % x).rstrip("0").rstrip(".")

# ---------------------------------------------------------------- helpers
def leaf(x, y, length, width, angle, color, vein=None):
    s = (f'<g transform="translate({f(x)} {f(y)}) rotate({f(angle)})">'
         f'<path d="M0 0 Q{f(length/2)} {f(-width)} {f(length)} 0 Q{f(length/2)} {f(width)} 0 0Z" fill="{color}"/>')
    if vein:
        s += f'<path d="M2 0 L{f(length*0.85)} 0" stroke="{vein}" stroke-width="1" opacity=".6"/>'
    return s + '</g>'

def glass(x, y, h=30, w=16):
    # y = base line
    return (f'<ellipse cx="{f(x)}" cy="{f(y+2)}" rx="{f(w/2+3)}" ry="3" fill="#000" opacity=".12"/>'
            f'<path d="M{f(x-w/2)} {f(y-h)} L{f(x-w/2+1.5)} {f(y)} Q{f(x)} {f(y+3)} {f(x+w/2-1.5)} {f(y)} L{f(x+w/2)} {f(y-h)} Z" fill="#e3f2fa" opacity=".9"/>'
            f'<path d="M{f(x-w/2+.8)} {f(y-h*0.62)} L{f(x-w/2+1.8)} {f(y-1)} Q{f(x)} {f(y+2)} {f(x+w/2-1.8)} {f(y-1)} L{f(x+w/2-.8)} {f(y-h*0.62)} Z" fill="#a8d5ef"/>'
            f'<ellipse cx="{f(x)}" cy="{f(y-h*0.62)}" rx="{f(w/2-.8)}" ry="1.6" fill="#c9e7f7"/>'
            f'<path d="M{f(x-w/2+3)} {f(y-h+3)} L{f(x-w/2+3.6)} {f(y-4)}" stroke="#fff" stroke-width="2" opacity=".8" stroke-linecap="round"/>')

def plate(cx, cy, rx, ry):
    return (f'<ellipse cx="{f(cx)}" cy="{f(cy+4)}" rx="{f(rx)}" ry="{f(ry)}" fill="#000" opacity=".13"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="#ebe5da"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(cy-.6)}" rx="{f(rx*.8)}" ry="{f(ry*.72)}" fill="#fbf9f5"/>')

# ---------------------------------------------------------------- people (front, seated)
INK = "#2a1e18"

def person(cx, scale, skin, skin_sh, hair, top, top_sh, kind):
    """Seated person behind a table edge at y=262. Returns (body, hands)."""
    g = f'<g transform="translate({f(cx)} 262) scale({f(scale)})">'
    b = ""
    HT = '<g transform="translate(0 7) translate(0 -138) scale(1.06) translate(0 138)">'
    b += HT
    # back hair
    if kind == "mom":
        b += f'<path d="M-27 -140 Q-31 -176 0 -176 Q31 -176 27 -140 L31 -84 Q0 -74 -31 -84 Z" fill="{hair}"/>'
    if kind == "grandma":
        b += f'<path d="M-26 -140 Q-29 -172 0 -173 Q29 -172 26 -140 Q27 -118 19 -112 L-19 -112 Q-27 -118 -26 -140Z" fill="{hair}"/>'
    b += '</g>'
    # torso
    b += (f'<path d="M-52 12 L-54 -58 Q-54 -84 -30 -88 L-11 -94 Q0 -88 11 -94 L30 -88 Q54 -84 54 -58 L52 12 Z" fill="{top}"/>'
          f'<path d="M26 -89 Q54 -84 54 -58 L52 12 L32 12 Q38 -40 26 -89 Z" fill="{top_sh}" opacity=".55"/>')
    # outfit details
    if kind == "grandma":
        b += (f'<path d="M-12 -94 L0 -66 L12 -94 Q0 -88 -12 -94Z" fill="#f4eee4"/>'
              f'<path d="M-12 -94 L0 -66 M12 -94 L0 -66" stroke="{top_sh}" stroke-width="2"/>'
              + "".join(f'<circle cx="1.5" cy="{y}" r="2.2" fill="{top_sh}"/>' for y in (-54, -36, -18))
              + '<path d="M-8 -90 Q0 -76 8 -90" stroke="#e9dccb" stroke-width="1.6" fill="none"/><circle cx="0" cy="-77" r="2.4" fill="#d9a441"/>')
    if kind == "dad":
        b += (f'<path d="M-12 -95 L-4 -78 L0 -89 L4 -78 L12 -95 L6 -97 L0 -89 L-6 -97 Z" fill="#9cc2a7"/>'
              f'<path d="M0 -88 V10" stroke="{top_sh}" stroke-width="1.6"/>'
              + "".join(f'<circle cx="2.6" cy="{y}" r="1.6" fill="{top_sh}"/>' for y in (-70, -50, -30, -10))
              + f'<path d="M-30 -60 h16 v14 h-16z" fill="none" stroke="{top_sh}" stroke-width="1.4" opacity=".8"/>')
    if kind == "mom":
        b += f'<path d="M-15 -95 Q0 -76 15 -95 Q0 -89 -15 -95Z" fill="{skin}"/>'
    if kind == "child":
        b += (f'<path d="M-54 -46 h108 v9 h-108z M-53 -28 h106 v9 h-106z" fill="#2e3a4f" opacity=".85"/>'
              f'<path d="M-10 -94 Q0 -84 10 -94" stroke="{top_sh}" stroke-width="3" fill="none"/>')
    # neck
    b += (f'<path d="M-8 -118 L-8 -92 Q0 -86 8 -92 L8 -118 Z" fill="{skin}"/>'
          f'<path d="M-8 -116 Q0 -104 8 -116 L8 -119 L-8 -119 Z" fill="{skin_sh}"/>')
    b += HT
    if kind == "mom":  # front locks over shoulders
        b += (f'<path d="M-23 -132 Q-30 -104 -36 -78 Q-28 -72 -21 -78 Q-17 -106 -15 -128Z" fill="{hair}"/>'
              f'<path d="M23 -132 Q30 -104 36 -78 Q28 -72 21 -78 Q17 -106 15 -128Z" fill="{hair}"/>')
    # ears + head
    b += (f'<ellipse cx="-20.5" cy="-136" rx="4.6" ry="6.6" fill="{skin_sh}"/><ellipse cx="20.5" cy="-136" rx="4.6" ry="6.6" fill="{skin_sh}"/>'
          f'<ellipse cx="0" cy="-138" rx="21" ry="25" fill="{skin}"/>'
          f'<path d="M14 -158 Q22 -146 20 -128 Q16 -118 8 -114 Q18 -128 14 -158Z" fill="{skin_sh}" opacity=".45"/>')
    # front hair
    if kind == "grandma":
        b += (f'<path d="M-23 -144 Q-20 -170 0 -170 Q22 -170 24 -144 Q15 -160 3 -157 Q-10 -162 -23 -144Z" fill="{hair}"/>'
              '<path d="M-12 -163 q11 -6 22 -1" stroke="#fff" stroke-width="2" opacity=".45" fill="none" stroke-linecap="round"/>')
    if kind == "dad":
        b += (f'<path d="M-21.5 -145 Q-23 -168 0 -168 Q23 -168 21.5 -145 Q18 -156 0 -157 Q-18 -156 -21.5 -145Z" fill="{hair}"/>'
              f'<path d="M-20.5 -138 Q-21 -112 0 -109 Q21 -112 20.5 -138 Q17 -124 8 -121 Q0 -117 -8 -121 Q-17 -124 -20.5 -138Z" fill="{hair}"/>')
    if kind == "mom":
        b += (f'<path d="M-22.5 -140 Q-22 -172 2 -170 Q25 -168 23.5 -138 Q19 -156 6 -158 Q-6 -152 -22.5 -140Z" fill="{hair}"/>'
              '<path d="M-6 -164 q10 -4 20 2" stroke="#fff" stroke-width="2" opacity=".25" fill="none" stroke-linecap="round"/>')
    if kind == "child":
        for (x, y, r) in [(-18, -152, 9), (-8, -161, 10), (5, -163, 10), (17, -156, 9), (22, -144, 6), (-22, -142, 6)]:
            b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{hair}"/>'
        b += '<circle cx="2" cy="-166" r="3" fill="#fff" opacity=".2"/>'
    # face
    brow = hair if kind != "grandma" else "#8a7d72"
    b += (f'<path d="M-13 -148 q5 -3 10 -1" stroke="{brow}" stroke-width="2.3" fill="none" stroke-linecap="round"/>'
          f'<path d="M3 -149 q5 -2 10 1" stroke="{brow}" stroke-width="2.3" fill="none" stroke-linecap="round"/>'
          f'<ellipse cx="-8" cy="-139" rx="2.2" ry="2.7" fill="{INK}"/><ellipse cx="8" cy="-139" rx="2.2" ry="2.7" fill="{INK}"/>'
          f'<circle cx="-7.3" cy="-140" r=".7" fill="#fff"/><circle cx="8.7" cy="-140" r=".7" fill="#fff"/>'
          f'<path d="M0.5 -136 q-3 6.5 1.5 8.5" stroke="{skin_sh}" stroke-width="2" fill="none" stroke-linecap="round"/>')
    if kind == "dad":
        b += f'<path d="M-9 -127 Q0 -131 9 -127 Q0 -125 -9 -127Z" fill="{hair}"/>'
    b += (f'<path d="M-7 -123 Q0 -116 7 -123 Q0 -120.5 -7 -123Z" fill="#8e3b2e"/>'
          f'<ellipse cx="-12.5" cy="-128" rx="4.6" ry="3" fill="#e07a5f" opacity=".2"/><ellipse cx="12.5" cy="-128" rx="4.6" ry="3" fill="#e07a5f" opacity=".2"/>')
    if kind == "grandma":
        b += ('<rect x="-16" y="-144" width="13" height="10" rx="4" fill="#fff" fill-opacity=".18" stroke="#5b4636" stroke-width="1.6"/>'
              '<rect x="3" y="-144" width="13" height="10" rx="4" fill="#fff" fill-opacity=".18" stroke="#5b4636" stroke-width="1.6"/>'
              '<path d="M-3 -140 h6 M-16 -140 l-5 -1 M16 -140 l5 -1" stroke="#5b4636" stroke-width="1.6"/>')
    if kind == "mom":
        b += '<circle cx="-21" cy="-127" r="2.4" fill="#d9a441"/><circle cx="21" cy="-127" r="2.4" fill="#d9a441"/>'
    b += '</g>'
    # upper sleeves (beside torso, down to the table)
    b += (f'<path d="M-54 -62 Q-63 -24 -58 8 L-42 8 Q-45 -26 -41 -60 Z" fill="{top}"/>'
          f'<path d="M54 -62 Q63 -24 58 8 L42 8 Q45 -26 41 -60 Z" fill="{top_sh}"/>')
    body = g + b + '</g>'
    # forearms + hands resting on the table (drawn after the tabletop)
    h = (f'<path d="M-60 2 Q-52 -4 -41 1 L-16 19 Q-12 29 -23 30 L-58 15 Z" fill="{top}"/>'
         f'<path d="M60 2 Q52 -4 41 1 L16 19 Q12 29 23 30 L58 15 Z" fill="{top_sh}"/>'
         f'<ellipse cx="-16" cy="25" rx="9.5" ry="6.5" fill="{skin}"/><ellipse cx="16" cy="25" rx="9.5" ry="6.5" fill="{skin}"/>'
         f'<path d="M-21 27 q5 2 10 0 M11 27 q5 2 10 0" stroke="{skin_sh}" stroke-width="1.2" fill="none"/>')
    hands = g + h + '</g>'
    return body, hands


def welcome():
    random.seed(4)
    s = ('<svg class="art art-hero" viewBox="0 0 720 400" role="img" aria-labelledby="artWelT artWelD">'
         '<title id="artWelT">A family sharing a healthy meal</title>'
         '<desc id="artWelD">A grandmother, a father, a mother, and a child smile around a dinner table with a leafy salad, bean tacos, brown rice and beans, fruit, and glasses of water.</desc>'
         '<defs>'
         '<clipPath id="wClip"><rect width="720" height="400" rx="26"/></clipPath>'
         '<linearGradient id="wWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--il-wall1)"/><stop offset="1" style="stop-color:var(--il-wall2)"/></linearGradient>'
         '<linearGradient id="wSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0f5"/><stop offset="1" stop-color="#eaf5fb"/></linearGradient>'
         '<linearGradient id="wWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7a36f"/><stop offset="1" stop-color="#c48a52"/></linearGradient>'
         '<radialGradient id="wGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe2a0" stop-opacity=".55"/><stop offset="1" stop-color="#ffe2a0" stop-opacity="0"/></radialGradient>'
         '</defs><g clip-path="url(#wClip)">'
         '<rect width="720" height="400" fill="url(#wWall)"/>'
         '<rect y="330" width="720" height="70" style="fill:var(--il-floor)"/>')
    # window
    s += ('<rect x="38" y="38" width="150" height="118" rx="6" fill="#f4eee4"/>'
          '<rect x="46" y="46" width="134" height="102" rx="3" fill="url(#wSky)"/>'
          '<path d="M46 118 Q90 92 130 108 Q160 98 180 106 V148 H46Z" fill="#a9cdb0"/>'
          '<path d="M46 130 Q100 112 180 126 V148 H46Z" fill="#8dbb98"/>'
          '<circle cx="152" cy="74" r="12" fill="#f6d27a"/>'
          '<path d="M113 46 V148 M46 97 H180" stroke="#f4eee4" stroke-width="6"/>'
          '<rect x="30" y="154" width="166" height="9" rx="3" fill="#e6dccb"/>'
          '<path d="M64 154 l4 -18 h18 l4 18z" fill="#c8775a"/>')
    for (x, y, l, a, c) in [(77, 136, 22, -120, "#5e8c6a"), (77, 136, 24, -70, "#6f9a7e"), (77, 136, 20, -95, "#4f7d5c"), (77, 136, 18, -40, "#7fa48a"), (77, 136, 18, -145, "#7fa48a")]:
        s += leaf(x, y, l, 6, a, c)
    # wall art + lamp
    s += ('<rect x="548" y="52" width="104" height="78" rx="4" fill="#f4eee4"/><rect x="556" y="60" width="88" height="62" fill="#e8dfcf"/>'
          '<path d="M556 108 Q584 84 606 100 Q624 88 644 96 V122 H556Z" fill="#7fa48a"/><circle cx="620" cy="78" r="8" fill="#d9a441"/>'
          '<path d="M360 0 V44" stroke="#2e3a4f" stroke-width="2"/>'
          '<path d="M332 44 H388 L404 70 H316 Z" fill="#2e3a4f"/><ellipse cx="360" cy="70" rx="44" ry="5" fill="#ffe9b0"/>'
          '<ellipse cx="360" cy="230" rx="330" ry="170" fill="url(#wGlow)"/>')
    people = [
        person(146, 1.0, "#e3b48f", "#c99572", "#d6d3cf", "#7a5c8e", "#5e4470", "grandma"),
        person(286, 1.04, "#8a5a3c", "#6e452d", "#1f1a17", "#6f9a7e", "#4f7d5c", "dad"),
        person(430, 1.0, "#c98e62", "#ab734b", "#3a2618", "#c8775a", "#a65e45", "mom"),
        person(572, 0.8, "#f0cba8", "#d9ab86", "#8c4b2a", "#d9a441", "#b8862c", "child"),
    ]
    s += "".join(p[0] for p in people)
    # table
    s += ('<path d="M58 262 H662 L712 338 H8 Z" fill="url(#wWood)"/>'
          '<path d="M8 338 H712 V352 H8Z" fill="#a8723f"/><path d="M30 352 H690 V368 H30Z" fill="#8f5f33"/>'
          '<path d="M250 262 H470 L492 338 H228Z" fill="#f4eee4" opacity=".85"/>'
          '<path d="M256 262 H464" stroke="#e6dccb" stroke-width="2"/>')
    s += "".join(p[1] for p in people)
    # fruit bowl (left)
    s += ('<ellipse cx="72" cy="318" rx="40" ry="6" fill="#000" opacity=".12"/>'
          '<circle cx="58" cy="296" r="13" fill="#f39c34"/><circle cx="54" cy="291" r="3" fill="#fff" opacity=".35"/>'
          '<circle cx="84" cy="296" r="13" fill="#d64933"/><circle cx="80" cy="291" r="3" fill="#fff" opacity=".35"/>'
          '<path d="M84 283 q2 -6 6 -7" stroke="#5b3a1e" stroke-width="2" fill="none"/>'
          '<path d="M60 284 q14 -14 34 -6 q-16 0 -30 10z" fill="#f2cf4a"/>'
          '<path d="M38 300 Q72 336 106 300 Z" fill="#7fa48a"/><path d="M38 300 Q72 306 106 300" stroke="#6a8f75" stroke-width="2" fill="none"/>')
    # taco platter
    s += plate(200, 306, 72, 14)
    for (tx, rot) in [(172, -4), (202, 0), (232, 4)]:
        s += (f'<g transform="translate({tx} 304) rotate({rot})">'
              '<path d="M-21 -4 A21 19 0 0 0 21 -4 Z" fill="#e6b96a"/>'
              '<path d="M-21 -4 A21 19 0 0 0 21 -4" fill="none" stroke="#c9944a" stroke-width="2"/>'
              '<path d="M-19 -5 q4 -6 8 -1 q4 -6 8 -1 q4 -6 8 -1 q4 -6 8 -1 q3 -5 5 0" fill="#7cb85f"/>'
              + "".join(f'<circle cx="{x}" cy="{y}" r="2.6" fill="#2b2522"/>' for (x, y) in [(-11, -3), (-3, -1), (6, -3), (13, -1)])
              + '<rect x="-8" y="-9" width="4" height="4" fill="#e4572e"/><rect x="4" y="-8" width="4" height="4" fill="#e4572e"/>'
              '<path d="M-14 -7 q6 -5 12 -1" stroke="#a7c957" stroke-width="3" fill="none" stroke-linecap="round"/></g>')
    # salad bowl
    s += '<ellipse cx="362" cy="330" rx="62" ry="8" fill="#000" opacity=".13"/>'
    for i in range(26):
        a = random.uniform(-160, -20)
        x = 362 + random.uniform(-48, 48)
        y = 296 + random.uniform(-10, 4)
        c = random.choice(["#4f8f4f", "#6aa84f", "#86bf66", "#3d7a45", "#a7c957"])
        s += leaf(x, y, random.uniform(14, 24), random.uniform(5, 8), a, c, "#2f5e33")
    s += ('<circle cx="340" cy="290" r="7" fill="#d64933"/><circle cx="340" cy="290" r="4" fill="#f07c62"/>'
          '<circle cx="386" cy="286" r="7" fill="#d64933"/><circle cx="386" cy="286" r="4" fill="#f07c62"/>'
          '<circle cx="364" cy="282" r="7" fill="#d9e8c4"/><circle cx="364" cy="282" r="7" fill="none" stroke="#6e9a55" stroke-width="1.6"/>'
          '<path d="M372 290 l12 -8 M376 294 l12 -6" stroke="#f08a24" stroke-width="2.4" stroke-linecap="round"/>'
          '<path d="M300 296 Q306 336 362 338 Q418 336 424 296 Z" fill="#f7f4ee"/>'
          '<path d="M304 310 Q362 326 420 310" stroke="#7fa48a" stroke-width="3" fill="none"/>'
          '<path d="M300 296 Q362 306 424 296" stroke="#e4ddd0" stroke-width="2" fill="none"/>')
    # rice + beans bowl
    s += ('<ellipse cx="516" cy="326" rx="48" ry="7" fill="#000" opacity=".13"/>'
          '<ellipse cx="502" cy="300" rx="22" ry="10" fill="#dcc596"/>')
    for i in range(30):
        x = 502 + random.uniform(-17, 17); y = 300 + random.uniform(-7, 5)
        s += f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="2.4" ry="1" fill="#bf9e63" transform="rotate({random.randint(0,180)} {f(x)} {f(y)})"/>'
    s += '<ellipse cx="530" cy="301" rx="17" ry="9" fill="#5a2a26"/>'
    for i in range(12):
        x = 530 + random.uniform(-12, 12); y = 300 + random.uniform(-5, 4)
        s += f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="3" ry="2" fill="#7b3d36"/>'
    s += ('<path d="M470 302 Q474 330 516 330 Q558 330 562 302 Z" fill="#2e3a4f"/>'
          '<path d="M470 302 Q516 310 562 302" stroke="#46546e" stroke-width="2" fill="none"/>'
          '<circle cx="522" cy="292" r="2" fill="#6aa84f"/><circle cx="510" cy="294" r="2" fill="#6aa84f"/>')
    # glasses + carafe
    s += glass(116, 298) + glass(252, 292) + glass(470, 292) + glass(612, 300, 24, 14)
    s += ('<ellipse cx="664" cy="324" rx="20" ry="4" fill="#000" opacity=".12"/>'
          '<path d="M656 262 h16 v14 Q690 286 688 304 Q686 324 664 324 Q642 324 640 304 Q638 286 656 276Z" fill="#e3f2fa" opacity=".9"/>'
          '<path d="M641 296 Q664 300 687 296 Q688 322 664 322 Q640 322 641 296Z" fill="#a8d5ef"/>'
          '<circle cx="660" cy="306" r="6" fill="#f6e05e" opacity=".9"/><circle cx="672" cy="312" r="5" fill="#f6e05e" opacity=".9"/>'
          '<path d="M648 280 q-2 14 0 30" stroke="#fff" stroke-width="2.5" opacity=".8" fill="none" stroke-linecap="round"/>')
    s += '</g></svg>'
    return s


# ---------------------------------------------------------------- plate (top-down)
def broccoli(x, y, r, rot):
    s = f'<g transform="translate({f(x)} {f(y)}) rotate({rot})">'
    s += f'<path d="M-3 0 L-4 {f(r*1.6)} Q0 {f(r*1.8)} 4 {f(r*1.6)} L3 0Z" fill="#9ccc65"/>'
    for (dx, dy, k, c) in [(-r*.6, -r*.1, .62, "#2e6b34"), (r*.6, -r*.1, .62, "#2e6b34"), (0, -r*.55, .66, "#3d7f3f"),
                           (-r*.35, r*.35, .55, "#47904a"), (r*.35, r*.35, .55, "#3d7f3f"), (0, 0, .6, "#4f9a50")]:
        s += f'<circle cx="{f(dx)}" cy="{f(dy)}" r="{f(r*k)}" fill="{c}"/>'
    for (dx, dy) in [(-r*.3, -r*.5), (r*.25, -r*.3), (-r*.6, 0), (r*.5, r*.2), (0, r*.2)]:
        s += f'<circle cx="{f(dx)}" cy="{f(dy)}" r="{f(r*.12)}" fill="#7cc36b" opacity=".7"/>'
    return s + '</g>'

def tomato(x, y, r):
    return (f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="#d64933"/><circle cx="{f(x-r*.35)}" cy="{f(y-r*.35)}" r="{f(r*.28)}" fill="#fff" opacity=".45"/>'
            f'<path d="M{f(x)} {f(y-r*.2)} l-3 -3 M{f(x)} {f(y-r*.2)} l3 -3 M{f(x)} {f(y-r*.2)} l0 -4" stroke="#3d7f3f" stroke-width="1.8" stroke-linecap="round"/>')

def carrot(x, y, r):
    s = f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="#ef8a2b"/><circle cx="{f(x)}" cy="{f(y)}" r="{f(r*.55)}" fill="#f6a654"/>'
    for a in range(0, 360, 60):
        s += f'<path d="M{f(x+math.cos(math.radians(a))*r*.2)} {f(y+math.sin(math.radians(a))*r*.2)} L{f(x+math.cos(math.radians(a))*r*.5)} {f(y+math.sin(math.radians(a))*r*.5)}" stroke="#e07a1f" stroke-width=".9"/>'
    return s

def tofu(x, y, sz):
    h = sz * .5
    return (f'<g transform="translate({f(x)} {f(y)})">'
            f'<path d="M0 {f(-h)} L{f(sz)} {f(-h-sz*.3)} L{f(sz*2)} {f(-h)} L{f(sz)} {f(-h+sz*.3)} Z" fill="#f6e7c1"/>'
            f'<path d="M0 {f(-h)} L{f(sz)} {f(-h+sz*.3)} L{f(sz)} {f(h+sz*.3)} L0 {f(h)} Z" fill="#e8cf98"/>'
            f'<path d="M{f(sz)} {f(-h+sz*.3)} L{f(sz*2)} {f(-h)} L{f(sz*2)} {f(h)} L{f(sz)} {f(h+sz*.3)} Z" fill="#d8b878"/>'
            f'<path d="M{f(sz*.5)} {f(-h-sz*.05)} L{f(sz*1.3)} {f(-h-sz*.28)} M{f(sz*.8)} {f(-h+sz*.1)} L{f(sz*1.6)} {f(-h-sz*.13)}" stroke="#a9773d" stroke-width="2" stroke-linecap="round" opacity=".7"/></g>')

def eating():
    random.seed(11)
    s = ('<svg class="art" viewBox="0 0 720 320" role="img" aria-labelledby="artEatT artEatD">'
         '<title id="artEatT">A balanced, plant-forward plate</title>'
         '<desc id="artEatD">A plate seen from above on a linen tablecloth. Half is vegetables: broccoli, carrots, peppers, green beans, spinach, and cherry tomatoes. One quarter is seared tofu and beans. One quarter is brown rice and roasted sweet potato. A glass of water with lemon sits beside it.</desc>'
         '<defs><clipPath id="eClip"><rect width="720" height="320" rx="26"/></clipPath>'
         '<filter id="eSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>'
         '<pattern id="eWeave" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6 L6 0" stroke="#000" stroke-width=".6" opacity=".05"/></pattern>'
         '<linearGradient id="eMetal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9c0c6"/><stop offset=".5" stop-color="#e9edf0"/><stop offset="1" stop-color="#a7aeb5"/></linearGradient>'
         '</defs><g clip-path="url(#eClip)">'
         '<rect width="720" height="320" style="fill:var(--il-cloth)"/><rect width="720" height="320" fill="url(#eWeave)"/>')
    # napkin + fork
    s += ('<g transform="rotate(-8 140 170)"><rect x="96" y="70" width="88" height="190" rx="6" fill="#a8c3ae"/>'
          '<rect x="96" y="70" width="88" height="190" rx="6" fill="url(#eWeave)"/>'
          '<path d="M96 210 H184" stroke="#8fae96" stroke-width="2"/><path d="M96 220 H184" stroke="#f4eee4" stroke-width="3" opacity=".8"/>'
          '<rect x="134" y="120" width="8" height="118" rx="4" fill="url(#eMetal)"/>'
          '<path d="M128 122 Q138 132 148 122 V86 M128 122 V86 M135 118 V86 M141 118 V86" stroke="#c3cad0" stroke-width="3" fill="none" stroke-linecap="round"/></g>')
    # knife
    s += '<path d="M556 66 Q568 64 570 120 L566 250 Q562 258 558 250 Z" fill="url(#eMetal)"/>'
    # plate
    cx, cy = 340, 162
    s += (f'<circle cx="{cx+8}" cy="{cy+10}" r="120" fill="#000" opacity=".18" filter="url(#eSoft)"/>'
          f'<circle cx="{cx}" cy="{cy}" r="120" fill="#f3efe8"/><circle cx="{cx}" cy="{cy}" r="96" fill="#fffdf9"/>'
          f'<path d="M{cx-104} {cy-50} A114 114 0 0 1 {cx+40} {cy-108}" stroke="#fff" stroke-width="4" opacity=".9" fill="none" stroke-linecap="round"/>'
          f'<circle cx="{cx}" cy="{cy}" r="96" fill="none" stroke="#e8e1d5" stroke-width="2"/>')
    # vegetable half (left)
    for (x, y, l, a) in [(262, 120, 46, 20), (258, 196, 44, -25), (290, 228, 40, -70), (300, 90, 40, 60)]:
        s += leaf(x, y, l, 14, a, "#3f7a3f", "#7fb069")
    for (x, y, a) in [(258, 150, -8), (262, 160, -2), (266, 170, 6)]:
        s += f'<path d="M{x} {y} q22 -6 44 {a}" stroke="#5c9e45" stroke-width="6" fill="none" stroke-linecap="round"/>'
    s += broccoli(282, 98, 15, -15) + broccoli(306, 128, 13, 10) + broccoli(290, 206, 15, 20) + broccoli(312, 236, 12, -10)
    s += carrot(262, 132, 9) + carrot(278, 180, 8.5) + carrot(316, 172, 8) + carrot(254, 220, 8)
    s += ('<path d="M296 150 q10 -10 22 -8" stroke="#d64933" stroke-width="7" fill="none" stroke-linecap="round"/>'
          '<path d="M298 148 q8 -7 16 -6" stroke="#f07c62" stroke-width="2" fill="none" stroke-linecap="round"/>'
          '<path d="M300 196 q12 -4 22 4" stroke="#e8b53c" stroke-width="7" fill="none" stroke-linecap="round"/>'
          '<path d="M302 194 q9 -3 16 2" stroke="#f6d67a" stroke-width="2" fill="none" stroke-linecap="round"/>')
    s += tomato(322, 92, 8) + tomato(254, 172, 8) + tomato(326, 216, 7.5)
    # protein quarter (top right)
    s += tofu(352, 102, 13) + tofu(384, 118, 12) + tofu(354, 132, 12)
    for i in range(34):
        x = 400 + random.uniform(-16, 18); y = 142 + random.uniform(-12, 10)
        c = random.choice(["#6b2f2a", "#7b3d36", "#2b2522", "#5a2a26"])
        s += f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="3.6" ry="2.4" fill="{c}" transform="rotate({random.randint(0,180)} {f(x)} {f(y)})"/>'
    for (x, y) in [(394, 136), (408, 146), (398, 150)]:
        s += leaf(x, y, 8, 3, random.randint(0, 360), "#6aa84f")
    # carb quarter (bottom right)
    s += '<ellipse cx="370" cy="200" rx="30" ry="22" fill="#d9c08b"/>'
    for i in range(140):
        a = random.uniform(0, 2 * math.pi); r = math.sqrt(random.random())
        x = 370 + math.cos(a) * r * 28; y = 200 + math.sin(a) * r * 20
        c = random.choice(["#c4a066", "#e6d3a3", "#b8925a", "#efe0b8"])
        s += f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="3" ry="1.3" fill="{c}" transform="rotate({random.randint(0,180)} {f(x)} {f(y)})"/>'
    for (x, y, rot) in [(404, 196, -30), (398, 222, 10), (378, 236, 35)]:
        s += (f'<g transform="translate({x} {y}) rotate({rot})"><path d="M-14 4 Q-2 -12 16 -6 Q12 8 -14 4Z" fill="#e9823a"/>'
              '<path d="M-14 4 Q12 8 16 -6" stroke="#9c4a1f" stroke-width="3" fill="none"/>'
              '<path d="M-4 -2 l6 -3 M4 -4 l5 -2" stroke="#7a3a17" stroke-width="1.6" opacity=".6"/></g>')
    for (x, y) in [(362, 192), (378, 206), (356, 210)]:
        s += f'<circle cx="{x}" cy="{y}" r="1.6" fill="#3d7f3f"/>'
    # water glass (top-down)
    s += ('<circle cx="626" cy="108" r="44" fill="#000" opacity=".12" filter="url(#eSoft)"/>'
          '<circle cx="620" cy="100" r="42" fill="#e9f5fb"/><circle cx="620" cy="100" r="35" fill="#c3e3f5"/>'
          '<rect x="598" y="80" width="18" height="18" rx="4" fill="#fff" opacity=".65" transform="rotate(12 607 89)"/>'
          '<rect x="624" y="104" width="16" height="16" rx="4" fill="#fff" opacity=".6" transform="rotate(-18 632 112)"/>'
          '<circle cx="634" cy="86" r="13" fill="#f6e05e"/><circle cx="634" cy="86" r="10" fill="#faf0a0"/>'
          + "".join(f'<path d="M634 86 L{f(634+math.cos(math.radians(a))*9)} {f(86+math.sin(math.radians(a))*9)}" stroke="#f0d84a" stroke-width="1.2"/>' for a in range(0, 360, 45))
          + '<path d="M588 82 A38 38 0 0 1 620 62" stroke="#fff" stroke-width="3" fill="none" opacity=".9" stroke-linecap="round"/>')
    # apple + herb sprig
    s += ('<circle cx="626" cy="232" r="30" fill="#000" opacity=".14" filter="url(#eSoft)"/>'
          '<path d="M620 204 C640 196 656 214 650 236 C644 258 628 260 620 254 C612 260 596 258 590 236 C584 214 600 196 620 204Z" fill="#c83c2b"/>'
          '<path d="M600 214 C606 206 614 206 618 208" stroke="#fff" stroke-width="4" opacity=".35" fill="none" stroke-linecap="round"/>'
          '<path d="M620 206 q2 -10 8 -14" stroke="#5b3a1e" stroke-width="3" fill="none" stroke-linecap="round"/>')
    s += leaf(628, 194, 18, 6, -30, "#5e8c6a", "#8fbf9a")
    s += '<path d="M40 280 q40 -30 90 -36" stroke="#5e8c6a" stroke-width="2.5" fill="none"/>'
    for i, (x, y) in enumerate([(56, 268), (74, 258), (92, 251), (110, 246)]):
        s += leaf(x, y, 16, 6, -100 if i % 2 else 10, "#6f9a7e", "#9cc2a7")
    s += '</g></svg>'
    return s


# ---------------------------------------------------------------- park walk
def tree(x, base, h, r, tones):
    s = (f'<path d="M{f(x-5)} {f(base)} Q{f(x-3)} {f(base-h*.5)} {f(x-2)} {f(base-h)} L{f(x+2)} {f(base-h)} Q{f(x+3)} {f(base-h*.5)} {f(x+6)} {f(base)} Z" fill="#7a5a3c"/>'
         f'<path d="M{f(x)} {f(base-h*.55)} q10 -8 16 -18" stroke="#7a5a3c" stroke-width="3" fill="none"/>')
    cy = base - h - r * .3
    for (dx, dy, k, t) in [(0, 0, 1, 1), (-r*.7, r*.35, .72, 0), (r*.7, r*.35, .72, 2), (-r*.35, -r*.5, .7, 1), (r*.4, -r*.45, .66, 0), (0, r*.45, .7, 2)]:
        s += f'<circle cx="{f(x+dx)}" cy="{f(cy+dy)}" r="{f(r*k)}" fill="{tones[t]}"/>'
    for (dx, dy) in [(-r*.4, -r*.55), (r*.2, -r*.6), (-r*.75, r*.1)]:
        s += f'<circle cx="{f(x+dx)}" cy="{f(cy+dy)}" r="{f(r*.18)}" fill="#fff" opacity=".12"/>'
    return s

def limb(points, width, color):
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in points)
    return f'<path d="{d}" stroke="{color}" stroke-width="{width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'

def active():
    s = ('<svg class="art" viewBox="0 0 720 320" role="img" aria-labelledby="artActT artActD">'
         '<title id="artActT">Friends out for a walk in the park</title>'
         '<desc id="artActD">A woman walks a small dog on a leash while a man in a wheelchair rolls beside her along a park path, with trees, rolling hills, and a sunny sky.</desc>'
         '<defs><clipPath id="aClip"><rect width="720" height="320" rx="26"/></clipPath>'
         '<linearGradient id="aSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--il-sky1)"/><stop offset="1" style="stop-color:var(--il-sky2)"/></linearGradient>'
         '<radialGradient id="aSun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe7a0" stop-opacity=".9"/><stop offset="1" stop-color="#ffe7a0" stop-opacity="0"/></radialGradient>'
         '</defs><g clip-path="url(#aClip)">'
         '<rect width="720" height="320" fill="url(#aSky)"/>'
         '<circle cx="590" cy="70" r="70" fill="url(#aSun)"/><circle cx="590" cy="70" r="24" fill="#f6d27a"/>')
    for (x, y, k) in [(150, 60, 1), (420, 44, .8)]:
        s += (f'<g opacity=".9" style="fill:var(--il-cloud)"><ellipse cx="{x}" cy="{y}" rx="{38*k}" ry="{12*k}"/><circle cx="{x-12*k}" cy="{y-8*k}" r="{14*k}"/><circle cx="{x+10*k}" cy="{y-12*k}" r="{17*k}"/></g>')
    s += ('<path d="M0 170 Q120 120 250 146 Q380 170 500 132 Q620 100 720 140 V320 H0Z" style="fill:var(--il-hill3)"/>'
          '<path d="M0 200 Q150 166 300 184 Q470 204 720 170 V320 H0Z" style="fill:var(--il-hill2)"/>')
    for x in (230, 260, 470, 500, 520):
        s += f'<rect x="{x-1.5}" y="{170 if x < 400 else 150}" width="3" height="16" fill="#6a5a46"/><circle cx="{x}" cy="{166 if x < 400 else 146}" r="9" fill="#5e8c6a" opacity=".85"/>'
    s += ('<path d="M0 232 Q200 210 380 222 Q560 234 720 214 V320 H0Z" style="fill:var(--il-hill1)"/>'
          '<path d="M-10 320 Q200 270 360 262 Q560 252 730 244 L730 274 Q560 280 380 292 Q220 304 120 330Z" style="fill:var(--il-path)"/>'
          '<path d="M-10 320 Q200 270 360 262 Q560 252 730 244" stroke="#000" stroke-opacity=".06" stroke-width="2" fill="none"/>')
    # bench far
    s += ('<path d="M600 222 h60 M604 214 h52" stroke="#8a6a4a" stroke-width="4"/><path d="M608 222 v10 M652 222 v10" stroke="#6a5038" stroke-width="3"/>')
    s += tree(80, 250, 70, 42, ["#4f8a5a", "#3f7a4a", "#5f9a68"]) + tree(676, 236, 56, 34, ["#5f9a68", "#4f8a5a", "#6fa874"])
    for (x, y, c) in [(170, 246, "#e07a5f"), (186, 250, "#f2c14e"), (540, 240, "#7a5c8e"), (556, 244, "#e07a5f"), (300, 250, "#f2c14e")]:
        s += f'<path d="M{x} {y} v8" stroke="#4f7d5c" stroke-width="1.6"/><circle cx="{x}" cy="{y}" r="3.6" fill="{c}"/>'
    # shadows
    s += ('<ellipse cx="236" cy="288" rx="58" ry="7" fill="#000" opacity=".13"/>'
          '<ellipse cx="392" cy="282" rx="34" ry="5" fill="#000" opacity=".13"/>'
          '<ellipse cx="492" cy="280" rx="30" ry="4" fill="#000" opacity=".13"/>')
    # ---- wheelchair user (left, facing right)
    W = "#2e3a4f"
    s += (f'<circle cx="226" cy="252" r="34" fill="none" stroke="{W}" stroke-width="6"/>'
          '<circle cx="226" cy="252" r="28" fill="none" stroke="#a7b1bb" stroke-width="2.4"/>'
          + "".join(f'<path d="M226 252 L{f(226+math.cos(math.radians(a))*28)} {f(252+math.sin(math.radians(a))*28)}" stroke="#c3cad0" stroke-width="1.2"/>' for a in range(0, 360, 30))
          + f'<circle cx="226" cy="252" r="5" fill="{W}"/>'
          f'<path d="M206 166 L210 222 L262 222 L272 270" stroke="{W}" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>'
          f'<path d="M206 166 L196 164" stroke="{W}" stroke-width="5" stroke-linecap="round"/>'
          f'<circle cx="272" cy="278" r="8" fill="none" stroke="{W}" stroke-width="4"/>'
          f'<path d="M262 270 h18" stroke="{W}" stroke-width="5" stroke-linecap="round"/>')
    s += limb([(222, 216), (258, 214), (264, 264)], 16, "#4a5a78")
    s += '<path d="M256 262 h20 q6 0 6 6 h-28z" fill="#f4eee4"/><path d="M254 268 h30" stroke="#2b2522" stroke-width="3"/>'
    s += ('<path d="M208 220 Q204 178 212 158 Q228 148 240 160 Q246 190 240 222 Z" fill="#c8775a"/>'
          '<path d="M232 156 Q246 190 240 222 L230 222 Q236 190 228 158Z" fill="#a65e45" opacity=".6"/>'
          '<path d="M212 160 Q222 150 236 156 Q230 146 218 146 Q206 150 212 160Z" fill="#a65e45"/>')
    s += limb([(230, 166), (242, 196), (238, 236)], 11, "#b8664c") + '<circle cx="238" cy="238" r="6" fill="#f0cba8"/>'
    s += ('<rect x="221" y="132" width="12" height="16" rx="4" fill="#f0cba8"/>'
          '<ellipse cx="229" cy="122" rx="15" ry="17" fill="#f0cba8"/>'
          '<path d="M214 120 Q212 100 232 100 Q248 102 246 118 Q238 108 226 110 Q218 112 214 120Z" fill="#6b4a2f"/>'
          '<ellipse cx="216" cy="124" rx="3.5" ry="5" fill="#d9ab86"/>'
          '<path d="M242 112 Q251 121 243 126 Z" fill="#f0cba8"/>'
          f'<circle cx="238" cy="118" r="1.9" fill="{INK}"/><path d="M234 112 q4 -2 7 0" stroke="#6b4a2f" stroke-width="1.8" fill="none"/>'
          '<path d="M234 130 q5 3 9 -1" stroke="#8e3b2e" stroke-width="2" fill="none" stroke-linecap="round"/>'
          '<path d="M218 132 Q226 141 238 137" stroke="#6b4a2f" stroke-width="2" fill="none" opacity=".45"/>')
    # ---- walker (center, facing right)
    sk, sk2, jk, jk2, pants = "#7a4a30", "#5f3822", "#3e7c7a", "#2f6260", "#2e3a4f"
    s += limb([(388, 112), (372, 142), (362, 166)], 10, jk2) + f'<circle cx="361" cy="169" r="5.5" fill="{sk}"/>'
    s += limb([(384, 190), (372, 230), (350, 266)], 14, "#26303f")
    s += '<path d="M338 262 q4 -8 14 -6 l8 10 q-2 6 -10 6 h-12 q-4 -4 0 -10z" fill="#f4eee4"/><path d="M336 272 h24" stroke="#c8775a" stroke-width="3"/>'
    s += limb([(392, 190), (410, 228), (414, 268)], 14, pants)
    s += '<path d="M406 266 h22 q8 0 8 8 h-32z" fill="#f4eee4"/><path d="M404 274 h34" stroke="#c8775a" stroke-width="3"/>'
    s += (f'<path d="M378 108 Q392 100 404 110 L408 196 Q392 204 376 196 Z" fill="{jk}"/>'
          f'<path d="M398 106 Q404 108 404 112 L408 196 L398 198 Q402 150 398 106Z" fill="{jk2}" opacity=".7"/>'
          '<path d="M392 108 V196" stroke="#f4eee4" stroke-width="1.6" opacity=".7"/>'
          f'<path d="M376 188 h32" stroke="{jk2}" stroke-width="5"/>')
    s += limb([(396, 114), (412, 146), (430, 140)], 10, jk) + f'<circle cx="433" cy="139" r="5.5" fill="{sk}"/>'
    s += (f'<rect x="386" y="90" width="13" height="16" rx="5" fill="{sk}"/>'
          f'<ellipse cx="394" cy="78" rx="14" ry="16" fill="{sk}"/>'
          f'<path d="M406 70 Q415 78 408 83 Z" fill="{sk}"/>'
          '<path d="M380 80 Q378 58 398 58 Q412 60 410 72 Q398 64 388 70 Q384 74 380 80Z" fill="#1f1a17"/>'
          '<path d="M382 66 Q368 70 364 92 Q372 84 384 78Z" fill="#1f1a17"/>'
          f'<ellipse cx="384" cy="80" rx="3.4" ry="5" fill="{sk2}"/>'
          f'<circle cx="402" cy="76" r="1.9" fill="{INK}"/><path d="M398 70 q4 -2 7 0" stroke="#1f1a17" stroke-width="1.8" fill="none"/>'
          '<path d="M399 88 q5 3 9 -1" stroke="#5a2a22" stroke-width="2" fill="none" stroke-linecap="round"/>'
          '<path d="M380 64 Q392 56 406 62 L420 66 Q412 70 404 68 Q392 66 382 70Z" fill="#d9a441"/>')
    # leash + dog
    s += '<path d="M434 140 Q470 190 474 238" stroke="#c8775a" stroke-width="2" fill="none"/>'
    s += ('<path d="M460 262 L456 280 M468 262 L470 280 M500 260 L504 278 M508 256 L516 274" stroke="#b07a44" stroke-width="6" stroke-linecap="round"/>'
          '<path d="M452 246 Q470 232 500 238 Q516 240 514 256 Q500 268 470 266 Q452 262 452 246Z" fill="#c98b4f"/>'
          '<path d="M470 266 Q484 258 498 264 Q486 270 470 266Z" fill="#f4eee4"/>'
          '<path d="M454 246 Q440 236 442 220" stroke="#c98b4f" stroke-width="6" fill="none" stroke-linecap="round"/>'
          '<path d="M498 236 Q500 222 512 218 Q528 216 532 228 Q534 238 522 242 Q506 246 498 236Z" fill="#c98b4f"/>'
          '<path d="M526 230 q8 2 8 6 q-4 3 -9 1z" fill="#f4eee4"/><circle cx="533" cy="234" r="2.4" fill="#2b2522"/>'
          '<path d="M508 220 Q500 228 504 244 Q512 238 514 226Z" fill="#8a5a2c"/>'
          '<circle cx="520" cy="226" r="1.8" fill="#2b2522"/>'
          '<path d="M498 236 q4 6 2 12" stroke="#d64933" stroke-width="4" fill="none"/>')
    s += '</g></svg>'
    return s


if __name__ == "__main__":
    import sys
    out = sys.argv[1]
    for name, fn in [("welcome", welcome), ("eating", eating), ("active", active)]:
        open(f"{out}/art2-{name}.svg", "w").write(fn())
    print("done")
