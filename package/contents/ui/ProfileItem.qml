pragma ComponentBehavior: Bound

/*
 * ProfileItem.qml
 *
 * The performance profile picker. A ComboBox keeps the popup the same height
 * however many profiles the hardware exposes, which matters on a handheld.
 */

import QtQuick
import QtQuick.Layouts

import org.kde.plasma.components as PlasmaComponents3
import org.kde.kirigami as Kirigami

import "../code/profiles.js" as Profiles

PlasmaComponents3.ItemDelegate {
    id: root

    property var profiles: []
    property string activeProfile

    // Recomputed only when the profile list's content actually changes, not
    // on every controlState identity change from an unrelated tick or poll,
    // which would otherwise reallocate the ComboBox model 4 times a second
    readonly property string profileKey: root.profiles.join("")
    property var entries: Profiles.displayProfiles(root.profiles)
    onProfileKeyChanged: entries = Profiles.displayProfiles(root.profiles)

    readonly property int activeIndex:
        entries.findIndex(entry => entry.profile === root.activeProfile)

    signal activateProfileRequested(string profile)

    hoverEnabled: false
    background.visible: false

    contentItem: RowLayout {
        spacing: Kirigami.Units.gridUnit

        Kirigami.Icon {
            source: "speedometer"
            Layout.preferredWidth: Kirigami.Units.iconSizes.medium
            Layout.preferredHeight: Kirigami.Units.iconSizes.medium
        }

        PlasmaComponents3.Label {
            Layout.fillWidth: true
            text: i18n("Power Profile")
            textFormat: Text.PlainText
            elide: Text.ElideRight
        }

        PlasmaComponents3.ComboBox {
            id: combo

            model: root.entries
            textRole: "label"
            currentIndex: root.activeIndex

            Accessible.name: i18n("Power Profile")

            // Only a real selection writes; syncing must not echo back
            onActivated: index => root.activateProfileRequested(root.entries[index].profile)

            delegate: PlasmaComponents3.ItemDelegate {
                required property int index
                required property var modelData

                width: combo.width
                highlighted: combo.highlightedIndex === index

                contentItem: RowLayout {
                    spacing: Kirigami.Units.smallSpacing

                    Kirigami.Icon {
                        source: modelData.icon
                        Layout.preferredWidth: Kirigami.Units.iconSizes.smallMedium
                        Layout.preferredHeight: Kirigami.Units.iconSizes.smallMedium
                    }

                    PlasmaComponents3.Label {
                        Layout.fillWidth: true
                        text: modelData.label
                        textFormat: Text.PlainText
                    }
                }
            }

            Connections {
                target: root
                function onActiveIndexChanged() {
                    combo.currentIndex = root.activeIndex;
                }
            }
        }
    }
}
