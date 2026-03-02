export interface BlockData {
  id: string;
  type: string;
  content?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  style?: Record<string, unknown>;
  advanced?: Record<string, unknown>;
  translations?: Record<string, { status: string }>;
  defaultLanguage?: string;
  metadata?: Record<string, unknown>;
  blockVersion?: string;
}

export interface LayoutBlock {
  id: string;
  type: string;
  position: string;
  order: number;
  isActive: boolean;
  content?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  style?: Record<string, unknown>;
  advanced?: Record<string, unknown>;
  translations?: Record<string, { status: string }>;
  defaultLanguage?: string;
  metadata?: Record<string, unknown>;
  blockVersion?: string;
}

export interface LayoutOverride {
  position: string;
  action: string;
  blockId?: string;
}

export interface Page {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  blocks: BlockData[];
  publishedBlocks: BlockData[];
  displayName: Record<string, string>;
  seoTitle: Record<string, string> | null;
  seoDescription: Record<string, string> | null;
  seoKeywords: string[];
  published: boolean;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  layoutBlocks: LayoutBlock[];
  publishedLayoutBlocks: LayoutBlock[];
  layoutOverrides: LayoutOverride[];
  inheritsLayout: boolean;
  pageType: string;
  parentId: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceBlock {
  id: string;
  blockType: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  layoutPosition: string | null;
  interactive: boolean;
  schemaFields: SchemaField[];
  defaultContent: Record<string, unknown>;
  version: string;
}

export interface SchemaField {
  key: string;
  type: string;
  label: string;
  defaultValue?: unknown;
  placeholder?: string;
  required?: boolean;
  helperText?: string;
  options?: unknown;
  group?: string;
}

export interface SiteConfig {
  id: string;
  defaultLanguage: string;
  enabledLanguages: string[];
  siteName: Record<string, string>;
  enabledFeatures: string[];
  header: unknown;
  footer: unknown;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  limits: Record<string, unknown>;
}

export interface MediaAsset {
  id: string;
  url: string;
  filename: string;
  type: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: Record<string, string>;
  tags: string[];
}

export interface BlockInput {
  id: string;
  type: string;
  content?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  style?: Record<string, unknown>;
  advanced?: Record<string, unknown>;
  translations?: Record<string, { status: string }>;
  defaultLanguage?: string;
  metadata?: Record<string, unknown>;
  blockVersion?: string;
}
