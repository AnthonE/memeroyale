// The announcer's lines (public/assets/audio/kr/vo/, made by tools/audio/vo.mjs): each is the sound `vo:<line>`
// (audio/bank.ts) and is spoken through audio/announcer.ts. Its own module so the bank can list them without the queue.
export const VO_LINES = [
  "double_kill", "triple_kill", "overkill", "rampage", "killing_spree", "unstoppable", "game_over_you_win", "game_over_you_lose",
  "ratioed", "main_character", "skill_issue", "touch_grass", "clout_acquired", "brrrt", "headshot", "long_shot", "payback",
  "drop_in_chat", "top_ten", "top_three", "final_circle", "feed_closing", "logged_off",
] as const;
export type VoLine = typeof VO_LINES[number];
