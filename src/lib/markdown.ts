import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import catppuccinMocha from "shiki/themes/catppuccin-mocha.mjs";
import catppuccinLatte from "shiki/themes/catppuccin-latte.mjs";
import js from "shiki/langs/javascript.mjs";
import ts from "shiki/langs/typescript.mjs";
import html from "shiki/langs/html.mjs";
import css from "shiki/langs/css.mjs";
import json from "shiki/langs/json.mjs";
import markdown from "shiki/langs/markdown.mjs";
import bash from "shiki/langs/bash.mjs";
import sql from "shiki/langs/sql.mjs";
import python from "shiki/langs/python.mjs";
import go from "shiki/langs/go.mjs";
import rust from "shiki/langs/rust.mjs";
import yaml from "shiki/langs/yaml.mjs";
import type { Root as MdastRoot, BlockContent, Blockquote } from "mdast";
import { slugify } from "./utils";
import type { Root as HastRoot, Element as HastElement } from "hast";

let highlighterPromise: Promise<HighlighterCore> | null = null;

async function getHighlighterInstance() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [catppuccinMocha, catppuccinLatte],
      langs: [
        js,
        ts,
        html,
        css,
        json,
        markdown,
        bash,
        sql,
        python,
        go,
        rust,
        yaml,
      ],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "avif",
  "bmp",
  "ico",
]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg", "mov", "mkv"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a", "flac", "aac"]);

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function parseWikilink(rawTarget: string, rawLabel?: string) {
  const parts = rawTarget.split("#");
  const slugPart = parts[0].trim();
  const anchorPart = parts[1]?.trim();

  let href = "";
  let defaultLabel = rawTarget;

  if (!slugPart && anchorPart) {
    const anchorSlug = slugify(anchorPart);
    href = `#${anchorSlug}`;
    defaultLabel = `#${anchorPart}`;
  } else if (slugPart && anchorPart) {
    const anchorSlug = slugify(anchorPart);
    href = `/posts/${slugPart}#${anchorSlug}`;
    defaultLabel = `${slugPart}#${anchorPart}`;
  } else {
    href = `/posts/${slugPart}`;
    defaultLabel = slugPart;
  }

  const label = rawLabel?.trim() || defaultLabel;
  return { href, label };
}

export function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseEmbedParameters(targetWithPipe: string, labelParam?: string) {
  const parts = targetWithPipe.split("|");
  const filename = parts[0].trim();
  let alt = labelParam || "";
  let width: string | undefined;
  let height: string | undefined;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    const sizeMatch = /^(\d+)(?:x(\d+))?$/.exec(part);
    if (sizeMatch) {
      width = sizeMatch[1];
      height = sizeMatch[2];
    } else if (!alt) {
      alt = part;
    }
  }

  if (labelParam && !width) {
    const sizeMatch = /^(\d+)(?:x(\d+))?$/.exec(labelParam.trim());
    if (sizeMatch) {
      width = sizeMatch[1];
      height = sizeMatch[2];
      alt = "";
    }
  }

  return { filename, alt: alt || filename, width, height };
}

/**
 * Remark plugin to parse Obsidian-flavored comments (%%...%%), highlights (==...==), wikilinks [[slug]], and embeds ![[filename.ext]]
 */
function remarkObsidianLinks() {
  return (tree: MdastRoot) => {
    // 1. Strip Obsidian comments %%...%%
    visit(tree, "text", (node) => {
      if (node.value.includes("%%")) {
        node.value = node.value.replace(/%%[\s\S]*?%%/g, "");
      }
    });

    // 2. Transform highlights, embeds, and wikilinks across all container nodes
    visit(tree, (node: any) => {
      if (!node.children || !Array.isArray(node.children)) return;

      const newChildren: any[] = [];
      let modified = false;

      for (const child of node.children) {
        if (child.type !== "text") {
          newChildren.push(child);
          continue;
        }

        const text = child.value;
        const pattern = /(!?)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|==([^=]+)==/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(text)) !== null) {
          modified = true;
          const matchStart = match.index;
          const matchEnd = pattern.lastIndex;

          if (matchStart > lastIndex) {
            newChildren.push({
              type: "text",
              value: text.slice(lastIndex, matchStart),
            });
          }

          if (match[4]) {
            // Highlight ==text==
            newChildren.push({
              type: "html",
              value: `<mark class="obsidian-highlight">${escapeHtml(match[4])}</mark>`,
            });
          } else if (match[1] === "!") {
            // Embed ![[target]]
            const rawTarget = match[2].trim();
            const rawLabel = match[3]?.trim();
            const { filename, alt, width, height } = parseEmbedParameters(
              rawTarget,
              rawLabel,
            );
            const ext = getExtension(filename);
            const safeAlt = escapeHtml(alt);
            const safeFilename = escapeHtml(filename);
            const safeMediaSrc = `/media/${encodeURI(filename)}`;

            let styleStr = "";
            if (width && height) {
              styleStr = `width: ${width}px; height: ${height}px; max-width: 100%; object-fit: cover;`;
            } else if (width) {
              styleStr = `width: ${width}px; max-width: 100%;`;
            }

            if (IMAGE_EXTENSIONS.has(ext)) {
              newChildren.push({
                type: "html",
                value: `<img src="${safeMediaSrc}" alt="${safeAlt}" ${styleStr ? `style="${styleStr}"` : ""} class="obsidian-embed obsidian-image" loading="lazy" />`,
              });
            } else if (VIDEO_EXTENSIONS.has(ext)) {
              const bigPlaySvg = renderSVG("play", {
                width: 22,
                height: 22,
                className: "fill-current ml-0.5",
              });
              const playSvg = renderSVG("play", {
                width: 14,
                height: 14,
                className: "play-icon fill-current",
              });
              const pauseSvg = renderSVG("pause", {
                width: 14,
                height: 14,
                className: "pause-icon hidden fill-current",
              });

              newChildren.push({
                type: "html",
                value: `<div class="obsidian-video-wrapper" ${styleStr ? `style="${styleStr}"` : ""}><video src="${safeMediaSrc}" class="obsidian-embed obsidian-video" preload="metadata" playsinline></video><div class="video-play-overlay"><span class="video-play-btn">${bigPlaySvg}</span></div><div class="video-controls-bar"><button type="button" class="video-control-btn play-toggle" aria-label="Toggle Playback">${playSvg}${pauseSvg}</button><div class="video-timeline"><div class="video-progress"></div></div><span class="video-time">00:00</span></div></div>`,
              });
            } else if (AUDIO_EXTENSIONS.has(ext)) {
              const playSvg = renderSVG("play", {
                width: 14,
                height: 14,
                className: "play-icon fill-current",
              });
              const pauseSvg = renderSVG("pause", {
                width: 14,
                height: 14,
                className: "pause-icon hidden fill-current",
              });

              newChildren.push({
                type: "html",
                value: `<div class="obsidian-audio-wrapper my-4"><audio src="${safeMediaSrc}" class="obsidian-embed obsidian-audio hidden" preload="metadata"></audio><div class="audio-controls-bar"><button type="button" class="audio-control-btn play-toggle" aria-label="Toggle Audio Playback">${playSvg}${pauseSvg}</button><div class="audio-track-info inline-flex items-center gap-1.5"><span class="audio-filename truncate" title="${safeAlt || safeFilename}">${safeAlt || safeFilename}</span></div><div class="audio-timeline"><div class="audio-progress"></div></div><span class="audio-time">00:00</span></div></div>`,
              });
            } else if (ext === "pdf") {
              newChildren.push({
                type: "html",
                value: `<iframe src="${safeMediaSrc}" class="obsidian-embed obsidian-pdf" style="width: 100%; height: 500px; border: 1px solid var(--border-main);" title="${safeAlt}"></iframe>`,
              });
            } else {
              newChildren.push({
                type: "html",
                value: `<a href="${safeMediaSrc}" download class="obsidian-attachment-link inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-(--border-subtle) bg-(--bg-surface-elevated) text-(--accent-green-bright) hover:border-(--accent-green)">📎 ${safeAlt}</a>`,
              });
            }
          } else {
            // Wikilink [[target]]
            const rawTarget = match[2].trim();
            const rawLabel = match[3]?.trim();
            const { href, label } = parseWikilink(rawTarget, rawLabel);

            newChildren.push({
              type: "html",
              value: `<a href="${encodeURI(href)}" class="obsidian-wikilink text-emerald-400 underline decoration-emerald-600/50 hover:decoration-emerald-400">${escapeHtml(label)}</a>`,
            });
          }

          lastIndex = matchEnd;
        }

        if (lastIndex < text.length) {
          newChildren.push({
            type: "text",
            value: text.slice(lastIndex),
          });
        }
      }

      if (modified) {
        node.children = newChildren;
      }
    });
  };
}

/**
 * Remark plugin to parse Obsidian callouts: > [!NOTE] Title or > [!NOTE]+ Foldable
 */
function remarkObsidianCallouts() {
  return (tree: MdastRoot) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      if (!node.children || node.children.length === 0) return;
      const firstChild = node.children[0];
      if (
        firstChild.type !== "paragraph" ||
        !firstChild.children ||
        firstChild.children.length === 0
      )
        return;

      const firstTextNode = firstChild.children[0];
      if (firstTextNode.type !== "text") return;

      const calloutMatch =
        /^\[!([a-zA-Z0-9_-]+)\]([+-]?)(?:\s+(.*))?(\n?)/.exec(
          firstTextNode.value,
        );
      if (!calloutMatch) return;

      const rawType = calloutMatch[1];
      const type = rawType.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const fold = calloutMatch[2]; // '+' or '-' or ''
      const customTitle =
        calloutMatch[3]?.trim() || type.charAt(0).toUpperCase() + type.slice(1);
      const safeTitle = escapeHtml(customTitle);
      const remainingText = firstTextNode.value.slice(calloutMatch[0].length);

      if (remainingText.length > 0) {
        firstTextNode.value = remainingText;
      } else {
        firstChild.children.shift();
        if (firstChild.children.length === 0) {
          node.children.shift();
        }
      }

      const icon = getCalloutIcon(type);

      if (fold === "+" || fold === "-") {
        node.data = {
          hName: "details",
          hProperties: {
            class: `obsidian-callout callout-${type} callout-foldable border border-[var(--border-main)]`,
            open: fold === "+" ? true : undefined,
            "data-callout": type,
          },
        };

        const headerNode: BlockContent = {
          type: "html",
          value: `<summary class="callout-header"><span class="callout-icon">${icon}</span><span class="callout-title">${safeTitle}</span><span class="callout-fold-indicator">${fold === "+" ? "▾" : "▸"}</span></summary>`,
        };

        node.children.unshift(headerNode);
      } else {
        node.data = {
          hName: "div",
          hProperties: {
            class: `obsidian-callout callout-${type} border border-[var(--border-main)]`,
            "data-callout": type,
          },
        };

        const headerNode: BlockContent = {
          type: "html",
          value: `<div class="callout-header"><span class="callout-icon">${icon}</span><span class="callout-title">${safeTitle}</span></div>`,
        };

        node.children.unshift(headerNode);
      }
    });
  };
}

const CALLOUT_ICONS_MAP: Record<string, string> = {
  note: "info",
  seealso: "info",
  info: "info",
  todo: "check-square",
  tip: "flame",
  hint: "flame",
  important: "flame",
  danger: "zap",
  error: "zap",
  warning: "triangle-alert",
  caution: "triangle-alert",
  attention: "triangle-alert",
  failure: "circle-x",
  fail: "circle-x",
  missing: "circle-x",
  question: "circle-help",
  help: "circle-help",
  faq: "circle-help",
  success: "circle-check",
  check: "circle-check",
  done: "circle-check",
  abstract: "clipboard-list",
  summary: "clipboard-list",
  tldr: "clipboard-list",
  bug: "bug",
  example: "flask-conical",
  quote: "quote",
  cite: "quote",
};

export function renderSVG(
  iconName: string,
  options?: {
    width?: number | string;
    height?: number | string;
    className?: string;
  },
): string {
  const width = options?.width || "16";
  const height = options?.height || "16";
  const classAttr = options?.className ? ` class="${options.className}"` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg"${classAttr} width="${width}" height="${height}" viewBox="0 0 24 24" aria-hidden="true"><use href="/icons/callouts.svg#${iconName}"></use></svg>`;
}

function getCalloutIcon(type: string): string {
  const iconName = CALLOUT_ICONS_MAP[type] || "info";
  return renderSVG(iconName, {
    width: 16,
    height: 16,
    className: "callout-icon",
  });
}

/**
 * Rehype plugin to highlight code blocks using Shiki
 */
function rehypeShikiHighlight(highlighter: HighlighterCore) {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: HastElement, index, parent) => {
      if (!parent || typeof index !== "number") return;
      if (node.tagName !== "pre") return;

      const codeElement = node.children.find(
        (child): child is HastElement =>
          child.type === "element" && child.tagName === "code",
      );
      if (!codeElement) return;

      const className = (codeElement.properties?.className as string[]) || [];
      const langClass = className.find((c) => c.startsWith("language-"));
      const lang = langClass ? langClass.replace("language-", "") : "text";

      let codeText = "";
      for (const child of codeElement.children) {
        if (child.type === "text") {
          codeText += child.value;
        }
      }

      const supportedLangs = highlighter.getLoadedLanguages();
      const resolvedLang = supportedLangs.includes(lang) ? lang : "text";

      try {
        const highlightedHtml = highlighter.codeToHtml(codeText.trimEnd(), {
          lang: resolvedLang,
          themes: {
            dark: "catppuccin-mocha",
            light: "catppuccin-latte",
          },
          defaultColor: false,
        });

        const rawNode = {
          type: "raw" as const,
          value: `<div class="code-block-wrapper my-4 overflow-hidden border border-(--border-main)">${highlightedHtml}</div>`,
        };

        (parent.children as any)[index] = rawNode;
      } catch (err) {
        console.error("Shiki highlighting error:", err);
      }
    });
  };
}

let processorPromise: Promise<any> | null = null;

async function getProcessor() {
  if (!processorPromise) {
    processorPromise = (async () => {
      const highlighter = await getHighlighterInstance();
      return unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkMath)
        .use(remarkObsidianLinks)
        .use(remarkObsidianCallouts)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeKatex)
        .use(rehypeSlug)
        .use(rehypeAutolinkHeadings, {
          behavior: "append",
          properties: {
            class:
              "heading-anchor ml-2 text-emerald-600 hover:text-emerald-400 opacity-60 hover:opacity-100",
            ariaHidden: "true",
          },
        })
        .use(() => rehypeShikiHighlight(highlighter))
        .use(rehypeStringify, { allowDangerousHtml: true })
        .freeze();
    })();
  }
  return processorPromise;
}

/**
 * Parse Obsidian Markdown content into clean, safe HTML
 */
export async function renderMarkdown(markdown: string): Promise<string> {
  const processor = await getProcessor();
  const file = await processor.process(markdown);
  return String(file);
}

/**
 * Extract all media filenames referenced in markdown embed tags ![[filename.ext]]
 */
export function extractMediaReferences(markdown: string): string[] {
  const references = new Set<string>();
  if (!markdown) return [];

  // Obsidian embed syntax (`![[filename.ext]]` or `![[filename.ext|Alt text]]` or `![[filename.ext|300]]` )
  const obsidianEmbedRegex = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = obsidianEmbedRegex.exec(markdown)) !== null) {
    const rawTarget = match[1].trim();
    const filename = rawTarget.split("|")[0].trim();
    if (filename) references.add(filename);
  }

  // Standard markdown image syntax (`![alt](/media/filename.ext)` or `![alt](filename.ext)`)
  const markdownImgRegex =
    /!\[.*?\]\((?:(?:\/media\/)|(?:media\/))?([^\s\)]+)\)/g;
  while ((match = markdownImgRegex.exec(markdown)) !== null) {
    const filename = match[1].trim();
    if (
      filename &&
      !filename.startsWith("http://") &&
      !filename.startsWith("https://")
    ) {
      references.add(filename);
    }
  }

  return Array.from(references);
}

/**
 * Safely replaces all references of oldFilename with newFilename in markdown content.
 */
export function replaceMediaReferences(
  markdown: string,
  oldFilename: string,
  newFilename: string,
): string {
  if (
    !markdown ||
    !oldFilename ||
    !newFilename ||
    oldFilename === newFilename
  ) {
    return markdown;
  }

  // Escape special regex characters in the filenames
  const escapeRegExp = (str: string) =>
    str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedOld = escapeRegExp(oldFilename.trim());
  const targetNew = newFilename.trim();

  // Obsidian Embeds (`![[oldFilename]]` or `![[oldFilename|extra]]`)
  const obsidianEmbedRegex = new RegExp(
    `!\\[\\[\\s*${escapedOld}(?:\\s*\\|\\s*([^\\]]*))?\\s*\\]\\]`,
    "g",
  );
  let updated = markdown.replace(obsidianEmbedRegex, (_, extra) => {
    return extra !== undefined
      ? `![[${targetNew}|${extra}]]`
      : `![[${targetNew}]]`;
  });

  // Obsidian Links (`[[oldFilename]]` or `[[oldFilename|extra]]` )
  const obsidianLinkRegex = new RegExp(
    `(?<!!)\\[\\[\\s*${escapedOld}(?:\\s*\\|\\s*([^\\]]*))?\\s*\\]\\]`,
    "g",
  );
  updated = updated.replace(obsidianLinkRegex, (_, extra) => {
    return extra !== undefined
      ? `[[${targetNew}|${extra}]]`
      : `[[${targetNew}]]`;
  });

  // Standard Markdown Images/Links: (`![alt](/media/oldFilename)` or `[text](/media/oldFilename)`)
  const markdownImgLinkRegex = new RegExp(
    `(\\[[^\\]]*\\]\\()(?:\\/media\\/|media\\/)?${escapedOld}(\\s*(?:["'][^)]*["'])?\\))`,
    "g",
  );
  updated = updated.replace(markdownImgLinkRegex, (match, prefix, suffix) => {
    const hasMediaPrefix =
      match.includes("/media/") || match.includes("media/");
    const targetPath = hasMediaPrefix ? `/media/${targetNew}` : targetNew;
    return `${prefix}${targetPath}${suffix}`;
  });

  return updated;
}

/**
 * Estimate reading time in minutes
 */
export function calculateReadingTime(content: string): number {
  if (!content) return 1;
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}
