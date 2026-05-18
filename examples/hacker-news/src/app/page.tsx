import { appTitle } from "../lib/app-info";

export const metadata = {
  title: "Home",
};

export default function Page() {
  return <main>{appTitle}</main>;
}
