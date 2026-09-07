#!/bin/sh
# Install the applet for the current user without needing make
set -eu

ID=org.opengamingcollective.tdpcontrol
DIR=$(dirname "$0")

if kpackagetool6 --type Plasma/Applet --show "$ID" >/dev/null 2>&1; then
    kpackagetool6 --type Plasma/Applet --upgrade "$DIR/package"
else
    kpackagetool6 --type Plasma/Applet --install "$DIR/package"
fi

echo "Installed $ID. Add 'TDP Control' from the widget list."
