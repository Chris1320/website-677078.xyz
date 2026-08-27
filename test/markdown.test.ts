import { describe, it, expect } from "bun:test";
import {
  renderMarkdown,
  extractMediaReferences,
  calculateReadingTime,
} from "../src/lib/markdown";

describe("Obsidian Markdown Engine", () => {
  it("renders wikilinks correctly", async () => {
    const md =
      "Check out [[intro-to-workers]] and [[cloudflare-d1|Cloudflare D1 Guide]].";
    const html = await renderMarkdown(md);
    expect(html).toContain('href="/blogs/intro-to-workers"');
    expect(html).toContain("intro-to-workers");
    expect(html).toContain('href="/blogs/cloudflare-d1"');
    expect(html).toContain("Cloudflare D1 Guide");
  });

  it("renders image embeds with /media/ path", async () => {
    const md =
      "Look at this architecture diagram:\n\n![[arch-diagram-123.png|System Architecture]]";
    const html = await renderMarkdown(md);
    expect(html).toContain('src="/media/arch-diagram-123.png"');
    expect(html).toContain('alt="System Architecture"');
    expect(html).toContain("obsidian-embed obsidian-image");
  });

  it("renders video embeds with video player", async () => {
    const md = "Demo video:\n\n![[demo-recording-456.mp4]]";
    const html = await renderMarkdown(md);
    expect(html).toContain(
      '<video src="/media/demo-recording-456.mp4" controls',
    );
  });

  it("renders callout blocks", async () => {
    const md =
      "> [!WARNING] Production Alert\n> Do not execute raw SQL without parameterized queries.";
    const html = await renderMarkdown(md);
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain("Production Alert");
    expect(html).toContain("Do not execute raw SQL");
  });

  it("highlights code blocks with Shiki", async () => {
    const md = '```typescript\nconst greeting: string = "hello world";\n```';
    const html = await renderMarkdown(md);
    expect(html).toContain("code-block-wrapper");
    expect(html).toContain("greeting");
  });

  it("extracts media references accurately for orphan tracking", () => {
    const md = `
# Sample Post
Here is an image: ![[diagram-abc.png|Diagram]]
And a video: ![[screencast-def.mp4]]
And markdown image: ![Alt Text](/media/photo-ghi.webp)
And a standard link: [Google](https://google.com)
    `;
    const refs = extractMediaReferences(md);
    expect(refs).toEqual([
      "diagram-abc.png",
      "screencast-def.mp4",
      "photo-ghi.webp",
    ]);
  });

  it("calculates reading time", () => {
    const shortText = "Hello world this is a short test.";
    expect(calculateReadingTime(shortText)).toBe(1);

    const longText = new Array(500).fill("word").join(" ");
    expect(calculateReadingTime(longText)).toBe(3);
  });
});
