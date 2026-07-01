"use strict";

const accessToken = process.env.GOOGLE_ACCESS_TOKEN;
if (!accessToken) {
  throw new Error("Google access token was not provided.");
}

const api = require("firebase-tools/lib/apiv2");
const auth = require("firebase-tools/lib/requireAuth");
const ensureApiEnabled = require("firebase-tools/lib/ensureApiEnabled");

api.setAccessToken(accessToken);
auth.requireAuth = async () => process.env.GOOGLE_SERVICE_ACCOUNT || null;

// The GitHub service account can deploy Firestore rules/indexes but does not
// have Service Usage Viewer. Firestore is already enabled, so skip only the
// preflight API enablement check that needs serviceusage.services.get.
ensureApiEnabled.ensure = async () => undefined;

process.argv = [
  process.execPath,
  "firebase",
  "deploy",
  "--only",
  "firestore:rules,firestore:indexes",
  "--project",
  "namsung-check",
  "--non-interactive",
];

const firebasePackage = require("firebase-tools/package.json");
require("firebase-tools/lib/bin/cli").cli(firebasePackage);
