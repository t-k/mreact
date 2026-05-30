// LexicalEditor.compat.tsx — Meta's Lexical rich-text editor as a React-compat island.
//
// Lexical is a real React library. The router aliases `react`, `react-dom`, and
// `react/jsx-runtime` to @reckona/mreact-compat, so Lexical's hooks, refs,
// contentEditable editor root, node system, and commands run unmodified. This
// `.compat.tsx` file is a client boundary: the server emits a placeholder and
// the editor mounts after hydration.
import { useEffect, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createHeadingNode, $isHeadingNode, HeadingNode, QuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type EditorState,
} from "lexical";

const LINK_URL = "https://mreact.dev";

const buttonStyle = {
  padding: "0.3rem 0.6rem",
  fontSize: "0.85rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.25rem",
  background: "white",
  cursor: "pointer",
};
const activeStyle = { ...buttonStyle, background: "#1d4ed8", color: "white", borderColor: "#1d4ed8" };
const dividerStyle = { width: "1px", alignSelf: "stretch", background: "#e5e7eb", margin: "0 0.15rem" };

interface ToolbarState {
  bold: boolean;
  italic: boolean;
  block: string;
  isLink: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

function Toolbar() {
  const [editor] = useLexicalComposerContext();
  const [toolbar, setToolbar] = useState<ToolbarState>({
    bold: false,
    italic: false,
    block: "paragraph",
    isLink: false,
    canUndo: false,
    canRedo: false,
  });

  useEffect(() => {
    function readSelection() {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === "root" ? anchorNode : anchorNode.getTopLevelElementOrThrow();

      let block = "paragraph";
      if ($isHeadingNode(element)) {
        block = element.getTag();
      } else if ($isListNode(element)) {
        block = element.getListType();
      }

      const linkParent = $findMatchingParent(anchorNode, $isLinkNode);
      setToolbar((prev) => ({
        ...prev,
        bold: selection.hasFormat("bold"),
        italic: selection.hasFormat("italic"),
        block,
        isLink: $isLinkNode(anchorNode) || linkParent !== null,
      }));
    }

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(readSelection);
      }),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload: boolean) => {
          setToolbar((prev) => ({ ...prev, canUndo: payload }));
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload: boolean) => {
          setToolbar((prev) => ({ ...prev, canRedo: payload }));
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  function setBlock(type: "paragraph" | "h1" | "h2") {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () =>
          type === "paragraph" ? $createParagraphNode() : $createHeadingNode(type),
        );
      }
    });
  }

  return (
    <div
      className="editor-toolbar"
      style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}
    >
      <button
        type="button"
        style={buttonStyle}
        data-testid="undo"
        disabled={!toolbar.canUndo}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
      >
        Undo
      </button>
      <button
        type="button"
        style={buttonStyle}
        data-testid="redo"
        disabled={!toolbar.canRedo}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
      >
        Redo
      </button>
      <span style={dividerStyle} />
      <button
        type="button"
        style={toolbar.block === "paragraph" ? activeStyle : buttonStyle}
        aria-pressed={toolbar.block === "paragraph"}
        data-testid="paragraph"
        onClick={() => setBlock("paragraph")}
      >
        Normal
      </button>
      <button
        type="button"
        style={toolbar.block === "h1" ? activeStyle : buttonStyle}
        aria-pressed={toolbar.block === "h1"}
        data-testid="h1"
        onClick={() => setBlock("h1")}
      >
        H1
      </button>
      <button
        type="button"
        style={toolbar.block === "h2" ? activeStyle : buttonStyle}
        aria-pressed={toolbar.block === "h2"}
        data-testid="h2"
        onClick={() => setBlock("h2")}
      >
        H2
      </button>
      <span style={dividerStyle} />
      <button
        type="button"
        style={toolbar.bold ? activeStyle : buttonStyle}
        aria-pressed={toolbar.bold}
        data-testid="bold"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        Bold
      </button>
      <button
        type="button"
        style={toolbar.italic ? activeStyle : buttonStyle}
        aria-pressed={toolbar.italic}
        data-testid="italic"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        Italic
      </button>
      <span style={dividerStyle} />
      <button
        type="button"
        style={toolbar.block === "bullet" ? activeStyle : buttonStyle}
        aria-pressed={toolbar.block === "bullet"}
        data-testid="bullet"
        onClick={() =>
          editor.dispatchCommand(
            toolbar.block === "bullet" ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
            undefined,
          )
        }
      >
        Bullet
      </button>
      <button
        type="button"
        style={toolbar.block === "number" ? activeStyle : buttonStyle}
        aria-pressed={toolbar.block === "number"}
        data-testid="number"
        onClick={() =>
          editor.dispatchCommand(
            toolbar.block === "number" ? REMOVE_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
            undefined,
          )
        }
      >
        Numbered
      </button>
      <span style={dividerStyle} />
      <button
        type="button"
        style={toolbar.isLink ? activeStyle : buttonStyle}
        aria-pressed={toolbar.isLink}
        data-testid="link"
        onClick={() => editor.dispatchCommand(TOGGLE_LINK_COMMAND, toolbar.isLink ? null : LINK_URL)}
      >
        Link
      </button>
    </div>
  );
}

export default function LexicalEditor() {
  const [text, setText] = useState("");

  const initialConfig = {
    namespace: "mreact-lexical",
    theme: {},
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
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
          minHeight: "140px",
          position: "relative",
          background: "white",
        }}
      >
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="editor-input"
              style={{ outline: "none", minHeight: "120px" }}
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
        <ListPlugin />
        <LinkPlugin />
        <OnChangePlugin onChange={handleChange} />
      </div>
      <p className="muted" data-testid="charcount" style={{ color: "#6b7280", fontSize: "0.85rem" }}>
        {text.length} characters
      </p>
    </LexicalComposer>
  );
}
