import assert from "node:assert/strict";
import test from "node:test";
import { discoverAgents } from "../extensions/agents.ts";

test("bundles the standard worker and reviewer agents", () => {
	const names = new Set(discoverAgents(process.cwd(), "user").agents.map((agent) => agent.name));

	assert.deepEqual(
		["worker-deep", "worker-fast", "reviewer-deep", "reviewer-fast"].filter((name) => !names.has(name)),
		[],
	);
});
