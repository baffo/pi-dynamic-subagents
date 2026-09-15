import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { copyBundledAgentsOnce, discoverAgents } from "../extensions/agents.ts";

test("bundles the standard worker and reviewer agents", () => {
	const names = new Set(discoverAgents(process.cwd(), "user").agents.map((agent) => agent.name));

	assert.deepEqual(
		["worker", "worker-fast", "reviewer", "reviewer-fast"].filter((name) => !names.has(name)),
		[],
	);
});

test("copies bundled agents once without overwriting user files or restoring deletions", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dynamic-subagents-test-"));
	const bundledDir = path.join(root, "bundled");
	const userDir = path.join(root, "agent", "agents");
	const markerPath = path.join(root, "agent", ".bundled-agents-copied");
	fs.mkdirSync(bundledDir, { recursive: true });
	fs.writeFileSync(path.join(bundledDir, "worker.md"), "bundled worker");
	fs.writeFileSync(path.join(bundledDir, "reviewer.md"), "bundled reviewer");
	fs.mkdirSync(userDir, { recursive: true });
	fs.writeFileSync(path.join(userDir, "worker.md"), "custom worker");

	try {
		copyBundledAgentsOnce(bundledDir, userDir, markerPath);
		assert.equal(fs.readFileSync(path.join(userDir, "worker.md"), "utf8"), "custom worker");
		assert.equal(fs.readFileSync(path.join(userDir, "reviewer.md"), "utf8"), "bundled reviewer");
		assert.ok(fs.existsSync(markerPath));

		fs.rmSync(path.join(userDir, "reviewer.md"));
		copyBundledAgentsOnce(bundledDir, userDir, markerPath);
		assert.equal(fs.existsSync(path.join(userDir, "reviewer.md")), false);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
