export function rewriteHtmlBasePathsInDocument(html: string, base: string): string {
  return html
    .replaceAll(/href="\/(?!\/)/g, `href="${base}/`)
    .replaceAll(/src="\/(?!\/)/g, `src="${base}/`)
    .replaceAll(
      /(<script\b(?=[^>]*\btype="application\/json")(?=[^>]*\bid="mreact-(?:navigation-runtime|route-prefetch-manifest)")[^>]*>)([\s\S]*?)(<\/script>)/g,
      (_match, open: string, content: string, close: string) =>
        `${open}${content.replaceAll(/"script":"\/(?!\/)/g, `"script":"${base}/`)}${close}`,
    );
}
