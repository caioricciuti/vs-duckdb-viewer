import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const vscodeTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--vscode-input-background)",
      color: "var(--vscode-input-foreground)",
      fontSize: "var(--vscode-editor-font-size, 13px)",
      borderRadius: "4px",
      border: "1px solid var(--vscode-input-border, transparent)",
    },
    "&.cm-focused": {
      outline: "none",
      borderColor: "var(--vscode-focusBorder)",
    },
    ".cm-content": {
      fontFamily:
        'var(--vscode-editor-font-family, "Menlo", "Monaco", "Courier New", monospace)',
      padding: "6px 0",
      caretColor: "var(--vscode-editorCursor-foreground)",
    },
    ".cm-line": {
      padding: "0 8px",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--vscode-editorCursor-foreground)",
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
      {
        background: "var(--vscode-editor-selectionBackground) !important",
      },
    ".cm-activeLine": {
      backgroundColor:
        "var(--vscode-editor-lineHighlightBackground, transparent)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--vscode-input-background)",
      color: "var(--vscode-editorLineNumber-foreground)",
      border: "none",
    },
    ".cm-tooltip": {
      backgroundColor:
        "var(--vscode-editorSuggestWidget-background, var(--vscode-editor-background))",
      color:
        "var(--vscode-editorSuggestWidget-foreground, var(--vscode-editor-foreground))",
      border:
        "1px solid var(--vscode-editorSuggestWidget-border, var(--vscode-panel-border))",
      borderRadius: "4px",
    },
    ".cm-tooltip.cm-tooltip-autocomplete": {
      "& > ul > li": {
        padding: "2px 8px",
        fontSize: "12px",
      },
      "& > ul > li[aria-selected]": {
        backgroundColor:
          "var(--vscode-editorSuggestWidget-selectedBackground, var(--vscode-list-activeSelectionBackground))",
        color:
          "var(--vscode-editorSuggestWidget-selectedForeground, var(--vscode-list-activeSelectionForeground))",
      },
    },
    ".cm-completionIcon": {
      opacity: "0.7",
      width: "1em",
    },
    ".cm-panels": {
      backgroundColor: "var(--vscode-input-background)",
      color: "var(--vscode-input-foreground)",
    },
    ".cm-panel.cm-search": {
      padding: "4px 8px",
    },
    ".cm-searchMatch": {
      backgroundColor:
        "var(--vscode-editor-findMatchHighlightBackground, rgba(255, 200, 0, 0.3))",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor:
        "var(--vscode-editor-findMatchBackground, rgba(255, 200, 0, 0.5))",
    },
    ".cm-scroller": {
      overflow: "auto",
      maxHeight: "160px",
    },
  },
  { dark: false }
);

export const vscodeHighlight = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: tags.keyword,
      color: "var(--vscode-debugTokenExpression-name, #569cd6)",
      fontWeight: "600",
    },
    {
      tag: tags.string,
      color: "var(--vscode-debugTokenExpression-string, #ce9178)",
    },
    {
      tag: tags.number,
      color: "var(--vscode-debugTokenExpression-number, #b5cea8)",
    },
    {
      tag: tags.bool,
      color: "var(--vscode-debugTokenExpression-boolean, #569cd6)",
    },
    { tag: tags.null, color: "var(--vscode-debugTokenExpression-name, #569cd6)" },
    {
      tag: tags.comment,
      color: "var(--vscode-editorLineNumber-foreground, #6a9955)",
      fontStyle: "italic",
    },
    {
      tag: tags.operator,
      color: "var(--vscode-editor-foreground)",
    },
    {
      tag: tags.function(tags.variableName),
      color: "var(--vscode-symbolIcon-functionForeground, #dcdcaa)",
    },
    {
      tag: tags.typeName,
      color: "var(--vscode-symbolIcon-classForeground, #4ec9b0)",
    },
    {
      tag: tags.propertyName,
      color: "var(--vscode-symbolIcon-propertyForeground, #9cdcfe)",
    },
    {
      tag: tags.variableName,
      color: "var(--vscode-symbolIcon-variableForeground, #9cdcfe)",
    },
    {
      tag: tags.paren,
      color: "var(--vscode-editorBracketMatch-border, var(--vscode-editor-foreground))",
    },
  ])
);
