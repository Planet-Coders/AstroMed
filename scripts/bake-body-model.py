"""Bake the 3D body-map figure from the MakeHuman base mesh (hm08, released CC0).

Usage: python3 scripts/bake-body-model.py path/to/base.obj
Source: https://github.com/makehumancommunity/makehuman  (makehuman/data/3dobjs/base.obj)

Writes public/models/body.bin and lib/bodyModelJoints.ts.
body.bin layout (little endian):
  uint32 vertexCount, uint32 quadCount
  int16  male positions   [vertexCount * 3]  (metres * 16000, feet at y = 0)
  int16  female positions [vertexCount * 3]
  uint16 quads            [quadCount * 4]
"""
import json
import struct
import sys

import numpy as np

SCALE = 16000
HEIGHT = {"male": 1.78, "female": 1.68}
JOINTS = ["head", "head-2", "neck", "jaw", "spine-1", "spine-2", "spine-3", "spine-4", "pelvis",
          "l-clavicle", "l-shoulder", "l-elbow", "l-hand", "l-hand-2", "l-upper-leg", "l-knee", "l-ankle", "l-foot-1", "l-foot-2",
          "l-eye"]


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def gauss(d2, s):
    return np.exp(-d2 / (2 * s * s))


def shape(P, figure):
    """Turn the neutral base mesh into a male or female build (MakeHuman units, decimetres)."""
    P = P.copy()
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    sgn = np.sign(x)
    arm = smooth(ax, 1.75, 2.3) * (y > 1.4)  # arms and hands
    upper = np.maximum(smooth(y, 3.0, 4.8) * (y < 6.2), arm)  # shoulder girdle
    torso_x = smooth(ax, 0.15, 1.7)
    hips = gauss((y - 0.6) ** 2, 1.1) * (1 - arm)
    waist = gauss((y - 2.6) ** 2, 0.8) * (1 - arm)
    if figure == "male":
        x += sgn * 0.22 * torso_x * upper           # broader shoulders
        x *= 1 - 0.07 * hips                          # narrower hips
        x *= 1 + 0.05 * waist                         # straighter waist
        chest = gauss((y - 4.2) ** 2, 0.7) * (1 - arm) * (ax < 1.7)
        z += 0.10 * chest * (z > 0.3)                 # fuller chest
        for s in (-1, 1):                             # flatten the neutral mesh's bust
            z -= 0.14 * gauss((x - s * 0.75) ** 2 + (y - 4.0) ** 2, 0.36) * (z > 0.5)
        neck = gauss((y - 5.9) ** 2, 0.35) * (ax < 0.9)
        x *= 1 + 0.10 * neck
        limb = np.maximum(arm, 1 - smooth(y, -0.6, 0.7))
        P[:, 0], P[:, 1], P[:, 2] = x, y, z
        return P, limb, 1.05
    x -= sgn * 0.14 * torso_x * upper                 # narrower shoulders
    x *= 1 + 0.085 * hips                             # wider hips
    x *= 1 - 0.09 * waist                             # narrower waist
    z_mid = 0.2
    z += (z - z_mid) * (-0.06) * waist
    for s in (-1, 1):                                 # bust
        d2 = (x - s * 0.72) ** 2 + (y - 4.05) ** 2
        z += 0.42 * gauss(d2, 0.42) * (z > 0.5)
    back = gauss((y - 0.2) ** 2, 0.7) * (z < 0) * (1 - arm)
    z -= 0.10 * back
    limb = np.maximum(arm, 1 - smooth(y, -0.6, 0.7))
    P[:, 0], P[:, 1], P[:, 2] = x, y, z
    return P, limb, 0.93


def thicken_limbs(P, limb, k, axes):
    """Scale limb thickness around each limb's bone axis."""
    out = P.copy()
    best = np.full(len(P), 1e9)
    for a, b in axes:
        ab = b - a
        t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        c = a + t[:, None] * ab
        d = np.linalg.norm(P - c, axis=1)
        m = d < best
        best[m] = d[m]
        out[m] = (c + (P - c) * (1 + (k - 1) * limb[:, None]))[m]
    return out


def pose(P, orig, shoulder, hip, arm_deg=20.0, leg_deg=4.0):
    """Lower the arms and narrow the stance of the A-pose. Masks come from the original mesh."""
    out = P.copy()
    ox, oy = orig[:, 0], orig[:, 1]
    for s in (-1, 1):
        for pivot, deg, w in (
            (shoulder, arm_deg, smooth(s * ox, 1.3, 2.15) * ((oy > 2.6) | ((np.abs(ox) > 2.6) & (oy > -2.0)))),
            (hip, leg_deg, (1 - smooth(oy, -0.6, 0.9)) * smooth(s * ox, 0.0, 0.5) * ((oy < -2.0) | ((np.abs(ox) < 2.6) & (oy < 2.0)))),
        ):
            px, py = s * pivot[0], pivot[1]
            th = np.radians(deg) * w
            dx, dy = (out[:, 0] - px) * s, out[:, 1] - py
            nx = dx * np.cos(th) + dy * np.sin(th)
            ny = -dx * np.sin(th) + dy * np.cos(th)
            m = w > 0
            out[m, 0] = (px + s * nx)[m]
            out[m, 1] = (py + ny)[m]
    return out


def main(src):
    V, faces, cur = [], {}, None
    for line in open(src):
        p = line.split()
        if not p:
            continue
        if p[0] == "v":
            V.append([float(c) for c in p[1:4]])
        elif p[0] == "g":
            cur = p[1]
        elif p[0] == "f":
            faces.setdefault(cur, []).append([int(c.split("/")[0]) - 1 for c in p[1:]])
    V = np.array(V)
    quads = np.array(faces["body"], dtype=np.uint16)
    n = int(quads.max()) + 1
    joints = {j: V[np.unique(np.array(faces["joint-" + j]))].mean(0) for j in JOINTS}
    J = np.array([joints[j] for j in JOINTS])
    ground = V[np.unique(np.array(faces["joint-ground"]))].mean(0)[1]

    def jp(name):
        return joints[name]

    def mirror(p):
        return p * np.array([-1, 1, 1])

    axes = []
    for a, b in [("l-shoulder", "l-elbow"), ("l-elbow", "l-hand"), ("l-upper-leg", "l-knee"), ("l-knee", "l-ankle")]:
        axes.append((jp(a), jp(b)))
        axes.append((mirror(jp(a)), mirror(jp(b))))

    blobs, joint_out = [], {}
    for fig in ("male", "female"):
        allp = np.vstack([V[:n], J])
        shaped, limb, k = shape(allp, fig)
        body = thicken_limbs(shaped[:n], limb[:n], k, axes)
        jts = shaped[n:]
        sh, hp = jts[JOINTS.index("l-shoulder")], jts[JOINTS.index("l-upper-leg")]
        posed = pose(np.vstack([body, jts]), allp, sh, hp)
        body, jts = posed[:n], posed[n:]
        top, low = body[:, 1].max(), body[:, 1].min()
        s = HEIGHT[fig] / (top - low)
        body = (body - [0, low, 0]) * s
        jts = (jts - [0, low, 0]) * s
        blobs.append(np.round(body * SCALE).astype("<i2").tobytes())
        joint_out[fig] = {name: [round(float(c), 4) for c in jts[i]] for i, name in enumerate(JOINTS)}

    with open("public/models/body.bin", "wb") as f:
        f.write(struct.pack("<II", n, len(quads)))
        for b in blobs:
            f.write(b)
        f.write(quads.astype("<u2").tobytes())

    with open("lib/bodyModelJoints.ts", "w") as f:
        f.write("// Generated by scripts/bake-body-model.py. Joint centres in metres (left side; mirror x for right).\n")
        f.write("export const BODY_MODEL_SCALE = %d;\n" % SCALE)
        f.write("export const BODY_JOINTS = %s as const;\n" % json.dumps(joint_out))
    print("verts", n, "quads", len(quads))


if __name__ == "__main__":
    main(sys.argv[1])
