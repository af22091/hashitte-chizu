#!/usr/bin/env python3
"""都道府県データ(data/prefectures.json)を生成する。

- pieces : 県境を共有したまま簡略化したパズルのピース(SVGパス)。隣同士はすき間なく接する
- outline: 走る形(最長辺=1に正規化、重心=原点、x=東、y=北)
- 難易度 : 形の複雑さ(周長^2/面積)から1〜5

使い方: python tools/build_data.py   (shapely が必要。県境データは初回にGitHubから取得)
"""
import json, math, os, urllib.request
import numpy as np
import shapely
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely import affinity

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "japan.geojson")
URL = "https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson"
OUT = os.path.join(HERE, "..", "data", "prefectures.json")

KX = math.cos(math.radians(37))   # 地図全体で共通の経度補正
ISLAND_MIN = 0.04                 # これより小さい島は省く
PIECE_TOL = 0.045                 # ピースの簡略化(度)。大きいほどパズル風
ROUTE_SIMP = 0.02                 # 走る形の簡略化(最長辺に対する比)
PALETTE_N = 5
X0, X1, Y0, Y1 = 126.5 * KX, 146.3 * KX, 27.8, 45.8
S = 50.0                          # 地図の座標倍率
OKI = "沖縄県"

SHORT = {"北海道": "北海道", "東京都": "東京", "京都府": "京都", "大阪府": "大阪"}


def px(x, y):
    return ((x - X0) * S, (Y1 - y) * S)


def ring_d(coords):
    pts = [px(x, y) for x, y in coords]
    return "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts[:-1]) + "Z"


def main():
    if not os.path.exists(SRC):
        urllib.request.urlretrieve(URL, SRC)
    data = json.load(open(SRC, encoding="utf-8"))
    feats = sorted(data["features"], key=lambda f: f["properties"]["id"])
    names = [f["properties"]["nam_ja"] for f in feats]

    # --- ピース(共有境界のまま簡略化) ---
    raw, real_main = [], {}
    for f in feats:
        n = f["properties"]["nam_ja"]
        g = shape(f["geometry"])
        parts_ll = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
        real_main[n] = max(parts_ll, key=lambda p: p.area)
        g = affinity.scale(g, xfact=KX, yfact=1.0, origin=(0, 0))
        parts = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
        top = max(p.area for p in parts)
        keep = [Polygon(p.exterior) for p in parts
                if (p.area > ISLAND_MIN or p.area == top) and (n == OKI or p.centroid.y > 30.0)]
        raw.append(MultiPolygon(keep))
    arr = np.array(raw, dtype=object)
    assert shapely.coverage_is_valid(arr), "県境が重なっています"
    simp = list(shapely.coverage_simplify(arr, PIECE_TOL))
    pieces = dict(zip(names, simp))

    # --- 沖縄は枠に入れて太平洋側へ ---
    mp = max(pieces[OKI].geoms, key=lambda p: p.area)
    c = mp.centroid
    tgt = (134.0 * KX, 29.6)
    pieces[OKI] = affinity.translate(affinity.scale(MultiPolygon([mp]), 1.6, 1.6, origin=(c.x, c.y)),
                                     tgt[0] - c.x, tgt[1] - c.y)

    # --- 隣り合う県が違う色になるよう色分け ---
    adj = {n: {m for m in names if m != n and pieces[n].buffer(1e-6).intersects(pieces[m])} for n in names}
    col = {}
    for n in sorted(names, key=lambda n: -len(adj[n])):
        used = {col[m] for m in adj[n] if m in col}
        col[n] = next((i for i in range(PALETTE_N) if i not in used), PALETTE_N - 1)

    out = {"viewBox": [0, 0, round((X1 - X0) * S, 1), round((Y1 - Y0) * S, 1)],
           "inset": [round((132.6 * KX - X0) * S, 1), round((Y1 - 30.8) * S, 1),
                     round(2.8 * KX * S, 1), round(2.4 * S, 1)],
           "prefs": []}
    for i, f in enumerate(feats):
        n = f["properties"]["nam_ja"]
        g = pieces[n]
        d = "".join(ring_d(list(p.exterior.coords)) for p in g.geoms)
        main_p = max(g.geoms, key=lambda p: p.area)
        lp = main_p.representative_point()
        lx, ly = px(lp.x, lp.y)

        # --- 走る形(本土の輪郭を正規化) ---
        poly = real_main[n]
        kx = math.cos(math.radians(poly.centroid.y))
        poly = affinity.scale(poly, xfact=kx, yfact=1.0, origin=(0, 0))
        b = poly.bounds
        side = max(b[2] - b[0], b[3] - b[1])
        poly = affinity.scale(poly, 1 / side, 1 / side, origin=(0, 0)).simplify(ROUTE_SIMP)
        cc = poly.centroid
        poly = affinity.translate(poly, -cc.x, -cc.y)
        ring = [[round(x, 4), round(y, 4)] for x, y in list(poly.exterior.coords)[:-1]]
        per = poly.exterior.length
        cplx = per * per / (4 * math.pi * poly.area)  # 円=1、複雑なほど大きい

        out["prefs"].append({
            "id": f["properties"]["id"], "name": n, "short": SHORT.get(n, n[:-1]),
            "d": d, "label": [round(lx, 1), round(ly, 1)], "color": col[n],
            "outline": ring, "perimeter": round(per, 4), "cplx": round(cplx, 3), "level": 0,
        })

    # 難易度は複雑さの順位で5段階(全国でほぼ均等に分ける)
    order = sorted(range(len(out["prefs"])), key=lambda i: out["prefs"][i]["cplx"])
    for rank, i in enumerate(order):
        out["prefs"][i]["level"] = 1 + rank * 5 // len(order)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, separators=(",", ":"))
    print("wrote", os.path.normpath(OUT), f"{os.path.getsize(OUT)/1024:.0f} KB", len(out["prefs"]), "prefs")
    print("difficulty:", {l: [p["short"] for p in out["prefs"] if p["level"] == l] for l in range(1, 6)})


if __name__ == "__main__":
    main()
