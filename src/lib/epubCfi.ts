export function generateCfi(range: Range, spineIndex: number): string {
  const startPath = nodeToPath(range.startContainer, range.startOffset);
  const endPath = nodeToPath(range.endContainer, range.endOffset);

  if (!startPath || !endPath) return "";

  return `/spine[${spineIndex}]!${startPath.path}:${startPath.offset},${endPath.path}:${endPath.offset}`;
}

export function resolveCfi(cfi: string, context: Document | ShadowRoot): Range | null {
  try {
    const match = cfi.match(/^\/spine\[\d+\]!(.+):(\d+),(.+):(\d+)$/);
    if (!match) return null;

    const [, startPathStr, startOffsetStr, endPathStr, endOffsetStr] = match;
    const startOffset = parseInt(startOffsetStr, 10);
    const endOffset = parseInt(endOffsetStr, 10);

    const startNode = pathToNode(startPathStr, context);
    const endNode = pathToNode(endPathStr, context);

    if (!startNode || !endNode) return null;

    const range = document.createRange();
    range.setStart(startNode, Math.min(startOffset, startNode.textContent?.length ?? 0));
    range.setEnd(endNode, Math.min(endOffset, endNode.textContent?.length ?? 0));
    return range;
  } catch {
    return null;
  }
}

function nodeToPath(node: Node, offset: number): { path: string; offset: number } | null {
  const parts: string[] = [];
  let current: Node | null = node;

  if (current.nodeType === Node.TEXT_NODE) {
    const parent = current.parentNode;
    if (!parent) return null;
    const textIndex = getTextNodeIndex(parent, current);
    parts.unshift(`/text()[${textIndex}]`);
    current = parent;
  } else {
    if (current.nodeType === Node.ELEMENT_NODE && offset > 0) {
      const childNodes = current.childNodes;
      let textCount = 0;
      for (let i = 0; i < offset && i < childNodes.length; i++) {
        if (childNodes[i].nodeType === Node.TEXT_NODE) {
          textCount++;
        }
      }
      const textIdx = Math.max(1, textCount);
      parts.unshift(`/text()[${textIdx}]`);
    } else {
      parts.unshift(`/text()[1]`);
    }
  }

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

function pathToNode(pathStr: string, context: Document | ShadowRoot): Node | null {
  const segments = pathStr.match(/\/[a-z]+(?:\(\))?\[\d+\]/gi);
  if (!segments) return null;

  let current: Node = context;

  for (const seg of segments) {
    const match = seg.match(/^\/([a-z]+)(?:\(\))?\[(\d+)\]$/i);
    if (!match) return null;

    const [, tag, indexStr] = match;
    const index = parseInt(indexStr, 10);

    if (tag === "text") {
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
      const body = context instanceof Document
        ? (context.body ?? context.querySelector("body"))
        : (context as ShadowRoot).querySelector("body");
      if (!body) return null;
      current = body;
      continue;
    }

    if (tag === "html") {
      const html = context instanceof Document
        ? context.documentElement
        : (context as ShadowRoot).querySelector("html");
      if (!html) return null;
      current = html;
      continue;
    }

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
