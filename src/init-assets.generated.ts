export const INIT_ASSETS_VERSION = "19.27.0";

export const NEXT_INIT_FILES: ReadonlyArray<{ path: string; content: string }> = [
  {
    "path": ".env.example",
    "content": "# `npx @cmssy/cli link --token cs_...` writes all three into .env.local for you.\n# Your organization slug (Settings -> Headless in the cmssy dashboard)\nCMSSY_ORG_SLUG=\n# Your workspace slug (Settings -> Headless in the cmssy dashboard)\nCMSSY_WORKSPACE_SLUG=\n# Draft/preview secret, generated per workspace (Settings -> Headless)\nCMSSY_DRAFT_SECRET=\n# Signing secret of the content.changed webhook pointed at /api/revalidate (Settings -> Webhooks)\nCMSSY_WEBHOOK_SECRET=\n"
  },
  {
    "path": "app/[[...path]]/layout.tsx",
    "content": "import type { ReactNode } from \"react\";\nimport { resolveCmssyLocale } from \"@cmssy/core\";\nimport { cmssy } from \"@/cmssy.config\";\nimport { SiteProviders } from \"@/cmssy/site-providers\";\n\ntype LayoutProps = {\n  children: ReactNode;\n  params: Promise<{ path?: string[] }>;\n};\n\nexport default async function RootLayout({ children, params }: LayoutProps) {\n  const { path } = await params;\n  const locale = await resolveCmssyLocale(cmssy, path);\n\n  return (\n    <html lang={locale}>\n      <body>\n        <SiteProviders>{children}</SiteProviders>\n      </body>\n    </html>\n  );\n}\n"
  },
  {
    "path": "app/[[...path]]/page.tsx",
    "content": "import { draftMode } from \"next/headers\";\nimport { createCmssyPage, CmssyLayoutSlot } from \"@cmssy/next/server\";\nimport type { CmssyRegion } from \"@cmssy/next\";\nimport { cmssy, type layout } from \"@/cmssy.config\";\nimport { blocks } from \"@/cmssy/blocks\";\nimport { CmssyEditor } from \"@/cmssy/editor\";\nimport { EditableLayout } from \"@/cmssy/editable-layout\";\nimport { publishedPaths } from \"@/services/pages\";\n\ntype PageProps = {\n  params: Promise<{ path?: string[] }>;\n  searchParams: Promise<Record<string, string | string[] | undefined>>;\n};\n\nexport const revalidate = 3600;\nexport const dynamicParams = true;\n\nconst cache = { revalidate };\n\nexport function generateStaticParams() {\n  return publishedPaths();\n}\n\nconst CmssyPage = createCmssyPage(cmssy, blocks, {\n  editor: CmssyEditor,\n  cache,\n});\n\nexport default async function Page(props: PageProps) {\n  const { path } = await props.params;\n  const { isEnabled: preview } = await draftMode();\n  const slot = (region: CmssyRegion<typeof layout>) => (\n    <CmssyLayoutSlot\n      config={cmssy}\n      blocks={blocks}\n      region={region}\n      path={path ?? []}\n      editMode={false}\n      preview={preview}\n      editable={EditableLayout}\n      cache={cache}\n    />\n  );\n\n  return (\n    <>\n      {slot(\"header\")}\n      <main>\n        <CmssyPage {...props} />\n      </main>\n      {slot(\"footer\")}\n    </>\n  );\n}\n"
  },
  {
    "path": "app/api/draft/route.ts",
    "content": "import { createDraftRoute } from \"@cmssy/next/server\";\nimport { cmssy } from \"@/cmssy.config\";\n\nexport const GET = createDraftRoute(cmssy);\n"
  },
  {
    "path": "app/api/revalidate/route.ts",
    "content": "import { createCmssyRevalidateRoute } from \"@cmssy/next/server\";\n\nexport const POST = createCmssyRevalidateRoute({\n  secret: process.env.CMSSY_WEBHOOK_SECRET,\n});\n"
  },
  {
    "path": "app/cmssy-edit/[[...path]]/layout.tsx",
    "content": "import type { ReactNode } from \"react\";\nimport { resolveCmssyLocale } from \"@cmssy/core\";\nimport { cmssy } from \"@/cmssy.config\";\nimport { SiteProviders } from \"@/cmssy/site-providers\";\n\ntype LayoutProps = {\n  children: ReactNode;\n  params: Promise<{ path?: string[] }>;\n};\n\nexport default async function EditRootLayout({\n  children,\n  params,\n}: LayoutProps) {\n  const { path } = await params;\n  const locale = await resolveCmssyLocale(cmssy, path);\n\n  return (\n    <html lang={locale}>\n      <body>\n        <SiteProviders>{children}</SiteProviders>\n      </body>\n    </html>\n  );\n}\n"
  },
  {
    "path": "app/cmssy-edit/[[...path]]/page.tsx",
    "content": "import {\n  createCmssyEditPage,\n  CmssyLayoutSlot,\n  isCmssyEditMode,\n} from \"@cmssy/next/server\";\nimport type { CmssyRegion } from \"@cmssy/next\";\nimport { cmssy, type layout } from \"@/cmssy.config\";\nimport { blocks } from \"@/cmssy/blocks\";\nimport { CmssyEditor } from \"@/cmssy/editor\";\nimport { EditableLayout } from \"@/cmssy/editable-layout\";\n\nexport const dynamic = \"force-dynamic\";\n\ntype PageProps = {\n  params: Promise<{ path?: string[] }>;\n  searchParams: Promise<Record<string, string | string[] | undefined>>;\n};\n\nconst CmssyEditPage = createCmssyEditPage(cmssy, blocks, {\n  editor: CmssyEditor,\n});\n\nexport default async function EditPage(props: PageProps) {\n  const { path } = await props.params;\n\n  const editMode = await isCmssyEditMode();\n\n  const slot = (region: CmssyRegion<typeof layout>) => (\n    <CmssyLayoutSlot\n      config={cmssy}\n      blocks={blocks}\n      region={region}\n      path={path ?? []}\n      editMode={editMode}\n      editable={EditableLayout}\n    />\n  );\n\n  return (\n    <>\n      {slot(\"header\")}\n      <main>\n        <CmssyEditPage {...props} />\n      </main>\n      {slot(\"footer\")}\n    </>\n  );\n}\n"
  },
  {
    "path": "blocks/hero/block.ts",
    "content": "import { defineBlock } from \"@cmssy/react\";\nimport Hero, { heroProps } from \"./Hero\";\n\nexport const heroBlock = defineBlock({\n  type: \"hero\",\n  label: \"Hero\",\n  component: Hero,\n  props: heroProps,\n});\n"
  },
  {
    "path": "blocks/hero/Hero.tsx",
    "content": "import { fields, type BlockProps } from \"@cmssy/react\";\n\nexport const heroProps = {\n  heading: fields.text({ label: \"Heading\", required: true }),\n  text: fields.textarea({ label: \"Text\" }),\n};\n\nexport default function Hero({ content }: BlockProps<typeof heroProps>) {\n  return (\n    <section>\n      <h1>{content.heading}</h1>\n      {content.text ? <p>{content.text}</p> : null}\n    </section>\n  );\n}\n"
  },
  {
    "path": "cmssy.config.ts",
    "content": "import { defineCmssyConfig, defineCmssyLayout } from \"@cmssy/next\";\n\nexport const layout = defineCmssyLayout({\n  regions: [\n    { id: \"header\", label: \"Header\" },\n    { id: \"footer\", label: \"Footer\" },\n  ],\n});\n\nexport const cmssy = defineCmssyConfig({\n  org: process.env.CMSSY_ORG_SLUG,\n  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,\n  draftSecret: process.env.CMSSY_DRAFT_SECRET,\n  layout,\n});\n"
  },
  {
    "path": "cmssy/blocks.ts",
    "content": "import { heroBlock } from \"@/blocks/hero/block\";\n\nexport const blocks = [heroBlock];\n"
  },
  {
    "path": "cmssy/editable-layout.tsx",
    "content": "\"use client\";\n\nimport {\n  CmssyLazyLayout,\n  type CmssyLazyLayoutProps,\n} from \"@cmssy/react/client\";\n\nexport function EditableLayout(props: Omit<CmssyLazyLayoutProps, \"load\">) {\n  return <CmssyLazyLayout {...props} load={() => import(\"./blocks\")} />;\n}\n"
  },
  {
    "path": "cmssy/editor.tsx",
    "content": "\"use client\";\n\nimport { CmssyLazyEditor } from \"@cmssy/react/client\";\nimport type { CmssyEditorProps } from \"@cmssy/next\";\n\nexport function CmssyEditor(props: CmssyEditorProps) {\n  return <CmssyLazyEditor {...props} load={() => import(\"./blocks\")} />;\n}\n"
  },
  {
    "path": "cmssy/site-providers.tsx",
    "content": "\"use client\";\n\nimport type { ReactNode } from \"react\";\n\nexport function SiteProviders({ children }: { children: ReactNode }) {\n  return <>{children}</>;\n}\n"
  },
  {
    "path": "proxy.ts",
    "content": "import { createCmssyProxy } from \"@cmssy/next/middleware\";\nimport { cmssy } from \"@/cmssy.config\";\n\nexport const proxy = createCmssyProxy(cmssy);\n\nexport const config = {\n  matcher: [\"/((?!_next/|api/|.*\\\\..*).*)\"],\n};\n"
  },
  {
    "path": "services/pages.ts",
    "content": "import { createCmssyClient, typedOperation } from \"@cmssy/core\";\nimport { cmssy } from \"@/cmssy.config\";\n\ntype PublishedPages = {\n  public?: {\n    page?: { list?: { slug?: string | null; publishedAt?: string | null }[] | null } | null;\n  } | null;\n};\n\nconst PUBLISHED_PAGES = typedOperation<\n  PublishedPages,\n  { workspaceSlug: string }\n>(`query PublishedPages($workspaceSlug: String!) {\n  public {\n    page {\n      list(workspaceSlug: $workspaceSlug) {\n        slug\n        publishedAt\n      }\n    }\n  }\n}`);\n\nconst client = createCmssyClient({\n  apiUrl: cmssy.apiUrl,\n  org: cmssy.org,\n  workspaceSlug: cmssy.workspaceSlug,\n});\n\nexport async function publishedPaths(): Promise<{ path: string[] }[]> {\n  const data = await client.query(\n    PUBLISHED_PAGES,\n    { workspaceSlug: cmssy.workspaceSlug },\n    {\n      public: true,\n      retry: {},\n    },\n  );\n\n  const pages = data?.public?.page?.list ?? [];\n  return pages\n    .filter((page) => page.publishedAt)\n    .map((page) => ({\n      path: (page.slug ?? \"\").split(\"/\").filter(Boolean),\n    }));\n}\n"
  }
];
