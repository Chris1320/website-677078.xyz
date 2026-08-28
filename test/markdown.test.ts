import { describe, it, expect } from "bun:test";
import {
  renderMarkdown,
  extractMediaReferences,
  replaceMediaReferences,
  calculateReadingTime,
} from "../src/lib/markdown";

describe("Markdown Engine", () => {
  it("renders wikilinks correctly", async () => {
    const md = "Check out [[this]] and [[bar|that]].";
    const html = await renderMarkdown(md);
    expect(html).toContain('href="/posts/this"');
    expect(html).toContain("this");
    expect(html).toContain('href="/posts/bar"');
    expect(html).toContain("that");
  });

  it("renders image embeds with /media/ path", async () => {
    const md =
      "Look at this architecture diagram:\n\n![[arch-diagram-123.png|System Architecture]]";
    const html = await renderMarkdown(md);
    expect(html).toContain('src="/media/arch-diagram-123.png"');
    expect(html).toContain('alt="System Architecture"');
    expect(html).toContain("obsidian-embed obsidian-image");
  });

  it("render video embeds", async () => {
    const md = "Demo video:\n\n![[demo-recording-456.mp4]]";
    const html = await renderMarkdown(md);
    expect(html).toContain("obsidian-video-wrapper");
    expect(html).toContain(
      '<video src="/media/demo-recording-456.mp4" class="obsidian-embed obsidian-video"',
    );
    expect(html).toContain("video-play-overlay");
    expect(html).toContain("video-controls-bar");
    expect(html).toContain("video-timeline");
    expect(html).not.toContain(
      '<video src="/media/demo-recording-456.mp4" controls',
    );
  });

  it("render audio embeds", async () => {
    const md = "Podcast audio:\n\n![[episode-101.mp3]]";
    const html = await renderMarkdown(md);
    expect(html).toContain("obsidian-audio-wrapper");
    expect(html).toContain(
      '<audio src="/media/episode-101.mp3" class="obsidian-embed obsidian-audio hidden"',
    );
    expect(html).toContain("audio-controls-bar");
    expect(html).toContain("audio-timeline");
    expect(html).toContain("audio-progress");
    expect(html).toContain("episode-101.mp3");
  });

  it("renders callout blocks", async () => {
    const md =
      "> [!WARNING] Production Alert\n> Do not execute raw SQL without parameterized queries.";
    const html = await renderMarkdown(md);
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain("Production Alert");
    expect(html).toContain("Do not execute raw SQL");
    expect(html).toContain('class="callout-icon"');
    expect(html).toContain("<svg");
  });

  it("highlight code blocks with Shiki", async () => {
    const md = '```typescript\nconst greeting: string = "hello world";\n```';
    const html = await renderMarkdown(md);
    expect(html).toContain("code-block-wrapper");
    expect(html).toContain("greeting");
    expect(html).toContain("--shiki-dark");
    expect(html).toContain("--shiki-light");
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

  it("strips comments and renders highlights", async () => {
    const md = "Visible %%Hidden comment%% text with ==important highlight==.";
    const html = await renderMarkdown(md);
    expect(html).not.toContain("Hidden comment");
    expect(html).toContain(
      '<mark class="obsidian-highlight">important highlight</mark>',
    );
    expect(html).toContain("Visible  text with");
  });

  it("renders GFM tables and task lists", async () => {
    const md = `
| Head1 | Head2 |
|---|---|
| Cell1 | Cell2 |

- [ ] Todo
- [x] Done
    `;
    const html = await renderMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Head1</th>");
    expect(html).toContain("<td>Cell1</td>");
    expect(html).toContain('type="checkbox"');
  });

  it("renders sized embeds and PDF attachments", async () => {
    const md = `
![[photo.png|300]]
![[photo2.png|300x150]]
![[doc.pdf|Manual]]
    `;
    const html = await renderMarkdown(md);
    expect(html).toContain('style="width: 300px; max-width: 100%;"');
    expect(html).toContain(
      'style="width: 300px; height: 150px; max-width: 100%; object-fit: cover;"',
    );
    expect(html).toContain('<iframe src="/media/doc.pdf"');
  });

  it("renders foldable callouts and custom anchors", async () => {
    const md = `
> [!faq]- Are you sure?
> Yes this is collapsed by default.

> [!note]+ Are you really really sure?
> Sure, why not? This is uncollapsed by default.

> [!tip] Standard tip
> This is a regular non-foldable callout.

See [[another-post#Architecture|Architecture Section]] and [[#Local Heading|Local Header]].
    `;
    const html = await renderMarkdown(md);

    expect(html).toContain(
      '<details class="obsidian-callout callout-faq callout-foldable',
    );
    expect(html).toMatch(/<details class="[^"]*callout-faq[^"]*"[^>]*>/);
    expect(html).not.toMatch(
      /<details class="[^"]*callout-faq[^"]*"[^>]*\bopen\b/,
    );
    expect(html).toContain("Yes this is collapsed by default.");

    expect(html).toContain(
      '<details class="obsidian-callout callout-note callout-foldable',
    );
    expect(html).toMatch(
      /<details class="[^"]*callout-note[^"]*"[^>]*\bopen\b/,
    );
    expect(html).toContain("Sure, why not? This is uncollapsed by default.");

    expect(html).toContain('<div class="obsidian-callout callout-tip');
    expect(html).toContain("This is a regular non-foldable callout.");

    expect(html).toContain('<summary class="callout-header">');
    expect(html).toContain('href="/posts/another-post#architecture"');
    expect(html).toContain("Architecture Section");
    expect(html).toContain('href="#local-heading"');
    expect(html).toContain("Local Header");
  });

  it("renders KaTeX math expressions", async () => {
    const md = "Here is formula $E=mc^2$ and block math:\n\n$$\\frac{a}{b}$$";
    const html = await renderMarkdown(md);
    expect(html).toContain("katex");
    expect(html).toContain("katex-html");
  });

  it("calculates reading time", () => {
    const shortText = "Hello world this is a short test.";
    expect(calculateReadingTime(shortText)).toBe(1);

    const longText = new Array(500).fill("word").join(" ");
    expect(calculateReadingTime(longText)).toBe(3);
  });

  it("replaces media references across Wikilinks and markdown syntax", () => {
    const sample = `
# Sample Article

![[old-photo.jpg]]
![[old-photo.jpg|300]]
![[old-photo.jpg|Alt Text]]
[[old-photo.jpg]]
[[old-photo.jpg|Alias Name]]
![Standard](/media/old-photo.jpg)
![Relative](old-photo.jpg)
[Download Attachment](/media/old-photo.jpg)

Do not touch:
![[old-photo.jpg_backup.png]]
old-photo.jpg in plain text
    `.trim();

    const replaced = replaceMediaReferences(
      sample,
      "old-photo.jpg",
      "new-banner.jpg",
    );

    expect(replaced).toContain("![[new-banner.jpg]]");
    expect(replaced).toContain("![[new-banner.jpg|300]]");
    expect(replaced).toContain("![[new-banner.jpg|Alt Text]]");
    expect(replaced).toContain("[[new-banner.jpg]]");
    expect(replaced).toContain("[[new-banner.jpg|Alias Name]]");
    expect(replaced).toContain("![Standard](/media/new-banner.jpg)");
    expect(replaced).toContain("![Relative](new-banner.jpg)");
    expect(replaced).toContain("[Download Attachment](/media/new-banner.jpg)");

    // Ensure untouched text was not corrupted
    expect(replaced).toContain("![[old-photo.jpg_backup.png]]");
    expect(replaced).toContain("old-photo.jpg in plain text");
  });

  it("escapes highlight text via escapeHtml", async () => {
    const html = await renderMarkdown(
      "Check ==bold & \"air quotes\" are 'safe'== here.",
    );
    expect(html).toContain(
      '<mark class="obsidian-highlight">bold &amp; &quot;air quotes&quot; are &#39;safe&#39;</mark>',
    );
  });

  it("escapes callout title via escapeHtml", async () => {
    const html = await renderMarkdown(
      '> [!NOTE] Title & "quotes"\n> Body text.',
    );
    expect(html).toContain("Title &amp; &quot;quotes&quot;");
    expect(html).not.toMatch(/callout-title[^>]*>Title & "quotes"/);
  });

  it("escapes wikilink label and encodes href", async () => {
    const html = await renderMarkdown('See [[my post|Link & "quotes"]]');
    expect(html).toContain("Link &amp; &quot;quotes&quot;");
    expect(html).toContain('href="/posts/my%20post"');
  });

  it("escapes embed alt attribute and encodes src", async () => {
    const html = await renderMarkdown('![[my image.png|Alt & "quotes"]]');
    expect(html).toContain('alt="Alt &amp; &quot;quotes&quot;"');
    expect(html).toContain('src="/media/my%20image.png"');
  });
});
