/**
 * Agent discovery and configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR_NAME, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import type { FallbackFailure } from "./fallback.ts";

export type AgentScope = "user" | "project" | "both";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	fallbackModels?: string[];
	fallbackOn?: FallbackFailure[];
	systemPrompt: string;
	source: "builtin" | "user" | "project";
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

const BUNDLED_AGENTS_COPY_MARKER = ".pi-dynamic-subagents-bundled-agents-copied";

function getBundledAgentsDir(): string {
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../agents");
}

/**
 * Copy the package's starter agents into Pi's user-agent directory exactly once.
 *
 * The marker intentionally lives beside (rather than inside) `agents/`: users
 * can remove every copied file to opt back into the immutable bundled profiles
 * without the next Pi startup restoring them. Existing user files always win.
 */
export function copyBundledAgentsOnce(
	bundledDir = getBundledAgentsDir(),
	userDir = path.join(getAgentDir(), "agents"),
	markerPath = path.join(getAgentDir(), BUNDLED_AGENTS_COPY_MARKER),
): void {
	if (fs.existsSync(markerPath)) return;

	try {
		const entries = fs.readdirSync(bundledDir, { withFileTypes: true });
		fs.mkdirSync(userDir, { recursive: true });

		for (const entry of entries) {
			if (!entry.name.endsWith(".md") || (!entry.isFile() && !entry.isSymbolicLink())) continue;
			const source = path.join(bundledDir, entry.name);
			const destination = path.join(userDir, entry.name);
			if (!fs.existsSync(destination)) fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
		}

		fs.writeFileSync(markerPath, "Bundled agents were copied once. Delete this marker to run the migration again.\n", {
			encoding: "utf-8",
			mode: 0o600,
		});
	} catch {
		// Agent bootstrap must not prevent the bundled profiles from working.
	}
}

/**
 * Raw agent frontmatter. Values are `unknown` because `parseFrontmatter` runs a
 * real YAML parser, so any scalar or collection can appear here.
 *
 * A type alias rather than an interface: `parseFrontmatter` constrains its
 * parameter to `Record<string, unknown>`, and only an alias picks up the
 * implicit index signature that satisfies it.
 */
type AgentFrontmatter = {
	name?: unknown;
	description?: unknown;
	tools?: unknown;
	model?: unknown;
	fallbackModels?: unknown;
	fallbackOn?: unknown;
};

/**
 * Normalize a frontmatter `tools` value to a list of tool names.
 *
 * Both spellings are valid YAML and both are in use:
 *
 *     tools: read, bash        # string
 *     tools: [read, bash]      # array
 *
 * so accept either. Anything else (a number, a map, a nested list) yields no
 * tools rather than throwing: this runs inside agent discovery, where a single
 * bad file must not take down every other agent in the same directory.
 */
function parseStringList(value: unknown): string[] | undefined {
	const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
	const values = raw
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
	return values.length > 0 ? values : undefined;
}

function parseToolList(value: unknown): string[] | undefined {
	return parseStringList(value);
}

function parseFallbackModels(value: unknown): string[] | undefined {
	return parseStringList(value)?.filter((model) => /^[^/\s]+\/[^/\s]+$/.test(model));
}

function parseFallbackOn(value: unknown): FallbackFailure[] | undefined {
	const allowed = new Set<FallbackFailure>(["model_unavailable", "usage_limit", "rate_limit"]);
	return parseStringList(value)?.filter((kind): kind is FallbackFailure => allowed.has(kind as FallbackFailure));
}

function loadAgentsFromDir(dir: string, source: "builtin" | "user" | "project"): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);

		if (typeof frontmatter.name !== "string" || typeof frontmatter.description !== "string") {
			continue;
		}

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: parseToolList(frontmatter.tools),
			model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
			fallbackModels: parseFallbackModels(frontmatter.fallbackModels),
			fallbackOn: parseFallbackOn(frontmatter.fallbackOn),
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, CONFIG_DIR_NAME, "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const builtinDir = getBundledAgentsDir();
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	// Built-ins are always available. User and project definitions can override
	// them by name, preserving the existing project-over-user precedence.
	const builtinAgents = loadAgentsFromDir(builtinDir, "builtin");
	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

	const agentMap = new Map<string, AgentConfig>();
	for (const agent of builtinAgents) agentMap.set(agent.name, agent);
	for (const agent of userAgents) agentMap.set(agent.name, agent);
	for (const agent of projectAgents) agentMap.set(agent.name, agent);

	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

export function formatAgentList(agents: AgentConfig[], maxItems: number): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
		remaining,
	};
}
