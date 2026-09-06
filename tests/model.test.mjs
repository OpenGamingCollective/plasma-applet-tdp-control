import test from "node:test";
import assert from "node:assert/strict";

import model from "../package/contents/code/model.js";

const NO_CONFIG = {tdpEnabled: false, tdpLimit: 0, gpuManual: false, gpuClock: 0, tdpProfile: ""};

const FULL = {
    profile: {
        AvailablePerformanceProfiles: ["low-power", "balanced", "performance"],
        PerformanceProfile: "balanced",
        SuggestedDefaultPerformanceProfile: "balanced",
    },
    tdp: {TdpLimit: 30, TdpLimitMin: 3, TdpLimitMax: 30},
    gpu: {
        AvailableGpuPerformanceLevels: ["auto", "manual"],
        GpuPerformanceLevel: "auto",
        ManualGpuClock: 800,
        ManualGpuClockMin: 200,
        ManualGpuClockMax: 1600,
    },
};

const snapshot = (state, objects, now = 0) =>
    model.reduce(state, {type: "snapshot", objects, now});

test("a fresh state is unavailable with no capabilities", () => {
    const state = model.initialState(NO_CONFIG);
    assert.equal(state.available, false);
    assert.equal(state.hasProfiles, false);
    assert.equal(model.canSetTdp(state), false);
    assert.equal(model.canSetGpuClock(state), false);
});

test("a snapshot fills in every interface", () => {
    const {state} = snapshot(model.initialState(NO_CONFIG), FULL);
    assert.equal(state.available, true);
    assert.deepEqual(state.profiles, ["low-power", "balanced", "performance"]);
    assert.equal(state.profile, "balanced");
    assert.equal(state.tdpMax, 30);
    assert.equal(model.canSetTdp(state), true);
    assert.equal(model.canSetGpuClock(state), true);
});

test("a TDP interface with no headroom is not settable", () => {
    const objects = {...FULL, tdp: {TdpLimit: 25, TdpLimitMin: 25, TdpLimitMax: 25}};
    const {state} = snapshot(model.initialState(NO_CONFIG), objects);
    assert.equal(state.hasTdp, true);
    assert.equal(model.canSetTdp(state), false);
});

test("a GPU interface without manual is not settable", () => {
    const objects = {...FULL, gpu: {...FULL.gpu, AvailableGpuPerformanceLevels: ["auto", "low"]}};
    const {state} = snapshot(model.initialState(NO_CONFIG), objects);
    assert.equal(state.hasGpu, true);
    assert.equal(model.canSetGpuClock(state), false);
});

test("an interface vanishing clears its restore flag", () => {
    let {state} = snapshot(model.initialState(NO_CONFIG), FULL);
    assert.equal(state.tdpRestored, true);
    ({state} = snapshot(state, {...FULL, tdp: null}));
    assert.equal(state.hasTdp, false);
    assert.equal(state.tdpRestored, false);
});

test("the reported clock is distrusted until a manual clock is written", () => {
    let {state} = snapshot(model.initialState(NO_CONFIG), FULL);
    assert.equal(state.gpuClockKnown, false);
    assert.equal(model.gpuClockTarget(state), 1600);

    // Turning manual swaps in a clock the daemon has yet to report
    ({state} = snapshot(state, {...FULL, gpu: {...FULL.gpu, GpuPerformanceLevel: "manual"}}));
    assert.equal(state.gpuClockKnown, false);
    assert.equal(model.gpuClockTarget(state), 1600);
});

test("targets fall back to the maximum when nothing is remembered", () => {
    const {state} = snapshot(model.initialState(NO_CONFIG), FULL);
    assert.equal(model.tdpTarget(state), 30);
    assert.equal(model.storedGpuClock(state), 1600);
});

test("remembered targets are clamped into range", () => {
    const config = {...NO_CONFIG, tdpLimit: 99, gpuClock: 50};
    const {state} = snapshot(model.initialState(config), FULL);
    assert.equal(model.tdpTarget(state), 30);
    assert.equal(model.storedGpuClock(state), 200);
});

test("losing the daemon clears live state but keeps remembered values", () => {
    const config = {...NO_CONFIG, tdpEnabled: true, tdpLimit: 12, tdpProfile: "balanced"};
    let {state} = snapshot(model.initialState(config), FULL);
    ({state} = model.reduce(state, {type: "unavailable"}));
    assert.equal(state.available, false);
    assert.equal(state.hasProfiles, false);
    assert.equal(state.profile, null);
    assert.equal(state.tdpEnabled, true);
    assert.equal(state.rememberedTdp, 12);
    assert.equal(state.rememberedProfile, "balanced");
});

test("snapToStep rounds onto the step and clamps to range", () => {
    assert.equal(model.snapToStep(812, 200, 1600, 50), 800);
    assert.equal(model.snapToStep(5, 200, 1600, 50), 200);
    assert.equal(model.snapToStep(9999, 200, 1600, 50), 1600);
});

const settled = (state, objects, now = 0) =>
    model.reduce(state, {type: "snapshot", objects, now});

test("a pending write keeps its value on screen until the daemon agrees", () => {
    let {state} = settled(model.initialState(NO_CONFIG), FULL);
    let out = model.reduce(state, {type: "setTdp", watts: 12, now: 1000});
    state = out.state;
    assert.deepEqual(out.commands, [{
        key: "tdp",
        kind: "set",
        iface: "com.steampowered.SteamOSManager1.TdpLimit1",
        property: "TdpLimit",
        signature: "u",
        value: 12,
    }]);
    assert.equal(state.tdp, 12);

    // A poll already in flight still carries the old limit
    ({state} = settled(state, FULL, 1100));
    assert.equal(state.tdp, 12);
    assert.equal(state.pending.tdp.reported, 30);

    ({state} = settled(state, {...FULL, tdp: {...FULL.tdp, TdpLimit: 12}}, 1200));
    assert.equal(state.tdp, 12);
    assert.equal("tdp" in state.pending, false);
});

test("the confirmation deadline gives up and asks the daemon", () => {
    // No profile interface here, so the new retry-under-a-profile path
    // (covered separately below) can't kick in and mask this one
    const objects = {...FULL, profile: null};
    let {state} = settled(model.initialState(NO_CONFIG), objects);
    ({state} = model.reduce(state, {type: "setTdp", watts: 12, now: 1000}));
    ({state} = settled(state, objects, 1100));

    const out = model.reduce(state, {type: "tick", now: 1000 + model.CONFIRM_TIMEOUT_MS});
    assert.deepEqual(out.commands, [{
        key: "tdp",
        kind: "get",
        iface: "com.steampowered.SteamOSManager1.TdpLimit1",
        property: "TdpLimit",
    }]);
    assert.equal("tdp" in out.state.pending, false);
});

test("a deadline with no disagreement asks nothing", () => {
    let {state} = settled(model.initialState(NO_CONFIG), FULL);
    ({state} = model.reduce(state, {type: "setTdp", watts: 12, now: 1000}));

    const out = model.reduce(state, {type: "tick", now: 1000 + model.CONFIRM_TIMEOUT_MS});
    assert.deepEqual(out.commands, []);
    assert.equal("tdp" in out.state.pending, false);
});

test("a failed write drops the pending value and re-reads", () => {
    let {state} = settled(model.initialState(NO_CONFIG), FULL);
    ({state} = model.reduce(state, {type: "setTdp", watts: 12, now: 1000}));

    const out = model.reduce(state, {type: "writeFailed", key: "tdp", now: 1100});
    assert.deepEqual(out.commands, [{
        key: "tdp",
        kind: "get",
        iface: "com.steampowered.SteamOSManager1.TdpLimit1",
        property: "TdpLimit",
    }]);
});

test("a property reply is applied like a snapshot of that one property", () => {
    let {state} = settled(model.initialState(NO_CONFIG), FULL);
    const out = model.reduce(state, {
        type: "propertyValue",
        iface: "com.steampowered.SteamOSManager1.TdpLimit1",
        property: "TdpLimit",
        value: 22,
        now: 1100,
    });
    assert.equal(out.state.tdp, 22);
});

test("switching the limit on writes the target and persists the flag", () => {
    const config = {...NO_CONFIG, tdpLimit: 12};
    let {state} = settled(model.initialState(config), FULL);

    const out = model.reduce(state, {type: "setTdpEnabled", enabled: true, now: 1000});
    assert.equal(out.commands[0].value, 12);
    assert.equal(out.persist.tdpEnabled, true);
    assert.equal(out.state.tdpEnabled, true);
});

test("switching the limit off remembers the limit that was in force", () => {
    const config = {...NO_CONFIG, tdpEnabled: true};
    // The daemon is at its maximum, so nothing has been remembered yet
    let {state} = settled(model.initialState(config), FULL);
    assert.equal(state.rememberedTdp, 0);

    const out = model.reduce(state, {type: "setTdpEnabled", enabled: false, now: 1000});
    // The limit in force is captured before the maximum is written back
    assert.equal(out.persist.tdpLimit, 30);
    assert.equal(out.persist.tdpEnabled, false);
    assert.equal(out.commands[0].value, 30);
});

test("enabling the limit remembers it and the profile it was set under", () => {
    // Nothing is wanted and the daemon is at its maximum, so nothing is remembered
    let {state} = settled(model.initialState(NO_CONFIG), FULL);
    assert.equal(state.rememberedProfile, "");
    assert.equal(state.rememberedTdp, 0);

    const out = model.reduce(state, {type: "setTdpEnabled", enabled: true, now: 1000});
    assert.equal(out.persist.tdpProfile, "balanced");
    assert.equal(out.persist.tdpLimit, 30);
    assert.equal(out.commands[0].value, 30);
});

test("a limit set by hand replaces the remembered one", () => {
    const config = {...NO_CONFIG, tdpEnabled: true, tdpLimit: 25};
    let {state} = settled(model.initialState(config), FULL);

    const out = model.reduce(state, {type: "setTdp", watts: 18, now: 1000});
    assert.equal(out.persist.tdpLimit, 18);
    assert.equal(out.state.rememberedTdp, 18);
});

test("a limit arriving from elsewhere switches the flag on", () => {
    let {state} = settled(model.initialState(NO_CONFIG), FULL);
    assert.equal(state.tdpEnabled, false);

    const out = settled(state, {...FULL, tdp: {...FULL.tdp, TdpLimit: 9}}, 1000);
    assert.equal(out.state.tdpEnabled, true);
    assert.equal(out.persist.tdpEnabled, true);
    assert.equal(out.persist.tdpLimit, 9);
});

test("selecting a profile writes it and shows it immediately", () => {
    let {state} = settled(model.initialState(NO_CONFIG), FULL);

    const out = model.reduce(state, {type: "setProfile", profile: "performance", now: 1000});
    assert.deepEqual(out.commands, [{
        key: "profile",
        kind: "set",
        iface: "com.steampowered.SteamOSManager1.PerformanceProfile1",
        property: "PerformanceProfile",
        signature: "s",
        value: "performance",
    }]);
    assert.equal(out.state.profile, "performance");
});

test("turning the GPU manual defers the clock until the level lands", () => {
    let {state} = settled(model.initialState(NO_CONFIG), FULL);

    let out = model.reduce(state, {type: "setGpuManual", manual: true, now: 1000});
    state = out.state;
    assert.deepEqual(out.commands.map(command => command.property), ["GpuPerformanceLevel"]);
    assert.equal(out.persist.gpuManual, true);
    assert.equal(state.gpuClockToProgram, 1600);

    // The clock only sticks once the daemon reports the level as manual
    out = settled(state, {...FULL, gpu: {...FULL.gpu, GpuPerformanceLevel: "manual"}}, 1100);
    assert.deepEqual(out.commands.map(command => command.property), ["ManualGpuClock"]);
    assert.equal(out.commands[0].value, 1600);
    assert.equal(out.state.gpuClockToProgram, 0);
});

test("turning the GPU back to auto persists the flag and writes the level", () => {
    const config = {...NO_CONFIG, gpuManual: true};
    let {state} = settled(model.initialState(config),
        {...FULL, gpu: {...FULL.gpu, GpuPerformanceLevel: "manual"}});

    const out = model.reduce(state, {type: "setGpuManual", manual: false, now: 1000});
    assert.equal(out.commands[0].value, "auto");
    assert.equal(out.persist.gpuManual, false);
});

test("a clock set by hand is remembered", () => {
    const config = {...NO_CONFIG, gpuManual: true};
    let {state} = settled(model.initialState(config),
        {...FULL, gpu: {...FULL.gpu, GpuPerformanceLevel: "manual"}});

    const out = model.reduce(state, {type: "setGpuClock", megahertz: 1200, now: 1000});
    assert.equal(out.commands[0].value, 1200);
    assert.equal(out.persist.gpuClock, 1200);
    // Writing a clock is what makes the reported one trustworthy
    assert.equal(out.state.gpuClockKnown, true);
    assert.equal(model.gpuClockTarget(out.state), 1200);
});

test("an external flip to manual doesn't remember the stale auto-mode clock", () => {
    let {state} = settled(model.initialState(NO_CONFIG), FULL);

    // The level flips to manual with no write of ours in flight, but the
    // clock reading riding along in the same snapshot is still the stale
    // value the daemon reported while it was in auto mode
    const out = settled(state, {...FULL, gpu: {...FULL.gpu, GpuPerformanceLevel: "manual"}}, 1000);
    assert.equal(out.persist.gpuClock, undefined);
    assert.equal(out.state.rememberedGpuClock, state.rememberedGpuClock);
});

test("the remembered limit is written back when the daemon appears", () => {
    const config = {...NO_CONFIG, tdpEnabled: true, tdpLimit: 12};
    const out = settled(model.initialState(config), FULL, 1000);
    assert.deepEqual(out.commands, [{
        key: "tdp",
        kind: "set",
        iface: "com.steampowered.SteamOSManager1.TdpLimit1",
        property: "TdpLimit",
        signature: "u",
        value: 12,
    }]);
});

test("nothing is written back when the limit is already right", () => {
    const config = {...NO_CONFIG, tdpEnabled: true, tdpLimit: 30};
    const out = settled(model.initialState(config), FULL, 1000);
    assert.deepEqual(out.commands, []);
});

test("the profile comes back first when the limit is hidden under another", () => {
    const config = {...NO_CONFIG, tdpEnabled: true, tdpLimit: 12, tdpProfile: "performance"};
    const objects = {
        profile: {
            AvailablePerformanceProfiles: ["low-power", "balanced", "performance"],
            PerformanceProfile: "balanced",
            SuggestedDefaultPerformanceProfile: "balanced",
        },
        tdp: null,
        gpu: null,
    };

    const out = settled(model.initialState(config), objects, 1000);
    assert.deepEqual(out.commands, [{
        key: "profile",
        kind: "set",
        iface: "com.steampowered.SteamOSManager1.PerformanceProfile1",
        property: "PerformanceProfile",
        signature: "s",
        value: "performance",
    }]);
});

test("a remembered profile the hardware no longer offers is ignored", () => {
    const config = {...NO_CONFIG, tdpEnabled: true, tdpLimit: 12, tdpProfile: "turbo"};
    const objects = {
        profile: {
            AvailablePerformanceProfiles: ["low-power", "balanced"],
            PerformanceProfile: "balanced",
            SuggestedDefaultPerformanceProfile: "balanced",
        },
        tdp: null,
        gpu: null,
    };

    assert.deepEqual(settled(model.initialState(config), objects, 1000).commands, []);
});

test("a wanted manual GPU level is restored, then its clock", () => {
    const config = {...NO_CONFIG, gpuManual: true, gpuClock: 1200};
    let out = settled(model.initialState(config), FULL, 1000);
    assert.deepEqual(out.commands.map(command => command.property), ["GpuPerformanceLevel"]);
    assert.equal(out.commands[0].value, "manual");

    out = settled(out.state, {...FULL, gpu: {...FULL.gpu, GpuPerformanceLevel: "manual"}}, 1100);
    assert.deepEqual(out.commands.map(command => command.property), ["ManualGpuClock"]);
    assert.equal(out.commands[0].value, 1200);
});

test("a refused limit is retried once under a re-set profile", () => {
    const config = {...NO_CONFIG, tdpEnabled: true};
    let {state} = settled(model.initialState(config), FULL);
    ({state} = model.reduce(state, {type: "setTdp", watts: 12, now: 1000}));

    // The daemon keeps reporting the old limit
    ({state} = settled(state, FULL, 1100));

    const out = model.reduce(state, {type: "tick", now: 1000 + model.CONFIRM_TIMEOUT_MS});
    assert.deepEqual(out.commands.map(command => command.property),
        ["PerformanceProfile", "TdpLimit"]);
    assert.equal(out.commands[0].value, "balanced");
    assert.equal(out.commands[1].value, 12);
    assert.equal(out.state.pending.tdp.retried, true);
});

test("a retried limit that is refused again gives up and re-reads", () => {
    const config = {...NO_CONFIG, tdpEnabled: true};
    let {state} = settled(model.initialState(config), FULL);
    ({state} = model.reduce(state, {type: "setTdp", watts: 12, now: 1000}));
    ({state} = settled(state, FULL, 1100));
    ({state} = model.reduce(state, {type: "tick", now: 1000 + model.CONFIRM_TIMEOUT_MS}));
    ({state} = settled(state, FULL, 3200));

    const out = model.reduce(state, {type: "tick", now: 9000});
    assert.deepEqual(out.commands, [{
        key: "tdp",
        kind: "get",
        iface: "com.steampowered.SteamOSManager1.TdpLimit1",
        property: "TdpLimit",
    }]);
});

test("a clock known while manual is forgotten once the level leaves manual", () => {
    // Restoring the wanted manual clock is what actually sets gpuClockKnown
    // true here; the assertion of interest is the drop back to false below
    const config = {...NO_CONFIG, gpuManual: true};
    let {state} = settled(model.initialState(config),
        {...FULL, gpu: {...FULL.gpu, GpuPerformanceLevel: "manual"}});
    assert.equal(state.gpuClockKnown, true);

    ({state} = settled(state, {...FULL, gpu: {...FULL.gpu, GpuPerformanceLevel: "auto"}}, 1100));
    assert.equal(state.gpuClockKnown, false);
});

test("a settable limit needs no profile restore, even if the remembered profile differs", () => {
    const config = {...NO_CONFIG, tdpEnabled: true, tdpProfile: "performance"};

    // First snapshot: TDP only, no profile interface yet, so the remembered
    // profile is never synced to anything, and the limit becomes settable
    let {state} = settled(model.initialState(config),
        {profile: null, tdp: {TdpLimitMin: 3, TdpLimitMax: 30}, gpu: null});
    assert.equal(state.rememberedProfile, "performance");

    // The profile interface now appears with a different active profile,
    // while the limit is already settable - no restore is warranted
    const objects = {
        profile: {
            AvailablePerformanceProfiles: ["low-power", "balanced", "performance"],
            PerformanceProfile: "balanced",
            SuggestedDefaultPerformanceProfile: "balanced",
        },
        tdp: {TdpLimitMin: 3, TdpLimitMax: 30},
        gpu: null,
    };
    const out = settled(state, objects, 1000);
    assert.equal(out.commands.some(command => command.property === "PerformanceProfile"), false);
});

test("applyTdpProps judges the reported limit against the new bounds, not the old ones", () => {
    const config = {...NO_CONFIG, tdpEnabled: true};
    let {state} = settled(model.initialState(config),
        {...FULL, tdp: {TdpLimit: 30, TdpLimitMin: 3, TdpLimitMax: 30}});
    assert.equal(state.rememberedTdp, 0);

    // TdpLimitMax shrinks to 20 in the same payload that reports a TdpLimit
    // of 25 - a value that is only "worth remembering" (below the max) under
    // the stale bound of 30, not the new one
    const out = settled(state, {...FULL, tdp: {TdpLimit: 25, TdpLimitMin: 3, TdpLimitMax: 20}}, 1000);
    assert.equal(out.state.rememberedTdp, 0);
});

test("a profile isn't remembered when the limit can't be set", () => {
    const config = {...NO_CONFIG, tdpEnabled: true};
    const objects = {...FULL, tdp: {TdpLimit: 25, TdpLimitMin: 25, TdpLimitMax: 25}};
    const out = settled(model.initialState(config), objects, 1000);
    assert.equal(out.state.rememberedProfile, "");
    assert.equal(out.persist.tdpProfile, undefined);
});
