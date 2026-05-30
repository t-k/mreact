// DialogDemo.compat.tsx — Radix UI dialog as a React-compat island.
//
// Radix leans on portals, refs, context, and a focus trap. The router aliases
// `react` / `react-dom` to @reckona/mreact-compat, so `react-dom`'s createPortal
// and Radix's focus management run unmodified. This `.compat.tsx` file is a
// client boundary: the dialog hydrates on the client and mounts its content into
// a portal.
import * as Dialog from "@radix-ui/react-dialog";

export default function DialogDemo() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="btn" data-testid="open-dialog">
        Open dialog
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="dialog-overlay"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)" }}
        />
        <Dialog.Content
          data-testid="dialog-content"
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "white",
            padding: "1.5rem",
            borderRadius: "0.5rem",
            minWidth: "320px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          }}
        >
          <Dialog.Title style={{ margin: "0 0 0.5rem" }}>Radix dialog</Dialog.Title>
          <Dialog.Description style={{ margin: "0 0 0.75rem", color: "#4b5563" }}>
            This modal is rendered through a portal with a focus trap by
            @radix-ui/react-dialog. Press Escape or click Close to dismiss.
          </Dialog.Description>
          <input
            data-testid="dialog-input"
            placeholder="Focus is trapped inside"
            style={{ width: "100%", padding: "0.4rem", margin: "0 0 0.75rem", boxSizing: "border-box" }}
          />
          <Dialog.Close className="btn" data-testid="close-dialog">
            Close
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
