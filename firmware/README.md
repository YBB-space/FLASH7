# Bundled ALTIS board image

`firmware.bin` is an ESP32-S3 application image for the ALTIS INTELLIGENT3 board. Its release lifecycle is independent of the ground-control application.

Do not edit the binary or generated `manifest.json` manually. `node scripts/build-flash7-firmware.cjs` validates the image header and board markers, then generates its exact size and SHA-256 manifest. The source board project compiles the image separately.

The uploader writes the OTA application partition. Persistent board identity, binding slots, calibration, settings, and stored flight records remain intact.
