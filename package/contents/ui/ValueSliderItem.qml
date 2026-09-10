/*
 * ValueSliderItem.qml
 *
 * A switch over a labelled slider, used for both the TDP limit and the manual
 * GPU clock. The slider writes on a timer while dragging so a drag doesn't
 * flood the bus.
 */

import QtQuick
import QtQuick.Layouts

import org.kde.plasma.components as PlasmaComponents3
import org.kde.kirigami as Kirigami

import "../code/model.js" as Model

PlasmaComponents3.ItemDelegate {
    id: root

    // How long to collect slider movement before writing
    readonly property int applyIntervalMs: 150

    property string switchText
    property string sliderText
    property string iconSource
    property bool switchChecked
    property int value
    // What the slider and label actually display; value is never assigned to
    property int liveValue
    property int from
    property int to
    property int stepSize: 1
    property string unit

    property bool syncing: false

    signal switchToggled(bool checked)
    signal moved(int value)

    hoverEnabled: false
    background.visible: false

    function flush() {
        if (!applyTimer.running)
            return;

        applyTimer.stop();
        root.moved(root.liveValue);
    }

    // A daemon value must not move the handle under a drag
    function syncFromValue() {
        if (slider.pressed || applyTimer.running)
            return;

        root.liveValue = root.value;
        root.syncing = true;
        slider.value = root.value;
        root.syncing = false;
    }

    onValueChanged: syncFromValue()
    // Correctness must not depend on property declaration order in the
    // consumer: from/to can change after value has already been set
    onFromChanged: syncFromValue()
    onToChanged: syncFromValue()
    Component.onCompleted: syncFromValue()

    contentItem: ColumnLayout {
        spacing: Kirigami.Units.smallSpacing

        RowLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.gridUnit

            Kirigami.Icon {
                source: root.iconSource
                Layout.preferredWidth: Kirigami.Units.iconSizes.medium
                Layout.preferredHeight: Kirigami.Units.iconSizes.medium
            }

            PlasmaComponents3.Switch {
                id: enableSwitch

                Layout.fillWidth: true
                text: root.switchText
                checked: root.switchChecked
                onToggled: root.switchToggled(checked)

                Connections {
                    target: root
                    function onSwitchCheckedChanged() {
                        enableSwitch.checked = root.switchChecked;
                    }
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.leftMargin: Kirigami.Units.iconSizes.medium + Kirigami.Units.gridUnit
            visible: root.switchChecked

            PlasmaComponents3.Label {
                Layout.fillWidth: true
                text: root.sliderText
                textFormat: Text.PlainText
                elide: Text.ElideRight
            }

            PlasmaComponents3.Label {
                text: root.liveValue + " " + root.unit
                textFormat: Text.PlainText
            }
        }

        PlasmaComponents3.Slider {
            id: slider

            Layout.fillWidth: true
            Layout.leftMargin: Kirigami.Units.iconSizes.medium + Kirigami.Units.gridUnit
            visible: root.switchChecked

            from: root.from
            to: root.to
            stepSize: root.stepSize
            snapMode: PlasmaComponents3.Slider.SnapAlways

            Accessible.name: root.sliderText

            onMoved: {
                if (root.syncing)
                    return;

                root.liveValue = Model.snapToStep(value, root.from, root.to, root.stepSize);
                // Throttle, not debounce: a continuous drag must still write
                // every applyIntervalMs, not only once the user pauses
                if (!applyTimer.running)
                    applyTimer.start();
            }

            // Releasing commits whatever the timer has not written yet
            onPressedChanged: if (!pressed) root.flush()
        }
    }

    Timer {
        id: applyTimer

        interval: root.applyIntervalMs
        repeat: false
        onTriggered: root.moved(root.liveValue)
    }
}
