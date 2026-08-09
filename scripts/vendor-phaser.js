"use strict";

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const phaserRoot = path.dirname(require.resolve("phaser/package.json"));
const vendorRoot = path.join(projectRoot, "vendor");

fs.mkdirSync(vendorRoot, { recursive: true });
fs.copyFileSync(path.join(phaserRoot, "dist", "phaser.min.js"), path.join(vendorRoot, "phaser.min.js"));
fs.copyFileSync(path.join(phaserRoot, "LICENSE.md"), path.join(vendorRoot, "PHASER_LICENSE.md"));

process.stdout.write("Vendored Phaser 3.90.0 browser build and MIT license.\n");
