// Opening a Shopee link goes through our server first, so the tab has to exist
// before the answer does: a popup blocker only lets a tab through when it is
// opened synchronously inside the click handler. This opens it, paints a
// holding page, and hands back the handle to point at the real URL later.
//
// `noopener` is deliberately NOT passed to window.open: by spec that makes it
// return null, which is exactly the bug that made a blank tab sit there while
// THIS tab navigated to Shopee instead. The back-reference is cut by hand
// below, while the new tab is still same-origin about:blank.
function html(heading: string, note: string) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>${heading}</title><style>
html,body{height:100%;margin:0}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#143122;background:#f6f7f6}
.s{width:34px;height:34px;border:3px solid #d8e6dd;border-top-color:#4DBA7A;border-radius:50%;
animation:r .8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}
p{margin:0;font-size:15px;font-weight:700}small{color:#5c6b62}
</style></head><body><div class="s"></div><p>${heading}</p>
<small>${note}</small></body></html>`;
}

export function openPendingTab(
  heading = "Đang tạo link hoàn tiền…",
  note = "Giữ tab này mở, Shopee sẽ hiện ra ngay sau đây.",
): Window | null {
  const tab = window.open("", "_blank");
  if (!tab) return null;
  try {
    tab.opener = null;
    tab.document.write(html(heading, note));
    tab.document.close();
  } catch {
    // A blocked or already-navigated tab still works as a plain target.
  }
  return tab;
}
