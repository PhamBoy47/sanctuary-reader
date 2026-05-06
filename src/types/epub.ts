import JSZip from "jszip";
import { TocItem } from "../components/DocumentTocSidebar";

export interface SpineItem { id: string; href: string; }
export interface ManifestItem { id: string; href: string; mediaType: string; }

export interface EpubTocItem extends TocItem {
  href: string;
  children?: EpubTocItem[];
}

export interface ParsedEpub {
  zip: JSZip;
  spine: SpineItem[];
  toc: EpubTocItem[];
}

export interface EpubSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  margin: number;
  theme: "original" | "light" | "sepia" | "warm" | "cool" | "dark" | "midnight";
  isTwoPage: boolean;
  paginationMode: boolean;
}
