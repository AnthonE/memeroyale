// AudioParam helpers shared by the engine and the ambience.

/** setTargetAtTime only when the value really moved (relative `eps`, or absolute units — metres — for positions): a
 * frame loop at 240 fps would otherwise queue thousands of automation events per second */
export function setT(p: AudioParam, v: number, t: number, tc: number, eps = 0.003, abs = false) {
  const q = p as AudioParam & { __v?: number };
  if (q.__v !== undefined && Math.abs(v - q.__v) <= (abs ? eps : eps * Math.max(1e-4, Math.abs(q.__v)))) return;
  q.__v = v;
  p.setTargetAtTime(v, t, tc);
}
