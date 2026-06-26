import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import JSZip from "jszip";

const rootDir = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), "knowledge-forge-epub-smoke-"));
const port = 61990;
const tsxCli = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");

type Job = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  error?: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function fetchJson<T>(route: string, init?: RequestInit) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    ...init,
    headers: init?.body instanceof FormData
      ? init.headers
      : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${route} ${response.status}: ${text}`);
  return JSON.parse(text) as T;
}

async function waitForApi() {
  for (let i = 0; i < 50; i += 1) {
    try {
      return await fetchJson<{ ok: boolean }>("/api/health");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error("API did not become ready.");
}

async function waitForJobs(jobIds: string[]) {
  const deadline = Date.now() + 180_000;
  const finished = new Map<string, Job>();
  while (Date.now() < deadline) {
    for (const jobId of jobIds) {
      if (finished.has(jobId)) continue;
      const { job } = await fetchJson<{ job: Job }>(`/api/jobs/${jobId}`);
      if (job.status === "succeeded") finished.set(jobId, job);
      if (job.status === "failed" || job.status === "cancelled")
        throw new Error(`Job ${jobId} ${job.status}: ${job.error ?? "unknown error"}`);
    }
    if (finished.size === jobIds.length) return Array.from(finished.values());
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for jobs: ${jobIds.join(", ")}`);
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function createEpub(title: string, chapters: { heading: string; body: string }[]) {
  const zip = new JSZip();

  // mimetype (must be first, uncompressed)
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // META-INF/container.xml
  zip.folder("META-INF")?.file(
    "container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const opfDir = zip.folder("OEBPS")!;

  // content.opf
  const itemIds = chapters.map((_, i) => `chapter${i + 1}`);
  opfDir.file(
    "content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${xmlEscape(title)}</dc:title>
    <dc:identifier id="book-id">urn:uuid:epub-smoke-test</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
${itemIds.map((id) => `    <item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`).join("\n")}
  </manifest>
  <spine>
${itemIds.map((id) => `    <itemref idref="${id}"/>`).join("\n")}
  </spine>
</package>`,
  );

  // Chapter files
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    opfDir.file(
      `chapter${i + 1}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${xmlEscape(ch.heading)}</title></head>
<body>
  <h1>${xmlEscape(ch.heading)}</h1>
  <p>${xmlEscape(ch.body)}</p>
</body>
</html>`,
    );
  }

  return zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" });
}

const server = spawn(process.execPath, [tsxCli, "server/index.ts"], {
  cwd: rootDir,
  env: {
    ...process.env,
    KNOWLEDGE_FORGE_ROOT_DIR: rootDir,
    KNOWLEDGE_FORGE_DATA_DIR: tempDir,
    KNOWLEDGE_FORGE_PORT: String(port),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForApi();

  // Create collection
  const created = await fetchJson<{ collection: { slug: string } }>("/api/collections", {
    method: "POST",
    body: JSON.stringify({ name: "EPUB Smoke", slug: "epub-smoke" }),
  });
  assert(created.collection.slug === "epub-smoke", "Collection was not created with expected slug.");

  // Create EPUB with two chapters
  const epubBody = await createEpub("Smoke Test Book", [
    { heading: "Chapter One", body: "KNOWLEDGE_FORGE_EPUB_SENTINEL_A This is the first chapter of the smoke test book." },
    { heading: "Chapter Two", body: "KNOWLEDGE_FORGE_EPUB_SENTINEL_B This is the second chapter with more content." },
  ]);

  // Upload
  const form = new FormData();
  form.append("files", new Blob([epubBody], { type: "application/epub+zip" }), "smoke-test.epub");
  const uploaded = await fetchJson<{ jobs: Job[] }>(
    "/api/collections/epub-smoke/upload-jobs",
    { method: "POST", body: form },
  );
  assert(uploaded.jobs.length === 1, "Expected 1 upload job");

  await waitForJobs(uploaded.jobs.map((j) => j.id));

  // Verify document
  const docs = await fetchJson<{
    documents: Array<{ name: string; parserType?: string; chunkCount: number }>;
  }>("/api/collections/epub-smoke/documents");
  assert(docs.documents.length === 1, `Expected 1 document, got ${docs.documents.length}`);

  const doc = docs.documents[0];
  assert(doc.name === "smoke-test.epub", `Unexpected doc name: ${doc.name}`);
  assert(doc.parserType === "epub", `Expected parserType "epub", got "${doc.parserType}"`);
  assert(doc.chunkCount > 0, `Expected chunks > 0, got ${doc.chunkCount}`);

  // Verify search
  const searchA = await fetchJson<{ results: Array<{ text: string }> }>(
    "/api/collections/epub-smoke/search",
    {
      method: "POST",
      body: JSON.stringify({ query: "KNOWLEDGE_FORGE_EPUB_SENTINEL_A", topK: 20 }),
    },
  );
  assert(
    searchA.results.some((r) => r.text.includes("KNOWLEDGE_FORGE_EPUB_SENTINEL_A")),
    "Search did not find sentinel from chapter one.",
  );

  const searchB = await fetchJson<{ results: Array<{ text: string }> }>(
    "/api/collections/epub-smoke/search",
    {
      method: "POST",
      body: JSON.stringify({ query: "KNOWLEDGE_FORGE_EPUB_SENTINEL_B", topK: 20 }),
    },
  );
  assert(
    searchB.results.some((r) => r.text.includes("KNOWLEDGE_FORGE_EPUB_SENTINEL_B")),
    "Search did not find sentinel from chapter two.",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        tempDir,
        collection: created.collection.slug,
        document: { name: doc.name, parserType: doc.parserType, chunks: doc.chunkCount },
      },
      null,
      2,
    ),
  );
} finally {
  server.kill();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await rm(tempDir, { recursive: true, force: true });
}