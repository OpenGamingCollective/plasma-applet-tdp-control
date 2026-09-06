/*
 * protocol.js
 */

var BUS_NAME = "com.steampowered.SteamOSManager1";
var OBJECT_PATH = "/com/steampowered/SteamOSManager1";
var OM_IFACE = "org.freedesktop.DBus.ObjectManager";

var PROFILE_IFACE = "com.steampowered.SteamOSManager1.PerformanceProfile1";
var TDP_IFACE = "com.steampowered.SteamOSManager1.TdpLimit1";
var GPU_IFACE = "com.steampowered.SteamOSManager1.GpuPerformanceLevel1";

var GPU_LEVEL_MANUAL = "manual";
var GPU_LEVEL_AUTO = "auto";

function shellQuote(text) {
    return "'" + String(text).split("'").join("'\\''") + "'";
}

// A fixture stands in for the daemon so the QML can be exercised off-hardware
function managedObjectsCommand() {
    return '[ -n "$TDP_CONTROL_FIXTURE" ] && cat "$TDP_CONTROL_FIXTURE" || ' +
        "busctl --user --json=short call " + BUS_NAME + " / " +
        OM_IFACE + " GetManagedObjects";
}

function setPropertyCommand(iface, property, signature, value) {
    return "busctl --user set-property " + BUS_NAME + " " + OBJECT_PATH + " " +
        iface + " " + property + " " + signature + " " + shellQuote(value);
}

function getPropertyCommand(iface, property) {
    return "busctl --user --json=short get-property " + BUS_NAME + " " +
        OBJECT_PATH + " " + iface + " " + property;
}

// busctl renders every variant as {"type": signature, "data": value}
function unwrap(properties) {
    var plain = {};
    for (var name in properties)
        plain[name] = properties[name].data;
    return plain;
}

function parseManagedObjects(stdout) {
    var payload;
    try {
        payload = JSON.parse(stdout);
    } catch (error) {
        return null;
    }

    if (!payload || !payload.data || !payload.data[0])
        return null;

    var interfaces = payload.data[0][OBJECT_PATH];
    if (!interfaces)
        return null;

    return {
        profile: PROFILE_IFACE in interfaces ? unwrap(interfaces[PROFILE_IFACE]) : null,
        tdp: TDP_IFACE in interfaces ? unwrap(interfaces[TDP_IFACE]) : null,
        gpu: GPU_IFACE in interfaces ? unwrap(interfaces[GPU_IFACE]) : null
    };
}

function parsePropertyValue(stdout) {
    try {
        return JSON.parse(stdout).data;
    } catch (error) {
        return undefined;
    }
}

if (typeof module !== "undefined") {
    module.exports = {
        BUS_NAME: BUS_NAME,
        OBJECT_PATH: OBJECT_PATH,
        OM_IFACE: OM_IFACE,
        PROFILE_IFACE: PROFILE_IFACE,
        TDP_IFACE: TDP_IFACE,
        GPU_IFACE: GPU_IFACE,
        GPU_LEVEL_MANUAL: GPU_LEVEL_MANUAL,
        GPU_LEVEL_AUTO: GPU_LEVEL_AUTO,
        shellQuote: shellQuote,
        managedObjectsCommand: managedObjectsCommand,
        setPropertyCommand: setPropertyCommand,
        getPropertyCommand: getPropertyCommand,
        parseManagedObjects: parseManagedObjects,
        parsePropertyValue: parsePropertyValue
    };
}
