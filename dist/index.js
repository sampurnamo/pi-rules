// extension-src/pi-rules/shared/fs.ts
import { existsSync, statSync } from "fs";
import { appendFile, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
async function readTextFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return void 0;
  }
}
async function listFilesRecursive(rootDir) {
  const results = [];
  if (!existsSync(rootDir)) {
    return results;
  }
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = resolve(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFilesRecursive(absolutePath));
      continue;
    }
    results.push(absolutePath);
  }
  return results.sort((left, right) => left.localeCompare(right));
}
async function resolveRealPath(path) {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}
function fileStatFingerprint(filePath) {
  try {
    const stats = statSync(filePath, { bigint: true });
    return `${stats.mtimeNs}:${stats.ctimeNs}:${stats.size}`;
  } catch {
    return "missing";
  }
}

// extension-src/pi-rules/shared/id.ts
function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// extension-src/pi-rules/shared/time.ts
function now() {
  return Date.now();
}

// extension-src/pi-rules/shared/glob.ts
function globMatch(filePath, pattern) {
  const normalizedPath = normalizeGlobPath(filePath);
  const normalizedPattern = normalizeGlobPath(pattern);
  try {
    const regex = globToRegex(normalizedPattern);
    return regex.test(normalizedPath);
  } catch {
    return false;
  }
}
function normalizeGlobPath(value) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "").replace(/\/$/, "");
}
function globToRegex(pattern) {
  let regex = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    const next = pattern[i + 1];
    const afterNext = pattern[i + 2];
    if (ch === "*" && next === "*" && afterNext === "/") {
      regex += "(?:.*?/)?";
      i += 3;
      continue;
    }
    if (ch === "*" && next === "*") {
      regex += ".*";
      i += 2;
      continue;
    }
    if (ch === "*") {
      regex += "[^/]*";
      i += 1;
      continue;
    }
    if (ch === "?") {
      regex += "[^/]";
      i += 1;
      continue;
    }
    if (ch === "{") {
      const closeIndex = pattern.indexOf("}", i + 1);
      if (closeIndex !== -1) {
        const alternatives = pattern.slice(i + 1, closeIndex).split(",");
        regex += "(?:" + alternatives.map(escapeRegex).join("|") + ")";
        i = closeIndex + 1;
        continue;
      }
    }
    regex += escapeRegexChar(ch);
    i += 1;
  }
  return new RegExp(`^${regex}$`);
}
function escapeRegex(str) {
  return str.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}
function escapeRegexChar(ch) {
  if (/[.+^${}()|[\]\\/]/.test(ch)) {
    return `\\${ch}`;
  }
  return ch;
}

// extension-src/pi-rules/shared/path.ts
import { existsSync as existsSync2 } from "fs";
import { dirname as dirname2, isAbsolute, relative, resolve as resolve2 } from "path";
function normalizePath(input) {
  return input.replaceAll("\\", "/").replace(/^\.\//, "");
}
function isSubPath(parentPath, childPath) {
  const relativePath = relative(resolve2(parentPath), resolve2(childPath));
  return relativePath === "" || !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

// extension-src/pi-rules/domain/ordering.ts
function compareRulesByPriority(a, b) {
  const priorityDiff = (b.frontmatter.priority ?? 0) - (a.frontmatter.priority ?? 0);
  if (priorityDiff !== 0) return priorityDiff;
  const depthDiff = pathDepth(a.relativePath) - pathDepth(b.relativePath);
  if (depthDiff !== 0) return depthDiff;
  return a.relativePath.localeCompare(b.relativePath);
}
function pathDepth(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  let depth = 0;
  let inSegment = false;
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    const isSeparator = code === 47;
    if (!isSeparator && !inSegment) {
      depth++;
      inSegment = true;
    } else if (isSeparator) {
      inSegment = false;
    }
  }
  return depth;
}

// extension-src/pi-rules/domain/matcher.ts
function matchRules(rules, targetPaths) {
  const normalizedTargets = [...new Set(targetPaths.map((path) => normalizePath(path)).filter(Boolean))];
  const matches = [];
  for (const rule of rules) {
    if (rule.frontmatter.alwaysApply === true) {
      if (normalizedTargets.length > 0 && normalizedTargets.every((target) => isTargetIgnored(rule, target))) {
        continue;
      }
      matches.push({ ...rule, matchReason: { type: "alwaysApply" } });
      continue;
    }
    const patterns = normalizePatterns(rule.frontmatter.paths);
    for (const targetPath of normalizedTargets) {
      if (isTargetIgnored(rule, targetPath)) {
        continue;
      }
      const matchedPattern = patterns.find((pattern) => safeMatch(pattern, targetPath));
      if (matchedPattern !== void 0) {
        matches.push({
          ...rule,
          matchReason: { type: "path", targetPath, pattern: matchedPattern }
        });
        break;
      }
    }
  }
  return matches.sort(compareRulesByPriority);
}
function normalizePatterns(paths) {
  if (paths === void 0) return [];
  const values = Array.isArray(paths) ? paths : [paths];
  return values.map((value) => normalizePath(value));
}
function isTargetIgnored(rule, targetPath) {
  const patterns = normalizePatterns(rule.frontmatter.ignorePath);
  if (patterns.length === 0) return false;
  return patterns.some((pattern) => safeMatch(pattern, targetPath));
}
function safeMatch(pattern, targetPath) {
  try {
    return globMatch(targetPath, pattern);
  } catch {
    return false;
  }
}
function matchByTriggers(rules, promptText) {
  const promptLower = promptText.toLowerCase();
  const matches = [];
  for (const rule of rules) {
    if (!rule.frontmatter.triggers) continue;
    for (const trigger of rule.frontmatter.triggers) {
      if (promptLower.includes(trigger.toLowerCase())) {
        matches.push({ ...rule, matchReason: { type: "trigger", trigger } });
        break;
      }
    }
  }
  return matches.sort(compareRulesByPriority);
}
function describeMatchReason(matchReason) {
  if (matchReason.type === "alwaysApply") {
    return "alwaysApply: true";
  }
  if (matchReason.type === "trigger") {
    return `trigger: "${matchReason.trigger}"`;
  }
  return `${matchReason.targetPath} matched ${JSON.stringify(matchReason.pattern)}`;
}

// extension-src/pi-rules/domain/truncator.ts
var DEFAULT_TRUNCATION_NOTICE = "\n\n[... truncated by pi-rules: {path} ...]";
function renderNotice(template, relativePath) {
  return template.replaceAll("{path}", relativePath);
}
function safeSliceEnd(body, end) {
  if (end <= 0) {
    return 0;
  }
  const lastCodeUnit = body.charCodeAt(end - 1);
  if (lastCodeUnit >= 55296 && lastCodeUnit <= 56319) {
    return end - 1;
  }
  return end;
}
function truncateRuleBody(body, options) {
  const noticeTemplate = options.noticeTemplate ?? DEFAULT_TRUNCATION_NOTICE;
  const notice = renderNotice(noticeTemplate, options.relativePath);
  if (body.length <= options.maxChars) {
    return { body, truncated: false, originalLength: body.length };
  }
  if (options.maxChars <= 0) {
    return { body: "", truncated: true, originalLength: body.length };
  }
  if (options.maxChars < notice.length) {
    return { body: notice, truncated: true, originalLength: body.length };
  }
  const sliceEnd = safeSliceEnd(body, options.maxChars - notice.length);
  return { body: `${body.slice(0, sliceEnd)}${notice}`, truncated: true, originalLength: body.length };
}

// extension-src/pi-rules/domain/formatter.ts
function separateParentChild(matches) {
  if (matches.length <= 1) return { children: matches, parents: [] };
  const pathDirs = matches.map((m) => {
    const normalized = m.relativePath.replaceAll("\\", "/");
    const lastSlash = normalized.lastIndexOf("/");
    return lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : "";
  });
  const isParent = new Array(matches.length).fill(false);
  for (let i = 0; i < matches.length; i++) {
    for (let j = 0; j < matches.length; j++) {
      if (i === j) continue;
      if (pathDirs[i].length > 0 && matches[j].relativePath.startsWith(pathDirs[i]) && pathDirs[i] !== pathDirs[j]) {
        isParent[i] = true;
        break;
      }
    }
  }
  const children = [];
  const parents = [];
  for (let i = 0; i < matches.length; i++) {
    if (isParent[i]) {
      parents.push(matches[i]);
    } else {
      children.push(matches[i]);
    }
  }
  return { children, parents };
}
function extractFirstParagraph(body) {
  const lines = body.split("\n");
  const paragraph = [];
  for (const line of lines) {
    if (line.trim() === "" && paragraph.length > 0) break;
    paragraph.push(line);
  }
  return paragraph.join("\n").trim();
}
function formatRuleContext(matches, options) {
  if (matches.length === 0) {
    return { prompt: "", truncated: false };
  }
  const rulesMatches = matches.filter((m) => m.frontmatter.kind !== "inventory");
  const inventoryMatches = matches.filter((m) => m.frontmatter.kind === "inventory");
  const { children, parents } = separateParentChild(rulesMatches);
  const sections = [
    "<pi-rules-context>",
    "The following project rules apply to this turn. Follow them when working with matching files."
  ];
  let totalChars = sections.join("\n").length;
  let truncated = false;
  for (const match of children) {
    const truncation = truncateRuleBody(match.body, {
      maxChars: options.maxRuleChars,
      relativePath: match.relativePath
    });
    if (truncation.truncated) truncated = true;
    const block = [
      `## Rule: ${match.relativePath}`,
      `Matched because: ${describeMatchReason(match.matchReason)}`,
      match.frontmatter.summary ? `Summary: ${match.frontmatter.summary}` : void 0,
      "",
      truncation.body
    ].filter((value) => value !== void 0).join("\n");
    const projected = totalChars + block.length + 2;
    if (projected > options.maxContextChars) {
      truncated = true;
      break;
    }
    sections.push(block);
    totalChars = projected;
  }
  for (const match of parents) {
    const summaryText = match.frontmatter.summary ?? extractFirstParagraph(match.body);
    const block = [
      `## Rule: ${match.relativePath} (parent summary)`,
      `Matched because: ${describeMatchReason(match.matchReason)}`,
      `Summary: ${summaryText}`,
      "",
      "[Full rule available; read the file for complete details]"
    ].filter((value) => value !== void 0).join("\n");
    const projected = totalChars + block.length + 2;
    if (projected > options.maxContextChars) {
      truncated = true;
      break;
    }
    sections.push(block);
    totalChars = projected;
  }
  if (inventoryMatches.length > 0) {
    const invLines = ["## Available Inventories"];
    for (const inv of inventoryMatches) {
      const label = inv.frontmatter.summary ? ` (${inv.frontmatter.summary})` : "";
      invLines.push(`- ${inv.relativePath}${label}`);
    }
    const invBlock = invLines.join("\n");
    const projected = totalChars + invBlock.length + 2;
    if (projected <= options.maxContextChars) {
      sections.push(invBlock);
      totalChars = projected;
    } else {
      truncated = true;
    }
  }
  sections.push("</pi-rules-context>");
  return { prompt: sections.join("\n\n"), truncated };
}

// extension-src/pi-rules/shared/frontmatter.ts
function parseFrontmatter(content) {
  if (!content.startsWith("---")) {
    return { data: {}, content };
  }
  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) {
    return { data: {}, content };
  }
  const rawBlock = content.slice(3, endIndex);
  const body = content.slice(endIndex + 3).trim();
  const data = parseYamlBlock(rawBlock);
  return { data, content: body };
}
function parseYamlBlock(block) {
  const result = {};
  let currentListKey;
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    const listItemMatch = line.match(/^\s+-\s+(.+?)\s*$/);
    if (listItemMatch && currentListKey) {
      const existing = result[currentListKey];
      if (Array.isArray(existing)) {
        existing.push(parseScalar(stripQuotes(listItemMatch[1])));
      }
      continue;
    }
    const kvMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*?)\s*$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      if (rawValue === "") {
        result[key] = [];
        currentListKey = key;
      } else {
        result[key] = parseValue(rawValue);
        currentListKey = void 0;
      }
      continue;
    }
    if (/^\S/.test(line) && line.length > 0) {
      currentListKey = void 0;
    }
  }
  return result;
}
function parseValue(rawValue) {
  const trimmed = rawValue.trim();
  if (trimmed.startsWith("[")) {
    if (!trimmed.endsWith("]")) {
      throw new Error(`Invalid YAML: unclosed bracket in "${trimmed}"`);
    }
    const inner = trimmed.slice(1, -1);
    if (inner.trim() === "") return [];
    return inner.split(",").map((item) => parseScalar(stripQuotes(item.trim())));
  }
  if (trimmed.includes(",") && !trimmed.startsWith('"') && !trimmed.startsWith("'")) {
    const items = trimmed.split(",").map((item) => parseScalar(stripQuotes(item.trim())));
    if (items.length > 1) return items;
  }
  return parseScalar(trimmed);
}
function parseScalar(value) {
  const unquoted = stripQuotes(value);
  if (unquoted === "true") return true;
  if (unquoted === "false") return false;
  if (unquoted === "null" || unquoted === "~" || unquoted === "") return null;
  const intMatch = unquoted.match(/^-?\d+$/);
  if (intMatch) {
    const num = Number.parseInt(unquoted, 10);
    if (Number.isSafeInteger(num)) return num;
  }
  const floatMatch = unquoted.match(/^-?\d+\.\d+$/);
  if (floatMatch) {
    const num = Number.parseFloat(unquoted);
    if (Number.isFinite(num)) return num;
  }
  return unquoted;
}
function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, "");
}

// extension-src/pi-rules/shared/hash.ts
import { createHash } from "crypto";
function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

// extension-src/pi-rules/domain/errors.ts
var RuleParseError = class extends Error {
  filePath;
  constructor(filePath, cause) {
    super(`Failed to parse rule: ${filePath}${cause instanceof Error ? `: ${cause.message}` : ""}`);
    this.name = "RuleParseError";
    this.filePath = filePath;
  }
};

// extension-src/pi-rules/domain/parser.ts
function parseRuleFile(ruleFile, content) {
  const diagnostics = [];
  let frontmatter = {};
  let body = content;
  try {
    const parsed = parseFrontmatter(content);
    frontmatter = normalizeFrontmatter(parsed.data, diagnostics, ruleFile.relativePath);
    body = parsed.content;
  } catch (error) {
    throw new RuleParseError(ruleFile.relativePath, error);
  }
  return {
    ...ruleFile,
    contentHash: sha256(content),
    frontmatter,
    body,
    diagnostics
  };
}
function normalizeFrontmatter(input, diagnostics, rulePath) {
  const frontmatter = {};
  if (typeof input.summary === "string") frontmatter.summary = input.summary;
  if (typeof input.alwaysApply === "boolean") frontmatter.alwaysApply = input.alwaysApply;
  if (typeof input.description === "string") frontmatter.description = input.description;
  if (typeof input.priority === "number") frontmatter.priority = input.priority;
  if (typeof input.guard === "boolean") frontmatter.guard = input.guard;
  frontmatter.paths = normalizeStringOrArray(input.paths, "paths", diagnostics, rulePath);
  frontmatter.ignorePath = normalizeStringOrArray(input.ignorePath, "ignorePath", diagnostics, rulePath);
  frontmatter.triggers = normalizeStringArray(input.triggers, "triggers", diagnostics, rulePath);
  if (input.kind !== void 0) {
    if (input.kind === "rules" || input.kind === "inventory") {
      frontmatter.kind = input.kind;
    } else {
      diagnostics.push({
        severity: "warning",
        rulePath,
        message: `Ignoring invalid kind; expected "rules" or "inventory", got "${String(input.kind)}"`
      });
    }
  }
  return frontmatter;
}
function normalizeStringOrArray(value, fieldName, diagnostics, rulePath) {
  if (value === void 0) return void 0;
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  diagnostics.push({
    severity: "warning",
    rulePath,
    message: `Ignoring invalid ${fieldName}; expected string or string[]`
  });
  return void 0;
}
function normalizeStringArray(value, fieldName, diagnostics, rulePath) {
  if (value === void 0) return void 0;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  if (typeof value === "string") {
    return [value];
  }
  diagnostics.push({
    severity: "warning",
    rulePath,
    message: `Ignoring invalid ${fieldName}; expected string[]`
  });
  return void 0;
}

// extension-src/pi-rules/domain/scanner.ts
import { resolve as resolve4 } from "path";

// extension-src/pi-rules/domain/project-root.ts
import { existsSync as existsSync3, statSync as statSync2 } from "fs";
import { dirname as dirname3, resolve as resolve3 } from "path";
var DEFAULT_PROJECT_MARKERS = [
  ".git",
  "pnpm-workspace.yaml",
  "package.json",
  "pyproject.toml",
  ".pi"
];
function findProjectRoot(startPath, markers = DEFAULT_PROJECT_MARKERS) {
  const resolvedStart = resolve3(startPath);
  if (!existsSync3(resolvedStart)) {
    return void 0;
  }
  const startStats = statSync2(resolvedStart);
  let currentDir = startStats.isDirectory() ? resolvedStart : dirname3(resolvedStart);
  const filesystemRoot = resolve3("/");
  for (; ; ) {
    for (const marker of markers) {
      if (existsSync3(`${currentDir}/${marker}`)) {
        return currentDir;
      }
    }
    if (currentDir === filesystemRoot) {
      return void 0;
    }
    const parent = dirname3(currentDir);
    if (parent === currentDir) {
      return void 0;
    }
    currentDir = parent;
  }
}

// extension-src/pi-rules/domain/scanner.ts
async function scanRuleFiles(cwd) {
  const projectRoot = findProjectRoot(cwd) ?? cwd;
  const rulesDir = resolve4(projectRoot, ".pi/rules");
  const diagnostics = [];
  const files = await listFilesRecursive(rulesDir);
  const ruleFiles = [];
  const seenRealpaths = /* @__PURE__ */ new Set();
  for (const absolutePath of files) {
    if (!absolutePath.endsWith(".md")) continue;
    if (!isSubPath(rulesDir, absolutePath)) continue;
    if (normalizePath(absolutePath).includes("/.pi/.pi-rules/")) continue;
    const realPath = await resolveRealPath(absolutePath);
    if (seenRealpaths.has(realPath)) continue;
    seenRealpaths.add(realPath);
    const fingerprint = fileStatFingerprint(absolutePath);
    if (fingerprint === "missing") {
      diagnostics.push({ severity: "warning", rulePath: absolutePath, message: "Unable to stat rule file" });
      continue;
    }
    const content = await readTextFile(absolutePath);
    if (content === void 0) {
      diagnostics.push({ severity: "warning", rulePath: absolutePath, message: "Unable to read rule file" });
      continue;
    }
    ruleFiles.push({
      absolutePath,
      realPath,
      relativePath: normalizePath(absolutePath.slice(projectRoot.length + 1)),
      ruleId: sha256(realPath),
      contentHash: sha256(content),
      fingerprint
    });
  }
  ruleFiles.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return { projectRoot, rulesDir, ruleFiles, diagnostics };
}

// extension-src/pi-rules/domain/engine.ts
function staticDedupKey(rule) {
  return `${rule.realPath}::${rule.contentHash}`;
}
function dedupeMatches(matches) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const match of matches) {
    if (!seen.has(match.ruleId)) {
      seen.add(match.ruleId);
      result.push(match);
    }
  }
  return result;
}
var RulesEngine = class {
  constructor(options) {
    this.options = options;
  }
  options;
  cache;
  lastContext;
  turnState = { staticInjected: /* @__PURE__ */ new Set(), dynamicInjected: /* @__PURE__ */ new Map() };
  get formatOptions() {
    return { ...this.options };
  }
  async loadRules(cwd, forceReload = false) {
    if (this.cache !== void 0 && !forceReload) {
      return this.cache;
    }
    const scanResult = await scanRuleFiles(cwd);
    const rules = [];
    const diagnostics = [...scanResult.diagnostics];
    const fingerprints = /* @__PURE__ */ new Map();
    for (const ruleFile of scanResult.ruleFiles) {
      fingerprints.set(ruleFile.relativePath, ruleFile.fingerprint);
      const content = await readTextFile(ruleFile.absolutePath);
      if (content === void 0) {
        diagnostics.push({
          severity: "warning",
          rulePath: ruleFile.relativePath,
          message: "Unable to read rule file"
        });
        continue;
      }
      const parsedRule = parseRuleFile(ruleFile, content);
      rules.push(parsedRule);
      diagnostics.push(...parsedRule.diagnostics);
    }
    this.cache = {
      projectRoot: scanResult.projectRoot,
      rules,
      diagnostics,
      scannedAt: now(),
      fingerprints
    };
    return this.cache;
  }
  /**
   * Quick-check whether cached rules are still up-to-date by comparing
   * on-disk stat fingerprints against stored fingerprints. Returns true
   * when no rule file has been modified, added, or removed.
   */
  async fingerprintsMatch(cwd) {
    if (this.cache === void 0) {
      return false;
    }
    const scanResult = await scanRuleFiles(cwd);
    if (scanResult.ruleFiles.length !== this.cache.fingerprints.size) {
      return false;
    }
    for (const ruleFile of scanResult.ruleFiles) {
      const storedFingerprint = this.cache.fingerprints.get(ruleFile.relativePath);
      if (storedFingerprint === void 0) {
        return false;
      }
      const currentFingerprint = fileStatFingerprint(ruleFile.absolutePath);
      if (currentFingerprint !== storedFingerprint) {
        return false;
      }
    }
    return true;
  }
  /**
   * Like loadRules but uses fingerprint matching to avoid re-reading files
   * when possible. Falls back to full load when fingerprints have changed.
   */
  async loadRulesIfUnchanged(cwd) {
    if (await this.fingerprintsMatch(cwd)) {
      return this.cache;
    }
    return this.loadRules(cwd, true);
  }
  async matchRulesForPaths(cwd, targetPaths, promptText) {
    const loaded = await this.loadRulesIfUnchanged(cwd);
    const pathMatches = matchRules(loaded.rules, targetPaths);
    const triggerMatches = promptText ? matchByTriggers(loaded.rules, promptText) : [];
    const matches = dedupeMatches([...pathMatches, ...triggerMatches]);
    const formatted = formatRuleContext(matches, this.options);
    return {
      targetPaths,
      matches,
      prompt: formatted.prompt,
      truncated: formatted.truncated
    };
  }
  /**
   * Like matchRulesForPaths but filters out rules already injected
   * in the current turn (context file dedup for static injection).
   */
  async matchRulesForPathsStatic(cwd, targetPaths, contextFileRealPaths, promptText) {
    const loaded = await this.loadRulesIfUnchanged(cwd);
    const filteredRules = loaded.rules.filter(
      (rule) => !contextFileRealPaths.has(rule.realPath) && !contextFileRealPaths.has(rule.absolutePath)
    );
    const dedupedRules = filteredRules.filter((rule) => !this.turnState.staticInjected.has(staticDedupKey(rule)));
    const pathMatches = matchRules(dedupedRules, targetPaths);
    const triggerMatches = promptText ? matchByTriggers(dedupedRules, promptText) : [];
    const matches = dedupeMatches([...pathMatches, ...triggerMatches]);
    const formatted = formatRuleContext(matches, this.options);
    return {
      targetPaths,
      matches,
      prompt: formatted.prompt,
      truncated: formatted.truncated
    };
  }
  /**
   * Like matchRulesForPaths but filters out rules already dynamically injected
   * for a specific scope key (target path) in the current turn.
   */
  async matchRulesForPathsDynamic(cwd, targetPaths, promptText) {
    const loaded = await this.loadRulesIfUnchanged(cwd);
    const scopeKey = targetPaths[0] ?? "_all";
    const injectedInScope = this.turnState.dynamicInjected.get(scopeKey) ?? /* @__PURE__ */ new Set();
    const dedupedRules = loaded.rules.filter((rule) => !injectedInScope.has(staticDedupKey(rule)));
    const pathMatches = matchRules(dedupedRules, targetPaths);
    const triggerMatches = promptText ? matchByTriggers(dedupedRules, promptText) : [];
    const matches = dedupeMatches([...pathMatches, ...triggerMatches]);
    const formatted = formatRuleContext(matches, this.options);
    return {
      targetPaths,
      matches,
      prompt: formatted.prompt,
      truncated: formatted.truncated
    };
  }
  markStaticInjected(rule) {
    this.turnState.staticInjected.add(staticDedupKey(rule));
  }
  markDynamicInjected(scopeKey, rule) {
    const set = this.turnState.dynamicInjected.get(scopeKey) ?? /* @__PURE__ */ new Set();
    set.add(staticDedupKey(rule));
    this.turnState.dynamicInjected.set(scopeKey, set);
  }
  markStaticInjectedBatch(rules) {
    for (const rule of rules) {
      this.turnState.staticInjected.add(staticDedupKey(rule));
    }
  }
  markDynamicInjectedBatch(scopeKey, rules) {
    const set = this.turnState.dynamicInjected.get(scopeKey) ?? /* @__PURE__ */ new Set();
    for (const rule of rules) {
      set.add(staticDedupKey(rule));
    }
    this.turnState.dynamicInjected.set(scopeKey, set);
  }
  wasFullInjected(rule) {
    const key = staticDedupKey(rule);
    if (this.turnState.staticInjected.has(key)) return true;
    for (const injected of this.turnState.dynamicInjected.values()) {
      if (injected.has(key)) return true;
    }
    return false;
  }
  recordInjection(targetPaths, context, elapsedMs) {
    const record = {
      turnId: createId("turn"),
      targetPaths,
      rules: context.matches.map((match) => ({
        ruleId: match.ruleId,
        relativePath: match.relativePath,
        summary: match.frontmatter.summary,
        matchReason: match.matchReason
      })),
      injectedAt: now(),
      elapsedMs,
      truncated: context.truncated
    };
    this.lastContext = record;
    return record;
  }
  getLastContext() {
    return this.lastContext;
  }
  async getStatus(cwd) {
    const loaded = await this.loadRulesIfUnchanged(cwd);
    return {
      projectRoot: loaded.projectRoot,
      rulesDir: `${loaded.projectRoot}/.pi/rules`,
      ruleCount: loaded.rules.length,
      diagnostics: loaded.diagnostics,
      rules: loaded.rules,
      lastContext: this.lastContext
    };
  }
  clearCache() {
    this.cache = void 0;
  }
  resetTurn() {
    this.turnState = { staticInjected: /* @__PURE__ */ new Set(), dynamicInjected: /* @__PURE__ */ new Map() };
  }
};

// extension-src/pi-rules/app/config.ts
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname as dirname4, resolve as resolve5 } from "path";

// extension-src/pi-rules/app/constants.ts
var DEFAULT_MAX_RULE_CHARS = 12e3;
var DEFAULT_MAX_CONTEXT_CHARS = 4e4;
var DEFAULT_MAINTAINER_LOG_LINES = 100;

// extension-src/pi-rules/app/config.ts
var CONFIG_DIR_NAME = ".pi";
var DEFAULT_CONFIG = {
  disabled: false,
  mode: "both",
  recommendationEnabled: true,
  widgetEnabled: true,
  appliedWidgetEnabled: true,
  maxRuleChars: DEFAULT_MAX_RULE_CHARS,
  maxContextChars: DEFAULT_MAX_CONTEXT_CHARS,
  maintainerLogLines: DEFAULT_MAINTAINER_LOG_LINES,
  writeGuardEnabled: false,
  dynamicInjection: "full"
};
function readConfigFromEnv(env = process.env) {
  return {
    disabled: env.PI_RULES_DISABLED === "1" ? true : void 0,
    recommendationEnabled: env.PI_RULES_RECOMMENDATIONS_DISABLED === "1" ? false : void 0,
    appliedWidgetEnabled: env.PI_RULES_APPLIED_WIDGET === "0" ? false : env.PI_RULES_APPLIED_WIDGET === "1" ? true : void 0,
    maxRuleChars: parsePositiveInteger(env.PI_RULES_MAX_RULE_CHARS),
    maxContextChars: parsePositiveInteger(env.PI_RULES_MAX_CONTEXT_CHARS),
    maintainerLogLines: parsePositiveInteger(env.PI_RULES_MAINTAINER_LOG_LINES),
    writeGuardEnabled: parseBooleanFlag(env.PI_RULES_WRITE_GUARD),
    dynamicInjection: parseDynamicInjection(env.PI_RULES_DYNAMIC_INJECTION)
  };
}
function readConfigFromFiles(projectRoot, homeDir = homedir()) {
  return mergePartialConfigFiles(
    readConfigJsonFile(resolve5(homeDir, CONFIG_DIR_NAME, "agent", "pi-rules", "config.json")),
    readConfigJsonFile(resolve5(projectRoot, CONFIG_DIR_NAME, "pi-rules", "config.json"))
  );
}
function writeProjectConfigPatch(projectRoot, patch) {
  const configPath = resolve5(projectRoot, CONFIG_DIR_NAME, "pi-rules", "config.json");
  const current = readJsonObject(configPath);
  const next = { ...current, ...sanitizeConfigPatch(patch) };
  mkdirSync(dirname4(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}
`, "utf8");
  return configPath;
}
function mergeConfig(...parts) {
  const config = { ...DEFAULT_CONFIG };
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (value !== void 0) {
        config[key] = value;
      }
    }
  }
  return config;
}
function readJsonObject(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function sanitizeConfigPatch(patch) {
  return stripUndefinedConfig(normalizeConfigObject(patch) ?? {});
}
function stripUndefinedConfig(config) {
  const result = {};
  for (const [key, value] of Object.entries(config)) {
    if (value !== void 0) {
      result[key] = value;
    }
  }
  return result;
}
function mergePartialConfigFiles(...parts) {
  const config = {};
  for (const part of parts) {
    if (part === void 0) continue;
    for (const [key, value] of Object.entries(part)) {
      if (value !== void 0) {
        config[key] = value;
      }
    }
  }
  return config;
}
function readConfigJsonFile(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return void 0;
  }
  return normalizeConfigObject(parsed);
}
function normalizeConfigObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
  const input = value;
  return {
    disabled: typeof input.disabled === "boolean" ? input.disabled : void 0,
    mode: isMode(input.mode) ? input.mode : void 0,
    recommendationEnabled: typeof input.recommendationEnabled === "boolean" ? input.recommendationEnabled : void 0,
    widgetEnabled: typeof input.widgetEnabled === "boolean" ? input.widgetEnabled : void 0,
    appliedWidgetEnabled: typeof input.appliedWidgetEnabled === "boolean" ? input.appliedWidgetEnabled : void 0,
    maxRuleChars: typeof input.maxRuleChars === "number" && input.maxRuleChars > 0 ? input.maxRuleChars : void 0,
    maxContextChars: typeof input.maxContextChars === "number" && input.maxContextChars > 0 ? input.maxContextChars : void 0,
    maintainerLogLines: typeof input.maintainerLogLines === "number" && input.maintainerLogLines > 0 ? input.maintainerLogLines : void 0,
    writeGuardEnabled: typeof input.writeGuardEnabled === "boolean" ? input.writeGuardEnabled : void 0,
    dynamicInjection: parseDynamicInjection(
      typeof input.dynamicInjection === "string" ? input.dynamicInjection : void 0
    )
  };
}
function isMode(value) {
  return value === "static" || value === "dynamic" || value === "both" || value === "off";
}
function parsePositiveInteger(value) {
  if (value === void 0) return void 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : void 0;
}
function parseBooleanFlag(value) {
  if (value === void 0) return void 0;
  return value === "1" || value.toLowerCase() === "true";
}
function parseDynamicInjection(value) {
  return value === "off" || value === "full" ? value : void 0;
}

// extension-src/pi-rules/app/state.ts
var SESSION_HOT_PATHS_MAX = 100;
function createRuntimeState(projectRoot) {
  return {
    projectRoot,
    recentReadPaths: /* @__PURE__ */ new Set(),
    recentChangedPaths: /* @__PURE__ */ new Set(),
    sessionHotPaths: /* @__PURE__ */ new Set(),
    gitStatusBeforeTurn: ""
  };
}
function resetTurnState(state) {
  state.recentReadPaths.clear();
  state.recentChangedPaths.clear();
  state.gitStatusBeforeTurn = "";
}
function resetSessionState(state) {
  resetTurnState(state);
  state.sessionHotPaths.clear();
  state.lastContext = void 0;
}
function addSessionHotPaths(state, paths) {
  for (const path of paths) {
    if (path.length === 0) continue;
    if (state.sessionHotPaths.has(path)) continue;
    if (state.sessionHotPaths.size >= SESSION_HOT_PATHS_MAX) {
      const oldest = state.sessionHotPaths.values().next().value;
      if (oldest !== void 0) state.sessionHotPaths.delete(oldest);
    }
    state.sessionHotPaths.add(path);
  }
}
export {
  DEFAULT_CONFIG,
  RulesEngine,
  SESSION_HOT_PATHS_MAX,
  addSessionHotPaths,
  createRuntimeState,
  mergeConfig,
  readConfigFromEnv,
  readConfigFromFiles,
  resetSessionState,
  resetTurnState,
  writeProjectConfigPatch
};
//# sourceMappingURL=index.js.map