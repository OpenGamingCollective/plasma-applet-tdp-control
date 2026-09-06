/*
 * profiles.js
 *
 * Display labels and icons for the performance profile names steamos-manager
 * reports. Those come straight from the kernel's platform-profile choices, so
 * anything not listed here still has to render sensibly.
 */

var FALLBACK_ICON = "battery-profile-balanced-symbolic";

var PROFILE_PARAMS = {
    "performance": {label: "Performance", icon: "battery-profile-performance-symbolic"},
    "max-power": {label: "Max Power", icon: "battery-profile-performance-symbolic"},
    "balanced": {label: "Balanced", icon: "battery-profile-balanced-symbolic"},
    "balanced-performance": {label: "Balanced Performance", icon: "battery-profile-balanced-symbolic"},
    "low-power": {label: "Power Save", icon: "battery-profile-powersave-symbolic"},
    "power-saver": {label: "Power Save", icon: "battery-profile-powersave-symbolic"},
    "quiet": {label: "Quiet", icon: "battery-profile-powersave-symbolic"},
    "cool": {label: "Cool", icon: "battery-profile-powersave-symbolic"},
    "custom": {label: "Custom", icon: "configure"}
};

function titleCase(profile) {
    return profile.split(/[-_]/).map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(" ");
}

function profileParams(profile) {
    if (!profile)
        return {label: "Unknown", icon: FALLBACK_ICON};

    var params = PROFILE_PARAMS[profile];
    if (params)
        return {label: params.label, icon: params.icon};

    return {label: titleCase(profile), icon: FALLBACK_ICON};
}

// The daemon lists profiles low to high; the picker shows performance first
function displayProfiles(profiles) {
    return profiles.slice().reverse().map(function (profile) {
        var params = profileParams(profile);
        return {profile: profile, label: params.label, icon: params.icon};
    });
}

if (typeof module !== "undefined") {
    module.exports = {
        FALLBACK_ICON: FALLBACK_ICON,
        profileParams: profileParams,
        displayProfiles: displayProfiles
    };
}
