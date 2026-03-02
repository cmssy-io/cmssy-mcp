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
        key
        type
        label
        defaultValue
        placeholder
        required
        helperText
        options
        group
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
        key
        type
        label
        defaultValue
        placeholder
        required
        helperText
        options
        group
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
      header
      footer
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

export const REMOVE_PAGE_MUTATION = `
  mutation RemovePage($id: ID!) {
    removePage(id: $id)
  }
`;
