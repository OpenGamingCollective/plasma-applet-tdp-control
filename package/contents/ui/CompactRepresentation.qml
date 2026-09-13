pragma ComponentBehavior: Bound

/*
 * CompactRepresentation.qml
 *
 * The tray icon. Hovering it is also a cue to poll, since the collapsed
 * interval is too slow to keep a tooltip honest on its own.
 */

import QtQuick

import org.kde.kirigami as Kirigami

Item {
    id: root

    property var manager
    property string iconSource

    signal toggleRequested()

    property real lastToggleAt: 0
    readonly property int debounceMs: 400

    Kirigami.Icon {
        anchors.fill: parent
        source: root.iconSource
        active: mouseArea.containsMouse
    }

    MouseArea {
        id: mouseArea

        anchors.fill: parent
        hoverEnabled: true

        onContainsMouseChanged: if (containsMouse) root.manager.refresh()
        onClicked: {
            const now = Date.now();
            if (now - root.lastToggleAt < root.debounceMs)
                return;
            root.lastToggleAt = now;
            root.toggleRequested();
        }
    }
}
