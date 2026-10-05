// CodeMirror 6 setup for Text Editor: basicSetup (line numbers, search/replace panel, history...) plus a
// language picked from the file extension and a theme compartment that follows Light/Dark at runtime.
import { basicSetup } from "codemirror";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { openSearchPanel } from "@codemirror/search";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { extension } from "../../os/fs";

const LANGUAGES: Record<string, [string, () => Extension]> = {
  js: ["JavaScript", () => javascript()],
  jsx: ["JavaScript", () => javascript({ jsx: true })],
  ts: ["TypeScript", () => javascript({ typescript: true })],
  tsx: ["TypeScript", () => javascript({ typescript: true, jsx: true })],
  md: ["Markdown", () => markdown()],
  html: ["HTML", () => html()],
  css: ["CSS", () => css()],
  json: ["JSON", () => json()],
  py: ["Python", () => python()],
};

export const languageName = (path: string | null) => (path && LANGUAGES[extension(path)]?.[0]) || "Plain Text";

export const themeSlot = new Compartment();
export const themeFor = (dark: boolean): Extension =>
  dark
    ? oneDark
    : EditorView.theme({
        "&": { backgroundColor: "var(--view)" },
        ".cm-gutters": { backgroundColor: "var(--window)", border: "none" },
      });

const base = EditorView.theme({
  "&": { height: "100%", fontSize: "14px" },
  ".cm-scroller": { fontFamily: '"Ubuntu Mono", monospace', lineHeight: "1.5" },
});

type Hooks = { onUpdate: (view: EditorView) => void; commands: Record<string, () => boolean> };

export function createEditor(
  parent: HTMLElement,
  text: string,
  path: string | null,
  dark: boolean,
  hooks: Hooks,
): EditorView {
  const language = path ? LANGUAGES[extension(path)]?.[1]() : undefined;
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        keymap.of([
          ...Object.entries(hooks.commands).map(([key, run]) => ({ key, run, preventDefault: true })),
          { key: "Mod-h", run: openSearchPanel },
        ]),
        basicSetup,
        base,
        themeSlot.of(themeFor(dark)),
        language ?? [],
        EditorView.updateListener.of(
          (update) => (update.docChanged || update.selectionSet) && hooks.onUpdate(update.view),
        ),
      ],
    }),
  });
}
