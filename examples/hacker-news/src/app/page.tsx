import { appTitle } from "../lib/app-info.js";

export const metadata = {
  title: "Home",
};

export default function Page() {
  return <main>{appTitle}</main>;
}
