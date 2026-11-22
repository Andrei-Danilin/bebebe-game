// Copies the committed Claude Code config (claude-setup/agents, claude-setup/skills) into .claude/,
// where Claude Code discovers agents and skills. Run by `npm run claude:sync` (first step of every spec run)
// and by `npm run setup`. .claude/ itself is local (gitignored): edit the files in claude-setup/, then sync.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "claude-setup");
const dst = path.join(root, ".claude");

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) n += copyDir(a, b);
    else { fs.copyFileSync(a, b); n++; }
  }
  return n;
}

let total = 0;
for (const dir of ["agents", "skills"]) {
  const from = path.join(src, dir);
  if (fs.existsSync(from)) total += copyDir(from, path.join(dst, dir));
}
console.log(`claude:sync — ${total} files copied from claude-setup/ to .claude/`);
