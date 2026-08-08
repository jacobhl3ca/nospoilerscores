#!/usr/bin/env node

import { readFileSync } from "node:fs";

const news = readFileSync("src/lib/news.ts", "utf8");
const baker = readFileSync("scripts/prebake-news.mjs", "utf8");
const monitor = readFileSync("scripts/check-staleness.mjs", "utf8");

const directFeeds = [...news.matchAll(/^\s*\w+: \{ key: "(reddit-[^"]+)"/gm)].map((match) => match[1]);
const uiFeeds = [...new Set([...directFeeds, "reddit-soccer"])];
const bakerFeeds = [...baker.matchAll(/^\s*\["(reddit-[^"]+)"/gm)].map((match) => match[1]);
const monitoredFeeds = [...monitor.matchAll(/"(reddit-[^"]+)"/g)].map((match) => match[1]);

const missingJobs = uiFeeds.filter((feed) => !bakerFeeds.includes(feed));
const missingMonitors = uiFeeds.filter((feed) => !monitoredFeeds.includes(feed));
const orphanJobs = bakerFeeds.filter((feed) => feed !== "reddit-general" && !uiFeeds.includes(feed));
const soccerBlock = news.match(/const SOCCER_REDDIT_FIREHOSE = new Set<Sport>\(\[([\s\S]*?)\]\);/)?.[1] ?? "";

const checks = [
  ["every displayed Reddit card has a baker job", missingJobs.length === 0, missingJobs],
  ["every displayed Reddit card is monitored", missingMonitors.length === 0, missingMonitors],
  ["no league baker job is disconnected from the UI", orphanJobs.length === 0, orphanJobs],
  ["Libertadores uses the shared r/soccer firehose", soccerBlock.includes('"libertadores"'), []],
];

let failed = 0;
for (const [label, ok, details] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${details.length ? `: ${details.join(", ")}` : ""}`);
  if (!ok) failed++;
}

console.log(failed ? `\n${failed} news coverage check(s) failed` : "\nall news feed coverage checks passed");
process.exit(failed ? 1 : 0);
