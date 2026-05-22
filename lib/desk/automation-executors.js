import fs from "fs";
import path from "path";

export function getAutomationExecutor(job) {
  if (job?.executor?.kind) return job.executor;
  return {
    kind: "agent_session",
    agentId: job?.actorAgentId || job?.legacyRef?.agentId || null,
    prompt: job?.prompt || "",
    model: job?.model,
    executionContext: job?.executionContext || null,
  };
}

export async function executeDirectAutomationAction(job, deps = {}) {
  const executor = getAutomationExecutor(job);
  if (executor.kind !== "direct_action") {
    throw new Error(`unsupported direct automation executor: ${executor.kind}`);
  }
  if (executor.action === "notify") {
    return executeNotifyAction(job, executor, deps);
  }
  if (executor.action === "file.create") {
    return executeFileCreateAction(job, executor);
  }
  throw new Error(`unsupported direct automation action: ${executor.action}`);
}

async function executeNotifyAction(job, executor, { deliverNotification } = {}) {
  if (typeof deliverNotification !== "function") {
    throw new Error("notification gateway unavailable");
  }
  const params = executor.params && typeof executor.params === "object" && !Array.isArray(executor.params)
    ? executor.params
    : {};
  const payload = {
    title: typeof params.title === "string" ? params.title : "",
    body: typeof params.body === "string" ? params.body : "",
    ...(Array.isArray(params.channels) ? { channels: params.channels } : {}),
    ...(Array.isArray(params.bridgePlatforms) ? { bridgePlatforms: params.bridgePlatforms } : {}),
    ...(typeof params.contextPolicy === "string" ? { contextPolicy: params.contextPolicy } : {}),
    ...(typeof params.audience === "string" ? { audience: params.audience } : {}),
  };
  const agentId = executor.agentId || job.actorAgentId || job.legacyRef?.agentId || null;
  const delivery = await deliverNotification(payload, { agentId });
  return {
    executorKind: "direct_action",
    action: "notify",
    delivery,
  };
}

function executeFileCreateAction(job, executor) {
  const params = executor.params && typeof executor.params === "object" && !Array.isArray(executor.params)
    ? executor.params
    : {};
  const cwd = normalizeCwd(executor.executionContext?.cwd || job.executionContext?.cwd);
  const relativePath = normalizeRelativePath(params.relativePath);
  const content = normalizeFileContent(params.content);
  const ifExists = params.ifExists || "fail";
  if (ifExists !== "fail") throw new Error(`unsupported ifExists policy: ${ifExists}`);

  const filePath = resolveInsideCwd(cwd, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fs.writeFileSync(filePath, content, { encoding: "utf-8", flag: "wx" });
  } catch (err) {
    if (err.code === "EEXIST") throw new Error(`target already exists: ${relativePath}`);
    throw err;
  }

  return {
    executorKind: "direct_action",
    action: "file.create",
    file: {
      filePath,
      relativePath: relativePath.split(path.sep).join("/"),
      created: true,
      bytes: Buffer.byteLength(content, "utf-8"),
    },
  };
}

function normalizeCwd(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("file.create requires executionContext.cwd");
  }
  return path.resolve(value);
}

function normalizeRelativePath(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("relativePath is required");
  }
  const raw = value.trim();
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    throw new Error("relativePath must be relative");
  }
  const segments = raw.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) throw new Error("relativePath is required");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("relativePath must stay inside execution cwd");
  }
  return path.join(...segments);
}

function normalizeFileContent(value) {
  if (typeof value !== "string") throw new Error("file.create content must be a string");
  return value;
}

function resolveInsideCwd(cwd, relativePath) {
  const target = path.resolve(cwd, relativePath);
  if (target !== cwd && !target.startsWith(cwd + path.sep)) {
    throw new Error("relativePath must stay inside execution cwd");
  }
  return target;
}
