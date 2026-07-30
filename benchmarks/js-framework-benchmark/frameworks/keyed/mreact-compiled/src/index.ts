import { App } from "./main";

const mount = document.getElementById("main");

if (mount === null) {
  throw new Error("Missing #main");
}

mount.replaceWith(App());
