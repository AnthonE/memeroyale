// A station's cue sheet: what is on air from when (s into the broadcast), for the station banner's "now playing".
export interface Cue { t: number; kind: "song" | "dj" | "ad"; title: string; by: string }
