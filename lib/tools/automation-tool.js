/**
 * automation-tool.js — Agent-created scheduled direct actions
 *
 * Creates deterministic automation jobs such as notifications and file creation.
 * Agent-session cron prompts remain on the legacy cron tool.
 */

import { Type, StringEnum } from "../pi-sdk/index.js";
import { getToolSessionCwd, getToolSessionPath } from "./tool-session.js";

function normalizeSchedule(params) {
  if (!params.scheduleType || !params.schedule) {
    throw new Error("scheduleType and schedule are required");
  }
  const type = params.scheduleType;
  let schedule = params.schedule;
  if (type === "every") {
    const minutes = parseInt(schedule, 10);
    if (isNaN(minutes) || minutes <= 0) {
      throw new Error("every schedule must be a positive number of minutes");
    }
    schedule = minutes * 60_000;
  }
  return { type, schedule };
}

function contextForTool(ctx, {
  getSessionPath,
  getAgentId,
  getSessionCwd,
  getSessionWorkspaceFolders,
  getHomeCwd,
} = {}) {
  const sessionPath = getToolSessionPath(ctx) || getSessionPath?.() || null;
  const actorAgentId = getAgentId?.() || null;
  const cwd = getToolSessionCwd(ctx)
    || (sessionPath ? getSessionCwd?.(sessionPath) : null)
    || (actorAgentId ? getHomeCwd?.(actorAgentId) : null)
    || null;
  const workspaceFolders = sessionPath
    ? (getSessionWorkspaceFolders?.(sessionPath) || [])
    : [];
  return {
    sessionPath,
    actorAgentId,
    executionContext: {
      kind: "session_workspace",
      cwd,
      workspaceFolders,
      sourceSessionPath: sessionPath,
      createdByAgentId: actorAgentId,
    },
  };
}

function pickArray(value) {
  return Array.isArray(value) ? value : undefined;
}

function notifyExecutor(params) {
  if (!params.title && !params.body) throw new Error("title or body is required");
  return {
    kind: "direct_action",
    action: "notify",
    params: {
      title: typeof params.title === "string" ? params.title : "",
      body: typeof params.body === "string" ? params.body : "",
      ...(pickArray(params.channels) ? { channels: params.channels } : {}),
      ...(pickArray(params.bridgePlatforms) ? { bridgePlatforms: params.bridgePlatforms } : {}),
      ...(typeof params.contextPolicy === "string" ? { contextPolicy: params.contextPolicy } : {}),
    },
  };
}

function fileCreateExecutor(params) {
  if (!params.relativePath || typeof params.relativePath !== "string") {
    throw new Error("relativePath is required");
  }
  if (typeof params.content !== "string") {
    throw new Error("content is required");
  }
  return {
    kind: "direct_action",
    action: "file.create",
    params: {
      relativePath: params.relativePath,
      content: params.content,
      ifExists: params.ifExists || "fail",
    },
  };
}

function labelFor(params, executor) {
  if (typeof params.label === "string" && params.label.trim()) return params.label;
  if (executor.action === "notify") return executor.params.title || executor.params.body.slice(0, 30);
  return executor.params.relativePath;
}

export function createAutomationTool(cronStore, {
  confirmStore,
  emitEvent,
  getSessionPath,
  getAgentId,
  getSessionCwd,
  getSessionWorkspaceFolders,
  getHomeCwd,
} = {}) {
  return {
    name: "automation",
    label: "Automation",
    description: "Create and manage scheduled deterministic automation jobs such as notifications and file creation. Use cron for Agent-session prompt jobs.",
    parameters: Type.Object({
      action: StringEnum(["list", "add_notify", "add_file_create", "remove", "toggle"], {
        description: "Action to perform.",
      }),
      scheduleType: Type.Optional(StringEnum(["at", "every", "cron"], {
        description: "Trigger type for add actions.",
      })),
      schedule: Type.Optional(Type.String({
        description: "Trigger schedule. For every, use minutes. For cron, use a 5-field cron expression.",
      })),
      label: Type.Optional(Type.String({ description: "Short display label." })),
      title: Type.Optional(Type.String({ description: "Notification title." })),
      body: Type.Optional(Type.String({ description: "Notification body." })),
      channels: Type.Optional(Type.Array(StringEnum(["auto", "desktop", "bridge_owner"]))),
      bridgePlatforms: Type.Optional(Type.Array(StringEnum(["wechat", "feishu", "telegram", "qq"]))),
      contextPolicy: Type.Optional(StringEnum(["none", "record_when_delivered"])),
      relativePath: Type.Optional(Type.String({ description: "Relative file path inside the captured workspace cwd." })),
      content: Type.Optional(Type.String({ description: "File content for file.create." })),
      ifExists: Type.Optional(StringEnum(["fail"])),
      id: Type.Optional(Type.String({ description: "Automation job id for remove/toggle." })),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      try {
        if (params.action === "list") {
          const jobs = cronStore.listJobs();
          return { content: [{ type: "text", text: JSON.stringify(jobs, null, 2) }], details: { action: "list", jobs } };
        }
        if (params.action === "remove") {
          if (!params.id) throw new Error("id is required");
          const ok = cronStore.removeJob(params.id);
          return { content: [{ type: "text", text: ok ? `Automation removed: ${params.id}` : `Automation not found: ${params.id}` }], details: { action: "remove", ok, jobs: cronStore.listJobs() } };
        }
        if (params.action === "toggle") {
          if (!params.id) throw new Error("id is required");
          const job = cronStore.toggleJob(params.id);
          return { content: [{ type: "text", text: job ? `Automation toggled: ${job.id}` : `Automation not found: ${params.id}` }], details: { action: "toggle", job, jobs: cronStore.listJobs() } };
        }

        const { type, schedule } = normalizeSchedule(params);
        const executor = params.action === "add_notify"
          ? notifyExecutor(params)
          : params.action === "add_file_create"
            ? fileCreateExecutor(params)
            : null;
        if (!executor) throw new Error(`unknown automation action: ${params.action}`);

        const context = contextForTool(ctx, {
          getSessionPath,
          getAgentId,
          getSessionCwd,
          getSessionWorkspaceFolders,
          getHomeCwd,
        });
        const jobData = {
          type,
          schedule,
          prompt: "",
          label: labelFor(params, executor),
          actorAgentId: context.actorAgentId,
          executionContext: context.executionContext,
          executor,
          createdBy: {
            kind: "agent",
            agentId: context.actorAgentId,
            sourceSessionPath: context.sessionPath,
          },
        };

        if (confirmStore) {
          const { confirmId, promise } = confirmStore.create("cron", { jobData }, context.sessionPath);
          emitEvent?.({ type: "cron_confirmation", confirmId, jobData }, context.sessionPath);
          const result = await promise;
          if (result.action === "confirmed") {
            const job = cronStore.addJob(jobData);
            return {
              content: [{ type: "text", text: `Automation created: ${job.label} (${job.id})` }],
              details: { action: "added", job, jobs: cronStore.listJobs(), jobData, confirmed: true },
            };
          }
          return {
            content: [{ type: "text", text: `Automation cancelled: ${jobData.label}` }],
            details: { action: "cancelled", jobs: cronStore.listJobs(), jobData, confirmed: false },
          };
        }

        return {
          content: [{ type: "text", text: `Automation pending confirmation: ${jobData.label}` }],
          details: { action: "pending_add", jobData },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: err.message }],
          details: { action: params.action, error: err.message, jobs: cronStore.listJobs() },
        };
      }
    },
  };
}
