import { resolveShellProfile } from "./shell-profile.js";

export function createCommandRunner({
  resolveProfile = resolveShellProfile,
  spawnCommand,
  platform = process.platform,
  defaultProfile = "default",
} = {}) {
  return async function runShellCommand(command, cwd, opts = {}) {
    if (typeof spawnCommand !== "function") {
      throw new Error("spawnCommand is required");
    }
    const env = opts.env || process.env;
    const profile = resolveProfile({
      platform,
      profile: opts.profile || defaultProfile,
      env,
    });
    return spawnCommand({
      executable: profile.executable,
      args: profile.argsForCommand(String(command ?? "")),
      cwd,
      env: profile.env || env,
      onData: opts.onData,
      signal: opts.signal,
      timeout: opts.timeout,
      profile,
    });
  };
}
