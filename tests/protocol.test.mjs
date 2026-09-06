import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import protocol from "../package/contents/code/protocol.js";

const fixture = name =>
    readFileSync(fileURLToPath(new URL(`fixtures/${name}.json`, import.meta.url)), "utf8");

test("the poll command prefers a fixture when one is set", () => {
    const command = protocol.managedObjectsCommand();
    assert.match(command, /TDP_CONTROL_FIXTURE/);
    assert.match(command, /busctl --user --json=short call com\.steampowered\.SteamOSManager1 \//);
    assert.match(command, /GetManagedObjects/);
});

test("a set-property command quotes its value", () => {
    assert.equal(
        protocol.setPropertyCommand(protocol.TDP_IFACE, "TdpLimit", "u", 15),
        "busctl --user set-property com.steampowered.SteamOSManager1 " +
        "/com/steampowered/SteamOSManager1 " +
        "com.steampowered.SteamOSManager1.TdpLimit1 TdpLimit u '15'");
});

test("shell quoting survives an embedded single quote", () => {
    assert.equal(protocol.shellQuote("it's"), "'it'\\''s'");
});

test("a full payload yields all three interfaces", () => {
    const objects = protocol.parseManagedObjects(fixture("full"));
    assert.deepEqual(objects.profile, {
        AvailablePerformanceProfiles: ["low-power", "balanced", "performance"],
        PerformanceProfile: "balanced",
        SuggestedDefaultPerformanceProfile: "balanced",
    });
    assert.deepEqual(objects.tdp, {TdpLimit: 15, TdpLimitMin: 3, TdpLimitMax: 30});
    assert.equal(objects.gpu.ManualGpuClockMax, 1600);
    assert.deepEqual(objects.gpu.AvailableGpuPerformanceLevels,
        ["auto", "low", "high", "manual", "peak_performance"]);
});

test("a missing interface parses as null rather than empty", () => {
    const objects = protocol.parseManagedObjects(fixture("profiles-only"));
    assert.equal(objects.tdp, null);
    assert.equal(objects.gpu, null);
    assert.equal(objects.profile.PerformanceProfile, "quiet");
});

test("a GPU interface without manual still parses", () => {
    const objects = protocol.parseManagedObjects(fixture("no-manual-gpu"));
    assert.equal(objects.profile, null);
    assert.deepEqual(objects.gpu.AvailableGpuPerformanceLevels, ["auto", "low", "high"]);
});

test("empty or malformed output parses as null", () => {
    assert.equal(protocol.parseManagedObjects(""), null);
    assert.equal(protocol.parseManagedObjects("Call failed: Access denied"), null);
    assert.equal(protocol.parseManagedObjects('{"type":"s","data":[]}'), null);
});

test("a get-property reply unwraps to its value", () => {
    assert.equal(protocol.parsePropertyValue('{"type":"u","data":15}'), 15);
    assert.deepEqual(protocol.parsePropertyValue('{"type":"as","data":["a"]}'), ["a"]);
    assert.equal(protocol.parsePropertyValue(""), undefined);
});
