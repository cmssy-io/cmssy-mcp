# @cmssy/mcp-server

## 0.64.0

- **`get_workspace_info` no longer reports `maxAiTokensMonth` (CMS-1761).**
  AI in cmssy is bring-your-own-key only; the platform credit allowance and
  its `OrganizationLimits.maxAiTokensMonth` field are gone from the backend
  (cmssy#2452), so the workspace query stops selecting it and the limits
  type drops it. Vendored SDL synced with cmssy#2452, which also removes
  `AiMutations.resetTokenUsage`, `AiQueries.usage` / `configuration`,
  `AiStatus.tokensRemaining` and the `aiCredits*` usage fields this server
  never read.

## 0.63.0

- **`take_over_page_lock` (CMS-1674).** Server-side lock enforcement refuses
  `publish_page` and every other write with `PAGE_LOCKED` while a human holds
  the page open, and the holder's TTL does not lapse while their tab stays
  visible. The new tool reassigns the lock to the caller (`page.takeOverLock`)
  and reports `lockHeldByMe`, so an agent can decide whether to retry the
  write. The previous holder is bounced to read-only; the tool description
  tells the model to confirm first. `@cmssy/ai-tools` 0.45.0.

## 0.62.0

- **`update_region_settings` writes through `page.updateLayout` (CMS-1672).**
  The backend folded region settings into `UpdatePageLayoutInput.layoutRegionSettings`
  and removed `page.updateLayoutRegionSettings`, so a layout save is one
  version-guarded write instead of two. The tool's read-merge-write, pruning,
  `expectedVersion` handling and `blockWarnings` are unchanged; only the
  mutation underneath is. Vendored SDL synced with cmssy#2428. Needs a backend
  that has cmssy#2428 deployed.

## 0.59.0

- **Relation fields on page types (CMS-1686).** `create_page_type` /
  `update_page_type` accept `relationTo` and `relationType` on a field
  (via @cmssy/ai-tools 0.41.0) and send `relationTo` to the backend exactly
  as given - a page-type relation may point at a collection (`pages`,
  `forms`, `media_assets`, `users`, `model_records`) or at `model:<slug>`,
  so the `model:` prefixing the model tools do would corrupt it.
  `get_page_type` now selects and returns both keys, so the documented
  get -> edit -> update cycle no longer strips a relation field's target
  and cardinality.

## 0.58.0

- **`list_forms` / `get_form` / `update_form` work against production again
  (CMS-1728).** The form query stopped selecting `enableCaptcha` in #122, but
  that change never shipped: 0.57.0 still asks for the field, and since
  cmssy#2400 reached production on 2026-09-03 every form read fails with
  `Cannot query field "enableCaptcha" on type "FormSettings"`. This release is
  that fix plus the vendored SDL synced with production.

## 0.56.0

- **Region settings via MCP (CMS-1710).** New `update_region_settings`
  (pageId, region, values, optional expectedVersion) writes
  `page.updateLayoutPositionSettings` with a read-merge-write over the page's
  existing region list, so one region can be set without clobbering the rest.
  Manifest validation errors (`BAD_USER_INPUT`) and `blockWarnings` are
  surfaced verbatim. `get_page` now returns `regionSettings` (the page's own)
  and `resolvedRegions` (effective per region, with `isInherited`,
  `settingsAreInherited` and the source page ids).

## 0.40.0

- **Optimistic concurrency on `update_model` field patches (CMS-933).** The
  tool's get -> merge -> update cycle now sends the model's `updatedAt` it
  read as an `expectedUpdatedAt` precondition; a concurrent edit (admin UI,
  another AI session) between the read and the write makes the update fail
  loudly with `VERSION_CONFLICT` instead of silently reverting it. `get_model`
  returns the model's `updatedAt`. Requires @cmssy/ai-tools >= 0.23.0 and the
  CMS-933 backend deploy.

## 0.39.0

- **Commerce lookups (CMS-940).** `get_discount` finds a discount by its code,
  and order tools return the full money column.

## 0.38.0

- **Model tool gaps closed (CMS-927).** `update_model` is now a field-level
  PATCH (upsert by key + explicit `removeFields`) instead of replace-all, so
  adding a field can no longer drop fields the AI vocabulary could not express
  (e.g. `password` on a members model). The shared field-type enum covers the
  backend's full 28-value `PropertyFieldType`. `create_model`/`update_model`
  accept the `product` capability config as a patch merged onto the stored
  config, and `get_model` returns complete field definitions (hidden, options,
  relations, validation). `relationTo` is now sent in the backend's canonical
  `model:<slug>` form (it was sent bare, breaking relation fields created via
  MCP). `list_records` filters are validated: equality, `$in`, `$gte`/`$lte`,
  `$regex` are supported and anything else is rejected loudly instead of
  silently matching nothing. Requires @cmssy/ai-tools >= 0.20.0 and the
  CMS-927 backend deploy.

## 0.36.0

- **Cart reads `productSources` (CMS-929).** `get_site_config` / cart tools now
  read the multi-model `CartConfig.productSources` (per-source field mapping)
  instead of the removed single `productModelSlug`/`fieldMapping` pair.
  Vendored SDL re-synced with production.

## 0.9.0

- **Dropped model-template tools (headless).** Removed `list_model_templates`
  and `create_model_from_template` — the backend no longer exposes
  `modelTemplates` / `installModelTemplate` (templates are not a headless
  concept). Custom data models (`create_model` / `list_models` / records CRUD)
  are unaffected.

## 0.8.0

- **Dropped block-discovery tools (headless).** Removed `list_block_types`,
  `get_block_schema`, and the `cmssy://blocks` resource — the backend no longer
  exposes a server-side block catalog (blocks live in the consumer app).
  `add_block_to_page` / `update_page_blocks` / `update_page_layout` no longer
  validate block types against the workspace registry (the backend validates on
  save); `add_block_to_page` takes an optional `layoutPosition`.

## 0.7.3

- **Send `expectedVersion` on page content writes (CMS-639).** The
  read-modify-write tools (`update_page_blocks`, `add_block_to_page`,
  `update_block_content`, `remove_block_from_page`) now pass the page version
  they just read as `expectedVersion`, so a concurrent change (e.g. the web
  editor) is rejected with `VERSION_CONFLICT` instead of silently overwriting
  it; re-running the tool re-reads the fresh page and succeeds.
  `patch_block_content` gains an optional `expectedVersion`. Page queries now
  select page-level `version`, and `savePage` returns it. Requires the
  `expectedVersion` input on the backend (deployed).

## 0.7.2

- **Fix `publish_page` / `revert_to_published` against per-axis backend
  mutations (CMS-628).** The backend removed `publishPage(id, blocks)` and
  `revertToPublished(id)` in favour of separate content/layout mutations
  (`publishPageContent` + `publishPageLayout`, `revertContentToPublished` +
  `revertLayoutToPublished`); the tools called the removed mutations and
  failed. Both tools now drive both axes and surface a partial-state error
  if the layout step fails after content already changed.

## 0.7.0

- Bumped `@cmssy/types` to `^0.12.0` (PlatformContext gains `formDefinitions`,
  `branding`, `primaryDomain`).

## 0.6.0

### Breaking

- **Affected write tools now default to `minimal` response** (CMS-490). The
  write tools listed below accept an optional `response: "minimal" | "full"`
  param (default `"minimal"`). Minimal returns a small ack (~200 bytes):
  `{id, slug, hasUnpublishedChanges, updatedAt}` for pages;
  `{pageId, blockId, hasUnpublishedChanges, updatedAt}` for block-on-page
  tools; `{id, slug, status, updatedAt}` for forms; `{id, slug, updatedAt}`
  for models; `{id, status, updatedAt}` for records. Pass `response: "full"`
  to restore the pre-0.6 behavior of returning the full mutation response.

  Rationale: multi-kB response echo after every mutation was burning agent
  context windows on content the agent just wrote. A single docs page touched
  ~6 times during CMS-459 produced ~170kB of echoed HTML; minimal mode cuts
  that by ~95%.

  Tools that accept `response`: `create_page`, `update_page_blocks`,
  `update_page_settings`, `publish_page`, `unpublish_page`,
  `revert_to_published`, `update_page_layout`, `add_block_to_page`,
  `update_block_content`, `remove_block_from_page`, `create_form`,
  `update_form`, `create_model`, `update_model`, `create_record`,
  `update_record`.

  Tools that do NOT accept `response` (already returned a compact ack and are
  unchanged): `patch_block_content`, `delete_page`, `delete_form`,
  `delete_form_submission`, `delete_model`, `delete_record`,
  `update_form_submission_status`, `import_records`,
  `create_model_from_template`.

## 0.5.0

- Added `patch_block_content` tool for surgical HTML edits (CMS-443).
- Added Custom Data Models tools — `list_models`, `get_model`, `create_model`,
  `update_model`, `delete_model`, `list_records`, `get_record`, `create_record`,
  `update_record`, `delete_record`, `import_records`, `list_model_templates`,
  `create_model_from_template` (CMS-489).
