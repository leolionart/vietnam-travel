import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const sourcePath = process.argv[2] || 'RELEASE_NOTES.md';
const bodyPath = process.argv[3] || 'release-notes-latest.md';
const outputPath = process.env.GITHUB_OUTPUT;

const markdown = readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
const lines = markdown.split('\n');
const headingIndex = lines.findIndex((line) => /^##\s+\S/.test(line));

if (headingIndex === -1) {
  throw new Error(`No release note section found in ${sourcePath}`);
}

const nextHeadingIndex = lines.findIndex(
  (line, index) => index > headingIndex && /^##\s+\S/.test(line),
);
const endIndex = nextHeadingIndex === -1 ? lines.length : nextHeadingIndex;
const heading = lines[headingIndex].replace(/^##\s+/, '').trim();
const body = lines.slice(headingIndex + 1, endIndex).join('\n').trim();

if (!body) {
  throw new Error(`Latest release note section "${heading}" is empty`);
}

const title = heading.startsWith('Unreleased')
  ? `Vietnam Travel Planner - ${heading.replace(/^Unreleased\s*-?\s*/, '')}`
  : `Vietnam Travel Planner - ${heading}`;

writeFileSync(bodyPath, `${body}\n`);

if (outputPath) {
  appendFileSync(outputPath, `title=${title}\n`);
  appendFileSync(outputPath, `body_path=${bodyPath}\n`);
}

console.log(`Extracted "${heading}" to ${bodyPath}`);
