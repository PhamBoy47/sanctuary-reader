import pako from 'pako';
import { DictionaryData, getDictionaries } from './dictionaryStore';

interface DictIndex {
  offset: number;
  size: number;
}

class StarDictInstance {
  private ifo: Record<string, string> = {};
  private index = new Map<string, DictIndex>();
  private dictData: ArrayBuffer;

  constructor(data: DictionaryData) {
    this.dictData = this.prepareDictData(data.dictData);
    this.parseIfo(data.ifoData);
    this.parseIdx(data.idxData);
  }

  private prepareDictData(buffer: ArrayBuffer): ArrayBuffer {
    const uint8 = new Uint8Array(buffer);
    if (uint8[0] === 0x1f && uint8[1] === 0x8b) {
      try {
        console.log("Decompressing StarDict .dz data...");
        return pako.inflate(uint8).buffer;
      } catch (e) {
        console.error("Failed to decompress .dz dictionary:", e);
        return buffer;
      }
    }
    return buffer;
  }

  private parseIfo(content: string) {
    const lines = content.split('\n');
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length === 2) {
        this.ifo[parts[0].trim()] = parts[1].trim();
      }
    }
  }

  private parseIdx(buffer: ArrayBuffer) {
    const view = new DataView(buffer);
    const decoder = new TextDecoder();
    let pos = 0;

    while (pos < buffer.byteLength) {
      let wordEnd = pos;
      while (wordEnd < buffer.byteLength && view.getUint8(wordEnd) !== 0) {
        wordEnd++;
      }

      if (wordEnd >= buffer.byteLength) break;

      const word = decoder.decode(buffer.slice(pos, wordEnd));
      pos = wordEnd + 1;

      const offset = view.getUint32(pos);
      pos += 4;
      const size = view.getUint32(pos);
      pos += 4;

      this.index.set(word.toLowerCase(), { offset, size });
    }
  }

  public async lookup(word: string): Promise<string | null> {
    const entry = this.index.get(word.toLowerCase());
    if (!entry) return null;

    // We now slice from the raw (already decompressed) this.dictData
    const chunk = this.dictData.slice(entry.offset, entry.offset + entry.size);
    return new TextDecoder().decode(chunk);
  }
}

// Memory cache for active StarDict instances
const instanceCache = new Map<string, StarDictInstance>();

export async function lookupWord(word: string): Promise<string[]> {
  const dictionaries = await getDictionaries();
  const enabled = dictionaries.filter(d => d.enabled);
  const results: string[] = [];
  
  const searchTerms = [word.toLowerCase()];
  
  // Basic lemmatization/suffix stripping fallback
  if (word.length > 3) {
    if (word.endsWith('s')) searchTerms.push(word.slice(0, -1).toLowerCase());
    if (word.endsWith('es')) searchTerms.push(word.slice(0, -2).toLowerCase());
    if (word.endsWith('ed')) searchTerms.push(word.slice(0, -2).toLowerCase());
    if (word.endsWith('ing')) searchTerms.push(word.slice(0, -3).toLowerCase());
  }

  for (const dict of enabled) {
    try {
      let instance = instanceCache.get(dict.id);
      if (!instance) {
        instance = new StarDictInstance(dict);
        instanceCache.set(dict.id, instance);
      }
      
      // Try each search term until we find a definition in this dictionary
      for (const term of searchTerms) {
        const definition = await instance.lookup(term);
        if (definition) {
          results.push(definition);
          break; // Found it, move to next dictionary
        }
      }
    } catch (err) {
      console.error(`StarDict lookup error in ${dict.name}:`, err);
    }
  }

  return results;
}

export function clearDictionaryCache() {
  instanceCache.clear();
}
