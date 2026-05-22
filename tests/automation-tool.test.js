import { describe, expect, it, vi } from "vitest";
import { createAutomationTool } from "../lib/tools/automation-tool.js";

describe("automation tool", () => {
  it("creates notify automation jobs only after confirmation", async () => {
    const store = {
      addJob: vi.fn((jobData) => ({ ...jobData, id: "studio_job_1", enabled: true })),
      listJobs: vi.fn(() => []),
    };
    const confirmStore = {
      create: vi.fn(() => ({
        confirmId: "confirm_1",
        promise: Promise.resolve({ action: "confirmed" }),
      })),
    };
    const emitted = [];
    const tool = createAutomationTool(store, {
      confirmStore,
      emitEvent: (event, sessionPath) => emitted.push({ event, sessionPath }),
      getAgentId: () => "agent-a",
      getSessionCwd: () => "/workspace/fallback",
      getSessionWorkspaceFolders: () => ["/workspace/ref"],
      getHomeCwd: () => "/home/agent-a",
    });

    await tool.execute(
      "call_1",
      {
        action: "add_notify",
        scheduleType: "cron",
        schedule: "0 9 * * *",
        label: "Drink Water",
        title: "喝水",
        body: "站起来活动一下",
        channels: ["desktop"],
      },
      undefined,
      undefined,
      {
        sessionManager: {
          getSessionFile: () => "/sessions/agent-a.jsonl",
          getCwd: () => "/workspace/current",
        },
      },
    );

    expect(confirmStore.create).toHaveBeenCalledWith(
      "cron",
      { jobData: expect.objectContaining({ label: "Drink Water" }) },
      "/sessions/agent-a.jsonl",
    );
    expect(emitted).toEqual([{
      sessionPath: "/sessions/agent-a.jsonl",
      event: {
        type: "cron_confirmation",
        confirmId: "confirm_1",
        jobData: expect.objectContaining({
          type: "cron",
          schedule: "0 9 * * *",
          prompt: "",
          actorAgentId: "agent-a",
          executionContext: {
            kind: "session_workspace",
            cwd: "/workspace/current",
            workspaceFolders: ["/workspace/ref"],
            sourceSessionPath: "/sessions/agent-a.jsonl",
            createdByAgentId: "agent-a",
          },
          executor: {
            kind: "direct_action",
            action: "notify",
            params: {
              title: "喝水",
              body: "站起来活动一下",
              channels: ["desktop"],
            },
          },
          createdBy: {
            kind: "agent",
            agentId: "agent-a",
            sourceSessionPath: "/sessions/agent-a.jsonl",
          },
        }),
      },
    }]);
    expect(store.addJob).toHaveBeenCalledWith(expect.objectContaining({
      executor: {
        kind: "direct_action",
        action: "notify",
        params: {
          title: "喝水",
          body: "站起来活动一下",
          channels: ["desktop"],
        },
      },
    }));
  });

  it("creates file.create automation job data with a relative path", async () => {
    const store = {
      addJob: vi.fn((jobData) => ({ ...jobData, id: "studio_job_2", enabled: true })),
      listJobs: vi.fn(() => []),
    };
    const confirmStore = {
      create: vi.fn(() => ({
        confirmId: "confirm_2",
        promise: Promise.resolve({ action: "confirmed" }),
      })),
    };
    const tool = createAutomationTool(store, {
      confirmStore,
      emitEvent: vi.fn(),
      getAgentId: () => "agent-a",
      getSessionCwd: () => "/workspace/current",
      getSessionWorkspaceFolders: () => [],
    });

    await tool.execute(
      "call_2",
      {
        action: "add_file_create",
        scheduleType: "cron",
        schedule: "0 18 * * *",
        label: "Daily Note",
        relativePath: "notes/today.md",
        content: "# Today\n",
      },
      undefined,
      undefined,
      { sessionManager: { getSessionFile: () => "/sessions/agent-a.jsonl" } },
    );

    expect(store.addJob).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "",
      label: "Daily Note",
      executor: {
        kind: "direct_action",
        action: "file.create",
        params: {
          relativePath: "notes/today.md",
          content: "# Today\n",
          ifExists: "fail",
        },
      },
    }));
  });
});
