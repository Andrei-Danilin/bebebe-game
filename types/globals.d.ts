// SPEC-025 AC 9: types for `npm run typecheck` only (tsc --noEmit --checkJs; nothing here ships or runs).
// The page's own globals: the debug object and the flags the tests set before the game starts (docs/architecture.md
// "window.__bb"), the inline script's boot hooks, and the vendor-prefixed browser APIs the client feature-tests.
interface Window {
  __bb: any;
  __bbReady?: boolean;
  __bbBoot?: any;
  __bbSeed?: number;
  __bbProbeMs?: number;   // SPEC-040: the tests give the start probe's answer (ms per frame)
  __bbQuality?: string;   // SPEC-040: the tests pin a quality tier (high / medium / low / auto)
  __bbStrictRng?: boolean;
  __bbNoIntro?: boolean;
  __bbNoTutorial?: boolean;
  __bbNoTips?: boolean;
  __bbSaveBackend?: any;
  webkitAudioContext?: typeof AudioContext;
}
interface Navigator {
  standalone?: boolean;
}
interface Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface Performance {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };   // Chrome only (__bb.perf)
}
