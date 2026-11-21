interface RuleFrontmatter {
    paths?: string | string[];
    /**
     * Glob patterns excluding target paths. A rule is skipped when the
     * current target set is entirely covered by these patterns (e.g.
     * `alwaysApply` rules that should stay silent while editing `docs/`).
     */
    ignorePath?: string | string[];
    summary?: string;
    alwaysApply?: boolean;
    description?: string;
    priority?: number;
    kind?: "rules" | "inventory";
    triggers?: string[];
    /** When true, writes/edits to matching files are blocked until this rule has been injected in full. */
    guard?: boolean;
}
interface RuleDiagnostic {
    severity: "warning" | "error";
    rulePath?: string;
    message: string;
}
interface RuleFile {
    absolutePath: string;
    realPath: string;
    relativePath: string;
    ruleId: string;
    contentHash: string;
    fingerprint: string;
}
interface ParsedRule extends RuleFile {
    frontmatter: RuleFrontmatter;
    body: string;
    diagnostics: RuleDiagnostic[];
}
type MatchReason = {
    type: "alwaysApply";
} | {
    type: "path";
    targetPath: string;
    pattern: string;
} | {
    type: "trigger";
    trigger: string;
};
interface MatchedRule extends ParsedRule {
    matchReason: MatchReason;
}
interface InjectionRecord {
    turnId: string;
    targetPaths: string[];
    rules: Array<{
        ruleId: string;
        relativePath: string;
        summary?: string;
        matchReason: MatchReason;
    }>;
    injectedAt: number;
    /** Wall-clock time spent producing the matched context, in milliseconds. */
    elapsedMs?: number;
    truncated: boolean;
}
interface RuleScanResult {
    projectRoot: string;
    rulesDir: string;
    ruleFiles: RuleFile[];
    diagnostics: RuleDiagnostic[];
}
interface RuleLoadResult {
    projectRoot: string;
    rules: ParsedRule[];
    diagnostics: RuleDiagnostic[];
    scannedAt: number;
    /**
     * Map of relative rule path → stat fingerprint at time of loading.
     * Used to detect which files changed without re-reading content.
     */
    fingerprints: Map<string, string>;
}
interface RuleContextResult {
    targetPaths: string[];
    matches: MatchedRule[];
    prompt: string;
    truncated: boolean;
}
interface RuleStatus {
    projectRoot: string;
    rulesDir: string;
    ruleCount: number;
    diagnostics: RuleDiagnostic[];
    rules: ParsedRule[];
    lastContext?: InjectionRecord;
}

interface RulesEngineOptions {
    maxRuleChars: number;
    maxContextChars: number;
}
declare class RulesEngine {
    private readonly options;
    private cache?;
    private lastContext?;
    private turnState;
    constructor(options: RulesEngineOptions);
    get formatOptions(): RulesEngineOptions;
    loadRules(cwd: string, forceReload?: boolean): Promise<RuleLoadResult>;
    /**
     * Quick-check whether cached rules are still up-to-date by comparing
     * on-disk stat fingerprints against stored fingerprints. Returns true
     * when no rule file has been modified, added, or removed.
     */
    fingerprintsMatch(cwd: string): Promise<boolean>;
    /**
     * Like loadRules but uses fingerprint matching to avoid re-reading files
     * when possible. Falls back to full load when fingerprints have changed.
     */
    loadRulesIfUnchanged(cwd: string): Promise<RuleLoadResult>;
    matchRulesForPaths(cwd: string, targetPaths: string[], promptText?: string): Promise<RuleContextResult>;
    /**
     * Like matchRulesForPaths but filters out rules already injected
     * in the current turn (context file dedup for static injection).
     */
    matchRulesForPathsStatic(cwd: string, targetPaths: string[], contextFileRealPaths: Set<string>, promptText?: string): Promise<RuleContextResult>;
    /**
     * Like matchRulesForPaths but filters out rules already dynamically injected
     * for a specific scope key (target path) in the current turn.
     */
    matchRulesForPathsDynamic(cwd: string, targetPaths: string[], promptText?: string): Promise<RuleContextResult>;
    markStaticInjected(rule: ParsedRule): void;
    markDynamicInjected(scopeKey: string, rule: ParsedRule): void;
    markStaticInjectedBatch(rules: readonly MatchedRule[]): void;
    markDynamicInjectedBatch(scopeKey: string, rules: readonly MatchedRule[]): void;
    wasFullInjected(rule: ParsedRule): boolean;
    recordInjection(targetPaths: string[], context: RuleContextResult, elapsedMs?: number): InjectionRecord;
    getLastContext(): InjectionRecord | undefined;
    getStatus(cwd: string): Promise<RuleStatus>;
    clearCache(): void;
    resetTurn(): void;
}

type PiRulesMode = "static" | "dynamic" | "both" | "off";
type PiRulesDynamicInjection = "off" | "full";
interface PiRulesConfig {
    disabled: boolean;
    mode: PiRulesMode;
    recommendationEnabled: boolean;
    widgetEnabled: boolean;
    /** When true, a dim annotation listing the rules applied to the current turn is appended to the chat transcript. */
    appliedWidgetEnabled: boolean;
    maxRuleChars: number;
    maxContextChars: number;
    maintainerLogLines: number;
    writeGuardEnabled: boolean;
    dynamicInjection: PiRulesDynamicInjection;
}
declare const DEFAULT_CONFIG: PiRulesConfig;
declare function readConfigFromEnv(env?: NodeJS.ProcessEnv): Partial<PiRulesConfig>;
declare function readConfigFromFiles(projectRoot: string, homeDir?: string): Partial<PiRulesConfig>;
declare function writeProjectConfigPatch(projectRoot: string, patch: Partial<PiRulesConfig>): string;
declare function mergeConfig(...parts: Array<Partial<PiRulesConfig>>): PiRulesConfig;

/**
 * Maximum number of paths retained in {@link RuntimeState.sessionHotPaths}.
 * The set is FIFO-evicted when the cap is reached so a long session cannot
 * grow the working-set memory without bound.
 */
declare const SESSION_HOT_PATHS_MAX = 100;
interface RuntimeState {
    projectRoot: string;
    /** Paths touched by read/grep/find/ls tool calls within the current turn. Cleared by `resetTurnState`. */
    recentReadPaths: Set<string>;
    /** Paths touched by write/edit/bash tool calls within the current turn. Cleared by `resetTurnState`. */
    recentChangedPaths: Set<string>;
    /**
     * Across-turn session memory. Paths touched by any tool call in the
     * current session. Cleared only on session boundary (`resetSessionState`)
     * so that rule matching survives both turn boundaries and `session_compact`.
     */
    sessionHotPaths: Set<string>;
    gitStatusBeforeTurn: string;
    lastContext?: InjectionRecord;
}
declare function createRuntimeState(projectRoot: string): RuntimeState;
/**
 * Reset only per-turn state. `sessionHotPaths` and `lastContext` are
 * preserved so that rule matching stays coherent across turns and across
 * `session_compact`.
 */
declare function resetTurnState(state: RuntimeState): void;
/**
 * Reset the full runtime state. Called on session boundary (initial
 * `session_start`) to give the extension a clean working set.
 */
declare function resetSessionState(state: RuntimeState): void;
/**
 * Add paths to `sessionHotPaths`, evicting the oldest entry (FIFO) when the
 * cap is reached. Re-adding an existing path is a no-op and does not change
 * its position in the insertion order.
 */
declare function addSessionHotPaths(state: RuntimeState, paths: Iterable<string>): void;

export { DEFAULT_CONFIG, type InjectionRecord, type MatchReason, type MatchedRule, type ParsedRule, type PiRulesConfig, type PiRulesDynamicInjection, type PiRulesMode, type RuleContextResult, type RuleDiagnostic, type RuleFile, type RuleFrontmatter, type RuleLoadResult, type RuleScanResult, type RuleStatus, RulesEngine, type RulesEngineOptions, type RuntimeState, SESSION_HOT_PATHS_MAX, addSessionHotPaths, createRuntimeState, mergeConfig, readConfigFromEnv, readConfigFromFiles, resetSessionState, resetTurnState, writeProjectConfigPatch };
