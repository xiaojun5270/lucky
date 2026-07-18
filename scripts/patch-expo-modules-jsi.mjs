import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourcePath = resolve(
  "node_modules",
  "expo-modules-jsi",
  "apple",
  "Sources",
  "ExpoModulesJSI",
  "Coding",
  "JavaScriptCodable+Date.swift",
);

const ambiguousGuard =
  "guard milliseconds.isFinite, abs(milliseconds) <= maxJavaScriptDateMilliseconds else {";
const compatibleGuard =
  "guard milliseconds.isFinite, milliseconds.magnitude <= maxJavaScriptDateMilliseconds else {";

let source;
try {
  source = await readFile(sourcePath, "utf8");
} catch (error) {
  throw new Error(`Unable to read ${sourcePath}`, { cause: error });
}

if (source.includes(compatibleGuard)) {
  console.log("expo-modules-jsi Swift compatibility patch is already applied.");
  process.exit(0);
}

if (!source.includes(ambiguousGuard)) {
  throw new Error(
    "expo-modules-jsi source changed; review the Xcode 26 Swift compatibility patch before building.",
  );
}

await writeFile(sourcePath, source.replace(ambiguousGuard, compatibleGuard), "utf8");
console.log("Applied expo-modules-jsi Xcode 26 Swift compatibility patch.");
