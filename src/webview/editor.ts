import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { vscodeTheme, vscodeHighlight } from "./codemirror-theme";
import { duckdbCompletion, updateSchema } from "./sql-completion";
import type { SchemaTable } from "../shared/types";

export interface EditorController {
  getValue(): string;
  setValue(text: string): void;
  focus(): void;
  updateSchema(tables: SchemaTable[]): void;
  insertAtCursor(text: string): void;
  destroy(): void;
}

export function createEditor(
  parent: HTMLElement,
  options: {
    onRun: () => void;
    onExplain: () => void;
    placeholder?: string;
  }
): EditorController {
  const runKeymap = keymap.of([
    {
      key: "Mod-Enter",
      run: () => {
        options.onRun();
        return true;
      },
    },
    {
      key: "Mod-Shift-Enter",
      run: () => {
        options.onExplain();
        return true;
      },
    },
  ]);

  const state = EditorState.create({
    doc: "",
    extensions: [
      runKeymap,
      vscodeTheme,
      vscodeHighlight,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      history(),
      closeBrackets(),
      bracketMatching(),
      indentOnInput(),
      highlightSelectionMatches(),
      autocompletion({
        override: [duckdbCompletion],
        activateOnTyping: true,
        maxRenderedOptions: 30,
      }),
      sql({ dialect: PostgreSQL, upperCaseKeywords: true }),
      keymap.of([
        indentWithTab,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...completionKeymap,
        ...searchKeymap,
      ]),
      placeholder(options.placeholder ?? ""),
      EditorView.lineWrapping,
    ],
  });

  const view = new EditorView({ state, parent });

  return {
    getValue(): string {
      return view.state.doc.toString();
    },
    setValue(text: string): void {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    },
    focus(): void {
      view.focus();
    },
    updateSchema(tables: SchemaTable[]): void {
      updateSchema(tables);
    },
    insertAtCursor(text: string): void {
      const cursor = view.state.selection.main.head;
      view.dispatch({ changes: { from: cursor, insert: text } });
      view.focus();
    },
    destroy(): void {
      view.destroy();
    },
  };
}
