// LexicalEditor.compat.tsx — Meta's Lexical rich-text editor as a React-compat island.
//
// Lexical is a real React library. The router aliases `react`, `react-dom`, and
// `react/jsx-runtime` to @reckona/mreact-compat, so Lexical's hooks, refs, and
// contentEditable editor root run unmodified. This `.compat.tsx` file is a
// client boundary: the server emits a placeholder and the editor mounts after
// hydration.
import { useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { $getRoot, FORMAT_TEXT_COMMAND, type EditorState } from "lexical";

function Toolbar() {
  const [editor] = useLexicalComposerContext();
  return (
    <div className="editor-toolbar" style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
      <button
        type="button"
        className="btn"
        data-testid="bold"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        Bold
      </button>
      <button
        type="button"
        className="btn"
        data-testid="italic"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        Italic
      </button>
    </div>
  );
}

export default function LexicalEditor() {
  const [text, setText] = useState("");

  const initialConfig = {
    namespace: "mreact-lexical",
    theme: {},
    nodes: [HeadingNode, QuoteNode],
    onError(error: Error) {
      throw error;
    },
  };

  function handleChange(editorState: EditorState) {
    editorState.read(() => {
      setText($getRoot().getTextContent());
    });
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <Toolbar />
      <div
        className="editor-shell"
        style={{
          border: "1px solid #d1d5db",
          borderRadius: "0.25rem",
          padding: "0.5rem",
          minHeight: "120px",
          position: "relative",
          background: "white",
        }}
      >
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="editor-input"
              style={{ outline: "none", minHeight: "100px" }}
            />
          }
          placeholder={
            <div
              className="editor-placeholder"
              style={{
                position: "absolute",
                top: "0.5rem",
                left: "0.5rem",
                color: "#9ca3af",
                pointerEvents: "none",
              }}
            >
              Type something rich…
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <OnChangePlugin onChange={handleChange} />
      </div>
      <p className="muted" data-testid="charcount" style={{ color: "#6b7280", fontSize: "0.85rem" }}>
        {text.length} characters
      </p>
    </LexicalComposer>
  );
}
