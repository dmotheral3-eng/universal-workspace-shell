/**
 * Ambient types for @centripetal/semester-kit.
 *
 * The kit ships JSX source with no build step and no `types` field, so TS has
 * nothing to read. These declarations were written by READING the kit's source
 * at the pinned commit e25acaf85747c92ebaf675047607fb4bb290f69d — they describe
 * the props Shell.jsx actually destructures, in its order, and are not a guess.
 *
 * Keep this file in step with the pin. If the pin moves, re-read Shell.jsx.
 */

declare module "@centripetal/semester-kit/Shell" {
  import type { ComponentType, ReactNode } from "react";

  /** The kit's two themes. Keys of THEMES in src/tokens.js. */
  export type SemesterMode = "command" | "study";

  export interface SemesterNavItem {
    /** Matches `screen`; the kit compares `screen === n.key`. */
    key: string;
    label: string;
    /** Rendered by the kit as `<n.icon size={17} />` — lucide-shaped. */
    icon: ComponentType<{ size?: number | string; color?: string }>;
  }

  /** The active theme object the kit hands to a render-prop child. */
  export type SemesterTheme = Record<string, string>;

  export interface ShellProps {
    mode?: SemesterMode;
    onToggleMode?: () => void;
    nav?: SemesterNavItem[];
    screen?: string;
    onScreen?: (key: string) => void;
    /** key -> the big mono screen title. */
    titles?: Record<string, string>;
    brandIcon?: ComponentType<{ size?: number | string; color?: string }>;
    wordmark?: string;
    headerRight?: ReactNode;
    footer?: ReactNode;
    children?: ReactNode | ((T: SemesterTheme) => ReactNode);
  }

  const Shell: ComponentType<ShellProps>;
  export default Shell;
}

declare module "@centripetal/semester-kit/tokens" {
  /** The hashed theme block — provenance-tracked, block_md5 071530ffe93af6471edbeca3193ea0cb. */
  export const THEMES: Record<"command" | "study", Record<string, string>>;
  export const MONO: string;
  export const BODY: string;
  export const THEME_PROVENANCE: {
    repo: string; path: string; ref: string; blob_sha: string;
    hashed_lines: string; block_md5: string; block_bytes: number; lifted_at: string;
  };
  export default THEMES;
}
