// Vertex-shader source recorder + "merge-safe" analysis for the far-POI merge (engine/hlod.ts).
// Merging meshes bakes their transforms into world-space vertices and draws them with an identity model matrix. That is
// exact for any shader that only uses the object-space position / normal through three's standard chunks (and for
// world-space tricks such as `modelMatrix * vec4( transformed, 1.0 )` — the atmos patch, the POI kits' triplanar
// mapping). It is NOT exact for custom vertex code that reads `position` directly (object-space noise, a hero-prop
// bake), displaces `transformed` / `objectNormal` (flags, wind, bobbing), or reads a per-object origin
// (`modelMatrix[3]` seeds). Those materials never merge.
// Recording: the context's shaderSource / attachShader are wrapped (instance methods, installed before the first compile)
// and the VERTEX source is kept per GL program until release() (after the proxies are built).
import * as THREE from "three";

let vsOfShader: WeakMap<WebGLShader, string> | null = null;
let vsOfProgram: WeakMap<WebGLProgram, string> | null = null;
let vertexShaders: WeakSet<WebGLShader> | null = null;
const verdicts = new WeakMap<WebGLProgram, boolean>();

export function installShaderRecorder(gl: WebGL2RenderingContext) {
  if (vsOfShader) return;
  vsOfShader = new WeakMap(); vsOfProgram = new WeakMap(); vertexShaders = new WeakSet();
  const create = gl.createShader.bind(gl), source = gl.shaderSource.bind(gl), attach = gl.attachShader.bind(gl);
  gl.createShader = (type: number) => { const s = create(type); if (s && type === gl.VERTEX_SHADER) vertexShaders?.add(s); return s; };
  gl.shaderSource = (s: WebGLShader, src: string) => { if (vertexShaders?.has(s)) vsOfShader?.set(s, src); source(s, src); };
  gl.attachShader = (p: WebGLProgram, s: WebGLShader) => { const src = vsOfShader?.get(s); if (src !== undefined) vsOfProgram?.set(p, src); attach(p, s); };
}

/** stop recording (the context keeps the thin wrappers; nothing is stored any more) */
export function releaseShaderRecorder() { vsOfShader = null; vsOfProgram = null; vertexShaders = null; }

let stripChunks: string[] | null = null;
function chunks(): string[] {
  if (stripChunks) return stripChunks;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  stripChunks = Object.keys(C).filter((k) => /_vertex$/.test(k) && typeof C[k] === "string" && C[k].length > 20).map((k) => C[k])
    // longest first: a chunk that contains another is removed whole
    .sort((a, b) => b.length - a.length);
  return stripChunks;
}

/** true when the vertex shader only uses object space through three's standard chunks or world-space products */
export function vertexMergeSafe(src: string): boolean {
  let s = src;
  for (const c of chunks()) if (s.includes(c)) s = s.split(c).join("\n");
  s = s.replace(/^\s*(in|attribute)\s+vec3\s+position\s*;/gm, "")
    .replace(/modelMatrix\s*\*\s*vec4\s*\(\s*(position|transformed)\s*(\.xyz)?\s*,\s*1\.0\s*\)/g, "MMW")
    .replace(/\/\/[^\n]*/g, "");
  if (/\bposition\b/.test(s)) return false;
  if (/\b(transformed|objectNormal|objectTangent)\s*(\.[xyzw]{1,4})?\s*([+\-*/]?=)(?!=)/.test(s)) return false;
  if (/modelMatrix\s*\[/.test(s) || /modelViewMatrix\s*\[/.test(s)) return false;
  return true;
}

/** the verdict for a material's compiled program (false when unknown: never compiled, or compiled before recording) */
export function programMergeSafe(renderer: THREE.WebGLRenderer, m: THREE.Material): boolean {
  const props = renderer.properties as unknown as { get(o: object): { currentProgram?: { program?: WebGLProgram } } };
  const gp = props.get(m).currentProgram?.program;
  if (!gp) return false;
  const v = verdicts.get(gp);
  if (v !== undefined) return v;
  const src = vsOfProgram?.get(gp);
  if (src === undefined) return false;
  const ok = vertexMergeSafe(src);
  verdicts.set(gp, ok);
  return ok;
}
