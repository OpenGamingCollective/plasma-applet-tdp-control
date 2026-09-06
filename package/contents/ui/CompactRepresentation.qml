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

    // Expanding is main.qml's call: it owns the PlasmoidItem that
    // "expanded" actually lives on, not the Plasmoid attached object
    signal toggleRequested()

    Kirigami.Icon {
        anchors.fill: parent
        source: root.iconSource
        active: hoverHandler.hovered
    }

    HoverHandler {
        id: hoverHandler

        onHoveredChanged: if (hovered) root.manager.refresh()
    }

    TapHandler {
        onTapped: root.toggleRequested()
    }
}
