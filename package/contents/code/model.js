/*
 * model.js
 */

// How long to keep showing a value we asked for before believing the daemon
var CONFIRM_TIMEOUT_MS = 2000;

var PROFILE_IFACE = "com.steampowered.SteamOSManager1.PerformanceProfile1";
var TDP_IFACE = "com.steampowered.SteamOSManager1.TdpLimit1";
var GPU_IFACE = "com.steampowered.SteamOSManager1.GpuPerformanceLevel1";

var GPU_LEVEL_MANUAL = "manual";
var GPU_LEVEL_AUTO = "auto";

function initialState(config) {
    return {
        available: false,
        hasProfiles: false,
        hasTdp: false,
        hasGpu: false,
        profiles: [],
        profile: null,
        suggestedProfile: null,
        tdp: 0,
        tdpMin: 0,
        tdpMax: 0,
        gpuLevels: [],
        gpuLevel: null,
        gpuClock: 0,
        gpuClockMin: 0,
        gpuClockMax: 0,
        gpuClockKnown: false,
        tdpEnabled: !!config.tdpEnabled,
        gpuManualWanted: !!config.gpuManual,
        rememberedTdp: config.tdpLimit || 0,
        rememberedGpuClock: config.gpuClock || 0,
        rememberedProfile: config.tdpProfile || "",
        tdpRestored: false,
        profileRestored: false,
        gpuRestored: false,
        gpuClockToProgram: 0,
        pending: {}
    };
}

function clamp(value, low, high) {
    return Math.min(Math.max(value, low), high);
}

function canSetTdp(state) {
    return state.hasTdp && state.tdpMax > state.tdpMin;
}

function canSetGpuClock(state) {
    return state.hasGpu &&
        state.gpuLevels.indexOf(GPU_LEVEL_MANUAL) !== -1 &&
        state.gpuClockMax > state.gpuClockMin;
}

function isGpuManual(state) {
    return state.gpuLevel === GPU_LEVEL_MANUAL;
}

// The limit to restore when TDP control is switched back on
function tdpTarget(state) {
    if (state.rememberedTdp > 0)
        return clamp(state.rememberedTdp, state.tdpMin, state.tdpMax);
    return state.tdpMax;
}

// The clock to restore when manual GPU control is switched back on
function storedGpuClock(state) {
    if (state.rememberedGpuClock > 0)
        return clamp(state.rememberedGpuClock, state.gpuClockMin, state.gpuClockMax);
    return state.gpuClockMax;
}

function gpuClockTarget(state) {
    if (state.gpuClockKnown)
        return state.gpuClock;
    return storedGpuClock(state);
}

function snapToStep(value, min, max, step) {
    if (max <= min)
        return min;
    return clamp(min + Math.round((value - min) / step) * step, min, max);
}

function copyState(state) {
    var copy = {};
    for (var key in state)
        copy[key] = state[key];

    copy.pending = {};
    for (var name in state.pending) {
        var entry = state.pending[name];
        copy.pending[name] = {
            iface: entry.iface,
            property: entry.property,
            signature: entry.signature,
            value: entry.value,
            reported: entry.reported,
            deadline: entry.deadline,
            retried: entry.retried
        };
    }
    return copy;
}

// The reported clock only means anything while the level is manual
function updateGpuClockKnown(ctx, previousLevel) {
    var state = ctx.state;
    if (!isGpuManual(state))
        state.gpuClockKnown = false;
    else if (previousLevel === null)
        state.gpuClockKnown = true;
    else if (previousLevel !== GPU_LEVEL_MANUAL)
        state.gpuClockKnown = false;
}

function expect(ctx, key, iface, property, signature, value, mayRetry) {
    ctx.state.pending[key] = {
        iface: iface,
        property: property,
        signature: signature,
        value: value,
        reported: undefined,
        deadline: ctx.now + CONFIRM_TIMEOUT_MS,
        retried: mayRetry === false
    };
}

// Keep showing the value we asked for until the daemon reports it back
function settle(ctx, key, reported) {
    var pending = ctx.state.pending[key];
    if (!pending)
        return reported;

    if (reported !== pending.value) {
        pending.reported = reported;
        return pending.value;
    }

    delete ctx.state.pending[key];
    return reported;
}

function storeTdpEnabled(ctx, enabled) {
    if (enabled === ctx.state.tdpEnabled)
        return;

    ctx.state.tdpEnabled = enabled;
    ctx.persist.tdpEnabled = enabled;
}

function rememberTdp(ctx, watts) {
    if (watts === ctx.state.rememberedTdp)
        return;

    ctx.state.rememberedTdp = watts;
    ctx.persist.tdpLimit = watts;
}

// Only a profile we've actually seen a limit under is worth restoring
function rememberProfile(ctx) {
    var state = ctx.state;
    if (!canSetTdp(state) || !state.profile)
        return;
    if (state.profile === state.rememberedProfile)
        return;

    state.rememberedProfile = state.profile;
    ctx.persist.tdpProfile = state.profile;
}

function storeGpuManual(ctx, manual) {
    if (manual === ctx.state.gpuManualWanted)
        return;

    ctx.state.gpuManualWanted = manual;
    ctx.persist.gpuManual = manual;
}

function rememberGpuClock(ctx, megahertz) {
    if (megahertz === ctx.state.rememberedGpuClock)
        return;

    ctx.state.rememberedGpuClock = megahertz;
    ctx.persist.gpuClock = megahertz;
}

// A limit that lands from elsewhere still says the user wants one
function observeTdp(ctx, watts, external) {
    var state = ctx.state;
    state.tdp = watts;

    if (!state.tdpEnabled) {
        if (external && watts < state.tdpMax)
            storeTdpEnabled(ctx, true);
        else
            return;
    }

    rememberProfile(ctx);

    if (watts > 0 && watts < state.tdpMax)
        rememberTdp(ctx, watts);
}

function observeGpuLevel(ctx) {
    if (ctx.state.gpuRestored)
        storeGpuManual(ctx, isGpuManual(ctx.state));
}

function observeGpuClock(ctx) {
    var state = ctx.state;
    if (state.gpuRestored && state.gpuClockKnown && state.gpuClock > 0)
        rememberGpuClock(ctx, state.gpuClock);
}

function setCommand(ctx, key, iface, property, signature, value, mayRetry) {
    expect(ctx, key, iface, property, signature, value, mayRetry);
    ctx.commands.push({
        key: key,
        kind: "set",
        iface: iface,
        property: property,
        signature: signature,
        value: value
    });
}

function getCommand(ctx, key, iface, property) {
    ctx.commands.push({key: key, kind: "get", iface: iface, property: property});
}

function applyProfileProps(ctx, props) {
    var state = ctx.state;
    if ("AvailablePerformanceProfiles" in props)
        state.profiles = props.AvailablePerformanceProfiles;
    if ("SuggestedDefaultPerformanceProfile" in props)
        state.suggestedProfile = props.SuggestedDefaultPerformanceProfile;
    if ("PerformanceProfile" in props)
        state.profile = settle(ctx, "profile", props.PerformanceProfile);
}

function applyTdpProps(ctx, props) {
    var state = ctx.state;
    // The bounds have to land before the limit is judged against them
    if ("TdpLimitMin" in props)
        state.tdpMin = props.TdpLimitMin;
    if ("TdpLimitMax" in props)
        state.tdpMax = props.TdpLimitMax;
    if ("TdpLimit" in props) {
        var ours = !!state.pending.tdp;
        observeTdp(ctx, settle(ctx, "tdp", props.TdpLimit), !ours);
    }
}

function applyGpuProps(ctx, props) {
    var state = ctx.state;
    if ("AvailableGpuPerformanceLevels" in props)
        state.gpuLevels = props.AvailableGpuPerformanceLevels;
    if ("ManualGpuClockMin" in props)
        state.gpuClockMin = props.ManualGpuClockMin;
    if ("ManualGpuClockMax" in props)
        state.gpuClockMax = props.ManualGpuClockMax;
    if ("GpuPerformanceLevel" in props) {
        var previous = state.gpuLevel;
        state.gpuLevel = settle(ctx, "gpuLevel", props.GpuPerformanceLevel);
        updateGpuClockKnown(ctx, previous);
        observeGpuLevel(ctx);
        programGpuClock(ctx);
    }
    if ("ManualGpuClock" in props) {
        state.gpuClock = settle(ctx, "gpuClock", props.ManualGpuClock);
        observeGpuClock(ctx);
    }
}

function applySnapshot(ctx, event) {
    var state = ctx.state;
    state.available = true;

    var hadProfiles = state.hasProfiles;
    var hadTdp = state.hasTdp;
    var hadGpu = state.hasGpu;

    state.hasProfiles = !!event.objects.profile;
    state.hasTdp = !!event.objects.tdp;
    state.hasGpu = !!event.objects.gpu;

    // An interface that goes away has to be restored if it comes back
    if (hadTdp && !state.hasTdp)
        state.tdpRestored = false;
    if (hadProfiles && !state.hasProfiles)
        state.profileRestored = false;
    if (hadGpu && !state.hasGpu)
        state.gpuRestored = false;

    if (state.hasProfiles)
        applyProfileProps(ctx, event.objects.profile);
    if (state.hasTdp)
        applyTdpProps(ctx, event.objects.tdp);
    if (state.hasGpu)
        applyGpuProps(ctx, event.objects.gpu);

    if (state.hasTdp)
        restoreTdp(ctx);
    if (state.hasGpu)
        restoreGpu(ctx);

    // Whether the limit needs a different profile is only clear once the
    // whole snapshot has landed
    if (state.hasProfiles)
        restoreProfile(ctx);
}

function applyUnavailable(ctx) {
    var state = ctx.state;
    ctx.state = initialState({
        tdpEnabled: state.tdpEnabled,
        gpuManual: state.gpuManualWanted,
        tdpLimit: state.rememberedTdp,
        gpuClock: state.rememberedGpuClock,
        tdpProfile: state.rememberedProfile
    });
}

function writeTdp(ctx, watts, mayRetry) {
    var state = ctx.state;
    state.tdp = watts;
    if (state.tdpEnabled) {
        rememberTdp(ctx, watts);
        rememberProfile(ctx);
    }
    setCommand(ctx, "tdp", TDP_IFACE, "TdpLimit", "u", watts, mayRetry);
}

function setProfile(ctx, profile) {
    ctx.state.profile = profile;
    setCommand(ctx, "profile", PROFILE_IFACE, "PerformanceProfile", "s", profile, true);
}

function applySetTdpEnabled(ctx, event) {
    var state = ctx.state;
    if (event.enabled === state.tdpEnabled)
        return;

    if (event.enabled) {
        var target = tdpTarget(state);
        storeTdpEnabled(ctx, true);
        writeTdp(ctx, target, true);
    } else {
        if (state.tdp > 0)
            rememberTdp(ctx, state.tdp);
        storeTdpEnabled(ctx, false);
        writeTdp(ctx, state.tdpMax, true);
    }
}

function setGpuLevel(ctx, level) {
    var state = ctx.state;
    var previous = state.gpuLevel;

    storeGpuManual(ctx, level === GPU_LEVEL_MANUAL);

    // A clock only sticks once the level has actually turned manual
    state.gpuClockToProgram = level === GPU_LEVEL_MANUAL && previous !== GPU_LEVEL_MANUAL
        ? gpuClockTarget(state) : 0;

    state.gpuLevel = level;
    setCommand(ctx, "gpuLevel", GPU_IFACE, "GpuPerformanceLevel", "s", level, true);
    updateGpuClockKnown(ctx, previous);
}

function programGpuClock(ctx) {
    var state = ctx.state;
    var clock = state.gpuClockToProgram;
    if (clock === 0)
        return;

    state.gpuClockToProgram = 0;

    if (isGpuManual(state))
        writeGpuClock(ctx, clock);
}

// The daemon comes up at its own limit, so put ours back once it's ready
function restoreTdp(ctx) {
    var state = ctx.state;
    if (state.tdpRestored || !canSetTdp(state))
        return;

    state.tdpRestored = true;
    if (!state.tdpEnabled)
        return;

    var watts = tdpTarget(state);
    if (watts !== state.tdp)
        writeTdp(ctx, watts, true);
}

// Some hardware only exports the limit under certain profiles, so the one it
// was set under has to come back before the limit can
function restoreProfile(ctx) {
    var state = ctx.state;
    if (state.profileRestored || !state.hasProfiles)
        return;

    state.profileRestored = true;
    if (!state.tdpEnabled || canSetTdp(state))
        return;

    var profile = state.rememberedProfile;
    if (!profile || profile === state.profile)
        return;
    if (state.profiles.indexOf(profile) === -1)
        return;

    setProfile(ctx, profile);
}

function restoreGpu(ctx) {
    var state = ctx.state;
    if (state.gpuRestored || !canSetGpuClock(state))
        return;

    state.gpuRestored = true;
    if (!state.gpuManualWanted) {
        observeGpuLevel(ctx);
        observeGpuClock(ctx);
        return;
    }

    if (!isGpuManual(state)) {
        setGpuLevel(ctx, GPU_LEVEL_MANUAL);
        return;
    }

    var megahertz = storedGpuClock(state);
    if (megahertz !== state.gpuClock)
        writeGpuClock(ctx, megahertz);
}

function writeGpuClock(ctx, megahertz) {
    var state = ctx.state;
    state.gpuClock = megahertz;
    rememberGpuClock(ctx, megahertz);
    state.gpuClockKnown = true;
    setCommand(ctx, "gpuClock", GPU_IFACE, "ManualGpuClock", "u", megahertz, true);
}

function applyPropertyValue(ctx, event) {
    var props = {};
    props[event.property] = event.value;

    if (event.iface === PROFILE_IFACE)
        applyProfileProps(ctx, props);
    else if (event.iface === TDP_IFACE)
        applyTdpProps(ctx, props);
    else if (event.iface === GPU_IFACE)
        applyGpuProps(ctx, props);
}

// A write that never landed shouldn't keep the value it asked for on screen
function applyWriteFailed(ctx, event) {
    var pending = ctx.state.pending[event.key];
    if (!pending)
        return;

    delete ctx.state.pending[event.key];
    getCommand(ctx, event.key, pending.iface, pending.property);
}

// Out of patience: retry a refused limit once, otherwise believe the daemon
function applyTick(ctx, event) {
    var state = ctx.state;
    for (var key in state.pending) {
        var pending = state.pending[key];
        if (event.now < pending.deadline)
            continue;

        delete state.pending[key];
        if (pending.reported === undefined)
            continue;

        if (key === "tdp" && !pending.retried && state.hasProfiles && state.profile) {
            setProfile(ctx, state.profile);
            writeTdp(ctx, pending.value, false);
            continue;
        }

        getCommand(ctx, key, pending.iface, pending.property);
    }
}

function reduce(state, event) {
    var ctx = {state: copyState(state), commands: [], persist: {}, now: event.now || 0};

    switch (event.type) {
    case "snapshot":
        applySnapshot(ctx, event);
        break;
    case "unavailable":
        applyUnavailable(ctx);
        break;
    case "propertyValue":
        applyPropertyValue(ctx, event);
        break;
    case "writeFailed":
        applyWriteFailed(ctx, event);
        break;
    case "tick":
        applyTick(ctx, event);
        break;
    case "setTdp":
        writeTdp(ctx, event.watts, true);
        break;
    case "setProfile":
        setProfile(ctx, event.profile);
        break;
    case "setTdpEnabled":
        applySetTdpEnabled(ctx, event);
        break;
    case "setGpuManual":
        setGpuLevel(ctx, event.manual ? GPU_LEVEL_MANUAL : GPU_LEVEL_AUTO);
        break;
    case "setGpuClock":
        writeGpuClock(ctx, event.megahertz);
        break;
    }

    return {state: ctx.state, commands: ctx.commands, persist: ctx.persist};
}

if (typeof module !== "undefined") {
    module.exports = {
        CONFIRM_TIMEOUT_MS: CONFIRM_TIMEOUT_MS,
        GPU_LEVEL_MANUAL: GPU_LEVEL_MANUAL,
        GPU_LEVEL_AUTO: GPU_LEVEL_AUTO,
        initialState: initialState,
        reduce: reduce,
        canSetTdp: canSetTdp,
        canSetGpuClock: canSetGpuClock,
        isGpuManual: isGpuManual,
        tdpTarget: tdpTarget,
        storedGpuClock: storedGpuClock,
        gpuClockTarget: gpuClockTarget,
        snapToStep: snapToStep
    };
}
