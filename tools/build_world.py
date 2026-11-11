#!/usr/bin/env python3
"""世界版データ(data/world.json)を生成する。

- 国境データ: Natural Earth (110m, パブリックドメイン)。初回にGitHubから取得
- pieces : ロビンソン図法で国境を共有したまま簡略化(隣同士が接する)
- outline: 走る形(最長辺=1に正規化)。複数の島からなる国は最大の陸地(本土)の形
- scale  : 細長い国は走れる幅になるよう形を大きめにする倍率(1〜2.5)

使い方: python tools/build_world.py   (shapely, pyproj が必要)
"""
import json, math, os, urllib.request
import numpy as np
import shapely
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely import affinity
from shapely.ops import polylabel
from shapely.ops import transform
from pyproj import Transformer

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "ne110.geojson")
URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson"
OUT = os.path.join(HERE, "..", "data", "world.json")

EXCLUDE = {"ATA", "ATF"}          # 南極大陸・仏領南方南極地域は対象外
PIECE_TOL = 45000                 # ピースの簡略化(m)。ロビンソン図法上
ROUTE_SIMP = 0.02
PALETTE_N = 5
W = 1000.0                        # 地図の幅(座標の単位)


def clean(g):
    if not g.is_valid:
        g = shapely.make_valid(g)
    if g.geom_type == "GeometryCollection":
        g = shapely.union_all([x for x in g.geoms if x.geom_type in ("Polygon", "MultiPolygon")])
    return MultiPolygon([g]) if g.geom_type == "Polygon" else g


def main():
    if not os.path.exists(SRC):
        urllib.request.urlretrieve(URL, SRC)
    feats = [f for f in json.load(open(SRC, encoding="utf-8"))["features"]
             if f["properties"].get("ADM0_A3") not in EXCLUDE and f["properties"].get("ISO_A3") not in EXCLUDE]

    geo, names = [], []
    for f in feats:
        p = f["properties"]
        geo.append(clean(shape(f["geometry"])))
        names.append((p.get("NAME_JA") or p.get("NAME_EN") or p["NAME"], p.get("NAME_EN") or p["NAME"]))

    # 重なりを取り除いてから投影(ロビンソン図法)
    tree = shapely.STRtree(geo)
    for i in range(len(geo)):
        for j in tree.query(geo[i]):
            if j > i and geo[i].intersection(geo[j]).area > 0:
                g = geo[j].difference(geo[i])
                geo[j] = MultiPolygon([g]) if g.geom_type == "Polygon" else g
    tr = Transformer.from_crs("EPSG:4326", "ESRI:54030", always_xy=True).transform
    proj = [transform(tr, g) for g in geo]
    simp = list(shapely.coverage_simplify(np.array(proj, dtype=object), PIECE_TOL))

    # 描画範囲
    xs0, ys0, xs1, ys1 = 1e18, 1e18, -1e18, -1e18
    for g in simp:
        b = g.bounds; xs0, ys0, xs1, ys1 = min(xs0, b[0]), min(ys0, b[1]), max(xs1, b[2]), max(ys1, b[3])
    S = W / (xs1 - xs0)
    H = (ys1 - ys0) * S

    def px(x, y):
        return ((x - xs0) * S, (ys1 - y) * S)

    # 隣り合う国が違う色になるよう色分け
    n = len(simp)
    big = [g.buffer(2000) for g in simp]
    adj = {i: {j for j in range(n) if j != i and big[i].intersects(simp[j])} for i in range(n)}
    col = {}
    for i in sorted(range(n), key=lambda i: -len(adj[i])):
        used = {col[j] for j in adj[i] if j in col}
        col[i] = next((c for c in range(PALETTE_N) if c not in used), PALETTE_N - 1)

    # 大きい国から先に描く(飛び地の小さな国が上に来る)
    order = sorted(range(n), key=lambda i: -simp[i].area)
    prefs = []
    for new_id, i in enumerate(order, start=1):
        g = simp[i]
        polys = [p for p in g.geoms if p.area > 0 and len(p.exterior.coords) >= 4]
        if not polys:
            continue
        d = ""
        for p in polys:
            pts = [px(x, y) for x, y in list(p.exterior.coords)[:-1]]
            d += "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z"
        main_p = max(polys, key=lambda p: p.area)
        lp = polylabel(main_p, tolerance=0.01); lx, ly = px(lp.x, lp.y)
        bw = (main_p.bounds[2] - main_p.bounds[0]) * S

        # --- 走る形: 最大の陸地の輪郭(緯度経度のまま扱い、経度は緯度で縮める) ---
        land = max(geo[i].geoms, key=lambda p: p.area)
        kx = math.cos(math.radians(land.centroid.y))
        land = affinity.scale(land, xfact=kx, yfact=1.0, origin=(0, 0))
        b = land.bounds
        side = max(b[2] - b[0], b[3] - b[1])
        land = affinity.scale(land, 1 / side, 1 / side, origin=(0, 0)).simplify(ROUTE_SIMP)
        if land.is_empty or land.geom_type != "Polygon":
            continue
        c = land.centroid
        land = affinity.translate(land, -c.x, -c.y)
        ring = [[round(x, 4), round(y, 4)] for x, y in list(land.exterior.coords)[:-1]]
        per = land.exterior.length
        cplx = per * per / (4 * math.pi * land.area)
        scale = round(min(2.5, max(1.0, math.sqrt(0.42 / land.area))), 2)   # 細長い国は大きめに

        short, en = names[i]
        prefs.append({
            "id": new_id, "name": short, "short": short, "en": en,
            "d": d, "label": [round(lx, 1), round(ly, 1)], "lz": round(max(1.0, len(short) * 7.5 / max(bw, 0.1)), 1),
            "color": col[i], "outline": ring, "perimeter": round(per, 4), "cplx": round(cplx, 3),
            "scale": scale, "level": 0,
        })

    order2 = sorted(range(len(prefs)), key=lambda k: prefs[k]["cplx"] * prefs[k]["scale"])
    for rank, k in enumerate(order2):
        prefs[k]["level"] = 1 + rank * 5 // len(order2)

    out = {"viewBox": [0, 0, round(W, 1), round(H, 1)], "inset": None, "kind": "world", "prefs": prefs}
    with open(OUT, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, separators=(",", ":"))
    print("wrote", os.path.normpath(OUT), f"{os.path.getsize(OUT)/1024:.0f} KB", len(prefs), "countries/regions, viewBox", out["viewBox"])
    print("scale>1.5:", [p["short"] for p in prefs if p["scale"] > 1.5][:20])


if __name__ == "__main__":
    main()
