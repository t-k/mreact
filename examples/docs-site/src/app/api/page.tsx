import { apiReferenceIndexPage, ApiReferencePage } from "../../api-reference-data.js";

export const prerender = true;

export const metadata = {
  title: "API Reference | Mreact Docs",
  description: "Generated Mreact API reference rendered from TypeDoc JSON.",
};

export default function ApiIndexPage() {
  const page = apiReferenceIndexPage();

  return <ApiReferencePage page={page} />;
}
