# TDP Control

A Plasma applet for steamos-manager's performance profile, TDP limit and
manual GPU clock.

## Installing

    make install

Then add "TDP Control" from Plasma's widget list, or to the system tray.

## Packaging

To build a distributable archive:

    make plasmoid

This creates `org.opengamingcollective.tdpcontrol.plasmoid`, which can be
installed or distributed.

## Development

Without Plasma on the host, the applet can be run from a distrobox:

    make dev-container
    make dev

`make dev` opens the applet in plasmoidviewer against
`tests/fixtures/full.json` instead of a live steamos-manager. Set `FIXTURE`
to try one of the other fixtures.

## Hardware verification

Things to check on a real handheld before a release, since none of them can be
exercised off-hardware:

- [ ] The applet appears in the system tray once steamos-manager is running
- [ ] The tray icon and tooltip follow the active performance profile
- [ ] Picking a profile from the popup changes it in Steam and the daemon
- [ ] Switching on Manual TDP Limit restores the last limit, or the maximum the first time
- [ ] Dragging the TDP slider writes while dragging, not just on release
- [ ] The TDP limit written by the applet survives a plasmashell restart
- [ ] A limit set from Steam shows up in the popup and switches the toggle on
- [ ] Switching off Manual TDP Limit puts the limit back to the maximum
- [ ] On hardware where TdpLimit1 only exists under some profiles, the remembered profile is restored first
- [ ] Switching on Manual GPU Clock sets the level to manual and then programs the clock
- [ ] Dragging the GPU slider changes the clock in 50 MHz steps
- [ ] Switching off Manual GPU Clock returns the level to auto
- [ ] Stopping steamos-manager hides the applet; starting it again brings it back
