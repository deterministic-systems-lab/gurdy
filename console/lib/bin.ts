import { spawn } from "node:child_process";
import { chmod, copyFile } from "node:fs/promises";
import path from "node:path";

export type GurdyBin = "verify" | "proxy";

const LINUX_NAMES: Record<GurdyBin, string> = {
  verify: "gurdy-verify-linux-amd64",
  proxy: "gurdy-proxy-linux-amd64",
};

const LOCAL_NAMES: Record<GurdyBin, string> = {
  verify: "gurdy-verify",
  proxy: "gurdy-proxy",
};

export function bundledLinuxPath(kind: GurdyBin): string {
  return path.join(process.cwd(), "bin", LINUX_NAMES[kind]);
}

/**
 * Bundle files on Vercel do not reliably keep the exec bit. Copy to /tmp
 * and chmod 755 before spawn. Locally, use the overlay's darwin bins.
 */
export async function executableBin(kind: GurdyBin): Promise<string> {
  const override =
    kind === "verify" ? process.env.GURDY_VERIFY_BIN : process.env.GURDY_PROXY_BIN;
  if (override) {
    return override;
  }
  if (process.platform !== "linux") {
    return path.join(process.cwd(), "..", "bin", LOCAL_NAMES[kind]);
  }
  const dest = path.join("/tmp", LINUX_NAMES[kind]);
  await copyFile(bundledLinuxPath(kind), dest);
  await chmod(dest, 0o755);
  return dest;
}

export function runBin(
  bin: string,
  args: string[],
  opts: { input?: Buffer | string; timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${path.basename(bin)} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => stdout.push(c));
    child.stderr.on("data", (c: Buffer) => stderr.push(c));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    if (opts.input !== undefined) {
      child.stdin.end(opts.input);
    } else {
      child.stdin.end();
    }
  });
}
