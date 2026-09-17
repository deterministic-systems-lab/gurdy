import { readFileSync } from "node:fs";

/** Two-field parser for the local /.keys file: `name: value` per line. */
export function readKeys(path) {
  const keys = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const i = line.indexOf(": ");
    if (i === -1) {
      continue;
    }
    keys[line.slice(0, i).trim()] = line.slice(i + 2).trim();
  }
  return keys;
}
