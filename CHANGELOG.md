# @cmssy/mcp-server

## 0.6.0

### Breaking

- **Affected write tools now default to `minimal` response** (CMS-490). The
  write tools listed below accept an optional `response: "minimal" | "full"`
  param (default `"minimal"`). Minimal returns a small ack (~200 bytes):
  `{id, slug, hasUnpublishedChanges, updatedAt}` for pages;
  `{pageId, blockId, hasUnpublishedChanges, updatedAt}` for block-on-page
  tools; `{id, slug, status, updatedAt}` for forms; `{id, slug, updatedAt}`
  for models; `{id, status, updatedAt}` for records. Pass `response: "full"`
  to restore the pre-0.6 behavior of returning the entire mutated resource.

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
