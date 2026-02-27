import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as path from "path";

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings?.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) throw new Error("X-Replit-Token not found");

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=github",
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
  ).then((res) => res.json()).then((data) => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) throw new Error("GitHub not connected");
  return accessToken;
}

function collectFiles(dir: string, base: string): { path: string; content: string }[] {
  const results: { path: string; content: string }[] = [];
  const skipDirs = ["node_modules", ".git", ".local", ".cache", ".upm", "attached_assets", "tmp", "scripts", "snippets", "generated", "references"];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".gitignore") continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(base, entry.name);

    if (entry.isDirectory()) {
      if (skipDirs.includes(entry.name)) continue;
      results.push(...collectFiles(fullPath, relPath));
    } else {
      const ext = path.extname(entry.name);
      const allowedExts = [".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html", ".md", ".sql"];
      if (allowedExts.includes(ext) || entry.name === ".gitignore") {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          if (content.length < 1_000_000) {
            results.push({ path: relPath, content });
          }
        } catch {}
      }
    }
  }
  return results;
}

async function main() {
  const repoName = process.argv[2] || "FleetSync";
  const accessToken = await getAccessToken();
  const octokit = new Octokit({ auth: accessToken });

  const { data: user } = await octokit.users.getAuthenticated();
  const owner = user.login;
  console.log(`Authenticated as: ${owner}`);

  // Initialize the repo with a README so it's not empty
  let existingCommitSha: string | undefined;
  try {
    const { data: ref } = await octokit.git.getRef({ owner, repo: repoName, ref: "heads/main" });
    existingCommitSha = ref.object.sha;
  } catch {
    console.log("Initializing empty repo...");
    await octokit.repos.createOrUpdateFileContents({
      owner, repo: repoName,
      path: "README.md",
      message: "Initialize repository",
      content: Buffer.from("# FleetSync\n").toString("base64"),
    });
    const { data: ref } = await octokit.git.getRef({ owner, repo: repoName, ref: "heads/main" });
    existingCommitSha = ref.object.sha;
  }

  const projectDir = "/home/runner/workspace";
  const files = collectFiles(projectDir, "");
  console.log(`Collected ${files.length} files`);

  console.log("Creating blobs...");
  const treeItems: any[] = [];
  let count = 0;
  for (const file of files) {
    const { data: blob } = await octokit.git.createBlob({
      owner, repo: repoName,
      content: Buffer.from(file.content).toString("base64"),
      encoding: "base64",
    });
    treeItems.push({
      path: file.path,
      mode: "100644" as const,
      type: "blob" as const,
      sha: blob.sha,
    });
    count++;
    if (count % 20 === 0) console.log(`  ${count}/${files.length} blobs created...`);
  }
  console.log(`  ${count}/${files.length} blobs created.`);

  console.log("Creating tree...");
  const { data: tree } = await octokit.git.createTree({
    owner, repo: repoName,
    tree: treeItems,
  });

  console.log("Creating commit...");
  const { data: commit } = await octokit.git.createCommit({
    owner, repo: repoName,
    message: "Initial commit - FleetSync sand hauling logistics planner",
    tree: tree.sha,
    parents: existingCommitSha ? [existingCommitSha] : [],
  });

  console.log("Updating main branch...");
  await octokit.git.updateRef({
    owner, repo: repoName,
    ref: "heads/main",
    sha: commit.sha,
    force: true,
  });

  console.log(`\nDone! Your code is at: https://github.com/${owner}/${repoName}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
