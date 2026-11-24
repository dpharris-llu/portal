# Builds src/likelihood.txt: one base-36 character (0-35) per word in src/words.txt, giving how likely
# the word is to be chosen as an answer. Based on English word frequency (wordfreq's small_en list).
# Usage: python3 -I tools/build_likelihood.py path/to/small_en.msgpack.gz
import gzip, struct, math, sys, os
here = os.path.dirname(os.path.abspath(__file__))
d = gzip.open(sys.argv[1]).read(); p = 0
def r():  # minimal msgpack reader, enough for wordfreq's data file
    global p
    b = d[p]; p += 1
    def n(k):
        global p; v = d[p:p+k]; p += k; return v
    if b <= 0x7f: return b
    if 0x80 <= b <= 0x8f: return {r(): r() for _ in range(b & 15)}
    if 0x90 <= b <= 0x9f: return [r() for _ in range(b & 15)]
    if 0xa0 <= b <= 0xbf: return n(b & 31).decode()
    if b == 0xc0: return None
    if b in (0xc2, 0xc3): return b == 0xc3
    if b == 0xd9: return n(n(1)[0]).decode()
    if b == 0xda: return n(struct.unpack('>H', n(2))[0]).decode()
    if b == 0xdc: return [r() for _ in range(struct.unpack('>H', n(2))[0])]
    if b == 0xdd: return [r() for _ in range(struct.unpack('>I', n(4))[0])]
    if b == 0xde: return {r(): r() for _ in range(struct.unpack('>H', n(2))[0])}
    if b == 0xcc: return n(1)[0]
    if b == 0xcd: return struct.unpack('>H', n(2))[0]
    if b >= 0xe0: return b - 256
    raise ValueError(hex(b))
data = r()
freq_order = [w for bucket in data[1:] for w in bucket]
pos = {}
for i, w in enumerate(freq_order): pos.setdefault(w, i)
words = open(os.path.join(here, '../src/words.txt')).read().split()
# The game never picks plurals ending in S or past tenses ending in ED (stated on the page).
inflected = lambda w: (w.endswith('s') and not w.endswith('ss')) or w.endswith('ed')
rank = {w: i for i, w in enumerate(sorted([w for w in words if not inflected(w)], key=lambda w: pos.get(w, 10**9)))}
irank = {w: i for i, w in enumerate(sorted([w for w in words if inflected(w)], key=lambda w: pos.get(w, 10**9)))}
# Proper names that are also in the dictionary (JESSE, PETER, JAPAN...) are never answers.
names = set(open(os.path.join(here, '../src/excluded-names.txt')).read().split())
def weight(w):
    if w not in pos: return 0.0
    if w in names: return 0.0
    if inflected(w): return 0.03 / (1 + math.exp((irank[w] - 1500) / 300))
    return 1 / (1 + math.exp((rank[w] - 2600) / 300))
chars = '0123456789abcdefghijklmnopqrstuvwxyz'
out = ''.join(chars[min(35, round(weight(w) * 35))] for w in words)
open(os.path.join(here, '../src/likelihood.txt'), 'w').write(out)
print('words', len(words), 'plausible (>=0.5)', sum(1 for c in out if chars.index(c) >= 18))
