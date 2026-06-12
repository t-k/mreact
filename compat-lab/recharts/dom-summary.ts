export interface DomSummary {
  svgCount: number;
  pathCount: number;
  rectCount: number;
  circleCount: number;
  text: string[];
  classes: string[];
}

export function collectDomSummary(root: Element): DomSummary {
  const text = Array.from(root.querySelectorAll("text, .recharts-tooltip-wrapper"))
    .map((element) => element.textContent?.trim() ?? "")
    .filter((value) => value.length > 0);
  const classes = Array.from(root.querySelectorAll("[class]"))
    .flatMap((element) => Array.from(element.classList))
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort();

  return {
    svgCount: root.querySelectorAll("svg").length,
    pathCount: root.querySelectorAll("path").length,
    rectCount: root.querySelectorAll("rect").length,
    circleCount: root.querySelectorAll("circle").length,
    text,
    classes,
  };
}
