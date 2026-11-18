/**
 * 技能分类中心 · Host 端
 *
 * 职责：
 *  - 通过官方 `skills` 服务枚举当前可用的全部技能（用户 / 项目 / 内置 / 运行时）。
 *  - 读取并原子写入 `~/.dsh/skill-categories.json`（version 1，classes 数组）。
 *  - 与 `~/.dsh/skills/skill-hub/skill-classes.json` 双向对齐（读取默认分类 + 保存时同步类别）。
 *  - 通过 `webServer` 暴露最小 HTTP 路由，浏览器端只负责渲染。
 *
 * 零侵入：不修改任何 @deepseek-ai 包；只读写自己的分类文件与 skill-hub 的分类索引。
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { mkdir, open, readFile, readdir, rename, stat } from "node:fs/promises";

/** Cordis 插件名。 */
const name = "skill-categories";

/** 依赖的 Host 服务。 */
const inject = ["webServer", "skills", "sessions"];

/** 路由表（客户端镜像同一组字面量）。 */
const ROUTES = {
  list: "/api/dsh-skill-categories/list",
  save: "/api/dsh-skill-categories/save",
  reset: "/api/dsh-skill-categories/reset",
  health: "/api/dsh-skill-categories/health",
};

/** 默认分类图标（skill-hub 的 JSON 没有 icon 字段）。 */
const DEFAULT_ICONS = {
  design: "🎨",
  reverse: "🔧",
  imagegen: "🖼️",
  writing: "✍️",
  office: "📊",
  security: "🛡️",
  meta: "🧰",
};

/** 文件大小上限：分类文件很小，1 MiB 足够。 */
const BODY_LIMIT = 1024 * 1024;

/** 统一 JSON 响应。 */
function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  res.end(payload);
}

/** 读取 JSON 请求体（带大小限制）。 */
function readJsonBody(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error(`request body exceeds ${limit} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (text === "") {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("request body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** 原子写 JSON：同目录临时文件 + rename。 */
async function atomicWriteJson(path, value) {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = join(
    dir,
    `.${basename(path)}.${process.pid}.${Date.now().toString(36)}.tmp`,
  );
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const handle = await open(tmp, "w");
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, path);
}

/** 判断 IPv4 是否属于 127/8。 */
function isIPv4Loopback(value) {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

/** 判断 socket 地址是否 loopback（含 ::1 与 IPv4-mapped）。 */
function isLoopbackAddress(address) {
  if (address === undefined) return false;
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) {
    return isIPv4Loopback(normalized.slice(7));
  }
  return isIPv4Loopback(normalized);
}

/** 判断 Host 头是否 loopback。 */
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  return isIPv4Loopback(hostname);
}

/**
 * 请求级信任围栏：只允许本机浏览器访问。
 * 与 skill-explorer 的 loopback 规则保持一致；反向代理头出现即拒绝。
 */
function isLoopbackRequest(request) {
  if (!isLoopbackAddress(request.socket?.remoteAddress)) return false;
  if (
    request.headers["cf-connecting-ip"] !== undefined ||
    request.headers["x-forwarded-for"] !== undefined
  ) {
    return false;
  }
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

/** 简单 JSON 对象判断。 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 生成安全 key。 */
function normalizeKey(value, index) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(trimmed)) return trimmed;
  }
  return `cat-${String(index + 1).padStart(2, "0")}`;
}

/**
 * 将任意来源的 classes 归一化为统一结构。
 * - 只保留 key/label/icon/order/skills 字段
 * - key 唯一、技能全局唯一（先到先得）
 * - order 重新连续编号
 */
function normalizeClasses(raw) {
  const input = Array.isArray(raw) ? raw : [];
  const keys = new Set();
  const skills = new Set();
  const out = [];
  input.forEach((item, index) => {
    if (!isRecord(item)) return;
    const key = normalizeKey(item.key, index);
    if (keys.has(key)) return;
    keys.add(key);
    const label =
      typeof item.label === "string" && item.label.trim() !== ""
        ? item.label.trim().slice(0, 80)
        : key;
    const icon =
      typeof item.icon === "string" && item.icon.trim() !== ""
        ? item.icon.trim().slice(0, 24)
        : DEFAULT_ICONS[key] ?? "📁";
    const list = [];
    if (Array.isArray(item.skills)) {
      for (const skill of item.skills) {
        if (typeof skill !== "string") continue;
        const name = skill.trim();
        if (name === "" || skills.has(name)) continue;
        skills.add(name);
        list.push(name);
      }
    }
    out.push({
      key,
      label,
      icon,
      order: Number.isFinite(item.order) ? Number(item.order) : index + 1,
      skills: list,
    });
  });
  out.sort((a, b) => a.order - b.order);
  return out.map((item, index) => ({ ...item, order: index + 1 }));
}

/** skill-hub 的 classes 对象 → 数组。 */
function classesFromSkillHub(hub) {
  if (!isRecord(hub) || !isRecord(hub.classes)) return [];
  return normalizeClasses(
    Object.entries(hub.classes).map(([key, value], index) => ({
      key,
      label:
        isRecord(value) && typeof value.label === "string" ? value.label : key,
      icon: DEFAULT_ICONS[key] ?? "📁",
      order: index + 1,
      skills:
        isRecord(value) && Array.isArray(value.skills) ? value.skills : [],
    })),
  );
}

/** 读取 JSON 文件；不存在返回 undefined。 */
async function readJsonFile(path) {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

/** 组装路径。 */
function resolvePaths(config) {
  const dshHome =
    config?.dshHome ??
    process.env.DSH_HOME ??
    join(homedir(), ".dsh");
  return {
    dshHome,
    categories: join(dshHome, "skill-categories.json"),
    hub: join(dshHome, "skills", "skill-hub", "skill-classes.json"),
  };
}

/** 官方技能名语法（与 dsh-skill 的 isSkillName 一致）。 */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 官方来源优先级（数字越小越优先）。 */
const SKILL_SOURCE_RANK = {
  "project-dsh": 100,
  "project-agents": 200,
  runtime: 250,
  custom: 300,
  "user-dsh": 400,
  "user-agents": 500,
  bundled: 600,
};

/** 来源优先级；未知来源排在最后。 */
function rankOf(source) {
  return SKILL_SOURCE_RANK[source] ?? 999;
}

/** 解析 YAML 布尔值。 */
function parseYamlBool(value) {
  const text = String(value).toLowerCase();
  if (["true", "yes", "on", "1"].includes(text)) return true;
  if (["false", "no", "off", "0"].includes(text)) return false;
  return undefined;
}

/** 去掉标量两侧引号。 */
function unquote(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * 轻量解析 SKILL.md frontmatter。
 * 支持 name / description / whenToUse（含 | > 块标量）与两个可见性布尔。
 */
function parseFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (match === null) return {};
  const out = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const kv = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (kv === null) continue;
    const key = kv[1];
    const rest = kv[2].trim();
    if (rest === "") continue;
    if (/^[|>][-+]?$/.test(rest)) {
      const collected = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const line = lines[j];
        if (line === "" || /^\s/.test(line)) collected.push(line.trim());
        else break;
      }
      const text = collected.join(" ").trim();
      if (key === "name") out.name = text || undefined;
      else if (key === "description") out.description = text || undefined;
      else if (key === "whenToUse") out.whenToUse = text || undefined;
      continue;
    }
    if (key === "name") out.name = unquote(rest);
    else if (key === "description") out.description = unquote(rest);
    else if (key === "whenToUse") out.whenToUse = unquote(rest);
    else if (key === "disable-model-invocation") {
      out.disableModelInvocation = parseYamlBool(rest);
    } else if (key === "user-invocable") {
      out.userInvocable = parseYamlBool(rest);
    }
  }
  return out;
}

/** 找到最近的含 .git 的祖先目录（没有则返回 cwd 本身）。 */
function findProjectRoot(cwd) {
  let current = cwd;
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return cwd;
    current = parent;
  }
}

/**
 * 扫描单个技能根：只发现 <root>/<name>/SKILL.md 与 <root>/<name>.md。
 * 解析 frontmatter，name/description 必填且 name 需符合官方语法。
 */
async function scanSkillRoot(root, source, into) {
  if (!existsSync(root)) return;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const entryName = entry.name;
    if (entryName === ".system" || entryName === ".trash") continue;
    let file;
    if (entry.isDirectory()) {
      file = join(root, entryName, "SKILL.md");
    } else if (entry.isFile() && entryName.endsWith(".md")) {
      file = join(root, entryName);
    } else if (entry.isSymbolicLink()) {
      try {
        const target = await stat(join(root, entryName));
        if (target.isDirectory()) file = join(root, entryName, "SKILL.md");
        else if (target.isFile() && entryName.endsWith(".md")) {
          file = join(root, entryName);
        } else continue;
      } catch {
        continue;
      }
    } else continue;
    if (!existsSync(file)) continue;
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const parsed = parseFrontmatter(content);
    const declaredName = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const description =
      typeof parsed.description === "string" ? parsed.description.trim() : "";
    if (declaredName === "" || description === "") continue;
    if (!SKILL_NAME_PATTERN.test(declaredName)) continue;
    const existing = into.get(declaredName);
    if (existing !== undefined && rankOf(existing.source) <= rankOf(source)) {
      continue;
    }
    into.set(declaredName, {
      name: declaredName,
      description,
      whenToUse:
        typeof parsed.whenToUse === "string" ? parsed.whenToUse.trim() : "",
      path: file,
      source,
      provider: "filesystem",
      modelInvocable: parsed.disableModelInvocation !== true,
      userInvocable: parsed.userInvocable !== false,
      category: null,
    });
  }
}

/**
 * 文件系统扫描：项目根 / 用户根 / 用户 agents 根。
 * 官方文档说明 skill-filesystem provider 只在 agent preset 层挂载，
 * host 平面的 ctx.skills 看不到用户技能，所以这里按官方根约定自己扫。
 */
async function scanAllSkillRoots(cwd, paths) {
  const into = new Map();
  const projectRoots = new Set();
  if (typeof cwd === "string" && cwd.trim() !== "") {
    projectRoots.add(cwd);
    projectRoots.add(findProjectRoot(cwd));
  }
  for (const root of projectRoots) {
    await scanSkillRoot(join(root, ".dsh", "skills"), "project-dsh", into);
    await scanSkillRoot(join(root, ".agents", "skills"), "project-agents", into);
  }
  await scanSkillRoot(join(paths.dshHome, "skills"), "user-dsh", into);
  await scanSkillRoot(join(homedir(), ".agents", "skills"), "user-agents", into);
  return into;
}

/**
 * 读取当前分类：优先自己的分类文件，不存在时回落到 skill-hub。
 * 返回 { classes, source, warning }。
 */
async function loadClasses(paths, logger) {
  let warning;
  try {
    const parsed = await readJsonFile(paths.categories);
    if (isRecord(parsed) && parsed.version === 1 && Array.isArray(parsed.classes)) {
      return { classes: normalizeClasses(parsed.classes), source: "categories" };
    }
    if (parsed !== undefined) {
      warning = "skill-categories.json 结构不合法，已回落到 skill-hub 默认分类";
    }
  } catch (error) {
    warning = `skill-categories.json 读取失败：${error instanceof Error ? error.message : String(error)}`;
    logger?.warn?.(error);
  }
  try {
    const hub = await readJsonFile(paths.hub);
    if (hub !== undefined) {
      const classes = classesFromSkillHub(hub);
      if (classes.length > 0) return { classes, source: "skill-hub", warning };
    }
  } catch (error) {
    warning = `${warning ? `${warning}；` : ""}skill-hub 分类读取失败：${error instanceof Error ? error.message : String(error)}`;
    logger?.warn?.(error);
  }
  return { classes: [], source: "empty", warning };
}

/** 将当前 classes 同步回 skill-hub 的 skill-classes.json。 */
async function syncSkillHub(paths, classes) {
  const existing = await readJsonFile(paths.hub);
  const hub = isRecord(existing) ? existing : {};
  const oldClasses = isRecord(hub.classes) ? hub.classes : {};
  const next = {};
  classes.forEach((item, index) => {
    const old = isRecord(oldClasses[item.key]) ? oldClasses[item.key] : {};
    next[item.key] = {
      label: item.label,
      folder:
        typeof old.folder === "string" && old.folder.trim() !== ""
          ? old.folder
          : `${String(index + 1).padStart(2, "0")}-${item.key}`,
      skills: [...item.skills],
      ...(typeof old.note === "string" && old.note.trim() !== ""
        ? { note: old.note }
        : {}),
    };
  });
  const output = {
    ...hub,
    version: Number.isFinite(hub.version) ? hub.version : 2,
    updated: new Date().toISOString().slice(0, 10),
    root:
      typeof hub.root === "string" && hub.root.trim() !== ""
        ? hub.root
        : join(paths.dshHome, "skills"),
    classes: next,
  };
  await atomicWriteJson(paths.hub, output);
  return paths.hub;
}

/** 当前会话的 cwd（取第一个非空）。 */
function activeSessionCwd(ctx) {
  try {
    const sessions = ctx.get?.("sessions") ?? ctx.sessions;
    if (typeof sessions?.list !== "function") return undefined;
    for (const session of sessions.list()) {
      const cwd = session?.header?.cwd;
      if (typeof cwd === "string" && cwd.trim() !== "") return cwd;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/** 将 SkillSummary 转成面板需要的形状。 */
function toSkillView(summary) {
  const invocation = isRecord(summary?.invocation) ? summary.invocation : {};
  return {
    name: typeof summary?.name === "string" ? summary.name : "",
    description:
      typeof summary?.description === "string" ? summary.description : "",
    whenToUse: typeof summary?.whenToUse === "string" ? summary.whenToUse : "",
    path: typeof summary?.path === "string" ? summary.path : "",
    source: typeof summary?.source === "string" ? summary.source : "custom",
    provider: typeof summary?.provider === "string" ? summary.provider : "",
    modelInvocable: invocation.modelInvocable !== false,
    userInvocable: invocation.userInvocable !== false,
    category: null,
  };
}

/** 列出技能：文件系统扫描为主，官方 registry（bundled/runtime）补全。 */
async function collectSkills(ctx, cwd, paths) {
  const byName = await scanAllSkillRoots(cwd, paths);
  try {
    const summaries = await ctx.skills.list({ cwd });
    for (const summary of summaries) {
      const skill = toSkillView(summary);
      if (skill.name === "") continue;
      const existing = byName.get(skill.name);
      if (existing === undefined) {
        byName.set(skill.name, skill);
        continue;
      }
      const existingRank = rankOf(existing.source);
      const incomingRank = rankOf(skill.source);
      if (incomingRank < existingRank) {
        byName.set(skill.name, skill);
        continue;
      }
      if (incomingRank > existingRank) continue;
      if (skill.whenToUse !== "") existing.whenToUse = skill.whenToUse;
      if (skill.provider !== "") existing.provider = skill.provider;
      existing.modelInvocable = skill.modelInvocable;
      existing.userInvocable = skill.userInvocable;
    }
  } catch {
    // registry 不可用时，文件系统扫描结果仍然可用
  }
  return [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );
}

/** 给技能打上分类（只认当前真实存在的技能）。 */
function applyCategories(skills, classes) {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const categoryOf = new Map();
  for (const item of classes) {
    for (const skillName of item.skills) {
      if (byName.has(skillName) && !categoryOf.has(skillName)) {
        categoryOf.set(skillName, item.key);
      }
    }
  }
  const decorated = skills.map((skill) => ({
    ...skill,
    category: categoryOf.get(skill.name) ?? null,
  }));
  const cleanClasses = classes.map((item) => ({
    ...item,
    skills: item.skills.filter((name) => byName.has(name)),
  }));
  return { skills: decorated, classes: cleanClasses };
}

/** 统计。 */
function countOf(skills, classes) {
  const classified = skills.filter((skill) => skill.category !== null).length;
  return {
    total: skills.length,
    classified,
    unclassified: skills.length - classified,
    classes: classes.length,
  };
}

/** 构造路由处理器。 */
function makeRoutes(ctx, paths, logger) {
  const guard = (req, res, method) => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, {
        ok: false,
        error: { code: "forbidden", message: "loopback-only route" },
      });
      return false;
    }
    if (req.method !== method) {
      writeJson(res, 405, {
        ok: false,
        error: { code: "method-not-allowed", message: `use ${method}` },
      });
      return false;
    }
    return true;
  };

  const resolveCwd = (url) => {
    const queryCwd = url.searchParams.get("cwd");
    if (typeof queryCwd === "string" && queryCwd.trim() !== "") {
      return queryCwd.trim();
    }
    return activeSessionCwd(ctx) ?? process.cwd();
  };

  return [
    {
      kind: "exact",
      path: ROUTES.list,
      handler: async (req, res) => {
        if (!guard(req, res, "GET")) return;
        try {
          const url = new URL(req.url ?? "/", "http://localhost");
          const cwd = resolveCwd(url);
          const skills = await collectSkills(ctx, cwd, paths);
          const loaded = await loadClasses(paths, logger);
          const merged = applyCategories(skills, loaded.classes);
          writeJson(res, 200, {
            ok: true,
            cwd,
            skills: merged.skills,
            classes: merged.classes,
            counts: countOf(merged.skills, merged.classes),
            storage: {
              categories: paths.categories,
              hub: paths.hub,
              source: loaded.source,
            },
            warning: loaded.warning ?? null,
            generatedAt: new Date().toISOString(),
          });
        } catch (error) {
          logger?.warn?.(error);
          writeJson(res, 500, {
            ok: false,
            error: {
              code: "list-failed",
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      },
    },
    {
      kind: "exact",
      path: ROUTES.save,
      handler: async (req, res) => {
        if (!guard(req, res, "POST")) return;
        try {
          const body = await readJsonBody(req);
          if (!isRecord(body) || !Array.isArray(body.classes)) {
            writeJson(res, 400, {
              ok: false,
              error: {
                code: "invalid-body",
                message: "expected { classes: Array }",
              },
            });
            return;
          }
          const skills = await collectSkills(
            ctx,
            typeof body.cwd === "string" && body.cwd.trim() !== ""
              ? body.cwd.trim()
              : activeSessionCwd(ctx) ?? process.cwd(),
            paths,
          );
          const available = new Set(skills.map((skill) => skill.name));
          const classes = normalizeClasses(body.classes).map((item) => ({
            ...item,
            skills: item.skills.filter((skillName) => available.has(skillName)),
          }));
          const savedAt = new Date().toISOString();
          await atomicWriteJson(paths.categories, {
            version: 1,
            updated: savedAt,
            classes,
          });
          let hubSynced = false;
          let hubError = null;
          if (body.syncHub !== false) {
            try {
              await syncSkillHub(paths, classes);
              hubSynced = true;
            } catch (error) {
              hubError = error instanceof Error ? error.message : String(error);
              logger?.warn?.(error);
            }
          }
          writeJson(res, 200, {
            ok: true,
            classes,
            savedAt,
            hubSynced,
            hubError,
            paths: { categories: paths.categories, hub: paths.hub },
          });
        } catch (error) {
          logger?.warn?.(error);
          writeJson(res, 500, {
            ok: false,
            error: {
              code: "save-failed",
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      },
    },
    {
      kind: "exact",
      path: ROUTES.reset,
      handler: async (req, res) => {
        if (!guard(req, res, "POST")) return;
        try {
          const hub = await readJsonFile(paths.hub);
          const classes = classesFromSkillHub(hub);
          if (classes.length === 0) {
            writeJson(res, 404, {
              ok: false,
              error: {
                code: "hub-not-found",
                message: "skill-hub/skill-classes.json 不存在或没有分类",
              },
            });
            return;
          }
          const savedAt = new Date().toISOString();
          await atomicWriteJson(paths.categories, {
            version: 1,
            updated: savedAt,
            classes,
          });
          writeJson(res, 200, { ok: true, classes, savedAt });
        } catch (error) {
          logger?.warn?.(error);
          writeJson(res, 500, {
            ok: false,
            error: {
              code: "reset-failed",
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      },
    },
    {
      kind: "exact",
      path: ROUTES.health,
      handler: async (req, res) => {
        if (!guard(req, res, "GET")) return;
        try {
          const skills = await collectSkills(ctx, activeSessionCwd(ctx), paths);
          const loaded = await loadClasses(paths, logger);
          writeJson(res, 200, {
            ok: true,
            service: "skill-categories",
            skills: skills.length,
            classes: loaded.classes.length,
            source: loaded.source,
            paths,
          });
        } catch (error) {
          writeJson(res, 500, {
            ok: false,
            error: {
              code: "health-failed",
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      },
    },
  ];
}

let mounted = false;

/**
 * Cordis apply。
 * @param {any} ctx Host 上下文
 * @param {any} config 插件配置
 */
function apply(ctx, config) {
  if (mounted) return;
  mounted = true;
  const logger = {
    warn: (error) => {
      try {
        ctx.logger?.warn?.(error);
      } catch {
        // ignore
      }
    },
  };
  const paths = resolvePaths(config);
  const routes = makeRoutes(ctx, paths, logger);
  ctx.effect(() => {
    const disposers = routes.map((route) => ctx.webServer.register(route));
    return () => {
      mounted = false;
      for (const dispose of disposers) dispose();
    };
  }, "skill-categories: routes");
}

export { apply, inject, name, ROUTES };
