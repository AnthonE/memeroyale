// Loading screen keycaps (index.html #kr-loading). The screen paints before any module loads, so its inline script
// reads the saved bindings itself (kr-preferences-v1) to fill the rotating tip and the Learn controls card. Once main.ts
// runs, this hands it the game's own labels (settings/labels.ts bindingText: controller glyphs included) and repaints
// it on a rebind or a device switch, until the screen is gone.
import { bindingText, onLabelsChange } from "../settings/labels";
import { DEFAULT_BINDS, type BindAction } from "../settings/bindings";

interface LoadingHook {
  /** the inline script's copy of DEFAULT_BINDS (checked for drift in dev) */
  defaults?: Record<string, string[]>;
  /** every key of an action, as the game labels it */
  keys: ((action: string) => string[]) | null;
  /** repaint the tip (and the controls card when open) */
  relabel?: () => void;
  /** called when the loading screen is removed */
  detach: (() => void) | null;
}

export function attachLoadingKeys(): void {
  const hook = (window as unknown as { __krLoading?: LoadingHook }).__krLoading;
  if (!hook) return;   // the screen is already gone (or this page never had one)
  if (import.meta.env.DEV && hook.defaults && JSON.stringify(hook.defaults) !== JSON.stringify(DEFAULT_BINDS))
    console.warn("[loading] index.html's DEFAULT_BINDS copy differs from settings/bindings.ts: update the inline copy");
  hook.keys = (action) => bindingText(action as BindAction).split(" / ");
  hook.detach = onLabelsChange(() => hook.relabel?.());
}
