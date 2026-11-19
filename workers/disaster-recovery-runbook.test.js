import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runbookUrl = new URL("../docs/operations/DISASTER_RECOVERY_AND_BACKUP.md", import.meta.url);

async function loadRunbook() {
  return readFile(runbookUrl, "utf8");
}

test("MongoDB backup is encrypted in-stream and checksum-verified before restore", async () => {
  const document = await loadRunbook();
  assert.match(document, /mongodump --uri="\$MONGODB_URI" --db=test --archive --gzip[\s\\]*\n\s*\| age -r "\$AGE_RECIPIENT" -o "\$BACKUP_FILE"/);
  assert.match(document, /sha256sum -c "\$BACKUP_FILE\.sha256"[\s\S]*?age -d -i "\$AGE_IDENTITY_FILE" "\$BACKUP_FILE"[\s\\]*\n\s*\| mongorestore/);
  assert.match(document, /--nsFrom='test\.\*' --nsTo='test_restore\.\*'/);
});

test("Firebase RTDB backup is encrypted and restored only to a separate project", async () => {
  const document = await loadRunbook();
  assert.match(document, /firebase database:get \/ --project "\$FIREBASE_PROJECT_ID"[\s\\]*\n\s*\| age -r "\$AGE_RECIPIENT" -o "\$BACKUP_FILE"/);
  assert.match(document, /firebase database:set \/ "\$RESTORE_FILE" --project "\$FIREBASE_RESTORE_PROJECT_ID"/);
  assert.match(document, /firebase deploy --only database --project "\$FIREBASE_RESTORE_PROJECT_ID"/);
  assert.match(document, /umask 077[\s\S]*?RESTORE_FILE="\$\(mktemp\)"/);
});

test("Firebase Authentication export is encrypted and temporary plaintext is cleaned up", async () => {
  const document = await loadRunbook();
  assert.match(document, /firebase auth:export "\$AUTH_EXPORT" --project "\$FIREBASE_PROJECT_ID" --format=json/);
  assert.match(document, /age -r "\$AGE_RECIPIENT" -o "\$BACKUP_FILE" "\$AUTH_EXPORT"/);
  assert.match(document, /trap 'rm -f "\$AUTH_EXPORT"' EXIT/);
});

test("recovery standard keeps live restore evidence and RPO/RTO as explicit acceptance gates", async () => {
  const document = await loadRunbook();
  for (const required of [
    "MongoDB Atlas backup policy and retention verified.",
    "MongoDB restore drill completed and measured.",
    "Firebase RTDB export/backup and restore method verified.",
    "Firebase Authentication recovery procedure verified.",
    "RPO/RTO approved by accountable owners.",
    "A successful backup job is not a successful restore drill."
  ]) assert.ok(document.includes(required), "Missing recovery acceptance gate: " + required);
});
