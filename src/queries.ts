import { blockFieldGraphQLSelection } from "@cmssy/types";

const SCHEMA_FIELDS_FRAGMENT = blockFieldGraphQLSelection();

// ─── Page Queries ────────────────────────────────────────────

export const PAGES_QUERY = `
  query Pages {
    pages {
      id
      name
      slug
      description
      displayName
      published
      publishedAt
      hasUnpublishedChanges
      pageType
      parentId
      order
      createdAt
      updatedAt
    }
  }
`;

export const PAGE_BY_ID_QUERY = `
  query PageById($id: ID!) {
    pageById(id: $id) {
      id
      name
      slug
      description
      displayName
      seoTitle
      seoDescription
      seoKeywords
      published
      publishedAt
      hasUnpublishedChanges
      pageType
      parentId
      order
      blocks {
        id
        type
        content
        settings
        style
        advanced
        translations
        defaultLanguage
        metadata {
          createdAt
          updatedAt
          createdBy
          version
        }
        blockVersion
      }
      publishedBlocks {
        id
        type
        content
        settings
        style
        advanced
        translations
        defaultLanguage
        metadata {
          createdAt
          updatedAt
          createdBy
          version
        }
        blockVersion
      }
      layoutBlocks {
        id type position order isActive
        content settings style advanced
        translations defaultLanguage
        metadata { createdAt updatedAt createdBy version }
        blockVersion
      }
      publishedLayoutBlocks {
        id type position order isActive
        content settings style advanced
        translations defaultLanguage
        metadata { createdAt updatedAt createdBy version }
        blockVersion
      }
      layoutOverrides { position action blockId }
      inheritsLayout
      createdAt
      updatedAt
    }
  }
`;

export const PAGE_BY_SLUG_QUERY = `
  query Page($slug: String!) {
    page(slug: $slug) {
      id
      name
      slug
      description
      displayName
      seoTitle
      seoDescription
      seoKeywords
      published
      publishedAt
      hasUnpublishedChanges
      pageType
      parentId
      order
      blocks {
        id
        type
        content
        settings
        style
        advanced
        translations
        defaultLanguage
        metadata {
          createdAt
          updatedAt
          createdBy
          version
        }
        blockVersion
      }
      publishedBlocks {
        id
        type
        content
        settings
        style
        advanced
        translations
        defaultLanguage
        metadata {
          createdAt
          updatedAt
          createdBy
          version
        }
        blockVersion
      }
      layoutBlocks {
        id type position order isActive
        content settings style advanced
        translations defaultLanguage
        metadata { createdAt updatedAt createdBy version }
        blockVersion
      }
      publishedLayoutBlocks {
        id type position order isActive
        content settings style advanced
        translations defaultLanguage
        metadata { createdAt updatedAt createdBy version }
        blockVersion
      }
      layoutOverrides { position action blockId }
      inheritsLayout
      createdAt
      updatedAt
    }
  }
`;

// ─── Workspace Block Queries ─────────────────────────────────

export const WORKSPACE_BLOCKS_QUERY = `
  query WorkspaceBlocks {
    workspaceBlocks {
      id
      blockType
      name
      description
      icon
      category
      layoutPosition
      interactive
      schemaFields {
        ${SCHEMA_FIELDS_FRAGMENT}
      }
      defaultContent
      version
    }
  }
`;

export const WORKSPACE_BLOCK_BY_TYPE_QUERY = `
  query WorkspaceBlockByType($blockType: String!) {
    workspaceBlockByType(blockType: $blockType) {
      id
      blockType
      name
      description
      icon
      category
      layoutPosition
      interactive
      schemaFields {
        ${SCHEMA_FIELDS_FRAGMENT}
      }
      defaultContent
      version
    }
  }
`;

// ─── Site Config Queries ─────────────────────────────────────

export const SITE_CONFIG_QUERY = `
  query SiteConfig {
    siteConfig {
      id
      defaultLanguage
      enabledLanguages
      siteName
      enabledFeatures
    }
  }
`;

// ─── Workspace Queries ───────────────────────────────────────

export const CURRENT_WORKSPACE_QUERY = `
  query CurrentWorkspace {
    currentWorkspace {
      id
      name
      slug
      plan
      limits {
        maxPages
        maxUsers
        maxStorageMb
        maxAiTokensMonth
        maxWorkspacesOwned
        canUseCustomDomain
        canRemoveBranding
        canUseCustomScripts
        maxCustomBlocks
        maxCustomBlocksStorageMb
      }
    }
  }
`;

// ─── Media Queries ───────────────────────────────────────────

export const MEDIA_ASSETS_QUERY = `
  query MediaAssets($limit: Int, $offset: Int) {
    mediaAssets(limit: $limit, offset: $offset) {
      items {
        id
        url
        filename
        type
        mimeType
        size
        width
        height
        alt
        tags
      }
      total
      hasMore
    }
  }
`;

// ─── Page Mutations ──────────────────────────────────────────

export const SAVE_PAGE_MUTATION = `
  mutation SavePage($input: SavePageInput!) {
    savePage(input: $input) {
      id
      name
      slug
      description
      displayName
      seoTitle
      seoDescription
      seoKeywords
      published
      hasUnpublishedChanges
      pageType
      parentId
      blocks {
        id
        type
        content
        settings
        style
        advanced
        translations
        defaultLanguage
        metadata {
          createdAt
          updatedAt
          createdBy
          version
        }
        blockVersion
      }
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_PAGE_SETTINGS_MUTATION = `
  mutation UpdatePageSettings($input: UpdatePageSettingsInput!) {
    updatePageSettings(input: $input) {
      id
      name
      slug
      description
      displayName
      seoTitle
      seoDescription
      seoKeywords
      pageType
      parentId
      updatedAt
    }
  }
`;

export const TOGGLE_PUBLISH_MUTATION = `
  mutation TogglePublish($id: ID!) {
    togglePublish(id: $id) {
      id
      published
      publishedAt
      hasUnpublishedChanges
    }
  }
`;

export const PUBLISH_PAGE_MUTATION = `
  mutation PublishPage($id: ID!, $blocks: [BlockDataInput!]!) {
    publishPage(id: $id, blocks: $blocks) {
      id
      published
      publishedAt
      hasUnpublishedChanges
      blocks {
        id
        type
        content
        settings
        style
        advanced
        translations
        defaultLanguage
        metadata {
          createdAt
          updatedAt
          createdBy
          version
        }
        blockVersion
      }
    }
  }
`;

export const REVERT_TO_PUBLISHED_MUTATION = `
  mutation RevertToPublished($id: ID!) {
    revertToPublished(id: $id) {
      id
      name
      slug
      hasUnpublishedChanges
      blocks {
        id type content settings style advanced
        translations defaultLanguage blockVersion
      }
    }
  }
`;

export const REMOVE_PAGE_MUTATION = `
  mutation RemovePage($id: ID!) {
    removePage(id: $id)
  }
`;

export const UPDATE_PAGE_LAYOUT_MUTATION = `
  mutation UpdatePageLayout($input: UpdatePageLayoutInput!) {
    updatePageLayout(input: $input) {
      id
      layoutBlocks {
        id type position order isActive
        content settings style advanced
        translations defaultLanguage
        metadata { createdAt updatedAt createdBy version }
        blockVersion
      }
      layoutOverrides { position action blockId }
      inheritsLayout
    }
  }
`;
