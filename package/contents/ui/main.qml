pragma ComponentBehavior: Bound

/*
 * main.qml
 *
 * The applet root. Owns the manager, carries persisted state to and from the
 * plasmoid config, and hides the applet when steamos-manager isn't there.
 */

import QtQuick

import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasmoid

import "../code/model.js" as Model
import "../code/profiles.js" as Profiles

PlasmoidItem {
    id: root

    // Named controlState, not state: Item already has a state property, and
    // shadowing it is exactly the mistake SteamOSManager itself avoids
    readonly property var controlState: steamManager.controlState
    readonly property var activeParams: Profiles.profileParams(controlState.profile)

    preferredRepresentation: compactRepresentation

    Plasmoid.status: controlState.available
        ? PlasmaCore.Types.ActiveStatus
        : PlasmaCore.Types.HiddenStatus

    toolTipMainText: controlState.hasProfiles ? activeParams.label : i18n("TDP Control")
    toolTipSubText: {
        const lines = [];
        if (Model.canSetTdp(controlState) && controlState.tdpEnabled)
            lines.push(i18n("TDP limit: %1 W", controlState.tdp));
        if (Model.canSetGpuClock(controlState) && Model.isGpuManual(controlState))
            lines.push(i18n("GPU clock: %1 MHz", Model.gpuClockTarget(controlState)));
        if (lines.length === 0) {
            lines.push(controlState.available
                ? i18n("Automatic")
                : i18n("steamos-manager is not running."));
        }
        return lines.join("\n");
    }

    // Named steamManager, not manager: both representations below also have
    // a property called manager, and an id matching that name would shadow
    // itself in "manager: manager" instead of reaching this object
    SteamOSManager {
        id: steamManager

        // Drives the poll interval and lets the popup flush a pending drag
        expanded: root.expanded
        config: ({
            tdpEnabled: Plasmoid.configuration.tdpEnabled,
            tdpLimit: Plasmoid.configuration.tdpLimit,
            gpuManual: Plasmoid.configuration.gpuManual,
            gpuClock: Plasmoid.configuration.gpuClock,
            tdpProfile: Plasmoid.configuration.tdpProfile
        })

        onPersist: values => {
            for (const key in values)
                Plasmoid.configuration[key] = values[key];
        }
    }

    compactRepresentation: CompactRepresentation {
        manager: steamManager
        iconSource: root.controlState.hasProfiles ? root.activeParams.icon : "speedometer"

        onToggleRequested: root.expanded = !root.expanded
    }

    fullRepresentation: FullRepresentation {
        manager: steamManager
    }
}
