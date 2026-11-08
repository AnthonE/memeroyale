#!/usr/bin/env python3
"""The guns, the rocket and the frag from oneshot (crates/client/assets/models/<name>.glb, owned: Meshy, paid plan) into
public/assets/weapons/<id>.glb, made lighter so the guns fit the title's memory budget: only the base colour (to BASE
px) and normal (to OTHER px) maps are kept, re-encoded at QUALITY; metal and roughness become constants.
Geometry and materials are copied as they are; client/src/weapons/guns/glb.ts fits each model with oneshot's own
numbers (look/guns.rs).
  python3 tools/models/import_oneshot.py [ONESHOT_DIR]      (default ../oneshot)
"""
import io, json, os, struct, sys
from PIL import Image

BASE, OTHER, QUALITY = 1024, 512, 86
# our id -> oneshot's file
MAP = {"pistol": "magnum", "smg": "smg", "ar": "ar", "shotgun": "shotgun", "sniper": "sniper",
       "rocket": "rocket-launcher", "rocket-round": "rocket", "frag": "frag"}

def read(path):
    b = open(path, "rb").read()
    jl = struct.unpack_from("<I", b, 12)[0]
    j = json.loads(b[20:20 + jl])
    bl = struct.unpack_from("<I", b, 20 + jl)[0]
    return j, b[28 + jl:28 + jl + bl]

def shrink(data, size):
    im = Image.open(io.BytesIO(data))
    if max(im.size) <= size: return data   # already small enough: the original bytes, not a second lossy pass
    im = im.resize((size, size) if im.size[0] == im.size[1] else (size, round(size * im.size[1] / im.size[0])), Image.LANCZOS)
    out = io.BytesIO(); im.convert("RGB").save(out, "JPEG", quality=QUALITY, optimize=True)
    return out.getvalue()

def strip_maps(j):
    """Only the base colour and normal maps stay: the glow (emissive) and metal/roughness maps cost a texture each on
    every gun for little at this size, so the material takes constant values instead. Unused images go too."""
    for m in j["materials"]:
        m.pop("emissiveTexture", None); m.pop("extensions", None); m["emissiveFactor"] = [0, 0, 0]
        pbr = m.setdefault("pbrMetallicRoughness", {})
        pbr.pop("metallicRoughnessTexture", None); pbr["metallicFactor"] = 0.35; pbr["roughnessFactor"] = 0.55
    j.pop("extensionsUsed", None)
    used_tex = sorted({m["pbrMetallicRoughness"]["baseColorTexture"]["index"] for m in j["materials"] if "baseColorTexture" in m["pbrMetallicRoughness"]}
                      | {m["normalTexture"]["index"] for m in j["materials"] if "normalTexture" in m})
    tex_map = {old: new for new, old in enumerate(used_tex)}
    j["textures"] = [j["textures"][i] for i in used_tex]
    used_img = sorted({t["source"] for t in j["textures"]})
    img_map = {old: new for new, old in enumerate(used_img)}
    for t in j["textures"]: t["source"] = img_map[t["source"]]
    dropped_views = {im["bufferView"] for i, im in enumerate(j["images"]) if i not in img_map}
    j["images"] = [j["images"][i] for i in used_img]
    for m in j["materials"]:
        pbr = m["pbrMetallicRoughness"]
        if "baseColorTexture" in pbr: pbr["baseColorTexture"]["index"] = tex_map[pbr["baseColorTexture"]["index"]]
        if "normalTexture" in m: m["normalTexture"]["index"] = tex_map[m["normalTexture"]["index"]]
    # drop the bufferViews only the removed images used, and renumber every reference to the rest
    keep = [k for k in range(len(j["bufferViews"])) if k not in dropped_views]
    view_map = {old: new for new, old in enumerate(keep)}
    j["bufferViews"] = [j["bufferViews"][k] for k in keep]
    for a in j.get("accessors", []):
        if "bufferView" in a: a["bufferView"] = view_map[a["bufferView"]]
    for im in j["images"]: im["bufferView"] = view_map[im["bufferView"]]
    return view_map

def convert(src, dst):
    j, bin_ = read(src)
    old_views = [dict(v) for v in j["bufferViews"]]
    view_map = strip_maps(j)
    back = {new: old for old, new in view_map.items()}
    base = {m["pbrMetallicRoughness"].get("baseColorTexture", {}).get("index") for m in j["materials"]}
    img_of_tex = {i: t["source"] for i, t in enumerate(j["textures"])}
    base_imgs = {img_of_tex[t] for t in base if t is not None}
    new = {}
    for i, im in enumerate(j["images"]):
        bv = old_views[back[im["bufferView"]]]
        data = bin_[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]
        new[im["bufferView"]] = shrink(data, BASE if i in base_imgs else OTHER)
        im["mimeType"] = "image/jpeg"
    out = bytearray()
    for k, bv in enumerate(j["bufferViews"]):
        ov = old_views[back[k]]
        data = new.get(k) or bin_[ov.get("byteOffset", 0):ov.get("byteOffset", 0) + ov["byteLength"]]
        while len(out) % 4: out.append(0)
        bv["byteOffset"] = len(out); bv["byteLength"] = len(data); out += data
    while len(out) % 4: out.append(0)
    j["buffers"] = [{"byteLength": len(out)}]
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(out), 0x004E4942) + bytes(out)
    open(dst, "wb").write(glb)
    return os.path.getsize(src), len(glb)

if __name__ == "__main__":
    one = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "../../../oneshot")
    out = os.path.join(os.path.dirname(__file__), "../../public/assets/weapons")
    os.makedirs(out, exist_ok=True)
    for ours, theirs in MAP.items():
        a, b = convert(os.path.join(one, "crates/client/assets/models", theirs + ".glb"), os.path.join(out, ours + ".glb"))
        print(f"{ours:13s} <- {theirs}.glb  {a // 1024} KB -> {b // 1024} KB")
