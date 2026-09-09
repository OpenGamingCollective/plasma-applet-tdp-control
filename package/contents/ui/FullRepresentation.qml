pragma ComponentBehavior: Bound

/*
 * FullRepresentation.qml
 *
 * The popup. Each row appears only while steamos-manager exports the
 * interface behind it, so the whole thing can be as small as one control.
 */

import QtQuick
import QtQuick.Layouts

import org.kde.plasma.components as PlasmaComponents3
import org.kde.plasma.extras as PlasmaExtras
import org.kde.kirigami as Kirigami

import "../code/model.js" as Model

PlasmaExtras.Representation {
    id: dialog

    // Slider steps, matching what Steam offers
    readonly property int tdpStepW: 1
    readonly property int gpuStepMhz: 50

    property var manager

    readonly property var controlState: manager.controlState
    readonly property bool showTdp: Model.canSetTdp(controlState)
    readonly property bool showGpu: Model.canSetGpuClock(controlState)

    collapseMarginsHint: true

    // Without these the ScrollView and its width: scrollView.availableWidth
    // child form a circular constraint
    Layout.minimumWidth: Kirigami.Units.gridUnit * 18
    Layout.preferredWidth: Kirigami.Units.gridUnit * 20
    Layout.minimumHeight: Kirigami.Units.gridUnit * 10

    contentItem: PlasmaComponents3.ScrollView {
        id: scrollView

        focus: false

        ColumnLayout {
            width: scrollView.availableWidth
            spacing: Kirigami.Units.smallSpacing

            ProfileItem {
                Layout.fillWidth: true
                visible: dialog.controlState.hasProfiles

                profiles: dialog.controlState.profiles
                activeProfile: dialog.controlState.profile || ""

                onActivateProfileRequested: profile => dialog.manager.setProfile(profile)
            }

            PlasmaComponents3.Label {
                Layout.fillWidth: true
                visible: !dialog.controlState.available
                text: i18n("steamos-manager is not running.")
                textFormat: Text.PlainText
                wrapMode: Text.Wrap
                opacity: 0.75
                font: Kirigami.Theme.smallFont
            }

            Kirigami.Separator {
                Layout.fillWidth: true
                visible: dialog.showTdp && dialog.controlState.hasProfiles
            }

            ValueSliderItem {
                id: tdpItem

                Layout.fillWidth: true
                visible: dialog.showTdp

                iconSource: "speedometer"
                switchText: i18n("Manual TDP Limit")
                sliderText: i18n("TDP Limit")
                unit: i18nc("Watts", "W")

                switchChecked: dialog.controlState.tdpEnabled
                from: dialog.controlState.tdpMin
                to: dialog.controlState.tdpMax
                stepSize: dialog.tdpStepW
                value: dialog.controlState.tdp

                onSwitchToggled: enabled => dialog.manager.setTdpEnabled(enabled)
                onMoved: watts => dialog.manager.setTdp(watts)
            }

            Kirigami.Separator {
                Layout.fillWidth: true
                visible: dialog.showGpu && (dialog.showTdp || dialog.controlState.hasProfiles)
            }

            ValueSliderItem {
                id: gpuItem

                Layout.fillWidth: true
                visible: dialog.showGpu

                iconSource: "show-gpu-effects-symbolic"
                switchText: i18n("Manual GPU Clock")
                sliderText: i18n("GPU Frequency")
                unit: i18nc("Megahertz", "MHz")

                switchChecked: Model.isGpuManual(dialog.controlState)
                from: dialog.controlState.gpuClockMin
                to: dialog.controlState.gpuClockMax
                stepSize: dialog.gpuStepMhz
                value: Model.gpuClockTarget(dialog.controlState)

                onSwitchToggled: manual => dialog.manager.setGpuManual(manual)
                onMoved: megahertz => dialog.manager.setGpuClock(megahertz)
            }
        }
    }

    // The popup closing mid-drag must not strand the value the user chose
    Connections {
        target: dialog.manager
        function onExpandedChanged() {
            if (!dialog.manager.expanded) {
                tdpItem.flush();
                gpuItem.flush();
            }
        }
    }

    // Guards applet removal and shell teardown, where this item is deleted
    // with a write still pending; does not fire on an ordinary collapse
    Component.onDestruction: {
        tdpItem.flush();
        gpuItem.flush();
    }
}
