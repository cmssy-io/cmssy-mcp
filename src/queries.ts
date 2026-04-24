import { blockFieldGraphQLSelection } from "@cmssy/types";

const SCHEMA_FIELDS_FRAGMENT = blockFieldGraphQLSelection();

// ─── Page Queries ────────────────────────────────────────────

export const PAGES_QUERY = `
  query Pages($search: String) {
    pages(search: $search) {
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
  query PageById($pageId: ID!) {
    page(pageId: $pageId) {
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

// Minimal selection set on purpose - patch_block_content exists to avoid
// round-tripping multi-KB HTML content, so we only confirm the mutation
// landed (id, draft state, timestamp) instead of pulling every block's
// content back. Callers who need the full page can fetch it with
// PAGE_BY_ID_QUERY afterwards.
export const PATCH_BLOCK_CONTENT_MUTATION = `
  mutation PatchBlockContent($input: PatchBlockContentInput!) {
    patchBlockContent(input: $input) {
      id
      slug
      hasUnpublishedChanges
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
      hasUnpublishedChanges
      updatedAt
    }
  }
`;

export const TOGGLE_PUBLISH_MUTATION = `
  mutation TogglePublish($id: ID!) {
    togglePublish(id: $id) {
      id
      slug
      published
      publishedAt
      hasUnpublishedChanges
      updatedAt
    }
  }
`;

export const PUBLISH_PAGE_MUTATION = `
  mutation PublishPage($id: ID!, $blocks: [BlockDataInput!]!) {
    publishPage(id: $id, blocks: $blocks) {
      id
      slug
      published
      publishedAt
      hasUnpublishedChanges
      updatedAt
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
      updatedAt
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
      slug
      hasUnpublishedChanges
      updatedAt
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

// ─── Form Queries ────────────────────────────────────────────

const FORM_FIELDS_FRAGMENT = `
  id
  name
  slug
  description
  status
  fields {
    id name fieldType
    label placeholder helpText
    defaultValue
    validation { required minLength maxLength minValue maxValue pattern customMessage }
    options { value label disabled }
    width order showIf
  }
  settings {
    actionType webhookUrl emailRecipients newsletterListId
    submitButtonLabel successMessage errorMessage
    redirectUrl enableCaptcha requireLogin
    saveSubmissions sendEmailNotification emailConfigurationId
  }
  submissionCount
  createdAt updatedAt createdBy updatedBy
`;

export const FORMS_QUERY = `
  query Forms($status: String, $skip: Int, $limit: Int) {
    forms(status: $status, skip: $skip, limit: $limit) {
      forms { ${FORM_FIELDS_FRAGMENT} }
      total
      hasMore
    }
  }
`;

export const FORM_BY_ID_QUERY = `
  query Form($formId: ID!) {
    form(formId: $formId) {
      ${FORM_FIELDS_FRAGMENT}
    }
  }
`;

export const FORM_SUBMISSIONS_QUERY = `
  query FormSubmissions($formId: ID, $status: String, $skip: Int, $limit: Int) {
    formSubmissions(formId: $formId, status: $status, skip: $skip, limit: $limit) {
      submissions {
        id formId formSlug data status
        ipAddress userAgent referrer customerId
        processedAt emailSent webhookSent createdAt
      }
      total
      hasMore
    }
  }
`;

export const FORM_SUBMISSION_BY_ID_QUERY = `
  query FormSubmission($submissionId: ID!) {
    formSubmission(submissionId: $submissionId) {
      id formId formSlug data status
      ipAddress userAgent referrer customerId
      processedAt emailSent webhookSent createdAt
    }
  }
`;

// ─── Form Mutations ──────────────────────────────────────────

export const CREATE_FORM_MUTATION = `
  mutation CreateForm($input: CreateFormInput!) {
    createForm(input: $input) {
      ${FORM_FIELDS_FRAGMENT}
    }
  }
`;

export const UPDATE_FORM_MUTATION = `
  mutation UpdateForm($formId: ID!, $input: UpdateFormInput!) {
    updateForm(formId: $formId, input: $input) {
      ${FORM_FIELDS_FRAGMENT}
    }
  }
`;

export const DELETE_FORM_MUTATION = `
  mutation DeleteForm($formId: ID!) {
    deleteForm(formId: $formId)
  }
`;

export const UPDATE_FORM_SUBMISSION_STATUS_MUTATION = `
  mutation UpdateFormSubmissionStatus($submissionId: ID!, $status: String!) {
    updateFormSubmissionStatus(submissionId: $submissionId, status: $status)
  }
`;

export const DELETE_FORM_SUBMISSION_MUTATION = `
  mutation DeleteFormSubmission($submissionId: ID!) {
    deleteFormSubmission(submissionId: $submissionId)
  }
`;

// ─── Model Queries ───────────────────────────────────────────

// PropertyField is self-recursive (fields/itemFields are JSON on the wire
// to avoid infinite schema recursion). Keep this in sync with page-type.ts
// resolver's PropertyField object type.
const PROPERTY_FIELD_FRAGMENT = `
  key
  label
  type
  required
  description
  defaultValue
  options
  fields
  itemType
  itemFields
  relationTo
  relationType
  acceptedTypes
  multiple
  schemaProperty
  minLength
  maxLength
  minValue
  maxValue
  pattern
`;

const MODEL_DEFINITION_FRAGMENT = `
  id
  workspaceId
  name
  slug
  description
  icon
  color
  displayField
  defaultSort { field direction }
  fields { ${PROPERTY_FIELD_FRAGMENT} }
  statusField {
    enabled
    values
    defaultValue
    transitions { from to }
  }
  createdAt
  updatedAt
  createdBy
  recordCount
`;

const MODEL_RECORD_FRAGMENT = `
  id
  workspaceId
  modelId
  data
  status
  createdAt
  updatedAt
  createdBy
  updatedBy
`;

export const MODEL_DEFINITIONS_QUERY = `
  query ModelDefinitions {
    modelDefinitions {
      ${MODEL_DEFINITION_FRAGMENT}
    }
  }
`;

// Lightweight companion to MODEL_DEFINITIONS_QUERY: used by get_model's
// slug fallback to avoid pulling full field schemas for every model when
// all we need is the id for a follow-up lookup.
export const MODEL_DEFINITIONS_BY_SLUG_INDEX_QUERY = `
  query ModelDefinitionsSlugIndex {
    modelDefinitions {
      id
      slug
    }
  }
`;

export const MODEL_DEFINITION_BY_ID_QUERY = `
  query ModelDefinition($id: ID!) {
    modelDefinition(id: $id) {
      ${MODEL_DEFINITION_FRAGMENT}
    }
  }
`;

export const MODEL_RECORDS_QUERY = `
  query ModelRecords(
    $modelId: ID!
    $filter: JSON
    $limit: Int
    $offset: Int
    $sort: String
    $populate: [String!]
  ) {
    modelRecords(
      modelId: $modelId
      filter: $filter
      limit: $limit
      offset: $offset
      sort: $sort
      populate: $populate
    ) {
      items { ${MODEL_RECORD_FRAGMENT} }
      total
      hasMore
    }
  }
`;

export const MODEL_RECORD_BY_ID_QUERY = `
  query ModelRecord($id: ID!) {
    modelRecord(id: $id) {
      ${MODEL_RECORD_FRAGMENT}
    }
  }
`;

export const MODEL_TEMPLATES_QUERY = `
  query ModelTemplates {
    modelTemplates {
      id
      name
      description
      icon
      category
      models {
        name
        slug
        description
        icon
        fieldCount
        hasStatus
      }
    }
  }
`;

// ─── Model Mutations ─────────────────────────────────────────

export const CREATE_MODEL_DEFINITION_MUTATION = `
  mutation CreateModelDefinition($input: CreateModelDefinitionInput!) {
    createModelDefinition(input: $input) {
      ${MODEL_DEFINITION_FRAGMENT}
    }
  }
`;

export const UPDATE_MODEL_DEFINITION_MUTATION = `
  mutation UpdateModelDefinition($input: UpdateModelDefinitionInput!) {
    updateModelDefinition(input: $input) {
      ${MODEL_DEFINITION_FRAGMENT}
    }
  }
`;

export const DELETE_MODEL_DEFINITION_MUTATION = `
  mutation DeleteModelDefinition($id: ID!) {
    deleteModelDefinition(id: $id)
  }
`;

export const CREATE_MODEL_RECORD_MUTATION = `
  mutation CreateModelRecord($input: CreateModelRecordInput!) {
    createModelRecord(input: $input) {
      ${MODEL_RECORD_FRAGMENT}
    }
  }
`;

export const UPDATE_MODEL_RECORD_MUTATION = `
  mutation UpdateModelRecord($input: UpdateModelRecordInput!) {
    updateModelRecord(input: $input) {
      ${MODEL_RECORD_FRAGMENT}
    }
  }
`;

export const UPDATE_MODEL_RECORD_STATUS_MUTATION = `
  mutation UpdateModelRecordStatus($input: UpdateModelRecordStatusInput!) {
    updateModelRecordStatus(input: $input) {
      ${MODEL_RECORD_FRAGMENT}
    }
  }
`;

export const DELETE_MODEL_RECORD_MUTATION = `
  mutation DeleteModelRecord($id: ID!) {
    deleteModelRecord(id: $id)
  }
`;

export const IMPORT_MODEL_RECORDS_MUTATION = `
  mutation ImportModelRecords($input: ImportModelRecordsInput!) {
    importModelRecords(input: $input) {
      importedCount
      errors { row message }
    }
  }
`;

export const INSTALL_MODEL_TEMPLATE_MUTATION = `
  mutation InstallModelTemplate($templateId: String!) {
    installModelTemplate(templateId: $templateId) {
      templateId
      installedCount
      skippedSlugs
    }
  }
`;
