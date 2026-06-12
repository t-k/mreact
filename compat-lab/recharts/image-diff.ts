import { readFile, writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

export interface ImageDiffResult {
  changedPixels: number;
  totalPixels: number;
  pixelDiffRatio: number;
}

export function pixelDiffRatioFromCounts(changedPixels: number, totalPixels: number): number {
  return totalPixels === 0 ? 1 : changedPixels / totalPixels;
}

export async function diffPngWithBrowserCanvas(input: {
  page: Page;
  reactPngPath: string;
  compatPngPath: string;
  diffPngPath: string;
}): Promise<ImageDiffResult> {
  const reactDataUrl = await pngPathToDataUrl(input.reactPngPath);
  const compatDataUrl = await pngPathToDataUrl(input.compatPngPath);
  const result = await input.page.evaluate(
    async ({ reactDataUrl, compatDataUrl }) => {
      const [reactImage, compatImage] = await Promise.all([
        loadImage(reactDataUrl),
        loadImage(compatDataUrl),
      ]);
      const width = Math.max(reactImage.width, compatImage.width);
      const height = Math.max(reactImage.height, compatImage.height);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context === null) {
        throw new Error("Canvas 2D context is unavailable.");
      }

      context.drawImage(reactImage, 0, 0);
      const react = context.getImageData(0, 0, width, height);
      context.clearRect(0, 0, width, height);
      context.drawImage(compatImage, 0, 0);
      const compat = context.getImageData(0, 0, width, height);
      const diff = context.createImageData(width, height);
      let changedPixels = 0;

      for (let index = 0; index < react.data.length; index += 4) {
        const delta =
          Math.abs(react.data[index]! - compat.data[index]!) +
          Math.abs(react.data[index + 1]! - compat.data[index + 1]!) +
          Math.abs(react.data[index + 2]! - compat.data[index + 2]!) +
          Math.abs(react.data[index + 3]! - compat.data[index + 3]!);
        const changed = delta > 12;
        if (changed) {
          changedPixels += 1;
        }
        diff.data[index] = changed ? 220 : 255;
        diff.data[index + 1] = changed ? 38 : 255;
        diff.data[index + 2] = changed ? 38 : 255;
        diff.data[index + 3] = 255;
      }

      context.putImageData(diff, 0, 0);
      return {
        changedPixels,
        totalPixels: width * height,
        diffDataUrl: canvas.toDataURL("image/png"),
      };

      function loadImage(src: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error(`Failed to load image ${src.slice(0, 48)}`));
          image.src = src;
        });
      }
    },
    { reactDataUrl, compatDataUrl },
  );
  const encodedPng = result.diffDataUrl.split(",")[1] ?? "";

  await writeFile(input.diffPngPath, Buffer.from(encodedPng, "base64"));
  return {
    changedPixels: result.changedPixels,
    totalPixels: result.totalPixels,
    pixelDiffRatio: pixelDiffRatioFromCounts(result.changedPixels, result.totalPixels),
  };
}

async function pngPathToDataUrl(path: string): Promise<string> {
  const data = await readFile(path);
  return `data:image/png;base64,${data.toString("base64")}`;
}
