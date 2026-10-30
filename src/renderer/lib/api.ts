import type { WidgetApi } from '../../shared/types';

declare global {
  interface Window {
    /** Exposed by src/main/preload.ts. */
    widget: WidgetApi;
  }
}

/** Everything the UI can ask the main process to do. See `WidgetApi` in src/shared/types.ts. */
export const api: WidgetApi = window.widget;
