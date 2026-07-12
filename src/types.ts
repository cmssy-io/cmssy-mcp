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

// LayoutOverride from @cmssy/types uses stricter types (LayoutPosition, LayoutOverrideAction).
// MCP uses string since GraphQL returns strings. Keep local for compatibility.
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
  customFields: Array<{ fieldKey: string; value: unknown }>;
  published: boolean;
  publishedAt: string | null;
  hasUnpublishedContentChanges: boolean;
  hasUnpublishedLayoutChanges: boolean;
  layoutBlocks: LayoutBlock[];
  publishedLayoutBlocks: LayoutBlock[];
  layoutOverrides: LayoutOverride[];
  inheritsLayout: boolean;
  pageType: string;
  parentId: string | null;
  order: number;
  /** Monotonic save counter; used as the optimistic-concurrency expectedVersion. */
  version: number;
  createdAt: string;
  updatedAt: string;
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

export type OrganizationLimits = {
  maxPages: number;
  maxMembers: number;
  maxWorkspaces: number;
  maxStorageMb: number;
  maxAiTokensMonth: number;
  maxApiRequestsMonth: number;
  maxBandwidthGbMonth: number;
  canRemoveBranding: boolean;
  canUseCart: boolean;
};

export interface WorkspaceOrganization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  limits: OrganizationLimits;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  organization: WorkspaceOrganization | null;
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
