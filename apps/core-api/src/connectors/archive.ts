import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import {
  archiveDiaryEntrySchema,
  archiveDiaryListSchema,
  archiveFileListResultSchema,
  archiveFileResultSchema,
  archiveFileWriteResultSchema,
  archiveStatusSchema,
  connectorSchema,
  diaryDeleteResultSchema,
  diaryWriteResultSchema
} from "@asashiki/schemas";

const diaryFilePattern = /^(\d{4}-\d{2}-\d{2})\.md$/;
const maxDiaryBytes = 256 * 1024;

function toIsoStatTime(path: string) {
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return null;
  }
}

function stripMarkdown(value: string) {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function createExcerpt(content: string) {
  const cleaned = stripMarkdown(content);
  return cleaned.length > 0 ? cleaned.slice(0, 160) : null;
}

function createTitle(date: string, content: string) {
  const firstHeading = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#{1,6}\s+\S/.test(line));

  if (firstHeading) {
    return firstHeading.replace(/^#{1,6}\s+/, "").trim().slice(0, 80);
  }

  return `${date} 日记`;
}

function resolveInside(rootPath: string, targetPath: string) {
  const resolvedRoot = resolve(rootPath);
  const resolvedTarget = resolve(targetPath);
  const relation = relative(resolvedRoot, resolvedTarget);

  if (
    relation === "" ||
    (!relation.startsWith("..") && !isAbsolute(relation))
  ) {
    return resolvedTarget;
  }

  throw new Error("Archive path escapes the configured root.");
}

function resolveArchivePath(rootPath: string, targetPath: string) {
  return resolveInside(
    rootPath,
    isAbsolute(targetPath) ? targetPath : join(rootPath, targetPath)
  );
}

function findDiaryPath(rootPath: string, configuredDiaryPath?: string) {
  const candidates = [
    configuredDiaryPath,
    join(rootPath, "Obsidian_Asashiki", "日记"),
    join(rootPath, "日记")
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const candidate of candidates) {
    const resolved = resolveArchivePath(rootPath, candidate);

    if (existsSync(resolved) && statSync(resolved).isDirectory()) {
      return resolved;
    }
  }

  return null;
}

function readDiaryFiles(diaryPath: string) {
  return readdirSync(diaryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && diaryFilePattern.test(entry.name))
    .map((entry) => {
      const match = entry.name.match(diaryFilePattern);
      const date = match?.[1];

      if (!date) {
        throw new Error(`Invalid diary file name: ${entry.name}`);
      }

      const fullPath = join(diaryPath, entry.name);
      const stats = statSync(fullPath);

      return {
        date,
        fileName: entry.name,
        fullPath,
        updatedAt: stats.mtime.toISOString()
      };
    })
    .sort((left, right) => right.date.localeCompare(left.date));
}

export function createArchiveClient(options: {
  rootPath: string;
  diaryPath?: string;
}) {
  const rootPath = resolve(options.rootPath);
  const configuredDiaryPath = options.diaryPath
    ? resolveArchivePath(rootPath, options.diaryPath)
    : undefined;

  function getResolvedDiaryPath() {
    if (!existsSync(rootPath)) {
      return null;
    }

    return findDiaryPath(rootPath, configuredDiaryPath);
  }

  function getStatus() {
    const checkedAt = new Date().toISOString();

    try {
      if (!existsSync(rootPath)) {
        return archiveStatusSchema.parse({
          rootPath,
          diaryPath: null,
          status: "offline",
          fileCount: 0,
          latestDiaryDate: null,
          lastError: "Archive root is not mounted.",
          checkedAt
        });
      }

      const diaryPath = getResolvedDiaryPath();

      if (!diaryPath) {
        return archiveStatusSchema.parse({
          rootPath,
          diaryPath: null,
          status: "degraded",
          fileCount: 0,
          latestDiaryDate: null,
          lastError: "Diary folder was not found under the archive root.",
          checkedAt
        });
      }

      const files = readDiaryFiles(diaryPath);

      return archiveStatusSchema.parse({
        rootPath,
        diaryPath,
        status: "online",
        fileCount: files.length,
        latestDiaryDate: files[0]?.date ?? null,
        lastError: null,
        checkedAt
      });
    } catch (error) {
      return archiveStatusSchema.parse({
        rootPath,
        diaryPath: null,
        status: "offline",
        fileCount: 0,
        latestDiaryDate: null,
        lastError: error instanceof Error ? error.message : "Archive check failed.",
        checkedAt
      });
    }
  }

  function listDiaryEntries(limit = 20) {
    const diaryPath = getResolvedDiaryPath();

    if (!diaryPath) {
      throw new Error("Archive diary folder is not available.");
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const entries = readDiaryFiles(diaryPath)
      .slice(0, safeLimit)
      .map((file) => {
        const content = readFileSync(file.fullPath, {
          encoding: "utf8",
          flag: "r"
        });

        return {
          date: file.date,
          title: createTitle(file.date, content),
          path: join(basename(diaryPath), file.fileName),
          excerpt: createExcerpt(content),
          updatedAt: file.updatedAt
        };
      });

    return archiveDiaryListSchema.parse({
      rootPath,
      diaryPath,
      fetchedAt: new Date().toISOString(),
      entries
    });
  }

  function readDiaryEntry(date: string) {
    const diaryPath = getResolvedDiaryPath();

    if (!diaryPath) {
      throw new Error("Archive diary folder is not available.");
    }

    if (!diaryFilePattern.test(`${date}.md`)) {
      throw new Error("Diary date must use YYYY-MM-DD.");
    }

    const targetPath = resolveInside(diaryPath, join(diaryPath, `${date}.md`));

    if (!existsSync(targetPath)) {
      return null;
    }

    const stats = statSync(targetPath);

    if (stats.size > maxDiaryBytes) {
      throw new Error("Diary file is too large to read through MCP.");
    }

    const content = readFileSync(targetPath, {
      encoding: "utf8",
      flag: "r"
    });

    return archiveDiaryEntrySchema.parse({
      date,
      title: createTitle(date, content),
      path: join(basename(diaryPath), `${date}.md`),
      excerpt: createExcerpt(content),
      updatedAt: toIsoStatTime(targetPath),
      content
    });
  }

  async function getConnector() {
    const status = getStatus();

    return connectorSchema.parse({
      id: "asashiki-archive",
      name: "Asashiki Archive",
      kind: "filesystem-archive",
      status: status.status,
      lastSeenAt: status.checkedAt,
      lastSuccessAt: status.status === "online" ? status.checkedAt : null,
      lastError: status.lastError,
      capabilities: [
        "read_archive_status",
        "list_diary_entries",
        "read_diary_entry",
        "write_diary_entry",
        "update_diary_entry"
      ],
      exposureLevel: "private-personal"
    });
  }

  function writeDiaryEntry(
    date: string,
    content: string,
    options: { overwrite?: boolean } = {}
  ) {
    const diaryPath = getResolvedDiaryPath();

    if (!diaryPath) {
      throw new Error("Archive diary folder is not available.");
    }

    if (!diaryFilePattern.test(`${date}.md`)) {
      throw new Error("Diary date must use YYYY-MM-DD.");
    }

    const targetPath = resolveInside(diaryPath, join(diaryPath, `${date}.md`));
    const exists = existsSync(targetPath);

    if (exists && !options.overwrite) {
      throw new Error(
        "Diary entry already exists. Pass overwrite=true to replace it."
      );
    }

    if (!existsSync(diaryPath)) {
      mkdirSync(diaryPath, { recursive: true });
    }

    writeFileSync(targetPath, content, { encoding: "utf8" });

    const stats = statSync(targetPath);

    return diaryWriteResultSchema.parse({
      date,
      title: createTitle(date, content),
      path: join(basename(diaryPath), `${date}.md`),
      excerpt: createExcerpt(content),
      updatedAt: stats.mtime.toISOString(),
      bytesWritten: stats.size,
      mode: exists ? "replace" : "create"
    });
  }

  function updateDiaryEntry(
    date: string,
    content: string,
    mode: "replace" | "append" = "replace"
  ) {
    const diaryPath = getResolvedDiaryPath();

    if (!diaryPath) {
      throw new Error("Archive diary folder is not available.");
    }

    if (!diaryFilePattern.test(`${date}.md`)) {
      throw new Error("Diary date must use YYYY-MM-DD.");
    }

    const targetPath = resolveInside(diaryPath, join(diaryPath, `${date}.md`));

    if (!existsSync(targetPath)) {
      throw new Error("Diary entry not found. Use writeDiaryEntry to create it.");
    }

    let nextContent = content;

    if (mode === "append") {
      const existing = readFileSync(targetPath, { encoding: "utf8", flag: "r" });
      const separator = existing.endsWith("\n") ? "" : "\n";
      nextContent = `${existing}${separator}${content}`;
    }

    writeFileSync(targetPath, nextContent, { encoding: "utf8" });

    const stats = statSync(targetPath);

    return diaryWriteResultSchema.parse({
      date,
      title: createTitle(date, nextContent),
      path: join(basename(diaryPath), `${date}.md`),
      excerpt: createExcerpt(nextContent),
      updatedAt: stats.mtime.toISOString(),
      bytesWritten: stats.size,
      mode
    });
  }

  function deleteDiaryEntry(date: string) {
    const diaryPath = getResolvedDiaryPath();

    if (!diaryPath) throw new Error("Archive diary folder is not available.");
    if (!diaryFilePattern.test(`${date}.md`)) throw new Error("Diary date must use YYYY-MM-DD.");

    const targetPath = resolveInside(diaryPath, join(diaryPath, `${date}.md`));

    if (!existsSync(targetPath)) {
      return diaryDeleteResultSchema.parse({ date, deleted: false, path: join(basename(diaryPath), `${date}.md`) });
    }

    rmSync(targetPath);
    return diaryDeleteResultSchema.parse({ date, deleted: true, path: join(basename(diaryPath), `${date}.md`) });
  }

  function readArchiveFile(path: string) {
    const root = resolveRoot();
    if (!root) throw new Error("Archive is not available.");

    const target = resolveInside(root, join(root, path));
    if (!existsSync(target)) throw new Error(`File not found: ${path}`);

    const stats = statSync(target);
    if (stats.isDirectory()) throw new Error(`Path is a directory: ${path}`);
    if (stats.size > 512 * 1024) throw new Error("File too large (>512KB).");

    const content = readFileSync(target, { encoding: "utf8" });
    return archiveFileResultSchema.parse({
      path: relative(root, target),
      content,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString()
    });
  }

  function writeArchiveFile(path: string, content: string, overwrite = false) {
    const root = resolveRoot();
    if (!root) throw new Error("Archive is not available.");

    const target = resolveInside(root, join(root, path));
    const exists = existsSync(target);

    if (exists && !overwrite) throw new Error("File already exists. Pass overwrite=true to replace.");

    const dir = resolve(target, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    writeFileSync(target, content, { encoding: "utf8" });

    const stats = statSync(target);
    return archiveFileWriteResultSchema.parse({
      path: relative(root, target),
      size: stats.size,
      savedAt: stats.mtime.toISOString(),
      mode: exists ? "replace" : "create"
    });
  }

  function listArchiveFiles(dir?: string) {
    const root = resolveRoot();
    if (!root) throw new Error("Archive is not available.");

    const target = dir ? resolveInside(root, join(root, dir)) : root;
    if (!existsSync(target)) throw new Error(`Directory not found: ${dir ?? "/"}`);

    const stats = statSync(target);
    if (!stats.isDirectory()) throw new Error(`Path is not a directory: ${dir}`);

    const entries = readdirSync(target, { withFileTypes: true });
    const items = entries
      .filter((e) => !e.name.startsWith("."))
      .map((e) => {
        const fullPath = join(target, e.name);
        const relPath = relative(root, fullPath);
        if (e.isDirectory()) {
          return { name: e.name, path: relPath, isDir: true };
        }
        try {
          const s = statSync(fullPath);
          return { name: e.name, path: relPath, isDir: false, size: s.size, modifiedAt: s.mtime.toISOString() };
        } catch {
          return { name: e.name, path: relPath, isDir: false };
        }
      });

    return archiveFileListResultSchema.parse({
      dir: dir ? relative(root, target) : "",
      items
    });
  }

  function resolveRoot() {
    return existsSync(rootPath) ? rootPath : null;
  }

  return {
    getStatus,
    listDiaryEntries,
    readDiaryEntry,
    writeDiaryEntry,
    updateDiaryEntry,
    deleteDiaryEntry,
    readArchiveFile,
    writeArchiveFile,
    listArchiveFiles,
    getConnector
  };
}

export type ArchiveClient = ReturnType<typeof createArchiveClient>;
