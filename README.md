# @cmssy/mcp-server

MCP server for [Cmssy](https://cmssy.com), a hosted headless CMS with built-in commerce. Lets an AI agent work with pages, records, media, forms, products, orders, refunds and discounts in a Cmssy workspace.

## Hosted server (no install)

`https://api.cmssy.io/mcp` serves the same tools over HTTP. Claude (web, desktop, Code) and Codex connect by signing in to cmssy. A client that asks for a server URL and an API key - v0, Lovable, Bolt or your own - sends a `cs_` token instead:

```
URL:    https://api.cmssy.io/mcp
Header: Authorization: Bearer cs_YOUR_TOKEN
```

A token scoped to one workspace reaches only that workspace; an unscoped token reaches every workspace you belong to. Every tool takes a `workspace` (`<orgSlug>/<workspaceSlug>`), and `list_workspaces` names the ones the token may use. It reads and writes with your role in each workspace. Changing your password does not revoke it - delete it under Dashboard > API Tokens. Details: [cmssy.com/docs/api/mcp](https://www.cmssy.com/docs/api/mcp).

## Setup

### Prerequisites

1. A Cmssy workspace - the free plan works; cart and checkout need Pro
2. An API token (Dashboard > API Tokens, starts with `cs_`)
3. Your workspace ID (Workspace Settings > General)

The server talks to `https://api.cmssy.io` by default. Pass `--api-url` only for another backend.

### Add to Claude Code

Add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "cmssy": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@cmssy/mcp-server@latest",
        "--token",
        "cs_YOUR_TOKEN",
        "--workspace-id",
        "YOUR_WORKSPACE_ID"
      ]
    }
  }
}
```

### Environment Variables

Instead of CLI args, you can set:

- `CMSSY_API_TOKEN` — API token (`cs_xxx`)
- `CMSSY_WORKSPACE_ID` — Workspace ID
- `CMSSY_API_URL` — API URL (optional; defaults to `https://api.cmssy.io`, so set it only for a self-hosted backend)

### Checking which build is running

`--version` and `--help` need no token, so they answer even when the server is
not configured. Run the flag against **the same spec your client launches**,
copied out of your `mcp.json`:

```bash
npx -y @cmssy/mcp-server --version          # what an unpinned config runs
npx -y @cmssy/mcp-server@latest --version   # what the registry serves today
npm view @cmssy/mcp-server version          # the newest published version
```

The first two can disagree, and that disagreement is the answer: a warm `npx`
cache holds the build an unpinned spec resolved to earlier, while `@latest`
re-resolves and reports the newest one. So `@latest --version` cannot diagnose
a stale cache - it is the command that hides it. Ask the unpinned spec first
when a tool fails on a field the API should serve, then compare.

Clearing the cache is `npx clear-npx-cache`, or pin the version in your config
so nothing has to be diagnosed.

## Privacy Policy

Full policy: <https://www.cmssy.com/privacy>. Contact: contact@cmssy.com.

- **What this server collects**: nothing of its own. It keeps no local database, writes no files and sends nothing to any analytics service.
- **What it sends, and where**: each tool call becomes a GraphQL request to the Cmssy API (`https://api.cmssy.io` unless you set `CMSSY_API_URL`), carrying your API token, your workspace ID, the tool's arguments, the client name and version, and the name of the tool being run. The Cmssy API records one usage event per tool call from those last two.
- **Files and URLs**: `upload_media` reads only the local file path or downloads only the URL you pass it, then uploads the bytes to the Cmssy storage URL the API returns. It touches no other file.
- **Usage and storage**: the Cmssy API stores workspace content (pages, records, media, orders, customers) as described in the policy above, in the European Union. Content is not sold and not used to train AI models.
- **Third-party sharing**: the server talks to the Cmssy API and the Cmssy storage URL only, plus any URL you hand to `upload_media`. Third parties the Cmssy service itself uses are listed in the policy.
- **Data retention**: the server keeps nothing after a call returns. Workspace data stays until you delete it or close your account; retention periods are in the policy.
- **Your token**: it acts with the permissions of the member who created it. Revoke it under Dashboard > API Tokens at any time.

## Response shape (write tools)

As of 0.6.0, most write tools accept an optional `response` arg:

- `response: "minimal"` (default) - returns a small ack (~200 bytes):
  `{id, slug, hasUnpublishedChanges, updatedAt}` for page tools,
  `{pageId, blockId, hasUnpublishedChanges, updatedAt}` for block tools,
  `{id, slug, status, updatedAt}` for form tools,
  `{id, slug, updatedAt}` for model tools,
  `{id, status, updatedAt}` for record tools,
  `{id, orderNumber, status, paymentStatus, fulfillmentStatus, total, balanceDue, currency, updatedAt}` for order tools,
  `{id, code, type, value, enabled, updatedAt}` for discount tools.
- `response: "full"` - returns the full mutation response (pre-0.6 behavior).

Use `"full"` only if you need the post-write state inline; otherwise issue a
follow-up `get_page`/`get_form`/`get_model`/`get_record`. This keeps agent
context windows from being eaten by echoed content.

Tools that accept `response`: `create_page`, `update_page_blocks`,
`update_page_settings`, `publish_page`, `unpublish_page`, `revert_to_published`,
`update_page_layout`, `add_block_to_page`, `update_block_content`,
`remove_block_from_page`, `create_form`, `update_form`, `create_model`,
`update_model`, `create_record`, `update_record`, `create_manual_order`,
`edit_order`, `update_order_details`, `mark_order_paid`, `record_order_payment`,
`refund_order`, `cancel_order`, `close_order`, `reopen_order`,
`create_return`, `approve_return`, `reject_return`, `cancel_return`,
`receive_return`, `refund_return`, `complete_return`, `update_return_tracking`,
`create_shipment`, `update_shipment`,
`set_order_pipeline_stage`, `record_order_invoice`,
`record_order_invoice_correction`, `create_discount`,
`update_discount`, `set_discount_enabled`.

`patch_block_content` and the various `delete_*` / status-only tools
(`update_form_submission_status`, `import_records`)
already returned a compact ack and don't take `response`.

## Available Tools

### Read Tools

| Tool                 | Description                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_pages`         | Page tree with hierarchy (optional `search` filter)                                                                                               |
| `get_page`           | Full page with blocks, i18n content and region settings (own `regionSettings` + resolved `resolvedRegions` with inheritance source) by slug or id |
| `get_site_config`    | Languages, navigation, site name                                                                                                                  |
| `get_workspace_info` | Workspace name, plan, limits                                                                                                                      |
| `list_media`         | Media library listing                                                                                                                             |
| `list_trashed_pages` | Page trash: deleted groups with who deleted them, subtree size and when each is purged (30 days after deletion)                                  |

### Write Tools

| Tool                   | Description                        |
| ---------------------- | ---------------------------------- |
| `create_page`          | Create a new page                  |
| `update_page_blocks`   | Set full blocks array on a page    |
| `update_page_settings` | Update page metadata and SEO       |
| `publish_page`         | Publish a page                     |
| `unpublish_page`       | Unpublish a page                   |
| `delete_page`          | Move a page and its subtree to the trash, restorable for 30 days |
| `restore_page`         | Restore a trashed page group as unpublished drafts |
| `revert_to_published`  | Discard draft, revert to published |

### Block Helper Tools

| Tool                     | Description                                                                    |
| ------------------------ | ------------------------------------------------------------------------------ |
| `add_block_to_page`      | Insert a block at position (auto-generates UUID + translations)                |
| `update_block_content`   | Merge content into an existing block                                           |
| `patch_block_content`    | Surgical HTML patch (insert/replace around unique markers)                     |
| `remove_block_from_page` | Remove a block by ID                                                           |
| `update_page_layout`     | Update layout blocks and overrides                                             |
| `update_region_settings` | Set one layout region's settings (manifest-validated; other regions untouched) |

#### `update_region_settings`

Region (layout position) settings are declared by the workspace's layout
manifest and validated against it on write. The tool reads the page's current
`layoutRegionSettings`, replaces only the named region and writes the whole
list back, so sibling regions keep their values (entries for regions the
manifest no longer declares, and keys a region's schema no longer has, are
dropped on the way - the same pruning the admin editor does). The backend's own
`BAD_USER_INPUT` message is returned verbatim for an unknown region, an unknown
key, or a non-empty `values` on a region that declares no settings (such a
region accepts `values: {}` only); `blockWarnings` are surfaced when present.

```jsonc
{ "pageId": "...", "region": "sidebar", "values": { "width": "wide" } }
```

Child pages inherit a region's settings unless they set their own -
`get_page` shows the effective value per region in `resolvedRegions`
(`settingsAreInherited`, `settingsSourcePageId`).

#### `patch_block_content`

For small edits on long HTML content strings (e.g. a `docs-article` body),
`patch_block_content` is ~10x cheaper in tokens than `update_block_content`
and catches marker mistakes before anything writes to the DB.

```jsonc
{
  "pageId": "...",
  "blockId": "...",
  "locale": "en",
  "operations": [
    {
      "op": "insert_before",
      "marker": "<h2>Environment Variables</h2>",
      "html": "<hr><h2>cmssy skills install</h2><p>...</p>",
    },
  ],
}
```

Four ops: `insert_before`, `insert_after`, `replace_section`, `replace_all`.
Every marker must match **exactly once** - 0 or 2+ matches error out with the
actual count (no silent half-applied state). For `replace_section`,
`startMarker` is inclusive and `endMarker` is exclusive. `replace_all` sets the
whole string and takes `expected`, the current value - refused if it moved.

Requires `@cmssy/cli`-registered workspace with `PAGES_EDIT` permission.
Default `fieldPath` is `"content"` (the HTML body on docs-article); override
if patching a different string field. Dot segments reach a nested string, e.g.
`tabs.0.label` for the first tab's label.

### Model Tools (Custom Data Models)

AI agents can define ModelDefinitions and CRUD their records. Schema/fields
follow `PropertyField` from `@cmssy/types`; records are validated against the
model on every write.

| Tool                  | Description                                                                   |
| --------------------- | ----------------------------------------------------------------------------- |
| `list_models`         | List all ModelDefinitions in the workspace                                    |
| `get_model`           | Get a model by id (ObjectId) or slug                                          |
| `create_model`        | Create a model (name, slug, fields, optional statusField)                     |
| `update_model`        | Update any field of a model (fields change triggers schema migrate)           |
| `delete_model`        | Delete a model — **cascades to all its records**                              |
| `list_records`        | List records with filter (JSON), sort, pagination, optional populate          |
| `get_record`          | Get a record by id; a company record carries its VAT id, verification and exemption |
| `create_record`       | Create a record; `data` keyed by model field keys                             |
| `update_record`       | Update a record's data and/or transition its status                           |
| `delete_record`       | Delete a record                                                               |
| `import_records`      | Bulk import up to 1000 records; returns `{ importedCount, errors }`           |
| `bulk_update_records` | Set data and/or status on up to 200 ids or every filter match |

Requires workspace permissions `MODELS_VIEW` (read) / `MODELS_CREATE` /
`MODELS_EDIT` / `MODELS_DELETE` depending on the operation.

### Commerce Tools (Orders, Carts, Discounts)

Manage the storefront's orders, carts, and discount codes. **All money fields
are integer minor units (cents).** Order/discount write tools accept the
`response` arg (see [Response shape](#response-shape-write-tools)).

| Tool                       | Description                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| `list_orders`              | List orders by payment/fulfillment/delivery/state, warehouse queue, customer, currency, dates; pages with `skip`/`limit` |
| `get_order`                | Get an order with items, payments, parcels, invoices and corrections, tax summary and treatment, sales channel and the price lists that priced it |
| `get_order_pipeline`       | Get the workspace's configurable order pipeline stages             |
| `create_manual_order`      | Create an admin-entered order, with an optional shipping address   |
| `edit_order`               | Replace an order's line items (recomputes totals)                  |
| `update_order_details`     | Update customer email, notes, PO number, and shipping address      |
| `mark_order_paid`          | Record a full payment (manual reconciliation, no provider verify)  |
| `record_order_payment`     | Record a partial payment against the balance due                   |
| `refund_order`             | Refund an order (full, or partial with `amount`)                   |
| `cancel_order`             | Cancel an order                                                    |
| `close_order`              | Mark an order done; reopens itself if payment or fulfillment slips |
| `reopen_order`             | Reopen a closed order                                              |
| `create_return`            | Open a return: lines, quantities, reasons, return-parcel tracking  |
| `approve_return`           | Approve a return the customer requested                            |
| `reject_return`            | Reject a requested return                  |
| `cancel_return`            | Cancel a return not yet refunded           |
| `receive_return`           | Record received units per line and how many go back to stock       |
| `refund_return`            | Record a refund for a return               |
| `complete_return`          | Close a received return without a refund                           |
| `update_return_tracking`   | Set the carrier and tracking number of the return parcel           |
| `create_shipment`          | Add a parcel (carrier, tracking number, link, status) to an order  |
| `update_shipment`          | Change a parcel's status or tracking, with a note for its history  |
| `set_order_pipeline_stage` | Move an order to a pipeline stage                                  |
| `record_order_invoice`     | Attach an invoice (number, url, provider) to an order              |
| `record_order_invoice_correction` | Attach a correction invoice (credit note) to an invoiced order |
| `list_carts`               | List shopping carts (admin view, optional status filter) with their sales channel |
| `delete_carts`             | Permanently delete 1-100 carts, all or nothing     |
| `list_discounts`           | List discount codes (filter by enabled/type/code)                  |
| `get_discount`             | Get a discount by id                                               |
| `create_discount`          | Create a discount (`percentage` / `fixed` / `free_shipping`)       |
| `update_discount`          | Partial update (code/type/currency lock once the code is used)     |
| `set_discount_enabled`     | Enable or disable a discount                                       |
| `list_products`            | Product catalog with stock + variant info (over a Data Model)      |
| `bulk_update_products`     | Bulk set/adjust status, stock, or price on selected products       |
| `bulk_delete_products`     | Bulk-delete selected product records                               |
| `set_product_tiers`        | Set a product's record-level volume price breaks                   |
| `set_product_variants`     | Replace a product's whole variant set              |
| `set_product_currency_prices` | Replace a product's prices and breaks in additional currencies, and variants' per-currency prices without touching stock |

Products are records of a Custom Data Model; these tools add product-aware
stock/variant reads and bulk writes on top of the generic record tools. The
bulk tools target an explicit `ids` list **or** everything matching a `filter`
(`allMatching: true`). There is no per-variant stock write and no standalone
inventory mutation - stock is set/adjusted in bulk via `patch.setStock` /
`patch.adjustStock`.

Requires workspace permissions `ORDERS_VIEW` / `ORDERS_MANAGE` (orders),
`CARTS_VIEW` (carts), `DISCOUNTS_VIEW` / `DISCOUNTS_MANAGE` (discounts),
`MODELS_VIEW` / `MODELS_EDIT` / `MODELS_DELETE` (products).

### Customer Tools

Customers are the accounts that sign in to the site - records of a model
with accounts enabled - not the team that manages the workspace
(`list_team`).

| Tool                           | Description                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `list_customers`               | List customers with status, verification, last login, company and order stats (paginated) |
| `get_customer`                 | One customer's account summary plus the profile record's data                             |
| `suspend_customer`             | Block sign-in and end every live session (orders and carts stay)                          |
| `unsuspend_customer`           | Let a suspended customer sign in again                                                    |
| `send_customer_password_reset` | Issue a reset token to an active customer; the app's `account.*` webhook sends the mail   |
| `resend_customer_verification` | Issue a fresh verification token to a pending customer; the app's webhook sends the mail  |
| `unlock_customer`              | Clear the failed sign-in counter and lockout                                              |
| `set_customer_company_role`    | Give a customer a role in their company (`admin` sees every company order, `buyer` their own) |
| `set_customer_price_list`      | Assign a price list to a customer without a company; `null` unassigns                     |

### Price List Tools

A price list (Gold, Silver, dealer tiers) prices a buyer at a percent off the
catalogue plus fixed prices per product or variant. Each buyer has one list:
a company's members pay the company's list, a customer without a company
their own.

| Tool                        | Description                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `list_price_lists`          | Every price list with percentOff, fixed-price count, assignment count and channels   |
| `get_price_list`            | One list with a page of its fixed prices (filter by product, cursor-paginated)       |
| `create_price_list`         | Create a list with a name, an optional percent off and the channels it is published to |
| `update_price_list`         | Rename a list, change its percentOff, window or channels (`[]` unpublishes)          |
| `delete_price_list`         | Delete a list and unassign it everywhere                             |
| `set_price_list_entry`      | Set the fixed price for one product or variant, with optional volume breaks          |
| `set_price_list_entries`    | Upsert up to 1000 fixed prices at once, all or nothing               |
| `remove_price_list_entries` | Remove up to 1000 fixed prices by product / variant                  |
| `set_company_price_list`    | Assign a price list to a company record; every member pays it; `null` unassigns      |
| `set_company_price_display_mode` | Set whether a company's buyers read net or gross prices; `null` = default (net) |
| `set_company_tax_rounding`  | Set a company's VAT rounding, per_line or per_rate; `null` = workspace setting      |
| `set_company_vat_id`        | Set or clear a company's EU VAT id; a changed id is no longer verified              |
| `set_company_vat_verified`  | Attest or withdraw a company's checked VAT id; drives reverse charge |
| `set_company_tax_exemption` | Exempt a company's orders from VAT with a legal reason; `null` clears |

### Sales Channel Tools

A sales channel (retail, horeca, b2b) is a key a storefront sends to be priced
from the price lists published to it: per product the buyer's own or company
list wins, then the channel's dated list, then its base list, then the
catalogue. Lists are published with `create_price_list` / `update_price_list`
`channels`.

| Tool                   | Description                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `list_sales_channels`  | Every channel with key, displayMode, priceAccess, active list and open-cart count   |
| `get_sales_channel`    | One channel with its published lists, nextChangeAt and activeCartCount              |
| `create_sales_channel` | Create a channel (key fixed once created), at most 20 per workspace                 |
| `update_sales_channel` | Rename a channel or change its displayMode or priceAccess                           |
| `delete_sales_channel` | Delete a channel, unpublish its lists, abandon its open carts       |

### Webhook Tools

Manage outbound event webhooks. `create_webhook` and `rotate_webhook_secret`
return the signing secret **once** - it cannot be retrieved again.

| Tool                       | Description                                              |
| -------------------------- | -------------------------------------------------------- |
| `list_webhooks`            | List webhook endpoints (secrets never returned)          |
| `list_webhook_deliveries`  | Recent delivery attempts (pending/success/failed)        |
| `list_webhook_event_types` | The authoritative allowlist of subscribable events       |
| `create_webhook`           | Create an endpoint; returns the endpoint + secret (once) |
| `update_webhook`           | Partial update; pass `enabled` to enable/disable         |
| `rotate_webhook_secret`    | Rotate the signing secret (returns new secret once)      |
| `delete_webhook`           | Delete an endpoint                                       |

Requires workspace permissions `WEBHOOKS_VIEW` (read) / `WEBHOOKS_MANAGE`
(create, update, rotate, delete).

## Resources

| URI                 | Description                  |
| ------------------- | ---------------------------- |
| `cmssy://sitemap`   | Full page tree as JSON       |
| `cmssy://workspace` | Workspace info + site config |

## Example Workflow

```
> List all pages in my workspace
> Search for pages matching "blog"
> Show me the available block types
> Which pages still use block types the site no longer registers?
> Create a new "Features" page with content in English and Polish
> Add a hero block to the Features page
> Publish the Features page
```

## Hosting the server (library)

`createHostedServer` serves the same tools from a host that holds no token and no disk. Every tool takes a `workspace` (`<orgSlug>/<workspaceSlug>`); `list_workspaces` names the ones a connection may use. The package checks only the shape of `workspace` - everything below is the host's job:

- **`resolveWorkspace(workspace)` is the authorization.** Check, on every call, that the caller is still a member of that workspace and that the connection was granted it. Throw the same message for "does not exist" and "not yours", so a refusal does not reveal which workspaces exist.
- **The executor is the scope.** The `CmssyApi` it returns (`createCmssyApi(execute, workspaceId)`) runs every document as that user in that workspace; the package sends nothing that would scope it.
- **`fetchUrl` is the SSRF boundary.** Refuse private, loopback and link-local addresses and re-check every redirect. The package caps the body at 50MB while reading.

## Development

```bash
pnpm install
pnpm dev -- --token cs_xxx --workspace-id xxx --api-url http://localhost:4000
```
