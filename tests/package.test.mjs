import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("metadata declares the applet id and Plasma 6 floor", () => {
    const meta = JSON.parse(readFileSync(root + "package/metadata.json", "utf8"));
    assert.equal(meta.KPlugin.Id, "org.opengamingcollective.tdpcontrol");
    assert.equal(meta.KPlugin.Name, "TDP Control");
    assert.equal(meta.KPlugin.Icon, "speedometer");
    assert.equal(meta["X-Plasma-API-Minimum-Version"], "6.0");
    assert.equal(meta["X-Plasma-NotificationAreaCategory"], "Hardware");
});

test("config declares the five persisted keys", () => {
    const xml = readFileSync(root + "package/contents/config/main.xml", "utf8");
    for (const [name, type] of [
        ["tdpEnabled", "Bool"],
        ["tdpLimit", "UInt"],
        ["gpuManual", "Bool"],
        ["gpuClock", "UInt"],
        ["tdpProfile", "String"],
    ]) {
        assert.match(xml, new RegExp(`name="${name}" type="${type}"`));
    }
});

test("the translation catalog name matches the applet id", () => {
    const messages = readFileSync(root + "Messages.sh", "utf8");
    assert.match(messages, /plasma_applet_org\.opengamingcollective\.tdpcontrol/);
});

test("the readme documents the hardware checklist", () => {
    const readme = readFileSync(root + "README.md", "utf8");
    assert.match(readme, /## Hardware verification/);
    const checkboxCount = (readme.match(/- \[ \]/g) || []).length;
    assert.ok(checkboxCount >= 10, `expected at least 10 checklist items, got ${checkboxCount}`);
});
