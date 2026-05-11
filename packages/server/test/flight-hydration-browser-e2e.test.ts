// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createElement } from "../../react-compat/src/index.js";
import { hydrateFlightResponse, readFlightResponse } from "../../react-compat/src/flight.js";
import {
  createClientReference,
  createServerReference,
  renderFlightResponseScript,
  renderToFlightResponse,
} from "../src/index.js";

describe("Flight hydration browser E2E", () => {
  test("hydrates streamed Flight content from an embedded script inside a resume marker", async () => {
    const ClientButton = createClientReference("./Button.client.tsx", "Button");
    const save = createServerReference("actions/todos", "save", ["workspace-1"]);
    const response = await renderToFlightResponse(
      createElement(ClientButton, { name: "Ada", onSave: save }),
    );
    let clicks = 0;

    document.body.innerHTML = [
      "<main><span>outside</span>",
      '<!--mreact-h:start:flight-root--><button>Ada</button><!--mreact-h:end:flight-root-->',
      renderFlightResponseScript(response, { id: "flight-root", nonce: "nonce-1" }),
      "</main>",
    ].join("");
    const outside = document.body.querySelector("span");
    const serverButton = document.body.querySelector("button");
    const flightResponse = readFlightResponse(document, "flight-root");

    hydrateFlightResponse(document.body, flightResponse, {
      hydrate: { resumeId: "flight-root", consumeResumeMarkers: true },
      loadClientReference(reference) {
        expect(reference.moduleId).toBe("./Button.client.tsx");
        return (props: { name: string; onSave: (name: string) => Promise<unknown> }) =>
          createElement(
            "button",
            {
              onClick: () => {
                clicks += 1;
                void props.onSave(props.name);
              },
            },
            props.name,
          );
      },
      callServerReference(reference, args) {
        expect(reference).toEqual({
          id: 0,
          moduleId: "actions/todos",
          exportName: "save",
          bound: ["workspace-1"],
        });
        expect(args).toEqual(["workspace-1", "Ada"]);
        return Promise.resolve({ ok: true });
      },
    });

    expect(document.body.querySelector("span")).toBe(outside);
    expect(document.body.querySelector("button")).toBe(serverButton);
    document.body.querySelector("button")?.click();
    await Promise.resolve();

    expect(clicks).toBe(1);
    expect(document.body.innerHTML).toContain("<span>outside</span><button>Ada</button>");
    expect(document.body.innerHTML).not.toContain("mreact-h:start:flight-root");
  });

});
