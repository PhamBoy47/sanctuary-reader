import JSZip from "jszip";

/**
 * Extracts the cover image from an EPUB ArrayBuffer and returns it as a data URI.
 */
export async function extractEpubCover(data: ArrayBuffer): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(data);

    // 1. Find the OPF path from container.xml
    const containerEntry = zip.file("META-INF/container.xml");
    if (!containerEntry) return null;
    const containerXml = await containerEntry.async("string");
    const opfMatch = containerXml.match(/full-path="([^"]+)"/);
    if (!opfMatch) return null;

    const opfPath = opfMatch[1];
    const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
    const opfEntry = zip.file(opfPath);
    if (!opfEntry) return null;

    const opfXml = await opfEntry.async("string");
    const parser = new DOMParser();
    const doc = parser.parseFromString(opfXml, "application/xml");

    // 2. Identify the cover image ID
    // 2a. Look for <meta name="cover" content="ID" /> (EPUB 2)
    let coverId = doc.querySelector('meta[name="cover"]')?.getAttribute("content");
    
    // 2b. If not found, look for properties="cover-image" (EPUB 3)
    if (!coverId) {
      const coverItem = doc.querySelector('item[properties~="cover-image"]');
      coverId = coverItem?.getAttribute("id") ?? null;
    }

    // 2c. Fallback: look for an item with "cover" in its ID
    if (!coverId) {
      const fallbackItem = doc.querySelector('item[id*="cover"]');
      coverId = fallbackItem?.getAttribute("id") ?? null;
    }

    if (!coverId) return null;

    // 3. Find the file path from the manifest
    const manifestItem = doc.getElementById(coverId);
    if (!manifestItem) return null;

    const href = manifestItem.getAttribute("href");
    if (!href) return null;

    const relativePath = opfDir + href;
    const cleanPath = relativePath.split("/").map(p => {
       if (p === "..") return ""; // simplistic relative path resolver
       return p;
    }).filter(Boolean).join("/");
    
    // Try to find the file exactly or with variations if ZIP structure is weird
    const coverFile = zip.file(relativePath) || zip.file(cleanPath);
    if (!coverFile) {
        // Ultimate fallback: search for anything ending with the href
        const search = Object.keys(zip.files).find(k => k.endsWith(href));
        if (search) {
             const found = zip.file(search);
             if (found) {
                 const b64 = await found.async("base64");
                 const ext = href.split(".").pop()?.toLowerCase() ?? "jpeg";
                 return `data:image/${ext};base64,${b64}`;
             }
        }
        return null;
    }

    const b64 = await coverFile.async("base64");
    const ext = href.split(".").pop()?.toLowerCase() ?? "jpeg";
    return `data:image/${ext};base64,${b64}`;

  } catch (err) {
    console.error("Error extracting EPUB cover:", err);
    return null;
  }
}
