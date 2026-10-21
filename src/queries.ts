// ─── Page Queries ────────────────────────────────────────────

export const PAGES_QUERY = `
  query Pages($search: String) {
    page { list(search: $search) {
      id
      name
      slug
      description
      displayName
      published
      publishedAt
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
      pageType
      parentId
      customFields { fieldKey value }
      order
      version
      createdAt
      updatedAt
    } }
  }
`;

// Minimal selection for read-modify-write version guards: avoids fetching the
// full blocks/layout payload when a writer only needs the current version.
export const PAGE_VERSION_QUERY = `
  query PageVersion($pageId: ID!) {
    page { get(pageId: $pageId) {
      id
      version
    } }
  }
`;

export const PAGE_BY_ID_QUERY = `
  query PageById($pageId: ID!) {
    page { get(pageId: $pageId) {
      id
      name
      slug
      description
      displayName
      seoTitle
      seoDescription
      seoKeywords
      customFields { fieldKey value }
      published
      publishedAt
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
      pageType
      parentId
      order
      version
      blocks {
        id
        type
        content: contentWithShared
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
        content: contentWithShared
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
        id type region order isActive
        content: contentWithShared settings style advanced
        translations defaultLanguage
        metadata { createdAt updatedAt createdBy version }
        blockVersion
      }
      publishedLayoutBlocks {
        id type region order isActive
        content: contentWithShared settings style advanced
        translations defaultLanguage
        metadata { createdAt updatedAt createdBy version }
        blockVersion
      }
      layoutOverrides { region action blockId }
      layoutRegionSettings { region values }
      inheritsLayout
      createdAt
      updatedAt
    } }
  }
`;

export const PAGE_RESOLVED_LAYOUTS_QUERY = `
  query PageResolvedLayouts($pageId: ID!) {
    page { resolvedLayouts(pageId: $pageId) {
      region
      isInherited
      sourcePageId
      settings
      settingsAreInherited
      settingsSourcePageId
    } }
  }
`;

export const LAYOUT_REGIONS_QUERY = `
  query LayoutRegions {
    blockManifest { get { regions } }
  }
`;

export const PAGE_REGION_SETTINGS_QUERY = `
  query PageRegionSettings($pageId: ID!) {
    page { get(pageId: $pageId) {
      id
      version
      layoutRegionSettings { region values }
    } }
  }
`;

// ─── Site Config Queries ─────────────────────────────────────

const CART_CONFIG_FRAGMENT = `
  defaultCurrency
  pricesIncludeTax
  defaultTaxRateId
  lowStockThreshold
  reservationTtlMinutes
  maxItemsPerCart
  maxQuantityPerItem
  sessionTTLDays
  loggedInTTLDays
  enableQuoteRequests
  enableSavedCarts
  autoCloseOrders
  returnWindowDays
  taxRates { id name rate }
  shippingMethods {
    id
    label
    price
    etaLabel
    taxRateId
    enabled
    countries
    minSubtotal
    maxSubtotal
    freeAbove
  }
  productSources { modelSlug }
  orderFields {
    key
    label
    type
    required
    customerCanSet
    description
    options { value label }
    minLength
    maxLength
    minValue
    maxValue
    pattern
  }
`;

export const SITE_CONFIG_QUERY = `
  query SiteConfig {
    siteConfig {
      get {
        id
        defaultLanguage
        enabledLanguages
        siteName
        enabledFeatures
        cart { ${CART_CONFIG_FRAGMENT} }
      }
    }
  }
`;

export const SITE_DEFAULT_LANGUAGE_QUERY = `
  query SiteDefaultLanguage {
    siteConfig {
      get {
        defaultLanguage
      }
    }
  }
`;

export const UPDATE_CART_CONFIG_MUTATION = `
  mutation UpdateCartConfig($input: CartConfigInput!) {
    siteConfig {
      updateCart(input: $input) {
        id
        cart { ${CART_CONFIG_FRAGMENT} }
      }
    }
  }
`;

export const CLEAR_CART_CONFIG_MUTATION = `
  mutation ClearCartConfig($force: Boolean) {
    siteConfig {
      clearCart(force: $force) {
        id
        cart { ${CART_CONFIG_FRAGMENT} }
      }
    }
  }
`;

export const BLOCK_MANIFEST_QUERY = `
  query BlockManifest {
    blockManifest {
      get {
        blocks
        hash
        updatedAt
      }
    }
  }
`;

export const BLOCK_USAGE_QUERY = `
  query BlockUsage($types: [String!], $includeHistory: Boolean) {
    blockManifest {
      usage(types: $types, includeHistory: $includeHistory) {
        manifestPresent
        orphanTypes
        unusedTypes
        types {
          type
          registered
          draftCount
          publishedCount
          layoutDraftCount
          layoutPublishedCount
          devDraftCount
          historyCount
          pages { id name slug surfaces }
        }
      }
    }
  }
`;

// ─── Workspace Queries ───────────────────────────────────────

export const CURRENT_WORKSPACE_QUERY = `
  query CurrentWorkspace {
    workspace {
      current {
        id
        name
        slug
        organization {
          id
          name
          slug
          plan
          limits {
            maxPages
            maxMembers
            maxWorkspaces
            maxStorageMb
            maxApiRequestsMonth
            maxBandwidthGbMonth
            canRemoveBranding
            canUseCart
          }
        }
      }
    }
  }
`;

// ─── Media Queries ───────────────────────────────────────────

export const MEDIA_ASSETS_QUERY = `
  query MediaAssets($limit: Int, $offset: Int) {
    media {
      list(limit: $limit, offset: $offset) {
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
  }
`;

export const AUTHORIZE_MEDIA_UPLOAD_MUTATION = `
  mutation AuthorizeMediaUpload($filename: String!, $mimeType: String!, $size: Int!) {
    media {
      authorizeUpload(filename: $filename, mimeType: $mimeType, size: $size) {
        pathname
        uploadUrl
        validUntil
        maximumSizeInBytes
      }
    }
  }
`;

export const REGISTER_MEDIA_UPLOAD_MUTATION = `
  mutation RegisterMediaUpload($input: UploadMediaInput!) {
    media {
      upload(input: $input) {
        id
        url
        filename
        type
        mimeType
        size
      }
    }
  }
`;

export const UPDATE_MEDIA_MUTATION = `
  mutation UpdateMedia($id: ID!, $input: UpdateMediaInput!) {
    media {
      update(id: $id, input: $input) {
        id
      }
    }
  }
`;

// ─── Media Folder Queries & Mutations ────────────────────────

export const MEDIA_FOLDERS_QUERY = `
  query MediaFolders($parentId: ID) {
    media {
      folders(parentId: $parentId) {
        items {
          id
          name
          parentId
        }
        total
      }
    }
  }
`;

export const CREATE_MEDIA_FOLDER_MUTATION = `
  mutation CreateMediaFolder($input: CreateMediaFolderInput!) {
    media {
      createFolder(input: $input) {
        id
        name
        parentId
      }
    }
  }
`;

export const UPDATE_MEDIA_FOLDER_MUTATION = `
  mutation UpdateMediaFolder($id: ID!, $input: UpdateMediaFolderInput!) {
    media {
      updateFolder(id: $id, input: $input) {
        id
        name
        parentId
      }
    }
  }
`;

export const DELETE_MEDIA_FOLDER_MUTATION = `
  mutation DeleteMediaFolder($id: ID!, $deleteContents: Boolean, $force: Boolean) {
    media {
      deleteFolder(id: $id, deleteContents: $deleteContents, force: $force) {
        id
        deleted
      }
    }
  }
`;

// ─── Page Mutations ──────────────────────────────────────────

export const SAVE_PAGE_MUTATION = `
  mutation SavePage($input: SavePageInput!) {
    page { save(input: $input) {
      id
      blockWarnings
      version
      name
      slug
      description
      displayName
      seoTitle
      seoDescription
      seoKeywords
      customFields { fieldKey value }
      published
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
      pageType
      parentId
      blocks {
        id
        type
        content: contentWithShared
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
    } }
  }
`;

// Minimal selection set on purpose - patch_block_content exists to avoid
// round-tripping multi-KB HTML content, so we only confirm the mutation
// landed (id, draft state, timestamp) instead of pulling every block's
// content back. Callers who need the full page can fetch it with
// PAGE_BY_ID_QUERY afterwards.
export const PATCH_BLOCK_CONTENT_MUTATION = `
  mutation PatchBlockContent($input: PatchBlockContentInput!) {
    page { patchBlockContent(input: $input) {
      id
      blockWarnings
      slug
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
      updatedAt
    } }
  }
`;

export const DEV_DRAFT_QUERY = `
  query DevDraft($pageId: String!) {
    page { devDraft(pageId: $pageId) {
      pageId
      updatedAt
      blocks {
        id
        type
        content: contentWithShared
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
    } }
  }
`;

export const SAVE_DEV_DRAFT_MUTATION = `
  mutation SaveDevDraft($input: SaveDevDraftInput!) {
    page { saveDevDraft(input: $input) {
      pageId
      updatedAt
    } }
  }
`;

export const PROMOTE_DEV_DRAFT_MUTATION = `
  mutation PromoteDevDraft($input: PromoteDevDraftInput!) {
    page { promoteDevDraft(input: $input) {
      id
      blockWarnings
      updatedAt
    } }
  }
`;

export const UPDATE_PAGE_SETTINGS_MUTATION = `
  mutation UpdatePageSettings($input: UpdatePageSettingsInput!) {
    page { updateSettings(input: $input) {
      id
      name
      slug
      description
      displayName
      seoTitle
      seoDescription
      seoKeywords
      customFields { fieldKey value }
      pageType
      parentId
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
      updatedAt
    } }
  }
`;

// ─── Page Type Queries / Mutations ───────────────────────────

export const PAGE_TYPES_QUERY = `
  query PageTypes {
    pageType {
      list {
        id
        name
        slug
        description
        icon
        schemaType
        urlPrefix
        allowChildren
        fields {
          key
          label
          type
          required
          description
          options {
            value
            label
          }
          defaultValue
        }
      }
    }
  }
`;

// PropertyField is self-recursive (fields/itemFields are JSON on the wire
// to avoid infinite schema recursion). Keep this in sync with page-type.ts
// resolver's PropertyField object type.
const PROPERTY_FIELD_FRAGMENT = `
  key
  label
  type
  required
  hidden
  memberCanSet
  localized
  description
  defaultValue
  options {
    value
    label
  }
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

export const PAGE_TYPE_QUERY = `
  query PageType($pageTypeId: ID!) {
    pageType {
      get(pageTypeId: $pageTypeId) {
        id
        name
        slug
        description
        icon
        schemaType
        urlPrefix
        allowChildren
        allowedChildTypes
        defaultPublished
        isSystem
        fields { ${PROPERTY_FIELD_FRAGMENT} }
      }
    }
  }
`;

export const UPDATE_PAGE_TYPE_MUTATION = `
  mutation UpdatePageType($input: UpdatePageTypeInput!) {
    pageType {
      update(input: $input) {
        id
        name
        slug
      }
    }
  }
`;

export const DELETE_PAGE_TYPE_MUTATION = `
  mutation DeletePageType($id: ID!) {
    pageType {
      delete(id: $id) {
        id
        deleted
      }
    }
  }
`;

export const CREATE_PAGE_TYPE_MUTATION = `
  mutation CreatePageType($input: CreatePageTypeInput!) {
    pageType {
      create(input: $input) {
        id
        name
        slug
        description
        icon
        schemaType
        urlPrefix
        allowChildren
        fields {
          key
          label
          type
          required
          description
          options {
            value
            label
          }
          defaultValue
        }
      }
    }
  }
`;

export const TAKE_OVER_PAGE_LOCK_MUTATION = `
  mutation TakeOverPageLock($pageId: ID!) {
    page { takeOverLock(pageId: $pageId) {
      lockHolderId
      lockHeldByMe
    } }
  }
`;

export const TOGGLE_PUBLISH_MUTATION = `
  mutation TogglePublish($id: ID!) {
    page { togglePublish(id: $id) {
      id
      slug
      published
      publishedAt
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
      updatedAt
    } }
  }
`;

export const PAGE_DRAFT_STATE_QUERY = `
  query PageDraftState($pageId: ID!) {
    page {
      get(pageId: $pageId) {
        id
        version
        published
        hasUnpublishedContentChanges
        hasUnpublishedLayoutChanges
        blocks { id type content: contentWithShared translations }
      }
    }
  }
`;

export const PUBLISH_PAGE_AT_VERSION_MUTATION = `
  mutation PublishPageAtVersion($id: ID!, $expectedVersion: Int) {
    page { publish(id: $id, expectedVersion: $expectedVersion) { id version } }
  }
`;

export const PUBLISH_PAGE_CONTENT_MUTATION = `
  mutation PublishPageContent($id: ID!) {
    page { publishContent(id: $id) {
      id
      slug
      published
      publishedAt
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
      updatedAt
      blocks {
        id
        type
        content: contentWithShared
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
    } }
  }
`;

export const PUBLISH_PAGE_LAYOUT_MUTATION = `
  mutation PublishPageLayout($id: ID!) {
    page { publishLayout(id: $id) {
      id
      slug
      published
      publishedAt
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
      updatedAt
    } }
  }
`;

export const REVERT_CONTENT_TO_PUBLISHED_MUTATION = `
  mutation RevertContentToPublished($id: ID!) {
    page { revertContentToPublished(id: $id) {
      id
      name
      slug
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
      updatedAt
      blocks {
        id type content: contentWithShared settings style advanced
        translations defaultLanguage blockVersion
      }
    } }
  }
`;

export const REVERT_LAYOUT_TO_PUBLISHED_MUTATION = `
  mutation RevertLayoutToPublished($id: ID!) {
    page { revertLayoutToPublished(id: $id) {
      id
      name
      slug
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
      updatedAt
    } }
  }
`;

export const REMOVE_PAGE_MUTATION = `
  mutation RemovePage($id: ID!) {
    page { delete(id: $id) { deleted } }
  }
`;

export const UPDATE_PAGE_LAYOUT_MUTATION = `
  mutation UpdatePageLayout($input: UpdatePageLayoutInput!) {
    page { updateLayout(input: $input) {
      id
      blockWarnings
      slug
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
      updatedAt
      layoutBlocks {
        id type region order isActive
        content: contentWithShared settings style advanced
        translations defaultLanguage
        metadata { createdAt updatedAt createdBy version }
        blockVersion
      }
      layoutOverrides { region action blockId }
      inheritsLayout
    } }
  }
`;

export const UPDATE_LAYOUT_REGION_SETTINGS_MUTATION = `
  mutation UpdateLayoutRegionSettings($input: UpdatePageLayoutInput!) {
    page { updateLayout(input: $input) {
      id
      version
      blockWarnings
      hasUnpublishedLayoutChanges
      updatedAt
      layoutRegionSettings { region values }
    } }
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
    width order showWhen requiredWhen
  }
  settings {
    actionType emailRecipients
    submitButtonLabel successMessage errorMessage
    redirectUrl requireLogin
    saveSubmissions sendEmailNotification emailConfigurationId
  }
  submissionCount
  createdAt updatedAt createdBy updatedBy
`;

export const FORMS_QUERY = `
  query Forms($status: String, $skip: Int, $limit: Int) {
    form {
      list(status: $status, skip: $skip, limit: $limit) {
        forms { ${FORM_FIELDS_FRAGMENT} }
        total
        hasMore
      }
    }
  }
`;

export const FORM_BY_ID_QUERY = `
  query Form($formId: ID!) {
    form {
      get(formId: $formId) {
        ${FORM_FIELDS_FRAGMENT}
      }
    }
  }
`;

export const FORM_SUBMISSIONS_QUERY = `
  query FormSubmissions($formId: ID, $status: String, $skip: Int, $limit: Int) {
    form {
      submissions(formId: $formId, status: $status, skip: $skip, limit: $limit) {
        submissions {
          id formId formSlug data status
          ipAddress userAgent referrer customerId
          processedAt emailSent createdAt
        }
        total
        hasMore
      }
    }
  }
`;

export const FORM_SUBMISSION_BY_ID_QUERY = `
  query FormSubmission($submissionId: ID!) {
    form {
      submission(submissionId: $submissionId) {
        id formId formSlug data status
        ipAddress userAgent referrer customerId
        processedAt emailSent createdAt
      }
    }
  }
`;

// ─── Form Mutations ──────────────────────────────────────────

export const CREATE_FORM_MUTATION = `
  mutation CreateForm($input: CreateFormInput!) {
    form {
      create(input: $input) {
        ${FORM_FIELDS_FRAGMENT}
      }
    }
  }
`;

export const UPDATE_FORM_MUTATION = `
  mutation UpdateForm($formId: ID!, $input: UpdateFormInput!) {
    form {
      update(formId: $formId, input: $input) {
        ${FORM_FIELDS_FRAGMENT}
      }
    }
  }
`;

export const DELETE_FORM_MUTATION = `
  mutation DeleteForm($formId: ID!) {
    form {
      delete(formId: $formId) {
        id
        deleted
      }
    }
  }
`;

export const UPDATE_FORM_SUBMISSION_STATUS_MUTATION = `
  mutation UpdateFormSubmissionStatus($submissionId: ID!, $status: String!) {
    form {
      setSubmissionStatus(submissionId: $submissionId, status: $status)
    }
  }
`;

export const DELETE_FORM_SUBMISSION_MUTATION = `
  mutation DeleteFormSubmission($submissionId: ID!) {
    form {
      deleteSubmission(submissionId: $submissionId) {
        id
        deleted
      }
    }
  }
`;

// ─── Model Queries ───────────────────────────────────────────

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
  product {
    enabled
    variantAxes
    skuField
    priceField
    inventoryField
    nameField
    currencyField
    imageField
    taxRateField
    roles { name price currency image sku taxRate }
  }
  auth {
    enabled
    strategy
    identityField
    companyField
    verification { required }
    lockout { enabled maxAttempts lockMinutes }
  }
  company { enabled }
  uniqueFields
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
    model {
      list {
        ${MODEL_DEFINITION_FRAGMENT}
      }
    }
  }
`;

// Lightweight companion to MODEL_DEFINITIONS_QUERY: used by get_model's
// slug fallback to avoid pulling full field schemas for every model when
// all we need is the id for a follow-up lookup.
export const MODEL_DEFINITIONS_BY_SLUG_INDEX_QUERY = `
  query ModelDefinitionsSlugIndex {
    model {
      list {
        id
        slug
      }
    }
  }
`;

export const MODEL_DEFINITION_BY_ID_QUERY = `
  query ModelDefinition($id: ID!) {
    model {
      get(id: $id) {
        ${MODEL_DEFINITION_FRAGMENT}
      }
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
    record {
      list(
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
  }
`;

export const MODEL_RECORD_BY_ID_QUERY = `
  query ModelRecord($id: ID!) {
    record {
      get(id: $id) {
        ${MODEL_RECORD_FRAGMENT}
      }
    }
  }
`;

// ─── Model Mutations ─────────────────────────────────────────

const MODEL_DEFINITION_ACK_FRAGMENT = `
  id
  name
  slug
  fields { key }
`;

export const CREATE_MODEL_DEFINITION_MUTATION = `
  mutation CreateModelDefinition($input: CreateModelDefinitionInput!) {
    model {
      create(input: $input) {
        ${MODEL_DEFINITION_ACK_FRAGMENT}
      }
    }
  }
`;

export const UPDATE_MODEL_DEFINITION_MUTATION = `
  mutation UpdateModelDefinition($input: UpdateModelDefinitionInput!) {
    model {
      update(input: $input) {
        ${MODEL_DEFINITION_ACK_FRAGMENT}
      }
    }
  }
`;

export const DELETE_MODEL_DEFINITION_MUTATION = `
  mutation DeleteModelDefinition($id: ID!) {
    model {
      delete(id: $id) {
        id
        deleted
      }
    }
  }
`;

export const CREATE_MODEL_RECORD_MUTATION = `
  mutation CreateModelRecord($input: CreateModelRecordInput!) {
    record {
      create(input: $input) {
        ${MODEL_RECORD_FRAGMENT}
      }
    }
  }
`;

export const PATCH_MODEL_RECORD_MUTATION = `
  mutation PatchModelRecord($input: PatchModelRecordInput!) {
    record {
      patch(input: $input) {
        ${MODEL_RECORD_FRAGMENT}
      }
    }
  }
`;

export const UPDATE_MODEL_RECORD_STATUS_MUTATION = `
  mutation UpdateModelRecordStatus($input: UpdateModelRecordStatusInput!) {
    record {
      setStatus(input: $input) {
        ${MODEL_RECORD_FRAGMENT}
      }
    }
  }
`;

export const DELETE_MODEL_RECORD_MUTATION = `
  mutation DeleteModelRecord($id: ID!, $force: Boolean) {
    record {
      delete(id: $id, force: $force) {
        id
        deleted
      }
    }
  }
`;

export const IMPORT_MODEL_RECORDS_MUTATION = `
  mutation ImportModelRecords($input: ImportModelRecordsInput!) {
    record {
      import(input: $input) {
        importedCount
        updatedCount
        errors { row message }
        records { row id action }
      }
    }
  }
`;

export const BULK_UPDATE_MODEL_RECORDS_MUTATION = `
  mutation BulkUpdateModelRecords($input: BulkUpdateModelRecordsInput!) {
    record {
      bulkUpdate(input: $input) {
        updated
        unchanged
        failedCount
        failed { id message }
        nextCursor
      }
    }
  }
`;

// ─── Commerce: Orders ────────────────────────────────────────

// Selection set reused by every order read + mutation (they all return Order).
// Money fields are integer minor units (cents).
const ORDER_FRAGMENT = `
  id
  paymentStatus
  fulfillmentStatus
  deliveryStatus
  state
  orderNumber
  customerId
  companyId
  companyName
  priceListName
  customerEmail
  currency
  subtotal
  discount
  appliedDiscount { code type value amount }
  tax
  total
  pricesIncludeTax
  amountPaid
  balanceDue
  refundedAmount
  paymentProvider
  paymentReference
  paidAt
  fulfilledAt
  deliveredAt
  closedAt
  shipments {
    id
    carrier
    trackingNumber
    trackingUrl
    labelUrl
    status
    items { itemId quantity }
    shippedAt
    deliveredAt
    events { status at note }
    createdAt
    updatedAt
  }
  returns {
    id
    number
    status
    origin
    lines { itemId quantity reason receivedQuantity restockQuantity }
    note
    carrier
    trackingNumber
    refundedAmount
    suggestedRefund
    events { status at note }
    requestedAt
    receivedAt
    completedAt
    createdAt
    updatedAt
  }
  notes
  invoiceNumber
  invoiceUrl
  invoiceProvider
  invoicedAt
  canceledAt
  pipelineStageId
  poNumber
  customerNote
  shippingTotal
  shippingMethod { id label price taxRateId }
  shippingAddress {
    name
    company
    line1
    line2
    postalCode
    city
    region
    country
    phone
    vatId
  }
  items {
    id
    name
    price
    listPrice
    tierMinQty
    currency
    quantity
    sku
    variantKey
    modelId
    recordId
    recordDeleted
    taxRate
    taxAmount
  }
  payments { amount reference provider at }
  taxSummary { name rate base amount }
  customFields
  createdAt
  updatedAt
`;

// Slim selection for list views - omits items/payments/taxSummary so a page
// of orders does not blow up the agent's context. Use get_order for full detail.
const ORDER_LIST_FRAGMENT = `
  id
  paymentStatus
  fulfillmentStatus
  deliveryStatus
  state
  orderNumber
  customerId
  companyId
  companyName
  customerEmail
  currency
  subtotal
  tax
  total
  amountPaid
  balanceDue
  refundedAmount
  shippingTotal
  poNumber
  pipelineStageId
  createdAt
  updatedAt
`;

export const ORDERS_QUERY = `
  query Orders(
    $paymentStatus: String
    $fulfillmentStatus: String
    $deliveryStatus: OrderDeliveryStatus
    $state: OrderState
    $customerId: ID
    $companyId: ID
    $search: String
    $pipelineStageId: String
    $queue: OrderQueue
    $dateFrom: DateTime
    $dateTo: DateTime
    $skip: Int
    $limit: Int
  ) {
    order {
      list(
        paymentStatus: $paymentStatus
        fulfillmentStatus: $fulfillmentStatus
        deliveryStatus: $deliveryStatus
        state: $state
        customerId: $customerId
        companyId: $companyId
        search: $search
        pipelineStageId: $pipelineStageId
        queue: $queue
        dateFrom: $dateFrom
        dateTo: $dateTo
        skip: $skip
        limit: $limit
      ) {
        items { ${ORDER_LIST_FRAGMENT} }
        total
        hasMore
      }
    }
  }
`;

const ORDER_ACK_FRAGMENT = `
  id
  orderNumber
`;

export const ORDER_BY_ID_QUERY = `
  query Order($id: ID!) {
    order { get(id: $id) { ${ORDER_FRAGMENT} } }
  }
`;

export const ORDER_PIPELINE_QUERY = `
  query OrderPipeline {
    order {
      pipeline {
        stages { id label color position isDefault isTerminal }
      }
    }
  }
`;

export const CREATE_MANUAL_ORDER_MUTATION = `
  mutation CreateManualOrder($input: CreateManualOrderInput!) {
    order { create(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const EDIT_ORDER_MUTATION = `
  mutation EditOrder($input: EditOrderInput!) {
    order { updateItems(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const UPDATE_ORDER_DETAILS_MUTATION = `
  mutation UpdateOrderDetails($input: UpdateOrderDetailsInput!) {
    order { updateDetails(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const MARK_ORDER_PAID_MUTATION = `
  mutation MarkOrderPaid($input: MarkOrderPaidInput!) {
    order { markPaid(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const RECORD_ORDER_PAYMENT_MUTATION = `
  mutation RecordOrderPayment($input: RecordOrderPaymentInput!) {
    order { recordPayment(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const REFUND_ORDER_MUTATION = `
  mutation RefundOrder($input: RefundOrderInput!) {
    order { refund(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const CANCEL_ORDER_MUTATION = `
  mutation CancelOrder($input: CancelOrderInput!) {
    order { cancel(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const CLOSE_ORDER_MUTATION = `
  mutation CloseOrder($input: OrderStateInput!) {
    order { close(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const REOPEN_ORDER_MUTATION = `
  mutation ReopenOrder($input: OrderStateInput!) {
    order { reopen(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const CREATE_SHIPMENT_MUTATION = `
  mutation CreateShipment($input: CreateShipmentInput!) {
    order { createShipment(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const CREATE_RETURN_MUTATION = `
  mutation CreateReturn($input: CreateReturnInput!) {
    order { createReturn(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const APPROVE_RETURN_MUTATION = `
  mutation ApproveReturn($input: ReturnActionInput!) {
    order { approveReturn(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const REJECT_RETURN_MUTATION = `
  mutation RejectReturn($input: ReturnActionInput!) {
    order { rejectReturn(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const CANCEL_RETURN_MUTATION = `
  mutation CancelReturn($input: ReturnActionInput!) {
    order { cancelReturn(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const RECEIVE_RETURN_MUTATION = `
  mutation ReceiveReturn($input: ReceiveReturnInput!) {
    order { receiveReturn(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const REFUND_RETURN_MUTATION = `
  mutation RefundReturn($input: RefundReturnInput!) {
    order { refundReturn(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const COMPLETE_RETURN_MUTATION = `
  mutation CompleteReturn($input: ReturnActionInput!) {
    order { completeReturn(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const UPDATE_RETURN_TRACKING_MUTATION = `
  mutation UpdateReturnTracking($input: UpdateReturnTrackingInput!) {
    order { updateReturnTracking(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const UPDATE_SHIPMENT_MUTATION = `
  mutation UpdateShipment($input: UpdateShipmentInput!) {
    order { updateShipment(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const SET_ORDER_PIPELINE_STAGE_MUTATION = `
  mutation SetOrderPipelineStage($input: SetOrderPipelineStageInput!) {
    order { setPipelineStage(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

export const RECORD_ORDER_INVOICE_MUTATION = `
  mutation RecordOrderInvoice($input: RecordOrderInvoiceInput!) {
    order { recordInvoice(input: $input) { ${ORDER_ACK_FRAGMENT} } }
  }
`;

// ─── Commerce: Carts ─────────────────────────────────────────

export const DELETE_CARTS_MUTATION = `
  mutation DeleteCarts($ids: [ID!]!) {
    adminCart { delete(ids: $ids) }
  }
`;

export const ADMIN_CARTS_QUERY = `
  query AdminCarts($status: String, $skip: Int, $limit: Int) {
    adminCart {
      list(status: $status, skip: $skip, limit: $limit) {
        items {
          id
          status
          customerId
          itemCount
          totalValue
          currency
          createdAt
          updatedAt
        }
        total
        hasMore
      }
    }
  }
`;

// ─── Commerce: Discounts ─────────────────────────────────────

const DISCOUNT_FRAGMENT = `
  id
  code
  type
  value
  currency
  minSubtotal
  maxUses
  currentUses
  startsAt
  endsAt
  enabled
  createdAt
  updatedAt
`;

export const DISCOUNTS_QUERY = `
  query Discounts(
    $enabled: Boolean
    $type: String
    $search: String
    $limit: Int
    $offset: Int
  ) {
    discount {
      list(
        enabled: $enabled
        type: $type
        search: $search
        limit: $limit
        offset: $offset
      ) {
        items { ${DISCOUNT_FRAGMENT} }
        total
        hasMore
      }
    }
  }
`;

export const DISCOUNT_BY_ID_QUERY = `
  query Discount($id: ID!) {
    discount { get(id: $id) { ${DISCOUNT_FRAGMENT} } }
  }
`;

export const CREATE_DISCOUNT_MUTATION = `
  mutation CreateDiscount($input: CreateDiscountInput!) {
    discount { create(input: $input) { ${DISCOUNT_FRAGMENT} } }
  }
`;

export const UPDATE_DISCOUNT_MUTATION = `
  mutation UpdateDiscount($id: ID!, $input: UpdateDiscountInput!) {
    discount { update(id: $id, input: $input) { ${DISCOUNT_FRAGMENT} } }
  }
`;

export const SET_DISCOUNT_ENABLED_MUTATION = `
  mutation SetDiscountEnabled($id: ID!, $enabled: Boolean!) {
    discount { setEnabled(id: $id, enabled: $enabled) { ${DISCOUNT_FRAGMENT} } }
  }
`;

// ─── Webhooks ────────────────────────────────────────────────

const WEBHOOK_ENDPOINT_FRAGMENT = `
  id
  url
  events
  enabled
  description
  createdAt
  updatedAt
`;

export const WEBHOOK_ENDPOINTS_QUERY = `
  query WebhookEndpoints {
    webhook { list { ${WEBHOOK_ENDPOINT_FRAGMENT} } }
  }
`;

export const WEBHOOK_DELIVERIES_QUERY = `
  query WebhookDeliveries($limit: Int) {
    webhook {
      deliveries(limit: $limit) {
        id
        endpointId
        webhookId
        event
        url
        status
        attempts
        responseCode
        error
        nextAttemptAt
        deliveredAt
        createdAt
      }
    }
  }
`;

export const WEBHOOK_EVENT_TYPES_QUERY = `
  query WebhookEventTypes {
    webhook { eventTypes }
  }
`;

export const CREATE_WEBHOOK_ENDPOINT_MUTATION = `
  mutation CreateWebhookEndpoint($input: CreateWebhookEndpointInput!) {
    webhook {
      create(input: $input) {
        secret
        endpoint { ${WEBHOOK_ENDPOINT_FRAGMENT} }
      }
    }
  }
`;

export const UPDATE_WEBHOOK_ENDPOINT_MUTATION = `
  mutation UpdateWebhookEndpoint($input: UpdateWebhookEndpointInput!) {
    webhook { update(input: $input) { ${WEBHOOK_ENDPOINT_FRAGMENT} } }
  }
`;

export const ROTATE_WEBHOOK_SECRET_MUTATION = `
  mutation RotateWebhookSecret($id: ID!) {
    webhook {
      rotateSecret(id: $id) {
        secret
        endpoint { ${WEBHOOK_ENDPOINT_FRAGMENT} }
      }
    }
  }
`;

export const REDELIVER_WEBHOOK_DELIVERY_MUTATION = `
  mutation RedeliverWebhookDelivery($deliveryId: ID!) {
    webhook {
      redeliver(deliveryId: $deliveryId) {
        id
        endpointId
        webhookId
        event
        url
        status
        attempts
        responseCode
        error
        replayOf
        nextAttemptAt
        deliveredAt
        createdAt
      }
    }
  }
`;

export const DELETE_WEBHOOK_ENDPOINT_MUTATION = `
  mutation DeleteWebhookEndpoint($id: ID!) {
    webhook { delete(id: $id) { id deleted } }
  }
`;

// ─── Commerce: Products (catalog over model records) ─────────

export const PRODUCT_CATALOG_QUERY = `
  query ProductCatalog(
    $modelId: ID!
    $filter: ProductCatalogFilterInput
    $limit: Int
    $offset: Int
    $sort: String
  ) {
    product {
      list(
        modelId: $modelId
        filter: $filter
        limit: $limit
        offset: $offset
        sort: $sort
      ) {
        items {
          id
          data
          status
          onHand
          reserved
          available
          hasVariants
          tiers { minQty price }
          variants {
            key
            sku
            price
            onHand
            reserved
            available
            tiers { minQty price }
            selectedOptions { name value }
          }
          createdAt
          updatedAt
        }
        total
        hasMore
        lowStockThreshold
      }
    }
  }
`;

export const SET_PRODUCT_TIERS_MUTATION = `
  mutation SetProductTiers($input: SetProductTiersInput!) {
    product {
      setTiers(input: $input) {
        id
        priceTiers { minQty price }
        variants { id sku price tiers { minQty price } }
      }
    }
  }
`;

export const SET_PRODUCT_VARIANTS_MUTATION = `
  mutation SetProductVariants($input: SetProductVariantsInput!) {
    product {
      setVariants(input: $input) {
        id
        variants {
          id
          sku
          price
          inventory
          tiers { minQty price }
          selectedOptions { name value }
        }
      }
    }
  }
`;

export const BULK_UPDATE_PRODUCT_RECORDS_MUTATION = `
  mutation BulkUpdateProductRecords(
    $modelId: ID!
    $selection: ProductBulkSelectionInput!
    $patch: ProductBulkPatchInput!
  ) {
    product {
      bulkUpdate(modelId: $modelId, selection: $selection, patch: $patch)
    }
  }
`;

export const BULK_DELETE_PRODUCT_RECORDS_MUTATION = `
  mutation BulkDeleteProductRecords(
    $modelId: ID!
    $selection: ProductBulkSelectionInput!
  ) {
    product {
      bulkDelete(modelId: $modelId, selection: $selection) {
        deleted
        skipped {
          id
          name
          reason
        }
      }
    }
  }
`;

export const MEMBERS_QUERY = `
  query Members {
    user {
      list {
        id
        email
        username
        profile {
          displayName
        }
        membershipStatus
        isOrganizationOwner
        joinedAt
        workspaceRole {
          id
          name
        }
      }
    }
  }
`;

// ─── Customer Queries ───

const CUSTOMER_FRAGMENT = `
  id
  modelId
  modelSlug
  modelName
  identity
  displayName
  status
  verified
  lockedUntil
  lastLoginAt
  company { id name }
  companyRole
  priceList { id name }
  effectivePriceList { id name source companyName }
  orderStats { ordersCount lastOrderAt spent { currency amount } }
  createdAt
  updatedAt
`;

export const CUSTOMERS_QUERY = `
  query Customers(
    $modelId: ID
    $status: CustomerStatus
    $search: String
    $companyId: ID
    $skip: Int
    $limit: Int
  ) {
    customer {
      list(
        modelId: $modelId
        status: $status
        search: $search
        companyId: $companyId
        skip: $skip
        limit: $limit
      ) {
        items { ${CUSTOMER_FRAGMENT} }
        total
        hasMore
      }
    }
  }
`;

export const CUSTOMER_BY_ID_QUERY = `
  query Customer($id: ID!) {
    customer {
      get(id: $id) {
        ${CUSTOMER_FRAGMENT}
        record { data }
      }
    }
  }
`;

export const SUSPEND_CUSTOMER_MUTATION = `
  mutation SuspendCustomer($id: ID!) {
    customer { suspend(id: $id) { ${CUSTOMER_FRAGMENT} } }
  }
`;

export const UNSUSPEND_CUSTOMER_MUTATION = `
  mutation UnsuspendCustomer($id: ID!) {
    customer { unsuspend(id: $id) { ${CUSTOMER_FRAGMENT} } }
  }
`;

export const SET_CUSTOMER_COMPANY_ROLE_MUTATION = `
  mutation SetCustomerCompanyRole($id: ID!, $role: String!) {
    customer { setCompanyRole(id: $id, role: $role) { ${CUSTOMER_FRAGMENT} } }
  }
`;

export const SET_CUSTOMER_PRICE_LIST_MUTATION = `
  mutation SetCustomerPriceList($id: ID!, $priceListId: ID) {
    customer { setPriceList(id: $id, priceListId: $priceListId) { ${CUSTOMER_FRAGMENT} } }
  }
`;

export const SEND_CUSTOMER_PASSWORD_RESET_MUTATION = `
  mutation SendCustomerPasswordReset($id: ID!) {
    customer {
      sendPasswordReset(id: $id) { endpointSubscribed customer { ${CUSTOMER_FRAGMENT} } }
    }
  }
`;

export const RESEND_CUSTOMER_VERIFICATION_MUTATION = `
  mutation ResendCustomerVerification($id: ID!) {
    customer {
      resendVerification(id: $id) { endpointSubscribed customer { ${CUSTOMER_FRAGMENT} } }
    }
  }
`;

export const UNLOCK_CUSTOMER_MUTATION = `
  mutation UnlockCustomer($id: ID!) {
    customer { unlock(id: $id) { ${CUSTOMER_FRAGMENT} } }
  }
`;

export const ROLES_QUERY = `
  query WorkspaceRoles {
    role {
      list {
        id
        name
        slug
        permissions
        isDefault
        isSystem
      }
    }
  }
`;

// ─── Commerce: Price lists ───────────────────────────────────

const PRICE_LIST_FRAGMENT = `
  id
  name
  percentOff
  overrideCount
  assignedCount
  createdAt
  updatedAt
`;

const PRICE_LIST_ENTRY_FRAGMENT = `
  id
  priceListId
  recordId
  variantKey
  price
  tiers { minQty price }
  currency
  recordMissing
`;

export const PRICE_LISTS_QUERY = `
  query PriceLists {
    priceList { list { ${PRICE_LIST_FRAGMENT} } }
  }
`;

export const PRICE_LIST_BY_ID_QUERY = `
  query PriceList($id: ID!) {
    priceList { get(id: $id) { ${PRICE_LIST_FRAGMENT} } }
  }
`;

export const PRICE_LIST_ENTRIES_QUERY = `
  query PriceListEntries($priceListId: ID!, $recordId: ID, $first: Int, $after: String) {
    priceList {
      entries(priceListId: $priceListId, recordId: $recordId, first: $first, after: $after) {
        items { ${PRICE_LIST_ENTRY_FRAGMENT} }
        nextCursor
      }
    }
  }
`;

export const CREATE_PRICE_LIST_MUTATION = `
  mutation CreatePriceList($input: CreatePriceListInput!) {
    priceList { create(input: $input) { ${PRICE_LIST_FRAGMENT} } }
  }
`;

export const UPDATE_PRICE_LIST_MUTATION = `
  mutation UpdatePriceList($id: ID!, $input: UpdatePriceListInput!) {
    priceList { update(id: $id, input: $input) { ${PRICE_LIST_FRAGMENT} } }
  }
`;

export const DELETE_PRICE_LIST_MUTATION = `
  mutation DeletePriceList($id: ID!) {
    priceList { delete(id: $id) }
  }
`;

export const SET_PRICE_LIST_ENTRY_MUTATION = `
  mutation SetPriceListEntry($priceListId: ID!, $entry: PriceListEntryInput!) {
    priceList { setEntry(priceListId: $priceListId, entry: $entry) { ${PRICE_LIST_ENTRY_FRAGMENT} } }
  }
`;

export const SET_PRICE_LIST_ENTRIES_MUTATION = `
  mutation SetPriceListEntries($priceListId: ID!, $entries: [PriceListEntryInput!]!) {
    priceList { setEntries(priceListId: $priceListId, entries: $entries) }
  }
`;

export const REMOVE_PRICE_LIST_ENTRIES_MUTATION = `
  mutation RemovePriceListEntries($priceListId: ID!, $keys: [PriceListEntryKeyInput!]!) {
    priceList { removeEntries(priceListId: $priceListId, keys: $keys) }
  }
`;

export const SET_RECORD_PRICE_LIST_MUTATION = `
  mutation SetRecordPriceList($id: ID!, $priceListId: ID) {
    record { setPriceList(id: $id, priceListId: $priceListId) { id priceListId } }
  }
`;
