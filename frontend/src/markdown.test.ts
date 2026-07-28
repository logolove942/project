import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown - 手刻的極簡 Markdown 渲染", () => {
  it("wraps plain text in a paragraph", () => {
    expect(renderMarkdown("哈囉")).toBe("<p>哈囉</p>");
  });

  it("splits blank-line-separated text into multiple paragraphs", () => {
    expect(renderMarkdown("第一段\n\n第二段")).toBe("<p>第一段</p><p>第二段</p>");
  });

  it("keeps a single newline within a paragraph as a line break", () => {
    expect(renderMarkdown("第一行\n第二行")).toBe("<p>第一行<br />第二行</p>");
  });

  it("renders **bold** text", () => {
    expect(renderMarkdown("這是**重點**內容")).toBe("<p>這是<strong>重點</strong>內容</p>");
  });

  it("renders a [text](url) link", () => {
    expect(renderMarkdown("參考 [原型](https://example.com/proto)")).toBe(
      '<p>參考 <a href="https://example.com/proto" target="_blank" rel="noopener noreferrer">原型</a></p>',
    );
  });

  it("renders an ![alt](url) image", () => {
    expect(renderMarkdown("![截圖](https://example.com/a.png)")).toBe(
      '<p><img src="https://example.com/a.png" alt="截圖" /></p>',
    );
  });

  it("escapes raw HTML so it can't inject tags or run scripts", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("refuses to linkify a javascript: URL, leaving the raw markdown text visible", () => {
    expect(renderMarkdown("[點我](javascript:alert(1))")).toBe("<p>[點我](javascript:alert(1))</p>");
  });

  it("returns an empty string for blank input", () => {
    expect(renderMarkdown("   ")).toBe("");
  });
});
