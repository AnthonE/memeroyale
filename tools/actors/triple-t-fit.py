#!/usr/bin/env python3
"""Triple T onto the kong rig: tools/actors/src/triple-t.glb -> public/assets/actors/tt/ (+ client/src/actors/tt-rig.gen.ts).

Meme Royale's player is Triple T (the Gates / oneshot character, see public/assets/actors/tt/provenance.json). The game
draws every player with the kong rig (client/src/actors/kong-rig.ts): 16 bones posed by code, every vertex carrying 4 bone
indices + weights in the rig's REST pose (model space, metres, facing -Z, +X its right). This script writes Triple T in
that format, the same nine meshes kong-asset.ts loads, so kong.ts and kong-rig.ts draw him unchanged:

  1. skin his bind pose (54 joints) into the scene's frame, turned to face -Z;
  2. pose him into the rig's rest: each arm and leg swung (with everything below it) onto the direction its kong bone
     rests in, so the rig's procedural poses, written against that rest, hold;
  3. fold his joints' weights onto the 16 bones (fingers into the wrist, toes into the ankle, the clavicles into the
     chest), top four per vertex;
  4. the bone table (where each bone sits in that rest) and the face's seats (fist, eyes, hat) go to tt-rig.gen.ts;
  5. three tiers: hi (all of him), lo and min (vertex-clustered); min carries his albedo as vertex colour. The rig's
     separate head / gear / shoes / eyes meshes are single degenerate triangles: his are all one mesh and one texture.

Run: python3 tools/actors/triple-t-fit.py   (numpy and Pillow)
"""
import io
import json
import os
import struct

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "tools/actors/src/triple-t.glb")
OUT = os.path.join(ROOT, "public/assets/actors/tt")
GEN = os.path.join(ROOT, "client/src/actors/tt-rig.gen.ts")

# The kong rig's bones in order (kong-rig.ts BONE_LIST) and each one's parent.
BONES = ["hips", "spine", "chest", "head", "shoulderR", "elbowR", "wristR", "shoulderL", "elbowL", "wristL",
         "hipR", "kneeR", "ankleR", "hipL", "kneeL", "ankleL"]
PARENT = {"hips": None, "spine": "hips", "chest": "spine", "head": "chest", "shoulderR": "chest", "elbowR": "shoulderR",
          "wristR": "elbowR", "shoulderL": "chest", "elbowL": "shoulderL", "wristL": "elbowL", "hipR": "hips",
          "kneeR": "hipR", "ankleR": "kneeR", "hipL": "hips", "kneeL": "hipL", "ankleL": "kneeL"}
# Where each kong bone's pivot is on Triple T: a joint of his.
PIVOT = {"hips": "Hips", "spine": "Spine02", "chest": "Spine01", "head": "neck", "shoulderR": "RightArm",
         "elbowR": "RightForeArm", "wristR": "RightHand", "shoulderL": "LeftArm", "elbowL": "LeftForeArm",
         "wristL": "LeftHand", "hipR": "RightUpLeg", "kneeR": "RightLeg", "ankleR": "RightFoot", "hipL": "LeftUpLeg",
         "kneeL": "LeftLeg", "ankleL": "LeftFoot"}
# The kong rig's rest directions for the limbs (kong-rig.ts BONES offsets, child over parent): each of his limb
# segments is swung onto these. Joint -> (its child joint, the kong offset it should point along).
REST = {
    "RightArm": ("RightForeArm", (0.13, -0.38, 0.03)), "RightForeArm": ("RightHand", (0.03, -0.35, -0.03)),
    "LeftArm": ("LeftForeArm", (-0.13, -0.38, 0.03)), "LeftForeArm": ("LeftHand", (-0.03, -0.35, -0.03)),
    "RightUpLeg": ("RightLeg", (0.02, -0.35, -0.02)), "RightLeg": ("RightFoot", (0.0, -0.29, 0.02)),
    "LeftUpLeg": ("LeftLeg", (-0.02, -0.35, -0.02)), "LeftLeg": ("LeftFoot", (0.0, -0.29, 0.02)),
}


def bone_of(joint):
    """The kong bone a joint of his weighs on."""
    if joint in ("Hips",):
        return "hips"
    if joint == "Spine02":
        return "spine"
    if joint in ("Spine01", "Spine", "LeftShoulder", "RightShoulder"):
        return "chest"
    if joint in ("neck", "Head", "head_end", "headfront"):
        return "head"
    for side, s in (("Right", "R"), ("Left", "L")):
        if joint == f"{side}Arm":
            return "shoulder" + s
        if joint == f"{side}ForeArm":
            return "elbow" + s
        if joint.startswith(f"{side}Hand"):
            return "wrist" + s
        if joint == f"{side}UpLeg":
            return "hip" + s
        if joint == f"{side}Leg":
            return "knee" + s
        if joint in (f"{side}Foot", f"{side}ToeBase"):
            return "ankle" + s
    raise SystemExit(f"no kong bone for joint {joint}")


# ------------------------------------------------------------------ the file

class Glb:
    def __init__(self, path):
        raw = open(path, "rb").read()
        n = struct.unpack_from("<I", raw, 12)[0]
        self.json = json.loads(raw[20:20 + n])
        self.bin = raw[20 + n + 8:]

    def acc(self, i):
        a = self.json["accessors"][i]
        v = self.json["bufferViews"][a["bufferView"]]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a["componentType"]]
        k = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
        o = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = v.get("byteStride")
        isz = np.dtype(dt).itemsize
        if stride and stride != k * isz:
            buf = np.frombuffer(self.bin, np.uint8, a["count"] * stride, o).reshape(-1, stride)[:, :k * isz]
            out = np.frombuffer(buf.tobytes(), dt).reshape(a["count"], k)
        else:
            out = np.frombuffer(self.bin, dt, a["count"] * k, o).reshape(a["count"], k)
        if a.get("normalized"):
            out = out.astype(np.float32) / np.iinfo(dt).max
        return out

    def image(self, i):
        im = self.json["images"][i]
        v = self.json["bufferViews"][im["bufferView"]]
        o = v.get("byteOffset", 0)
        return Image.open(io.BytesIO(self.bin[o:o + v["byteLength"]])).convert("RGB")


def trs(n):
    m = np.eye(4)
    if "matrix" in n:
        return np.array(n["matrix"], dtype=float).reshape(4, 4).T
    t = n.get("translation", [0, 0, 0])
    x, y, z, w = n.get("rotation", [0, 0, 0, 1])
    s = n.get("scale", [1, 1, 1])
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m[:3, :3] = r * np.array(s)
    m[:3, 3] = t
    return m


def arc(a, b):
    """The rotation matrix turning direction a onto b by the shortest arc."""
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3) if c > 0 else -np.eye(3)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k * (1 / (1 + c))


# ------------------------------------------------------------------ fit

def main():
    g = Glb(SRC)
    J = g.json
    nodes = J["nodes"]
    names = [n.get("name", "") for n in nodes]
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
    local = [trs(n) for n in nodes]

    def world(i, loc):
        m = loc[i]
        while i in parent:
            i = parent[i]
            m = loc[i] @ m
        return m

    skin = J["skins"][0]
    joints = skin["joints"]
    jname = [names[j] for j in joints]
    ibm = g.acc(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)

    # Both meshes share one vertex buffer: the body others see is their union.
    body = next(m for m in J["meshes"] if m["name"] == "char1_body")["primitives"][0]
    arms = next(m for m in J["meshes"] if m["name"] == "char1_arms")["primitives"][0]
    assert body["attributes"]["POSITION"] == arms["attributes"]["POSITION"], "the two meshes no longer share vertices"
    at = body["attributes"]
    P = g.acc(at["POSITION"]).astype(float)
    N = g.acc(at["NORMAL"]).astype(float)
    UV = g.acc(at["TEXCOORD_0"]).astype(np.float32)
    JI = g.acc(at["JOINTS_0"]).astype(int)
    JW = g.acc(at["WEIGHTS_0"]).astype(float)
    tri = np.concatenate([g.acc(body["indices"]).reshape(-1, 3), g.acc(arms["indices"]).reshape(-1, 3)]).astype(np.int64)
    tri = np.unique(np.sort(tri, axis=1), axis=0, return_index=True)[1]
    tri = np.concatenate([g.acc(body["indices"]).reshape(-1, 3), g.acc(arms["indices"]).reshape(-1, 3)])[np.sort(tri)].astype(np.int64)
    used = np.unique(tri)
    remap = -np.ones(len(P), np.int64)
    remap[used] = np.arange(len(used))
    P, N, UV, JI, JW, tri = P[used], N[used], UV[used], JI[used], JW[used], remap[tri]

    # Into the rig's frame: his file faces +Z, the rig faces -Z (a half turn about Y).
    TURN = np.diag([-1.0, 1.0, -1.0, 1.0])

    # His joints' world matrices in his rest, turned.
    rest = [TURN @ world(j, local) for j in joints]

    # Pose: swing each limb segment onto its kong rest direction, root to tip (a turn about the joint carries
    # everything below it). Kept as per-joint world deltas D, composed down the chain.
    order = ["RightArm", "RightForeArm", "LeftArm", "LeftForeArm", "RightUpLeg", "RightLeg", "LeftUpLeg", "LeftLeg"]
    jidx = {n: k for k, n in enumerate(jname)}
    below = {k: set() for k in range(len(joints))}
    for k, j in enumerate(joints):
        i = j
        while i in parent:
            i = parent[i]
            if i in joints:
                below[joints.index(i)].add(k)
    posed = [m.copy() for m in rest]
    for name in order:
        child, want = REST[name]
        a, c = jidx[name], jidx[child]
        pa, pc = posed[a][:3, 3], posed[c][:3, 3]
        R = arc(pc - pa, np.array(want, float))
        Rm = np.eye(4)
        Rm[:3, :3] = R
        T1, T0 = np.eye(4), np.eye(4)
        T1[:3, 3], T0[:3, 3] = pa, -pa
        about = T1 @ Rm @ T0
        for k in {a} | below[a]:
            posed[k] = about @ posed[k]

    # Skin him into the pose.
    S = np.array([posed[k] @ ibm[k] for k in range(len(joints))])
    wsum = JW.sum(1, keepdims=True)
    W = JW / np.where(wsum > 0, wsum, 1)
    Ph = np.c_[P, np.ones(len(P))]
    V = np.zeros((len(P), 3))
    NN = np.zeros((len(P), 3))
    for s in range(4):
        M = S[JI[:, s]]
        V += W[:, s:s + 1] * np.einsum("nij,nj->ni", M, Ph)[:, :3]
        NN += W[:, s:s + 1] * np.einsum("nij,nj->ni", M[:, :3, :3], N)
    NN /= np.linalg.norm(NN, axis=1, keepdims=True) + 1e-12
    # Feet on y = 0.
    lift = -V[:, 1].min()
    V[:, 1] += lift
    pos = {n: posed[jidx[n]][:3, 3] + np.array([0, lift, 0]) for n in jname}

    # Weights onto the 16 bones.
    BI = {b: i for i, b in enumerate(BONES)}
    mapj = np.array([BI[bone_of(n)] for n in jname])
    acc16 = np.zeros((len(P), len(BONES)))
    for s in range(4):
        np.add.at(acc16, (np.arange(len(P)), mapj[JI[:, s]]), W[:, s])
    top = np.argsort(-acc16, axis=1)[:, :4]
    tw = np.take_along_axis(acc16, top, 1)
    tw /= tw.sum(1, keepdims=True)

    # The bone table: each bone's pivot over its parent's, in the rest.
    piv = {b: pos[PIVOT[b]] for b in BONES}
    offsets = {b: (piv[b] - (piv[PARENT[b]] if PARENT[b] else 0)) for b in BONES}

    # The face's seats, in the head's (or the wrist's) frame: the rest has no turns, so a seat is an offset.
    head = piv["head"]
    hb = (acc16[:, BI["head"]] > 0.9)
    hv = V[hb]
    top_of_head = hv[np.argmax(hv[:, 1])]
    front = hv[np.argmin(hv[:, 2])]
    eye_mid = np.array([0.0, front[1] - head[1] + 0.03, front[2] - head[2] + 0.02])
    rh = acc16[:, BI["wristR"]] > 0.9
    fist = V[rh].mean(0) - piv["wristR"]
    hat = (float(top_of_head[1] - head[1] - 0.04), float(top_of_head[2] - head[2]), 0.0, 1.0)

    # ------------------------------------------------------------- textures
    os.makedirs(OUT, exist_ok=True)
    albedo = g.image(J["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"])
    # His albedo is very dark (luma ~0.06, oneshot's look/paint.rs lifts it): lift it in linear light.
    a = np.asarray(albedo, np.float32) / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4) * 2.6
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.clip(lin, 0, 1) ** (1 / 2.4) - 0.055)
    lifted = Image.fromarray((np.clip(srgb, 0, 1) * 255 + 0.5).astype(np.uint8))
    flat_n = Image.new("RGB", (4, 4), (128, 128, 255))
    white = Image.new("RGB", (4, 4), (255, 255, 255))
    for tier, size in (("hi", 2048), ("lo", 512)):
        lifted.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"{tier}-kong-albedo.webp"), "WEBP", quality=88)
        flat_n.save(os.path.join(OUT, f"{tier}-kong-normal.webp"), "WEBP", lossless=True)
        white.save(os.path.join(OUT, f"{tier}-kong-ao.webp"), "WEBP", lossless=True)
        for part in ("gear",):
            Image.new("RGB", (4, 4), (90, 90, 90)).save(os.path.join(OUT, f"{tier}-{part}-albedo.webp"), "WEBP", lossless=True)
            flat_n.save(os.path.join(OUT, f"{tier}-{part}-normal.webp"), "WEBP", lossless=True)
            white.save(os.path.join(OUT, f"{tier}-{part}-ao.webp"), "WEBP", lossless=True)
    for part in ("head", "shoes"):
        Image.new("RGB", (4, 4), (90, 90, 90)).save(os.path.join(OUT, f"hi-{part}-albedo.webp"), "WEBP", lossless=True)
        flat_n.save(os.path.join(OUT, f"hi-{part}-normal.webp"), "WEBP", lossless=True)
        white.save(os.path.join(OUT, f"hi-{part}-ao.webp"), "WEBP", lossless=True)

    # ------------------------------------------------------------- tiers
    def cluster(target_tris):
        """Vertex clustering: a grid over him, one vertex per occupied cell (the one nearest its cell's mean)."""
        lo, hi = V.min(0), V.max(0)
        cell = 0.02
        for _ in range(30):
            key = np.floor((V - lo) / cell).astype(np.int64)
            k = key[:, 0] * 1_000_000 + key[:, 1] * 1000 + key[:, 2]
            u, inv = np.unique(k, return_inverse=True)
            t = inv[tri]
            t = t[(t[:, 0] != t[:, 1]) & (t[:, 1] != t[:, 2]) & (t[:, 0] != t[:, 2])]
            t = np.unique(np.sort(t, 1), axis=0) if len(t) else t
            if len(t) <= target_tris:
                break
            cell *= 1.15
        mean = np.zeros((len(u), 3))
        np.add.at(mean, inv, V)
        mean /= np.bincount(inv)[:, None]
        d = np.linalg.norm(V - mean[inv], axis=1)
        rep = np.full(len(u), -1)
        best = np.full(len(u), np.inf)
        for vi in np.argsort(d)[::-1]:
            c = inv[vi]
            rep[c] = vi
        # keep the original winding: rebuild from the source triangles
        t = inv[tri]
        keep = (t[:, 0] != t[:, 1]) & (t[:, 1] != t[:, 2]) & (t[:, 0] != t[:, 2])
        t = t[keep]
        _, first = np.unique(np.sort(t, 1), axis=0, return_index=True)
        t = t[np.sort(first)]
        return rep, t

    tiers = {"hi": (np.arange(len(V)), tri)}
    tiers["lo"] = cluster(6000)
    tiers["min"] = cluster(1900)

    # vertex colour for min: his lifted albedo at each vertex's uv
    la = np.asarray(lifted.resize((512, 512)), np.float32) / 255.0

    meshes = []

    def add(name, idx, t, colour=False):
        p = V[idx].astype(np.float32)
        n = NN[idx].astype(np.float32)
        uv = UV[idx].astype(np.float32)
        bi = top[idx].astype(np.float32)
        bw = tw[idx].astype(np.float32)
        attrs = {"POSITION": p, "NORMAL": n, "TEXCOORD_0": uv, "_BI01": bi[:, :2].copy(), "_BI23": bi[:, 2:].copy(),
                 "_BW01": bw[:, :2].copy(), "_BW23": bw[:, 2:].copy()}
        if colour:
            px = np.clip((uv[:, 0] % 1) * 511, 0, 511).astype(int)
            py = np.clip((uv[:, 1] % 1) * 511, 0, 511).astype(int)
            c = np.c_[la[py, px], np.ones(len(idx))]
            attrs["COLOR_0"] = (np.clip(c, 0, 1) * 65535 + 0.5).astype(np.uint16)
        meshes.append((name, attrs, t.astype(np.uint32)))

    add("hi_kong", *tiers["hi"])
    add("lo_kong", *tiers["lo"])
    add("min_all", *tiers["min"], colour=True)
    # The rig's other parts: his are in his one mesh. A degenerate triangle at the head draws nothing.
    dead = np.array([int(np.argmax(acc16[:, BI["head"]]))] * 3)
    for name in ("hi_head", "hi_gear", "hi_shoes", "hi_eyes", "lo_gear", "lo_eyes"):
        add(name, dead, np.array([[0, 1, 2]]))

    write_glb(os.path.join(OUT, "kong.glb"), meshes)

    # ------------------------------------------------------------- the rig table
    f = lambda v: ", ".join(f"{x:.4f}" for x in v)
    lines = [
        "// GENERATED by tools/actors/triple-t-fit.py from tools/actors/src/triple-t.glb: do not edit.",
        "// Triple T's rest on the kong rig (kong-rig.ts BONES' shape): each bone's pivot over its parent's, metres, and",
        "// the face's seats in the head's / wrist's frame (kong-asset.ts FACE's shape).",
        "export const TT_BONES = {",
    ]
    for b in BONES:
        lines.append(f'  {b}: {{ parent: {json.dumps(PARENT[b])}, offset: [{f(offsets[b])}] }},')
    lines += [
        "} as const;",
        f"export const TT_FACE = {{ eyeMid: [{f(eye_mid)}], fist: [{f(fist)}], hat: [{f(hat)}] }} as const;",
        f"/** his height, metres (the rest's top of head over its feet) */",
        f"export const TT_HEIGHT_M = {float(V[:, 1].max()):.4f};",
        "",
    ]
    open(GEN, "w").write("\n".join(lines))
    json.dump({
        "source": "Triple T, the Gates / oneshot player model (commissioned from Meshy on a paid plan and owned outright by the "
                  "Elo Pros operator), refit onto the kong rig by tools/actors/triple-t-fit.py from tools/actors/src/triple-t.glb",
        "licence": "All rights reserved by the Elo Pros operator; not covered by the MIT licence (CREDITS.md). Play and "
                   "modify the game with it; ask before reusing it anywhere else.",
    }, open(os.path.join(OUT, "provenance.json"), "w"), indent=2)
    print(f"tiers: hi {len(tiers['hi'][1])} / lo {len(tiers['lo'][1])} / min {len(tiers['min'][1])} tris; "
          f"height {V[:, 1].max():.3f} m; fist {fist.round(3)}; eyes {eye_mid.round(3)}")


def write_glb(path, meshes):
    """Plain glTF 2.0 binary: one node per mesh, no materials (kong-asset.ts makes its own)."""
    bin_ = bytearray()
    accessors, views, gmeshes, nodes = [], [], [], []

    def put(arr, target=None):
        arr = np.ascontiguousarray(arr)
        while len(bin_) % 4:
            bin_.append(0)
        off = len(bin_)
        bin_.extend(arr.tobytes())
        v = {"buffer": 0, "byteOffset": off, "byteLength": arr.nbytes}
        if target:
            v["target"] = target
        views.append(v)
        comp = {np.dtype(np.float32): 5126, np.dtype(np.uint32): 5125, np.dtype(np.uint16): 5123}[arr.dtype]
        typ = {1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4"}[arr.shape[1] if arr.ndim > 1 else 1]
        a = {"bufferView": len(views) - 1, "componentType": comp, "count": int(arr.shape[0]), "type": typ}
        if arr.dtype == np.uint16:
            a["normalized"] = True
        if arr.ndim > 1 and arr.dtype == np.float32 and arr.shape[1] == 3:
            a["min"] = arr.min(0).tolist()
            a["max"] = arr.max(0).tolist()
        accessors.append(a)
        return len(accessors) - 1

    for name, attrs, tris in meshes:
        at = {k: put(v, 34962) for k, v in attrs.items()}
        ix = put(tris.reshape(-1), 34963)
        gmeshes.append({"name": name, "primitives": [{"attributes": at, "indices": ix}]})
        nodes.append({"name": name, "mesh": len(gmeshes) - 1})
    while len(bin_) % 4:
        bin_.append(0)
    doc = {"asset": {"version": "2.0", "generator": "tools/actors/triple-t-fit.py"}, "scene": 0,
           "scenes": [{"name": "Scene", "nodes": list(range(len(nodes)))}], "nodes": nodes, "meshes": gmeshes,
           "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(bin_)}]}
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        fh.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        fh.write(struct.pack("<II", len(bin_), 0x004E4942) + bin_)


if __name__ == "__main__":
    main()
