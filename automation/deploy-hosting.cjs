"use strict";

const accessToken = process.env.GOOGLE_ACCESS_TOKEN;
if (!accessToken) {
  throw new Error("Google access token was not provided.");
}

// firebase-tools can intermittently fail to refresh GitHub's federated
// credential file. Use the short-lived token already issued by the auth step.
const api = require("firebase-tools/lib/apiv2");
const auth = require("firebase-tools/lib/requireAuth");

api.setAccessToken(accessToken);
auth.requireAuth = async () => process.env.GOOGLE_SERVICE_ACCOUNT || null;

process.argv = [
  process.execPath,
  "firebase",
  "deploy",
  "--only",
  "hosting",
  "--project",
  "namsung-check",
  "--non-interactive",
];

require("firebase-tools");
