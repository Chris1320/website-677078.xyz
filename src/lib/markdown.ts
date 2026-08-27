import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { createHighlighter, type Highlighter } from "shiki";
import type {
  Root as MdastRoot,
  PhrasingContent,
  BlockContent,
  Paragraph,
  Blockquote,
} from "mdast";
import type { Root as HastRoot, Element as HastElement } from "hast";

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighterInstance() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["vitesse-dark"],
      langs: [
        "javascript",
        "typescript",
        "html",
        "css",
        "json",
        "markdown",
        "bash",
        "sh",
        "sql",
        "python",
        "go",
        "rust",
        "yaml",
        "vue",
        "astro",
      ],
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
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a", "flac"]);

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

/**
 * Remark plugin to parse Obsidian wikilinks [[slug]] and embeds ![[filename.ext]]
 */
function remarkObsidianLinks() {
  return (tree: MdastRoot) => {
    visit(tree, "paragraph", (node: Paragraph, index, parent) => {
      if (!parent || typeof index !== "number") return;

      const newChildren: PhrasingContent[] = [];

      for (const child of node.children) {
        if (child.type !== "text") {
          newChildren.push(child);
          continue;
        }

        const text = child.value;
        const pattern = /(!?)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(text)) !== null) {
          const isEmbed = match[1] === "!";
          const target = match[2].trim();
          const label = match[3]?.trim();
          const matchStart = match.index;
          const matchEnd = pattern.lastIndex;

          if (matchStart > lastIndex) {
            newChildren.push({
              type: "text",
              value: text.slice(lastIndex, matchStart),
            });
          }

          if (isEmbed) {
            const ext = getExtension(target);
            if (IMAGE_EXTENSIONS.has(ext)) {
              newChildren.push({
                type: "image",
                url: `/media/${target}`,
                alt: label || target,
                data: {
                  hProperties: {
                    class: "obsidian-embed obsidian-image",
                    loading: "lazy",
                  },
                },
              });
            } else if (VIDEO_EXTENSIONS.has(ext)) {
              newChildren.push({
                type: "html",
                value: `<video src="/media/${target}" controls class="obsidian-embed obsidian-video" preload="metadata"></video>`,
              });
            } else if (AUDIO_EXTENSIONS.has(ext)) {
              newChildren.push({
                type: "html",
                value: `<audio src="/media/${target}" controls class="obsidian-embed obsidian-audio" preload="metadata"></audio>`,
              });
            } else {
              newChildren.push({
                type: "link",
                url: `/media/${target}`,
                children: [{ type: "text", value: label || target }],
                data: {
                  hProperties: {
                    class: "obsidian-attachment-link",
                    download: target,
                  },
                },
              });
            }
          } else {
            const href = target.startsWith("/") ? target : `/blogs/${target}`;
            newChildren.push({
              type: "link",
              url: href,
              children: [{ type: "text", value: label || target }],
              data: {
                hProperties: {
                  class:
                    "obsidian-wikilink text-emerald-400 underline decoration-emerald-600/50 hover:decoration-emerald-400",
                },
              },
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

      node.children = newChildren as any;
    });
  };
}

/**
 * Remark plugin to parse Obsidian callouts: > [!NOTE] Title
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

      const calloutMatch = /^\[!([a-zA-Z0-9_-]+)\](?:\s+(.*))?(\n?)/.exec(
        firstTextNode.value,
      );
      if (!calloutMatch) return;

      const rawType = calloutMatch[1];
      const type = rawType.toLowerCase();
      const customTitle = calloutMatch[2]?.trim() || rawType.toUpperCase();
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

      node.data = {
        hName: "div",
        hProperties: {
          class: `obsidian-callout callout-${type} my-4 p-4 border border-emerald-900/60 bg-emerald-950/20 text-emerald-100`,
          "data-callout": type,
        },
      };

      const headerNode: BlockContent = {
        type: "html",
        value: `<div class="callout-header flex items-center gap-2 font-bold mb-2 text-emerald-400"><span class="callout-icon">${icon}</span><span class="callout-title">${customTitle}</span></div>`,
      };

      node.children.unshift(headerNode);
    });
  };
}

function getCalloutIcon(type: string): string {
  switch (type) {
    case "warning":
    case "caution":
    case "attention":
      return "⚠️";
    case "tip":
    case "hint":
    case "important":
      return "💡";
    case "danger":
    case "error":
      return "⛔";
    case "question":
    case "help":
    case "faq":
      return "❓";
    case "success":
    case "check":
    case "done":
      return "✓";
    default:
      return "ℹ️";
  }
}

/**
 * Rehype plugin to highlight code blocks using Shiki
 */
function rehypeShikiHighlight(highlighter: Highlighter) {
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
          theme: "vitesse-dark",
        });

        const rawNode = {
          type: "raw" as const,
          value: `<div class="code-block-wrapper my-4 overflow-hidden border border-emerald-900/60">${highlightedHtml}</div>`,
        };

        (parent.children as any)[index] = rawNode;
      } catch (err) {
        console.error("Shiki highlighting error:", err);
      }
    });
  };
}

/**
 * Parse Obsidian Markdown content into clean, safe HTML
 */
export async function renderMarkdown(markdown: string): Promise<string> {
  const highlighter = await getHighlighterInstance();

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidianLinks)
    .use(remarkObsidianCallouts)
    .use(remarkRehype, { allowDangerousHtml: true })
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
    .use(rehypeStringify, { allowDangerousHtml: true });

  const file = await processor.process(markdown);
  return String(file);
}

/**
 * Extract all media filenames referenced in markdown embed tags ![[filename.ext]]
 */
export function extractMediaReferences(markdown: string): string[] {
  const references = new Set<string>();
  if (!markdown) return [];

  // Obsidian embed syntax: ![[filename.ext]] or ![[filename.ext|Alt text]]
  const obsidianEmbedRegex = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = obsidianEmbedRegex.exec(markdown)) !== null) {
    const filename = match[1].trim();
    if (filename) references.add(filename);
  }

  // Standard markdown image syntax: ![alt](/media/filename.ext) or ![alt](filename.ext)
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
 * Estimate reading time in minutes
 */
export function calculateReadingTime(markdown: string): number {
  if (!markdown) return 1;
  const words = markdown.trim().split(/\s+/).length;
  const wordsPerMinute = 200;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}
