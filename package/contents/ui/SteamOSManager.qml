/*
 * SteamOSManager.qml
 *
 * Transport for the steamos-manager session-bus service. Runs busctl through
 * the executable data engine, feeds every reply into the reducer and runs
 * whatever commands the reducer asks for.
 */

import QtQuick
import org.kde.plasma.plasma5support as Plasma5Support

import "../code/protocol.js" as Protocol
import "../code/model.js" as Model

Item {
    id: manager

    // Fast enough to feel live while the popup is open, rare otherwise
    readonly property int expandedIntervalMs: 1000
    readonly property int collapsedIntervalMs: 30000

    property bool expanded: false
    property var config: ({})
    property var controlState: Model.initialState({})

    // Writes are serialized: one busctl set-property in flight at a time,
    // FIFO, so a fast drag can't race two subprocesses against each other
    property var writeQueue: []
    property bool writeBusy: false

    signal persist(var values)

    function refresh() {
        source.runCommand("poll", Protocol.managedObjectsCommand());
    }

    function setProfile(profile) {
        dispatch({type: "setProfile", profile: profile});
    }

    function setTdpEnabled(enabled) {
        dispatch({type: "setTdpEnabled", enabled: enabled});
    }

    function setTdp(watts) {
        dispatch({type: "setTdp", watts: watts});
    }

    function setGpuManual(gpuManual) {
        dispatch({type: "setGpuManual", manual: gpuManual});
    }

    function setGpuClock(megahertz) {
        dispatch({type: "setGpuClock", megahertz: megahertz});
    }

    function dispatch(event) {
        event.now = Date.now();

        const result = Model.reduce(manager.controlState, event);
        manager.controlState = result.state;

        for (const key in result.persist) {
            manager.persist(result.persist);
            break;
        }

        for (const command of result.commands)
            run(command);
    }

    function run(command) {
        if (command.kind === "set") {
            queueWrite(command.key,
                "set:" + command.key + ":" + command.iface + ":" + command.property,
                Protocol.setPropertyCommand(command.iface, command.property,
                    command.signature, command.value));
        } else {
            source.runCommand("get:" + command.key + ":" + command.iface + ":" + command.property,
                Protocol.getPropertyCommand(command.iface, command.property));
        }
    }

    // A newer queued write for the same key makes the older one moot, since
    // the reducer only ever tracks the latest expectation per key
    function queueWrite(key, name, command) {
        manager.writeQueue = manager.writeQueue.filter(entry => entry.key !== key);
        manager.writeQueue.push({key: key, name: name, command: command});
        pumpWrites();
    }

    // Starts the next queued write, if the bus is free and there is one
    function pumpWrites() {
        if (manager.writeBusy || manager.writeQueue.length === 0)
            return;

        manager.writeBusy = true;
        writeWatchdog.restart();
        const next = manager.writeQueue.shift();
        source.runCommand(next.name, next.command);
    }

    Component.onCompleted: {
        manager.controlState = Model.initialState(manager.config);
        refresh();
    }

    Plasma5Support.DataSource {
        id: source

        engine: "executable"
        connectedSources: []

        property var queue: ({})

        function runCommand(name, command) {
            // The engine keys data by the command it ran, not by our name
            queue[command] = name;
            connectSource(command);
        }

        onNewData: (sourceName, data) => {
            // The engine can in principle emit before the process has an
            // exit code; treating that as failure would clear writeBusy
            // early and start the next queued write while this one is
            // still running, defeating the FIFO queue
            if (data["exit code"] === undefined)
                return;

            disconnectSource(sourceName);

            const name = queue[sourceName] || "";
            delete queue[sourceName];

            const parts = name.split(":");
            const exitCode = data["exit code"];
            const stdout = data["stdout"] || "";

            if (parts[0] === "poll") {
                const objects = exitCode === 0 ? Protocol.parseManagedObjects(stdout) : null;
                if (objects)
                    manager.dispatch({type: "snapshot", objects: objects});
                else
                    manager.dispatch({type: "unavailable"});
                return;
            }

            if (parts[0] === "set") {
                // Free the bus before dispatching: a retry enqueued from here
                // must be able to start immediately, not wait on itself
                writeWatchdog.stop();
                manager.writeBusy = false;
                if (exitCode !== 0)
                    manager.dispatch({type: "writeFailed", key: parts[1]});
                else
                    manager.refresh();
                manager.pumpWrites();
                return;
            }

            if (parts[0] === "get") {
                const value = Protocol.parsePropertyValue(stdout);
                if (value !== undefined) {
                    manager.dispatch({
                        type: "propertyValue",
                        iface: parts[2],
                        property: parts[3],
                        value: value
                    });
                }
            }
        }
    }

    Timer {
        interval: manager.expanded ? manager.expandedIntervalMs : manager.collapsedIntervalMs
        running: true
        repeat: true
        onTriggered: manager.refresh()
    }

    // If a "set" reply never arrives at all, writeBusy would otherwise stay
    // true forever and the write path would be dead for the applet's
    // lifetime; recover by unsticking the queue
    Timer {
        id: writeWatchdog

        interval: 10000
        repeat: false
        onTriggered: {
            manager.writeBusy = false;
            manager.pumpWrites();
        }
    }

    // A pending write has its own deadline, independent of the poll. Only
    // runs while something is actually pending, so an idle applet doesn't
    // rebuild controlState at 4 Hz forever
    Timer {
        interval: 250
        running: Object.keys(manager.controlState.pending).length > 0
        repeat: true
        onTriggered: manager.dispatch({type: "tick"})
    }

    onExpandedChanged: if (expanded) refresh()
}
