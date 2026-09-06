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
