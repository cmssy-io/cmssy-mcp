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
    } }
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
        canRemoveBranding
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
    page { save(input: $input) {
      id
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
      slug
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
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
          options
          defaultValue
        }
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
        fields { key label type required description options defaultValue }
      }
    }
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
        id type content settings style advanced
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
      slug
      hasUnpublishedContentChanges
      hasUnpublishedLayoutChanges
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
    width order showWhen
  }
  settings {
    actionType webhookUrl emailRecipients
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

// ─── Commerce: Orders ────────────────────────────────────────

// Selection set reused by every order read + mutation (they all return Order).
// Money fields are integer minor units (cents).
const ORDER_FRAGMENT = `
  id
  status
  displayStatus
  paymentStatus
  fulfillmentStatus
  orderNumber
  customerId
  customerEmail
  currency
  subtotal
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
  trackingNumber
  trackingCarrier
  notes
  invoiceNumber
  invoiceUrl
  invoiceProvider
  invoicedAt
  canceledAt
  pipelineStageId
  items {
    name
    price
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
  createdAt
  updatedAt
`;

// Slim selection for list views - omits items/payments/taxSummary so a page
// of orders does not blow up the agent's context. Use get_order for full detail.
const ORDER_LIST_FRAGMENT = `
  id
  status
  paymentStatus
  fulfillmentStatus
  orderNumber
  customerId
  customerEmail
  currency
  subtotal
  tax
  total
  amountPaid
  balanceDue
  refundedAmount
  pipelineStageId
  createdAt
  updatedAt
`;

export const ORDERS_QUERY = `
  query Orders(
    $paymentStatus: String
    $fulfillmentStatus: String
    $customerId: ID
    $search: String
    $pipelineStageId: String
    $dateFrom: DateTime
    $dateTo: DateTime
    $skip: Int
    $limit: Int
  ) {
    order {
      list(
        paymentStatus: $paymentStatus
        fulfillmentStatus: $fulfillmentStatus
        customerId: $customerId
        search: $search
        pipelineStageId: $pipelineStageId
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
    order { create(input: $input) { ${ORDER_FRAGMENT} } }
  }
`;

export const EDIT_ORDER_MUTATION = `
  mutation EditOrder($input: EditOrderInput!) {
    order { updateItems(input: $input) { ${ORDER_FRAGMENT} } }
  }
`;

export const UPDATE_ORDER_DETAILS_MUTATION = `
  mutation UpdateOrderDetails($input: UpdateOrderDetailsInput!) {
    order { updateDetails(input: $input) { ${ORDER_FRAGMENT} } }
  }
`;

export const MARK_ORDER_PAID_MUTATION = `
  mutation MarkOrderPaid($input: MarkOrderPaidInput!) {
    order { markPaid(input: $input) { ${ORDER_FRAGMENT} } }
  }
`;

export const RECORD_ORDER_PAYMENT_MUTATION = `
  mutation RecordOrderPayment($input: RecordOrderPaymentInput!) {
    order { recordPayment(input: $input) { ${ORDER_FRAGMENT} } }
  }
`;

export const REFUND_ORDER_MUTATION = `
  mutation RefundOrder($input: RefundOrderInput!) {
    order { refund(input: $input) { ${ORDER_FRAGMENT} } }
  }
`;

export const CANCEL_ORDER_MUTATION = `
  mutation CancelOrder($input: CancelOrderInput!) {
    order { cancel(input: $input) { ${ORDER_FRAGMENT} } }
  }
`;

export const TRANSITION_ORDER_FULFILLMENT_MUTATION = `
  mutation TransitionOrderFulfillment($input: FulfillOrderInput!) {
    order { transitionFulfillment(input: $input) { ${ORDER_FRAGMENT} } }
  }
`;

export const SET_ORDER_PIPELINE_STAGE_MUTATION = `
  mutation SetOrderPipelineStage($input: SetOrderPipelineStageInput!) {
    order { setPipelineStage(input: $input) { ${ORDER_FRAGMENT} } }
  }
`;

export const RECORD_ORDER_INVOICE_MUTATION = `
  mutation RecordOrderInvoice($input: RecordOrderInvoiceInput!) {
    order { recordInvoice(input: $input) { ${ORDER_FRAGMENT} } }
  }
`;

// ─── Commerce: Carts ─────────────────────────────────────────

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
    productCatalog(
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
        variants {
          key
          sku
          price
          onHand
          reserved
          available
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
`;

export const BULK_UPDATE_PRODUCT_RECORDS_MUTATION = `
  mutation BulkUpdateProductRecords(
    $modelId: ID!
    $selection: ProductBulkSelectionInput!
    $patch: ProductBulkPatchInput!
  ) {
    bulkUpdateProductRecords(
      modelId: $modelId
      selection: $selection
      patch: $patch
    )
  }
`;

export const BULK_DELETE_PRODUCT_RECORDS_MUTATION = `
  mutation BulkDeleteProductRecords(
    $modelId: ID!
    $selection: ProductBulkSelectionInput!
  ) {
    bulkDeleteProductRecords(modelId: $modelId, selection: $selection)
  }
`;

export const MEMBERS_QUERY = `
  query Members {
    users {
      id
      email
      username
      profile {
        displayName
      }
      membershipStatus
      isWorkspaceOwner
      invitedAt
      joinedAt
      workspaceRole {
        id
        name
      }
    }
  }
`;

export const ROLES_QUERY = `
  query WorkspaceRoles {
    workspaceRoles {
      id
      name
      slug
      permissions
      isDefault
      isSystem
    }
  }
`;
