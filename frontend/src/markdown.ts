// 手刻的極簡 Markdown 轉 HTML：只支援需求/規格描述實際會用到的語法
// （段落、**粗體**、[文字](網址) 連結、![說明](網址) 圖片），不追求完整 Markdown 規格，
// 也不引入外部套件（ADR-0003：minimal dependencies）。
//
// 安全性：輸入先整段 HTML escape，再用正則辨識還留在文字裡的 markdown 語法符號
// （*[]()! 這些字元不受 HTML escape 影響）組出對應標籤，避免使用者輸入的
// 任意 HTML／script 被當成標籤解讀；連結、圖片網址也限制通訊協定，擋掉 javascript: 等。

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 只允許 http(s)/mailto，或不含通訊協定的相對路徑；擋掉 javascript: 之類的危險 scheme。
function isSafeUrl(url: string): boolean {
  if (/^(https?:|mailto:)/i.test(url)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(url);
}

function renderInline(escaped: string): string {
  let html = escaped;

  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt: string, url: string) => {
    if (!isSafeUrl(url)) return match;
    return `<img src="${url}" alt="${alt}" />`;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
    if (!isSafeUrl(url)) return match;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  return html.replace(/\n/g, "<br />");
}

export function renderMarkdown(source: string): string {
  const escaped = escapeHtml(source.trim());
  if (!escaped) return "";
  return escaped
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${renderInline(paragraph)}</p>`)
    .join("");
}
