// Copying in the browser. The Clipboard API only exists on secure pages (https or localhost), and the
// site is usually opened over plain http on the local network, so fall back to a selection copy.

function copySelectionOf(node: HTMLElement): boolean {
  document.body.appendChild(node);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(node);
  selection?.removeAllRanges();
  selection?.addRange(range);
  if (node instanceof HTMLTextAreaElement) node.select();
  try {
    return document.execCommand("copy");
  } finally {
    selection?.removeAllRanges();
    node.remove();
  }
}

const offscreen = <T extends HTMLElement>(node: T): T => {
  node.style.position = "fixed";
  node.style.left = "-10000px";
  node.style.top = "0";
  return node;
};

/** Copies plain text; resolves false when the browser refused. */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the selection copy
    }
  }
  const area = offscreen(document.createElement("textarea"));
  area.value = text;
  area.setAttribute("readonly", "");
  return copySelectionOf(area);
}

/** Copies formatted HTML (pastes as a formatted email) with a plain-text alternative. */
export async function copyHtml(html: string, text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) }),
      ]);
      return true;
    } catch {
      // fall through to the selection copy
    }
  }
  const box = offscreen(document.createElement("div"));
  box.contentEditable = "true";
  box.innerHTML = html;
  return copySelectionOf(box);
}
