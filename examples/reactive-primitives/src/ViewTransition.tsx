// View Transitions — cell updates inside document.startViewTransition().
// Demonstrates: cell.set() schedules its DOM flush as a microtask, which the
// browser drains before capturing the new-state snapshot, so the named
// ::view-transition-new(vt-detail) image picks up the freshly inserted panel
// without needing flushSync.
// See README.md > Tour.
import { cell } from "@reckona/mreact-reactive-core";

interface Photo {
  id: string;
  title: string;
  tone: string;
}

const photos: Photo[] = [
  { id: "a", title: "Photo A", tone: "#fde68a" },
  { id: "b", title: "Photo B", tone: "#a7f3d0" },
  { id: "c", title: "Photo C", tone: "#bfdbfe" },
];

interface ViewTransitionCapture {
  supported: boolean;
  domCommittedAtCallbackDone?: boolean;
  detailNewImageCaptured?: boolean;
  pseudoElements?: string[];
  readyError?: string;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => {
    finished: Promise<void>;
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
  };
};

function captureState(): { __vtCapture?: ViewTransitionCapture } {
  return window as unknown as { __vtCapture?: ViewTransitionCapture };
}

export function App() {
  const selectedId = cell<string | null>(null);

  const openViewer = (id: string) => {
    const doc = document as DocumentWithViewTransition;
    const capture: ViewTransitionCapture = {
      supported: typeof doc.startViewTransition === "function",
    };
    captureState().__vtCapture = capture;

    if (doc.startViewTransition === undefined) {
      selectedId.set(id);
      return;
    }

    const transition = doc.startViewTransition(() => {
      selectedId.set(id);
    });

    void transition.updateCallbackDone.then(() => {
      // The update callback promise has settled; the browser snapshots the
      // new state no earlier than this. The cell-driven panel must be there.
      capture.domCommittedAtCallbackDone =
        document.querySelector('[data-testid="vt-detail"]') !== null;
    });

    void transition.ready
      .then(() => {
        const pseudoElements = document
          .getAnimations()
          .map((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement)
          .filter((pseudo): pseudo is string => typeof pseudo === "string");
        capture.pseudoElements = pseudoElements;
        // A ::view-transition-*(vt-detail) animation only exists when the
        // new-state snapshot captured the freshly inserted panel.
        capture.detailNewImageCaptured = pseudoElements.some((pseudo) =>
          pseudo.includes("vt-detail"),
        );
      })
      .catch((error: unknown) => {
        capture.readyError = String(error);
      });
  };

  const selectedPhoto = () => photos.find((photo) => photo.id === selectedId.get());

  return (
    <main>
      <h1>view transition</h1>
      <p>
        Click a thumbnail: the handler calls <code>document.startViewTransition</code> and sets a
        cell inside the update callback.
      </p>
      <p>
        {photos.map((photo) => (
          <button type="button" onClick={() => openViewer(photo.id)}>
            Open {photo.title}
          </button>
        ))}
      </p>
      {selectedPhoto() !== undefined && (
        <figure class="vt-detail" data-testid="vt-detail">
          <div class="vt-swatch" style={{ background: selectedPhoto()?.tone ?? "" }}></div>
          <figcaption>{selectedPhoto()?.title}</figcaption>
        </figure>
      )}
      <p>
        <a href="/index.html">← Back</a>
      </p>
    </main>
  );
}
