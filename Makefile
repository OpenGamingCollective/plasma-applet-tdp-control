ID = org.opengamingcollective.tdpcontrol
DESTDIR ?=
PREFIX ?= /usr
FIXTURE ?= $(CURDIR)/tests/fixtures/full.json

.PHONY: test install uninstall plasmoid
.PHONY: dev dev-container
BOX = tdp-control-dev
BOX_IMAGE ?= registry.fedoraproject.org/fedora:latest

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

# A distrobox with plasmoidviewer, for hosts that don't run Plasma
dev-container:
	distrobox create --name $(BOX) --image $(BOX_IMAGE) \
		--additional-packages "plasma-sdk plasma-desktop plasma-workspace"

dev:
	TDP_CONTROL_FIXTURE=$(FIXTURE) distrobox enter $(BOX) -- \
		plasmoidviewer --applet $(CURDIR)/package
