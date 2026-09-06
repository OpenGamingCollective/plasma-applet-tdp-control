#!/bin/sh
$EXTRACTRC `find . -name '*.ui' -o -name '*.rc'` >> rc.cpp
$XGETTEXT `find . -name '*.qml' -o -name '*.js'` -o $podir/plasma_applet_org.opengamingcollective.tdpcontrol.pot
rm -f rc.cpp
