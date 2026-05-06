/**
 * EPUB Canonical Fragment Identifier (CFI) utilities.
 *
 * CFI is the EPUB standard for identifying a precise location in a document,
 * surviving font size changes, reflows, and DOM mutations.
 *
 * Format: /spine[N]!/body[1]/div[2]/p[3],/1:5,/1:12
 *   → spine item N, body > div:nth(2) > p:nth(3), text node 1, chars 5-12
 */

/**
 * Generate a CFI string from a DOM Range within an EPUB chapter iframe.
 */
export function generateCfi(range: Range, spineIndex: number): string {
  const startPath = nodeToPath(range.startContainer, range.startOffset);
  const endPath = nodeToPath(range.endContainer, range.endOffset);

  if (!startPath || !endPath) return "";

  return `/spine[${spineIndex}]!${startPath.path}:${startPath.offset},${endPath.path}:${endPath.offset}`;
}

/**
 * Resolve a CFI string back to a DOM Range within an EPUB chapter iframe document.
 * Returns null if the CFI cannot be resolved (DOM structure changed).
 */
export function resolveCfi(cfi: string, doc: Document): Range | null {
  try {
    // Parse: /spine[N]!/path:startOffset,/path:endOffset
    const match = cfi.match(/^\/spine\[\d+\]!(.+):(\d+),(.+):(\d+)$/);
    if (!match) return null;

    const [, startPathStr, startOffsetStr, endPathStr, endOffsetStr] = match;
    const startOffset = parseInt(startOffsetStr, 10);
    const endOffset = parseInt(endOffsetStr, 10);

    const startNode = pathToNode(startPathStr, doc);
    const endNode = pathToNode(endPathStr, doc);

    if (!startNode || !endNode) return null;

    const range = doc.createRange();
    range.setStart(startNode, Math.min(startOffset, startNode.textContent?.length ?? 0));
    range.setEnd(endNode, Math.min(endOffset, endNode.textContent?.length ?? 0));
    return range;
  } catch {
    return null;
  }
}

/**
 * Build a path string from a DOM node to the body root.
 * Returns a string like "/body[1]/div[2]/p[3]/text()[1]" and the character offset.
 */
function nodeToPath(node: Node, offset: number): { path: string; offset: number } | null {
  const parts: string[] = [];
  let current: Node | null = node;

  // If it's a text node, record which text child it is
  if (current.nodeType === Node.TEXT_NODE) {
    const parent = current.parentNode;
    if (!parent) return null;
    const textIndex = getTextNodeIndex(parent, current);
    parts.unshift(`/text()[${textIndex}]`);
    current = parent;
  } else {
    // For element nodes, offset is a child index — convert to text node reference
    // This handles cases where the range starts/ends at an element boundary
    parts.unshift(`/text()[1]`);
  }

  // Walk up to body
  while (current && current.nodeName.toLowerCase() !== "body") {
    const parent = current.parentNode;
    if (!parent) return null;
    const childIndex = getElementIndex(parent, current as Element);
    const tag = current.nodeName.toLowerCase();
    parts.unshift(`/${tag}[${childIndex}]`);
    current = parent;
  }

  if (!current) return null;
  parts.unshift("/body[1]");

  return { path: parts.join(""), offset };
}

/**
 * Resolve a path string like "/body[1]/div[2]/p[3]/text()[1]" to a DOM node.
 */
function pathToNode(pathStr: string, doc: Document): Node | null {
  // Split into segments: ["/body[1]", "/div[2]", "/p[3]", "/text()[1]"]
  const segments = pathStr.match(/\/[a-z]+(?:\(\))?\[\d+\]/gi);
  if (!segments) return null;

  let current: Node = doc;

  for (const seg of segments) {
    const match = seg.match(/^\/([a-z]+)(?:\(\))?\[(\d+)\]$/i);
    if (!match) return null;

    const [, tag, indexStr] = match;
    const index = parseInt(indexStr, 10);

    if (tag === "text") {
      // Find the Nth text node child
      let textCount = 0;
      for (const child of current.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          textCount++;
          if (textCount === index) return child;
        }
      }
      return null;
    }

    if (tag === "body") {
      const body = (current as Document).body ?? (current as Document).querySelector("body");
      if (!body) return null;
      current = body;
      continue;
    }

    // Find the Nth element child with this tag name
    let elemCount = 0;
    let found: Node | null = null;
    for (const child of current.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE && child.nodeName.toLowerCase() === tag) {
        elemCount++;
        if (elemCount === index) {
          found = child;
          break;
        }
      }
    }

    if (!found) return null;
    current = found;
  }

  return current;
}

/** Get the 1-based index of a text node among its siblings' text nodes. */
function getTextNodeIndex(parent: Node, textNode: Node): number {
  let count = 0;
  for (const child of parent.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      count++;
      if (child === textNode) return count;
    }
  }
  return 1;
}

/** Get the 1-based index of an element among its siblings with the same tag. */
function getElementIndex(parent: Node, element: Element): number {
  const tag = element.nodeName.toLowerCase();
  let count = 0;
  for (const child of parent.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE && child.nodeName.toLowerCase() === tag) {
      count++;
      if (child === element) return count;
    }
  }
  return 1;
}
