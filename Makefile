ID = org.opengamingcollective.tdpcontrol
DESTDIR ?=
PREFIX ?= /usr
FIXTURE ?= $(CURDIR)/tests/fixtures/full.json

.PHONY: test install uninstall plasmoid
.PHONY: dev dev-container

test:
	node --test 'tests/**/*.test.mjs'

install:
ifeq ($(DESTDIR),)
	./install.sh
else
	install -d $(DESTDIR)$(PREFIX)/share/plasma/plasmoids/$(ID)
	cp -r package/. $(DESTDIR)$(PREFIX)/share/plasma/plasmoids/$(ID)/
endif

uninstall:
	kpackagetool6 --type Plasma/Applet --remove $(ID)

plasmoid:
	rm -f $(ID).plasmoid
	cd package && zip -qr ../$(ID).plasmoid .

dev:
	TDP_CONTROL_FIXTURE=$(FIXTURE) distrobox enter tdp-control-dev -- \
		plasmoidviewer --applet $(CURDIR)/package
