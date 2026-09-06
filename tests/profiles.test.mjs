import test from "node:test";
import assert from "node:assert/strict";

import profiles from "../package/contents/code/profiles.js";

// Breeze names: power-profile-*-symbolic is Adwaita and renders blank
test("known profiles get their label and icon", () => {
    assert.deepEqual(profiles.profileParams("performance"),
        {label: "Performance", icon: "battery-profile-performance-symbolic"});
    assert.deepEqual(profiles.profileParams("max-power"),
        {label: "Max Power", icon: "battery-profile-performance-symbolic"});
    assert.deepEqual(profiles.profileParams("balanced"),
        {label: "Balanced", icon: "battery-profile-balanced-symbolic"});
    assert.deepEqual(profiles.profileParams("balanced-performance"),
        {label: "Balanced Performance", icon: "battery-profile-balanced-symbolic"});
    assert.deepEqual(profiles.profileParams("low-power"),
        {label: "Power Save", icon: "battery-profile-powersave-symbolic"});
    assert.deepEqual(profiles.profileParams("power-saver"),
        {label: "Power Save", icon: "battery-profile-powersave-symbolic"});
    assert.deepEqual(profiles.profileParams("quiet"),
        {label: "Quiet", icon: "battery-profile-powersave-symbolic"});
    assert.deepEqual(profiles.profileParams("cool"),
        {label: "Cool", icon: "battery-profile-powersave-symbolic"});
    assert.deepEqual(profiles.profileParams("custom"),
        {label: "Custom", icon: "configure"});
});

test("unknown profiles are title cased on dashes and underscores", () => {
    assert.deepEqual(profiles.profileParams("turbo-mode"),
        {label: "Turbo Mode", icon: profiles.FALLBACK_ICON});
    assert.deepEqual(profiles.profileParams("max_speed"),
        {label: "Max Speed", icon: profiles.FALLBACK_ICON});
});

test("a missing profile is reported as unknown", () => {
    assert.deepEqual(profiles.profileParams(null),
        {label: "Unknown", icon: profiles.FALLBACK_ICON});
});

test("display order reverses the daemon's ascending list", () => {
    assert.deepEqual(
        profiles.displayProfiles(["low-power", "balanced", "performance"])
            .map(entry => entry.profile),
        ["performance", "balanced", "low-power"]);
});
