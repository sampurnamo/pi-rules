// extension-src/pi-rules/pi/index.ts
import { realpathSync } from "fs";
import { mkdir as mkdir2, readFile as readFile3, stat as stat2, writeFile as writeFile2 } from "fs/promises";
import { resolve as resolve8 } from "path";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// extension-src/pi-rules/app/config.ts
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, resolve } from "path";

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
    readConfigJsonFile(resolve(homeDir, CONFIG_DIR_NAME, "agent", "pi-rules", "config.json")),
    readConfigJsonFile(resolve(projectRoot, CONFIG_DIR_NAME, "pi-rules", "config.json"))
  );
}
function writeProjectConfigPatch(projectRoot, patch) {
  const configPath = resolve(projectRoot, CONFIG_DIR_NAME, "pi-rules", "config.json");
  const current = readJsonObject(configPath);
  const next = { ...current, ...sanitizeConfigPatch(patch) };
  mkdirSync(dirname(configPath), { recursive: true });
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
import { existsSync } from "fs";
import { dirname as dirname2, isAbsolute, relative, resolve as resolve2 } from "path";
function normalizePath(input) {
  return input.replaceAll("\\", "/").replace(/^\.\//, "");
}
function toAbsolutePath(root, inputPath) {
  return isAbsolute(inputPath) ? resolve2(inputPath) : resolve2(root, inputPath);
}
function toRelativeProjectPath(projectRoot, inputPath) {
  return normalizePath(relative(projectRoot, toAbsolutePath(projectRoot, inputPath)));
}
function isSubPath(parentPath, childPath) {
  const relativePath = relative(resolve2(parentPath), resolve2(childPath));
  return relativePath === "" || !relativePath.startsWith("..") && !isAbsolute(relativePath);
}
function findAncestorContaining(startDir, entryName) {
  let currentDir = resolve2(startDir);
  for (; ; ) {
    if (existsSync(resolve2(currentDir, entryName))) {
      return currentDir;
    }
    const parentDir = dirname2(currentDir);
    if (parentDir === currentDir) {
      return void 0;
    }
    currentDir = parentDir;
  }
}
function findProjectRoot(startDir) {
  return findAncestorContaining(startDir, ".git") ?? findAncestorContaining(startDir, ".pi") ?? findAncestorContaining(startDir, "package.json") ?? resolve2(startDir);
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

// extension-src/pi-rules/features/tool-paths.ts
function extractToolPaths(event, projectRoot) {
  const paths = /* @__PURE__ */ new Set();
  if (hasPathInput(event.input)) {
    paths.add(toRelativeProjectPath(projectRoot, event.input.path));
  }
  if (event.toolName === "grep" || event.toolName === "find" || event.toolName === "ls") {
    const pathValue = event.input.path;
    if (typeof pathValue === "string" && pathValue.length > 0) {
      paths.add(toRelativeProjectPath(projectRoot, pathValue));
    }
  }
  if (event.toolName === "bash") {
    const command = event.input.command;
    if (typeof command === "string") {
      for (const candidate of extractPathsFromBashCommand(command)) {
        if (isValidPathToken(candidate)) {
          paths.add(candidate);
        }
      }
    }
  }
  return [...paths].filter((path) => path.length > 0 && !path.startsWith(".."));
}
function extractRemovedPaths(command, projectRoot) {
  const results = [];
  const rmMatches = command.match(/\brm\s+(?:-[rfiv]+\s+)*([^\s&|;]+)/g);
  if (rmMatches) {
    for (const match of rmMatches) {
      const path = match.replace(/^rm\s+(?:-[rfiv]+\s+)*/, "").trim();
      if (path && !path.startsWith("-")) {
        const normalized = normalizePath(path);
        if (isValidPathToken(normalized)) {
          results.push(toRelativeProjectPath(projectRoot, normalized));
        }
      }
    }
  }
  return results.filter((p) => p.length > 0 && !p.startsWith(".."));
}
function extractPromptPaths(prompt) {
  const matches = prompt.match(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+\.[A-Za-z0-9_-]+/g) ?? [];
  return [...new Set(matches.map((match) => normalizePath(match)).filter(isValidPathToken))];
}
function extractWriteToolCallPaths(event, projectRoot) {
  if (event.toolName !== "write" && event.toolName !== "edit" || !hasPathInput(event.input)) {
    return [];
  }
  const path = toRelativeProjectPath(projectRoot, event.input.path);
  return path.length > 0 && !path.startsWith("..") ? [path] : [];
}
function hasPathInput(input) {
  return typeof input.path === "string";
}
function extractPathsFromBashCommand(command) {
  const tokens = command.match(/(?:\.|[^\s"'])+/g) ?? [];
  const results = /* @__PURE__ */ new Set();
  for (const token of tokens) {
    if (token.startsWith("-") || token.includes("=")) continue;
    if (!token.includes("/") && !token.includes(".")) continue;
    const normalized = normalizePath(token.replace(/^['"]|['"]$/g, ""));
    if (normalized.length > 0 && !normalized.startsWith("/") && !normalized.startsWith("~") && isValidPathToken(normalized)) {
      results.add(normalized);
    }
  }
  const rmMatches = command.match(/\brm\s+(?:-[rfiv]+\s+)*([^\s&|;]+)/g);
  if (rmMatches) {
    for (const match of rmMatches) {
      const path = match.replace(/^rm\s+(?:-[rfiv]+\s+)*/, "").trim();
      if (path && !path.startsWith("-")) {
        const normalized = normalizePath(path);
        if (isValidPathToken(normalized)) {
          results.add(normalized);
        }
      }
    }
  }
  const mvMatches = command.match(/\bmv\s+(?:-[fivnT]+\s+)*([^\s&|;]+)\s+([^\s&|;]+)/g);
  if (mvMatches) {
    for (const match of mvMatches) {
      const parts = match.replace(/^mv\s+(?:-[fivnT]+\s+)*/, "").trim().split(/\s+/);
      for (const part of parts) {
        const normalized = normalizePath(part);
        if (isValidPathToken(normalized)) results.add(normalized);
      }
    }
  }
  return [...results];
}
function isValidPathToken(token) {
  if (token.length === 0) return false;
  if (token === "/dev/null") return false;
  if (/^\d*[&|]?>/.test(token)) return false;
  if (/^[&|]/.test(token)) return false;
  if (token.includes("*") || token.includes("?") || token.includes("!")) return false;
  if (/[{}()[\]]/.test(token)) return false;
  if (token.startsWith("$") || token.startsWith("#!")) return false;
  if (/^[&|;,:`]/.test(token)) return false;
  if (/^\d+\.$/.test(token)) return false;
  if (/^\d+(\.\d+)+$/.test(token)) return false;
  if (/^\.[a-zA-Z][a-zA-Z0-9]*$/.test(token) && !token.includes("/")) return false;
  if (/^[./]+$/.test(token)) return false;
  if (/\.{3,}$/.test(token)) return false;
  if (!/[a-zA-Z0-9]/.test(token)) return false;
  if (!token.includes("/") && token.length < 2) return false;
  return true;
}

// extension-src/pi-rules/features/watcher.ts
import { watch as fsWatch } from "fs";
function startWatcher(opts) {
  const debounceMs = opts.debounceMs ?? 100;
  const watchers = [];
  let timer = null;
  let stopped = false;
  const fire = () => {
    timer = null;
    if (stopped) return;
    try {
      opts.onChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[pi-rules] watcher onChange threw: ${msg}
`);
    }
  };
  const schedule = () => {
    if (stopped) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(fire, debounceMs);
  };
  for (const root of opts.roots) {
    try {
      const w = fsWatch(root, { recursive: true }, () => schedule());
      w.on("error", (err) => {
        process.stderr.write(`[pi-rules] watcher error (${root}): ${err.message}
`);
      });
      watchers.push(w);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[pi-rules] failed to watch ${root}: ${msg}
`);
    }
  }
  return {
    stop: async () => {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      for (const w of watchers) {
        try {
          w.close();
        } catch {
        }
      }
    }
  };
}

// extension-src/pi-rules/pi/banner.ts
function statusLineText({ ruleCount, hasErrors, pendingCount }) {
  const base = `pi-rules: ${ruleCount} rules \u2713`;
  const withPending = pendingCount > 0 ? `${base} | ${pendingCount} pending` : base;
  return hasErrors ? `${withPending} (!)` : withPending;
}
function describeAppliedReason(reason) {
  if (reason.type === "path") return reason.pattern ?? reason.targetPath ?? "path";
  if (reason.type === "trigger") return `trigger: ${reason.trigger ?? "?"}`;
  return "alwaysApply";
}
function renderAppliedRulesLines(input, fg = (_, text) => text) {
  const seen = /* @__PURE__ */ new Set();
  const rules = input.rules.filter((rule) => {
    const key = rule.ruleId ?? rule.relativePath;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (rules.length === 0) {
    return [];
  }
  const maxPathLen = Math.max(...rules.map((rule) => rule.relativePath.length));
  const rendered = rules.map((rule) => ({
    path: rule.relativePath.padEnd(maxPathLen + 2),
    reason: describeAppliedReason(rule.matchReason)
  }));
  const lines = [];
  for (let i = 0; i < rendered.length; i++) {
    const connector = i === rendered.length - 1 ? "\u2514\u2500" : "\u251C\u2500";
    lines.push(fg("dim", `${connector} ${rendered[i].path}${rendered[i].reason}`));
  }
  return lines;
}

// extension-src/pi-rules/pi/commands.ts
import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { resolve as resolve3 } from "path";

// extension-src/pi-rules/pi/doctor.ts
async function runDoctor(cwd, runtimeDeps) {
  const status = await runtimeDeps.engine.getStatus(cwd);
  const errorCount = status.diagnostics.filter((d) => d.severity === "error").length;
  const ok = errorCount === 0;
  const header = ok ? `pi-rules doctor: OK (${status.ruleCount} rules)` : `pi-rules doctor: ERRORS (${status.ruleCount} rules, ${errorCount} errors)`;
  const lines = [header, `Project root: ${status.projectRoot}`, `Rules dir: ${status.rulesDir}`, ""];
  for (const rule of status.rules) {
    const paths = Array.isArray(rule.frontmatter.paths) ? rule.frontmatter.paths.join(", ") : rule.frontmatter.paths ?? "always";
    const ignorePaths = Array.isArray(rule.frontmatter.ignorePath) ? rule.frontmatter.ignorePath.join(", ") : rule.frontmatter.ignorePath ?? "-";
    const kind = rule.frontmatter.kind ?? "rules";
    const priority = rule.frontmatter.priority ?? 0;
    const summary = rule.frontmatter.summary ?? rule.frontmatter.description ?? "";
    lines.push(`  ${rule.relativePath}`);
    lines.push(`    summary  : ${summary}`);
    lines.push(`    paths    : ${paths}`);
    lines.push(`    ignore   : ${ignorePaths}`);
    lines.push(`    kind     : ${kind}`);
    lines.push(`    priority : ${priority}`);
    lines.push("");
  }
  if (status.diagnostics.length > 0) {
    lines.push("--- Diagnostics ---");
    for (const diag of status.diagnostics) {
      const prefix = diag.severity === "error" ? "ERR" : "WARN";
      lines.push(`  [${prefix}] ${diag.rulePath ?? "?"}: ${diag.message}`);
    }
  }
  return { ruleCount: status.ruleCount, errorCount, lines };
}

// extension-src/pi-rules/pi/commands.ts
function registerCommands(pi, runtime) {
  pi.registerCommand("pi-rules:init", {
    description: "Invoke the init-advanced skill with optional prompt",
    handler: async (args, ctx) => {
      const extra = args.trim();
      const message = extra ? `/skill:init-advanced ${extra}` : "/skill:init-advanced";
      if (ctx.isIdle()) {
        pi.sendUserMessage(message);
      } else {
        pi.sendUserMessage(message, { deliverAs: "followUp" });
      }
    }
  });
  pi.registerCommand("pi-rules:status", {
    description: "Show discovered rules and pending recommendations",
    handler: async (_args, ctx) => {
      runtime.syncRuntime(ctx.cwd);
      const current = runtime.getRuntime();
      await current.store.initialize();
      const status = await current.engine.getStatus(ctx.cwd);
      const recs = await current.store.getPending();
      ctx.ui.notify(formatStatus(status, recs.length), "info");
      if (recs.length === 0) {
        return;
      }
      const choice = await ctx.ui.select(
        "Select a rule update recommendation:",
        recs.map((rec2, idx) => `${idx + 1}. [${rec2.id}] ${rec2.ruleRelativePath} \u2014 ${rec2.summary.split("\n")[0]}`)
      );
      if (!choice) return;
      const match = choice.match(/^\d+\. \[([^\]]+)\]/);
      const id = match?.[1];
      if (!id) return;
      const rec = recs.find((item) => item.id === id);
      if (!rec) return;
      const ruleContent = await readFile(rec.rulePath, "utf8").catch(() => void 0);
      await ctx.ui.editor("Rule update preview", formatRecommendationDialog(rec, ruleContent));
      const action = await ctx.ui.select("Action:", [
        "Approve (apply this recommendation)",
        "Cancel (dismiss)",
        "Close"
      ]);
      if (action?.startsWith("Approve")) {
        await applyRecommendation(current, rec, ctx);
      } else if (action?.startsWith("Cancel")) {
        await current.store.cancel(rec.id);
        ctx.ui.notify(`Cancelled ${rec.id}`, "info");
        await runtime.updateWidget(ctx);
      }
    }
  });
  pi.registerCommand("pi-rules:mode", {
    description: "Set project pi-rules injection mode",
    handler: async (args, ctx) => {
      runtime.syncRuntime(ctx.cwd);
      const currentMode = runtime.getRuntime().config.mode;
      const requested = args.trim();
      const selected = isMode2(requested) ? requested : await ctx.ui.select("pi-rules mode", modeOptions(currentMode));
      const mode = parseModeSelection(selected);
      if (mode === void 0) return;
      const configPath = writeProjectConfigPatch(runtime.getRuntime().state.projectRoot, { mode });
      runtime.syncRuntime(ctx.cwd);
      await runtime.updateWidget(ctx);
      ctx.ui.notify(`pi-rules mode set to ${mode} in ${configPath}`, "info");
    }
  });
  pi.registerCommand("pi-rules:write-guard", {
    description: "Configure project pi-rules write/edit guard",
    handler: async (args, ctx) => {
      runtime.syncRuntime(ctx.cwd);
      const current = runtime.getRuntime();
      const requested = args.trim().toLowerCase();
      const selected = parseWriteGuardArg(requested) ?? await ctx.ui.select("pi-rules write guard", guardOptions(current.config.writeGuardEnabled));
      const writeGuardEnabled = parseWriteGuardSelection(selected);
      if (writeGuardEnabled === void 0) return;
      const configPath = writeProjectConfigPatch(current.state.projectRoot, { writeGuardEnabled });
      runtime.syncRuntime(ctx.cwd);
      await runtime.updateWidget(ctx);
      ctx.ui.notify(`pi-rules write guard ${writeGuardEnabled ? "enabled" : "disabled"} in ${configPath}`, "info");
    }
  });
  pi.registerCommand("pi-rules:doctor", {
    description: "Show rule discovery report with diagnostics",
    handler: async (_args, ctx) => {
      runtime.syncRuntime(ctx.cwd);
      const current = runtime.getRuntime();
      const result = await runDoctor(ctx.cwd, current);
      ctx.ui.notify(result.lines.join("\n"), "info");
    }
  });
  pi.registerCommand("pi-rules:context", {
    description: "Show last injected pi-rules context",
    handler: async (_args, ctx) => {
      const current = runtime.getRuntime();
      ctx.ui.notify(formatContext(current.state.lastContext), "info");
    }
  });
  pi.registerCommand("pi-rules:cleanup", {
    description: "Show recommendation storage location",
    handler: async (_args, ctx) => {
      runtime.syncRuntime(ctx.cwd);
      const current = runtime.getRuntime();
      ctx.ui.notify(`Recommendations are stored at ${current.store.recommendationsPath}`, "info");
    }
  });
}
var MODES = ["static", "dynamic", "both", "off"];
function isMode2(value) {
  return typeof value === "string" && MODES.includes(value);
}
function modeOptions(currentMode) {
  return MODES.map((mode) => mode === currentMode ? `${mode} (current)` : mode);
}
function parseModeSelection(selection) {
  const value = selection?.replace(" (current)", "").trim();
  return isMode2(value) ? value : void 0;
}
function guardOptions(enabled) {
  return enabled ? ["Disable write guard", "Keep enabled"] : ["Enable write guard", "Keep disabled"];
}
function parseWriteGuardArg(value) {
  if (["on", "true", "1", "enable", "enabled"].includes(value)) return "Enable write guard";
  if (["off", "false", "0", "disable", "disabled"].includes(value)) return "Disable write guard";
  return void 0;
}
function parseWriteGuardSelection(selection) {
  if (selection?.startsWith("Enable") || selection?.startsWith("Keep enabled")) return true;
  if (selection?.startsWith("Disable") || selection?.startsWith("Keep disabled")) return false;
  return void 0;
}
async function applyRecommendation(current, rec, ctx, notifySuccess = true) {
  await current.store.approve(rec.id);
  try {
    await spawnUpdateAgent(rec, current.state.projectRoot);
    await current.store.markCompleted(rec.id);
    if (notifySuccess) {
      ctx.ui.notify(`Applied recommendation ${rec.id}: Updated ${rec.ruleRelativePath}`, "info");
    }
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await current.store.markError(rec.id, errorMessage);
    ctx.ui.notify(`Failed to apply ${rec.id}: ${errorMessage}`, "error");
    return false;
  }
}
function formatStatus(status, pendingCount) {
  const lines = [
    `Project root: ${status.projectRoot}`,
    `Rules dir: ${status.rulesDir}`,
    `Rules: ${status.ruleCount} files`,
    `Diagnostics: ${status.diagnostics.length}`
  ];
  if (pendingCount !== void 0 && pendingCount > 0) {
    lines.push(`Pending Recommendations: ${pendingCount}`);
  }
  for (const rule of status.rules) {
    const scope = Array.isArray(rule.frontmatter.paths) ? rule.frontmatter.paths.join(", ") : rule.frontmatter.paths ?? (rule.frontmatter.alwaysApply ? "alwaysApply" : "none");
    const ignore = Array.isArray(rule.frontmatter.ignorePath) ? rule.frontmatter.ignorePath.join(", ") : rule.frontmatter.ignorePath;
    lines.push(
      `- ${rule.relativePath} :: ${scope}${ignore ? ` :: (ignore: ${ignore})` : ""}${rule.frontmatter.summary ? ` :: ${rule.frontmatter.summary}` : ""}`
    );
  }
  for (const diagnostic of status.diagnostics) {
    lines.push(`! ${diagnostic.rulePath ?? "unknown"}: ${diagnostic.message}`);
  }
  return lines.join("\n");
}
function formatContext(lastContext) {
  if (lastContext === void 0) {
    return "No pi-rules context has been injected yet.";
  }
  const lines = [
    `Turn: ${lastContext.turnId}`,
    `Targets: ${lastContext.targetPaths.join(", ") || "(none)"}`,
    `Rules: ${lastContext.rules.length}`,
    `Truncated: ${lastContext.truncated ? "yes" : "no"}`
  ];
  for (const rule of lastContext.rules) {
    lines.push(`- ${rule.relativePath} (${rule.matchReason.type})`);
  }
  return lines.join("\n");
}
function formatRecommendationDialog(rec, ruleContent) {
  const lines = [
    `# ${rec.summary}`,
    "",
    `**Recommendation:** ${rec.id}`,
    `**Rule file:** ${rec.ruleRelativePath}`,
    "",
    "## Proposed rule update",
    "",
    ...rec.content.split("\n"),
    "",
    "## Why this is needed",
    "",
    ...rec.reason.split("\n")
  ];
  if (ruleContent !== void 0) {
    const ruleLines = ruleContent.split("\n").slice(0, 12);
    lines.push("", "## Current rule excerpt", "", "```markdown", ...ruleLines);
    if (ruleContent.split("\n").length > 12) {
      lines.push("...");
    }
    lines.push("```");
  }
  lines.push("", "---", "After closing this preview, choose Approve / Cancel / Close.");
  return lines.join("\n");
}
async function spawnUpdateAgent(rec, projectRoot, timeoutMs = 5 * 60 * 1e3) {
  return new Promise((resolvePromise, reject) => {
    if (!projectRoot) {
      reject(new Error("Project root not available"));
      return;
    }
    const skillPath = resolve3(projectRoot, "skills/rules-maintainer");
    const prompt = [
      `Update the rule file at ${rec.rulePath}`,
      `The following describes what should be reflected in the rule:`,
      rec.content,
      `Reason: ${rec.reason}`,
      `Read the current rule file and apply the changes described above.`,
      `Do NOT read source files \u2014 the content above is the convention to document.`
    ].join(" ");
    const child = spawn("pi", ["-p", "--skill", skillPath, prompt], {
      cwd: projectRoot,
      stdio: "ignore",
      detached: false
    });
    let settled = false;
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`Pi agent exited with code ${code}`));
      }
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        process.kill(child.pid ?? -1, "SIGTERM");
      } catch {
      }
      reject(new Error("Pi agent timed out after 5 minutes"));
    }, timeoutMs);
    child.on("close", () => clearTimeout(timer));
  });
}

// extension-src/pi-rules/shared/fs.ts
import { existsSync as existsSync2, statSync } from "fs";
import { appendFile, mkdir, readdir, readFile as readFile2, realpath, rm, stat, writeFile } from "fs/promises";
import { dirname as dirname3, resolve as resolve4 } from "path";
async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
}
async function readTextFile(path) {
  try {
    return await readFile2(path, "utf8");
  } catch {
    return void 0;
  }
}
async function writeTextFile(path, content) {
  await ensureDirectory(dirname3(path));
  await writeFile(path, content, "utf8");
}
async function readJsonFile(path, fallback) {
  const content = await readTextFile(path);
  if (content === void 0) {
    return fallback;
  }
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}
async function writeJsonFile(path, value) {
  await writeTextFile(path, `${JSON.stringify(value, null, 2)}
`);
}
async function listFilesRecursive(rootDir) {
  const results = [];
  if (!existsSync2(rootDir)) {
    return results;
  }
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = resolve4(rootDir, entry.name);
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
import { resolve as resolve6 } from "path";

// extension-src/pi-rules/domain/project-root.ts
import { existsSync as existsSync3, statSync as statSync2 } from "fs";
import { dirname as dirname4, resolve as resolve5 } from "path";
var DEFAULT_PROJECT_MARKERS = [
  ".git",
  "pnpm-workspace.yaml",
  "package.json",
  "pyproject.toml",
  ".pi"
];
function findProjectRoot2(startPath, markers = DEFAULT_PROJECT_MARKERS) {
  const resolvedStart = resolve5(startPath);
  if (!existsSync3(resolvedStart)) {
    return void 0;
  }
  const startStats = statSync2(resolvedStart);
  let currentDir = startStats.isDirectory() ? resolvedStart : dirname4(resolvedStart);
  const filesystemRoot = resolve5("/");
  for (; ; ) {
    for (const marker of markers) {
      if (existsSync3(`${currentDir}/${marker}`)) {
        return currentDir;
      }
    }
    if (currentDir === filesystemRoot) {
      return void 0;
    }
    const parent = dirname4(currentDir);
    if (parent === currentDir) {
      return void 0;
    }
    currentDir = parent;
  }
}

// extension-src/pi-rules/domain/scanner.ts
async function scanRuleFiles(cwd) {
  const projectRoot = findProjectRoot2(cwd) ?? cwd;
  const rulesDir = resolve6(projectRoot, ".pi/rules");
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

// extension-src/pi-rules/features/recommendation-store.ts
import { resolve as resolve7 } from "path";
var STATE_VERSION = 1;
var RecommendationStore = class {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }
  projectRoot;
  get stateDir() {
    return resolve7(this.projectRoot, ".pi/.pi-rules");
  }
  get recommendationsPath() {
    return resolve7(this.stateDir, "recommendations.json");
  }
  async initialize() {
    await ensureDirectory(this.stateDir);
    const state = await this.readState();
    await this.writeState(state);
  }
  async readState() {
    return readJsonFile(this.recommendationsPath, {
      version: STATE_VERSION,
      recommendations: []
    });
  }
  async writeState(state) {
    await writeJsonFile(this.recommendationsPath, state);
  }
  async getAll() {
    const state = await this.readState();
    return state.recommendations;
  }
  async getPending() {
    const state = await this.readState();
    return state.recommendations.filter((rec) => rec.status === "pending");
  }
  async getById(id) {
    const state = await this.readState();
    return state.recommendations.find((rec) => rec.id === id);
  }
  async create(rec) {
    const state = await this.readState();
    const recommendation = {
      ...rec,
      id: createId("rec"),
      createdAt: now(),
      updatedAt: now(),
      mergeCount: 1
    };
    state.recommendations.push(recommendation);
    await this.writeState(state);
    return recommendation;
  }
  async approve(id) {
    const state = await this.readState();
    const rec = state.recommendations.find((r) => r.id === id);
    if (rec === void 0 || rec.status !== "pending") {
      return void 0;
    }
    rec.status = "approved";
    rec.approvedAt = now();
    await this.writeState(state);
    return rec;
  }
  async cancel(id) {
    const state = await this.readState();
    const rec = state.recommendations.find((r) => r.id === id);
    if (rec === void 0 || rec.status !== "pending") {
      return void 0;
    }
    rec.status = "cancelled";
    await this.writeState(state);
    return rec;
  }
  async markCompleted(id) {
    const state = await this.readState();
    const rec = state.recommendations.find((r) => r.id === id);
    if (rec === void 0) {
      return void 0;
    }
    rec.status = "completed";
    rec.completedAt = now();
    await this.writeState(state);
    return rec;
  }
  async markError(id, error) {
    const state = await this.readState();
    const rec = state.recommendations.find((r) => r.id === id);
    if (rec === void 0) {
      return void 0;
    }
    rec.status = "error";
    rec.error = error;
    await this.writeState(state);
    return rec;
  }
  async getStats() {
    const state = await this.readState();
    const stats = {
      pending: 0,
      approved: 0,
      cancelled: 0,
      completed: 0,
      error: 0
    };
    for (const rec of state.recommendations) {
      stats[rec.status] = (stats[rec.status] ?? 0) + 1;
    }
    return stats;
  }
};

// extension-src/pi-rules/pi/runtime.ts
function createRuntime(cwd, config) {
  const projectRoot = findProjectRoot(cwd) ?? cwd;
  const engine = new RulesEngine({
    maxRuleChars: config.maxRuleChars,
    maxContextChars: config.maxContextChars
  });
  const store = new RecommendationStore(projectRoot);
  return {
    config,
    state: createRuntimeState(projectRoot),
    engine,
    store
  };
}
function normalizeCandidatePath(path) {
  const normalized = normalizePath(path);
  if (normalized.length === 0 || normalized.startsWith("..") || normalized.startsWith("/")) {
    return void 0;
  }
  return normalized;
}

// extension-src/pi-rules/pi/index.ts
var APPLIED_RULES_ENTRY = "pi-rules-applied";
var CODE_EDIT_KEYWORDS = [
  "fix",
  "bug",
  "error",
  "implement",
  "refactor",
  "rename",
  "move",
  "delete",
  "create",
  "add",
  "remove",
  "update",
  "change",
  "modify",
  "edit",
  "write",
  "test",
  "deploy",
  "build",
  "lint",
  "format",
  "commit",
  "push",
  "merge",
  "review",
  "check",
  "debug",
  "trace",
  "investigate",
  "optimize",
  "src/",
  "test/",
  "lib/",
  "app/",
  "pages/",
  "components/"
];
function isCodeRelatedPrompt(prompt) {
  if (prompt.trim().length === 0) return true;
  const lower = prompt.toLowerCase();
  return CODE_EDIT_KEYWORDS.some((kw) => lower.includes(kw));
}
function formatMatches(matches, runtimeDeps) {
  return formatRuleContext(matches, runtimeDeps.engine.formatOptions).prompt;
}
function piRulesExtension(pi) {
  registerFlags(pi);
  let runtime = createRuntime(
    process.cwd(),
    mergeConfig(readConfigFromFiles(findProjectRoot(process.cwd())), readConfigFromEnv(), readFlags(pi))
  );
  let watcher = null;
  let reloadInFlight = false;
  const annotatedRuleIds = /* @__PURE__ */ new Set();
  let appliedRulesScopeActive = false;
  let pendingStaticAnnotation = false;
  function syncRuntime(cwd) {
    const nextProjectRoot = findProjectRoot(cwd);
    const nextConfig = mergeConfig(readConfigFromFiles(nextProjectRoot), readConfigFromEnv(), readFlags(pi));
    const projectChanged = nextProjectRoot !== runtime.state.projectRoot;
    const limitsChanged = nextConfig.maxRuleChars !== runtime.config.maxRuleChars || nextConfig.maxContextChars !== runtime.config.maxContextChars;
    if (projectChanged || limitsChanged) {
      const previousState = runtime.state;
      annotatedRuleIds.clear();
      appliedRulesScopeActive = false;
      pendingStaticAnnotation = false;
      runtime = createRuntime(cwd, nextConfig);
      for (const path of previousState.recentReadPaths) runtime.state.recentReadPaths.add(path);
      for (const path of previousState.recentChangedPaths) runtime.state.recentChangedPaths.add(path);
      runtime.state.lastContext = previousState.lastContext;
      runtime.state.gitStatusBeforeTurn = previousState.gitStatusBeforeTurn;
      return;
    }
    runtime.config = nextConfig;
  }
  registerCommands(pi, {
    getRuntime: () => runtime,
    syncRuntime,
    updateWidget
  });
  pi.on("session_start", async (_event, ctx) => {
    annotatedRuleIds.clear();
    appliedRulesScopeActive = false;
    pendingStaticAnnotation = false;
    const projectRoot = findProjectRoot(ctx.cwd);
    runtime = createRuntime(ctx.cwd, mergeConfig(readConfigFromFiles(projectRoot), readConfigFromEnv(), readFlags(pi)));
    await runtime.store.initialize();
    await runtime.engine.loadRules(ctx.cwd, true);
    await updateWidget(ctx);
    const rulesDir = resolve8(runtime.state.projectRoot, ".pi/rules");
    let roots = [];
    try {
      await stat2(rulesDir);
      roots = [rulesDir];
    } catch {
    }
    if (roots.length > 0) {
      watcher = startWatcher({
        roots,
        onChange: () => {
          if (reloadInFlight) return;
          reloadInFlight = true;
          runtime.engine.loadRules(ctx.cwd, true).finally(() => {
            reloadInFlight = false;
          });
        },
        debounceMs: 100
      });
    }
  });
  pi.on("session_compact", async (_event, ctx) => {
    syncRuntime(ctx.cwd);
    runtime.engine.clearCache();
    resetTurnState(runtime.state);
    await updateWidget(ctx);
  });
  pi.on("agent_start", async (_event, ctx) => {
    syncRuntime(ctx.cwd);
    if (!appliedRulesScopeActive) {
      annotatedRuleIds.clear();
    }
    runtime.engine.resetTurn();
    resetTurnState(runtime.state);
  });
  pi.on("agent_settled", async () => {
    annotatedRuleIds.clear();
    appliedRulesScopeActive = false;
    pendingStaticAnnotation = false;
  });
  pi.on("before_agent_start", async (event, ctx) => {
    syncRuntime(ctx.cwd);
    annotatedRuleIds.clear();
    appliedRulesScopeActive = true;
    pendingStaticAnnotation = false;
    if (runtime.config.disabled || runtime.config.mode === "off" || runtime.config.mode === "dynamic") {
      return void 0;
    }
    const prompt = event.prompt ?? "";
    const codeRelated = isCodeRelatedPrompt(prompt);
    const contextFileRealPaths = /* @__PURE__ */ new Set();
    for (const contextFile of event.systemPromptOptions.contextFiles ?? []) {
      contextFileRealPaths.add(contextFile.path);
      try {
        contextFileRealPaths.add(realpathSync.native(contextFile.path));
      } catch {
      }
    }
    const promptPaths = extractPromptPaths(prompt).map(normalizeCandidatePath).filter((path) => path !== void 0);
    const baseTargets = dedupePaths([
      ...runtime.state.recentReadPaths,
      ...runtime.state.recentChangedPaths,
      ...runtime.state.sessionHotPaths,
      ...promptPaths
    ]);
    const usingLastContextFallback = baseTargets.length === 0 && (runtime.state.lastContext?.targetPaths?.length ?? 0) > 0;
    const targetPaths = baseTargets.length > 0 ? baseTargets : dedupePaths(runtime.state.lastContext?.targetPaths ?? []);
    const matchStart = performance.now();
    const context = await runtime.engine.matchRulesForPathsStatic(
      ctx.cwd,
      targetPaths,
      contextFileRealPaths,
      codeRelated ? prompt : void 0
    );
    const matchElapsedMs = performance.now() - matchStart;
    let filteredMatches = context.matches;
    if (!codeRelated && !usingLastContextFallback) {
      filteredMatches = context.matches.filter((m) => m.matchReason.type === "alwaysApply");
    }
    if (!codeRelated && baseTargets.length === 0) {
      filteredMatches = filteredMatches.filter(
        (m) => !(m.matchReason.type === "alwaysApply" && m.frontmatter.ignorePath !== void 0)
      );
    }
    if (filteredMatches.length === 0) {
      return void 0;
    }
    const finalContext = filteredMatches.length !== context.matches.length ? { ...context, matches: filteredMatches, prompt: formatMatches(filteredMatches, runtime) } : context;
    runtime.engine.markStaticInjectedBatch(finalContext.matches);
    runtime.state.lastContext = runtime.engine.recordInjection(targetPaths, finalContext, matchElapsedMs);
    await updateWidget(ctx);
    pendingStaticAnnotation = true;
    return {
      systemPrompt: `${event.systemPrompt}

${finalContext.prompt}`
    };
  });
  pi.on("context", async () => {
    if (!pendingStaticAnnotation) {
      return;
    }
    pendingStaticAnnotation = false;
    annotateAppliedRules();
  });
  pi.on("tool_call", async (event, ctx) => {
    syncRuntime(ctx.cwd);
    if (runtime.config.disabled || runtime.config.mode === "off" || !runtime.config.writeGuardEnabled) {
      return void 0;
    }
    const targetPaths = extractWriteToolCallPaths(event, runtime.state.projectRoot);
    if (targetPaths.length === 0) {
      return void 0;
    }
    const matchStart = performance.now();
    const context = await runtime.engine.matchRulesForPaths(ctx.cwd, targetPaths);
    const matchElapsedMs = performance.now() - matchStart;
    const missingGuardedRules = context.matches.filter(
      (match) => match.frontmatter.guard === true && !runtime.engine.wasFullInjected(match)
    );
    if (missingGuardedRules.length === 0) {
      return void 0;
    }
    const prompt = formatMatches(missingGuardedRules, runtime);
    runtime.engine.markStaticInjectedBatch(missingGuardedRules);
    runtime.state.lastContext = runtime.engine.recordInjection(
      targetPaths,
      {
        ...context,
        matches: missingGuardedRules,
        prompt
      },
      matchElapsedMs
    );
    await updateWidget(ctx);
    annotateAppliedRules();
    return {
      block: true,
      reason: [
        "Blocked by pi-rules write guard.",
        "These guarded rules apply before editing the target file(s). Read them, adjust the patch, then retry the tool call.",
        "",
        prompt
      ].join("\n")
    };
  });
  pi.on("tool_result", async (event, ctx) => {
    if (event.isError) {
      return void 0;
    }
    syncRuntime(ctx.cwd);
    const extractedPaths = extractToolPaths(event, runtime.state.projectRoot);
    trackToolPaths(runtime.state, event, extractedPaths);
    if (runtime.config.disabled || runtime.config.mode === "off" || runtime.config.mode === "static" || runtime.config.dynamicInjection === "off") {
      return void 0;
    }
    if (extractedPaths.length === 0) {
      return void 0;
    }
    const matchStart = performance.now();
    const context = await runtime.engine.matchRulesForPathsDynamic(ctx.cwd, extractedPaths);
    const matchElapsedMs = performance.now() - matchStart;
    if (context.prompt.length === 0) {
      return void 0;
    }
    runtime.engine.markDynamicInjectedBatch(extractedPaths[0] ?? "_all", context.matches);
    runtime.state.lastContext = runtime.engine.recordInjection(extractedPaths, context, matchElapsedMs);
    await updateWidget(ctx);
    annotateAppliedRules();
    return {
      content: [...event.content, { type: "text", text: context.prompt }]
    };
  });
  pi.on("session_shutdown", async (_event, _ctx) => {
    if (watcher !== null) {
      await watcher.stop();
      watcher = null;
    }
    reloadInFlight = false;
  });
  pi.registerTool({
    name: "pi_rules_recommend",
    label: "Recommend Rule Update",
    description: "Recommend that a .pi/rules file should be updated to document a convention, pattern, or architecture decision. Call this when you've identified a convention that should be documented after writing code \u2014 the user will review and approve the update later.",
    promptSnippet: "Recommend updating a .pi/rules file when you identify a convention worth documenting",
    promptGuidelines: [
      "After implementing a pattern or convention, use pi_rules_recommend to suggest documenting it in the relevant .pi/rules file.",
      "Provide clear, specific content describing what should be added or changed in the rule.",
      "Set rulePath to the matching .pi/rules file (or leave empty if a new rule is needed).",
      "Do NOT call this for trivial changes \u2014 only for meaningful conventions worth documenting."
    ],
    parameters: Type.Object({
      rulePath: Type.String({
        description: "Relative path to the .pi/rules file to update (e.g. 'architecture/api-routing.md'). Leave empty if a new rule file may be needed."
      }),
      summary: Type.String({
        description: "Short one-line summary of the recommendation (shown in /pi-rules:status list)."
      }),
      content: Type.String({
        description: "The specific content to add or change in the rule. Be precise \u2014 this is what the maintainer agent will write. Include markdown formatting if needed."
      }),
      reason: Type.String({
        description: "Why this rule update is needed. What convention or pattern was introduced?"
      })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      syncRuntime(ctx.cwd);
      let ruleAbsPath;
      let ruleRelativePath;
      if (params.rulePath && params.rulePath.length > 0) {
        ruleAbsPath = resolve8(runtime.state.projectRoot, ".pi/rules", params.rulePath);
        ruleRelativePath = normalizePath(`.pi/rules/${params.rulePath}`);
      } else {
        ruleAbsPath = resolve8(runtime.state.projectRoot, ".pi/rules", "(to be determined)");
        ruleRelativePath = ".pi/rules/(to be determined)";
      }
      await runtime.store.initialize();
      const rec = await runtime.store.create({
        rulePath: ruleAbsPath,
        ruleRelativePath,
        summary: params.summary,
        content: params.content,
        reason: params.reason,
        status: "pending"
      });
      return {
        content: [
          {
            type: "text",
            text: `Recommendation ${rec.id} created for ${ruleRelativePath}. Review and apply it through the pi-rules TUI.`
          }
        ],
        details: { id: rec.id }
      };
    }
  });
  pi.registerTool({
    name: "create_rule",
    label: "Create Rule",
    description: "Create a new .pi/rules markdown file with frontmatter",
    promptSnippet: "Create durable .pi/rules files when the user asks to persist a project convention.",
    promptGuidelines: [
      "Use create_rule when the user explicitly wants to save an instruction under .pi/rules.",
      "When creating an alwaysApply rule, always consider adding ignorePath for non-code areas (e.g. docs/**) so the rule is not injected while the agent works on documentation \u2014 this saves tokens."
    ],
    parameters: Type.Object({
      name: Type.String({ description: "Safe filename stem for the rule" }),
      summary: Type.String({ description: "One-line routing summary" }),
      paths: Type.Array(Type.String({ description: "Project-relative glob pattern" }), {
        description: "Project-relative path scopes for the rule"
      }),
      body: Type.String({ description: "Markdown rule body" }),
      alwaysApply: Type.Optional(Type.Boolean({ description: "Apply to all turns" })),
      ignorePath: Type.Optional(
        Type.Array(Type.String({ description: "Project-relative glob pattern to exclude" }), {
          description: "Paths where the rule should NOT apply (e.g. docs/** for alwaysApply rules)"
        })
      ),
      overwrite: Type.Optional(Type.Boolean({ description: "Overwrite if the file already exists" }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      syncRuntime(ctx.cwd);
      const fileName = sanitizeRuleName(params.name);
      const rulePath = resolve8(runtime.state.projectRoot, ".pi/rules", `${fileName}.md`);
      const existing = await readFile3(rulePath, "utf8").catch(() => void 0);
      if (existing !== void 0 && params.overwrite !== true) {
        return {
          content: [{ type: "text", text: `Rule already exists at ${rulePath}. Re-run with overwrite=true.` }],
          details: { path: rulePath }
        };
      }
      const frontmatterLines = [
        "---",
        "paths:",
        ...params.paths.map((path) => `  - ${JSON.stringify(path)}`),
        ...params.ignorePath && params.ignorePath.length > 0 ? ["ignorePath:", ...params.ignorePath.map((path) => `  - ${JSON.stringify(path)}`)] : [],
        `summary: ${JSON.stringify(params.summary)}`,
        `alwaysApply: ${params.alwaysApply === true ? "true" : "false"}`,
        "---",
        ""
      ];
      await mkdir2(resolve8(runtime.state.projectRoot, ".pi/rules"), { recursive: true });
      await writeFile2(rulePath, `${frontmatterLines.join("\n")}${params.body.trim()}
`, "utf8");
      runtime.engine.clearCache();
      await runtime.engine.loadRules(runtime.state.projectRoot, true);
      return {
        content: [{ type: "text", text: `Created rule at ${rulePath}` }],
        details: { path: rulePath }
      };
    }
  });
  async function updateWidget(ctx) {
    if (!runtime.config.widgetEnabled) {
      ctx.ui.setStatus("pi-rules", void 0);
      return;
    }
    const status = await runtime.engine.getStatus(ctx.cwd).catch(() => void 0);
    const ruleCount = status?.ruleCount ?? 0;
    const hasErrors = status?.diagnostics.some((diagnostic) => diagnostic.severity === "error") ?? false;
    const stats = await runtime.store.getStats().catch(() => ({ pending: 0 }));
    ctx.ui.setStatus("pi-rules", statusLineText({ ruleCount, hasErrors, pendingCount: stats.pending ?? 0 }));
  }
  function annotateAppliedRules() {
    if (!runtime.config.appliedWidgetEnabled) {
      return;
    }
    const lastContext = runtime.engine.getLastContext();
    if (lastContext === void 0 || lastContext.rules.length === 0) {
      return;
    }
    const newRules = lastContext.rules.filter((rule) => {
      if (annotatedRuleIds.has(rule.ruleId)) return false;
      annotatedRuleIds.add(rule.ruleId);
      return true;
    });
    if (newRules.length === 0) {
      return;
    }
    pi.appendEntry(APPLIED_RULES_ENTRY, {
      rules: newRules.map((rule) => ({
        ruleId: rule.ruleId,
        relativePath: rule.relativePath,
        summary: rule.summary,
        matchReason: rule.matchReason
      }))
    });
  }
  pi.registerEntryRenderer(APPLIED_RULES_ENTRY, (entry, _options, theme) => {
    const lines = renderAppliedRulesLines(entry.data, (token, text) => theme.fg(token, text));
    return new Text(lines.join("\n"), 0, 0);
  });
}
function registerFlags(pi) {
  pi.registerFlag("pi-rules-disabled", {
    description: "Disable pi-rules injection and maintenance",
    type: "boolean",
    default: false
  });
  pi.registerFlag("pi-rules-mode", {
    description: "pi-rules mode: static, dynamic, both, or off",
    type: "string",
    default: "both"
  });
  pi.registerFlag("pi-rules-recommendations", {
    description: "Enable pi-rules recommendations",
    type: "boolean",
    default: true
  });
  pi.registerFlag("pi-rules-widget", {
    description: "Enable pi-rules status widget",
    type: "boolean",
    default: true
  });
  pi.registerFlag("pi-rules-applied-widget", {
    description: "Append a dim chat annotation listing the rules applied to the current turn",
    type: "boolean",
    default: true
  });
  pi.registerFlag("pi-rules-write-guard", {
    description: "Block write/edit tool calls until matching guarded rules have been injected",
    type: "boolean",
    default: false
  });
  pi.registerFlag("pi-rules-dynamic-injection", {
    description: "Dynamic rule injection after tool results: full or off",
    type: "string",
    default: "full"
  });
}
function readFlags(pi) {
  const mode = pi.getFlag("pi-rules-mode");
  const dynamicInjection = pi.getFlag("pi-rules-dynamic-injection");
  return {
    disabled: pi.getFlag("pi-rules-disabled") === true ? true : void 0,
    mode: isMode3(mode) && mode !== DEFAULT_CONFIG.mode ? mode : void 0,
    recommendationEnabled: pi.getFlag("pi-rules-recommendations") === false ? false : void 0,
    widgetEnabled: pi.getFlag("pi-rules-widget") === false ? false : void 0,
    appliedWidgetEnabled: pi.getFlag("pi-rules-applied-widget") === false ? false : void 0,
    writeGuardEnabled: pi.getFlag("pi-rules-write-guard") === true ? true : void 0,
    dynamicInjection: isDynamicInjection(dynamicInjection) && dynamicInjection !== DEFAULT_CONFIG.dynamicInjection ? dynamicInjection : void 0
  };
}
function isMode3(value) {
  return value === "static" || value === "dynamic" || value === "both" || value === "off";
}
function isDynamicInjection(value) {
  return value === "off" || value === "full";
}
function trackToolPaths(state, event, extractedPaths) {
  for (const path of extractedPaths) {
    if (["read", "grep", "find", "ls"].includes(event.toolName)) {
      state.recentReadPaths.add(path);
    }
    if (["write", "edit", "bash"].includes(event.toolName)) {
      state.recentChangedPaths.add(path);
    }
  }
  if (event.toolName === "bash" && typeof event.input.command === "string") {
    const removedPaths = extractRemovedPaths(event.input.command, state.projectRoot);
    for (const path of removedPaths) {
      state.recentChangedPaths.add(path);
    }
  }
  addSessionHotPaths(state, extractedPaths);
}
function dedupePaths(paths) {
  return [...new Set([...paths].map((path) => normalizePath(path)).filter(Boolean))];
}
function sanitizeRuleName(name) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (normalized.length === 0) {
    throw new Error("Rule name must contain at least one alphanumeric character.");
  }
  return normalized;
}
export {
  piRulesExtension as default
};
//# sourceMappingURL=pi-rules.js.map